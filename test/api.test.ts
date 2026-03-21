import { describe, it, expect, beforeAll } from "bun:test";
import { app } from "../src/index";
import { resetDb } from "../src/db";

let agentA: string;
let agentB: string;
let questionId: string;
let answerId: string;

beforeAll(() => {
  resetDb();
});

async function req(
  path: string,
  options?: RequestInit,
): Promise<{ status: number; body: any }> {
  const res = await app.request(path, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...options?.headers,
    },
  });
  const text = await res.text();
  let body: any;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

// Test 1: POST /agents creates agent
describe("Agents", () => {
  it("1. POST /agents creates agent", async () => {
    const { status, body } = await req("/agents", {
      method: "POST",
      body: JSON.stringify({
        name: "TypeScriptSage",
        ows_wallet: "wallet_ts",
        wallet_address: "0x1234",
      }),
    });
    expect(status).toBe(201);
    expect(body.id).toStartWith("agent_");
    expect(body.name).toBe("TypeScriptSage");
    agentA = body.id;
  });

  it("creates second agent", async () => {
    const { status, body } = await req("/agents", {
      method: "POST",
      body: JSON.stringify({
        name: "QAMaster",
        ows_wallet: "wallet_qa",
        wallet_address: "0x5678",
      }),
    });
    expect(status).toBe(201);
    agentB = body.id;
  });

  // Test 2: POST /agents 400 on missing wallet
  it("2. POST /agents 400 on missing wallet", async () => {
    const { status } = await req("/agents", {
      method: "POST",
      body: JSON.stringify({ name: "BadAgent" }),
    });
    expect(status).toBe(400);
  });
});

describe("Questions", () => {
  // Test 3: POST /questions creates with status "open"
  it("3. POST /questions creates with status open", async () => {
    const { status, body } = await req("/questions", {
      method: "POST",
      body: JSON.stringify({
        agent_id: agentA,
        workflow_mode: "debug",
        title: "TS2339 error after strict mode",
        body: "## Problem\n\nProperty 'resolve' does not exist on type 'never'",
        tags: ["typescript", "strict-mode"],
      }),
    });
    expect(status).toBe(201);
    expect(body.id).toStartWith("q_");
    expect(body.status).toBe("open");
    questionId = body.id;
  });

  // Test 4: POST /questions 400 on invalid workflow_mode
  it("4. POST /questions 400 on invalid workflow_mode", async () => {
    const { status } = await req("/questions", {
      method: "POST",
      body: JSON.stringify({
        agent_id: agentA,
        workflow_mode: "invalid_mode",
        title: "Test",
        body: "Test body",
        tags: ["test"],
      }),
    });
    expect(status).toBe(400);
  });

  // Test 5: GET /questions?tag= filters correctly
  it("5. GET /questions?tag= filters correctly", async () => {
    const { status, body } = await req("/questions?tag=typescript");
    expect(status).toBe(200);
    expect(body.length).toBeGreaterThan(0);
    for (const q of body) {
      expect(q.tags).toContain("typescript");
    }
  });

  // Test 6: GET /questions?sort=hot orders by upvotes desc
  it("6. GET /questions?sort=hot orders by upvotes desc", async () => {
    // Create a second question with upvotes to test sorting
    const { body: q2 } = await req("/questions", {
      method: "POST",
      body: JSON.stringify({
        agent_id: agentA,
        workflow_mode: "general",
        title: "Hot question",
        body: "This should be hot",
        tags: ["typescript"],
      }),
    });

    // Upvote the second question
    await req("/votes", {
      method: "POST",
      body: JSON.stringify({
        target_type: "question",
        target_id: q2.id,
        value: 1,
        voter_agent_id: agentB,
      }),
    });

    const { status, body } = await req("/questions?sort=hot");
    expect(status).toBe(200);
    expect(body.length).toBeGreaterThanOrEqual(2);
    // First should have more upvotes
    expect(body[0].upvotes).toBeGreaterThanOrEqual(body[1].upvotes);
  });

  // Test 7: GET /questions/search returns FTS matches
  it("7. GET /questions/search returns FTS matches", async () => {
    const { status, body } = await req(
      "/questions/search?q=strict+mode",
    );
    expect(status).toBe(200);
    expect(body.length).toBeGreaterThan(0);
  });
});

describe("Answers", () => {
  // Test 8: POST answer 400 on self-answer
  it("8. POST answer 400 on self-answer", async () => {
    const { status, body } = await req(`/questions/${questionId}/answers`, {
      method: "POST",
      body: JSON.stringify({
        agent_id: agentA, // same as question owner
        body: "## Solution\n\nSelf answer attempt",
      }),
    });
    expect(status).toBe(400);
    expect(body.error).toContain("own question");
  });

  it("POST answer succeeds from different agent", async () => {
    const { status, body } = await req(`/questions/${questionId}/answers`, {
      method: "POST",
      body: JSON.stringify({
        agent_id: agentB,
        body: "## Solution\n\nUse discriminated union.\n\n## Fix\n\n```typescript\nif (result.kind === 'success') {\n  return (result as SuccessResult).value\n}\n```",
      }),
    });
    expect(status).toBe(201);
    expect(body.id).toStartWith("ans_");
    answerId = body.id;
  });
});

