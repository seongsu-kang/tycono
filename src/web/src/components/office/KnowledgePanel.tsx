import { useState, useEffect, useRef } from 'react';
import type { KnowledgeDoc, KnowledgeDocDetail } from '../../types';
import { api } from '../../api/client';
import OfficeMarkdown from './OfficeMarkdown';

/* ─── Domain color mapping ─────────────────────────── */

const DOMAIN_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  tech:       { bg: '#dbeafe', border: '#3b82f6', text: '#1d4ed8' },
  market:     { bg: '#fef3c7', border: '#f59e0b', text: '#92400e' },
  strategy:   { bg: '#ede9fe', border: '#8b5cf6', text: '#5b21b6' },
  financial:  { bg: '#dcfce7', border: '#22c55e', text: '#15803d' },
  process:    { bg: '#fce7f3', border: '#ec4899', text: '#9d174d' },
  competitor: { bg: '#fee2e2', border: '#ef4444', text: '#991b1b' },
  domain:     { bg: '#e0f2fe', border: '#0ea5e9', text: '#0369a1' },
  general:    { bg: '#f1f5f9', border: '#94a3b8', text: '#475569' },
};

function getDomainColor(cat: string) {
  return DOMAIN_COLORS[cat] ?? DOMAIN_COLORS.general;
}

/* ─── Graph View ────────────────────────────────────── */

interface GraphNode {
  id: string;
  title: string;
  category: string;
  akb_type: 'hub' | 'node';
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface GraphEdge {
  source: string;
  target: string;
}

function buildGraph(docs: KnowledgeDoc[]): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const idSet = new Set(docs.map((d) => d.id));
  const nodes: GraphNode[] = docs.map((d, i) => ({
    id: d.id,
    title: d.title,
    category: d.category,
    akb_type: d.akb_type,
    x: 80 + (i % 8) * 90 + Math.random() * 20,
    y: 60 + Math.floor(i / 8) * 80 + Math.random() * 20,
    vx: 0,
    vy: 0,
  }));

