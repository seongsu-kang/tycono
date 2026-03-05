import { useState, useEffect, useRef, useCallback } from 'react';
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide } from 'd3-force';
import type { SimulationNodeDatum, SimulationLinkDatum } from 'd3-force';
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

/* ─── Graph Types ──────────────────────────────────── */

interface GNode extends SimulationNodeDatum {
  id: string;
  title: string;
  category: string;
  akb_type: 'hub' | 'node';
}

interface GLink extends SimulationLinkDatum<GNode> {
  source: string | GNode;
  target: string | GNode;
}

/* ─── Graph View (d3-force + SVG) ──────────────────── */

function KnowledgeGraph({ docs, onNodeClick }: { docs: KnowledgeDoc[]; onNodeClick: (doc: KnowledgeDoc) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [dimensions, setDimensions] = useState({ width: 600, height: 400 });
  const [graphData, setGraphData] = useState<{ nodes: GNode[]; links: GLink[] }>({ nodes: [], links: [] });
  const [hoveredNode, setHoveredNode] = useState<GNode | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // Observe container size
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) setDimensions({ width, height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Build and simulate graph
  useEffect(() => {
    if (docs.length === 0) return;

    const idSet = new Set(docs.map((d) => d.id));
    const nodes: GNode[] = docs.map((d) => ({
      id: d.id,
      title: d.title,
      category: d.category,
      akb_type: d.akb_type,
    }));

    const links: GLink[] = [];
    for (const doc of docs) {
      for (const link of doc.links) {
        const targetId = link.href.replace(/^.*knowledge\//, '').replace(/^\.\.\//, '');
        if (idSet.has(targetId) && targetId !== doc.id) {
          // Avoid duplicate edges
          if (!links.some((l) => (l.source === doc.id && l.target === targetId) || (l.source === targetId && l.target === doc.id))) {
            links.push({ source: doc.id, target: targetId });
          }
        }
      }
    }

    const { width, height } = dimensions;

    const sim = forceSimulation<GNode>(nodes)
      .force('link', forceLink<GNode, GLink>(links).id((d) => d.id).distance(100))
      .force('charge', forceManyBody().strength(-300))
      .force('center', forceCenter(width / 2, height / 2))
      .force('collide', forceCollide(30));

    sim.on('tick', () => {
      // Clamp to bounds
      for (const n of nodes) {
        n.x = Math.max(40, Math.min(width - 40, n.x ?? width / 2));
        n.y = Math.max(40, Math.min(height - 40, n.y ?? height / 2));
      }
      setGraphData({ nodes: [...nodes], links: [...links] });
    });

    // Run 120 ticks quickly then stop
    sim.alpha(1).restart();
    for (let i = 0; i < 120; i++) sim.tick();
    sim.stop();
    setGraphData({ nodes: [...nodes], links: [...links] });

    return () => { sim.stop(); };
  }, [docs, dimensions]);

  const getNodePos = (n: string | GNode): { x: number; y: number } => {
    if (typeof n === 'string') {
      const found = graphData.nodes.find((nd) => nd.id === n);
      return { x: found?.x ?? 0, y: found?.y ?? 0 };
    }
    return { x: n.x ?? 0, y: n.y ?? 0 };
  };

  return (
    <div ref={containerRef} className="relative flex-1 overflow-hidden" style={{ background: '#1e1e2e' }}>
      <svg ref={svgRef} width={dimensions.width} height={dimensions.height} style={{ display: 'block' }}>
        {/* Grid dots */}
        <defs>
          <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <circle cx="0" cy="0" r="0.5" fill="rgba(255,255,255,0.06)" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />

        {/* Edges */}
        {graphData.links.map((link, i) => {
          const s = getNodePos(link.source);
          const t = getNodePos(link.target);
          return (
            <line
              key={i}
              x1={s.x} y1={s.y} x2={t.x} y2={t.y}
              stroke="rgba(148,163,184,0.3)"
              strokeWidth={1.5}
              strokeDasharray="4 3"
            />
          );
        })}

        {/* Nodes */}
        {graphData.nodes.map((node) => {
          const color = DOMAIN_COLORS[node.category] ?? DOMAIN_COLORS.general;
          const isHub = node.akb_type === 'hub';
          const size = isHub ? 16 : 10;
          const isHovered = hoveredNode?.id === node.id;

          return (
            <g
              key={node.id}
              transform={`translate(${node.x ?? 0}, ${node.y ?? 0})`}
              style={{ cursor: 'pointer' }}
              onClick={() => {
                const doc = docs.find((d) => d.id === node.id);
                if (doc) onNodeClick(doc);
              }}
              onMouseEnter={(e) => {
                setHoveredNode(node);
                const rect = containerRef.current?.getBoundingClientRect();
                if (rect) setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
              }}
              onMouseLeave={() => setHoveredNode(null)}
            >
              {/* Outer */}
              <rect
                x={-size / 2 - (isHovered ? 2 : 0)}
                y={-size / 2 - (isHovered ? 2 : 0)}
                width={size + (isHovered ? 4 : 0)}
                height={size + (isHovered ? 4 : 0)}
                fill={color.border}
                rx={isHub ? 3 : 1}
                opacity={isHovered ? 1 : 0.9}
              />
              {/* Inner */}
              <rect
                x={-size / 2 + 2}
                y={-size / 2 + 2}
                width={Math.max(0, size - 4)}
                height={Math.max(0, size - 4)}
                fill={color.bg}
                rx={isHub ? 2 : 0}
              />
              {/* Label */}
              <text
                y={size / 2 + 12}
                textAnchor="middle"
                fill="#94a3b8"
                fontSize={9}
                fontFamily="monospace"
                style={{ pointerEvents: 'none' }}
              >
                {node.title.length > 18 ? node.title.slice(0, 16) + '..' : node.title}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Tooltip */}
      {hoveredNode && (
        <div
          className="absolute z-10 pointer-events-none p-2.5 rounded text-xs max-w-[220px]"
          style={{
            left: Math.min(mousePos.x + 16, dimensions.width - 230),
            top: Math.max(mousePos.y - 30, 8),
            background: '#16213e',
            border: '1px solid #334155',
            color: '#e2e8f0',
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          }}
        >
          <div className="font-bold mb-1">{hoveredNode.title}</div>
          <div className="text-[10px] opacity-60 mb-1">{hoveredNode.akb_type.toUpperCase()} / {hoveredNode.category}</div>
          {docs.find((d) => d.id === hoveredNode.id)?.tldr && (
            <div className="text-[10px] opacity-80 mb-1">{docs.find((d) => d.id === hoveredNode.id)!.tldr}</div>
          )}
          <div className="text-[10px] text-green-400">Click to open</div>
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
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{
                  background: doc.status === 'active' ? '#16a34a' : doc.status === 'draft' ? '#f59e0b' : '#94a3b8',
                }}
                title={doc.status}
              />
            </div>
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

/* ─── Panel resize hook ──────────────────────────── */

const DEFAULT_WIDTH = 500;
const MIN_WIDTH = 360;
const MAX_WIDTH = 700;

function usePanelResize(terminalWidth: number) {
  const [panelW, setPanelW] = useState(DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const hasTerminal = terminalWidth > 0;
  const panelRight = hasTerminal ? terminalWidth : 0;
  const maxAvailable = hasTerminal ? Math.max(MIN_WIDTH, window.innerWidth - terminalWidth - 100) : MAX_WIDTH;
  const panelWidth = Math.min(panelW, maxAvailable);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    startXRef.current = e.clientX;
    startWidthRef.current = panelWidth;
    setIsResizing(true);

    const onMove = (ev: MouseEvent) => {
      const delta = startXRef.current - ev.clientX;
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidthRef.current + delta));
      setPanelW(newWidth);
    };

    const onUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [panelWidth]);

  return { panelRight, panelWidth, isResizing, handleResizeStart };
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

  const { panelRight, panelWidth, isResizing, handleResizeStart } = usePanelResize(terminalWidth);

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
        className={`side-panel open fixed top-0 h-full z-50 flex flex-col bg-[var(--wall)] border-l-[3px] border-[#16a34a] shadow-[-4px_0_20px_rgba(0,0,0,0.2)] ${isResizing ? 'resizing' : ''}`}
        style={{ right: panelRight, width: panelWidth }}
      >
        {/* Resize handle */}
        <div
          className={`absolute top-0 -left-[5px] w-[10px] h-full cursor-col-resize z-[60] transition-colors ${isResizing ? 'bg-black/10' : 'hover:bg-black/5'}`}
          onMouseDown={handleResizeStart}
        />

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

export { usePanelResize };
