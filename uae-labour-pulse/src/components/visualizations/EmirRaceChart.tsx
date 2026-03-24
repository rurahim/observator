import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Pause, RotateCcw } from 'lucide-react';
import { COLORS } from '@/utils/chartColors';
import { formatCompact } from '@/utils/formatters';

// -- Types ------------------------------------------------------------------

interface YearDatum {
  year: number;
  value: number;
}

interface EmirRaceChartProps {
  /** Ordered array of year/value pairs. Falls back to MOHRE data if omitted. */
  data?: YearDatum[];
  /** Title shown above the chart. */
  title?: string;
}

// -- Fallback data (MOHRE Emiratisation 2020-2024) --------------------------

const DEFAULT_DATA: YearDatum[] = [
  { year: 2020, value: 34510 },
  { year: 2021, value: 37569 },
  { year: 2022, value: 60136 },
  { year: 2023, value: 91773 },
  { year: 2024, value: 131883 },
];

// -- Component ---------------------------------------------------------------

const EmirRaceChart = ({ data, title = 'Emiratisation Race' }: EmirRaceChartProps) => {
  const series = data && data.length > 0 ? data : DEFAULT_DATA;
  const maxValue = Math.max(...series.map(d => d.value));

  // activeIndex tracks which year is currently "revealed" during autoplay.
  // -1 means nothing shown yet (initial state before play begins).
  const [activeIndex, setActiveIndex] = useState<number>(series.length - 1);
  const [playing, setPlaying] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Running total up to the activeIndex
  const runningTotal = series
    .slice(0, activeIndex + 1)
    .reduce((sum, d) => sum + d.value, 0);

  // Auto-advance logic
  useEffect(() => {
    if (!playing) return;
    if (activeIndex >= series.length - 1) {
      setPlaying(false);
      return;
    }
    timerRef.current = setTimeout(() => {
      setActiveIndex(prev => prev + 1);
    }, 900);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [playing, activeIndex, series.length]);

  const handlePlayPause = useCallback(() => {
    if (activeIndex >= series.length - 1) {
      // Reset and restart
      setActiveIndex(-1);
      // Small delay so the reset frame renders before play kicks in
      setTimeout(() => {
        setActiveIndex(0);
        setPlaying(true);
      }, 100);
    } else {
      setPlaying(p => !p);
      if (activeIndex < 0) setActiveIndex(0);
    }
  }, [activeIndex, series.length]);

  const handleReset = useCallback(() => {
    setPlaying(false);
    setActiveIndex(series.length - 1);
  }, [series.length]);

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: COLORS.navy }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-4 pb-2">
        <h3 className="text-sm font-semibold text-white/90">{title}</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={handleReset}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Reset"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handlePlayPause}
            className="w-8 h-8 rounded-lg flex items-center justify-center bg-white/10 text-white hover:bg-white/20 transition-colors"
            aria-label={playing ? 'Pause' : 'Play'}
          >
            {playing ? (
              <Pause className="w-4 h-4" />
            ) : (
              <Play className="w-4 h-4 ml-0.5" />
            )}
          </button>
        </div>
      </div>

      {/* Running total */}
      <div className="px-5 pb-3">
        <AnimatePresence mode="wait">
          <motion.div
            key={runningTotal}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.3 }}
            className="flex items-baseline gap-2"
          >
            <span
              className="text-3xl font-bold tabular-nums"
              style={{ color: COLORS.gold }}
            >
              {activeIndex >= 0 ? runningTotal.toLocaleString() : '--'}
            </span>
            <span className="text-xs text-white/50">cumulative Emiratis</span>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bars */}
      <div className="px-5 pb-5 space-y-2.5">
        {series.map((d, i) => {
          const pct = (d.value / maxValue) * 100;
          const visible = i <= activeIndex;
          return (
            <div key={d.year} className="flex items-center gap-3">
              <span className="w-10 text-xs font-medium text-white/70 tabular-nums text-right shrink-0">
                {d.year}
              </span>
              <div className="flex-1 h-7 rounded-md overflow-hidden bg-white/5 relative">
                <motion.div
                  className="h-full rounded-md"
                  style={{
                    background: `linear-gradient(90deg, ${COLORS.gold}CC, ${COLORS.gold})`,
                  }}
                  initial={{ width: 0 }}
                  animate={{ width: visible ? `${pct}%` : '0%' }}
                  transition={{
                    duration: 0.7,
                    ease: [0.25, 0.46, 0.45, 0.94],
                  }}
                />
                {visible && (
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.4, duration: 0.3 }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-white tabular-nums"
                  >
                    {formatCompact(d.value)}
                  </motion.span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Growth badge */}
      {activeIndex >= 1 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="px-5 pb-4"
        >
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white/10 text-xs font-medium text-white/80">
            <span style={{ color: COLORS.gold }}>
              +{Math.round(((series[activeIndex].value - series[0].value) / series[0].value) * 100)}%
            </span>
            growth from {series[0].year}
          </span>
        </motion.div>
      )}
    </div>
  );
};

export default EmirRaceChart;
