import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { forceSimulation, forceLink, forceManyBody, forceCollide, forceX, forceY } from 'd3-force';
import type { SimulationNodeDatum, SimulationLinkDatum } from 'd3-force';
import type { KnowledgeDoc, KnowledgeDocDetail } from '../../types';
import { api } from '../../api/client';
import OfficeMarkdown from './OfficeMarkdown';
import Fuse from 'fuse.js';

/* ─── Domain color mapping ─────────────────────────── */

const DOMAIN_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  tech:       { bg: 'rgba(59,130,246,0.15)', border: '#3b82f6', text: '#60a5fa' },
  market:     { bg: 'rgba(245,158,11,0.15)', border: '#f59e0b', text: '#fbbf24' },
  strategy:   { bg: 'rgba(139,92,246,0.15)', border: '#8b5cf6', text: '#a78bfa' },
  financial:  { bg: 'rgba(34,197,94,0.15)',  border: '#22c55e', text: '#4ade80' },
  process:    { bg: 'rgba(236,72,153,0.15)', border: '#ec4899', text: '#f472b6' },
  competitor: { bg: 'rgba(239,68,68,0.15)',  border: '#ef4444', text: '#f87171' },
  domain:     { bg: 'rgba(14,165,233,0.15)', border: '#0ea5e9', text: '#38bdf8' },
  general:    { bg: 'rgba(148,163,184,0.12)', border: '#64748b', text: '#94a3b8' },
};

function getDomainColor(cat: string) {
  return DOMAIN_COLORS[cat] ?? DOMAIN_COLORS.general;
}

/* ─── KB-007: Cluster Anchors (domain -> grid position) ── */

// Domain list for consistent ordering
const DOMAIN_LIST = ['tech', 'market', 'strategy', 'financial', 'process', 'competitor', 'domain', 'general'];

