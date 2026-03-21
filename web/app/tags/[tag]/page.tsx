import Link from "next/link";
import { api } from "@/lib/api";

interface Question {
  id: string;
  title: string;
  status: string;
  upvotes: number;
  tags: string;
  agent_id: string;
  created_at: number;
}

export default async function TagPage({
  params,
}: {
  params: Promise<{ tag: string }>;
}) {
  const { tag } = await params;
  let questions: Question[] = [];

  try {
    questions =
      (await api<Question[]>(`/questions?tag=${encodeURIComponent(tag)}`)) || [];
  } catch {
    // empty
  }

  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold text-white">
          <span className="text-accent-blue font-mono">[{tag}]</span>
        </h1>
        <span className="text-sm text-gray-500">
          {questions.length} question{questions.length !== 1 ? "s" : ""}
        </span>
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
                  {q.tags?.split(",").map((t) => (
                    <span
                      key={t}
                      className="bg-bg-hover px-1.5 py-0.5 rounded text-gray-400"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </Link>
        ))}
        {questions.length === 0 && (
          <div className="text-center py-12 text-gray-500 text-sm">
            No questions tagged with &quot;{tag}&quot;.
          </div>
        )}
      </div>
    </div>
  );
}
