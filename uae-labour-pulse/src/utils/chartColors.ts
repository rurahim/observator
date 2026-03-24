/**
 * Central chart color palette — all charts must use these colors.
 * No hardcoded hex values outside this file.
 */

// ── Primary Series Colors ────────────────────────────────────────────────────
export const SERIES_COLORS = [
  '#003366', // Navy
  '#007DB5', // Teal
  '#C9A84C', // Gold
  '#00875A', // Emerald
  '#B87333', // Copper
  '#4A6FA5', // Slate
  '#D4726A', // Coral
  '#002347', // Deep Blue
] as const;

// ── SGI Status Colors ────────────────────────────────────────────────────────
export const SGI_COLORS = {
  critical: '#DE350B',
  shortage: '#FFAB00',
  balanced: '#00875A',
  surplus: '#0052CC',
  oversupply: '#6B1D3D',
} as const;

// ── Chart Grid & Axis ────────────────────────────────────────────────────────
export const CHART_GRID = '#E2E8F0';
export const CHART_AXIS = '#718096';
export const CHART_AXIS_LIGHT = '#A0AEC0';
export const CHART_LABEL = '#4A5568';

// ── Named Colors (for semantic reference) ────────────────────────────────────
export const COLORS = {
  navy: '#003366',
  teal: '#007DB5',
  gold: '#C9A84C',
  emerald: '#00875A',
  copper: '#B87333',
  slate: '#4A6FA5',
  coral: '#D4726A',
  deepBlue: '#002347',
  red: '#E74C3C',
} as const;

// ── Sector Colors (fixed mapping for consistency across pages) ────────────────
export const SECTOR_COLORS: Record<string, string> = {
  Technology: COLORS.navy,
  Healthcare: COLORS.emerald,
  Finance: COLORS.gold,
  Energy: COLORS.coral,
  Construction: COLORS.teal,
  Education: COLORS.copper,
  'Finance & Insurance': COLORS.gold,
  'IT & Communications': COLORS.navy,
  'Professional Services': COLORS.slate,
  'Public Administration': COLORS.teal,
  Agriculture: COLORS.emerald,
};

// ── Helper Functions ─────────────────────────────────────────────────────────

/** Get a series color by index, cycling through the palette. */
export function getSeriesColor(index: number): string {
  return SERIES_COLORS[index % SERIES_COLORS.length];
}

/** Get radar chart styling for a series at the given index. */
export function getRadarStyle(index: number) {
  const color = getSeriesColor(index);
  return {
    stroke: color,
    fill: color,
    fillOpacity: 0.12,
    strokeWidth: 2,
  };
}

/** Get an area gradient ID for a given color key. Use with ChartGradientDefs. */
export function getAreaGradientId(colorKey: string): string {
  return `gradient-${colorKey}`;
}

// ── Common Chart Props ───────────────────────────────────────────────────────

/** Standard axis tick styling */
export const AXIS_TICK = { fontSize: 11, fill: CHART_AXIS } as const;
export const AXIS_TICK_SM = { fontSize: 10, fill: CHART_AXIS } as const;

/** Standard label tick for radar radius */
export const RADIUS_TICK = { fontSize: 9, fill: CHART_AXIS_LIGHT } as const;

/** Standard polar angle axis tick for radar */
export const POLAR_TICK = { fontSize: 11, fill: CHART_LABEL, fontWeight: 500 } as const;

/** Standard grid props */
export const GRID_PROPS = {
  strokeDasharray: '3 3',
  stroke: CHART_GRID,
} as const;

/** Standard bar radius for rounded tops */
export const BAR_RADIUS: [number, number, number, number] = [3, 3, 0, 0];
export const BAR_RADIUS_H: [number, number, number, number] = [0, 3, 3, 0];
