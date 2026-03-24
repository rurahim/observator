import { useMemo, useRef, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Activity } from 'lucide-react';
import { COLORS } from '@/utils/chartColors';
import { formatCompact } from '@/utils/formatters';

// -- Types ------------------------------------------------------------------

interface MonthDatum {
  month: string;  // e.g. "2024-09"
  count: number;
}

interface LabourPulseProps {
  /** Monthly job posting volumes. Falls back to sample data if omitted. */
  data?: MonthDatum[];
  /** Component height in pixels. Default 120. */
  height?: number;
  /** Label shown beside the pulse dot. Default "Job Pulse". */
  label?: string;
}

// -- Fallback data -----------------------------------------------------------

const DEFAULT_DATA: MonthDatum[] = [
  { month: '2024-07', count: 84 },
  { month: '2024-08', count: 128 },
  { month: '2024-09', count: 219 },
  { month: '2024-10', count: 3639 },
  { month: '2024-11', count: 5211 },
  { month: '2024-12', count: 4987 },
  { month: '2025-01', count: 6013 },
  { month: '2025-02', count: 7341 },
  { month: '2025-03', count: 6889 },
];

// -- Helpers -----------------------------------------------------------------

/** Build an SVG polyline/path `d` attribute from data points. */
function buildPath(
  data: MonthDatum[],
  width: number,
  height: number,
  padX: number,
  padY: number,
): string {
  if (data.length < 2) return '';
  const maxVal = Math.max(...data.map(d => d.count));
  const minVal = Math.min(...data.map(d => d.count));
  const rangeVal = maxVal - minVal || 1;
  const usableW = width - padX * 2;
  const usableH = height - padY * 2;
  const stepX = usableW / (data.length - 1);

  const points = data.map((d, i) => {
    const x = padX + i * stepX;
    const y = padY + usableH - ((d.count - minVal) / rangeVal) * usableH;
    return { x, y };
  });

  // Build a smooth cubic bezier through the points
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const cpx1 = prev.x + stepX * 0.4;
    const cpx2 = curr.x - stepX * 0.4;
    d += ` C ${cpx1} ${prev.y}, ${cpx2} ${curr.y}, ${curr.x} ${curr.y}`;
  }
  return d;
}

/** Return segment info for coloring: list of { startIdx, endIdx, anomaly } */
function getSegments(data: MonthDatum[]): { from: number; to: number; anomaly: boolean }[] {
  if (data.length < 2) return [];
  const avg = data.reduce((s, d) => s + d.count, 0) / data.length;
  const threshold = avg * 2;
  const segments: { from: number; to: number; anomaly: boolean }[] = [];
  for (let i = 0; i < data.length - 1; i++) {
    const anomaly = data[i].count > threshold || data[i + 1].count > threshold;
    segments.push({ from: i, to: i + 1, anomaly });
  }
  return segments;
}

// -- Component ---------------------------------------------------------------

