import { useState, useRef, useCallback } from 'react';
import { Maximize2, Minimize2, Download, Table2, Shield } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface ChartToolbarProps {
  title: string;
  /** Ref to the chart container for screenshot export */
  chartRef?: React.RefObject<HTMLDivElement>;
  /** Raw data for CSV export */
  data?: Record<string, unknown>[];
  /** Quality score 0-100 — shows traffic light badge next to title */
  qualityScore?: number | null;
  /** Render function for fullscreen chart */
  children: React.ReactNode;
}

const QualityBadge = ({ score }: { score: number }) => {
  const color = score >= 80 ? 'text-emerald-600 bg-emerald-500/10'
    : score >= 50 ? 'text-amber-500 bg-amber-500/10'
    : 'text-red-500 bg-red-500/10';
  const label = score >= 80 ? 'High' : score >= 50 ? 'Med' : 'Low';
  return (
    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold ${color}`} title={`Data Quality: ${score}/100`}>
      <Shield className="w-2.5 h-2.5" />
      {label}
    </span>
  );
};

const ChartToolbar = ({ title, data, qualityScore, children }: ChartToolbarProps) => {
  const [fullscreen, setFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const exportCSV = useCallback(() => {
    if (!data?.length) return;
    const keys = Object.keys(data[0]);
    const csv = [
      keys.join(','),
      ...data.map(row => keys.map(k => `"${row[k] ?? ''}"`).join(',')),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/[^a-zA-Z0-9]/g, '_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [data, title]);

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-primary">{title}</h3>
          {qualityScore != null && <QualityBadge score={qualityScore} />}
        </div>
        <div className="flex items-center gap-1">
          {data && data.length > 0 && (
            <button
              onClick={exportCSV}
              className="p-1.5 rounded-lg hover:bg-surface-tertiary transition-colors group"
              title="Export CSV"
            >
              <Table2 className="w-3.5 h-3.5 text-text-muted group-hover:text-navy transition-colors" />
            </button>
          )}
          <button
            onClick={() => setFullscreen(true)}
            className="p-1.5 rounded-lg hover:bg-surface-tertiary transition-colors group"
            title="Fullscreen"
          >
            <Maximize2 className="w-3.5 h-3.5 text-text-muted group-hover:text-navy transition-colors" />
          </button>
        </div>
      </div>

      <div ref={containerRef}>{children}</div>

      {/* Fullscreen Modal */}
      <AnimatePresence>
        {fullscreen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-6"
            onClick={() => setFullscreen(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-card rounded-2xl shadow-dropdown border border-border-light w-full max-w-5xl max-h-[85vh] overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-4 border-b border-border-light">
                <h3 className="text-base font-semibold text-primary">{title}</h3>
                <div className="flex items-center gap-2">
                  {data && data.length > 0 && (
                    <button
                      onClick={exportCSV}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-tertiary text-xs font-medium text-text-secondary hover:bg-surface-hover transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Export CSV
                    </button>
                  )}
                  <button
                    onClick={() => setFullscreen(false)}
                    className="p-1.5 rounded-lg hover:bg-surface-tertiary transition-colors"
                  >
                    <Minimize2 className="w-4 h-4 text-text-muted" />
                  </button>
                </div>
              </div>
              <div className="p-6" style={{ height: 'calc(85vh - 64px)' }}>
                {children}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default ChartToolbar;
