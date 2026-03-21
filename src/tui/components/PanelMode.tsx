/**
 * PanelMode — Wave-scoped team view (text-based render)
 *
 * ⛔ yoga-layout OOMs on 245+ column terminals with nested Box.
 * Solution: flat <Text> elements only, no Box nesting beyond 1 level.
 * Layout is string-based with manual padding.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
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
  companyRoot: string;
  waves: WaveInfo[];
  focusedWaveId: string | null;
  onMove: (direction: 'up' | 'down') => void;
  onSelect: () => void;
  onEscape: () => void;
  onFocusWave: (waveId: string) => void;
}

/* ─── Helpers ─── */

function getWaveScopedStatuses(sessions: SessionInfo[], waveId: string | null): Record<string, string> {
  if (!waveId) return {};
  const s: Record<string, string> = {};
  for (const ses of sessions) {
    if (ses.waveId !== waveId) continue;
    if (ses.status === 'active') s[ses.roleId] = 'working';
    else if (!s[ses.roleId]) s[ses.roleId] = 'done';
  }
  return s;
}

function flattenTree(nodes: OrgNode[], isLast: boolean[] = []): Array<{ roleId: string; status: string; line: string }> {
  const result: Array<{ roleId: string; status: string; line: string }> = [];
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const last = i === nodes.length - 1;
    let prefix = '';
    for (const l of isLast) prefix += l ? '   ' : '\u2502  ';
    prefix += last ? '\u2514\u2500 ' : '\u251C\u2500 ';
    const icon = node.status === 'working' ? '\u25CF' : node.status === 'done' ? '\u2713' : '\u25CB';
    result.push({ roleId: node.role.id, status: node.status, line: `${prefix}${icon} ${node.role.id}` });
    if (node.children.length > 0) result.push(...flattenTree(node.children, [...isLast, last]));
  }
  return result;
}