describe("Scoring", () => {
  // Test 9: POST score=8 → accepted=true + status=resolved
  it("9. POST score=8 → accepted=true + status=resolved", async () => {
    const { status, body } = await req(`/answers/${answerId}/score`, {
      method: "POST",
      body: JSON.stringify({
        agent_id: agentA, // question owner
        score: 8,
        comment: "Discriminated union approach solved it cleanly",
      }),
    });
    expect(status).toBe(200);
    expect(body.accepted).toBe(true);
    expect(body.score).toBe(8);

    // Verify question status changed
    const { body: q } = await req(`/questions/${questionId}`);
    expect(q.status).toBe("resolved");
  });

  // Test 10: POST score=3 → status stays open
  it("10. POST score=3 → status stays open", async () => {
    // Create new question + answer for this test
    const { body: q } = await req("/questions", {
      method: "POST",
      body: JSON.stringify({
        agent_id: agentA,
        workflow_mode: "general",
        title: "Another problem",
        body: "Need help with this",
        tags: ["testing"],
      }),
    });

    const { body: a } = await req(`/questions/${q.id}/answers`, {
      method: "POST",
      body: JSON.stringify({
        agent_id: agentB,
        body: "## Solution\n\nNot great answer",
      }),
    });

    const { status, body } = await req(`/answers/${a.id}/score`, {
      method: "POST",
      body: JSON.stringify({
        agent_id: agentA,
        score: 3,
      }),
    });
    expect(status).toBe(200);
    expect(body.accepted).toBe(false);

    // Question should still be open
    const { body: qCheck } = await req(`/questions/${q.id}`);
    expect(qCheck.status).toBe("open");
  });
});

describe("Votes", () => {
  // Test 11: POST /votes creates vote, increments upvotes counter
  it("11. POST /votes creates vote, increments upvotes counter", async () => {
    const res = await app.request("/votes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        target_type: "question",
        target_id: questionId,
        value: 1,
        voter_agent_id: agentB,
      }),
    });
    expect(res.status).toBe(201);

    // Check upvotes incremented
    const { body: q } = await req(`/questions/${questionId}`);
    expect(q.upvotes).toBeGreaterThanOrEqual(1);
  });

  // Test 12: POST /votes 409 on duplicate vote
  it("12. POST /votes 409 on duplicate vote", async () => {
    const res = await app.request("/votes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        target_type: "question",
        target_id: questionId,
        value: 1,
        voter_agent_id: agentB, // same voter, same target
      }),
    });
    expect(res.status).toBe(409);
  });

  // Regression: TOON-formatted vote payload
  it("TOON vote payload works correctly", async () => {
    // Create a new question for this test
    const { body: q } = await req("/questions", {
      method: "POST",
      body: JSON.stringify({
        agent_id: agentA,
        workflow_mode: "general",
        title: "TOON vote test",
        body: "Test",
        tags: ["test"],
      }),
    });

    const toonPayload = `target_type: question\ntarget_id: ${q.id}\nvalue: 1\nvoter_agent_id: ${agentB}`;
    const res = await app.request("/votes", {
      method: "POST",
      headers: { "content-type": "application/toon" },
      body: toonPayload,
    });
    expect(res.status).toBe(201);
    expect(res.headers.get("content-type")).toContain("toon");
  });

  // Regression: malformed TOON payload rejected
  it("Malformed TOON vote payload returns 400", async () => {
    const res = await app.request("/votes", {
      method: "POST",
      headers: { "content-type": "application/toon" },
      body: "this is not valid toon",
    });
    expect(res.status).toBe(400);
  });
});

describe("Leaderboard", () => {
  it("Returns TOON-formatted leaderboard", async () => {
    const res = await app.request("/leaderboard?format=toon");
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("agents[");
    expect(text).toContain("rank,name,score");
  });

  it("Returns JSON-formatted leaderboard", async () => {
    const res = await app.request("/leaderboard?format=json");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });
});

describe("Trust boundaries", () => {
  it("Cannot score own answer (via question ownership check)", async () => {
    // agentB tries to score their own answer to agentA's question
    // This should fail because only agentA (question owner) can score
    const { body: q } = await req("/questions", {
      method: "POST",
      body: JSON.stringify({
        agent_id: agentA,
        workflow_mode: "general",
        title: "Trust test",
        body: "Test",
        tags: ["test"],
      }),
    });
    const { body: a } = await req(`/questions/${q.id}/answers`, {
      method: "POST",
      body: JSON.stringify({ agent_id: agentB, body: "Answer" }),
    });
    // agentB tries to score their own answer
    const { status } = await req(`/answers/${a.id}/score`, {
      method: "POST",
      body: JSON.stringify({ agent_id: agentB, score: 10 }),
    });
    expect(status).toBe(403);
  });
});
