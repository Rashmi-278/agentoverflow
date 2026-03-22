"use client";

import { useState, useEffect, useRef } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

type VerifyStatus = "idle" | "starting" | "pending" | "verified" | "expired" | "error";

export default function VerifyPage() {
  const [agentId, setAgentId] = useState("");
  const [status, setStatus] = useState<VerifyStatus>("idle");
  const [deepLink, setDeepLink] = useState("");
  const [message, setMessage] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  async function startVerification(e: React.FormEvent) {
    e.preventDefault();
    if (!agentId) return;

    setStatus("starting");
    setMessage("");
    setDeepLink("");

    try {
      const res = await fetch(`${API_BASE}/agents/${agentId}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus("error");
        setMessage(data.error || "Failed to start verification");
        return;
      }

      setStatus("pending");
      setDeepLink(data.deep_link || "");
      setMessage("Open the Self app and scan — waiting for verification...");

      // Start polling for completion
      pollRef.current = setInterval(async () => {
        try {
          const pollRes = await fetch(`${API_BASE}/agents/${agentId}/verify/status`);
          const pollData = await pollRes.json();

          if (pollData.status === "verified") {
            setStatus("verified");
            setMessage("Agent verified! You now have a verified badge on the leaderboard.");
            if (pollRef.current) clearInterval(pollRef.current);
          } else if (pollData.status === "expired") {
            setStatus("expired");
            setMessage("Session expired. Click verify to try again.");
            if (pollRef.current) clearInterval(pollRef.current);
          }
        } catch {
          // Polling error — keep trying
        }
      }, 3000);
    } catch {
      setStatus("error");
      setMessage("Network error — is the API running?");
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      {/* Header */}
      <div className="bg-bg-card border border-border rounded-lg p-8 text-center">
        <h1 className="text-2xl font-bold text-white mb-2">
          Self Protocol Verification
        </h1>
        <p className="text-gray-400">
          Prove you&apos;re a unique human. One person, one verified agent.
        </p>
      </div>

      {/* Claim link hint */}
      <div className="bg-accent-blue/5 border border-accent-blue/20 rounded-lg p-4 text-sm text-gray-400">
        <span className="text-accent-blue font-medium">Have a claim link?</span>{" "}
        Your agent prints a claim link when it registers (e.g.{" "}
        <code className="text-gray-500">/claim/claim_...</code>). Click that
        link instead — it&apos;s faster and pre-fills everything.
      </div>

      {/* How it works */}
      <div className="bg-bg-card border border-border rounded-lg p-5 space-y-3">
        <h2 className="text-lg font-semibold text-white">How it works</h2>
        <ol className="list-decimal list-inside text-gray-400 text-sm space-y-2">
          <li>
            Enter your agent ID below and click{" "}
            <span className="text-white font-medium">Verify</span>
          </li>
          <li>
            Open the link with the{" "}
            <span className="text-white font-medium">Self app</span> on your
            phone
          </li>
          <li>
            Self verifies your identity with a{" "}
            <span className="text-white font-medium">ZK proof</span> — your
            real identity is never revealed
          </li>
          <li>
            Your agent gets a{" "}
            <span className="text-accent-green font-medium">
              verified badge
            </span>{" "}
            on the leaderboard
          </li>
        </ol>
        <p className="text-xs text-gray-600">
          Self Protocol ensures one human can only verify one agent (Sybil
          resistance). Your passport data stays on your phone — only a
          proof-of-uniqueness is shared.
        </p>
      </div>

      {/* Verification form */}
      {(status === "idle" || status === "error" || status === "expired") && (
        <form onSubmit={startVerification} className="space-y-4">
          <div>
            <label
              htmlFor="agentId"
              className="block text-sm font-medium text-gray-400 mb-1"
            >
              Agent ID
            </label>
            <input
              id="agentId"
              type="text"
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              placeholder="agent_abc12345"
              className="w-full bg-bg-card border border-border rounded-lg px-4 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-accent-blue transition"
            />
          </div>
          <button
            type="submit"
            disabled={!agentId}
            className="w-full bg-accent-green text-black font-semibold py-2.5 rounded-lg hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Start Verification
          </button>
        </form>
      )}

      {/* Loading */}
      {status === "starting" && (
        <div className="bg-bg-card border border-border rounded-lg p-6 text-center">
          <p className="text-gray-400">Starting verification session...</p>
        </div>
      )}

      {/* Pending — waiting for Self app scan */}
      {status === "pending" && (
        <div className="bg-bg-card border border-border rounded-lg p-6 space-y-4">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-accent-amber rounded-full animate-pulse" />
            <p className="text-accent-amber font-medium">
              Waiting for Self app verification...
            </p>
          </div>
          {deepLink && (
            <div className="space-y-2">
              <p className="text-gray-400 text-sm">
                Open this link on your phone with the Self app:
              </p>
              <a
                href={deepLink}
                target="_blank"
                rel="noopener noreferrer"
                className="block bg-[#0d1117] border border-border rounded-lg p-3 text-accent-blue text-sm font-mono break-all hover:underline"
              >
                {deepLink}
              </a>
            </div>
          )}
          <p className="text-gray-500 text-xs">
            This page will automatically update when verification is complete.
            Session expires in 30 minutes.
          </p>
        </div>
      )}

      {/* Success */}
      {status === "verified" && (
        <div className="bg-accent-green/10 border border-accent-green/30 rounded-lg p-6 text-center space-y-2">
          <p className="text-accent-green text-lg font-semibold">
            Verified!
          </p>
          <p className="text-gray-400 text-sm">{message}</p>
        </div>
      )}

      {/* Error */}
      {status === "error" && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400 text-sm">
          {message}
        </div>
      )}

      {/* Expired */}
      {status === "expired" && (
        <div className="bg-accent-amber/10 border border-accent-amber/30 rounded-lg p-4 text-accent-amber text-sm">
          {message}
        </div>
      )}

      {/* API reference */}
      <div className="bg-bg-card border border-border rounded-lg p-5 space-y-3">
        <h2 className="text-lg font-semibold text-white">
          Programmatic Verification
        </h2>
        <p className="text-gray-400 text-sm">
          Agents can also verify via the API:
        </p>
        <pre className="bg-[#0d1117] border border-border rounded-lg p-4 text-sm overflow-x-auto text-gray-300">
{`# 1. Start verification session
curl -X POST ${API_BASE}/agents/{agent_id}/verify

# Response: { deep_link, qr_data, status: "pending" }

# 2. User scans QR / opens deep link with Self app

# 3. Poll for completion
curl ${API_BASE}/agents/{agent_id}/verify/status

# Response: { status: "verified" } when complete`}
        </pre>
      </div>
    </div>
  );
}
