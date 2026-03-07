import { useState, useCallback, useRef, useEffect } from 'react';
import type { Session, Role } from '../../types';
import type { ChatChannel } from '../../types/chat';
import SessionTab from './SessionTab';
import MessageList from './MessageList';
import InputBar from './InputBar';
import OfficeChatView from './OfficeChatView';

interface Props {
  sessions: Session[];
  activeSessionId: string | null;
  roles: Role[];
  streamingSessionId: string | null;
  width: number;
  onWidthChange?: (width: number) => void;
  onSwitchSession: (id: string) => void;
  onCloseSession: (id: string) => void;
  onCreateSession: (roleId: string) => void;
  onClearEmpty?: () => void;
  onCloseAll?: () => void;
  onSendMessage: (sessionId: string, content: string, mode: 'talk' | 'do') => void;
  onModeChange: (sessionId: string, mode: 'talk' | 'do') => void;
  onCloseTerminal: () => void;
  /** Office Chat channels */
  chatChannels?: ChatChannel[];
  activeChatChannelId?: string | null;
  onSwitchChatChannel?: (id: string | null) => void;
  onCreateChatChannel?: (name: string, members: string[], topic?: string) => void;
  onDeleteChatChannel?: (id: string) => void;
  onUpdateChatMembers?: (channelId: string, members: string[]) => void;
  onUpdateChatTopic?: (channelId: string, topic: string) => void;
  unreadChannels?: Set<string>;
}

const ROLE_COLORS: Record<string, string> = {
  cto: '#1565C0', cbo: '#E65100', pm: '#2E7D32',
  engineer: '#4A148C', designer: '#AD1457', qa: '#00695C',
};

const MIN_WIDTH = 400;
const MAX_WIDTH = 800;

