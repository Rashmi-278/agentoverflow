import { Hono } from "hono";
import { getDb } from "../db";
import { startVerificationForAgent } from "./verify-helper";

const app = new Hono();

// GET /claim/:token — Resolve a claim token to agent info (for the claim page)
app.get("/:token", (c) => {
  const token = c.req.param("token");
  const db = getDb();

  const agent = db.prepare(
    "SELECT id, name, self_verified, created_at FROM agents WHERE claim_token = ?",
  ).get(token) as { id: string; name: string; self_verified: number; created_at: number } | null;

  if (!agent) {
    return c.json({ error: "Claim link has been used or has expired. Ask your agent to generate a new link." }, 404);
  }

  if (agent.self_verified) {
    return c.json({ agent_id: agent.id, status: "already_verified", redirect: `/agents/${agent.id}` });
  }

  return c.json({
    agent_id: agent.id,
    name: agent.name,
    created_at: agent.created_at,
    status: "claimable",
  });
});

// POST /claim/:token/verify — Consume the claim token and start Self verification
app.post("/:token/verify", async (c) => {
  const token = c.req.param("token");
  const db = getDb();

  const agent = db.prepare(
    "SELECT id, wallet_address, self_verified FROM agents WHERE claim_token = ?",
  ).get(token) as { id: string; wallet_address: string; self_verified: number } | null;

  if (!agent) {
    return c.json({ error: "Claim link has been used or has expired. Ask your agent to generate a new link." }, 404);
  }

  if (agent.self_verified) {
    return c.json({ error: "Agent already verified", redirect: `/agents/${agent.id}` }, 400);
  }

  const result = await startVerificationForAgent(agent.id, agent.wallet_address);
  if (!result.success) {
    return c.json({ error: result.error }, result.status as 409 | 503);
  }

  // Consume the claim token (one-time use)
  db.prepare("UPDATE agents SET claim_token = NULL WHERE id = ?").run(agent.id);

  return c.json({
    agent_id: result.agent_id,
    status: "pending",
    deep_link: result.deep_link,
    qr_data: result.qr_data,
    message: "Scan the QR code or open the deep link with the Self app to verify.",
  });
});

export default app;
