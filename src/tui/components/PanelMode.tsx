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

function flattenTreeForText(nodes: OrgNode[], isLast: boolean[] = []): string[] {
  const lines: string[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const last = i === nodes.length - 1;
    let prefix = '';
    for (const l of isLast) prefix += l ? '   ' : '\u2502  ';
    prefix += last ? '\u2514\u2500 ' : '\u251C\u2500 ';
    const icon = node.status === 'working' ? '\u25CF' : node.status === 'done' ? '\u2713' : '\u25CB';
    lines.push(`${prefix}${icon} ${node.role.id}`);
    if (node.children.length > 0) lines.push(...flattenTreeForText(node.children, [...isLast, last]));
  }
  return lines;
}

function eventToOneLiner(event: SSEEvent): string | null {
  const time = new Date(event.ts).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const role = event.roleId.padEnd(12);
  switch (event.type) {
    case 'text': { const t = ((event.data.text as string) ?? '').trim(); return t ? `${time} ${role} ${t.slice(0, 100)}` : null; }
    case 'thinking': { const t = ((event.data.text as string) ?? '').trim(); return t ? `${time} ${role} \uD83D\uDCAD ${t.slice(0, 80)}` : null; }
    case 'tool:start': { const n = (event.data.name as string) ?? ''; return `${time} ${role} \u2192 ${n}`; }
    case 'msg:start': return `${time} ${role} \u25B6 Started`;
    case 'msg:done': return `${time} ${role} \u2713 Done`;
    case 'msg:error': return `${time} ${role} \u2717 Error`;
    case 'dispatch:start': return `${time} ${role} \u21D2 ${event.data.targetRole as string ?? ''}`;
    default: return null;
  }
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

const PanelModeInner: React.FC<PanelModeProps> = ({
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

  // Read preset from wave file on disk
  const wavePreset = useMemo(() => {
    if (!focusedWaveId || !companyRoot) return null;
    try {
      const wavePath = path.join(companyRoot, 'operations', 'waves', `${focusedWaveId}.json`);
      if (fs.existsSync(wavePath)) {
        const data = JSON.parse(fs.readFileSync(wavePath, 'utf-8'));
        return data.preset as string | undefined;
      }
    } catch { /* ignore */ }
    return null;
  }, [focusedWaveId, companyRoot]);

  const leftWidth = 28;
  const termCols = process.stdout.columns || 120;
  const rightWidth = Math.max(40, termCols - leftWidth - 3);

  // === Build panel as line arrays, render each line as <Text> ===
  // yoga-layout OOMs with nested Box on 245+ columns.
  // Solution: flat list of <Text> elements (1 yoga node per line, no nesting)

  // Left: OrgTree
  const ceoIcon = waveScopedStatuses['ceo'] === 'working' ? '\u25CF' : waveScopedStatuses['ceo'] === 'done' ? '\u2713' : '\u25CB';
  const treeLines = [`${ceoIcon} CEO`, ...flattenTreeForText(waveScopedTree)];

  // Right: Stream/Info content
  const rightLines: string[] = [];
  if (rightTab === 'stream') {
    const maxEv = Math.min(termHeight - 8, 20);
    const visible = (selectedRoleId ? events.filter(e => e.roleId === selectedRoleId) : events).slice(-maxEv);
    for (const ev of visible) {
      const line = eventToOneLiner(ev);
      if (line) rightLines.push(line.slice(0, rightWidth));
    }
    if (rightLines.length === 0) rightLines.push(waveId ? `Waiting... (${events.length} events, waveId=${waveId?.slice(-8)})` : 'No active stream.');
  } else if (rightTab === 'info') {
    rightLines.push(`Wave: ${focusedWave?.waveId ?? 'none'}`);
    if (wavePreset) rightLines.push(`Preset: ${wavePreset}`);
    rightLines.push(`Directive: ${focusedWave?.directive?.slice(0, 60) || '(idle)'}`);
    rightLines.push(`Sessions: ${waveSessionCount}  Events: ${events.length}`);
  } else {
    rightLines.push('Docs tab (h/l to switch)');
  }

  // Merge into display lines
  const maxRows = Math.max(treeLines.length, rightLines.length);
  const mergedLines: Array<{ left: string; right: string }> = [];
  for (let i = 0; i < maxRows; i++) {
    mergedLines.push({
      left: (treeLines[i] ?? '').padEnd(leftWidth).slice(0, leftWidth),
      right: (rightLines[i] ?? ''),
    });
  }

  // Tab bar
  const tabLabels = ['Stream', 'Docs', 'Info'];
  const tabBar = tabLabels.map(t => t.toLowerCase() === rightTab ? `[${t}]` : ` ${t} `).join('  ');

  // Wave tabs
  const waveTabs = waves.length > 1
    ? waves.map((w, i) => w.waveId === focusedWaveId ? `[${i + 1}]` : ` ${i + 1} `).join(' ')
    : '';

  // Separator line
  const sep = '\u2500'.repeat(termCols);

  return (
    <Box flexDirection="column">
      {/* Header: wave title │ tabs */}
      <Text>
        <Text color="green" bold>{'W' + focusedWaveIndex}</Text>
        <Text color="white">{' ' + (focusedWave?.directive?.slice(0, 40) || '(idle)')}</Text>
        <Text color="gray">{'  \u2502  '}</Text>
        <Text color="cyan" bold>{tabBar}</Text>
        <Text color="gray">{'  ' + (waveSessionCount > 0 ? waveSessionCount + ' sessions' : '')}</Text>
      </Text>
      <Text color="gray">{sep}</Text>

      {/* Merged: OrgTree (left) │ Stream (right) */}
      {mergedLines.map((line, i) => (
        <Text key={i}>
          <Text color={line.left.includes('\u25CF') ? 'green' : line.left.includes('\u2713') ? 'cyan' : 'white'}>{line.left}</Text>
          <Text color="gray">{' \u2502 '}</Text>
          <Text color="white">{line.right}</Text>
        </Text>
      ))}

      {/* Separator + wave tabs + footer */}
      <Text color="gray">{sep}</Text>
      {waveTabs ? (
        <Text>
          <Text color="gray">{waveTabs + '  '}</Text>
          <Text color="gray" dimColor>{'[h/l] tab  [j/k] role  [1-9] wave  [Esc] back'}</Text>
        </Text>
      ) : (
        <Text color="gray" dimColor>{'[h/l] tab  [j/k] role  [Esc] back'}</Text>
      )}
    </Box>
  );
};

export const PanelMode = React.memo(PanelModeInner);
