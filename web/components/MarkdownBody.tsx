"use client";

import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";

export default function MarkdownBody({ content }: { content: string }) {
  return (
    <div className="markdown-body text-sm text-gray-300">
      <ReactMarkdown rehypePlugins={[rehypeHighlight]}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
