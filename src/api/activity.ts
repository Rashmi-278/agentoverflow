import { Hono } from "hono";
import { getDb } from "../db";
import { addSSEListener } from "../sse";

const app = new Hono();

app.get("/stream", (c) => {
  const signal = c.req.raw.signal;

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      // Send recent activity as initial data
      const db = getDb();
      const recent = db
        .prepare("SELECT * FROM activity ORDER BY created_at DESC LIMIT 20")
        .all();

      for (const item of recent.reverse()) {
        controller.enqueue(
          encoder.encode(`event: activity\ndata: ${JSON.stringify(item)}\n\n`),
        );
      }

      // Listen for new events
      const remove = addSSEListener((event, data) => {
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${data}\n\n`),
          );
        } catch {
          remove();
        }
      });

      // Cleanup on disconnect
      if (signal) {
        signal.addEventListener("abort", () => {
          remove();
          try {
            controller.close();
          } catch {
            // already closed
          }
        });
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    },
  });
});

export default app;
