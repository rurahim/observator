/**
 * InsightPanel — Contextual explanation + data-driven insight + actionable recommendation.
 *
 * Use below every chart/section to help newcomers and decision-makers understand:
 *   1. WHAT the data shows (explanation)
 *   2. WHY it matters (insight)
 *   3. WHAT TO DO about it (recommendation)
 */
import { Lightbulb, Info, TrendingUp, AlertTriangle, CheckCircle, ArrowRight } from 'lucide-react';
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

const STYLES: Record<Severity, { bg: string; border: string; icon: string; accent: string }> = {
  info:     { bg: 'bg-blue-50/80', border: 'border-blue-200/60', icon: 'text-blue-500', accent: 'text-blue-700' },
  success:  { bg: 'bg-emerald-50/80', border: 'border-emerald-200/60', icon: 'text-emerald-500', accent: 'text-emerald-700' },
  warning:  { bg: 'bg-amber-50/80', border: 'border-amber-200/60', icon: 'text-amber-500', accent: 'text-amber-700' },
  critical: { bg: 'bg-red-50/80', border: 'border-red-200/60', icon: 'text-red-500', accent: 'text-red-700' },
};

const ICONS: Record<Severity, typeof Info> = {
  info: Info,
  success: CheckCircle,
  warning: AlertTriangle,
  critical: AlertTriangle,
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
      <div className={`flex items-start gap-2 mt-3 px-3 py-2 rounded-lg border ${s.bg} ${s.border}`}>
        <Lightbulb className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${s.icon}`} />
        <p className={`text-[11px] leading-relaxed ${s.accent}`}>{explanation}</p>
      </div>
    );
  }

  return (
    <div className={`mt-4 rounded-xl border ${s.bg} ${s.border} overflow-hidden`}>
      {/* Explanation */}
      <div className="px-4 py-3 flex items-start gap-2.5">
        <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${s.icon}`} />
        <div className="min-w-0">
          <p className={`text-xs font-medium ${s.accent}`}>{explanation}</p>
        </div>
      </div>

      {/* Insight + Recommendation */}
      {(insight || recommendation) && (
        <div className="px-4 pb-3 space-y-2">
          {insight && (
            <div className="flex items-start gap-2 pl-6">
              <TrendingUp className="w-3 h-3 mt-0.5 shrink-0 text-gray-400" />
              <p className="text-[11px] text-gray-600 leading-relaxed">
                <span className="font-semibold text-gray-700">{t('رؤية', 'Insight')}:</span> {insight}
              </p>
            </div>
          )}
          {recommendation && (
            <div className="flex items-start gap-2 pl-6">
              <ArrowRight className="w-3 h-3 mt-0.5 shrink-0 text-gray-400" />
              <p className="text-[11px] text-gray-600 leading-relaxed">
                <span className="font-semibold text-gray-700">{t('توصية', 'Action')}:</span> {recommendation}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Source */}
      {source && (
        <div className="px-4 py-1.5 bg-white/40 border-t border-gray-200/40">
          <p className="text-[10px] text-gray-400">{t('المصدر', 'Source')}: {source}</p>
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
