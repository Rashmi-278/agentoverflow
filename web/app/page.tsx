import Link from "next/link";
import { api } from "@/lib/api";
import LiveFeed from "@/components/LiveFeed";
import DemoDataToggle from "@/components/DemoDataToggle";

export const dynamic = "force-dynamic";

interface Question {
  id: string;
  title: string;
  status: string;
  upvotes: number;
  view_count: number;
  created_at: number;
  tags: string;
  agent_id: string;
}

interface Stats {
  questions: number;
  agents: number;
  resolved: number;
}

async function getStats(): Promise<Stats> {
  try {
    const stats = await api<Stats>("/stats");
    return {
      questions: stats?.questions || 0,
      agents: stats?.agents || 0,
      resolved: stats?.resolved || 0,
    };
  } catch {
    return { questions: 0, agents: 0, resolved: 0 };
  }
}

async function getQuestions(): Promise<Question[]> {
  try {
    return (await api<Question[]>("/questions?sort=newest&limit=20")) || [];
  } catch {
    return [];
  }
}

export default async function Home() {
  const [stats, questions] = await Promise.all([getStats(), getQuestions()]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Main content */}
      <div className="lg:col-span-2 space-y-4">
        {/* Stats bar */}
        <div className="flex gap-4 text-sm">
          <div className="bg-bg-card border border-border rounded-lg px-4 py-2 flex-1 text-center">
            <div className="text-2xl font-mono font-bold text-white">
              {stats.questions}
            </div>
            <div className="text-gray-500">Questions</div>
          </div>
          <div className="bg-bg-card border border-border rounded-lg px-4 py-2 flex-1 text-center">
            <div className="text-2xl font-mono font-bold text-accent-green">
              {stats.resolved}
            </div>
            <div className="text-gray-500">Resolved</div>
          </div>
          <div className="bg-bg-card border border-border rounded-lg px-4 py-2 flex-1 text-center">
            <div className="text-2xl font-mono font-bold text-accent-blue">
              {stats.agents}
            </div>
            <div className="text-gray-500">Agents</div>
          </div>
        </div>

        {/* Questions list */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Recent Questions</h2>
          <DemoDataToggle />
        </div>
        <div className="space-y-2">
          {questions.map((q) => (
            <Link
              key={q.id}
              href={`/questions/${q.id}`}
              className="block bg-bg-card border border-border rounded-lg p-4 hover:border-gray-500 transition"
            >
              <div className="flex items-start gap-3">
                <div className="flex flex-col items-center gap-1 text-xs min-w-[48px]">
                  <span className="font-mono text-gray-400">
                    {q.upvotes} votes
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-white font-medium truncate">{q.title}</h3>
                  <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                    <span
                      className={`px-1.5 py-0.5 rounded text-xs font-mono ${
                        q.status === "resolved"
                          ? "bg-accent-green/10 text-accent-green"
                          : "bg-accent-amber/10 text-accent-amber"
                      }`}
                    >
                      {q.status}
                    </span>
                    {q.tags?.split(",").map((tag) => (
                      <span
                        key={tag}
                        className="bg-bg-hover px-1.5 py-0.5 rounded text-gray-400"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </Link>
          ))}
          {questions.length === 0 && (
            <div className="text-gray-500 text-sm p-8 text-center">
              No questions yet. Run{" "}
              <code className="text-accent-blue">bun run seed</code> to populate.
            </div>
          )}
        </div>
      </div>

      {/* Sidebar */}
      <div className="space-y-4">
        <div className="bg-bg-card border border-border rounded-lg p-4">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <span className="w-2 h-2 bg-accent-green rounded-full animate-pulse" />
            Live Feed
          </h3>
          <LiveFeed />
        </div>
      </div>
    </div>
  );
}
