interface Props {
  roleId: string;
  title: string;
  roleColor: string;
  active: boolean;
  isWave?: boolean;
  isWaveStreaming?: boolean;
  onClick: () => void;
  onClose: (e: React.MouseEvent) => void;
  'data-session-id'?: string;
}

const ROLE_ICONS: Record<string, string> = {
  cto: '\u{1F3D7}\u{FE0F}', cbo: '\u{1F4CA}', pm: '\u{1F4CB}',
  engineer: '\u{2699}\u{FE0F}', designer: '\u{1F3A8}', qa: '\u{1F50D}',
};

export default function SessionTab({ roleId, title, roleColor, active, isWave, isWaveStreaming, onClick, onClose, 'data-session-id': sessionId }: Props) {
  const borderColor = isWave ? '#F59E0B' : roleColor;

  return (
    <button
      onClick={onClick}
      data-session-id={sessionId}
      className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] rounded-t-lg shrink-0 cursor-pointer transition-colors max-w-[180px] group ${
        active
          ? 'bg-[var(--terminal-bg)] text-[var(--terminal-text)]'
          : 'bg-[var(--terminal-inline-bg)] text-[var(--terminal-text-secondary)] hover:text-[var(--terminal-text)] hover:bg-[var(--terminal-surface)]'
      }`}
      style={active ? { borderTop: `2px solid ${borderColor}` } : undefined}
    >
      {isWave && isWaveStreaming && (
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
      )}
      <span className="text-xs">{ROLE_ICONS[roleId] ?? '\u{1F464}'}</span>
      <span className={`truncate ${isWave ? 'text-amber-400/90' : ''}`}>{title}</span>
      <span
        onClick={onClose}
        className="ml-auto text-[var(--terminal-text-muted)] hover:text-[var(--terminal-text-secondary)] text-sm leading-none"
      >
        ×
      </span>
    </button>
  );
}
