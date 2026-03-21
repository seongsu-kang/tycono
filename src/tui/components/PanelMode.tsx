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
import path from 'node:path';
import type { SSEEvent, ActiveSessionInfo, SessionInfo } from '../api';
import type { WaveInfo } from '../hooks/useCommand';

type RightTab = 'stream' | 'docs' | 'info';
type DocsFilter = 'all' | 'wave' | 'kb' | 'projects';

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
  companyRoot: string;
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

/** Scan COMPANY_ROOT for .md files (cached) */
let mdFileCache: { root: string; files: string[] } | null = null;
function scanMdFiles(companyRoot: string): string[] {
  if (mdFileCache && mdFileCache.root === companyRoot) return mdFileCache.files;
  const results: string[] = [];
  const skip = new Set(['.git', 'node_modules', '.tycono', '.worktrees', 'dist', '.claude']);
  function walk(dir: string, depth: number) {
    if (depth > 3) return; // Don't go too deep
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (skip.has(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full, depth + 1);
        } else if (entry.name.endsWith('.md')) {
          results.push(full);
        }
      }
    } catch { /* permission error etc */ }
  }
  walk(companyRoot, 0);
  mdFileCache = { root: companyRoot, files: results };
  return results;
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

/** Read file preview (first N lines, cached) */
const fileCache = new Map<string, string[]>();
function readFilePreview(filePath: string, maxLines: number): string[] {
  const cached = fileCache.get(filePath);
  if (cached) return cached;
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').slice(0, maxLines);
    fileCache.set(filePath, lines);
    // Evict old entries
    if (fileCache.size > 5) {
      const first = fileCache.keys().next().value;
      if (first) fileCache.delete(first);
    }
    return lines;
  } catch {
    return ['(cannot read file)'];
  }
}

