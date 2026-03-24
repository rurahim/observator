import { formatNumber } from '@/utils/formatters';

interface PayloadEntry {
  name: string;
  value: number;
  color: string;
  dataKey: string;
  payload: Record<string, unknown>;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: PayloadEntry[];
  label?: string;
  /** Optional unit suffix like "%" or "/100" */
  unit?: string;
  /** Optional formatter override */
  formatter?: (value: number, name: string) => string;
}

const ChartTooltip = ({ active, payload, label, unit = '', formatter }: ChartTooltipProps) => {
  if (!active || !payload?.length) return null;

  return (
    <div className="bg-card border border-border-light rounded-xl shadow-dropdown px-3.5 py-2.5 min-w-[160px]">
      {label && (
        <div className="text-[11px] font-semibold text-primary border-b border-border-light pb-1.5 mb-1.5">
          {label}
        </div>
      )}
      <div className="space-y-1">
        {payload.map((entry, i) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1.5">
              <div
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-[11px] text-text-secondary">{entry.name}</span>
            </div>
            <span className="text-[11px] font-semibold text-primary tabular-nums">
              {formatter
                ? formatter(entry.value, entry.name)
                : `${formatNumber(entry.value)}${unit}`}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ChartTooltip;