// Calculate cluster anchor positions arranged in a 4x2 grid
function getClusterAnchors(width: number, height: number): Map<string, { x: number; y: number }> {
  const anchors = new Map<string, { x: number; y: number }>();
  const cols = 4;
  const rows = 2;
  const padX = width * 0.12; // Padding from edges
  const padY = height * 0.15;
  const cellW = (width - padX * 2) / cols;
  const cellH = (height - padY * 2) / rows;

  DOMAIN_LIST.forEach((domain, idx) => {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    anchors.set(domain, {
      x: padX + cellW * (col + 0.5),
      y: padY + cellH * (row + 0.5),
    });
  });

  return anchors;
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
  matchedIds,
}: {
  docs: KnowledgeDoc[];
  onNodeClick: (doc: KnowledgeDoc) => void;
  selectedDocId?: string | null;
  matchedIds: Set<string> | null; // null = show all, Set = fade non-matching
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [dimensions, setDimensions] = useState({ width: 600, height: 400 });
  const [graphData, setGraphData] = useState<{ nodes: GNode[]; links: GLink[] }>({ nodes: [], links: [] });
  const [hoveredNode, setHoveredNode] = useState<GNode | null>(null);
  const [hoveredEdgeIdx, setHoveredEdgeIdx] = useState<number | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // KB-007: Cluster anchor positions (updated when simulation runs)
  const [clusterAnchors, setClusterAnchors] = useState<Map<string, { x: number; y: number; radius: number; count: number }>>(new Map());

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

    // Helper: resolve relative href to absolute id (like path.resolve)
    const resolveHref = (baseId: string, href: string): string => {
      // If href is already absolute (starts with folder/), use as-is
      if (!href.startsWith('.') && !href.startsWith('/')) {
        return href;
      }
      // Get directory of current doc
      const baseParts = baseId.split('/');
      baseParts.pop(); // remove filename
      const hrefParts = href.split('/');

      for (const part of hrefParts) {
        if (part === '..') {
          baseParts.pop();
        } else if (part !== '.' && part !== '') {
          baseParts.push(part);
        }
      }
      return baseParts.join('/');
    };

    const links: GLink[] = [];
    for (const doc of docs) {
      for (const link of doc.links) {
        // Resolve relative paths based on current doc's location
        const targetId = resolveHref(doc.id, link.href);
        if (idSet.has(targetId) && targetId !== doc.id) {
          if (!links.some((l) => (l.source === doc.id && l.target === targetId) || (l.source === targetId && l.target === doc.id))) {
            links.push({ source: doc.id, target: targetId, label: link.text });
          }
        }
      }
    }

    const { width, height } = dimensions;

    // Scale forces based on node count so large graphs spread out properly
    const n = nodes.length;
    const chargeStrength = n > 100 ? -300 : n > 50 ? -250 : -200; // Reduced for clustering
    const linkDist = n > 100 ? 120 : n > 50 ? 100 : 80; // Reduced for tighter clusters
    const collideRadius = n > 100 ? 45 : 40;

    // KB-007: Calculate cluster anchor positions
    const simW = Math.max(width * 1.5, 800);
    const simH = Math.max(height * 1.5, 600);
    const anchors = getClusterAnchors(simW, simH);

    // KB-007: Count nodes per domain for cluster sizing
    const domainCounts = new Map<string, number>();
    for (const node of nodes) {
      const cat = node.category || 'general';
      domainCounts.set(cat, (domainCounts.get(cat) || 0) + 1);
    }

    // KB-007: Cluster force strength - pulls nodes toward their domain anchor
    const clusterStrength = 0.3; // Moderate pull toward cluster center

    const sim = forceSimulation<GNode>(nodes)
      .force('link', forceLink<GNode, GLink>(links).id((d) => d.id).distance(linkDist).strength(0.5))
      .force('charge', forceManyBody().strength(chargeStrength))
      // KB-007: Replace center force with cluster forces (forceX, forceY)
      .force('clusterX', forceX<GNode>((d) => {
        const anchor = anchors.get(d.category || 'general');
        return anchor?.x ?? simW / 2;
      }).strength(clusterStrength))
      .force('clusterY', forceY<GNode>((d) => {
        const anchor = anchors.get(d.category || 'general');
        return anchor?.y ?? simH / 2;
      }).strength(clusterStrength))
      .force('collide', forceCollide(collideRadius));

    simRef.current = sim;

    sim.on('tick', () => {
      // No boundary clamping — zoom/pan handles overflow
      setGraphData({ nodes: [...nodes], links: [...links] });
    });

    // Run ticks
    sim.alpha(1).restart();
    const ticks = n > 100 ? 400 : 200; // More ticks for clustering to settle
    for (let i = 0; i < ticks; i++) sim.tick();
    sim.stop();
    setGraphData({ nodes: [...nodes], links: [...links] });

    // KB-007: Calculate actual cluster bounds after simulation
    const clusterBounds = new Map<string, { minX: number; maxX: number; minY: number; maxY: number; count: number }>();
    for (const node of nodes) {
      const cat = node.category || 'general';
      const nx = node.x ?? 0;
      const ny = node.y ?? 0;
      const existing = clusterBounds.get(cat);
      if (existing) {
        existing.minX = Math.min(existing.minX, nx);
        existing.maxX = Math.max(existing.maxX, nx);
        existing.minY = Math.min(existing.minY, ny);
        existing.maxY = Math.max(existing.maxY, ny);
        existing.count++;
      } else {
        clusterBounds.set(cat, { minX: nx, maxX: nx, minY: ny, maxY: ny, count: 1 });
      }
    }

    // KB-007: Convert bounds to center + radius for rendering
    const computedAnchors = new Map<string, { x: number; y: number; radius: number; count: number }>();
    for (const [cat, bounds] of clusterBounds) {
      const cx = (bounds.minX + bounds.maxX) / 2;
      const cy = (bounds.minY + bounds.maxY) / 2;
      const rx = (bounds.maxX - bounds.minX) / 2;
      const ry = (bounds.maxY - bounds.minY) / 2;
      const radius = Math.max(Math.sqrt(rx * rx + ry * ry), 60) + 40; // Min radius + padding
      computedAnchors.set(cat, { x: cx, y: cy, radius, count: bounds.count });
    }
    setClusterAnchors(computedAnchors);

    // Auto-fit viewBox to actual node positions
    if (nodes.length > 0) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const nd of nodes) {
        const nx = nd.x ?? 0, ny = nd.y ?? 0;
        if (nx < minX) minX = nx;
        if (ny < minY) minY = ny;
        if (nx > maxX) maxX = nx;
        if (ny > maxY) maxY = ny;
      }
      const pad = 120; // Larger padding for cluster backgrounds
      setViewBox({
        x: minX - pad,
        y: minY - pad,
        w: Math.max(width, maxX - minX + pad * 2),
        h: Math.max(height, maxY - minY + pad * 2),
      });
    }

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

        {/* KB-007: Cluster background circles */}
        {Array.from(clusterAnchors.entries()).map(([domain, { x, y, radius, count }]) => {
          if (count === 0) return null;
          const color = DOMAIN_COLORS[domain] ?? DOMAIN_COLORS.general;
          return (
            <g key={`cluster-${domain}`} style={{ pointerEvents: 'none' }}>
              {/* Outer glow/border */}
              <circle
                cx={x}
                cy={y}
                r={radius}
                fill="none"
                stroke={color.border}
                strokeWidth={1.5}
                strokeDasharray="6 4"
                opacity={0.3}
              />
              {/* Inner fill */}
              <circle
                cx={x}
                cy={y}
                r={radius - 2}
                fill={color.bg}
                opacity={0.4}
              />
              {/* Domain label */}
              <text
                x={x}
                y={y - radius + 16}
                textAnchor="middle"
                fill={color.text}
                fontSize={11}
                fontFamily="monospace"
                fontWeight="bold"
                opacity={0.8}
              >
                {domain.toUpperCase()} ({count})
              </text>
            </g>
          );
        })}

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
          // KB-003: Fade non-matching nodes when search is active
          const isMatched = matchedIds === null || matchedIds.has(node.id);
          const nodeOpacity = isMatched ? 1 : 0.2;

          return (
            <g
              key={node.id}
              transform={`translate(${node.x ?? 0}, ${node.y ?? 0}) scale(${scale})`}
              style={{ cursor: 'pointer', transition: 'transform 0.15s ease, opacity 0.2s ease', opacity: nodeOpacity }}
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
            background: 'var(--hud-bg)',
            border: '1px solid var(--terminal-border)',
            color: 'var(--terminal-text)',
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
        <div className="absolute inset-0 flex items-center justify-center text-xs" style={{ color: 'var(--terminal-text-muted)' }}>
          No knowledge documents found
        </div>
      )}
    </div>
  );
}