function eventLine(ev: SSEEvent): string | null {
  let t: string;
  try { t = new Date(ev.ts).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
  catch { t = '--:--:--'; }
  const r = (ev.roleId ?? '').padEnd(12);
  switch (ev.type) {
    case 'text': { const x = ((ev.data.text as string) ?? '').replace(/\n/g, ' ').trim(); return x ? `${t} ${r} ${x.slice(0, 120)}` : null; }
    case 'thinking': { const x = ((ev.data.text as string) ?? '').replace(/\n/g, ' ').trim(); return x ? `${t} ${r} \uD83D\uDCAD ${x.slice(0, 80)}` : null; }
    case 'tool:start': { const n = (ev.data.name as string) ?? ''; const d = ev.data.input ? (((ev.data.input as any).file_path || (ev.data.input as any).command || (ev.data.input as any).pattern || '') as string).slice(0, 50) : ''; return `${t} ${r} \u2192 ${n} ${d}`; }
    case 'tool:result': return `${t} ${r} \u2190 ${(ev.data.name as string) ?? ''} done`;
    case 'msg:start': return `${t} ${r} \u25B6 Started`;
    case 'msg:done': { const turns = ev.data.turns as number | undefined; return `${t} ${r} \u2713 Done${turns ? ` (${turns} turns)` : ''}`; }
    case 'msg:error': return `${t} ${r} \u2717 ${((ev.data.error ?? ev.data.message) as string ?? '').slice(0, 60)}`;
    case 'dispatch:start': return `${t} ${r} \u21D2 dispatch ${ev.data.targetRole as string ?? ''}`;
    case 'msg:awaiting_input': return `${t} ${r} ? awaiting input`;
    default: return null;
  }
}

/* ─── Component ─── */

const PanelModeInner: React.FC<PanelModeProps> = ({
  tree, flatRoles, events, selectedRoleIndex, selectedRoleId,
  streamStatus, waveId, activeSessions, allSessions, companyRoot, waves,
  focusedWaveId, onMove, onSelect, onEscape, onFocusWave,
}) => {
  const [termHeight, setTermHeight] = useState(process.stdout.rows || 30);
  const [rightTab, setRightTab] = useState<RightTab>('stream');
  const [docsIndex, setDocsIndex] = useState(0);

  useEffect(() => {
    const fn = () => setTermHeight(process.stdout.rows || 30);
    process.stdout.on('resize', fn);
    return () => { process.stdout.off('resize', fn); };
  }, []);

  const statuses = useMemo(() => getWaveScopedStatuses(allSessions, focusedWaveId), [allSessions, focusedWaveId]);
  const scopedTree = useMemo(() => {
    const scope = (n: OrgNode): OrgNode => ({ ...n, status: statuses[n.role.id] ?? 'idle', children: n.children.map(scope) });
    return tree.map(scope);
  }, [tree, statuses]);

  const focusedWave = waves.find(w => w.waveId === focusedWaveId);
  const focusedWaveIndex = focusedWaveId ? waves.findIndex(w => w.waveId === focusedWaveId) + 1 : 0;
  const waveSessionCount = focusedWaveId ? allSessions.filter(s => s.waveId === focusedWaveId).length : 0;

  // Key handling
  useInput((input, key) => {
    if (key.escape) { onEscape(); return; }
    if (input === 'h' || key.leftArrow) {
      const tabs: RightTab[] = ['stream', 'docs', 'info'];
      const idx = tabs.indexOf(rightTab);
      if (idx > 0) setRightTab(tabs[idx - 1]);
      return;
    }
    if (input === 'l' || key.rightArrow) {
      const tabs: RightTab[] = ['stream', 'docs', 'info'];
      const idx = tabs.indexOf(rightTab);
      if (idx < tabs.length - 1) setRightTab(tabs[idx + 1]);
      return;
    }
    // j/k context-dependent
    if (input === 'k' || key.upArrow) {
      if (rightTab === 'docs') { setDocsIndex(i => Math.max(0, i - 1)); }
      else { onMove('up'); }
      return;
    }
    if (input === 'j' || key.downArrow) {
      if (rightTab === 'docs') { setDocsIndex(i => i + 1); } // capped later by docsList length
      else { onMove('down'); }
      return;
    }
    if (key.return) {
      if (rightTab === 'docs' && selectedDocPath) {
        try {
          const editor = process.env.EDITOR || 'vim';
          execSync(`${editor} "${selectedDocPath}"`, { stdio: 'inherit' });
        } catch { /* ignore */ }
      } else {
        onSelect();
      }
      return;
    }
    // Wave switch 1-9
    const num = parseInt(input, 10);
    if (num >= 1 && num <= 9 && num <= waves.length) {
      onFocusWave(waves[num - 1].waveId);
    }
  });

  const leftWidth = 28;
  const termCols = process.stdout.columns || 120;
  const rightWidth = termCols - leftWidth - 3;
  const headerLines = 2;
  const footerLines = 3;
  const contentHeight = Math.max(termHeight - headerLines - footerLines, 5);

  // === Build left column: OrgTree ===
  const ceoIcon = statuses['ceo'] === 'working' ? '\u25CF' : statuses['ceo'] === 'done' ? '\u2713' : '\u25CB';
  const isCeoSelected = flatRoles[selectedRoleIndex] === 'ceo';
  const treeEntries = flattenTree(scopedTree);

  const leftLines: Array<{ text: string; selected: boolean; working: boolean }> = [
    { text: `${ceoIcon} CEO`, selected: isCeoSelected, working: statuses['ceo'] === 'working' },
    ...treeEntries.map(e => ({
      text: e.line,
      selected: e.roleId === flatRoles[selectedRoleIndex],
      working: e.status === 'working',
    })),
  ];

  // Derive selectedRoleId from index (more reliable than prop — avoids sync issues)
  const activeRoleId = flatRoles[selectedRoleIndex] ?? null;

  // === Build right column: Stream/Info/Docs ===
  const rightContentLines: string[] = [];
  let selectedDocPath: string | null = null;
  if (rightTab === 'stream') {
    if (activeRoleId) rightContentLines.push(`\u25B8 ${activeRoleId}`);
    const maxEv = Math.max(5, contentHeight - 3);
    const filtered = activeRoleId ? events.filter(e => e.roleId === activeRoleId) : events;
    const visible = filtered.slice(-maxEv);
    for (const ev of visible) {
      const line = eventLine(ev);
      if (line) rightContentLines.push(line.slice(0, rightWidth));
    }
    if (rightContentLines.length === 0) {
      if (activeRoleId && events.length > 0) {
        rightContentLines.push(`No events for ${activeRoleId} (${events.length} total)`);
        rightContentLines.push('Press Enter to show all roles');
      } else {
        rightContentLines.push(waveId ? `Waiting for events... (${events.length} in buffer)` : 'No active stream. Type a directive to start.');
      }
    }
  } else if (rightTab === 'info') {
    rightContentLines.push(`Wave: ${focusedWave?.waveId ?? 'none'}`);
    rightContentLines.push(`Directive: ${focusedWave?.directive?.slice(0, rightWidth - 12) || '(idle)'}`);
    rightContentLines.push(`Sessions: ${waveSessionCount}  Events: ${events.length}`);
    rightContentLines.push(`Stream: ${streamStatus}`);
  } else if (rightTab === 'docs') {
    // Docs: scan .md files with j/k scroll + Enter to open
    try {
      const skip = new Set(['.git', 'node_modules', '.tycono', '.worktrees', 'dist', '.claude', '.obsidian']);
      const mdFiles: string[] = [];
      const mdPaths: string[] = []; // full paths for vim
      const walk = (dir: string, depth: number) => {
        if (depth > 3 || mdFiles.length > 200) return;
        try {
          for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            if (skip.has(e.name)) continue;
            const full = path.join(dir, e.name);
            if (e.isDirectory()) walk(full, depth + 1);
            else if (e.name.endsWith('.md')) {
              mdFiles.push(full.replace(companyRoot + '/', ''));
              mdPaths.push(full);
            }
          }
        } catch {}
      };
      walk(companyRoot, 0);
      mdFiles.sort();
      mdPaths.sort();
      // Cap docsIndex
      const cappedIdx = Math.min(docsIndex, mdFiles.length - 1);
      if (cappedIdx !== docsIndex) setDocsIndex(Math.max(0, cappedIdx));
      selectedDocPath = mdPaths[cappedIdx] ?? null;

      const maxVisible = Math.max(5, termHeight - 12);
      const scrollStart = Math.max(0, Math.min(cappedIdx - 3, mdFiles.length - maxVisible));
      rightContentLines.push(`${mdFiles.length} documents  [j/k] browse  [Enter] ${process.env.EDITOR || 'vim'}`);
      for (let i = scrollStart; i < Math.min(scrollStart + maxVisible, mdFiles.length); i++) {
        const selected = i === cappedIdx;
        const prefix = selected ? '\u25B6 ' : '  ';
        rightContentLines.push(`${prefix}${mdFiles[i].slice(0, rightWidth - 4)}`);
      }
    } catch {
      rightContentLines.push('Cannot scan documents');
    }
  }

  // === Merge left + right, cap to terminal height ===
  const maxRows = contentHeight;

  const rows: Array<{ left: string; right: string; leftSelected: boolean; leftWorking: boolean }> = [];
  for (let i = 0; i < maxRows; i++) {
    const ll = leftLines[i];
    rows.push({
      left: (ll?.text ?? '').padEnd(leftWidth).slice(0, leftWidth),
      right: rightContentLines[i] ?? '',
      leftSelected: ll?.selected ?? false,
      leftWorking: ll?.working ?? false,
    });
  }

  // Tab bar
  const tabBar = ['Stream', 'Docs', 'Info'].map(t =>
    t.toLowerCase() === rightTab ? `[${t}]` : ` ${t} `
  ).join('  ');

  // Wave tabs
  const waveTabs = waves.length > 1
    ? waves.map((w, i) => w.waveId === focusedWaveId ? `[${i + 1}]` : ` ${i + 1} `).join(' ')
    : '';

  const sep = '\u2500'.repeat(Math.min(termCols, 160));
  const statusLabel = streamStatus === 'streaming' ? '\u25CF streaming' : streamStatus === 'done' ? '\u2713 done' : 'idle';

  return (
    <Box flexDirection="column">
      {/* Header */}
      <Text>
        <Text color="green" bold>{'W' + focusedWaveIndex}</Text>
        <Text color="white">{' ' + (focusedWave?.directive?.slice(0, 40) || '(idle)')}</Text>
        <Text color="gray">{'  \u2502  '}</Text>
        <Text color="cyan" bold>{tabBar}</Text>
        <Text color="gray">{'  ' + (waveSessionCount > 0 ? waveSessionCount + ' sessions' : '') + '  '}</Text>
        <Text color={streamStatus === 'streaming' ? 'green' : 'gray'}>{statusLabel}</Text>
      </Text>
      <Text color="gray">{sep}</Text>

      {/* Content rows: left (OrgTree) │ right (Stream/Info) */}
      {rows.map((row, i) => (
        <Text key={i}>
          <Text color={row.leftSelected ? 'cyan' : row.leftWorking ? 'green' : 'white'} bold={row.leftSelected} inverse={row.leftSelected}>{row.left}</Text>
          <Text color="gray">{' \u2502 '}</Text>
          <Text color="white">{row.right}</Text>
        </Text>
      ))}

      {/* Footer */}
      <Text color="gray">{sep}</Text>
      <Text>
        {waveTabs ? <Text color="gray">{waveTabs + '  '}</Text> : null}
        <Text color="gray" dimColor>{rightTab === 'docs' ? '[h/l] tab  [j/k] browse  [Enter] open  ' : '[h/l] tab  [j/k] role  [Enter] filter  '}</Text>
        {waves.length > 1 ? <Text color="gray" dimColor>{'[1-9] wave  '}</Text> : null}
        <Text color="gray" dimColor>{'[Esc] back'}</Text>
      </Text>
    </Box>
  );
};

export const PanelMode = React.memo(PanelModeInner);
