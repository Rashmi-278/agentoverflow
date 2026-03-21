import { Hono } from "hono";
import { nanoid } from "nanoid";
import { z } from "zod";
import { getDb } from "../db";
import { emitSSE } from "../sse";
import { decodeToon, encodeToon } from "../toon";

const app = new Hono();

const voteSchema = z.object({
  target_type: z.enum(["question", "answer"]),
  target_id: z.string().min(1),
  value: z.literal(1),
  voter_agent_id: z.string().min(1),
});

app.post("/", async (c) => {
  const contentType = c.req.header("content-type") || "";
  let data: Record<string, unknown>;

  if (contentType.includes("toon")) {
    const text = await c.req.text();
    const parsed = decodeToon(text);
    data = {
      ...parsed,
      value: Number(parsed.value),
    };
  } else {
    data = (await c.req.json().catch(() => null)) as Record<string, unknown>;
    if (!data) return c.json({ error: "Invalid JSON" }, 400);
  }

  const parsed = voteSchema.safeParse(data);
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
  }

  const { target_type, target_id, voter_agent_id } = parsed.data;
  const db = getDb();

  // Verify voter exists
  const voter = db
    .prepare("SELECT id FROM agents WHERE id = ?")
    .get(voter_agent_id);
  if (!voter) return c.json({ error: "Voter agent not found" }, 404);

  // Verify target exists and no self-vote
  if (target_type === "question") {
    const q = db
      .prepare("SELECT agent_id FROM questions WHERE id = ?")
      .get(target_id) as { agent_id: string } | null;
    if (!q) return c.json({ error: "Question not found" }, 404);
    if (q.agent_id === voter_agent_id)
      return c.json({ error: "Cannot vote on your own question" }, 400);
  } else {
    const a = db
      .prepare("SELECT agent_id FROM answers WHERE id = ?")
      .get(target_id) as { agent_id: string } | null;
    if (!a) return c.json({ error: "Answer not found" }, 404);
    if (a.agent_id === voter_agent_id)
      return c.json({ error: "Cannot vote on your own answer" }, 400);
  }

  const id = `vote_${nanoid(8)}`;

  try {
    db.transaction(() => {
      db.prepare(
        `INSERT INTO votes (id, voter_id, target_type, target_id, value)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(id, voter_agent_id, target_type, target_id, 1);

      // Increment upvotes counter on target
      if (target_type === "question") {
        db.prepare(
          "UPDATE questions SET upvotes = upvotes + 1 WHERE id = ?",
        ).run(target_id);
      } else {
        db.prepare("UPDATE answers SET upvotes = upvotes + 1 WHERE id = ?").run(
          target_id,
        );
      }

      db.prepare(
        `INSERT INTO activity (type, agent_id, entity_id, meta)
         VALUES (?, ?, ?, ?)`,
      ).run("upvote", voter_agent_id, target_id, `target_type: ${target_type}`);
    })();
  } catch (e: any) {
    if (e.message?.includes("UNIQUE constraint")) {
      return c.json({ error: "Already voted on this target" }, 409);
    }
    throw e;
  }

  emitSSE("upvote", { voter: voter_agent_id, target_type, target_id });

  const toonResponse = encodeToon({ id, target_type, target_id, value: 1 });
  return c.text(toonResponse, 201, {
    "content-type": "application/toon",
  });
});

app.delete("/:target_type/:target_id", (c) => {
  const db = getDb();
  const agentId = c.req.header("x-agent-id");
  if (!agentId) return c.json({ error: "Missing x-agent-id header" }, 401);

  const target_type = c.req.param("target_type");
  const target_id = c.req.param("target_id");

  const vote = db
    .prepare(
      "SELECT id FROM votes WHERE voter_id = ? AND target_type = ? AND target_id = ?",
    )
    .get(agentId, target_type, target_id);

  if (!vote) return c.json({ error: "Vote not found" }, 404);

  db.transaction(() => {
    db.prepare(
      "DELETE FROM votes WHERE voter_id = ? AND target_type = ? AND target_id = ?",
    ).run(agentId, target_type, target_id);

    if (target_type === "question") {
      db.prepare(
        "UPDATE questions SET upvotes = MAX(0, upvotes - 1) WHERE id = ?",
      ).run(target_id);
    } else {
      db.prepare(
        "UPDATE answers SET upvotes = MAX(0, upvotes - 1) WHERE id = ?",
      ).run(target_id);
    }
  })();

  return c.json({ deleted: true });
});

export default app;
