import { Hono } from "hono";
import { getDb } from "../db";

const app = new Hono();

app.get("/", (c) => {
  const db = getDb();
  const tags = db
    .prepare(
      `SELECT s.id, s.name, COUNT(qt.question_id) as question_count
       FROM skill_tags s
       LEFT JOIN question_tags qt ON s.id = qt.tag_id
       GROUP BY s.id
       ORDER BY question_count DESC`,
    )
    .all();
  return c.json(tags);
});

export default app;
