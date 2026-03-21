import { Hono } from "hono";
import { nanoid } from "nanoid";
import { z } from "zod";
import { postReputationFeedback } from "../chain/erc8004";
import { releaseEscrowToAnswerer } from "../chain/escrow";
import { getDb } from "../db";
import { emitSSE } from "../sse";
import type { AnswerRow, QuestionRow } from "../types";

const app = new Hono();

const createAnswerSchema = z.object({
  agent_id: z.string().min(1),
  body: z.string().min(1).max(5000),
});

const scoreAnswerSchema = z.object({
  agent_id: z.string().min(1),
  score: z.number().int().min(1).max(10),
  comment: z.string().max(500).optional(),
});

// POST /questions/:id/answers
app.post("/questions/:id/answers", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: "Invalid JSON" }, 400);

  const parsed = createAnswerSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
  }

  const questionId = c.req.param("id");
  const db = getDb();

  const question = db
    .prepare("SELECT * FROM questions WHERE id = ?")
    .get(questionId) as QuestionRow | null;
  if (!question) return c.json({ error: "Question not found" }, 404);

  // No self-answer
  if (question.agent_id === parsed.data.agent_id) {
    return c.json({ error: "Cannot answer your own question" }, 400);
  }

  const agent = db
    .prepare("SELECT id FROM agents WHERE id = ?")
    .get(parsed.data.agent_id);
  if (!agent) return c.json({ error: "Agent not found" }, 404);

  const id = `ans_${nanoid(8)}`;

  let activityId: number | undefined;
  db.transaction(() => {
    db.prepare(
      "INSERT INTO answers (id, question_id, agent_id, body) VALUES (?, ?, ?, ?)",
    ).run(id, questionId, parsed.data.agent_id, parsed.data.body);

    const result = db.prepare(
      "INSERT INTO activity (type, agent_id, entity_id, meta) VALUES (?, ?, ?, ?)",
    ).run(
      "answer_posted",
      parsed.data.agent_id,
      id,
      `question_id: ${questionId}`,
    );
    activityId = Number(result.lastInsertRowid);
  })();

  emitSSE("answer_posted", {
    id,
    question_id: questionId,
    agent_id: parsed.data.agent_id,
  }, activityId);

  return c.json({ id, question_id: questionId }, 201);
});

// GET /questions/:id/answers
app.get("/questions/:id/answers", (c) => {
  const db = getDb();
  const questionId = c.req.param("id");
  const answers = db
    .prepare(
      "SELECT * FROM answers WHERE question_id = ? ORDER BY accepted DESC, score DESC, created_at ASC",
    )
    .all(questionId);
  return c.json(answers);
});

// POST /answers/:id/score
app.post("/answers/:id/score", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: "Invalid JSON" }, 400);

  const parsed = scoreAnswerSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
  }

  const answerId = c.req.param("id");
  const db = getDb();

  const answer = db
    .prepare("SELECT * FROM answers WHERE id = ?")
    .get(answerId) as AnswerRow | null;
  if (!answer) return c.json({ error: "Answer not found" }, 404);

  // Only question owner can score
  const question = db
    .prepare("SELECT * FROM questions WHERE id = ?")
    .get(answer.question_id) as QuestionRow | null;
  if (!question) return c.json({ error: "Question not found" }, 404);
  if (question.agent_id !== parsed.data.agent_id) {
    return c.json({ error: "Only question owner can score answers" }, 403);
  }

  // Can only score once
  if (answer.score !== null) {
    return c.json({ error: "Answer already scored" }, 400);
  }

  const score = parsed.data.score;
  const accepted = score >= 5;

  // Get question tags for reputation
  const tags = db
    .prepare("SELECT tag_id FROM question_tags WHERE question_id = ?")
    .all(answer.question_id) as { tag_id: string }[];

  db.transaction(() => {
    // Update answer
    db.prepare("UPDATE answers SET score = ?, accepted = ? WHERE id = ?").run(
      score,
      accepted ? 1 : 0,
      answerId,
    );

    if (accepted) {
      // Update question status
      db.prepare("UPDATE questions SET status = 'resolved' WHERE id = ?").run(
        answer.question_id,
      );

      // Update reputation for each tag
      const points = score * 10 + 50; // 60-150 for accepted
      for (const tag of tags) {
        db.prepare(
          `INSERT INTO reputation (agent_id, tag_id, score, answer_count, accept_count)
           VALUES (?, ?, ?, 1, 1)
           ON CONFLICT(agent_id, tag_id)
           DO UPDATE SET score = score + ?, answer_count = answer_count + 1, accept_count = accept_count + 1`,
        ).run(answer.agent_id, tag.tag_id, points, points);
      }

      // Activity
      db.prepare(
        "INSERT INTO activity (type, agent_id, entity_id, meta) VALUES (?, ?, ?, ?)",
      ).run(
        "answer_accepted",
        answer.agent_id,
        answerId,
        `score: ${score}\npoints: ${score * 10 + 50}`,
      );

      db.prepare(
        "INSERT INTO activity (type, agent_id, entity_id, meta) VALUES (?, ?, ?, ?)",
      ).run(
        "reputation_earned",
        answer.agent_id,
        answerId,
        `points: ${score * 10 + 50}`,
      );
    } else {
      // Track answer_count for rejected answers too (honest acceptance_rate)
      for (const tag of tags) {
        db.prepare(
          `INSERT INTO reputation (agent_id, tag_id, score, answer_count, accept_count)
           VALUES (?, ?, 0, 1, 0)
           ON CONFLICT(agent_id, tag_id)
           DO UPDATE SET answer_count = answer_count + 1`,
        ).run(answer.agent_id, tag.tag_id);
      }

      db.prepare(
        "INSERT INTO activity (type, agent_id, entity_id, meta) VALUES (?, ?, ?, ?)",
      ).run("answer_scored", answer.agent_id, answerId, `score: ${score}`);
    }
  })();

  // Chain calls (non-blocking, graceful degradation)
  if (accepted) {
    releaseEscrowToAnswerer(question.escrow_uid, answer.agent_id).catch(
      () => {},
    );
    postReputationFeedback(answer.agent_id, score).catch(() => {});
  }

  emitSSE("answer_scored", {
    answer_id: answerId,
    score,
    accepted,
    question_id: answer.question_id,
  });

  return c.json({ answer_id: answerId, score, accepted });
});

export default app;
