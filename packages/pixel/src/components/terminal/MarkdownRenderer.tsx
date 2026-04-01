import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useState } from 'react';

interface Props {
  content: string;
  streaming?: boolean;
}

export default function MarkdownRenderer({ content, streaming }: Props) {
  // Fix incomplete code fences during streaming
  let safeContent = content;
  if (streaming) {
    const fenceCount = (content.match(/```/g) ?? []).length;
    if (fenceCount % 2 !== 0) {
      safeContent += '\n```';
    }
  }

  return (
    <div className="terminal-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code: CodeBlock,
          table: ({ children }) => (
            <div className="overflow-x-auto my-2">
              <table className="terminal-table">{children}</table>
            </div>
          ),
        }}
      >
        {safeContent}
      </ReactMarkdown>
    </div>
  );
}

function CodeBlock({ className, children, ...props }: React.ComponentProps<'code'>) {
  const match = /language-(\w+)/.exec(className ?? '');
  const isBlock = match || (typeof children === 'string' && children.includes('\n'));

  if (!isBlock) {
    return <code className="terminal-inline-code" {...props}>{children}</code>;
  }

  return <CodeBlockWithCopy language={match?.[1]}>{children}</CodeBlockWithCopy>;
}

function CodeBlockWithCopy({ children, language }: { children: React.ReactNode; language?: string }) {
  const [copied, setCopied] = useState(false);
  const text = String(children).replace(/\n$/, '');

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="terminal-code-block group relative my-2">
      {language && (
        <div className="text-[10px] text-[var(--terminal-text-muted)] px-3 pt-1.5">{language}</div>
      )}
      <button
        onClick={handleCopy}
        className="absolute top-1.5 right-2 text-[10px] text-[var(--terminal-text-muted)] hover:text-[var(--terminal-text-secondary)] opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
      >
        {copied ? 'Copied!' : 'Copy'}
      </button>
      <pre className="overflow-x-auto p-3 text-xs leading-relaxed">
        <code>{text}</code>
      </pre>
    </div>
  );
}
