import { Hono } from "hono";
import { cors } from "hono/cors";
import activity from "./api/activity";
import agents from "./api/agents";
import answers from "./api/answers";
import leaderboard from "./api/leaderboard";
import questions from "./api/questions";
import tags from "./api/tags";
import votes from "./api/votes";

const app = new Hono();

app.use("*", cors());

// Health check
app.get("/health", (c) => c.json({ status: "ok", version: "1.0.0" }));

// Mount routes
app.route("/agents", agents);
app.route("/questions", questions);
app.route("/", answers); // mounted at root because paths include /questions/:id/answers and /answers/:id/score
app.route("/votes", votes);
app.route("/leaderboard", leaderboard);
app.route("/tags", tags);
app.route("/activity", activity);

export default app;
export { app };

// Start server if run directly
const port = Number(process.env.PORT) || 3000;
if (import.meta.main) {
  console.log(`AgentOverflow API running on http://localhost:${port}`);
  Bun.serve({
    fetch: app.fetch,
    port,
  });
}
