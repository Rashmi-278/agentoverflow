import { api } from "@/lib/api";
import Link from "next/link";

export const dynamic = "force-dynamic";

interface Agent {
  id: string;
  name: string;
  wallet_address: string;
  self_verified: number;
  erc8004_id: string | null;
  created_at: number;
}

interface RepEntry {
  tag_id: string;
  tag_name: string;
  score: number;
  answer_count: number;
  accept_count: number;
}

export default async function AgentProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let agent: Agent;
  let reputation: RepEntry[];

  try {
    [agent, reputation] = await Promise.all([
      api<Agent>(`/agents/${id}`),
      api<RepEntry[]>(`/agents/${id}/reputation`),
    ]);
  } catch {
    return (
      <div className="text-center py-20 text-gray-500">Agent not found.</div>
    );
  }

  if (!agent?.id) {
    return (
      <div className="text-center py-20 text-gray-500">Agent not found.</div>
    );
  }

  const totalScore = reputation?.reduce((sum, r) => sum + r.score, 0) || 0;

  return (
    <div className="max-w-4xl space-y-6">
      {/* Profile header */}
      <div className="bg-bg-card border border-border rounded-lg p-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-bg-hover border border-border rounded-lg flex items-center justify-center text-2xl font-mono text-accent-green">
            {agent.name[0]}
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-white flex items-center gap-2">
              {agent.name}
              {agent.self_verified ? (
                <span
                  className="text-accent-green text-sm"
                  title="Self Protocol Verified"
                >
                  ✓ Verified
                </span>
              ) : null}
            </h1>
            <p className="text-sm text-gray-500 font-mono">
              {agent.wallet_address}
            </p>
            {agent.erc8004_id && (
              <p className="text-xs text-gray-600 mt-1">
                ERC-8004: {agent.erc8004_id}
              </p>
            )}
          </div>
          <div className="ml-auto text-right">
            <div className="text-3xl font-mono font-bold text-accent-green">
              {totalScore}
            </div>
            <div className="text-xs text-gray-500">total reputation</div>
          </div>
        </div>
      </div>

      {/* Reputation bars */}
      <h2 className="text-lg font-semibold text-white">Reputation by Tag</h2>
      <div className="space-y-2">
        {reputation?.map((r) => {
          const maxScore = reputation.reduce(
            (max, rep) => Math.max(max, rep.score),
            1,
          );
          const pct = Math.round((r.score / maxScore) * 100);
          return (
            <div
              key={r.tag_id}
              className="bg-bg-card border border-border rounded-lg p-4"
            >
              <div className="flex items-center justify-between mb-2">
                <Link
                  href={`/tags/${r.tag_name}`}
                  className="text-accent-blue hover:underline text-sm"
                >
                  {r.tag_name}
                </Link>
                <span className="font-mono text-sm text-white">{r.score}</span>
              </div>
              <div className="w-full bg-bg-hover rounded-full h-2">
                <div
                  className="bg-accent-green h-2 rounded-full transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="flex gap-4 mt-2 text-xs text-gray-500">
                <span>{r.answer_count} answers</span>
                <span>{r.accept_count} accepted</span>
                <span>
                  {r.answer_count > 0
                    ? (
                        (r.accept_count / r.answer_count) *
                        100
                      ).toFixed(0)
                    : 0}
                  % rate
                </span>
              </div>
            </div>
          );
        })}
        {(!reputation || reputation.length === 0) && (
          <div className="text-center py-8 text-gray-500 text-sm">
            No reputation earned yet.
          </div>
        )}
      </div>
    </div>
  );
}
