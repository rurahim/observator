/**
 * BubbleCloud — force-directed interactive bubble visualization.
 * Nodes are sized by value, colored by category, with hover tooltips and click selection.
 * Uses a simple force simulation (no D3 dependency) with collision avoidance.
 */
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';

export interface BubbleNode {
  id: string;
  label: string;
  value: number;
  category: string;
  detail?: string;
  /** Optional sub-items shown on click */
  children?: { label: string; value: number }[];
}

interface Props {
  nodes: BubbleNode[];
  title?: string;
  height?: number;
  /** Color palette keyed by category */
  categoryColors?: Record<string, string>;
  onNodeClick?: (node: BubbleNode) => void;
  maxBubbles?: number;
}

const DEFAULT_COLORS: Record<string, string> = {
  knowledge: '#003366',
  skill: '#007DB5',
  technology: '#C9A84C',
  competence: '#00A86B',
  // Regions
  AUH: '#003366', DXB: '#C9A84C', SHJ: '#007DB5', AJM: '#00A86B',
  RAK: '#E85D75', FUJ: '#8B5CF6', UAQ: '#F59E0B',
  // Industries
  primary: '#003366', secondary: '#007DB5', tertiary: '#C9A84C',
  // Fallbacks
  default: '#94A3B8',
};

// Simple circle-packing layout (deterministic, no physics needed)
function packCircles(
  nodes: BubbleNode[],
  width: number,
  height: number,
  maxR: number,
  minR: number,
): { x: number; y: number; r: number; node: BubbleNode }[] {
  if (!nodes.length) return [];
  const maxVal = Math.max(...nodes.map(n => n.value));
  const minVal = Math.min(...nodes.map(n => n.value));
  const range = maxVal - minVal || 1;

  const sized = nodes.map(n => ({
    node: n,
    r: minR + ((n.value - minVal) / range) * (maxR - minR),
    x: 0,
    y: 0,
  }));

  // Sort largest first for better packing
  sized.sort((a, b) => b.r - a.r);

  // Place using spiral layout
  const cx = width / 2;
  const cy = height / 2;
  const placed: typeof sized = [];

  for (const item of sized) {
    let bestX = cx, bestY = cy;
    let angle = 0;
    let radius = 0;
    const step = 0.5;
    let found = false;

    for (let i = 0; i < 2000 && !found; i++) {
      const tx = cx + radius * Math.cos(angle);
      const ty = cy + radius * Math.sin(angle);

      // Check collision with all placed circles
      let collides = false;
      for (const p of placed) {
        const dx = tx - p.x;
        const dy = ty - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < item.r + p.r + 2) {
          collides = true;
          break;
        }
      }

      // Check bounds
      if (!collides && tx - item.r > 0 && tx + item.r < width && ty - item.r > 0 && ty + item.r < height) {
        bestX = tx;
        bestY = ty;
        found = true;
      }

      angle += step;
      radius += step * 0.15;
    }

    item.x = bestX;
    item.y = bestY;
    placed.push(item);
  }

  return placed;
}

