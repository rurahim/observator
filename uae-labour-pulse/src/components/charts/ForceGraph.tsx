/**
 * ForceGraph — Neural Atlas style. Compact layout, gradient edges,
 * breathing nodes, spring settling, glassmorphism tooltip.
 * Performance: pre-computed layout, single rAF loop, CSS animations.
 */
import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import * as d3 from 'd3';
import { Search, X } from 'lucide-react';
import type { GraphNode, GraphEdge } from '@/api/graphTypes';
import GraphDetailPanel from './GraphDetailPanel';

interface ForceGraphProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  height?: number;
  onNodeSelect?: (node: GraphNode | null) => void;
  colorMap?: Record<string, string>;
  showEdgeLabels?: boolean;
  title?: string;
  searchValue?: string;
  onSearchChange?: (v: string) => void;
}

interface SimNode extends d3.SimulationNodeDatum {
  id: string; label: string; type: string; size: number;
  color_group: string; metadata: Record<string, any>; r: number;
}

interface SimEdge extends d3.SimulationLinkDatum<SimNode> {
  weight: number; label?: string; type: string;
  sourceId: string; targetId: string;
}

const CM: Record<string, string> = {
  gap: '#F43F5E', matched: '#10B981', oversupply: '#3B82F6', unknown: '#94A3B8',
  occupation: '#1E3A5F', institution: '#8B5CF6', course: '#5BA3C9',
  origin: '#C9A84C', related: '#007DB5', knowledge: '#1E3A5F',
  skill: '#007DB5', 'skill/competence': '#007DB5', technology: '#C9A84C',
  competence: '#00A86B', essential: '#1E3A5F', optional: '#94A3B8', default: '#94A3B8',
};

function c(n: { color_group: string; type: string }, m: Record<string, string>): string {
  return m[n.color_group] ?? m[n.type] ?? m.default;
}

