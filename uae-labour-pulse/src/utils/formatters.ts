/**
 * Number & data formatting utilities for Observator
 */

/** Format large numbers: 1250000 → "1.25M", 45000 → "45K" */
export const formatCompact = (value: number | null | undefined): string => {
  if (value == null || isNaN(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}K`;
  return value.toLocaleString();
};

/** Format number with locale commas: 1250000 → "1,250,000" */
export const formatNumber = (value: number | null | undefined): string => {
  if (value == null || isNaN(value)) return '—';
  return value.toLocaleString();
};

/** Format percentage with 1 decimal: 42.345 → "42.3%" */
export const formatPercent = (value: number | null | undefined, decimals = 1): string => {
  if (value == null || isNaN(value)) return '—';
  return `${value.toFixed(decimals)}%`;
};

/** Format trend with sign: 12.3 → "+12.3%", -5.1 → "-5.1%" */
export const formatTrend = (value: number | null | undefined): string => {
  if (value == null || isNaN(value)) return '—';
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;
};

/** Y-axis tick formatter for thousands */
export const tickK = (v: number | null | undefined): string => {
  if (v == null || isNaN(v)) return '0';
  return `${(v / 1000).toFixed(0)}K`;
};

/** Tooltip value formatter with locale commas */
export const tooltipValue = (v: number | string): string =>
  typeof v === 'number' ? v.toLocaleString() : v;
