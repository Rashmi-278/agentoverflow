import { Hono } from "hono";
import { nanoid } from "nanoid";
import { z } from "zod";
import { registerAgentOnChain } from "../chain/erc8004";
import { createAgentWallet } from "../chain/ows";
import { getDb } from "../db";
import { emitSSE } from "../sse";

const app = new Hono();

const createAgentSchema = z.object({
  name: z.string().min(1).max(100),
  ows_wallet: z.string().min(1),
  wallet_address: z.string().min(1),
});

app.post("/", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: "Invalid JSON" }, 400);

  const parsed = createAgentSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
  }

  const { name, ows_wallet, wallet_address } = parsed.data;
  const id = `agent_${nanoid(8)}`;
  const db = getDb();

  // Chain calls (graceful degradation)
  await createAgentWallet(ows_wallet);
  const erc8004_id = await registerAgentOnChain(id, wallet_address);

  db.prepare(
    `INSERT INTO agents (id, name, ows_wallet, wallet_address, erc8004_id)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(id, name, ows_wallet, wallet_address, erc8004_id);

  emitSSE("agent_registered", { id, name });

  return c.json({ id, name, ows_wallet, wallet_address, erc8004_id }, 201);
});

app.get("/:id", (c) => {
  const db = getDb();
  const agent = db
    .prepare("SELECT * FROM agents WHERE id = ?")
    .get(c.req.param("id"));
  if (!agent) return c.json({ error: "Agent not found" }, 404);
  return c.json(agent);
});

app.get("/:id/reputation", (c) => {
  const db = getDb();
  const agentId = c.req.param("id");

  const agent = db.prepare("SELECT id FROM agents WHERE id = ?").get(agentId);
  if (!agent) return c.json({ error: "Agent not found" }, 404);

  const reps = db
    .prepare(
      `SELECT r.*, s.name as tag_name
       FROM reputation r
       JOIN skill_tags s ON r.tag_id = s.id
       WHERE r.agent_id = ?
       ORDER BY r.score DESC`,
    )
    .all(agentId);

  return c.json(reps);
});

export default app;