/* ─── Tree View ─────────────────────────────────── */

interface TreeNode {
  type: 'folder' | 'file';
  name: string;
  path: string;
  doc?: KnowledgeDoc;
  children?: TreeNode[];
}

function buildTree(docs: KnowledgeDoc[]): TreeNode[] {
  const root: TreeNode[] = [];
  const folderMap = new Map<string, TreeNode>();

  // Sort docs by path for consistent ordering
  const sortedDocs = [...docs].sort((a, b) => a.id.localeCompare(b.id));

  sortedDocs.forEach((doc) => {
    const parts = doc.id.split('/');
    let currentLevel = root;
    let currentPath = '';

    // Build folder hierarchy
    for (let i = 0; i < parts.length - 1; i++) {
      currentPath = currentPath ? `${currentPath}/${parts[i]}` : parts[i];

      if (!folderMap.has(currentPath)) {
        const folderNode: TreeNode = {
          type: 'folder',
          name: parts[i],
          path: currentPath,
          children: [],
        };
        folderMap.set(currentPath, folderNode);
        currentLevel.push(folderNode);
        currentLevel = folderNode.children!;
      } else {
        currentLevel = folderMap.get(currentPath)!.children!;
      }
    }

    // Add file node
    currentLevel.push({
      type: 'file',
      name: parts[parts.length - 1],
      path: doc.id,
      doc,
    });
  });

  return root;
}

