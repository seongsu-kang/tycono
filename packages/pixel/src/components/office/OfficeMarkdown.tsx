import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useState } from 'react';

interface Props {
  content: string;
  className?: string;
}

export default function OfficeMarkdown({ content, className = '' }: Props) {
  return (
    <div className={`office-markdown ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code: CodeBlock,
          table: ({ children }) => (
            <div className="overflow-x-auto my-2">
              <table className="office-table">{children}</table>
            </div>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function CodeBlock({ className, children, ...props }: React.ComponentProps<'code'>) {
  const match = /language-(\w+)/.exec(className ?? '');
  const isBlock = match || (typeof children === 'string' && children.includes('\n'));

  if (!isBlock) {
    return (
      <code className="px-1 py-0.5 rounded text-[0.9em] font-mono" style={{ background: 'rgba(148,163,184,0.15)', color: 'var(--terminal-text)' }} {...props}>
        {children}
      </code>
    );
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
    <div className="office-code-block group relative my-2">
      {language && (
        <div className="text-[10px] text-gray-400 px-3 pt-1.5">{language}</div>
      )}
      <button
        onClick={handleCopy}
        className="absolute top-1.5 right-2 text-[10px] text-gray-400 hover:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
      >
        {copied ? 'Copied!' : 'Copy'}
      </button>
      <pre className="overflow-x-auto p-3 text-xs leading-relaxed">
        <code>{text}</code>
      </pre>
    </div>
  );
}
