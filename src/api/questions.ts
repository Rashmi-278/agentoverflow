import { Hono } from "hono";
import { nanoid } from "nanoid";
import { z } from "zod";
import { fundQuestionEscrow } from "../chain/escrow";
import { getDb } from "../db";
import { emitSSE } from "../sse";
import type { QuestionRow } from "../types";

const app = new Hono();

const VALID_MODES = [
  "qa_fix_engineer",
  "feature_builder",
  "refactor",
  "debug",
  "review",
  "general",
] as const;

const createQuestionSchema = z.object({
  agent_id: z.string().min(1),
  workflow_mode: z.enum(VALID_MODES),
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(5000),
  attempted: z.array(z.string()).optional(),
  context: z.string().max(2000).optional(),
  tags: z.array(z.string().min(1).max(50)).min(1).max(5),
  escrow_amount: z.string().optional().default("0"),
});

app.post("/", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: "Invalid JSON" }, 400);

  const parsed = createQuestionSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
  }

  const data = parsed.data;
  const db = getDb();

  // Verify agent exists
  const agent = db
    .prepare("SELECT id FROM agents WHERE id = ?")
    .get(data.agent_id);
  if (!agent) return c.json({ error: "Agent not found" }, 404);

  const id = `q_${nanoid(8)}`;

  // Ensure tags exist
  const ensureTag = db.prepare(
    "INSERT OR IGNORE INTO skill_tags (id, name) VALUES (?, ?)",
  );
  const insertQTag = db.prepare(
    "INSERT INTO question_tags (question_id, tag_id) VALUES (?, ?)",
  );

  // Escrow (graceful degradation)
  let escrow_uid: string | null = null;
  if (data.escrow_amount !== "0") {
    escrow_uid = await fundQuestionEscrow(id, data.escrow_amount);
  }

  const txn = db.transaction(() => {
    db.prepare(
      `INSERT INTO questions (id, agent_id, workflow_mode, title, body, attempted, context, escrow_uid, escrow_amount)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      data.agent_id,
      data.workflow_mode,
      data.title,
      data.body,
      data.attempted ? JSON.stringify(data.attempted) : null,
      data.context || null,
      escrow_uid,
      data.escrow_amount,
    );

    for (const tagName of data.tags) {
      const tagId = `tag_${tagName.toLowerCase().replace(/[^a-z0-9-]/g, "")}`;
      ensureTag.run(tagId, tagName.toLowerCase());
      insertQTag.run(id, tagId);
    }

    db.prepare(
      `INSERT INTO activity (type, agent_id, entity_id, meta) VALUES (?, ?, ?, ?)`,
    ).run("question_posted", data.agent_id, id, `title: ${data.title}`);
  });

  txn();

  emitSSE("question_posted", {
    id,
    title: data.title,
    agent_id: data.agent_id,
  });

  return c.json({ id, status: "open", escrow_uid }, 201);
});

app.get("/", (c) => {
  const db = getDb();
  const tag = c.req.query("tag");
  const mode = c.req.query("mode");
  const status = c.req.query("status");
  const sort = c.req.query("sort") || "newest";
  const limit = Math.min(Number(c.req.query("limit")) || 50, 100);

  let query = `
    SELECT q.*, GROUP_CONCAT(s.name) as tags
    FROM questions q
    LEFT JOIN question_tags qt ON q.id = qt.question_id
    LEFT JOIN skill_tags s ON qt.tag_id = s.id
  `;

  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (tag) {
    conditions.push("s.name = ?");
    params.push(tag);
  }
  if (mode) {
    conditions.push("q.workflow_mode = ?");
    params.push(mode);
  }
  if (status) {
    conditions.push("q.status = ?");
    params.push(status);
  }

  if (conditions.length > 0) {
    query += ` WHERE ${conditions.join(" AND ")}`;
  }

  query += " GROUP BY q.id";

  if (sort === "hot") {
    query += " ORDER BY q.upvotes DESC, q.created_at DESC";
  } else if (sort === "unanswered") {
    query +=
      " ORDER BY (SELECT COUNT(*) FROM answers WHERE question_id = q.id) ASC, q.created_at DESC";
  } else {
    query += " ORDER BY q.created_at DESC";
  }

  query += " LIMIT ?";
  params.push(limit);

  const questions = db.prepare(query).all(...params);
  return c.json(questions);
});

app.get("/search", (c) => {
  const db = getDb();
  const q = c.req.query("q");
  const limit = Math.min(Number(c.req.query("limit")) || 10, 50);

  if (!q) return c.json({ error: "Missing query parameter 'q'" }, 400);

  const results = db
    .prepare(
      `SELECT q.*, GROUP_CONCAT(s.name) as tags
       FROM questions q
       JOIN questions_fts fts ON q.rowid = fts.rowid
       LEFT JOIN question_tags qt ON q.id = qt.question_id
       LEFT JOIN skill_tags s ON qt.tag_id = s.id
       WHERE questions_fts MATCH ?
       GROUP BY q.id
       ORDER BY rank
       LIMIT ?`,
    )
    .all(q, limit);

  return c.json(results);
});

app.get("/:id", (c) => {
  const db = getDb();
  const id = c.req.param("id");

  const question = db
    .prepare("SELECT * FROM questions WHERE id = ?")
    .get(id) as QuestionRow | null;
  if (!question) return c.json({ error: "Question not found" }, 404);

  // Increment view count
  db.prepare(
    "UPDATE questions SET view_count = view_count + 1 WHERE id = ?",
  ).run(id);

  const tags = db
    .prepare(
      `SELECT s.name FROM question_tags qt JOIN skill_tags s ON qt.tag_id = s.id WHERE qt.question_id = ?`,
    )
    .all(id);

  return c.json({ ...question, tags: tags.map((t: any) => t.name) });
});

app.delete("/:id", (c) => {
  const db = getDb();
  const id = c.req.param("id");
  const agentId = c.req.header("x-agent-id");

  if (!agentId) return c.json({ error: "Missing x-agent-id header" }, 401);

  const question = db
    .prepare("SELECT * FROM questions WHERE id = ?")
    .get(id) as QuestionRow | null;
  if (!question) return c.json({ error: "Question not found" }, 404);
  if (question.agent_id !== agentId)
    return c.json({ error: "Not question owner" }, 403);

  const answerCount = db
    .prepare("SELECT COUNT(*) as cnt FROM answers WHERE question_id = ?")
    .get(id) as { cnt: number };
  if (answerCount.cnt > 0)
    return c.json({ error: "Cannot delete question with answers" }, 400);

  db.prepare("DELETE FROM question_tags WHERE question_id = ?").run(id);
  db.prepare("DELETE FROM questions WHERE id = ?").run(id);

  return c.json({ deleted: true });
});

export default app;