function TreeView({
  docs,
  onDocumentClick,
  selectedDocId,
  matchedIds,
}: {
  docs: KnowledgeDoc[];
  onDocumentClick: (docId: string) => void;
  selectedDocId: string | null;
  matchedIds: Set<string> | null; // null = show all, Set = fade non-matching
}) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['knowledge', 'projects', 'architecture', 'operations', 'company']));
  const [viewingDocId, setViewingDocId] = useState<string | null>(null);
  const tree = useMemo(() => buildTree(docs), [docs]);

  const toggleFolder = (path: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const handleFileClick = (docId: string) => {
    setViewingDocId(docId);
    onDocumentClick(docId);
  };

  const handleCloseDetail = () => {
    setViewingDocId(null);
    onDocumentClick(null!);
  };

  const viewingDoc = viewingDocId ? docs.find((d) => d.id === viewingDocId) : null;

  return (
    <div className="flex-1 overflow-hidden flex animate-fadeIn">
      {/* Tree Sidebar */}
      <div
        className="shrink-0 overflow-y-auto p-3"
        style={{ width: 220, background: 'var(--hud-bg-alt)', borderRight: '1px solid var(--terminal-border)' }}
      >
        <div className="text-[10px] font-bold uppercase mb-2" style={{ color: 'var(--terminal-text-muted)' }}>
          📂 Explorer
        </div>
        {tree.map((node) => (
          <TreeNodeComponent
            key={node.path}
            node={node}
            level={0}
            expandedFolders={expandedFolders}
            selectedDocId={selectedDocId}
            viewingDocId={viewingDocId}
            onToggleFolder={toggleFolder}
            onFileClick={handleFileClick}
            matchedIds={matchedIds}
          />
        ))}
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto">
        {viewingDoc ? (
          <DocDetailView doc={viewingDoc} onClose={handleCloseDetail} />
        ) : (
          <div className="flex items-center justify-center h-full text-xs" style={{ color: 'var(--terminal-text-muted)' }}>
            <div className="text-center">
              <div className="text-2xl mb-2">📄</div>
              <div>Select a document to view</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TreeNodeComponent({
  node,
  level,
  expandedFolders,
  selectedDocId,
  viewingDocId,
  onToggleFolder,
  onFileClick,
  matchedIds,
}: {
  node: TreeNode;
  level: number;
  expandedFolders: Set<string>;
  selectedDocId: string | null;
  viewingDocId: string | null;
  onToggleFolder: (path: string) => void;
  onFileClick: (docId: string) => void;
  matchedIds: Set<string> | null;
}) {
  const isExpanded = expandedFolders.has(node.path);
  const isSelected = node.type === 'file' && node.path === selectedDocId;
  const isViewing = node.type === 'file' && node.path === viewingDocId;
  const isHub = node.doc?.akb_type === 'hub';
  // KB-003: Check if this node matches the search
  const isMatched = node.type === 'folder' || matchedIds === null || matchedIds.has(node.path);

  if (node.type === 'folder') {
    // KB-003: Check if any child matches to determine folder opacity
    const hasMatchingChild = matchedIds === null || (node.children?.some((child) => {
      if (child.type === 'file') return matchedIds.has(child.path);
      // Recursively check folder children
      const checkFolder = (n: TreeNode): boolean => {
        if (n.type === 'file') return matchedIds.has(n.path);
        return n.children?.some(checkFolder) ?? false;
      };
      return checkFolder(child);
    }) ?? false);

    return (
      <div style={{ opacity: hasMatchingChild ? 1 : 0.3, transition: 'opacity 0.2s ease' }}>
        <div
          className="flex items-center gap-1 py-0.5 px-1 rounded cursor-pointer hover:bg-white/5"
          style={{ paddingLeft: level * 12 + 4 }}
          onClick={() => onToggleFolder(node.path)}
        >
          <span className="text-[10px]">{isExpanded ? '📂' : '📁'}</span>
          <span className="text-[11px]" style={{ color: 'var(--terminal-text)' }}>{node.name}</span>
        </div>
        {isExpanded && node.children?.map((child) => (
          <TreeNodeComponent
            key={child.path}
            node={child}
            level={level + 1}
            expandedFolders={expandedFolders}
            selectedDocId={selectedDocId}
            viewingDocId={viewingDocId}
            onToggleFolder={onToggleFolder}
            onFileClick={onFileClick}
            matchedIds={matchedIds}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className={`flex items-center gap-1 py-0.5 px-1 rounded cursor-pointer transition-colors ${
        isViewing ? 'bg-green-500/20' : isSelected ? 'bg-white/10' : 'hover:bg-white/5'
      }`}
      style={{ paddingLeft: level * 12 + 4, opacity: isMatched ? 1 : 0.2, transition: 'opacity 0.2s ease' }}
      onClick={() => onFileClick(node.path)}
    >
      <span className="text-[10px]">{isHub ? '📘' : '📄'}</span>
      <span
        className={`text-[11px] truncate ${isHub ? 'font-semibold' : ''}`}
        style={{ color: isHub ? '#16a34a' : 'var(--terminal-text)' }}
      >
        {node.name}
      </span>
    </div>
  );
}

/* ─── KB-005: TOC Parser ─────────────────────────── */

interface TocItem {
  id: string;
  text: string;
  level: number;
}

function parseToc(markdown: string): TocItem[] {
  const lines = markdown.split('\n');
  const toc: TocItem[] = [];
  const idCounts = new Map<string, number>();

  for (const line of lines) {
    const match = line.match(/^(#{2,3})\s+(.+)$/);
    if (!match) continue;

    const level = match[1].length;
    const text = match[2].trim();

    // Generate slug-like ID
    let baseId = text
      .toLowerCase()
      .replace(/[^a-z0-9가-힣\s-]/g, '')
      .replace(/\s+/g, '-')
      .slice(0, 50);

    // Handle duplicates
    const count = idCounts.get(baseId) || 0;
    idCounts.set(baseId, count + 1);
    const id = count > 0 ? `${baseId}-${count}` : baseId;

    toc.push({ id, text, level });
  }

  return toc;
}

function DocDetailView({ doc, onClose }: { doc: KnowledgeDocDetail | KnowledgeDoc; onClose: () => void }) {
  const [detailDoc, setDetailDoc] = useState<KnowledgeDocDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [activeTocId, setActiveTocId] = useState<string | null>(null);

  useEffect(() => {
    if ('content' in doc && doc.content) {
      setDetailDoc(doc as KnowledgeDocDetail);
      return;
    }

    setLoading(true);
    setError(null);
    api.getKnowledgeDoc(doc.id)
      .then(setDetailDoc)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [doc]);

  // KB-005: Parse TOC from markdown content
  const toc = useMemo(() => {
    if (!detailDoc || doc.format === 'html') return [];
    return parseToc(detailDoc.content);
  }, [detailDoc, doc.format]);

  // KB-005: Scroll to TOC section
  const scrollToSection = (tocId: string) => {
    if (!contentRef.current) return;

    // Find the heading element by matching text content
    const headings = contentRef.current.querySelectorAll('h2, h3');
    for (const heading of headings) {
      const headingText = heading.textContent || '';
      const slugText = headingText
        .toLowerCase()
        .replace(/[^a-z0-9가-힣\s-]/g, '')
        .replace(/\s+/g, '-')
        .slice(0, 50);

      if (tocId.startsWith(slugText)) {
        heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setActiveTocId(tocId);
        break;
      }
    }
  };

  const color = getDomainColor(doc.category);
  const isHub = doc.akb_type === 'hub';
  const showToc = toc.length > 0 && !loading && !error;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="shrink-0 p-4" style={{ borderBottom: '1px solid var(--terminal-border)' }}>
        <div className="flex items-center gap-2 mb-2">
          <button
            onClick={onClose}
            className="text-xs font-semibold cursor-pointer hover:opacity-70"
            style={{ color: 'var(--active-green)' }}
          >
            {'\u2190'} Back
          </button>
        </div>
        <div className="flex items-start gap-2 mb-2">
          <span className="text-lg">{isHub ? '📘' : doc.format === 'html' ? '🌐' : '📄'}</span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold mb-1" style={{ color: 'var(--terminal-text)' }}>{doc.title}</div>
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="w-2 h-2 rounded-full"
                style={{
                  background: doc.status === 'active' ? '#16a34a' : doc.status === 'draft' ? '#f59e0b' : '#94a3b8',
                }}
                title={doc.status}
              />
              <span className="text-[10px]" style={{ color: 'var(--terminal-text-muted)' }}>{doc.id}</span>
            </div>
            {doc.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {doc.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-1.5 py-0.5 rounded text-[9px] font-medium"
                    style={{ background: color.bg, color: color.text, border: `1px solid ${color.border}` }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        {doc.tldr && (
          <div className="text-[11px] italic leading-relaxed p-2 rounded" style={{ background: 'var(--hud-bg)', color: 'var(--terminal-text-secondary)' }}>
            {doc.tldr}
          </div>
        )}
      </div>

      {/* Content + TOC */}
      <div className="flex-1 overflow-hidden flex">
        {/* Main Content */}
        <div ref={contentRef} className="flex-1 overflow-y-auto p-4">
          {loading && (
            <div className="text-xs" style={{ color: 'var(--terminal-text-muted)' }}>Loading...</div>
          )}
          {error && (
            <div className="text-xs p-2 rounded" style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171' }}>
              {error}
            </div>
          )}
          {detailDoc && (
            <OfficeMarkdown content={detailDoc.content} />
          )}
        </div>

        {/* KB-005: TOC Sidebar */}
        {showToc && (
          <div
            className="shrink-0 overflow-y-auto p-3"
            style={{ width: 180, background: 'var(--hud-bg-alt)', borderLeft: '1px solid var(--terminal-border)' }}
          >
            <div className="text-[10px] font-bold uppercase mb-2" style={{ color: 'var(--terminal-text-muted)' }}>
              Contents
            </div>
            <div className="space-y-1">
              {toc.map((item) => (
                <button
                  key={item.id}
                  onClick={() => scrollToSection(item.id)}
                  className="block w-full text-left text-[10px] py-1 px-2 rounded cursor-pointer hover:bg-white/5 transition-colors"
                  style={{
                    paddingLeft: (item.level - 2) * 8 + 8,
                    color: activeTocId === item.id ? '#4ade80' : 'var(--terminal-text-secondary)',
                    fontWeight: activeTocId === item.id ? 'bold' : 'normal',
                  }}
                >
                  {item.text.length > 30 ? item.text.slice(0, 28) + '..' : item.text}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Knowledge Card ─────────────────────────────── */
/* TODO KB-002: Re-enable for Tree/List views */
// @ts-ignore - Will be used in KB-002
function _KnowledgeCard({
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
        background: isHub ? 'rgba(22,163,106,0.08)' : 'var(--hud-bg-alt)',
        border: `2px solid ${isHub ? 'rgba(22,163,106,0.4)' : 'var(--terminal-border)'}`,
      }}
    >
      <div
        className="p-3 cursor-pointer hover:bg-white/5"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start gap-2">
          <span className="shrink-0 text-sm">{isHub ? '\u{1F5C2}' : doc.format === 'html' ? '\u{1F310}' : '\u{1F4C4}'}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1 flex-wrap">
              <span className="font-semibold text-xs truncate" style={{ color: 'var(--terminal-text)' }}>{doc.title}</span>
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
          <span className="text-xs shrink-0" style={{ color: 'var(--terminal-text-muted)' }}>{expanded ? '\u25b2' : '\u25bc'}</span>
        </div>
        {!expanded && doc.tldr && (
          <div className="mt-1.5 text-[10px] line-clamp-2 ml-6" style={{ color: 'var(--terminal-text-secondary)' }}>{doc.tldr}</div>
        )}
      </div>

      {expanded && (
        <div className="px-3 pb-3" style={{ borderTop: '1px solid var(--terminal-border)' }}>
          {doc.tldr && (
            <div className="mt-2 text-[11px] leading-relaxed italic" style={{ color: 'var(--terminal-text-secondary)' }}>
              {doc.tldr}
            </div>
          )}
          {doc.links.length > 0 && (
            <div className="mt-2">
              <div className="text-[9px] font-bold uppercase mb-1" style={{ color: 'var(--terminal-text-muted)' }}>Cross-links</div>
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
                        background: isClickable ? 'rgba(22,163,106,0.15)' : 'rgba(148,163,184,0.1)',
                        color: isClickable ? '#4ade80' : 'var(--terminal-text-muted)',
                        border: `1px solid ${isClickable ? 'rgba(22,163,106,0.3)' : 'var(--terminal-border)'}`,
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
            style={{ color: 'var(--active-green)' }}
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
/* TODO KB-002: Re-enable for Tree/List views */
// @ts-ignore - Will be used in KB-002
function _DocDetail({
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
      <div className="flex-1 flex items-center justify-center text-xs" style={{ color: 'var(--terminal-text-muted)' }}>
        Loading...
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="flex-1 flex items-center justify-center text-xs" style={{ color: 'var(--terminal-text-muted)' }}>
        Failed to load document
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 shrink-0" style={{ borderBottom: '1px solid var(--terminal-border)' }}>
        <button
          onClick={onBack}
          className="text-xs font-semibold cursor-pointer hover:opacity-70"
          style={{ color: 'var(--active-green)' }}
        >
          {'\u2190'} Back
        </button>
        <div className="flex-1" />
        {editing ? (
          <>
            <button
              onClick={() => { setEditing(false); setEditContent(detail.content); }}
              className="px-2.5 py-1 text-[10px] rounded cursor-pointer"
              style={{ background: 'var(--hud-bg-alt)', color: 'var(--terminal-text-secondary)', border: '1px solid var(--terminal-border)' }}
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
              style={{ background: 'rgba(59,130,246,0.15)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.3)' }}
            >
              Edit
            </button>
            <button
              onClick={handleDelete}
              className="px-2.5 py-1 text-[10px] rounded cursor-pointer font-semibold"
              style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}
            >
              Delete
            </button>
          </>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5">
        <h2 className="text-sm font-bold mb-1" style={{ color: 'var(--terminal-text)' }}>{detail.title}</h2>
        {detail.tldr && !editing && (
          <div className="mb-3 text-xs italic" style={{ color: 'var(--terminal-text-secondary)' }}>{detail.tldr}</div>
        )}

        {detail.format === 'html' ? (
          editing ? (
            <textarea
              className="w-full h-full min-h-[400px] p-3 text-xs leading-relaxed rounded border resize-y"
              style={{
                fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
                background: 'var(--hud-bg)',
                color: 'var(--terminal-text)',
                border: '1px solid var(--terminal-border)',
              }}
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              spellCheck={false}
            />
          ) : (
            <iframe
              srcDoc={detail.content}
              sandbox="allow-same-origin"
              className="w-full flex-1 min-h-[400px] rounded"
              style={{ border: '1px solid var(--terminal-border)', background: 'var(--hud-bg-alt)' }}
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
          <div className="text-xs leading-relaxed" style={{ color: 'var(--terminal-text-secondary)' }} onClick={handleContentClick}>
            <OfficeMarkdown content={detail.content} />
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── New Doc Form ──────────────────────────────── */
/* TODO KB-002: Re-enable for Tree/List views */
// @ts-ignore - Will be used in KB-002
function _NewDocForm({
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
          style={{ color: 'var(--active-green)' }}
        >
          {'\u2190'} Cancel
        </button>
        <h2 className="text-sm font-bold" style={{ color: 'var(--terminal-text)' }}>New Document</h2>
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-[10px] font-semibold mb-1" style={{ color: 'var(--terminal-text-muted)' }}>TITLE</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Document title..."
            className="w-full px-3 py-2 text-xs rounded focus:outline-none"
              style={{ background: 'var(--hud-bg)', border: '1px solid var(--terminal-border)', color: 'var(--terminal-text)' }}
          />
        </div>
        <div>
          <label className="block text-[10px] font-semibold mb-1" style={{ color: 'var(--terminal-text-muted)' }}>FILENAME</label>
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              className="flex-1 px-3 py-2 text-xs rounded focus:outline-none font-mono"
              style={{ background: 'var(--hud-bg)', border: '1px solid var(--terminal-border)', color: 'var(--terminal-text)' }}
            />
            <span className="text-[10px]" style={{ color: 'var(--terminal-text-muted)' }}>.md</span>
          </div>
        </div>
        <div>
          <label className="block text-[10px] font-semibold mb-1" style={{ color: 'var(--terminal-text-muted)' }}>CATEGORY (optional)</label>
          <input
            type="text"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="e.g., tech, market, strategy"
            className="w-full px-3 py-2 text-xs rounded focus:outline-none"
              style={{ background: 'var(--hud-bg)', border: '1px solid var(--terminal-border)', color: 'var(--terminal-text)' }}
          />
        </div>

        {error && (
          <div className="text-[10px] px-3 py-1.5 rounded" style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171' }}>{error}</div>
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

export default function KnowledgePanel({ docs, onClose, onRefresh: _onRefresh, terminalWidth = 0, initialDocId: _initialDocId }: Props) {
  // Load view mode from localStorage, default to 'graph'
  const [view, setView] = useState<'graph' | 'tree' | 'list'>(() => {
    const saved = localStorage.getItem('kb-view-mode');
    return (saved === 'graph' || saved === 'tree' || saved === 'list') ? saved : 'graph';
  });
  const [graphSelectedDocId, setGraphSelectedDocId] = useState<string | null>(null);

  // KB-003: Search state
  const [searchQuery, setSearchQuery] = useState('');

  // KB-004: Domain filter state (Set of enabled domains)
  const [enabledDomains, setEnabledDomains] = useState<Set<string>>(
    () => new Set(Object.keys(DOMAIN_COLORS))
  );

  // Save view mode to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('kb-view-mode', view);
  }, [view]);

  // KB-003: Fuse.js fuzzy search
  const fuse = useMemo(() => {
    return new Fuse(docs, {
      keys: ['title', 'tldr', 'tags'],
      threshold: 0.3, // 0 = exact match, 1 = match anything
      includeScore: true,
    });
  }, [docs]);

  // KB-003 + KB-004: Matched IDs for Graph View (fade non-matching)
  const matchedIds = useMemo<Set<string> | null>(() => {
    let matched = new Set<string>(docs.map((d) => d.id));

    // Apply search filter
    if (searchQuery.trim()) {
      const searchResults = fuse.search(searchQuery);
      matched = new Set(searchResults.map((r) => r.item.id));
    }

    // Apply domain filter
    matched = new Set(Array.from(matched).filter((id) => {
      const doc = docs.find((d) => d.id === id);
      return doc && enabledDomains.has(doc.category);
    }));

    // If all docs are matched, return null (show all)
    return matched.size === docs.length ? null : matched;
  }, [docs, searchQuery, fuse, enabledDomains]);

  // KB-003 + KB-004: Filtered docs for Tree View (hard filter)
  const filteredDocs = useMemo(() => {
    if (matchedIds === null) return docs;
    return docs.filter((d) => matchedIds.has(d.id));
  }, [docs, matchedIds]);

  // Toggle domain filter
  const toggleDomain = (domain: string) => {
    setEnabledDomains((prev) => {
      const next = new Set(prev);
      if (next.has(domain)) {
        next.delete(domain);
      } else {
        next.add(domain);
      }
      return next;
    });
  };

  const { panelRight, panelWidth, isResizing, handleResizeStart } = usePanelResize(terminalWidth);

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
        className={`side-panel open fixed top-0 h-full z-50 flex flex-col border-l-[3px] shadow-[-4px_0_20px_rgba(0,0,0,0.4)] ${isResizing ? 'resizing' : ''}`}
        style={{ right: panelRight, width: panelWidth, background: 'var(--terminal-bg)', borderLeftColor: '#16a34a' }}
      >
        {/* Resize handle */}
        <div
          className={`absolute top-0 -left-[5px] w-[10px] h-full cursor-col-resize z-[60] transition-colors ${isResizing ? 'bg-white/10' : 'hover:bg-white/5'}`}
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

        {/* View mode toggle */}
        <div className="flex gap-1 p-2" style={{ borderBottom: '1px solid var(--terminal-border)' }}>
          <ViewModeBtn
            icon="🕸️"
            label="Graph"
            active={view === 'graph'}
            onClick={() => setView('graph')}
          />
          <ViewModeBtn
            icon="🌲"
            label="Tree"
            active={view === 'tree'}
            onClick={() => { setView('tree'); setGraphSelectedDocId(null); }}
          />
          <ViewModeBtn
            icon="📋"
            label="List"
            active={view === 'list'}
            onClick={() => { setView('list'); setGraphSelectedDocId(null); }}
          />
        </div>

        {/* KB-003: Search Bar + KB-004: Domain Filter Chips */}
        <div className="p-3 space-y-2" style={{ borderBottom: '1px solid var(--terminal-border)', background: 'var(--hud-bg-alt)' }}>
          {/* Search input */}
          <div className="relative">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm">🔍</span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search docs..."
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded focus:outline-none transition-colors"
              style={{
                background: 'var(--hud-bg)',
                border: '1px solid var(--terminal-border)',
                color: 'var(--terminal-text)',
              }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs hover:opacity-70"
                style={{ color: 'var(--terminal-text-muted)' }}
              >
                ✕
              </button>
            )}
          </div>

          {/* Domain filter chips */}
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(DOMAIN_COLORS).map(([domain, color]) => {
              const isEnabled = enabledDomains.has(domain);
              return (
                <button
                  key={domain}
                  onClick={() => toggleDomain(domain)}
                  className="px-2 py-1 text-[10px] font-medium rounded cursor-pointer transition-all"
                  style={{
                    background: isEnabled ? color.bg : 'transparent',
                    color: isEnabled ? color.text : 'var(--terminal-text-muted)',
                    border: `1px solid ${isEnabled ? color.border : 'var(--terminal-border)'}`,
                    opacity: isEnabled ? 1 : 0.5,
                  }}
                >
                  {domain}
                </button>
              );
            })}
          </div>

          {/* Results count */}
          <div className="text-[10px]" style={{ color: 'var(--terminal-text-muted)' }}>
            {filteredDocs.length === docs.length
              ? `${docs.length} documents`
              : `${filteredDocs.length} of ${docs.length} documents`}
          </div>
        </div>

        {/* ─── GRAPH VIEW ─── */}
        {view === 'graph' && (
          <div className="flex-1 overflow-hidden flex flex-col animate-fadeIn">
            <div className="flex-1 flex overflow-hidden">
              <KnowledgeGraph
                docs={docs}
                onNodeClick={handleGraphNodeClick}
                selectedDocId={graphSelectedDocId}
                matchedIds={matchedIds}
              />
              {/* Graph detail sidebar */}
              {selectedGraphDoc && (
                <div
                  className="shrink-0 overflow-y-auto p-3"
                  style={{ width: 200, background: 'var(--hud-bg-alt)', borderLeft: '1px solid var(--terminal-border)' }}
                >
                  <div className="text-[10px] font-bold uppercase mb-1" style={{ color: 'var(--terminal-text-muted)' }}>Selected</div>
                  <div className="text-xs font-bold mb-1" style={{ color: 'var(--terminal-text)' }}>{selectedGraphDoc.title}</div>
                  <div
                    className="w-2 h-2 rounded-full mb-2"
                    style={{
                      background: selectedGraphDoc.status === 'active' ? '#16a34a' : selectedGraphDoc.status === 'draft' ? '#f59e0b' : '#94a3b8',
                    }}
                  />
                  {selectedGraphDoc.tldr && (
                    <div className="text-[10px] mb-2 leading-relaxed" style={{ color: 'var(--terminal-text-secondary)' }}>{selectedGraphDoc.tldr}</div>
                  )}
                  {selectedGraphDoc.links.length > 0 && (
                    <div className="mb-2">
                      <div className="text-[9px] font-bold mb-1" style={{ color: 'var(--terminal-text-muted)' }}>Links</div>
                      {selectedGraphDoc.links.slice(0, 5).map((link, i) => (
                        <div key={i} className="text-[9px] mb-0.5 truncate" style={{ color: 'var(--terminal-text-secondary)' }}>{'\u{1F517}'} {link.text}</div>
                      ))}
                    </div>
                  )}
                  {/* TODO KB-002: Add "Open Document" button when doc detail view is implemented */}
                </div>
              )}
            </div>
            {/* Legend */}
            <div className="shrink-0 p-2" style={{ borderTop: '1px solid var(--terminal-border)' }}>
              <div className="flex flex-wrap gap-2">
                {Object.entries(DOMAIN_COLORS).map(([name, c]) => (
                  <div key={name} className="flex items-center gap-1 text-[9px]">
                    <div className="w-2 h-2" style={{ background: c.border }} />
                    <span style={{ color: 'var(--terminal-text-muted)' }}>{name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ─── TREE VIEW ─── */}
        {view === 'tree' && (
          <TreeView
            docs={docs}
            onDocumentClick={(docId) => setGraphSelectedDocId(docId)}
            selectedDocId={graphSelectedDocId}
            matchedIds={matchedIds}
          />
        )}

        {/* ─── LIST VIEW (Placeholder for KB-002) ─── */}
        {view === 'list' && (
          <PlaceholderView
            icon="📋"
            title="List View"
            message="Coming soon in KB-002"
            description="Table format with sortable columns and quick scanning"
          />
        )}

      </div>
    </>
  );
}

/* ─── View Mode Button ─────────────────────────────── */

function ViewModeBtn({
  icon,
  label,
  active,
  onClick,
}: {
  icon: string;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded cursor-pointer transition-all"
      style={{
        background: active ? 'rgba(22,163,106,0.2)' : 'transparent',
        color: active ? '#4ade80' : 'var(--terminal-text-muted)',
        border: active ? '1px solid rgba(22,163,106,0.4)' : '1px solid transparent',
      }}
    >
      <span className="text-sm">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

/* ─── Placeholder View ─────────────────────────────── */

function PlaceholderView({
  icon,
  title,
  message,
  description,
}: {
  icon: string;
  title: string;
  message: string;
  description: string;
}) {
  return (
    <div className="flex-1 flex items-center justify-center p-8 animate-fadeIn">
      <div className="text-center max-w-md">
        <div className="text-6xl mb-4">{icon}</div>
        <div className="text-lg font-bold mb-2" style={{ color: 'var(--terminal-text)' }}>
          {title}
        </div>
        <div className="text-sm mb-3" style={{ color: '#4ade80' }}>
          {message}
        </div>
        <div className="text-xs leading-relaxed" style={{ color: 'var(--terminal-text-muted)' }}>
          {description}
        </div>
      </div>
    </div>
  );
}

export { usePanelResize };
