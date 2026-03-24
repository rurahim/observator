import { useState, useMemo, useCallback } from 'react';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Tooltip, Legend,
} from 'recharts';
import { X } from 'lucide-react';
import { COLORS, POLAR_TICK, RADIUS_TICK, CHART_GRID } from '@/utils/chartColors';
import ChartTooltip from '@/components/charts/ChartTooltip';

// -- Types ------------------------------------------------------------------

interface SectorProfile {
  /** Display name */
  name: string;
  /** Values for each of the 5 axes, in order:
   * [Demand Volume, AI Exposure, Skill Diversity, Education Pipeline, Growth Rate] */
  values: [number, number, number, number, number];
}

interface SectorRadarProps {
  /** Sector profiles. Falls back to illustrative data if omitted or empty. */
  sectors?: SectorProfile[];
  /** Maximum sectors that can be compared simultaneously. Default 3. */
  maxCompare?: number;
}

// -- Constants ---------------------------------------------------------------

const AXES = [
  'Demand Volume',
  'AI Exposure',
  'Skill Diversity',
  'Education Pipeline',
  'Growth Rate',
] as const;

const PALETTE = [COLORS.navy, COLORS.gold, COLORS.teal] as const;

const DEFAULT_SECTORS: SectorProfile[] = [
  { name: 'IT & Communications', values: [80, 90, 70, 60, 85] },
  { name: 'Healthcare', values: [60, 40, 50, 80, 70] },
  { name: 'Construction', values: [70, 30, 40, 20, 50] },
  { name: 'Financial Services', values: [65, 75, 60, 55, 60] },
  { name: 'Education', values: [45, 35, 55, 90, 40] },
];

// -- Component ---------------------------------------------------------------

const SectorRadar = ({ sectors, maxCompare = 3 }: SectorRadarProps) => {
  const allSectors = sectors && sectors.length > 0 ? sectors : DEFAULT_SECTORS;

  // Selected sector names (default: first sector selected)
  const [selected, setSelected] = useState<string[]>(() => [allSectors[0].name]);

  const toggleSector = useCallback(
    (name: string) => {
      setSelected(prev => {
        if (prev.includes(name)) {
          // Cannot deselect the last one
          return prev.length > 1 ? prev.filter(s => s !== name) : prev;
        }
        if (prev.length >= maxCompare) {
          // Replace the oldest selection
          return [...prev.slice(1), name];
        }
        return [...prev, name];
      });
    },
    [maxCompare],
  );

  const removeSector = useCallback((name: string) => {
    setSelected(prev => (prev.length > 1 ? prev.filter(s => s !== name) : prev));
  }, []);

  // Build Recharts data
  const chartData = useMemo(() => {
    return AXES.map((axis, axisIdx) => {
      const point: Record<string, string | number> = { axis, fullMark: 100 };
      selected.forEach(sectorName => {
        const sector = allSectors.find(s => s.name === sectorName);
        if (sector) {
          point[sectorName] = sector.values[axisIdx];
        }
      });
      return point;
    });
  }, [selected, allSectors]);

  return (
    <div className="bg-card rounded-xl border border-border-light shadow-card p-4">
      {/* Header */}
      <h3 className="text-sm font-semibold text-primary mb-1">
        Sector AI Readiness Comparison
      </h3>
      <p className="text-xs text-text-muted mb-3">
        Select up to {maxCompare} sectors to compare across 5 readiness dimensions
      </p>

      {/* Sector pills */}
      <div className="flex flex-wrap gap-2 mb-4">
        {allSectors.map(sector => {
          const isActive = selected.includes(sector.name);
          const colorIdx = isActive ? selected.indexOf(sector.name) : -1;
          return (
            <button
              key={sector.name}
              onClick={() => toggleSector(sector.name)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                isActive
                  ? 'text-white shadow-sm'
                  : 'bg-surface-tertiary text-text-secondary hover:bg-surface-hover'
              }`}
              style={
                isActive
                  ? { backgroundColor: PALETTE[colorIdx % PALETTE.length] }
                  : undefined
              }
            >
              {sector.name}
              {isActive && selected.length > 1 && (
                <X
                  className="w-3 h-3 opacity-70 hover:opacity-100"
                  onClick={e => {
                    e.stopPropagation();
                    removeSector(sector.name);
                  }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Radar Chart */}
      <ResponsiveContainer width="100%" height={320}>
        <RadarChart data={chartData}>
          <PolarGrid stroke={CHART_GRID} strokeWidth={0.5} gridType="circle" />
          <PolarAngleAxis dataKey="axis" tick={POLAR_TICK} tickLine={false} />
          <PolarRadiusAxis
            angle={90}
            domain={[0, 100]}
            tick={RADIUS_TICK}
            tickCount={5}
            axisLine={false}
          />
          {selected.map((sectorName, idx) => (
            <Radar
              key={sectorName}
              name={sectorName}
              dataKey={sectorName}
              stroke={PALETTE[idx % PALETTE.length]}
              fill={PALETTE[idx % PALETTE.length]}
              fillOpacity={0.1}
              strokeWidth={2}
              animationDuration={600}
            />
          ))}
          <Legend
            iconType="circle"
            wrapperStyle={{ paddingTop: 8, fontSize: 11 }}
          />
          <Tooltip content={<ChartTooltip unit="/100" />} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default SectorRadar;
