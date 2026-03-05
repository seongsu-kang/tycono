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
  label?: string;
}

/* ─── Graph View (d3-force + SVG with zoom/pan/drag) ─ */

function KnowledgeGraph({
  docs,
  onNodeClick,
  selectedDocId,
}: {
  docs: KnowledgeDoc[];
  onNodeClick: (doc: KnowledgeDoc) => void;
  selectedDocId?: string | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [dimensions, setDimensions] = useState({ width: 600, height: 400 });
  const [graphData, setGraphData] = useState<{ nodes: GNode[]; links: GLink[] }>({ nodes: [], links: [] });
  const [hoveredNode, setHoveredNode] = useState<GNode | null>(null);
  const [hoveredEdgeIdx, setHoveredEdgeIdx] = useState<number | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // Zoom/pan state
  const [viewBox, setViewBox] = useState({ x: 0, y: 0, w: 600, h: 400 });
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0, vx: 0, vy: 0 });

  // Drag state
  const dragNodeRef = useRef<GNode | null>(null);
  const simRef = useRef<ReturnType<typeof forceSimulation<GNode>> | null>(null);

  // Observe container size
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) {
        setDimensions({ width, height });
        setViewBox((v) => ({ ...v, w: width, h: height }));
      }
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
        const targetId = link.href
          .replace(/^.*knowledge\//, '')
          .replace(/^\.\.\/.*$/, '')
          .replace(/^\.\//, '');
        if (idSet.has(targetId) && targetId !== doc.id) {
          if (!links.some((l) => (l.source === doc.id && l.target === targetId) || (l.source === targetId && l.target === doc.id))) {
            links.push({ source: doc.id, target: targetId, label: link.text });
          }
        }
      }
    }

    const { width, height } = dimensions;

    const sim = forceSimulation<GNode>(nodes)
      .force('link', forceLink<GNode, GLink>(links).id((d) => d.id).distance(140))
      .force('charge', forceManyBody().strength(-400))
      .force('center', forceCenter(width / 2, height / 2))
      .force('collide', forceCollide(50));

    simRef.current = sim;

    sim.on('tick', () => {
      for (const n of nodes) {
        n.x = Math.max(60, Math.min(width - 60, n.x ?? width / 2));
        n.y = Math.max(60, Math.min(height - 60, n.y ?? height / 2));
      }
      setGraphData({ nodes: [...nodes], links: [...links] });
    });

    // Run ticks
    sim.alpha(1).restart();
    for (let i = 0; i < 150; i++) sim.tick();
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

  // Zoom handler
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1.1 : 0.9;
    setViewBox((v) => {
      const newW = Math.max(200, Math.min(dimensions.width * 3, v.w * factor));
      const newH = Math.max(150, Math.min(dimensions.height * 3, v.h * factor));
      // Zoom toward center
      const dx = (newW - v.w) / 2;
      const dy = (newH - v.h) / 2;
      return { x: v.x - dx, y: v.y - dy, w: newW, h: newH };
    });
  }, [dimensions]);

  // Pan handlers
  const handleBgMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    isPanningRef.current = true;
    panStartRef.current = { x: e.clientX, y: e.clientY, vx: viewBox.x, vy: viewBox.y };
  }, [viewBox]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    // Drag node
    if (dragNodeRef.current) {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const scaleX = viewBox.w / rect.width;
      const scaleY = viewBox.h / rect.height;
      const nx = viewBox.x + (e.clientX - rect.left) * scaleX;
      const ny = viewBox.y + (e.clientY - rect.top) * scaleY;
      dragNodeRef.current.fx = nx;
      dragNodeRef.current.fy = ny;
      simRef.current?.alpha(0.3).restart();
      return;
    }

    // Pan
    if (isPanningRef.current) {
      const dx = (e.clientX - panStartRef.current.x) * (viewBox.w / dimensions.width);
      const dy = (e.clientY - panStartRef.current.y) * (viewBox.h / dimensions.height);
      setViewBox((v) => ({ ...v, x: panStartRef.current.vx - dx, y: panStartRef.current.vy - dy }));
    }
  }, [viewBox, dimensions]);

  const handleMouseUp = useCallback(() => {
    isPanningRef.current = false;
    if (dragNodeRef.current) {
      dragNodeRef.current.fx = null;
      dragNodeRef.current.fy = null;
      dragNodeRef.current = null;
    }
  }, []);

  // Node drag start
  const handleNodeMouseDown = useCallback((e: React.MouseEvent, node: GNode) => {
    e.stopPropagation();
    dragNodeRef.current = node;
    simRef.current?.alpha(0.3).restart();
  }, []);

  return (
    <div ref={containerRef} className="relative flex-1 overflow-hidden" style={{ background: '#1e1e2e' }}>
      <svg
        ref={svgRef}
        width={dimensions.width}
        height={dimensions.height}
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
        style={{ display: 'block', cursor: isPanningRef.current ? 'grabbing' : 'grab' }}
        onWheel={handleWheel}
        onMouseDown={handleBgMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Grid dots */}
        <defs>
          <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <circle cx="0" cy="0" r="0.5" fill="rgba(255,255,255,0.06)" />
          </pattern>
        </defs>
        <rect x={viewBox.x - 100} y={viewBox.y - 100} width={viewBox.w + 200} height={viewBox.h + 200} fill="url(#grid)" pointerEvents="none" />

        {/* Edges */}
        {graphData.links.map((link, i) => {
          const s = getNodePos(link.source);
          const t = getNodePos(link.target);
          const isEdgeHovered = hoveredEdgeIdx === i;
          const mx = (s.x + t.x) / 2;
          const my = (s.y + t.y) / 2;
          return (
            <g key={i}>
              {/* Invisible wider hit area for hover */}
              <line
                x1={s.x} y1={s.y} x2={t.x} y2={t.y}
                stroke="transparent"
                strokeWidth={12}
                style={{ cursor: 'default' }}
                onMouseEnter={() => setHoveredEdgeIdx(i)}
                onMouseLeave={() => setHoveredEdgeIdx(null)}
              />
              <line
                x1={s.x} y1={s.y} x2={t.x} y2={t.y}
                stroke={isEdgeHovered ? 'rgba(148,163,184,0.7)' : 'rgba(148,163,184,0.3)'}
                strokeWidth={isEdgeHovered ? 2 : 1.5}
                strokeDasharray="4 3"
                pointerEvents="none"
              />
              {isEdgeHovered && link.label && (
                <text
                  x={mx}
                  y={my - 6}
                  textAnchor="middle"
                  fill="#e2e8f0"
                  fontSize={9}
                  fontFamily="monospace"
                  style={{ pointerEvents: 'none' }}
                >
                  <tspan style={{ filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.8))' }}>
                    {link.label.length > 30 ? link.label.slice(0, 28) + '..' : link.label}
                  </tspan>
                </text>
              )}
            </g>
          );
        })}

        {/* Nodes */}
        {graphData.nodes.map((node) => {
          const color = DOMAIN_COLORS[node.category] ?? DOMAIN_COLORS.general;
          const isHub = node.akb_type === 'hub';
          const size = isHub ? 24 : 16;
          const isHovered = hoveredNode?.id === node.id;
          const isSelected = selectedDocId === node.id;
          const scale = isHovered ? 1.2 : isSelected ? 1.15 : 1;

          return (
            <g
              key={node.id}
              transform={`translate(${node.x ?? 0}, ${node.y ?? 0}) scale(${scale})`}
              style={{ cursor: 'pointer', transition: 'transform 0.15s ease' }}
              onClick={(e) => {
                e.stopPropagation();
                const doc = docs.find((d) => d.id === node.id);
                if (doc) onNodeClick(doc);
              }}
              onMouseDown={(e) => handleNodeMouseDown(e, node)}
              onMouseEnter={(e) => {
                setHoveredNode(node);
                const rect = containerRef.current?.getBoundingClientRect();
                if (rect) setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
              }}
              onMouseLeave={() => setHoveredNode(null)}
            >
              {/* Glow for selected */}
              {isSelected && (
                <rect
                  x={-size / 2 - 4}
                  y={-size / 2 - 4}
                  width={size + 8}
                  height={size + 8}
                  fill="none"
                  stroke="#22c55e"
                  strokeWidth={2}
                  rx={isHub ? 5 : 2}
                  opacity={0.6}
                />
              )}
              {/* Outer */}
              <rect
                x={-size / 2}
                y={-size / 2}
                width={size}
                height={size}
                fill={color.border}
                rx={isHub ? 4 : 2}
                opacity={isHovered ? 1 : 0.9}
              />
              {/* Inner */}
              <rect
                x={-size / 2 + 3}
                y={-size / 2 + 3}
                width={Math.max(0, size - 6)}
                height={Math.max(0, size - 6)}
                fill={color.bg}
                rx={isHub ? 3 : 1}
              />
              {/* Label */}
              <text
                y={size / 2 + 14}
                textAnchor="middle"
                fill={isSelected ? '#e2e8f0' : '#94a3b8'}
                fontSize={11}
                fontFamily="monospace"
                fontWeight={isSelected ? 'bold' : 'normal'}
                style={{ pointerEvents: 'none' }}
              >
                {node.title.length > 24 ? node.title.slice(0, 22) + '..' : node.title}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Tooltip */}
      {hoveredNode && !dragNodeRef.current && (
        <div
          className="absolute z-10 pointer-events-none p-2.5 rounded text-xs max-w-[240px]"
          style={{
            left: Math.min(mousePos.x + 16, dimensions.width - 250),
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
          <div className="text-[10px] text-green-400">Click to open | Drag to move</div>
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
  allDocs,
  onOpen,
  onNavigateDoc,
}: {
  doc: KnowledgeDoc;
  allDocs: KnowledgeDoc[];
  onOpen: (doc: KnowledgeDoc) => void;
  onNavigateDoc: (docId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const color = getDomainColor(doc.category);
  const isHub = doc.akb_type === 'hub';

  // Build a map for clickable cross-links
  const docIdSet = new Set(allDocs.map((d) => d.id));

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
          <span className="shrink-0 text-sm">{isHub ? '\u{1F5C2}' : doc.format === 'html' ? '\u{1F310}' : '\u{1F4C4}'}</span>
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
                {doc.links.slice(0, 5).map((link, i) => {
                  const targetId = link.href
                    .replace(/^.*knowledge\//, '')
                    .replace(/^\.\.\/.*$/, '')
                    .replace(/^\.\//, '');
                  const isClickable = docIdSet.has(targetId);
                  return (
                    <span
                      key={i}
                      className={`px-1.5 py-0.5 text-[9px] rounded ${isClickable ? 'cursor-pointer hover:opacity-70' : ''}`}
                      style={{
                        background: isClickable ? '#dcfce7' : '#f1f5f9',
                        color: isClickable ? '#16a34a' : '#64748b',
                        border: `1px solid ${isClickable ? '#86efac' : '#e2e8f0'}`,
                      }}
                      onClick={(e) => {
                        if (isClickable) {
                          e.stopPropagation();
                          onNavigateDoc(targetId);
                        }
                      }}
                    >
                      {'\u{1F517}'} {link.text}
                    </span>
                  );
                })}
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

/* ─── Doc Detail View (view + edit) ─────────────── */

function DocDetail({
  docId,
  onBack,
  onDocUpdated,
  onDelete,
  onNavigateDoc,
  allDocs,
}: {
  docId: string;
  onBack: () => void;
  onDocUpdated: () => void;
  onDelete: (docId: string) => void;
  onNavigateDoc: (docId: string) => void;
  allDocs: KnowledgeDoc[];
}) {
  const [detail, setDetail] = useState<KnowledgeDocDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [saving, setSaving] = useState(false);

  const docIdSet = new Set(allDocs.map((d) => d.id));

  // Resolve a relative .md/.html href to a knowledge doc ID
  const resolveDocHref = useCallback((href: string): string | null => {
    // Strip hash fragments
    const clean = href.split('#')[0];
    if (!clean.match(/\.(md|html)$/)) return null;

    // Resolve relative to current doc's directory
    const currentDir = docId.includes('/') ? docId.replace(/\/[^/]+$/, '') : '';
    let resolved: string;

    if (clean.startsWith('./')) {
      resolved = currentDir ? `${currentDir}/${clean.slice(2)}` : clean.slice(2);
    } else if (clean.startsWith('../')) {
      // Walk up directories
      const parts = currentDir.split('/').filter(Boolean);
      let rel = clean;
      while (rel.startsWith('../')) {
        if (parts.length > 0) parts.pop();
        rel = rel.slice(3);
      }
      resolved = parts.length > 0 ? `${parts.join('/')}/${rel}` : rel;
    } else {
      resolved = clean;
    }

    // Check if this doc exists in KB
    if (docIdSet.has(resolved)) return resolved;
    // Try just the filename
    const basename = resolved.split('/').pop() ?? '';
    const match = allDocs.find((d) => d.id === basename || d.id.endsWith('/' + basename));
    return match ? match.id : null;
  }, [docId, docIdSet, allDocs]);

  // Intercept link clicks in rendered markdown content
  const handleContentClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const anchor = target.closest('a');
    if (!anchor) return;

    const href = anchor.getAttribute('href');
    if (!href) return;

    // Only intercept relative .md/.html links
    if (href.startsWith('http://') || href.startsWith('https://')) return;

    // Always prevent default navigation for relative .md/.html links
    if (!href.match(/\.(md|html)(#.*)?$/)) return;
    e.preventDefault();
    e.stopPropagation();

    const targetDocId = resolveDocHref(href);
    if (targetDocId) {
      onNavigateDoc(targetDocId);
    }
  }, [resolveDocHref, onNavigateDoc]);

  useEffect(() => {
    setLoading(true);
    api.getKnowledgeDoc(docId)
      .then((d) => {
        setDetail(d);
        setEditContent(d.content);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [docId]);

  const handleSave = async () => {
    if (!detail) return;
    setSaving(true);
    try {
      await api.updateKnowledgeDoc(docId, editContent);
      setDetail({ ...detail, content: editContent });
      setEditing(false);
      onDocUpdated();
    } catch (err) {
      console.error('Save failed:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete "${detail?.title}"?`)) return;
    try {
      await api.deleteKnowledgeDoc(docId);
      onDelete(docId);
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

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
    <div className="flex-1 overflow-y-auto flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--office-border)] shrink-0">
        <button
          onClick={onBack}
          className="text-xs font-semibold cursor-pointer hover:opacity-70"
          style={{ color: '#16a34a' }}
        >
          {'\u2190'} Back
        </button>
        <div className="flex-1" />
        {editing ? (
          <>
            <button
              onClick={() => { setEditing(false); setEditContent(detail.content); }}
              className="px-2.5 py-1 text-[10px] rounded cursor-pointer"
              style={{ background: '#f1f5f9', color: '#64748b', border: '1px solid #e2e8f0' }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-2.5 py-1 text-[10px] rounded cursor-pointer font-semibold text-white"
              style={{ background: saving ? '#86efac' : '#16a34a' }}
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => setEditing(true)}
              className="px-2.5 py-1 text-[10px] rounded cursor-pointer font-semibold"
              style={{ background: '#dbeafe', color: '#1d4ed8', border: '1px solid #93c5fd' }}
            >
              Edit
            </button>
            <button
              onClick={handleDelete}
              className="px-2.5 py-1 text-[10px] rounded cursor-pointer font-semibold"
              style={{ background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5' }}
            >
              Delete
            </button>
          </>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5">
        <h2 className="text-sm font-bold text-gray-800 mb-1">{detail.title}</h2>
        {detail.tldr && !editing && (
          <div className="mb-3 text-xs text-gray-500 italic">{detail.tldr}</div>
        )}

        {detail.format === 'html' ? (
          editing ? (
            <textarea
              className="w-full h-full min-h-[400px] p-3 text-xs leading-relaxed rounded border resize-y"
              style={{
                fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
                background: '#1e1e2e',
                color: '#e2e8f0',
                border: '1px solid #334155',
              }}
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              spellCheck={false}
            />
          ) : (
            <iframe
              srcDoc={detail.content}
              sandbox="allow-same-origin"
              className="w-full flex-1 min-h-[400px] rounded border border-gray-200 bg-white"
              style={{ border: '1px solid #e2e8f0' }}
              title={detail.title}
            />
          )
        ) : editing ? (
          <textarea
            className="w-full h-full min-h-[400px] p-3 text-xs leading-relaxed rounded border resize-y"
            style={{
              fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
              background: '#1e1e2e',
              color: '#e2e8f0',
              border: '1px solid #334155',
            }}
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            spellCheck={false}
          />
        ) : (
          <div className="text-xs text-gray-700 leading-relaxed" onClick={handleContentClick}>
            <OfficeMarkdown content={detail.content} />
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── New Doc Form ──────────────────────────────── */

function NewDocForm({
  onCreated,
  onCancel,
}: {
  onCreated: (id: string) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState('');
  const [filename, setFilename] = useState('');
  const [category, setCategory] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  // Auto-generate filename from title
  useEffect(() => {
    if (!title) { setFilename(''); return; }
    const auto = title
      .toLowerCase()
      .replace(/[^a-z0-9가-힣\s-]/g, '')
      .replace(/\s+/g, '-')
      .slice(0, 60);
    setFilename(auto);
  }, [title]);

  const handleCreate = async () => {
    if (!title.trim() || !filename.trim()) {
      setError('Title and filename are required');
      return;
    }
    setCreating(true);
    setError('');
    try {
      const result = await api.createKnowledgeDoc({ filename, title, category: category || undefined });
      onCreated(result.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-5">
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={onCancel}
          className="text-xs font-semibold cursor-pointer hover:opacity-70"
          style={{ color: '#16a34a' }}
        >
          {'\u2190'} Cancel
        </button>
        <h2 className="text-sm font-bold text-gray-800">New Document</h2>
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-[10px] font-semibold text-gray-500 mb-1">TITLE</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Document title..."
            className="w-full px-3 py-2 text-xs rounded border border-gray-200 focus:outline-none focus:border-[#16a34a]"
          />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-gray-500 mb-1">FILENAME</label>
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              className="flex-1 px-3 py-2 text-xs rounded border border-gray-200 focus:outline-none focus:border-[#16a34a] font-mono"
            />
            <span className="text-[10px] text-gray-400">.md</span>
          </div>
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-gray-500 mb-1">CATEGORY (optional)</label>
          <input
            type="text"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="e.g., tech, market, strategy"
            className="w-full px-3 py-2 text-xs rounded border border-gray-200 focus:outline-none focus:border-[#16a34a]"
          />
        </div>

        {error && (
          <div className="text-[10px] text-red-600 bg-red-50 px-3 py-1.5 rounded">{error}</div>
        )}

        <button
          onClick={handleCreate}
          disabled={creating || !title.trim()}
          className="w-full py-2 text-xs font-semibold rounded cursor-pointer text-white"
          style={{ background: creating ? '#86efac' : '#16a34a' }}
        >
          {creating ? 'Creating...' : 'Create Document'}
        </button>
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
  onRefresh: () => void;
  terminalWidth?: number;
  initialDocId?: string;
}

export default function KnowledgePanel({ docs, onClose, onRefresh, terminalWidth = 0, initialDocId }: Props) {
  const [view, setView] = useState<'list' | 'graph'>('list');
  const [category, setCategory] = useState<string>('all');
  const [openDocId, setOpenDocId] = useState<string | null>(initialDocId ?? null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewForm, setShowNewForm] = useState(false);
  const [graphSelectedDocId, setGraphSelectedDocId] = useState<string | null>(null);

  const { panelRight, panelWidth, isResizing, handleResizeStart } = usePanelResize(terminalWidth);

  // Gather unique categories
  const categories = ['all', ...Array.from(new Set(docs.map((d) => d.category))).sort()];

  // Filter by category and search
  const filtered = docs.filter((d) => {
    if (category !== 'all' && d.category !== category) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        d.title.toLowerCase().includes(q) ||
        (d.tldr ?? '').toLowerCase().includes(q) ||
        d.tags.some((t) => t.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const handleDocCreated = (id: string) => {
    setShowNewForm(false);
    onRefresh();
    setOpenDocId(id);
  };

  const handleDocDeleted = (_docId: string) => {
    setOpenDocId(null);
    onRefresh();
  };

  const handleGraphNodeClick = (doc: KnowledgeDoc) => {
    setGraphSelectedDocId(doc.id);
  };

  const selectedGraphDoc = graphSelectedDocId ? docs.find((d) => d.id === graphSelectedDocId) : null;

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
          <TabBtn label="List" active={view === 'list'} onClick={() => { setView('list'); setGraphSelectedDocId(null); }} />
          <TabBtn label="Graph" active={view === 'graph'} onClick={() => setView('graph')} />
        </div>

        {/* ─── LIST VIEW ─── */}
        {view === 'list' && !openDocId && !showNewForm && (
          <>
            {/* Search + New button */}
            <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--office-border)] shrink-0">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search docs..."
                className="flex-1 px-2.5 py-1.5 text-[11px] rounded border border-gray-200 focus:outline-none focus:border-[#16a34a]"
              />
              <button
                onClick={() => setShowNewForm(true)}
                className="px-2.5 py-1.5 text-[10px] font-semibold rounded cursor-pointer text-white shrink-0"
                style={{ background: '#16a34a' }}
              >
                + New
              </button>
            </div>

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
                <div className="text-center text-xs text-gray-400 py-8">
                  {searchQuery ? 'No matching documents' : 'No documents in this category'}
                </div>
              ) : (
                filtered.map((doc) => (
                  <KnowledgeCard
                    key={doc.id}
                    doc={doc}
                    allDocs={docs}
                    onOpen={(d) => setOpenDocId(d.id)}
                    onNavigateDoc={(id) => setOpenDocId(id)}
                  />
                ))
              )}
            </div>
          </>
        )}

        {/* ─── DOC DETAIL VIEW ─── */}
        {view === 'list' && openDocId && !showNewForm && (
          <DocDetail
            docId={openDocId}
            onBack={() => setOpenDocId(null)}
            onDocUpdated={onRefresh}
            onDelete={handleDocDeleted}
            onNavigateDoc={(id) => setOpenDocId(id)}
            allDocs={docs}
          />
        )}

        {/* ─── NEW DOC FORM ─── */}
        {view === 'list' && showNewForm && (
          <NewDocForm
            onCreated={handleDocCreated}
            onCancel={() => setShowNewForm(false)}
          />
        )}

        {/* ─── GRAPH VIEW ─── */}
        {view === 'graph' && (
          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="flex-1 flex overflow-hidden">
              <KnowledgeGraph
                docs={docs}
                onNodeClick={handleGraphNodeClick}
                selectedDocId={graphSelectedDocId}
              />
              {/* Graph detail sidebar */}
              {selectedGraphDoc && (
                <div
                  className="shrink-0 overflow-y-auto border-l border-[var(--office-border)] p-3"
                  style={{ width: 200, background: 'var(--wall)' }}
                >
                  <div className="text-[10px] font-bold text-gray-400 uppercase mb-1">Selected</div>
                  <div className="text-xs font-bold text-gray-800 mb-1">{selectedGraphDoc.title}</div>
                  <div
                    className="w-2 h-2 rounded-full mb-2"
                    style={{
                      background: selectedGraphDoc.status === 'active' ? '#16a34a' : selectedGraphDoc.status === 'draft' ? '#f59e0b' : '#94a3b8',
                    }}
                  />
                  {selectedGraphDoc.tldr && (
                    <div className="text-[10px] text-gray-500 mb-2 leading-relaxed">{selectedGraphDoc.tldr}</div>
                  )}
                  {selectedGraphDoc.links.length > 0 && (
                    <div className="mb-2">
                      <div className="text-[9px] font-bold text-gray-400 mb-1">Links</div>
                      {selectedGraphDoc.links.slice(0, 5).map((link, i) => (
                        <div key={i} className="text-[9px] text-gray-500 mb-0.5 truncate">{'\u{1F517}'} {link.text}</div>
                      ))}
                    </div>
                  )}
                  <button
                    className="w-full py-1.5 text-[10px] font-semibold rounded cursor-pointer text-white"
                    style={{ background: '#16a34a' }}
                    onClick={() => { setView('list'); setOpenDocId(selectedGraphDoc.id); setGraphSelectedDocId(null); }}
                  >
                    Open Document
                  </button>
                </div>
              )}
            </div>
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
