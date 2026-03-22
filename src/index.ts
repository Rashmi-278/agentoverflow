import { Hono } from "hono";
import { cors } from "hono/cors";
import { nanoid } from "nanoid";
import activity from "./api/activity";
import agents from "./api/agents";
import answers from "./api/answers";
import demo from "./api/demo";
import leaderboard from "./api/leaderboard";
import questions from "./api/questions";
import tags from "./api/tags";
import votes from "./api/votes";
import { getDb } from "./db";

const app = new Hono();

const ALLOWED_ORIGINS = [
  "http://localhost:3001",
  "http://localhost:3000",
];

// Add production frontend URL(s) from env
if (process.env.NETLIFY_URL) {
  ALLOWED_ORIGINS.push(process.env.NETLIFY_URL.replace(/\/$/, ""));
}
if (process.env.FRONTEND_URL) {
  ALLOWED_ORIGINS.push(process.env.FRONTEND_URL.replace(/\/$/, ""));
}

app.use(
  "*",
  cors({
    origin: (origin) => {
      if (!origin) return "*"; // Allow non-browser requests (MCP agents, curl)
      // Exact match or Netlify deploy-preview subdomains
      if (ALLOWED_ORIGINS.some((allowed) => origin === allowed)) return origin;
      if (origin.endsWith(".netlify.app")) return origin;
      return "";
    },
  }),
);

// Health check
app.get("/health", (c) => c.json({ status: "ok", version: "1.0.0" }));

// Stats endpoint — single query, no fetching all rows
app.get("/stats", (c) => {
  const db = getDb();
  const stats = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM questions) as questions,
      (SELECT COUNT(*) FROM questions WHERE status = 'resolved') as resolved,
      (SELECT COUNT(*) FROM agents) as agents,
      (SELECT COUNT(*) FROM answers) as answers
  `).get() as { questions: number; resolved: number; agents: number; answers: number };
  return c.json(stats);
});

// Mount routes
app.route("/agents", agents);
app.route("/questions", questions);
app.route("/", answers); // mounted at root because paths include /questions/:id/answers and /answers/:id/score
app.route("/votes", votes);
app.route("/leaderboard", leaderboard);
app.route("/tags", tags);
app.route("/activity", activity);
app.route("/demo", demo);

export { app };
// Note: Do NOT use `export default app` — Bun auto-serves default exports
// with a fetch() method, which conflicts with our explicit Bun.serve() call.

// Auto-seed if DB is empty (ensures demo data on fresh deploys)
function autoSeed() {
  const db = getDb();
  const count = db.prepare("SELECT COUNT(*) as cnt FROM agents").get() as { cnt: number };
  if (count.cnt === 0) {
    console.log("[auto-seed] Empty database detected, seeding tags...");

    // Only seed tags — agents should be created via MCP registration
    db.prepare("INSERT OR IGNORE INTO skill_tags (id, name) VALUES (?, ?)").run("tag_typescript", "typescript");
    db.prepare("INSERT OR IGNORE INTO skill_tags (id, name) VALUES (?, ?)").run("tag_strictmode", "strict-mode");

    console.log("[auto-seed] Done — tags seeded. Register your agent via MCP to get started.");
  }
}

// Start server if run directly
const port = Number(process.env.PORT) || 3000;
if (import.meta.main) {
  // Start server FIRST so healthcheck passes, then seed
  console.log(`AgentOverflow API running on port ${port}`);
  Bun.serve({
    fetch: app.fetch,
    port,
  });
  autoSeed();
}
