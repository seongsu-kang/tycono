/**
 * PanelMode — Wave-scoped team view with right-panel tabs
 *
 * Left:  Wave title + Org Tree (wave-scoped) + Wave tabs
 * Right: [Stream] [Docs] [Info] — tab switching with h/l
 *
 * Navigation:
 *   j/k        — move in Org Tree (auto-selects) or scroll in Docs
 *   h/l        — switch right panel tab
 *   1-9        — switch wave focus
 *   Enter      — Stream: toggle filtered/all | Docs: open in vim
 *   Esc        — return to Command Mode
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { OrgTree } from './OrgTree';
import { StreamView } from './StreamView';
import type { OrgNode } from '../store';
import type { SSEEvent, ActiveSessionInfo, SessionInfo } from '../api';
import type { WaveInfo } from '../hooks/useCommand';

type RightTab = 'stream' | 'docs' | 'info';

interface PanelModeProps {
  tree: OrgNode[];
  flatRoles: string[];
  events: SSEEvent[];
  selectedRoleIndex: number;
  selectedRoleId: string | null;
  streamStatus: 'idle' | 'streaming' | 'done' | 'error';
  waveId: string | null;
  activeSessions: ActiveSessionInfo[];
  allSessions: SessionInfo[];
  waves: WaveInfo[];
  focusedWaveId: string | null;
  onMove: (direction: 'up' | 'down') => void;
  onSelect: () => void;
  onEscape: () => void;
  onFocusWave: (waveId: string) => void;
}

function getWaveScopedStatuses(
  allSessions: SessionInfo[],
  focusedWaveId: string | null,
): Record<string, string> {
  if (!focusedWaveId) return {};
  const statuses: Record<string, string> = {};
  for (const s of allSessions) {
    if (s.waveId !== focusedWaveId) continue;
    if (s.status === 'active') statuses[s.roleId] = 'working';
    else if (!statuses[s.roleId]) statuses[s.roleId] = 'done';
  }
  return statuses;
}

function findSessionForRole(
  activeSessions: ActiveSessionInfo[],
  allSessions: SessionInfo[],
  roleId: string,
  focusedWaveId: string | null,
): ActiveSessionInfo | null {
  if (focusedWaveId) {
    const waveSes = allSessions.find(s => s.waveId === focusedWaveId && s.roleId === roleId && s.status === 'active');
    if (waveSes) return activeSessions.find(s => s.sessionId === waveSes.id) ?? null;
  }
  return activeSessions.find(s => s.roleId === roleId && s.status === 'active') ?? null;
}

function elapsed(startedAt: string): string {
  const ms = Date.now() - new Date(startedAt).getTime();
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s`;
  if (ms < 3600_000) return `${Math.floor(ms / 60_000)}m`;
  return `${Math.floor(ms / 3600_000)}h`;
}

/** Extract files created/modified in this wave from SSE events */
function extractWaveFiles(events: SSEEvent[]): string[] {
  const files = new Set<string>();
  for (const e of events) {
    if (e.type === 'tool:start') {
      const name = (e.data.name as string) ?? '';
      const input = e.data.input as Record<string, unknown> | undefined;
      if (['Write', 'Edit', 'NotebookEdit'].includes(name) && input?.file_path) {
        files.add(String(input.file_path));
      }
    }
  }
  return Array.from(files);
}

/** Read file preview (first N lines) */
function readFilePreview(filePath: string, maxLines: number): string[] {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return content.split('\n').slice(0, maxLines);
  } catch {
    return ['(cannot read file)'];
  }
}

