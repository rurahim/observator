import { motion } from 'framer-motion';
import { LucideIcon, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Area, AreaChart, ResponsiveContainer } from 'recharts';
import { type DataStatus, DATA_STATUS_META } from '@/utils/methodology';
import { useLanguage } from '@/contexts/LanguageContext';

type Status = 'critical' | 'warning' | 'info' | 'success';

interface KPICardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  unit?: string;
  trend?: number;
  trendContext?: string;
  status: Status;
  sparkData?: number[];
  delay?: number;
  /** Data maturity label — shown as badge (UK ONS standard) */
  dataStatus?: DataStatus;
  /** Short source attribution — shown as footnote (OECD standard) */
  sourceLabel?: string;
  /** Margin of error text — shown inline (BLS standard) */
  marginOfError?: string;
}

const statusColors: Record<Status, { border: string; spark: string; trend: string; bg: string }> = {
  critical: { border: 'border-t-sgi-critical', spark: '#DE350B', trend: 'text-sgi-critical', bg: 'bg-sgi-critical/10' },
  warning: { border: 'border-t-sgi-shortage', spark: '#FFAB00', trend: 'text-sgi-shortage', bg: 'bg-sgi-shortage/10' },
  info: { border: 'border-t-teal', spark: '#007DB5', trend: 'text-teal', bg: 'bg-teal-light' },
  success: { border: 'border-t-sgi-balanced', spark: '#00875A', trend: 'text-sgi-balanced', bg: 'bg-sgi-balanced/10' },
};

const KPICard = ({
  icon: Icon, label, value, unit, trend, trendContext,
  status, sparkData, delay = 0,
  dataStatus, sourceLabel, marginOfError,
}: KPICardProps) => {
  const { t } = useLanguage();
  const colors = statusColors[status];
  const TrendIcon = trend != null && trend > 0 ? TrendingUp : trend != null && trend < 0 ? TrendingDown : Minus;
  const data = (sparkData ?? []).map(v => ({ v }));
  const dsMeta = dataStatus ? DATA_STATUS_META[dataStatus] : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className={`bg-card rounded-xl border border-border-light shadow-card hover:shadow-card-hover transition-shadow border-t-2 ${colors.border} p-4`}
    >
      {/* ── Header row: icon + label + data status badge ── */}
      <div className="flex items-center gap-2 mb-3">
        <div className={`p-1.5 rounded-lg ${colors.bg}`}>
          <Icon className="w-4 h-4" style={{ color: colors.spark }} />
        </div>
        <span className="text-xs text-text-muted font-medium flex-1">{label}</span>
        {dsMeta && (
          <span
            className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0"
            style={{
              backgroundColor: dsMeta.color + '15',
              color: dsMeta.color,
              border: `1px solid ${dsMeta.color}35`,
            }}
            title={dsMeta.description}
            role="status"
          >
            {t(dsMeta.labelAr, dsMeta.label)}
          </span>
        )}
      </div>

      {/* ── Value row ── */}
      <div className="flex items-end justify-between">
        <div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold text-primary tabular-nums">{value}</span>
            {unit && <span className="text-sm text-text-muted">{unit}</span>}
          </div>
          {/* Margin of error (BLS standard: shown with every estimate) */}
          {marginOfError && (
            <span className="text-[9px] text-text-muted" title={t('هامش الخطأ', 'Margin of error')}>
              {marginOfError}
            </span>
          )}
          {trend != null && (
            <div className="flex items-center gap-1 mt-1.5">
              <TrendIcon className={`w-3.5 h-3.5 ${colors.trend}`} />
              <span className={`text-xs font-medium ${colors.trend} tabular-nums`}>
                {trend > 0 ? '+' : ''}{trend}%
              </span>
              {trendContext && <span className="text-xs text-text-muted">{trendContext}</span>}
            </div>
          )}
        </div>

        <div className="w-20 h-10">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <Area
                type="monotone"
                dataKey="v"
                stroke={colors.spark}
                fill={colors.spark}
                fillOpacity={0.1}
                strokeWidth={1.5}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Source footnote (OECD: every data point must cite its source) ── */}
      {sourceLabel && (
        <p className="text-[9px] text-text-muted mt-2 pt-1.5 border-t border-border-light leading-relaxed truncate" title={sourceLabel}>
          {t('المصدر', 'Source')}: {sourceLabel}
        </p>
      )}
    </motion.div>
  );
};

export default KPICard;