export const PanelMode: React.FC<PanelModeProps> = React.memo(({
  tree, flatRoles, events, selectedRoleIndex, selectedRoleId,
  streamStatus, waveId, activeSessions, allSessions, companyRoot, waves,
  focusedWaveId, onMove, onSelect, onEscape, onFocusWave,
}) => {
  const [termHeight, setTermHeight] = useState(process.stdout.rows || 30);
  const [rightTab, setRightTab] = useState<RightTab>('stream');
  const [docsFilter, setDocsFilter] = useState<DocsFilter>('all');
  const [docsIndex, setDocsIndex] = useState(0);
  const [docsScroll, setDocsScroll] = useState(0);

  useEffect(() => {
    const onResize = () => setTermHeight(process.stdout.rows || 30);
    process.stdout.on('resize', onResize);
    return () => { process.stdout.off('resize', onResize); };
  }, []);

  // OOM fix: single separator character instead of repeated newlines
  // Previous: '│\n'.repeat(30) created 30 yoga nodes → layout explosion on large terminals
  const separatorStr = '\u2502';

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

  // Wave files (from SSE events) — only compute when needed
  const waveFileSet = useMemo(() => {
    if (rightTab !== 'docs' && rightTab !== 'info') return new Set<string>();
    return new Set(extractWaveFiles(events));
  }, [rightTab === 'docs' || rightTab === 'info' ? events.length : 0, rightTab]);

  // Build docs list from filesystem scan + wave files
  const docsList = useMemo(() => {
    if (rightTab !== 'docs') return [];

    interface DocEntry { path: string; title: string; isWave: boolean; }
    const entries: DocEntry[] = [];

    // Scan all .md files from COMPANY_ROOT
    const allMdFiles = companyRoot ? scanMdFiles(companyRoot) : [];

    for (const filePath of allMdFiles) {
      const rel = filePath.replace(companyRoot + '/', '');
      const isWave = waveFileSet.has(filePath);
      const isKb = rel.startsWith('knowledge/');
      const isProject = rel.startsWith('projects/');

      if (docsFilter === 'wave' && !isWave) continue;
      if (docsFilter === 'kb' && !isKb) continue;
      if (docsFilter === 'projects' && !isProject) continue;

      entries.push({ path: filePath, title: rel, isWave });
    }

    // Wave-only files not already in list (e.g. code files written by agents)
    for (const f of waveFileSet) {
      if (!entries.some(e => e.path === f)) {
        if (docsFilter === 'kb' || docsFilter === 'projects') continue;
        entries.push({ path: f, title: f.split('/').pop() || f, isWave: true });
      }
    }

    // Sort: wave files first, then alphabetical
    entries.sort((a, b) => {
      if (a.isWave && !b.isWave) return -1;
      if (!a.isWave && b.isWave) return 1;
      return a.title.localeCompare(b.title);
    });

    return entries;
  }, [rightTab, docsFilter, companyRoot, waveFileSet]);

  const selectedDoc = docsList[docsIndex] ?? null;
  const filePreview = useMemo(() => {
    if (!selectedDoc || rightTab !== 'docs') return [];
    return readFilePreview(selectedDoc.path, 60);
  }, [selectedDoc?.path, rightTab]);

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
      if (rightTab === 'docs') {
        if (docsScroll > 0) {
          setDocsScroll(s => Math.max(0, s - 3));
        } else {
          setDocsIndex(i => Math.max(0, i - 1));
        }
      } else if (rightTab === 'stream') {
        onMove('up');
      }
      return;
    }
    if (key.downArrow || input === 'j') {
      if (rightTab === 'docs') {
        if (docsScroll > 0) {
          setDocsScroll(s => s + 3);
        } else {
          setDocsIndex(i => Math.min(docsList.length - 1, i + 1));
        }
      } else if (rightTab === 'stream') {
        onMove('down');
      }
      return;
    }

    // Docs filter: 1-4
    if (rightTab === 'docs') {
      const filters: DocsFilter[] = ['all', 'wave', 'kb', 'projects'];
      const fi = parseInt(input, 10);
      if (fi >= 1 && fi <= 4) {
        setDocsFilter(filters[fi - 1]);
        setDocsIndex(0);
        setDocsScroll(0);
        return;
      }
    }

    // Tab key for cycling docs files
    if (key.tab && rightTab === 'docs') {
      setDocsIndex(i => (i + 1) % Math.max(1, docsList.length));
      setDocsScroll(0);
      return;
    }

    // Enter
    if (key.return) {
      if (rightTab === 'docs' && selectedDoc) {
        const editor = process.env.EDITOR || 'vim';
        try {
          execSync(`${editor} "${selectedDoc.path}"`, { stdio: 'inherit' });
        } catch { /* user quit editor */ }
        fileCache.delete(selectedDoc.path); // Invalidate cache after edit
        return;
      }
      if (rightTab === 'stream') {
        onSelect();
        return;
      }
    }

    // 1-9: wave switch (only in stream/info tabs — docs uses 1-4 for filters)
    if (rightTab !== 'docs') {
      const num = parseInt(input, 10);
      if (num >= 1 && num <= 9 && num <= waves.length) {
        onFocusWave(waves[num - 1].waveId);
      }
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

        {/* Vertical separator — single character, not repeated newlines */}
        <Text color="gray">{separatorStr}</Text>

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

          {/* Docs tab — KB browser + wave artifacts */}
          {rightTab === 'docs' && (
            <Box flexDirection="column" paddingX={1} flexGrow={1}>
              {/* Filter bar */}
              <Box marginBottom={0}>
                {(['all', 'wave', 'kb', 'projects'] as DocsFilter[]).map((f, i) => (
                  <Box key={f} marginRight={1}>
                    <Text
                      color={docsFilter === f ? 'cyan' : 'gray'}
                      bold={docsFilter === f}
                      inverse={docsFilter === f}
                    >
                      {f === 'wave' ? ` ${i + 1}:\u2605Wave ` : ` ${i + 1}:${f.charAt(0).toUpperCase() + f.slice(1)} `}
                    </Text>
                  </Box>
                ))}
                <Text color="gray" dimColor> ({docsList.length})</Text>
              </Box>

              {docsList.length === 0 ? (
                <Box marginTop={1}>
                  <Text color="gray">{docsFilter === 'wave' ? 'No files created in this wave.' : 'No documents found.'}</Text>
                </Box>
              ) : (
                <Box flexGrow={1} flexDirection="column">
                  {docsScroll === 0 ? (
                    /* File list — only render visible window (prevent Yoga OOM on 600+ files) */
                    <Box flexDirection="column" marginTop={0}>
                      <Text color="gray" dimColor>{docsList.length} files{docsIndex > 0 ? ` (${docsIndex + 1}/${docsList.length})` : ''}</Text>
                      {docsList.slice(docsIndex, docsIndex + termHeight - 10).map((doc, i) => (
                        <Box key={doc.path}>
                          <Text
                            color={i === 0 ? 'cyan' : doc.isWave ? 'green' : 'white'}
                            bold={i === 0}
                            inverse={i === 0}
                          >
                            {doc.isWave ? '\u2605' : ' '} {doc.title.slice(0, 55)}
                          </Text>
                        </Box>
                      ))}
                    </Box>
                  ) : (
                    /* File preview */
                    <Box flexDirection="column">
                      <Text color="cyan" bold>{selectedDoc?.isWave ? '\u2605 ' : ''}{selectedDoc?.path.split('/').slice(-2).join('/')}</Text>
                      <Text color="gray">{'\u2500'.repeat(50)}</Text>
                      {filePreview.slice(docsScroll - 1, docsScroll - 1 + termHeight - 10).map((line, i) => (
                        <Text key={i} color="white" wrap="wrap">{line}</Text>
                      ))}
                    </Box>
                  )}

                  <Box marginTop={0}>
                    <Text color="gray" dimColor>
                      [Enter] {process.env.EDITOR || 'vim'} | [j/k] {docsScroll > 0 ? 'scroll' : 'select'}
                    </Text>
                  </Box>
                </Box>
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
              <Text color="white">Files modified: {waveFileSet.size}</Text>
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
}));