const LabourPulse = ({
  data,
  height = 120,
  label = 'Job Pulse',
}: LabourPulseProps) => {
  const series = data && data.length > 0 ? data : DEFAULT_DATA;
  const svgRef = useRef<SVGSVGElement>(null);
  const [svgWidth, setSvgWidth] = useState(400);

  // Observe container width
  useEffect(() => {
    if (!svgRef.current) return;
    const parent = svgRef.current.parentElement;
    if (!parent) return;
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        setSvgWidth(entry.contentRect.width);
      }
    });
    observer.observe(parent);
    setSvgWidth(parent.clientWidth);
    return () => observer.disconnect();
  }, []);

  const padX = 8;
  const padY = 12;

  const fullPath = useMemo(
    () => buildPath(series, svgWidth, height, padX, padY),
    [series, svgWidth, height],
  );

  const segments = useMemo(() => getSegments(series), [series]);

  // Build per-segment paths for coloring
  const segmentPaths = useMemo(() => {
    if (series.length < 2) return [];
    const maxVal = Math.max(...series.map(d => d.count));
    const minVal = Math.min(...series.map(d => d.count));
    const rangeVal = maxVal - minVal || 1;
    const usableW = svgWidth - padX * 2;
    const usableH = height - padY * 2;
    const stepX = usableW / (series.length - 1);

    const pts = series.map((d, i) => ({
      x: padX + i * stepX,
      y: padY + usableH - ((d.count - minVal) / rangeVal) * usableH,
    }));

    return segments.map(seg => {
      const prev = pts[seg.from];
      const curr = pts[seg.to];
      const cpx1 = prev.x + stepX * 0.4;
      const cpx2 = curr.x - stepX * 0.4;
      return {
        d: `M ${prev.x} ${prev.y} C ${cpx1} ${prev.y}, ${cpx2} ${curr.y}, ${curr.x} ${curr.y}`,
        anomaly: seg.anomaly,
      };
    });
  }, [series, segments, svgWidth, height]);

  // Last point coordinates for the pulsing dot
  const lastPoint = useMemo(() => {
    if (series.length < 2) return { x: padX, y: height / 2 };
    const maxVal = Math.max(...series.map(d => d.count));
    const minVal = Math.min(...series.map(d => d.count));
    const rangeVal = maxVal - minVal || 1;
    const usableW = svgWidth - padX * 2;
    const usableH = height - padY * 2;
    const stepX = usableW / (series.length - 1);
    const last = series[series.length - 1];
    return {
      x: padX + (series.length - 1) * stepX,
      y: padY + usableH - ((last.count - minVal) / rangeVal) * usableH,
    };
  }, [series, svgWidth, height]);

  const latestValue = series[series.length - 1].count;
  const latestMonth = series[series.length - 1].month;

  const pathRef = useRef<SVGPathElement>(null);

  return (
    <div className="bg-card rounded-xl border border-border-light shadow-card px-4 py-3 overflow-hidden">
      {/* Top row: label + current value */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-teal" />
          <span className="text-xs font-semibold text-text-secondary">{label}</span>
        </div>
        <div className="flex items-center gap-2">
          <motion.div
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: COLORS.emerald }}
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
          />
          <span className="text-lg font-bold text-primary tabular-nums">
            {formatCompact(latestValue)}
          </span>
          <span className="text-[10px] text-text-muted">{latestMonth}</span>
        </div>
      </div>

      {/* SVG pulse line */}
      <div className="w-full" style={{ height }}>
        <svg
          ref={svgRef}
          width="100%"
          height={height}
          viewBox={`0 0 ${svgWidth} ${height}`}
          preserveAspectRatio="none"
          className="overflow-visible"
        >
          {/* Hidden full path to measure length */}
          <path
            ref={pathRef}
            d={fullPath}
            fill="none"
            stroke="transparent"
            strokeWidth={0}
          />

          {/* Colored segments */}
          {segmentPaths.map((seg, i) => (
            <motion.path
              key={i}
              d={seg.d}
              fill="none"
              stroke={seg.anomaly ? COLORS.red : COLORS.emerald}
              strokeWidth={2}
              strokeLinecap="round"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{
                pathLength: {
                  duration: 0.6,
                  delay: i * 0.15,
                  ease: 'easeOut',
                },
                opacity: { duration: 0.1, delay: i * 0.15 },
              }}
            />
          ))}

          {/* Glow under the line (subtle) */}
          <path
            d={fullPath}
            fill="none"
            stroke={COLORS.emerald}
            strokeWidth={6}
            strokeLinecap="round"
            opacity={0.08}
          />

          {/* Pulsing dot at the latest point */}
          <motion.circle
            cx={lastPoint.x}
            cy={lastPoint.y}
            r={4}
            fill={COLORS.emerald}
            animate={{
              r: [4, 7, 4],
              opacity: [1, 0.5, 1],
            }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
          <circle
            cx={lastPoint.x}
            cy={lastPoint.y}
            r={3}
            fill={COLORS.emerald}
          />
        </svg>
      </div>

      {/* Month labels */}
      <div className="flex justify-between mt-1">
        <span className="text-[9px] text-text-muted">{series[0].month}</span>
        <span className="text-[9px] text-text-muted">{latestMonth}</span>
      </div>
    </div>
  );
};

export default LabourPulse;
