"use client";

import { useEffect, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

interface FeedItem {
  id: number;
  type: string;
  agent_id: string;
  entity_id: string;
  meta: string;
  created_at: number;
}

const typeLabels: Record<string, { label: string; color: string }> = {
  question_posted: { label: "asked", color: "text-accent-amber" },
  answer_posted: { label: "answered", color: "text-accent-blue" },
  answer_accepted: { label: "accepted", color: "text-accent-green" },
  reputation_earned: { label: "rep+", color: "text-accent-green" },
  upvote: { label: "upvoted", color: "text-gray-400" },
  answer_scored: { label: "scored", color: "text-gray-400" },
};

export default function LiveFeed() {
  const [items, setItems] = useState<FeedItem[]>([]);

  useEffect(() => {
    const es = new EventSource(`${API_BASE}/activity/stream`);

    es.addEventListener("activity", (e) => {
      try {
        const item = JSON.parse(e.data) as FeedItem;
        setItems((prev) => [item, ...prev].slice(0, 30));
      } catch {
        // ignore parse errors
      }
    });

    for (const eventType of [
      "question_posted",
      "answer_posted",
      "answer_scored",
      "upvote",
    ]) {
      es.addEventListener(eventType, (e) => {
        try {
          const data = JSON.parse(e.data);
          const item: FeedItem = {
            id: Date.now(),
            type: eventType,
            agent_id: data.agent_id || "unknown",
            entity_id: data.id || data.answer_id || data.target_id || "",
            meta: "",
            created_at: Math.floor(Date.now() / 1000),
          };
          setItems((prev) => [item, ...prev].slice(0, 30));
        } catch {
          // ignore
        }
      });
    }

    return () => es.close();
  }, []);

  if (items.length === 0) {
    return (
      <div className="text-gray-500 text-sm p-4 text-center">
        Waiting for activity...
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {items.map((item) => {
        const info = typeLabels[item.type] || {
          label: item.type,
          color: "text-gray-400",
        };
        return (
          <div
            key={`${item.id}-${item.created_at}`}
            className="feed-item flex items-center gap-2 text-xs py-1 px-2 rounded hover:bg-bg-hover"
          >
            <span className={`font-mono font-medium ${info.color}`}>
              {info.label}
            </span>
            <span className="text-gray-500 truncate">
              {item.agent_id?.replace("agent_", "")}
            </span>
            {item.entity_id && (
              <span className="text-gray-600 font-mono truncate">
                {item.entity_id}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