  const edges: GraphEdge[] = [];
  for (const doc of docs) {
    for (const link of doc.links) {
      const targetId = link.href.replace(/^.*knowledge\//, '').replace(/^\.\.\//, '');
      if (idSet.has(targetId) && targetId !== doc.id) {
        edges.push({ source: doc.id, target: targetId });
      }
    }
  }
  return { nodes, edges };
}

function KnowledgeGraph({ docs, onNodeClick }: { docs: KnowledgeDoc[]; onNodeClick: (doc: KnowledgeDoc) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<GraphNode[]>([]);
  const edgesRef = useRef<GraphEdge[]>([]);
  const animFrameRef = useRef<number>(0);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; doc: KnowledgeDoc } | null>(null);

  useEffect(() => {
    const { nodes, edges } = buildGraph(docs);
    nodesRef.current = nodes;
    edgesRef.current = edges;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;

    // Force-directed layout simulation
    function simulate() {
      const ns = nodesRef.current;
      const es = edgesRef.current;
      const k = Math.sqrt((W * H) / Math.max(ns.length, 1));

      for (let iter = 0; iter < 150; iter++) {
        // Repulsion
        for (let i = 0; i < ns.length; i++) {
          ns[i].vx = 0;
          ns[i].vy = 0;
          for (let j = 0; j < ns.length; j++) {
            if (i === j) continue;
            const dx = ns[i].x - ns[j].x;
            const dy = ns[i].y - ns[j].y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
            const force = (k * k) / dist;
            ns[i].vx += (dx / dist) * force * 0.1;
            ns[i].vy += (dy / dist) * force * 0.1;
          }
        }
        // Attraction (edges)
        for (const e of es) {
          const si = ns.findIndex((n) => n.id === e.source);
          const ti = ns.findIndex((n) => n.id === e.target);
          if (si < 0 || ti < 0) continue;
          const dx = ns[ti].x - ns[si].x;
          const dy = ns[ti].y - ns[si].y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
          const force = (dist * dist) / k * 0.05;
          ns[si].vx += (dx / dist) * force;
          ns[si].vy += (dy / dist) * force;
          ns[ti].vx -= (dx / dist) * force;
          ns[ti].vy -= (dy / dist) * force;
        }
        // Update positions
        for (const n of ns) {
          const speed = Math.sqrt(n.vx * n.vx + n.vy * n.vy);
          const maxSpeed = 5;
          if (speed > maxSpeed) { n.vx = (n.vx / speed) * maxSpeed; n.vy = (n.vy / speed) * maxSpeed; }
          n.x = Math.max(20, Math.min(W - 20, n.x + n.vx));
          n.y = Math.max(20, Math.min(H - 20, n.y + n.vy));
        }
      }
    }

    simulate();

    function draw() {
      const ns = nodesRef.current;
      const es = edgesRef.current;
      ctx!.clearRect(0, 0, W, H);

      // Background
      ctx!.fillStyle = '#1e1e2e';
      ctx!.fillRect(0, 0, W, H);

      // Grid dots
      ctx!.fillStyle = 'rgba(255,255,255,0.04)';
      for (let gx = 0; gx < W; gx += 20) {
        for (let gy = 0; gy < H; gy += 20) {
          ctx!.fillRect(gx, gy, 1, 1);
        }
      }

      // Edges
      for (const e of es) {
        const src = ns.find((n) => n.id === e.source);
        const tgt = ns.find((n) => n.id === e.target);
        if (!src || !tgt) continue;
        ctx!.strokeStyle = 'rgba(148,163,184,0.25)';
        ctx!.lineWidth = 1;
        ctx!.setLineDash([2, 3]);
        ctx!.beginPath();
        ctx!.moveTo(src.x, src.y);
        ctx!.lineTo(tgt.x, tgt.y);
        ctx!.stroke();
        ctx!.setLineDash([]);
      }

      // Nodes
      for (const n of ns) {
        const color = DOMAIN_COLORS[n.category] ?? DOMAIN_COLORS.general;
        const size = n.akb_type === 'hub' ? 12 : 7;
        ctx!.fillStyle = color.border;
        ctx!.fillRect(Math.round(n.x - size / 2), Math.round(n.y - size / 2), size, size);
        // Inner fill
        ctx!.fillStyle = color.bg;
        ctx!.fillRect(Math.round(n.x - size / 2) + 1, Math.round(n.y - size / 2) + 1, size - 2, size - 2);
      }
    }

    draw();

    return () => {
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [docs]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    for (const n of nodesRef.current) {
      const size = n.akb_type === 'hub' ? 14 : 10;
      if (Math.abs(mx - n.x) < size && Math.abs(my - n.y) < size) {
        const doc = docs.find((d) => d.id === n.id);
        if (doc) onNodeClick(doc);
        return;
      }
    }
    setTooltip(null);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    for (const n of nodesRef.current) {
      const size = n.akb_type === 'hub' ? 14 : 10;
      if (Math.abs(mx - n.x) < size && Math.abs(my - n.y) < size) {
        const doc = docs.find((d) => d.id === n.id);
        if (doc) {
          setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top, doc });
          return;
        }
      }
    }
    setTooltip(null);
  };

  return (
    <div className="relative flex-1 overflow-hidden">
      <canvas
        ref={canvasRef}
        width={680}
        height={420}
        style={{ imageRendering: 'pixelated', width: '100%', height: '100%', cursor: 'crosshair' }}
        onClick={handleClick}
        onMouseMove={handleMouseMove}
      />
      {tooltip && (
        <div
          className="absolute z-10 pointer-events-none p-2 rounded text-xs max-w-[200px]"
          style={{
            left: tooltip.x + 12,
            top: tooltip.y - 20,
            background: '#16213e',
            border: '1px solid #334155',
            color: '#e2e8f0',
          }}
        >
          <div className="font-bold mb-1">{tooltip.doc.title}</div>
          {tooltip.doc.tldr && <div className="text-[10px] opacity-80 mb-1">{tooltip.doc.tldr}</div>}
          <div className="text-[10px] opacity-60">Click to open</div>
        </div>
      )}
      {docs.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-xs" style={{ color: '#475569' }}>
          No knowledge documents found
        </div>
      )}
    </div>
  );
}

