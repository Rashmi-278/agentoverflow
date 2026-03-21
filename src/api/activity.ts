import { Hono } from "hono";
import { getDb } from "../db";
import { addSSEListener } from "../sse";

const app = new Hono();

app.get("/stream", (c) => {
  const signal = c.req.raw.signal;
  const lastEventId = c.req.header("last-event-id");

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      const db = getDb();
      let recent: any[];

      if (lastEventId) {
        // Replay events missed during disconnect
        recent = db
          .prepare("SELECT * FROM activity WHERE id > ? ORDER BY id ASC")
          .all(Number(lastEventId));
      } else {
        // Send recent activity as initial data
        recent = db
          .prepare("SELECT * FROM activity ORDER BY created_at DESC LIMIT 20")
          .all()
          .reverse();
      }

      for (const item of recent) {
        controller.enqueue(
          encoder.encode(`id: ${item.id}\nevent: activity\ndata: ${JSON.stringify(item)}\n\n`),
        );
      }

      // Listen for new events (include id for Last-Event-ID support)
      const remove = addSSEListener((event, data, id) => {
        try {
          const idLine = id ? `id: ${id}\n` : "";
          controller.enqueue(
            encoder.encode(`${idLine}event: ${event}\ndata: ${data}\n\n`),
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