export default function BubbleCloud({
  nodes,
  title,
  height = 420,
  categoryColors,
  onNodeClick,
  maxBubbles = 40,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [width, setWidth] = useState(800);

  // Responsive width
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(entries => {
      for (const e of entries) setWidth(e.contentRect.width);
    });
    obs.observe(el);
    setWidth(el.clientWidth);
    return () => obs.disconnect();
  }, []);

  const colors = useMemo(() => ({ ...DEFAULT_COLORS, ...categoryColors }), [categoryColors]);

  // Limit and layout
  const limited = useMemo(() => nodes.slice(0, maxBubbles), [nodes, maxBubbles]);
  const maxR = Math.min(width, height) * 0.12;
  const minR = Math.max(12, maxR * 0.2);

  const circles = useMemo(
    () => packCircles(limited, width, height, maxR, minR),
    [limited, width, height, maxR, minR],
  );

  // Categories for legend
  const categories = useMemo(() => {
    const cats = new Map<string, number>();
    limited.forEach(n => cats.set(n.category, (cats.get(n.category) || 0) + 1));
    return Array.from(cats.entries()).sort((a, b) => b[1] - a[1]);
  }, [limited]);

  const selectedNode = useMemo(
    () => limited.find(n => n.id === selected),
    [limited, selected],
  );

  const handleClick = useCallback((node: BubbleNode) => {
    setSelected(prev => prev === node.id ? null : node.id);
    onNodeClick?.(node);
  }, [onNodeClick]);

  const fmt = (v: number) => {
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
    return v.toLocaleString();
  };

  return (
    <div ref={containerRef} className="relative">
      {title && (
        <h3 className="text-sm font-bold text-gray-900 mb-2">{title}</h3>
      )}

      <div className="relative rounded-xl border border-gray-100 bg-gradient-to-br from-gray-50 to-white overflow-hidden">
        <svg
          ref={svgRef}
          width={width}
          height={height}
          className="select-none"
        >
          {/* Subtle grid */}
          <defs>
            <pattern id="bubbleGrid" width="40" height="40" patternUnits="userSpaceOnUse">
              <circle cx="20" cy="20" r="0.5" fill="#E2E8F0" />
            </pattern>
          </defs>
          <rect width={width} height={height} fill="url(#bubbleGrid)" />

          {/* Connection lines from selected to related */}
          {selected && circles.map(c => {
            if (c.node.id === selected) return null;
            if (c.node.category !== selectedNode?.category) return null;
            const sel = circles.find(cc => cc.node.id === selected);
            if (!sel) return null;
            return (
              <line
                key={`line-${c.node.id}`}
                x1={sel.x} y1={sel.y} x2={c.x} y2={c.y}
                stroke={colors[c.node.category] || colors.default}
                strokeWidth={1}
                strokeOpacity={0.2}
                strokeDasharray="3 3"
              />
            );
          })}

          {/* Bubbles */}
          {circles.map(({ x, y, r, node }) => {
            const isSelected = selected === node.id;
            const isHovered = hovered === node.id;
            const isFaded = selected && !isSelected && node.category !== selectedNode?.category;
            const color = colors[node.category] || colors.default;
            const showLabel = r > 18;

            return (
              <g
                key={node.id}
                className="cursor-pointer transition-all duration-300"
                style={{ opacity: isFaded ? 0.2 : 1 }}
                onClick={() => handleClick(node)}
                onMouseEnter={() => setHovered(node.id)}
                onMouseLeave={() => setHovered(null)}
              >
                {/* Glow on hover */}
                {(isHovered || isSelected) && (
                  <circle cx={x} cy={y} r={r + 4} fill="none" stroke={color} strokeWidth={2} strokeOpacity={0.4} />
                )}
                {/* Main bubble */}
                <circle
                  cx={x} cy={y} r={isHovered ? r + 2 : r}
                  fill={color}
                  fillOpacity={isSelected ? 0.95 : 0.75}
                  stroke={isSelected ? '#fff' : color}
                  strokeWidth={isSelected ? 3 : 1}
                  strokeOpacity={0.6}
                />
                {/* Label */}
                {showLabel && (
                  <>
                    <text
                      x={x} y={r > 28 ? y - 4 : y + 1}
                      textAnchor="middle"
                      className="fill-white font-semibold pointer-events-none"
                      style={{ fontSize: Math.max(8, Math.min(12, r * 0.4)) }}
                    >
                      {node.label.length > r * 0.35 ? node.label.slice(0, Math.floor(r * 0.35)) + '…' : node.label}
                    </text>
                    {r > 28 && (
                      <text
                        x={x} y={y + 10}
                        textAnchor="middle"
                        className="fill-white/80 pointer-events-none"
                        style={{ fontSize: Math.max(7, Math.min(10, r * 0.3)) }}
                      >
                        {fmt(node.value)}
                      </text>
                    )}
                  </>
                )}
              </g>
            );
          })}
        </svg>

        {/* Hover tooltip */}
        {hovered && !selected && (() => {
          const c = circles.find(cc => cc.node.id === hovered);
          if (!c) return null;
          const tooltipX = c.x > width / 2 ? c.x - 180 : c.x + c.r + 10;
          const tooltipY = Math.max(10, Math.min(height - 80, c.y - 30));
          return (
            <div
              className="absolute bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 pointer-events-none z-20"
              style={{ left: tooltipX, top: tooltipY, maxWidth: 200 }}
            >
              <p className="text-xs font-bold text-gray-900">{c.node.label}</p>
              <p className="text-[10px] text-gray-500">{c.node.category}</p>
              <p className="text-sm font-bold mt-0.5" style={{ color: colors[c.node.category] || colors.default }}>
                {fmt(c.node.value)}
              </p>
              {c.node.detail && <p className="text-[10px] text-gray-400 mt-0.5">{c.node.detail}</p>}
            </div>
          );
        })()}

        {/* Selected detail panel */}
        {selectedNode && (
          <div className="absolute right-3 top-3 w-56 bg-white/95 backdrop-blur border border-gray-200 rounded-xl shadow-xl p-3 z-30">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                style={{ backgroundColor: (colors[selectedNode.category] || colors.default) + '15', color: colors[selectedNode.category] || colors.default }}>
                {selectedNode.category}
              </span>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-xs">✕</button>
            </div>
            <h4 className="text-sm font-bold text-gray-900">{selectedNode.label}</h4>
            <p className="text-lg font-bold mt-1" style={{ color: colors[selectedNode.category] || colors.default }}>
              {fmt(selectedNode.value)}
            </p>
            {selectedNode.detail && <p className="text-[10px] text-gray-500 mt-1">{selectedNode.detail}</p>}
            {selectedNode.children && selectedNode.children.length > 0 && (
              <div className="mt-2 pt-2 border-t border-gray-100 space-y-1 max-h-32 overflow-auto">
                {selectedNode.children.slice(0, 8).map((ch, i) => (
                  <div key={i} className="flex items-center justify-between text-[10px]">
                    <span className="text-gray-600 truncate mr-2">{ch.label}</span>
                    <span className="font-semibold text-gray-900 tabular-nums">{fmt(ch.value)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-2 px-1">
        {categories.map(([cat, count]) => (
          <div key={cat} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: colors[cat] || colors.default }} />
            <span className="text-[10px] text-gray-500">{cat} ({count})</span>
          </div>
        ))}
      </div>
    </div>
  );
}