export const PanelMode: React.FC<PanelModeProps> = ({
  tree, flatRoles, events, selectedRoleIndex, selectedRoleId,
  streamStatus, waveId, activeSessions, allSessions, waves,
  focusedWaveId, onMove, onSelect, onEscape, onFocusWave,
}) => {
  const [termHeight, setTermHeight] = useState(process.stdout.rows || 30);
  const [rightTab, setRightTab] = useState<RightTab>('stream');
  const [docsIndex, setDocsIndex] = useState(0);
  const [docsScroll, setDocsScroll] = useState(0);

  useEffect(() => {
    const onResize = () => setTermHeight(process.stdout.rows || 30);
    process.stdout.on('resize', onResize);
    return () => { process.stdout.off('resize', onResize); };
  }, []);

  const separatorStr = useMemo(() => '\u2502\n'.repeat(Math.max(5, termHeight - 8)), [termHeight]);

  const waveScopedStatuses = useMemo(
    () => getWaveScopedStatuses(allSessions, focusedWaveId),
    [allSessions, focusedWaveId],
  );

  const waveScopedTree = useMemo(() => {
    function scopeNode(node: OrgNode): OrgNode {
      return {
        ...node,
        status: waveScopedStatuses[node.role.id] ?? 'idle',
        children: node.children.map(scopeNode),
      };
    }
    return tree.map(scopeNode);
  }, [tree, waveScopedStatuses]);

  // Files created in this wave
  const waveFiles = useMemo(() => extractWaveFiles(events), [events]);

  // File preview for selected doc
  const selectedFile = waveFiles[docsIndex] ?? null;
  const filePreview = useMemo(() => {
    if (!selectedFile || rightTab !== 'docs') return [];
    return readFilePreview(selectedFile, 100);
  }, [selectedFile, rightTab]);

  useInput((input, key) => {
    if (key.escape) { onEscape(); return; }

    // h/l: switch right panel tab
    if (input === 'h' || (key.leftArrow && rightTab !== 'stream')) {
      const tabs: RightTab[] = ['stream', 'docs', 'info'];
      const idx = tabs.indexOf(rightTab);
      if (idx > 0) { setRightTab(tabs[idx - 1]); setDocsScroll(0); }
      return;
    }
    if (input === 'l' || (key.rightArrow && rightTab !== 'info')) {
      const tabs: RightTab[] = ['stream', 'docs', 'info'];
      const idx = tabs.indexOf(rightTab);
      if (idx < tabs.length - 1) { setRightTab(tabs[idx + 1]); setDocsScroll(0); }
      return;
    }

    // j/k: context-dependent
    if (key.upArrow || input === 'k') {
      if (rightTab === 'docs' && docsScroll > 0) {
        setDocsScroll(s => Math.max(0, s - 3));
      } else if (rightTab === 'stream') {
        onMove('up');
      }
      return;
    }
    if (key.downArrow || input === 'j') {
      if (rightTab === 'docs') {
        setDocsScroll(s => s + 3);
      } else if (rightTab === 'stream') {
        onMove('down');
      }
      return;
    }

    // Tab key for cycling docs files
    if (key.tab && rightTab === 'docs') {
      setDocsIndex(i => (i + 1) % Math.max(1, waveFiles.length));
      setDocsScroll(0);
      return;
    }

    // Enter
    if (key.return) {
      if (rightTab === 'docs' && selectedFile) {
        // Open in vim
        const editor = process.env.EDITOR || 'vim';
        try {
          execSync(`${editor} "${selectedFile}"`, { stdio: 'inherit' });
        } catch { /* user quit editor */ }
        return;
      }
      if (rightTab === 'stream') {
        onSelect();
        return;
      }
    }

    // 1-9: wave switch
    const num = parseInt(input, 10);
    if (num >= 1 && num <= 9 && num <= waves.length) {
      onFocusWave(waves[num - 1].waveId);
    }
  });

  // Filter events for selected role
  const roleEvents = selectedRoleId
    ? events.filter((e) => e.roleId === selectedRoleId)
    : events;

  const roleLabel = selectedRoleId
    ? flatRoles.includes(selectedRoleId) ? selectedRoleId : 'All'
    : 'All';

  const selectedSession = selectedRoleId
    ? findSessionForRole(activeSessions, allSessions, selectedRoleId, focusedWaveId)
    : null;

  const focusedWave = waves.find(w => w.waveId === focusedWaveId);
  const focusedWaveIndex = focusedWaveId
    ? waves.findIndex(w => w.waveId === focusedWaveId) + 1
    : 0;

  const waveSessionCount = focusedWaveId
    ? allSessions.filter(s => s.waveId === focusedWaveId).length
    : 0;

  const leftWidth = 28;

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box flexGrow={1}>
        {/* Left: Wave title + Org Tree + Wave tabs */}
        <Box flexDirection="column" width={leftWidth}>
          <Box paddingX={1}>
            <Text color="green" bold>W{focusedWaveIndex}</Text>
            <Text color="gray"> </Text>
            <Text color="white" wrap="truncate">
              {focusedWave?.directive ? focusedWave.directive.slice(0, leftWidth - 6) : '(idle)'}
            </Text>
          </Box>
          {waveSessionCount > 0 && (
            <Box paddingX={1}>
              <Text color="gray">{waveSessionCount} sessions</Text>
            </Box>
          )}

          <OrgTree
            tree={waveScopedTree}
            focused={rightTab === 'stream'}
            selectedIndex={selectedRoleIndex}
            flatRoles={flatRoles}
            ceoStatus={waveScopedStatuses['ceo'] ?? 'idle'}
          />

          {waves.length > 1 && (
            <Box paddingX={1} marginTop={1}>
              {waves.map((w, i) => (
                <Box key={w.waveId} marginRight={1}>
                  <Text
                    color={w.waveId === focusedWaveId ? 'green' : 'gray'}
                    bold={w.waveId === focusedWaveId}
                    inverse={w.waveId === focusedWaveId}
                  >{` ${i + 1} `}</Text>
                </Box>
              ))}
            </Box>
          )}
        </Box>

        {/* Vertical separator */}
        <Box flexDirection="column" marginX={0}>
          <Text color="gray">{separatorStr}</Text>
        </Box>

        {/* Right: Tabbed panel */}
        <Box flexGrow={1} flexDirection="column" overflow="hidden">
          {/* Tab bar */}
          <Box paddingX={1} marginBottom={0}>
            {(['stream', 'docs', 'info'] as RightTab[]).map(tab => (
              <Box key={tab} marginRight={1}>
                <Text
                  color={rightTab === tab ? 'cyan' : 'gray'}
                  bold={rightTab === tab}
                  inverse={rightTab === tab}
                >
                  {` ${tab.charAt(0).toUpperCase() + tab.slice(1)} `}
                </Text>
              </Box>
            ))}
            <Text color="gray" dimColor> [h/l] switch</Text>
          </Box>

          {/* Stream tab */}
          {rightTab === 'stream' && (
            <>
              {selectedRoleId && selectedSession && (
                <Box flexDirection="column" paddingX={1}>
                  <Box justifyContent="space-between">
                    <Text bold color="cyan">{selectedRoleId}</Text>
                    <Text color={selectedSession.status === 'active' ? 'green' : 'gray'}>
                      {selectedSession.status === 'active' ? '\u25CF' : '\u25CB'} {selectedSession.status}
                      {selectedSession.startedAt ? ` (${elapsed(selectedSession.startedAt)})` : ''}
                    </Text>
                  </Box>
                  {selectedSession.ports.api > 0 && (
                    <Text color="gray">Port API:{selectedSession.ports.api} Vite:{selectedSession.ports.vite}</Text>
                  )}
                  <Text color="gray">{'\u2500'.repeat(40)}</Text>
                </Box>
              )}
              {selectedRoleId && !selectedSession && (
                <Box flexDirection="column" paddingX={1}>
                  <Text bold color="cyan">{selectedRoleId}</Text>
                  <Text color="gray">(not active in this wave)</Text>
                  <Text color="gray">{'\u2500'.repeat(40)}</Text>
                </Box>
              )}
              <StreamView
                events={roleEvents}
                allRoleIds={flatRoles}
                streamStatus={streamStatus}
                waveId={waveId}
                roleLabel={roleLabel}
              />
            </>
          )}

          {/* Docs tab */}
          {rightTab === 'docs' && (
            <Box flexDirection="column" paddingX={1} flexGrow={1}>
              {waveFiles.length === 0 ? (
                <Text color="gray">No files created in this wave yet.</Text>
              ) : (
                <>
                  {/* File list */}
                  <Box marginBottom={1}>
                    <Text color="gray">Files ({waveFiles.length}): </Text>
                    {waveFiles.map((f, i) => (
                      <Box key={f} marginRight={1}>
                        <Text
                          color={i === docsIndex ? 'cyan' : 'gray'}
                          bold={i === docsIndex}
                          inverse={i === docsIndex}
                        >
                          {` ${f.split('/').pop()} `}
                        </Text>
                      </Box>
                    ))}
                    <Text color="gray" dimColor> [Tab] next</Text>
                  </Box>

                  {/* File preview */}
                  {selectedFile && (
                    <Box flexDirection="column">
                      <Text color="cyan" bold>{selectedFile.split('/').slice(-2).join('/')}</Text>
                      <Text color="gray">{'\u2500'.repeat(50)}</Text>
                      {filePreview.slice(docsScroll, docsScroll + termHeight - 12).map((line, i) => (
                        <Text key={i} color="white" wrap="wrap">{line}</Text>
                      ))}
                      {filePreview.length > termHeight - 12 && (
                        <Text color="gray" dimColor>
                          {docsScroll > 0 ? '\u2191 ' : ''}j/k scroll | {filePreview.length - docsScroll} lines remaining
                        </Text>
                      )}
                    </Box>
                  )}

                  <Box marginTop={1}>
                    <Text color="gray" dimColor>[Enter] open in {process.env.EDITOR || 'vim'} | [Tab] next file | [j/k] scroll</Text>
                  </Box>
                </>
              )}
            </Box>
          )}

          {/* Info tab */}
          {rightTab === 'info' && (
            <Box flexDirection="column" paddingX={1}>
              <Text bold color="cyan">Wave Info</Text>
              <Text color="gray">{'\u2500'.repeat(40)}</Text>
              <Text color="white">Wave: {focusedWave?.waveId ?? 'none'}</Text>
              <Text color="white">Directive: {focusedWave?.directive || '(idle)'}</Text>
              <Text color="white">Sessions: {waveSessionCount}</Text>
              <Text color="white">Files modified: {waveFiles.length}</Text>
              <Text color="white">SSE events: {events.length}</Text>

              {/* Active sessions in this wave */}
              {waveSessionCount > 0 && (
                <>
                  <Text color="gray" bold>{'\n'}Active in this wave:</Text>
                  {allSessions
                    .filter(s => s.waveId === focusedWaveId && s.status === 'active')
                    .slice(0, 10)
                    .map(s => {
                      const port = activeSessions.find(a => a.sessionId === s.id);
                      return (
                        <Text key={s.id} color="white">
                          {`  ${s.roleId.padEnd(12)} ${s.id.slice(0, 20)} ${port ? `API:${port.ports.api}` : ''}`}
                        </Text>
                      );
                    })
                  }
                </>
              )}
            </Box>
          )}
        </Box>
      </Box>

      {/* Footer */}
      <Box width="100%">
        <Text color="gray">{'\u2500'.repeat(process.stdout.columns || 70)}</Text>
      </Box>
      <Box paddingX={1} justifyContent="center">
        <Text color="gray" dimColor>
          [h/l] tab  [j/k] {rightTab === 'stream' ? 'role' : 'scroll'}  {rightTab === 'docs' ? '[Enter] vim  ' : ''}
          {waves.length > 1 ? '[1-9] wave  ' : ''}[Esc] command
        </Text>
      </Box>
    </Box>
  );
};
