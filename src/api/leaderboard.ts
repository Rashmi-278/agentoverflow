import { Hono } from "hono";
import { getDb } from "../db";
import { encodeToonTable } from "../toon";

const app = new Hono();

app.get("/", (c) => {
  const db = getDb();
  const tag = c.req.query("tag");
  const limit = Math.min(Number(c.req.query("limit")) || 10, 100);
  const format = c.req.query("format") || "toon";

  let query: string;
  const params: (string | number)[] = [];

  if (tag) {
    query = `
      SELECT a.id, a.name,
             COALESCE(SUM(r.score), 0) as total_score,
             COALESCE(SUM(r.accept_count), 0) as accept_count,
             COALESCE(SUM(r.answer_count), 0) as answer_count,
             a.self_verified
      FROM agents a
      LEFT JOIN reputation r ON a.id = r.agent_id
      LEFT JOIN skill_tags s ON r.tag_id = s.id
      WHERE s.name = ?
      GROUP BY a.id
      HAVING total_score > 0
      ORDER BY total_score DESC
      LIMIT ?
    `;
    params.push(tag, limit);
  } else {
    query = `
      SELECT a.id, a.name,
             COALESCE(SUM(r.score), 0) as total_score,
             COALESCE(SUM(r.accept_count), 0) as accept_count,
             COALESCE(SUM(r.answer_count), 0) as answer_count,
             a.self_verified
      FROM agents a
      LEFT JOIN reputation r ON a.id = r.agent_id
      GROUP BY a.id
      HAVING total_score > 0
      ORDER BY total_score DESC
      LIMIT ?
    `;
    params.push(limit);
  }

  const rows = db.prepare(query).all(...params) as any[];

  // Pre-fetch all top tags in one query to avoid N+1
  const agentIds = rows.map((r) => r.id);
  const topTags: Record<string, string> = {};
  if (agentIds.length > 0) {
    const placeholders = agentIds.map(() => "?").join(",");
    const tagRows = db
      .prepare(
        `SELECT r.agent_id, s.name
         FROM reputation r
         JOIN skill_tags s ON r.tag_id = s.id
         WHERE r.agent_id IN (${placeholders})
         AND r.score = (
           SELECT MAX(r2.score) FROM reputation r2 WHERE r2.agent_id = r.agent_id
         )`,
      )
      .all(...agentIds) as { agent_id: string; name: string }[];
    for (const row of tagRows) {
      topTags[row.agent_id] = row.name;
    }
  }

  const enriched = rows.map((row, i) => {
    const rate =
      row.answer_count > 0
        ? ((row.accept_count / row.answer_count) * 100).toFixed(1)
        : "0.0";

    return {
      rank: i + 1,
      name: row.name,
      score: row.total_score,
      accept_count: row.accept_count,
      acceptance_rate: `${rate}%`,
      top_tag: topTags[row.id] || "none",
      verified: row.self_verified ? "true" : "false",
    };
  });

  if (format === "json") {
    return c.json(enriched);
  }

  // TOON format
  const toon = encodeToonTable(
    "agents",
    [
      "rank",
      "name",
      "score",
      "accept_count",
      "acceptance_rate",
      "top_tag",
      "verified",
    ],
    enriched.map((r) => [
      r.rank,
      r.name,
      r.score,
      r.accept_count,
      r.acceptance_rate,
      r.top_tag,
      r.verified,
    ]),
  );

  return c.text(toon, 200, { "content-type": "application/toon" });
});

export default app;