export default function ForceGraph({
  nodes, edges, height = 500, onNodeSelect, colorMap, title, searchValue, onSearchChange,
}: ForceGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [internalSearch, setInternalSearch] = useState('');
  const searchTerm = searchValue ?? internalSearch;
  const setSearchTerm = onSearchChange ?? setInternalSearch;
  const cm = useMemo(() => ({ ...CM, ...colorMap }), [colorMap]);

  const searchMatchIds = useMemo(() => {
    if (!searchTerm.trim()) return null;
    const term = searchTerm.toLowerCase();
    const m = new Set<string>();
    for (const n of nodes) if (n.label.toLowerCase().includes(term)) m.add(n.id);
    if (m.size > 0) for (const e of edges) {
      const s = typeof e.source === 'object' ? (e.source as any).id : e.source;
      const t = typeof e.target === 'object' ? (e.target as any).id : e.target;
      if (m.has(s)) m.add(t); if (m.has(t)) m.add(s);
    }
    return m;
  }, [searchTerm, nodes, edges]);

  useEffect(() => {
    const el = containerRef.current; if (!el) return;
    const obs = new ResizeObserver(entries => { for (const e of entries) setWidth(e.contentRect.width); });
    obs.observe(el); setWidth(el.clientWidth);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const el = containerRef.current; if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setIsVisible(true); obs.disconnect(); }
    }, { threshold: 0.05 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const legendCategories = useMemo(() => {
    const map = new Map<string, number>();
    for (const n of nodes) { const k = n.color_group || n.type; map.set(k, (map.get(k) ?? 0) + 1); }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [nodes]);

  const selectedNode = useMemo(() => nodes.find(n => n.id === selectedId) ?? null, [nodes, selectedId]);
  const connectedNodes = useMemo(() => {
    if (!selectedId) return [];
    const nb = new Set<string>();
    for (const e of edges) {
      const s = typeof e.source === 'object' ? (e.source as any).id : e.source;
      const t = typeof e.target === 'object' ? (e.target as any).id : e.target;
      if (s === selectedId) nb.add(t); if (t === selectedId) nb.add(s);
    }
    return nodes.filter(n => nb.has(n.id));
  }, [selectedId, nodes, edges]);

  useEffect(() => {
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    if (!nodes.length || !isVisible) return;

    // Radii
    const occD = nodes.filter(n => n.type === 'occupation').map(n => n.metadata?.demand_jobs ?? 0);
    const maxD = Math.max(1, ...occD);
    const simNodes: SimNode[] = nodes.map(n => ({
      ...n,
      r: Math.round(n.type === 'occupation'
        ? 10 + Math.sqrt((n.metadata?.demand_jobs ?? 0) / maxD) * 16  // sqrt scale, max ~26px
        : n.color_group === 'matched' ? 6 : 5),
    }));

    const nodeById = new Map(simNodes.map(n => [n.id, n]));
    const simEdges: SimEdge[] = edges
      .filter(e => nodeById.has(e.source) && nodeById.has(e.target))
      .map(e => ({ source: e.source, target: e.target, weight: e.weight, label: e.label, type: e.type, sourceId: e.source, targetId: e.target }));

    const nc = simNodes.length;
    const charge = nc > 200 ? -40 : nc > 100 ? -80 : -160;
    const linkDist = nc > 200 ? 30 : nc > 100 ? 45 : 65;

    // Pre-compute layout
    const sim = d3.forceSimulation<SimNode>(simNodes)
      .force('link', d3.forceLink<SimNode, SimEdge>(simEdges).id((d: any) => d.id).distance(linkDist))
      .force('charge', d3.forceManyBody<SimNode>().strength(charge))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide<SimNode>().radius((d: any) => d.r + 8))
      .force('x', d3.forceX(width / 2).strength(0.08))
      .force('y', d3.forceY(height / 2).strength(0.08))
      .stop();
    sim.tick(Math.min(nc, 160));

    // Save final + random scatter start
    const cx = width / 2, cy = height / 2;
    const scatter = Math.min(width, height) * 0.55;
    const pos = simNodes.map(n => {
      const a = Math.random() * Math.PI * 2;
      const d = Math.random() * scatter;
      return { fx: n.x!, fy: n.y!, sx: cx + Math.cos(a) * d, sy: cy + Math.sin(a) * d };
    });

    // ── SVG Defs ──
    const defs = svg.append('defs');

    // CSS for breathing + hover (GPU-accelerated)
    defs.append('style').text(`
      @keyframes breathe { 0%,100% { opacity:0.82; } 50% { opacity:0.95; } }
      .fg-n circle { animation: breathe 3s ease-in-out infinite; }
      .fg-n:hover circle { opacity:1 !important; stroke-width:2.5px !important; stroke:#fff !important; }
      .fg-n:hover { filter: drop-shadow(0 0 6px var(--nc)); }
    `);

    // Background gradient
    const bg = defs.append('radialGradient').attr('id', 'fgbg').attr('cx', '50%').attr('cy', '50%').attr('r', '70%');
    bg.append('stop').attr('offset', '0%').attr('stop-color', '#F1F5F9');
    bg.append('stop').attr('offset', '100%').attr('stop-color', '#E2E8F0');

    svg.append('rect').attr('width', width).attr('height', height).attr('fill', 'url(#fgbg)').attr('rx', 14)
      .on('click', () => { setSelectedId(null); onNodeSelect?.(null); });

    const zoomG = svg.append('g');
    svg.call(d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.1, 8])
      .on('zoom', ev => zoomG.attr('transform', ev.transform)));

    // Edges — curved with color from target node
    const edgeEls = zoomG.selectAll<SVGPathElement, SimEdge>('path.edge')
      .data(simEdges).join('path').attr('class', 'edge')
      .attr('fill', 'none')
      .attr('stroke', d => { const t = nodeById.get(d.targetId); return t ? c(t, cm) : '#ccc'; })
      .attr('stroke-opacity', 0).attr('stroke-width', 1).attr('stroke-linecap', 'round');

    // Nodes
    const nodeGs = zoomG.selectAll<SVGGElement, SimNode>('g.fg-n')
      .data(simNodes).join('g').attr('class', 'fg-n')
      .style('cursor', 'pointer').style('opacity', 0)
      .style('--nc' as any, d => c(d, cm));

    // Main circle
    nodeGs.append('circle')
      .attr('r', d => d.r)
      .attr('fill', d => c(d, cm))
      .attr('stroke', 'rgba(255,255,255,0.5)').attr('stroke-width', 1);

    // Occupation name labels (below node)
    nodeGs.filter(d => d.type === 'occupation').append('text')
      .attr('text-anchor', 'middle').attr('dy', d => d.r + 10)
      .attr('font-size', 8).attr('font-weight', '600').attr('fill', '#1E293B')
      .attr('pointer-events', 'none')
      .text(d => d.label.length > 20 ? d.label.slice(0, 18) + '..' : d.label);

    // Skill name labels (below node, smaller, lighter)
    nodeGs.filter(d => d.type === 'skill').append('text')
      .attr('text-anchor', 'middle').attr('dy', d => d.r + 9)
      .attr('font-size', 6).attr('font-weight', '400').attr('fill', '#94A3B8')
      .attr('pointer-events', 'none')
      .text(d => d.label.length > 16 ? d.label.slice(0, 14) + '..' : d.label);

    // ── DUST SETTLING ──
    const SETTLE = 2500;
    const t0 = performance.now();
    let raf: number;

    // Pre-compute edge source/target indices
    const eSrc = simEdges.map(e => simNodes.indexOf(e.source as SimNode));
    const eTgt = simEdges.map(e => simNodes.indexOf(e.target as SimNode));

    function tick(now: number) {
      const elapsed = now - t0;
      const t = Math.min(1, elapsed / SETTLE);
      // Damped spring: overshoot then settle
      const spring = 1 - Math.exp(-4.5 * t) * Math.cos(2.5 * Math.PI * t);
      const opacity = Math.min(1, t * 4);

      const xs: number[] = [], ys: number[] = [];
      const nodeElems = zoomG.selectAll<SVGGElement, SimNode>('g.fg-n').nodes();
      for (let i = 0; i < simNodes.length; i++) {
        const p = pos[i];
        const x = p.sx + (p.fx - p.sx) * spring;
        const y = p.sy + (p.fy - p.sy) * spring;
        xs.push(x); ys.push(y);
        nodeElems[i].setAttribute('transform', `translate(${x},${y})`);
        nodeElems[i].style.opacity = String(opacity);
      }

      // Edges — curved (slight bend for visual interest)
      const eOp = Math.max(0, (t - 0.1) / 0.9) * 0.18;
      const edgeNodes = zoomG.selectAll<SVGPathElement, SimEdge>('path.edge').nodes();
      for (let i = 0; i < simEdges.length; i++) {
        const si = eSrc[i], ti = eTgt[i];
        if (si < 0 || ti < 0) continue;
        const sx = xs[si], sy = ys[si], tx = xs[ti], ty = ys[ti];
        // Perpendicular offset for subtle curve
        const mx = (sx + tx) / 2, my = (sy + ty) / 2;
        const dx = tx - sx, dy = ty - sy;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const off = len * 0.12; // 12% bend
        const cx2 = mx + (-dy / len) * off, cy2 = my + (dx / len) * off;
        edgeNodes[i].setAttribute('d', `M${sx},${sy} Q${cx2},${cy2} ${tx},${ty}`);
        edgeNodes[i].setAttribute('stroke-opacity', String(eOp));
      }

      if (t < 1) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);

    // ── Tooltip ──
    const tt = tooltipRef.current;
    nodeGs
      .on('mouseenter', function (ev: MouseEvent, d: SimNode) {
        if (!tt) return;
        const r = svgRef.current?.getBoundingClientRect(); if (!r) return;
        tt.style.left = `${ev.clientX - r.left + 14}px`;
        tt.style.top = `${ev.clientY - r.top - 12}px`;
        tt.style.display = 'block';
        const col = c(d, cm);
        const meta = Object.entries(d.metadata).filter(([, v]) => v != null && v !== '').slice(0, 5)
          .map(([k, v]) => `<div style="display:flex;justify-content:space-between;gap:8px"><span style="color:#94A3B8">${k.replace(/_/g, ' ')}</span><b>${v}</b></div>`).join('');
        tt.innerHTML = `<div style="border-left:3px solid ${col};padding-left:8px"><b style="font-size:12px;color:#0F172A">${d.label}</b><br/><span style="font-size:9px;padding:1px 5px;border-radius:3px;background:${col}15;color:${col};font-weight:600">${d.color_group.toUpperCase()}</span> <span style="color:#94A3B8;font-size:10px">${d.type}</span>${meta ? '<div style="margin-top:4px;font-size:10px;line-height:1.6">' + meta + '</div>' : ''}</div>`;
      })
      .on('mousemove', function (ev: MouseEvent) {
        if (tt) { const r = svgRef.current?.getBoundingClientRect(); if (r) { tt.style.left = `${ev.clientX - r.left + 14}px`; tt.style.top = `${ev.clientY - r.top - 12}px`; } }
      })
      .on('mouseleave', () => { if (tt) tt.style.display = 'none'; })
      .on('click', function (_, d: SimNode) {
        const newId = d.id === selectedId ? null : d.id;
        setSelectedId(newId);
        const allN = zoomG.selectAll<SVGGElement, SimNode>('g.fg-n');
        const allE = zoomG.selectAll<SVGPathElement, SimEdge>('path.edge');
        if (!newId) {
          allN.style('opacity', 1); allE.attr('stroke-opacity', 0.18);
        } else {
          const conn = new Set<string>([newId]);
          simEdges.forEach(e => {
            const s = typeof e.source === 'object' ? (e.source as any).id : e.source;
            const t2 = typeof e.target === 'object' ? (e.target as any).id : e.target;
            if (s === newId) conn.add(t2); if (t2 === newId) conn.add(s);
          });
          allN.style('opacity', d2 => conn.has(d2.id) ? 1 : 0.08);
          allE.attr('stroke-opacity', d2 => {
            const s = typeof d2.source === 'object' ? (d2.source as any).id : d2.source;
            const t2 = typeof d2.target === 'object' ? (d2.target as any).id : d2.target;
            return (s === newId || t2 === newId) ? 0.5 : 0.02;
          });
        }
        onNodeSelect?.(newId ? nodes.find(n2 => n2.id === d.id) ?? null : null);
      });

    return () => { sim.stop(); cancelAnimationFrame(raf); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges, width, height, cm, isVisible]);

  // Search highlight
  useEffect(() => {
    const svg = d3.select(svgRef.current); if (!svg.node()) return;
    const ng = svg.selectAll<SVGGElement, SimNode>('g.fg-n');
    const ep = svg.selectAll<SVGPathElement, SimEdge>('path.edge');
    if (!searchMatchIds) { ng.style('opacity', 1); ep.attr('stroke-opacity', 0.18); return; }
    ng.style('opacity', (d: any) => searchMatchIds.has(d.id) ? 1 : 0.05);
    ep.attr('stroke-opacity', (d: any) => {
      const s = typeof d.source === 'object' ? d.source.id : d.source;
      const t = typeof d.target === 'object' ? d.target.id : d.target;
      return (searchMatchIds.has(s) && searchMatchIds.has(t)) ? 0.4 : 0.01;
    });
  }, [searchMatchIds]);

  const handleClosePanel = useCallback(() => { setSelectedId(null); onNodeSelect?.(null); }, [onNodeSelect]);
  const matchCount = searchTerm ? nodes.filter(n => n.label.toLowerCase().includes(searchTerm.toLowerCase())).length : 0;

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center justify-between mb-3 gap-3">
        {title && (
          <div className="flex items-center gap-2 min-w-0">
            <h3 className="text-sm font-bold text-gray-800 truncate">{title}</h3>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#1E3A5F]/8 text-[#1E3A5F] border border-[#1E3A5F]/10">{nodes.length} nodes</span>
          </div>
        )}
        <div className="relative w-56 flex-shrink-0">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search occupations & skills..."
            className="w-full pl-8 pr-8 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/15 bg-white" />
          {searchTerm && <button onClick={() => setSearchTerm('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X className="w-3 h-3" /></button>}
          {searchTerm && <span className="absolute -bottom-4 left-0 text-[9px] text-gray-400">{matchCount > 0 ? `${matchCount} found` : 'Loading...'}</span>}
        </div>
      </div>

      <div className="relative rounded-2xl overflow-hidden border border-gray-200/50" style={{ minHeight: height, boxShadow: '0 2px 16px rgba(0,0,0,0.04)' }}>
        {!isVisible && <div className="flex items-center justify-center" style={{ height }}><div className="text-center text-gray-400"><div className="w-6 h-6 border-2 border-gray-200 border-t-[#003366] rounded-full animate-spin mx-auto mb-2" /><p className="text-xs">Loading...</p></div></div>}
        <svg ref={svgRef} width={width} height={isVisible ? height : 0} className="select-none" style={{ display: isVisible ? 'block' : 'none' }} />
        <div ref={tooltipRef} className="pointer-events-none absolute hidden z-20 rounded-xl px-3.5 py-2.5 max-w-[260px]"
          style={{ display: 'none', background: 'rgba(255,255,255,0.95)', border: '1px solid rgba(0,0,0,0.06)', backdropFilter: 'blur(12px)', boxShadow: '0 8px 30px rgba(0,0,0,0.1)' }} />
        {selectedNode && <GraphDetailPanel node={selectedNode} connectedNodes={connectedNodes} onClose={handleClosePanel} colorMap={colorMap} />}
      </div>

      {legendCategories.length > 0 && (
        <div className="flex flex-wrap gap-3 mt-2 px-1">
          {legendCategories.map(([cat, count]) => (
            <div key={cat} className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cm[cat] ?? cm.default }} />
              <span className="text-[10px] text-gray-500">{cat} ({count})</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
