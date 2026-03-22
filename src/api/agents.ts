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

const FRONTEND_URL = process.env.FRONTEND_URL || process.env.NETLIFY_URL || "http://localhost:3001";

function generateClaimToken(): string {
  return `claim_${nanoid(24)}`;
}

const createAgentSchema = z.object({
  name: z.string().min(1).max(100),
  ows_wallet: z.string().min(1),
  wallet_address: z.string().min(1),
});

// List all agents (never expose claim_token)
app.get("/", (c) => {
  const db = getDb();
  const agents = db.prepare("SELECT id, name, wallet_address, self_verified, created_at FROM agents ORDER BY created_at DESC").all();
  return c.json(agents);
});

app.post("/", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: "Invalid JSON" }, 400);

  const parsed = createAgentSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten().fieldErrors }, 400);
  }

  const { name, ows_wallet, wallet_address } = parsed.data;
  const db = getDb();

  // Idempotent: if agent with this name already exists, return it
  const existing = db
    .prepare("SELECT * FROM agents WHERE name = ?")
    .get(name) as Record<string, unknown> | null;
  if (existing) {
    const claimUrl = existing.claim_token
      ? `${FRONTEND_URL.replace(/\/$/, "")}/claim/${existing.claim_token}`
      : null;
    return c.json({ ...existing, claim_url: claimUrl }, 200);
  }

  const id = `agent_${nanoid(8)}`;
  const claim_token = generateClaimToken();

  // Chain calls (graceful degradation)
  await createAgentWallet(ows_wallet);
  const erc8004_id = await registerAgentOnChain(id, wallet_address);

  db.prepare(
    `INSERT INTO agents (id, name, ows_wallet, wallet_address, erc8004_id, claim_token)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, name, ows_wallet, wallet_address, erc8004_id, claim_token);

  emitSSE("agent_registered", { id, name });

  const claim_url = `${FRONTEND_URL.replace(/\/$/, "")}/claim/${claim_token}`;
  return c.json({ id, name, ows_wallet, wallet_address, erc8004_id, claim_url }, 201);
});

app.get("/:id", (c) => {
  const db = getDb();
  const agent = db
    .prepare("SELECT id, name, ows_wallet, wallet_address, erc8004_id, self_verified, created_at FROM agents WHERE id = ?")
    .get(c.req.param("id"));
  if (!agent) return c.json({ error: "Agent not found" }, 404);
  return c.json(agent);
});

// GET /agents/claim/:token — Resolve a claim token to agent info (for the claim page)
app.get("/claim/:token", (c) => {
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

// POST /agents/claim/:token/verify — Consume the claim token and start Self verification
app.post("/claim/:token/verify", async (c) => {
  const token = c.req.param("token");
  const db = getDb();

  const agent = db.prepare(
    "SELECT id, wallet_address, self_verified, claim_token FROM agents WHERE claim_token = ?",
  ).get(token) as { id: string; wallet_address: string; self_verified: number; claim_token: string } | null;

  if (!agent) {
    return c.json({ error: "Claim link has been used or has expired. Ask your agent to generate a new link." }, 404);
  }

  if (agent.self_verified) {
    return c.json({ error: "Agent already verified", redirect: `/agents/${agent.id}` }, 400);
  }

  // Check Sybil resistance
  const alreadyRegistered = await checkNullifier(agent.wallet_address);
  if (alreadyRegistered) {
    return c.json({ error: "This wallet already has a verified agent — one human, one agent" }, 409);
  }

  // Start Self Protocol registration session
  const session = await startSelfRegistration(agent.wallet_address);
  if (!session) {
    return c.json({ error: "Failed to start Self Protocol verification — chain may be disabled" }, 503);
  }

  // Consume the claim token (one-time use) and store session token
  db.prepare(
    "UPDATE agents SET claim_token = NULL, self_nullifier = ? WHERE id = ?",
  ).run(session.sessionToken, agent.id);

  return c.json({
    agent_id: agent.id,
    status: "pending",
    deep_link: session.deepLink,
    qr_data: session.qrData,
    message: "Scan the QR code or open the deep link with the Self app to verify.",
  });
});

// POST /agents/:id/claim/regenerate — Generate a new claim token (for retry after consumed/expired)
app.post("/:id/claim/regenerate", (c) => {
  const agentId = c.req.param("id");
  const db = getDb();

  const agent = db.prepare(
    "SELECT id, self_verified, claim_token FROM agents WHERE id = ?",
  ).get(agentId) as { id: string; self_verified: number; claim_token: string | null } | null;

  if (!agent) return c.json({ error: "Agent not found" }, 404);

  if (agent.self_verified) {
    return c.json({ error: "Agent already verified — no claim link needed" }, 400);
  }

  const newToken = generateClaimToken();
  db.prepare("UPDATE agents SET claim_token = ? WHERE id = ?").run(newToken, agentId);

  const claim_url = `${FRONTEND_URL.replace(/\/$/, "")}/claim/${newToken}`;
  return c.json({ agent_id: agentId, claim_url, claim_token: newToken });
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
