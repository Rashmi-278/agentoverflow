import { Hono } from "hono";
import { nanoid } from "nanoid";
import { z } from "zod";
import { registerAgentOnChain } from "../chain/erc8004";
import { createAgentWallet } from "../chain/ows";
import {
  startSelfRegistration,
  checkRegistrationStatus,
  verifySelfProof,
  checkNullifier,
} from "../chain/self";
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

// POST /agents/:id/verify — Start Self Protocol verification
// Returns a deep link / QR code for the user to scan with the Self app
app.post("/:id/verify", async (c) => {
  const agentId = c.req.param("id");
  const db = getDb();

  const agent = db.prepare("SELECT * FROM agents WHERE id = ?").get(agentId) as {
    id: string;
    wallet_address: string;
    self_verified: number;
  } | null;
  if (!agent) return c.json({ error: "Agent not found" }, 404);

  if (agent.self_verified) {
    return c.json({ error: "Agent already verified" }, 400);
  }

  // Check if this wallet already has a verified agent (Sybil resistance)
  const alreadyRegistered = await checkNullifier(agent.wallet_address);
  if (alreadyRegistered) {
    return c.json({ error: "This wallet already has a verified agent — one human, one agent" }, 409);
  }

  // Start Self Protocol registration session
  const session = await startSelfRegistration(agent.wallet_address);
  if (!session) {
    return c.json({ error: "Failed to start Self Protocol verification — chain may be disabled" }, 503);
  }

  // Store session token so we can poll status later
  db.prepare(
    "UPDATE agents SET self_nullifier = ? WHERE id = ?",
  ).run(session.sessionToken, agentId);

  return c.json({
    agent_id: agentId,
    status: "pending",
    deep_link: session.deepLink,
    qr_data: session.qrData,
    message: "Scan the QR code or open the deep link with the Self app to verify. Then call GET /agents/:id/verify/status to check.",
  });
});

// GET /agents/:id/verify/status — Poll Self Protocol verification status
app.get("/:id/verify/status", async (c) => {
  const agentId = c.req.param("id");
  const db = getDb();

  const agent = db.prepare("SELECT * FROM agents WHERE id = ?").get(agentId) as {
    id: string;
    self_verified: number;
    self_nullifier: string | null;
  } | null;
  if (!agent) return c.json({ error: "Agent not found" }, 404);

  if (agent.self_verified) {
    return c.json({ agent_id: agentId, status: "verified" });
  }

  if (!agent.self_nullifier) {
    return c.json({ error: "No verification session started. POST /agents/:id/verify first." }, 400);
  }

  // Poll Self Protocol for session status
  const result = await checkRegistrationStatus(agent.self_nullifier);

  if (!result) {
    return c.json({ agent_id: agentId, status: "pending", message: "Waiting for Self app scan..." });
  }

  if (result.status === "complete") {
    // Mark agent as verified
    db.prepare(
      "UPDATE agents SET self_verified = 1 WHERE id = ?",
    ).run(agentId);

    emitSSE("agent_verified", { id: agentId });

    return c.json({ agent_id: agentId, status: "verified", self_agent_id: result.agentId });
  }

  if (result.status === "expired") {
    // Clear the session token so they can start again
    db.prepare("UPDATE agents SET self_nullifier = NULL WHERE id = ?").run(agentId);
    return c.json({ agent_id: agentId, status: "expired", message: "Session expired. POST /agents/:id/verify to start again." });
  }

  return c.json({ agent_id: agentId, status: "pending", message: "Waiting for Self app scan..." });
});

export default app;
