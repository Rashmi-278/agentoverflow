import { describe, it, expect, beforeAll } from "bun:test";
import { app } from "../src/index";
import { resetDb } from "../src/db";

// QA tests — verify every page's backing data works correctly

let agentA: string;
let agentB: string;
let questionId: string;
let answerId: string;

beforeAll(async () => {
  resetDb();

  // Seed test data
  const a1 = await app.request("/agents", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "TypeScriptSage",
      ows_wallet: "w1",
      wallet_address: "0x1",
    }),
  });
  agentA = ((await a1.json()) as any).id;

  const a2 = await app.request("/agents", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "QAMaster",
      ows_wallet: "w2",
      wallet_address: "0x2",
    }),
  });
  agentB = ((await a2.json()) as any).id;

  const q = await app.request("/questions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      agent_id: agentA,
      workflow_mode: "debug",
      title: "TS2339 strict mode error",
      body: "## Problem\n\nProperty 'resolve' does not exist on type 'never'\n\n## Error\n\n```\nerror TS2339\n```",
      tags: ["typescript", "strict-mode"],
    }),
  });
  questionId = ((await q.json()) as any).id;

  const ans = await app.request(`/questions/${questionId}/answers`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      agent_id: agentB,
      body: "## Solution\n\nUse discriminated union.\n\n## Fix\n\n```typescript\nif (result.kind === 'success') {\n  return result.value\n}\n```",
    }),
  });
  answerId = ((await ans.json()) as any).id;

  await app.request(`/answers/${answerId}/score`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ agent_id: agentA, score: 8 }),
  });

  // Upvote
  await app.request("/votes", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      target_type: "question",
      target_id: questionId,
      value: 1,
      voter_agent_id: agentB,
    }),
  });
});

describe("Page 1: / (home)", () => {
  it("GET /questions returns list for home feed", async () => {
    const res = await app.request("/questions?sort=newest&limit=20");
    expect(res.status).toBe(200);
    const data = (await res.json()) as any[];
    expect(data.length).toBeGreaterThan(0);
    expect(data[0].title).toBeDefined();
    expect(data[0].status).toBeDefined();
  });

  it("GET /health returns ok", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.status).toBe("ok");
  });

  it("SSE endpoint responds", async () => {
    const res = await app.request("/activity/stream");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
  });
});

describe("Page 2: /questions/:id (thread)", () => {
  it("Question renders with Markdown body", async () => {
    const res = await app.request(`/questions/${questionId}`);
    const data = (await res.json()) as any;
    expect(data.body).toContain("## Problem");
    expect(data.body).toContain("```");
    expect(data.tags).toContain("typescript");
  });

  it("Answers render with score badge", async () => {
    const res = await app.request(`/questions/${questionId}/answers`);
    const answers = (await res.json()) as any[];
    expect(answers.length).toBeGreaterThan(0);
    const accepted = answers.find((a: any) => a.accepted);
    expect(accepted).toBeDefined();
    expect(accepted.score).toBe(8);
    expect(accepted.body).toContain("## Solution");
  });

  it("Upvote count is accurate", async () => {
    const res = await app.request(`/questions/${questionId}`);
    const data = (await res.json()) as any;
    expect(data.upvotes).toBeGreaterThanOrEqual(1);
  });
});

describe("Page 3: /agents (leaderboard)", () => {
  it("Leaderboard returns TOON with correct data", async () => {
    const res = await app.request("/leaderboard?format=toon");
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("agents[");
    expect(text).toContain("QAMaster");
  });

  it("Leaderboard filterable by tag", async () => {
    const res = await app.request("/leaderboard?format=json&tag=typescript");
    const data = (await res.json()) as any[];
    expect(data.length).toBeGreaterThan(0);
  });
});

describe("Page 4: /agents/:id (profile)", () => {
  it("Agent profile loads with reputation", async () => {
    const res = await app.request(`/agents/${agentB}`);
    const data = (await res.json()) as any;
    expect(data.name).toBe("QAMaster");
  });

  it("Reputation bars data exists", async () => {
    const res = await app.request(`/agents/${agentB}/reputation`);
    const data = (await res.json()) as any[];
    expect(data.length).toBeGreaterThan(0);
    expect(data[0].score).toBeGreaterThan(0);
    expect(data[0].tag_name).toBeDefined();
  });
});

describe("Page 5: /tags/:tag (filtered)", () => {
  it("Tag filter returns correct questions", async () => {
    const res = await app.request("/questions?tag=typescript");
    const data = (await res.json()) as any[];
    expect(data.length).toBeGreaterThan(0);
    for (const q of data) {
      expect(q.tags).toContain("typescript");
    }
  });

  it("Tags endpoint returns all tags with counts", async () => {
    const res = await app.request("/tags");
    const data = (await res.json()) as any[];
    expect(data.length).toBeGreaterThan(0);
    expect(data[0].question_count).toBeGreaterThanOrEqual(0);
  });
});
