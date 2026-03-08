import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ActivityEvent } from '../../types';

const ROLE_COLORS: Record<string, string> = {
  cto: '#1565C0', cbo: '#E65100', pm: '#2E7D32',
  engineer: '#4A148C', designer: '#AD1457', qa: '#00695C',
};

export default function EventRow({ event, isThinkingCollapsed, onToggleThinking, onNavigateToJob, onOpenKnowledgeDoc, compact }: {
  event: ActivityEvent;
  isThinkingCollapsed: boolean;
  onToggleThinking: () => void;
  onNavigateToJob?: (childJobId: string) => void;
  onOpenKnowledgeDoc?: (docId: string) => void;
  compact?: boolean;
}) {
  const roleColor = ROLE_COLORS[event.roleId] ?? '#888';

  switch (event.type) {
    case 'text': {
      const rawText = (event.data.text as string) ?? '';
      const displayText = compact ? rawText.slice(0, 300) : rawText;
      // Only use markdown renderer if text contains markdown syntax
      const hasMarkdown = /[#*|`\[\]_~>-]/.test(displayText);
      if (!hasMarkdown) {
        return (
          <div className="text-green-300/90 whitespace-pre-wrap leading-relaxed">
            {displayText}
          </div>
        );
      }
      return (
        <div className="text-green-300/90 leading-relaxed event-markdown">
          <Markdown remarkPlugins={[remarkGfm]}>{displayText}</Markdown>
        </div>
      );
    }

    case 'thinking': {
      const text = event.data.text as string ?? '';
      return (
        <div className="group">
          <button
            onClick={onToggleThinking}
            className="text-[var(--terminal-text-muted)] hover:text-[var(--terminal-text-secondary)] text-[10px] cursor-pointer flex items-center gap-1 select-text"
          >
            <span>{isThinkingCollapsed ? '\u25B6' : '\u25BC'}</span>
            <span className="italic">thinking...</span>
          </button>
          {!isThinkingCollapsed && (
            <div className={`ml-3 text-[var(--terminal-text-muted)] italic whitespace-pre-wrap opacity-60 text-[11px] overflow-hidden ${compact ? 'max-h-[60px]' : 'max-h-[120px]'}`}>
              {text.slice(0, compact ? 200 : 500)}{text.length > (compact ? 200 : 500) ? '...' : ''}
            </div>
          )}
        </div>
      );
    }

    case 'tool:start': {
      const toolName = String(event.data.name ?? '');
      const toolInput = event.data.input as Record<string, unknown> | undefined;
      const cmdStr = typeof toolInput?.command === 'string' ? toolInput.command.slice(0, 80) : '';
      const filePath = typeof toolInput?.file_path === 'string' ? String(toolInput.file_path)
        : typeof toolInput?.path === 'string' ? String(toolInput.path) : '';
      const fileStr = filePath ? filePath.split('/').pop() ?? '' : '';

      // Detect knowledge doc writes (write_file, Write, edit_file, Edit)
      const isWrite = /^(write_file|Write|edit_file|Edit)$/i.test(toolName);
      const knowledgePath = filePath.match(/(?:^|\/)knowledge\/(.+\.md)$/)?.[1];
      const isKnowledgeLink = isWrite && knowledgePath && onOpenKnowledgeDoc;

      return (
        <div className="flex items-center gap-2 py-0.5">
          <span className={`px-1.5 py-0.5 rounded text-[10px] ${
            isKnowledgeLink
              ? 'text-green-400/80 bg-green-400/10'
              : 'text-blue-400/80 bg-blue-400/10'
          }`}>
            {isKnowledgeLink ? (isWrite && toolName.toLowerCase().includes('edit') ? 'Edit' : 'Write') : toolName}
          </span>
          {isKnowledgeLink ? (
            <button
              onClick={() => onOpenKnowledgeDoc!(knowledgePath)}
              className="text-[10px] text-green-400 hover:text-green-300 underline underline-offset-2 cursor-pointer truncate"
              style={{ maxWidth: compact ? 200 : 400 }}
            >
              {fileStr}
            </button>
          ) : (
            <>
              {cmdStr && (
                <span className={`text-[var(--terminal-text-muted)] text-[10px] truncate ${compact ? 'max-w-[200px]' : 'max-w-[400px]'}`}>
                  {cmdStr}
                </span>
              )}
              {fileStr && (
                <span className={`text-[var(--terminal-text-muted)] text-[10px] truncate ${compact ? 'max-w-[200px]' : 'max-w-[400px]'}`}>
                  {fileStr}
                </span>
              )}
            </>
          )}
        </div>
      );
    }

    case 'dispatch:start': {
      const targetRoleId = event.data.targetRoleId as string ?? event.data.roleId as string ?? '';
      const task = event.data.task as string ?? '';
      const childJobId = event.data.childJobId as string;
      const targetColor = ROLE_COLORS[targetRoleId] ?? '#888';
      return (
        <div
          className="my-1 p-2 rounded-lg border cursor-pointer hover:opacity-90 transition-opacity"
          style={{
            borderColor: `${targetColor}44`,
            background: `${targetColor}11`,
          }}
          onClick={() => childJobId && onNavigateToJob?.(childJobId)}
        >
          <div className="flex items-center gap-2">
            <span style={{ color: targetColor }} className="font-bold text-[11px]">
              {'\u2192'} {targetRoleId.toUpperCase()}
            </span>
            <span className={`text-[var(--terminal-text-secondary)] text-[10px] truncate flex-1`}>
              {task.slice(0, compact ? 60 : 100)}
            </span>
            {childJobId && onNavigateToJob && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-[var(--terminal-text-muted)]">
                View {'\u2192'}
              </span>
            )}
          </div>
        </div>
      );
    }

    case 'dispatch:done':
      return (
        <div className="text-[var(--terminal-text-muted)] text-[10px] pl-3 border-l-2 border-[var(--terminal-border)] my-0.5">
          Dispatch completed
        </div>
      );

    case 'turn:complete':
      return (
        <div className="border-t border-[var(--terminal-border)] my-2 relative">
          <span className="absolute -top-2 left-2 bg-[var(--terminal-bg)] px-2 text-[9px] text-[var(--terminal-text-muted)]">
            Turn {event.data.turn as number}
          </span>
        </div>
      );

    case 'stderr':
      return (
        <div className="text-red-400/80 text-[11px]">
          {'\u26A0'} {event.data.message as string}
        </div>
      );

    case 'job:start':
      return (
        <div className="text-[var(--terminal-text-muted)] text-[10px] pb-1">
          <span style={{ color: roleColor }} className="font-bold">{event.roleId.toUpperCase()}</span>
          {' '}started: {(event.data.task as string ?? '').slice(0, compact ? 50 : 80)}
        </div>
      );

    case 'job:done': {
      const turns = event.data.turns as number ?? 0;
      const toolCalls = event.data.toolCalls as number ?? 0;
      return (
        <div className="mt-2 p-2 rounded-lg bg-green-900/20 border border-green-800/30">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-400" />
            <span className="text-green-300 font-bold text-[11px]">Complete</span>
            <span className="text-[var(--terminal-text-muted)] text-[10px]">
              {turns} turns · {toolCalls} tools
            </span>
          </div>
        </div>
      );
    }

    case 'job:error':
      return (
        <div className="mt-2 p-2 rounded-lg bg-red-900/20 border border-red-800/30">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-400" />
            <span className="text-red-300 font-bold text-[11px]">Error</span>
            <span className="text-red-200/70 text-[10px]">{event.data.message as string}</span>
          </div>
        </div>
      );

    case 'job:awaiting_input': {
      const question = (event.data.question as string) ?? '';
      return (
        <div className="mt-2 p-2 rounded-lg border" style={{ background: '#F59E0B11', borderColor: '#F59E0B33' }}>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ background: '#F59E0B', animation: 'wave-pulse 1.5s ease-in-out infinite' }} />
            <span className="font-bold text-[11px]" style={{ color: '#F59E0B' }}>Awaiting Reply</span>
          </div>
          {question && (
            <div className="mt-1 text-[11px] text-[var(--terminal-text)] whitespace-pre-wrap">{question}</div>
          )}
        </div>
      );
    }

    case 'job:reply':
      return (
        <div className="mt-1 p-2 rounded-lg bg-blue-900/20 border border-blue-800/30">
          <div className="flex items-center gap-2">
            <span className="text-blue-300 font-bold text-[11px]">CEO replied:</span>
            <span className="text-blue-200/80 text-[11px]">{(event.data.response as string) ?? ''}</span>
          </div>
        </div>
      );

    case 'import:scan':
    case 'import:process':
    case 'import:created':
      return (
        <div className="text-cyan-300/70 text-[11px]">
          [{event.type}] {JSON.stringify(event.data)}
        </div>
      );

    default:
      return null;
  }
}
