import { useState, useCallback } from 'react';

interface LegendItem {
  value: string;
  color: string;
  dataKey: string;
}

interface InteractiveLegendProps {
  items: LegendItem[];
  /** Called when visibility changes. Returns set of hidden dataKeys. */
  onToggle: (hiddenKeys: Set<string>) => void;
}

const InteractiveLegend = ({ items, onToggle }: InteractiveLegendProps) => {
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const toggle = useCallback(
    (dataKey: string) => {
      setHidden(prev => {
        const next = new Set(prev);
        if (next.has(dataKey)) next.delete(dataKey);
        else next.add(dataKey);
        onToggle(next);
        return next;
      });
    },
    [onToggle]
  );

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 mt-2">
      {items.map(item => {
        const isHidden = hidden.has(item.dataKey);
        return (
          <button
            key={item.dataKey}
            onClick={() => toggle(item.dataKey)}
            className={`flex items-center gap-1.5 text-[11px] font-medium transition-opacity duration-200 hover:opacity-80 ${
              isHidden ? 'opacity-30' : 'opacity-100'
            }`}
          >
            <div
              className="w-3 h-3 rounded-sm shrink-0 transition-opacity duration-200"
              style={{
                backgroundColor: item.color,
                opacity: isHidden ? 0.3 : 1,
              }}
            />
            <span className={isHidden ? 'line-through text-text-muted' : 'text-text-secondary'}>
              {item.value}
            </span>
          </button>
        );
      })}
    </div>
  );
};

/** Hook to manage legend visibility state */
export const useChartLegend = () => {
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(new Set());
  const isHidden = useCallback((key: string) => hiddenKeys.has(key), [hiddenKeys]);
  return { hiddenKeys, setHiddenKeys, isHidden };
};

export default InteractiveLegend;