export default function TerminalPanel({
  sessions, activeSessionId, roles, streamingSessionId, width, onWidthChange,
  onSwitchSession, onCloseSession, onCreateSession, onClearEmpty, onCloseAll,
  onSendMessage, onModeChange, onCloseTerminal,
  chatChannels, activeChatChannelId, onSwitchChatChannel, onCreateChatChannel, onDeleteChatChannel, onUpdateChatMembers, onUpdateChatTopic, unreadChannels,
}: Props) {
  const [showNewMenu, setShowNewMenu] = useState(false);
  const [showManageMenu, setShowManageMenu] = useState(false);
  const [showNewChannelInput, setShowNewChannelInput] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');

  // Determine active view: chat channel or session
  const isViewingChat = activeChatChannelId != null;
  const activeChannel = chatChannels?.find(c => c.id === activeChatChannelId);
  const [isResizing, setIsResizing] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);
  const tabScrollRef = useRef<HTMLDivElement>(null);

  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const isStreaming = streamingSessionId === activeSessionId;
  const emptyCount = sessions.filter((s) => s.messages.length === 0).length;

  // Update scroll overflow indicators
  const updateScrollIndicators = useCallback(() => {
    const el = tabScrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  // Auto-scroll active tab into view
  useEffect(() => {
    if (!activeSessionId || !tabScrollRef.current) return;
    const activeTab = tabScrollRef.current.querySelector(`[data-session-id="${activeSessionId}"]`);
    if (activeTab) {
      activeTab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
    updateScrollIndicators();
  }, [activeSessionId, sessions.length, updateScrollIndicators]);

  // Track scroll state
  useEffect(() => {
    const el = tabScrollRef.current;
    if (!el) return;
    updateScrollIndicators();
    el.addEventListener('scroll', updateScrollIndicators);
    const obs = new ResizeObserver(updateScrollIndicators);
    obs.observe(el);
    return () => { el.removeEventListener('scroll', updateScrollIndicators); obs.disconnect(); };
  }, [updateScrollIndicators]);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    startXRef.current = e.clientX;
    startWidthRef.current = width;
    setIsResizing(true);

    const onMove = (ev: MouseEvent) => {
      const delta = startXRef.current - ev.clientX; // drag left = wider
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidthRef.current + delta));
      onWidthChange?.(newWidth);
    };

    const onUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [width, onWidthChange]);

  return (
    <div
      className="shrink-0 bg-[var(--terminal-bg)] border-l border-[var(--terminal-border)] flex flex-col h-full relative"
      style={{ width }}
    >
      {/* Resize handle — hidden on mobile (full-width overlay) */}
      {onWidthChange && (
        <div
          className={`terminal-resize-handle absolute top-0 left-0 w-1 h-full cursor-col-resize z-10 transition-colors ${isResizing ? 'bg-[var(--terminal-border-hover)]' : 'bg-transparent'}`}
          onMouseDown={handleResizeStart}
        />
      )}

      {/* Tab bar */}
      <div className="flex items-center bg-[var(--terminal-bg-deeper)] border-b border-[var(--terminal-border)] shrink-0">
        <div className="relative flex-1 min-w-0">
          {/* Left fade */}
          {canScrollLeft && (
            <div className="absolute left-0 top-0 bottom-0 w-6 bg-gradient-to-r from-[var(--terminal-bg-deeper)] to-transparent z-10 pointer-events-none" />
          )}
          <div ref={tabScrollRef} className="flex items-center overflow-x-auto terminal-tab-scroll gap-px px-1 py-1">
            {/* Chat channel tabs */}
            {chatChannels?.map((ch) => (
              <button
                key={ch.id}
                onClick={() => {
                  onSwitchChatChannel?.(ch.id);
                }}
                className={`flex items-center gap-1 px-2.5 py-1.5 text-[11px] rounded-t-lg shrink-0 cursor-pointer transition-colors group ${
                  activeChatChannelId === ch.id
                    ? 'bg-[var(--terminal-bg)] text-[var(--terminal-text)]'
                    : 'bg-[var(--terminal-inline-bg)] text-[var(--terminal-text-muted)] hover:text-[var(--terminal-text-secondary)] hover:bg-[var(--terminal-surface)]'
                }`}
                style={activeChatChannelId === ch.id ? { borderTop: '2px solid #4CAF50' } : undefined}
              >
                <span className="text-[10px]">💬</span>
                <span className="truncate">{ch.name}</span>
                {unreadChannels?.has(ch.id) && activeChatChannelId !== ch.id && (
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
                )}
                {!ch.isDefault && (
                  <span
                    onClick={(e) => { e.stopPropagation(); onDeleteChatChannel?.(ch.id); }}
                    className="ml-1 text-[var(--terminal-text-muted)] hover:text-[var(--terminal-text-secondary)] text-sm leading-none opacity-0 group-hover:opacity-100"
                  >
                    ×
                  </span>
                )}
              </button>
            ))}
            {/* Separator */}
            {chatChannels && chatChannels.length > 0 && sessions.length > 0 && (
              <div className="w-px h-4 bg-[var(--terminal-border)] shrink-0 mx-1" />
            )}
            {/* Session tabs */}
            {sessions.map((ses) => (
              <SessionTab
                key={ses.id}
                roleId={ses.roleId}
                title={ses.title}
                roleColor={ROLE_COLORS[ses.roleId] ?? '#666'}
                active={!isViewingChat && ses.id === activeSessionId}
                onClick={() => {
                  onSwitchChatChannel?.(null);
                  onSwitchSession(ses.id);
                }}
                onClose={(e) => { e.stopPropagation(); onCloseSession(ses.id); }}
                data-session-id={ses.id}
              />
            ))}
          </div>
          {/* Right fade */}
          {canScrollRight && (
            <div className="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-[var(--terminal-bg-deeper)] to-transparent z-10 pointer-events-none" />
          )}
        </div>
        {/* New tab button */}
        <div className="relative shrink-0">
          <button
            onClick={() => { setShowNewMenu(!showNewMenu); setShowManageMenu(false); }}
            className="w-7 h-7 flex items-center justify-center text-[var(--terminal-text-muted)] hover:text-[var(--terminal-text-secondary)] text-lg cursor-pointer"
          >
            +
          </button>
          {showNewMenu && (
            <div className="absolute top-full right-0 mt-1 bg-[var(--terminal-surface)] border border-[var(--terminal-border)] rounded-lg shadow-xl z-50 py-1 min-w-[200px]">
              {/* New channel */}
              {onCreateChatChannel && (
                <>
                  {showNewChannelInput ? (
                    <div className="px-3 py-2 flex items-center gap-1">
                      <span className="text-[10px] text-[var(--terminal-text-muted)]">#</span>
                      <input
                        autoFocus
                        value={newChannelName}
                        onChange={(e) => setNewChannelName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && newChannelName.trim()) {
                            onCreateChatChannel(newChannelName.trim(), []);
                            setNewChannelName('');
                            setShowNewChannelInput(false);
                            setShowNewMenu(false);
                          }
                          if (e.key === 'Escape') {
                            setShowNewChannelInput(false);
                            setNewChannelName('');
                          }
                        }}
                        placeholder="channel name"
                        className="flex-1 bg-transparent text-xs text-[var(--terminal-text)] outline-none border-b border-[var(--terminal-border)]"
                      />
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowNewChannelInput(true)}
                      className="w-full text-left px-3 py-2 text-xs text-[var(--terminal-text-secondary)] hover:bg-[var(--terminal-surface-light)] cursor-pointer flex items-center gap-2"
                    >
                      <span className="text-[10px]">💬</span>
                      New Channel
                    </button>
                  )}
                  <div className="border-b border-[var(--terminal-border)] my-1" />
                </>
              )}
              {roles.map((r) => (
                <button
                  key={r.id}
                  onClick={() => { onCreateSession(r.id); onSwitchChatChannel?.(null); setShowNewMenu(false); }}
                  className="w-full text-left px-3 py-2 text-xs text-[var(--terminal-text-secondary)] hover:bg-[var(--terminal-surface-light)] cursor-pointer flex items-center gap-2"
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ background: ROLE_COLORS[r.id] ?? '#666' }}
                  />
                  {r.id.toUpperCase()} — {r.name}
                </button>
              ))}
            </div>
          )}
        </div>
        {/* Session manage menu */}
        <div className="relative shrink-0">
          <button
            onClick={() => { setShowManageMenu(!showManageMenu); setShowNewMenu(false); }}
            className="w-7 h-7 flex items-center justify-center text-[var(--terminal-text-muted)] hover:text-[var(--terminal-text-secondary)] text-xs cursor-pointer tracking-tight"
            title="Manage sessions"
          >
            ···
          </button>
          {showManageMenu && (
            <div className="absolute top-full right-0 mt-1 bg-[var(--terminal-surface)] border border-[var(--terminal-border)] rounded-lg shadow-xl z-50 py-1 min-w-[200px]">
              <div className="px-3 py-1.5 text-[10px] text-[var(--terminal-text-muted)] border-b border-[var(--terminal-border)]">
                {sessions.length} session{sessions.length !== 1 ? 's' : ''}
              </div>
              {emptyCount > 0 && onClearEmpty && (
                <button
                  onClick={() => { onClearEmpty(); setShowManageMenu(false); }}
                  className="w-full text-left px-3 py-2 text-xs text-[var(--terminal-text-secondary)] hover:bg-[var(--terminal-surface-light)] cursor-pointer"
                >
                  Clear empty sessions ({emptyCount})
                </button>
              )}
              {sessions.length > 0 && onCloseAll && (
                <button
                  onClick={() => { onCloseAll(); setShowManageMenu(false); }}
                  className="w-full text-left px-3 py-2 text-xs text-[#E57373] hover:bg-[var(--terminal-surface-light)] cursor-pointer"
                >
                  Close all sessions
                </button>
              )}
              {sessions.length === 0 && (
                <div className="px-3 py-2 text-xs text-[var(--terminal-text-muted)]">
                  No sessions
                </div>
              )}
            </div>
          )}
        </div>
        {/* Close terminal */}
        <button
          onClick={onCloseTerminal}
          className="px-2 py-1 text-[var(--terminal-text-muted)] hover:text-[var(--terminal-text-secondary)] text-sm cursor-pointer shrink-0"
        >
          ×
        </button>
      </div>

      {/* Content area */}
      {isViewingChat && activeChannel ? (
        <OfficeChatView
          channel={activeChannel}
          allRoles={roles}
          onUpdateMembers={onUpdateChatMembers}
          onUpdateTopic={onUpdateChatTopic}
        />
      ) : activeSession ? (
        <>
          <MessageList
            messages={activeSession.messages}
            roleId={activeSession.roleId}
            roleColor={ROLE_COLORS[activeSession.roleId] ?? '#666'}
          />
          <InputBar
            mode={activeSession.mode}
            onModeChange={(mode) => onModeChange(activeSession.id, mode)}
            onSend={(content) => onSendMessage(activeSession.id, content, activeSession.mode)}
            disabled={isStreaming}
            disabledReason={isStreaming ? `${activeSession.roleId.toUpperCase()} is responding...` : undefined}
          />
        </>
      ) : (
        <div className="flex-1 flex items-center justify-center text-[var(--terminal-text-muted)] text-sm">
          No active session. Click [+] to start.
        </div>
      )}
    </div>
  );
}
