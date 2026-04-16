/**
 * InsightPanel — Contextual explanation + data-driven insight + actionable recommendation.
 *
 * Use below every chart/section to help newcomers and decision-makers understand:
 *   1. WHAT the data shows (explanation)
 *   2. WHY it matters (insight)
 *   3. WHAT TO DO about it (recommendation)
 */
import { Lightbulb, Info, TrendingUp, AlertTriangle, CheckCircle, ArrowRight, ShieldAlert, Flame } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

type Severity = 'info' | 'success' | 'warning' | 'critical';

interface InsightPanelProps {
  /** One-line what this data means */
  explanation: string;
  /** Data-driven insight — dynamic, based on actual values */
  insight?: string;
  /** Actionable recommendation for decision-makers */
  recommendation?: string;
  /** Visual severity */
  severity?: Severity;
  /** Data source label shown at bottom */
  source?: string;
  /** Compact mode — single line */
  compact?: boolean;
}

const STYLES: Record<Severity, {
  bg: string; border: string; icon: string; accent: string;
  headerBg: string; insightBg: string; actionBg: string; actionBorder: string;
  badge: string; badgeText: string;
}> = {
  info: {
    bg: 'bg-blue-50/90', border: 'border-blue-200/70', icon: 'text-blue-600', accent: 'text-blue-800',
    headerBg: 'bg-blue-100/60', insightBg: 'bg-blue-50', actionBg: 'bg-blue-100/40', actionBorder: 'border-blue-200/50',
    badge: 'bg-blue-100', badgeText: 'text-blue-700',
  },
  success: {
    bg: 'bg-emerald-50/90', border: 'border-emerald-200/70', icon: 'text-emerald-600', accent: 'text-emerald-800',
    headerBg: 'bg-emerald-100/60', insightBg: 'bg-emerald-50', actionBg: 'bg-emerald-100/40', actionBorder: 'border-emerald-200/50',
    badge: 'bg-emerald-100', badgeText: 'text-emerald-700',
  },
  warning: {
    bg: 'bg-amber-50/90', border: 'border-amber-300/70', icon: 'text-amber-600', accent: 'text-amber-900',
    headerBg: 'bg-amber-100/70', insightBg: 'bg-amber-50', actionBg: 'bg-amber-100/50', actionBorder: 'border-amber-200/60',
    badge: 'bg-amber-200', badgeText: 'text-amber-800',
  },
  critical: {
    bg: 'bg-red-50/90', border: 'border-red-300/80', icon: 'text-red-600', accent: 'text-red-900',
    headerBg: 'bg-red-100/70', insightBg: 'bg-red-50', actionBg: 'bg-red-100/50', actionBorder: 'border-red-300/60',
    badge: 'bg-red-200', badgeText: 'text-red-800',
  },
};

const ICONS: Record<Severity, typeof Info> = {
  info: Info,
  success: CheckCircle,
  warning: AlertTriangle,
  critical: ShieldAlert,
};

const LABELS: Record<Severity, { en: string; ar: string }> = {
  info: { en: 'Information', ar: 'معلومات' },
  success: { en: 'Positive Signal', ar: 'إشارة إيجابية' },
  warning: { en: 'Attention Required', ar: 'يتطلب اهتماماً' },
  critical: { en: 'Critical Alert', ar: 'تنبيه حرج' },
};

const InsightPanel = ({
  explanation,
  insight,
  recommendation,
  severity = 'info',
  source,
  compact = false,
}: InsightPanelProps) => {
  const { t } = useLanguage();
  const s = STYLES[severity];
  const Icon = ICONS[severity];

  if (compact) {
    return (
      <div className={`flex items-start gap-2 mt-3 px-3 py-2 rounded-lg border-l-4 ${s.bg} ${s.border}`}>
        <Icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${s.icon}`} />
        <p className={`text-[11px] leading-relaxed font-medium ${s.accent}`}>{explanation}</p>
      </div>
    );
  }

  return (
    <div className={`mt-4 rounded-xl border-l-4 border ${s.bg} ${s.border} overflow-hidden shadow-sm`}>
      {/* Header with severity badge */}
      <div className={`px-4 py-3 ${s.headerBg} flex items-start gap-2.5`}>
        <Icon className={`w-4.5 h-4.5 mt-0.5 shrink-0 ${s.icon}`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${s.badge} ${s.badgeText}`}>
              {t(LABELS[severity].ar, LABELS[severity].en)}
            </span>
          </div>
          <p className={`text-xs font-semibold leading-relaxed ${s.accent}`}>{explanation}</p>
        </div>
      </div>

      {/* Insight + Recommendation */}
      {(insight || recommendation) && (
        <div className="px-4 py-3 space-y-2.5">
          {insight && (
            <div className={`flex items-start gap-2.5 rounded-lg px-3 py-2.5 ${s.insightBg} border ${s.actionBorder}`}>
              <TrendingUp className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${s.icon}`} />
              <div>
                <span className={`text-[10px] font-bold uppercase tracking-wide ${s.accent}`}>{t('رؤية تحليلية', 'Insight')}</span>
                <p className="text-[11px] text-gray-700 leading-relaxed mt-0.5">{insight}</p>
              </div>
            </div>
          )}
          {recommendation && (
            <div className={`flex items-start gap-2.5 rounded-lg px-3 py-2.5 ${s.actionBg} border ${s.actionBorder}`}>
              <ArrowRight className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${s.icon}`} />
              <div>
                <span className={`text-[10px] font-bold uppercase tracking-wide ${s.accent}`}>{t('إجراءات مطلوبة', 'Recommended Actions')}</span>
                <p className="text-[11px] text-gray-700 leading-relaxed mt-0.5">{recommendation}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Source */}
      {source && (
        <div className="px-4 py-1.5 bg-white/50 border-t border-gray-200/40">
          <p className="text-[10px] text-gray-400 italic">{t('المصدر', 'Source')}: {source}</p>
        </div>
      )}
    </div>
  );
};

export default InsightPanel;

/**
 * Helper: Generate severity from a numeric value and thresholds.
 */
export function severityFromValue(
  value: number,
  thresholds: { critical: number; warning: number; success: number },
  higherIsBad = true,
): Severity {
  if (higherIsBad) {
    if (value >= thresholds.critical) return 'critical';
    if (value >= thresholds.warning) return 'warning';
    if (value >= thresholds.success) return 'success';
    return 'info';
  }
  if (value <= thresholds.critical) return 'critical';
  if (value <= thresholds.warning) return 'warning';
  if (value >= thresholds.success) return 'success';
  return 'info';
}
