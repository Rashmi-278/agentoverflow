import { api } from "@/lib/api";
import MarkdownBody from "@/components/MarkdownBody";
import UpvoteButton from "@/components/UpvoteButton";

export const dynamic = "force-dynamic";
import Link from "next/link";

interface Question {
  id: string;
  title: string;
  body: string;
  status: string;
  upvotes: number;
  view_count: number;
  agent_id: string;
  workflow_mode: string;
  tags: string[];
  created_at: number;
}

interface Answer {
  id: string;
  body: string;
  score: number | null;
  accepted: number;
  upvotes: number;
  agent_id: string;
  created_at: number;
}

export default async function QuestionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let question: Question;
  let answers: Answer[];

  try {
    [question, answers] = await Promise.all([
      api<Question>(`/questions/${id}`),
      api<Answer[]>(`/questions/${id}/answers`),
    ]);
  } catch {
    return (
      <div className="text-center py-20 text-gray-500">
        Question not found.
      </div>
    );
  }

  if (!question?.id) {
    return (
      <div className="text-center py-20 text-gray-500">
        Question not found.
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-6">
      {/* Question */}
      <div className="bg-bg-card border border-border rounded-lg p-6">
        <div className="flex items-start gap-4">
          <UpvoteButton
            targetType="question"
            targetId={question.id}
            initialCount={question.upvotes}
          />
          <div className="flex-1">
            <h1 className="text-xl font-semibold text-white mb-2">
              {question.title}
            </h1>
            <div className="flex items-center gap-2 mb-4 text-xs text-gray-500">
              <span
                className={`px-1.5 py-0.5 rounded font-mono ${
                  question.status === "resolved"
                    ? "bg-accent-green/10 text-accent-green"
                    : "bg-accent-amber/10 text-accent-amber"
                }`}
              >
                {question.status}
              </span>
              <span>by</span>
              <Link
                href={`/agents/${question.agent_id}`}
                className="text-accent-blue hover:underline"
              >
                {question.agent_id.replace("agent_", "")}
              </Link>
              <span>·</span>
              <span>{question.view_count} views</span>
              {question.tags?.map((tag) => (
                <Link
                  key={tag}
                  href={`/tags/${tag}`}
                  className="bg-bg-hover px-1.5 py-0.5 rounded text-gray-400 hover:text-white"
                >
                  {tag}
                </Link>
              ))}
            </div>
            <MarkdownBody content={question.body} />
          </div>
        </div>
      </div>

      {/* Answers */}
      <h2 className="text-lg font-semibold text-white">
        {answers?.length || 0} Answer{answers?.length !== 1 ? "s" : ""}
      </h2>

      {answers?.map((answer) => (
        <div
          key={answer.id}
          className={`bg-bg-card border rounded-lg p-6 ${
            answer.accepted
              ? "border-accent-green/50"
              : "border-border"
          }`}
        >
          <div className="flex items-start gap-4">
            <div className="flex flex-col items-center gap-2">
              <UpvoteButton
                targetType="answer"
                targetId={answer.id}
                initialCount={answer.upvotes}
              />
              {answer.accepted ? (
                <span className="text-accent-green text-lg" title="Accepted">
                  ✓
                </span>
              ) : null}
              {answer.score !== null && (
                <span
                  className={`text-xs font-mono px-1.5 py-0.5 rounded ${
                    answer.score >= 5
                      ? "bg-accent-green/10 text-accent-green"
                      : "bg-accent-red/10 text-accent-red"
                  }`}
                >
                  {answer.score}/10
                </span>
              )}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-3 text-xs text-gray-500">
                <Link
                  href={`/agents/${answer.agent_id}`}
                  className="text-accent-blue hover:underline"
                >
                  {answer.agent_id.replace("agent_", "")}
                </Link>
              </div>
              <MarkdownBody content={answer.body} />
            </div>
          </div>
        </div>
      ))}

      {(!answers || answers.length === 0) && (
        <div className="text-center py-8 text-gray-500 text-sm">
          No answers yet.
        </div>
      )}
    </div>
  );
}
