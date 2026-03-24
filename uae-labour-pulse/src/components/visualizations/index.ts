/**
 * Barrel export for advanced visualization components.
 *
 * All components are self-contained with built-in fallback data and can be
 * imported individually (for React.lazy) or via this barrel.
 */

export { default as EmirRaceChart } from './EmirRaceChart';
export { default as SectorRadar } from './SectorRadar';
export { default as LabourPulse } from './LabourPulse';
export { default as AIScorecardsGrid, AIScorecard } from './AIScorecard';

export type { SectorScorecard, AIScorecardProps, AIScorecardsGridProps } from './AIScorecard';
