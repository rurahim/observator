/**
 * Reusable SVG gradient definitions for area charts.
 * Place inside any Recharts chart component to enable gradient fills.
 *
 * Usage: <ChartGradientDefs /> inside <AreaChart> or <ComposedChart>
 * Then reference: fill="url(#gradient-navy)"
 */
import { COLORS } from '@/utils/chartColors';

const gradients: { id: string; color: string }[] = [
  { id: 'gradient-navy', color: COLORS.navy },
  { id: 'gradient-teal', color: COLORS.teal },
  { id: 'gradient-gold', color: COLORS.gold },
  { id: 'gradient-emerald', color: COLORS.emerald },
  { id: 'gradient-coral', color: COLORS.coral },
  { id: 'gradient-copper', color: COLORS.copper },
  { id: 'gradient-slate', color: COLORS.slate },
  { id: 'gradient-confidence', color: COLORS.teal },
];

const ChartGradientDefs = () => (
  <defs>
    {gradients.map(({ id, color }) => (
      <linearGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1">
        <stop offset="5%" stopColor={color} stopOpacity={0.18} />
        <stop offset="95%" stopColor={color} stopOpacity={0.04} />
      </linearGradient>
    ))}
  </defs>
);

export default ChartGradientDefs;