/* ─── Knowledge Card ─────────────────────────────── */

function KnowledgeCard({
  doc,
  onOpen,
}: {
  doc: KnowledgeDoc;
  onOpen: (doc: KnowledgeDoc) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const color = getDomainColor(doc.category);
  const isHub = doc.akb_type === 'hub';

  return (
    <div
      className="mb-2 rounded-lg overflow-hidden"
      style={{
        background: isHub ? '#f0fdf4' : '#fff',
        border: `2px solid ${isHub ? '#16a34a' : '#e2e8f0'}`,
      }}
    >
      <div
        className="p-3 cursor-pointer hover:bg-black/5"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start gap-2">
          <span className="shrink-0 text-sm">{isHub ? '\u{1F5C2}' : '\u{1F4C4}'}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1 flex-wrap">
              <span className="font-semibold text-xs text-gray-800 truncate">{doc.title}</span>
              {/* Status dot */}
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{
                  background: doc.status === 'active' ? '#16a34a' : doc.status === 'draft' ? '#f59e0b' : '#94a3b8',
                }}
                title={doc.status}
              />
            </div>
            {/* Tags */}
            <div className="flex flex-wrap gap-1 mt-1">
              {doc.tags.slice(0, 4).map((tag) => (
                <span
                  key={tag}
                  className="px-1.5 py-0.5 rounded text-[9px] font-medium"
                  style={{ background: color.bg, color: color.text, border: `1px solid ${color.border}` }}
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
          <span className="text-gray-300 text-xs shrink-0">{expanded ? '\u25b2' : '\u25bc'}</span>
        </div>
        {!expanded && doc.tldr && (
          <div className="mt-1.5 text-[10px] text-gray-500 line-clamp-2 ml-6">{doc.tldr}</div>
        )}
      </div>

      {expanded && (
        <div className="px-3 pb-3 border-t border-gray-100">
          {doc.tldr && (
            <div className="mt-2 text-[11px] text-gray-600 leading-relaxed italic">
              {doc.tldr}
            </div>
          )}
          {doc.links.length > 0 && (
            <div className="mt-2">
              <div className="text-[9px] font-bold text-gray-400 uppercase mb-1">Cross-links</div>
              <div className="flex flex-wrap gap-1">
                {doc.links.slice(0, 5).map((link, i) => (
                  <span
                    key={i}
                    className="px-1.5 py-0.5 text-[9px] rounded"
                    style={{ background: '#f1f5f9', color: '#64748b', border: '1px solid #e2e8f0' }}
                  >
                    {'\u{1F517}'} {link.text}
                  </span>
                ))}
              </div>
            </div>
          )}
          <button
            className="mt-2 text-[10px] font-semibold cursor-pointer hover:opacity-70"
            style={{ color: '#16a34a' }}
            onClick={(e) => { e.stopPropagation(); onOpen(doc); }}
          >
            Open full {'\u2192'}
          </button>
        </div>
      )}
    </div>
  );
}

/* ─── Doc Detail View ────────────────────────────── */

function DocDetail({ docId, onBack }: { docId: string; onBack: () => void }) {
  const [detail, setDetail] = useState<KnowledgeDocDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getKnowledgeDoc(docId)
      .then(setDetail)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [docId]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-xs text-gray-400">
        Loading...
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="flex-1 flex items-center justify-center text-xs text-gray-400">
        Failed to load document
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-5">
      <button
        onClick={onBack}
        className="mb-3 text-xs font-semibold cursor-pointer hover:opacity-70 flex items-center gap-1"
        style={{ color: '#16a34a' }}
      >
        {'\u2190'} Back to list
      </button>
      <h2 className="text-sm font-bold text-gray-800 mb-1">{detail.title}</h2>
      {detail.tldr && (
        <div className="mb-3 text-xs text-gray-500 italic">{detail.tldr}</div>
      )}
      <div className="text-xs text-gray-700 leading-relaxed">
        <OfficeMarkdown content={detail.content} />
      </div>
    </div>
  );
}

/* ─── Main Panel ─────────────────────────────────── */

interface Props {
  docs: KnowledgeDoc[];
  onClose: () => void;
  terminalWidth?: number;
}

export default function KnowledgePanel({ docs, onClose, terminalWidth = 0 }: Props) {
  const [view, setView] = useState<'list' | 'graph'>('list');
  const [category, setCategory] = useState<string>('all');
  const [openDocId, setOpenDocId] = useState<string | null>(null);

  const hasTerminal = terminalWidth > 0;
  const panelRight = hasTerminal ? terminalWidth : 0;
  const panelWidth = hasTerminal ? Math.max(360, 500 - (terminalWidth - 480) / 2) : 500;

  // Gather unique categories
  const categories = ['all', ...Array.from(new Set(docs.map((d) => d.category))).sort()];

  const filtered = category === 'all' ? docs : docs.filter((d) => d.category === category);

  return (
    <>
      <div
        className="dimmer fixed top-0 left-0 bottom-0 bg-black/30 z-40 open"
        style={{ right: panelRight }}
        onClick={onClose}
      />
      <div
        className="side-panel open fixed top-0 h-full z-50 flex flex-col bg-[var(--wall)] border-l-[3px] border-[#16a34a] shadow-[-4px_0_20px_rgba(0,0,0,0.2)]"
        style={{ right: panelRight, width: panelWidth }}
      >
        {/* Header */}
        <div className="p-5 text-white relative" style={{ background: '#16a34a' }}>
          <button
            onClick={onClose}
            className="absolute top-3 right-3 w-7 h-7 rounded-full bg-white/20 text-white flex items-center justify-center text-lg hover:bg-white/30 cursor-pointer"
          >
            {'\u00d7'}
          </button>
          <div className="text-lg font-bold">{'\u{1F4DA}'} Knowledge Base</div>
          <div className="text-xs opacity-80 mt-0.5">{docs.length} documents</div>
        </div>

        {/* View toggle */}
        <div className="flex border-b border-[var(--office-border)]">
          <TabBtn label="List" active={view === 'list'} onClick={() => setView('list')} />
          <TabBtn label="Graph" active={view === 'graph'} onClick={() => setView('graph')} />
        </div>

        {view === 'list' && !openDocId && (
          <>
            {/* Category tabs */}
            <div className="flex overflow-x-auto border-b border-[var(--office-border)] shrink-0" style={{ scrollbarWidth: 'none' }}>
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  className={`px-3 py-1.5 text-[10px] font-medium cursor-pointer whitespace-nowrap ${
                    category === cat
                      ? 'text-[#16a34a] border-b-2 border-[#16a34a]'
                      : 'text-gray-400 hover:text-gray-600'
                  }`}
                >
                  {cat === 'all' ? `All (${docs.length})` : `${cat} (${docs.filter((d) => d.category === cat).length})`}
                </button>
              ))}
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-4">
              {filtered.length === 0 ? (
                <div className="text-center text-xs text-gray-400 py-8">No documents in this category</div>
              ) : (
                filtered.map((doc) => (
                  <KnowledgeCard key={doc.id} doc={doc} onOpen={(d) => setOpenDocId(d.id)} />
                ))
              )}
            </div>
          </>
        )}

        {view === 'list' && openDocId && (
          <DocDetail docId={openDocId} onBack={() => setOpenDocId(null)} />
        )}

        {view === 'graph' && (
          <div className="flex-1 overflow-hidden flex flex-col">
            <KnowledgeGraph
              docs={docs}
              onNodeClick={(doc) => { setView('list'); setOpenDocId(doc.id); }}
            />
            {/* Legend */}
            <div className="shrink-0 p-2 border-t border-[var(--office-border)]">
              <div className="flex flex-wrap gap-2">
                {Object.entries(DOMAIN_COLORS).map(([name, c]) => (
                  <div key={name} className="flex items-center gap-1 text-[9px]">
                    <div className="w-2 h-2" style={{ background: c.border }} />
                    <span style={{ color: '#64748b' }}>{name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function TabBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2.5 text-sm font-medium cursor-pointer ${
        active
          ? 'text-[#16a34a] border-b-2 border-[#16a34a]'
          : 'text-gray-400 hover:text-gray-600'
      }`}
    >
      {label}
    </button>
  );
}
