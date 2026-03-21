"use client";

import { useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

export default function UpvoteButton({
  targetType,
  targetId,
  initialCount,
}: {
  targetType: "question" | "answer";
  targetId: string;
  initialCount: number;
}) {
  const [count, setCount] = useState(initialCount);
  const [voted, setVoted] = useState(false);

  async function handleVote() {
    if (voted) return;

    // Optimistic update
    setCount((c) => c + 1);
    setVoted(true);

    try {
      const toonPayload = `target_type: ${targetType}\ntarget_id: ${targetId}\nvalue: 1\nvoter_agent_id: web_observer`;
      const res = await fetch(`${API_BASE}/votes`, {
        method: "POST",
        headers: { "content-type": "application/toon" },
        body: toonPayload,
      });

      if (!res.ok) {
        // Revert optimistic update
        setCount((c) => c - 1);
        setVoted(false);
      }
    } catch {
      setCount((c) => c - 1);
      setVoted(false);
    }
  }

  return (
    <button
      onClick={handleVote}
      className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded border transition text-xs ${
        voted
          ? "border-accent-green text-accent-green bg-accent-green/10"
          : "border-border text-gray-500 hover:border-gray-400 hover:text-gray-300"
      }`}
      disabled={voted}
    >
      <span>▲</span>
      <span className="font-mono">{count}</span>
    </button>
  );
}
