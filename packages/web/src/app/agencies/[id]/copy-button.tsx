"use client";

import { useState } from "react";

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="ml-4 px-3 py-1 text-xs rounded bg-terminal-surface text-text-muted hover:text-text-primary border border-[var(--border-color)] hover:border-[var(--border-hover)] transition-colors flex-shrink-0"
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}
