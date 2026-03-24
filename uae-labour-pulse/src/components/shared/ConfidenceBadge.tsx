/**
 * ConfidenceBadge — Inline uncertainty indicator for data values.
 *
 * Aligned with:
 *  - US BLS: ±margin shown with every published estimate
 *  - Eurostat: Standard error / CV on all survey-based indicators
 *  - UK ONS: Quality indicators displayed alongside data
 *
 * Three display modes:
 *  1. `badge`  — Small colored pill: "±15%" or "High / Medium / Low"
 *  2. `inline` — Text appended after the value: "1,234 ±12%"
 *  3. `tooltip`— Icon-only, details shown on hover
 */
import { Info } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

export type ConfidenceTier = 'high' | 'medium' | 'low' | 'unknown';

interface ConfidenceBadgeProps {
  /** Confidence tier — determines color */
  tier: ConfidenceTier;
  /** Optional margin of error text e.g. "±15%" */
  margin?: string;
  /** Display mode */
  mode?: 'badge' | 'inline' | 'tooltip';
  /** Optional full explanation (shown on hover for all modes) */
  detail?: string;
}

const TIER_META: Record<ConfidenceTier, { label: string; labelAr: string; color: string; bg: string }> = {
  high:    { label: 'High confidence',    labelAr: 'ثقة عالية',     color: 'text-green-700',  bg: 'bg-green-50 border-green-200' },
  medium:  { label: 'Medium confidence',  labelAr: 'ثقة متوسطة',    color: 'text-amber-700',  bg: 'bg-amber-50 border-amber-200' },
  low:     { label: 'Low confidence',     labelAr: 'ثقة منخفضة',    color: 'text-red-700',    bg: 'bg-red-50 border-red-200' },
  unknown: { label: 'Confidence unknown', labelAr: 'ثقة غير معروفة', color: 'text-slate-500',  bg: 'bg-slate-50 border-slate-200' },
};

export const ConfidenceBadge = ({ tier, margin, mode = 'badge', detail }: ConfidenceBadgeProps) => {
  const { t } = useLanguage();
  const meta = TIER_META[tier];
  const hoverText = detail || `${t(meta.labelAr, meta.label)}${margin ? ` (${margin})` : ''}`;

  if (mode === 'tooltip') {
    return (
      <span title={hoverText} className="inline-flex items-center cursor-help">
        <Info className={`w-3 h-3 ${meta.color} opacity-60`} aria-hidden="true" />
        <span className="sr-only">{hoverText}</span>
      </span>
    );
  }

  if (mode === 'inline') {
    return (
      <span className={`text-[9px] ${meta.color} opacity-75 ml-1`} title={hoverText}>
        {margin || t(meta.labelAr, meta.label)}
      </span>
    );
  }

  // badge mode (default)
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[8px] font-semibold uppercase tracking-wider px-1 py-0.5 rounded border ${meta.bg} ${meta.color}`}
      title={hoverText}
    >
      {margin || (tier === 'high' ? '●' : tier === 'medium' ? '◐' : '○')}
    </span>
  );
};

/**
 * Determine confidence tier based on data source characteristics.
 * Used to auto-assign confidence to table rows.
 */
export function getConfidenceTier(source?: string | null, supplyCount?: number, demandCount?: number): ConfidenceTier {
  if (!source) return 'unknown';

  const src = source.toLowerCase();

  // Administrative register data = high confidence
  if (src.includes('mohre') || src.includes('bayanat') || src.includes('glmm')) {
    return 'high';
  }

  // Web-scraped data = medium confidence
  if (src.includes('linkedin') || src.includes('jsearch')) {
    return 'medium';
  }

  // Derived / estimated data = low confidence
  if (src.includes('estimated') || src.includes('proportional')) {
    return 'low';
  }

  // Small sample sizes = lower confidence
  if (supplyCount != null && supplyCount < 100) return 'low';
  if (demandCount != null && demandCount < 50) return 'low';

  return 'medium';
}

/**
 * Get margin of error text based on data source type.
 */
export function getMarginOfError(source?: string | null): string | undefined {
  if (!source) return undefined;
  const src = source.toLowerCase();

  if (src.includes('mohre') || src.includes('bayanat') || src.includes('glmm')) {
    return '±2%';  // Administrative data
  }
  if (src.includes('linkedin')) {
    return '±15%';  // Web scrape
  }
  if (src.includes('jsearch')) {
    return '±20%';  // API sample
  }
  return '±25%';  // Default for derived/mixed
}

export default ConfidenceBadge;
