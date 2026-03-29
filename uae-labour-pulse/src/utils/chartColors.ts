/**
 * Central chart color palette — elegant blue shades with gold/teal accents.
 * No red in charts. All charts must use these colors.
 */

// ── Primary Series Colors (blue-dominant, charming) ─────────────────────────
export const SERIES_COLORS = [
  '#003366', // Deep Navy
  '#0A5C8A', // Ocean Blue
  '#007DB5', // Teal
  '#4A90C4', // Sky Blue
  '#C9A84C', // Gold accent
  '#2E7D6B', // Sage Teal
  '#6B8EB5', // Mist Blue
  '#1A3F5C', // Midnight
  '#5BA3C9', // Bright Azure
  '#002347', // Dark Navy
] as const;

// ── SGI Status Colors (blue shades, no red) ─────────────────────────────────
export const SGI_COLORS = {
  critical: '#1A3F5C',   // Deep Midnight (was red)
  shortage: '#C9A84C',   // Gold (attention)
  balanced: '#2E7D6B',   // Sage Teal (good)
  surplus: '#4A90C4',    // Sky Blue
  oversupply: '#6B8EB5', // Mist Blue
} as const;

// ── Chart Grid & Axis ───────────────────────────────────────────────────────
export const CHART_GRID = '#E2E8F0';
export const CHART_AXIS = '#718096';
export const CHART_AXIS_LIGHT = '#A0AEC0';
export const CHART_LABEL = '#4A5568';

// ── Named Colors (semantic reference) ───────────────────────────────────────
export const COLORS = {
  navy: '#003366',
  teal: '#007DB5',
  gold: '#C9A84C',
  emerald: '#2E7D6B',
  copper: '#5BA3C9',
  slate: '#6B8EB5',
  coral: '#4A90C4',
  deepBlue: '#002347',
  red: '#1A3F5C',  // NOT red — mapped to dark navy for backward compat
} as const;

// ── Sector Colors ───────────────────────────────────────────────────────────
export const SECTOR_COLORS: Record<string, string> = {
  Technology: '#003366',
  Healthcare: '#2E7D6B',
  Finance: '#C9A84C',
  Energy: '#0A5C8A',
  Construction: '#007DB5',
  Education: '#5BA3C9',
  'Finance & Insurance': '#C9A84C',
  'IT & Communications': '#003366',
  'Professional Services': '#6B8EB5',
  'Public Administration': '#007DB5',
  Agriculture: '#2E7D6B',
};

// ── Helper Functions ────────────────────────────────────────────────────────

export function getSeriesColor(index: number): string {
  return SERIES_COLORS[index % SERIES_COLORS.length];
}

export function getRadarStyle(index: number) {
  const color = getSeriesColor(index);
  return { stroke: color, fill: color, fillOpacity: 0.12, strokeWidth: 2 };
}

export function getAreaGradientId(colorKey: string): string {
  return `gradient-${colorKey}`;
}

// ── Common Chart Props ──────────────────────────────────────────────────────

export const AXIS_TICK = { fontSize: 11, fill: CHART_AXIS } as const;
export const AXIS_TICK_SM = { fontSize: 10, fill: CHART_AXIS } as const;
export const RADIUS_TICK = { fontSize: 9, fill: CHART_AXIS_LIGHT } as const;
export const POLAR_TICK = { fontSize: 11, fill: CHART_LABEL, fontWeight: 500 } as const;

export const GRID_PROPS = {
  strokeDasharray: '3 3',
  stroke: CHART_GRID,
} as const;

export const BAR_RADIUS: [number, number, number, number] = [3, 3, 0, 0];
export const BAR_RADIUS_H: [number, number, number, number] = [0, 3, 3, 0];
