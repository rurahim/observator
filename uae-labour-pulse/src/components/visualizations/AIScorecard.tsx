import { useMemo } from 'react';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  ResponsiveContainer,
} from 'recharts';
import { ShieldCheck, AlertTriangle, ShieldAlert } from 'lucide-react';
import { COLORS, CHART_GRID } from '@/utils/chartColors';

// -- Types ------------------------------------------------------------------

interface SectorScorecard {
  /** Sector display name */
  name: string;
  /** Composite AI readiness score (0-100) */
  score: number;
  /** 4-axis radar values: [Task Automation, Skill Adaptability, Tech Adoption, Workforce Exposure] */
  radarValues: [number, number, number, number];
  /** Up to 3 recommendations */
  recommendations: string[];
}

interface AIScorecardProps {
  sector: SectorScorecard;
}

interface AIScorecardsGridProps {
  /** Sector scorecards. Falls back to illustrative data if omitted. */
  sectors?: SectorScorecard[];
}

// -- Constants ---------------------------------------------------------------

const RADAR_AXES = [
  'Task Automation',
  'Skill Adaptability',
  'Tech Adoption',
  'Workforce Exposure',
] as const;

const DEFAULT_SECTORS: SectorScorecard[] = [
  {
    name: 'IT & Communication',
    score: 78,
    radarValues: [85, 70, 90, 65],
    recommendations: [
      'Invest in AI literacy',
      'Automate routine coding tasks',
      'Build cloud migration skills',
    ],
  },
  {
    name: 'Financial Services',
    score: 65,
    radarValues: [75, 60, 70, 55],
    recommendations: [
      'Train staff on AI-assisted analysis',
      'Automate compliance checks',
      'Adopt RegTech tools',
    ],
  },
  {
    name: 'Healthcare',
    score: 45,
    radarValues: [40, 55, 45, 40],
    recommendations: [
      'Implement AI diagnostics training',
      'Upskill in health informatics',
      'Adopt telemedicine skills',
    ],
  },
  {
    name: 'Construction',
    score: 32,
    radarValues: [25, 35, 40, 30],
    recommendations: [
      'Introduce BIM/digital twin training',
      'Automate safety monitoring',
      'Develop drone operation skills',
    ],
  },
  {
    name: 'Education',
    score: 55,
    radarValues: [50, 65, 45, 60],
    recommendations: [
      'Train on adaptive learning platforms',
      'Develop EdTech curriculum',
      'Build data literacy',
    ],
  },
];

// -- Risk level helpers ------------------------------------------------------

function getRiskLevel(score: number): { label: string; color: string; bg: string } {
  if (score > 70) return { label: 'Low Risk', color: '#00875A', bg: 'bg-sgi-balanced/10 text-sgi-balanced' };
  if (score >= 40) return { label: 'Moderate Risk', color: '#C9A84C', bg: 'bg-gold/10 text-gold' };
  return { label: 'High Risk', color: '#DE350B', bg: 'bg-sgi-critical/10 text-sgi-critical' };
}

function getRingColor(score: number): string {
  if (score > 70) return COLORS.emerald;
  if (score >= 40) return COLORS.gold;
  return COLORS.red;
}

// -- Single Card Component ---------------------------------------------------

const AIScorecard = ({ sector }: AIScorecardProps) => {
  const risk = getRiskLevel(sector.score);
  const ringColor = getRingColor(sector.score);
  const radarColor = ringColor;

  const radarData = useMemo(
    () =>
      RADAR_AXES.map((axis, i) => ({
        axis,
        value: sector.radarValues[i],
        fullMark: 100,
      })),
    [sector.radarValues],
  );

  // Conic gradient for the progress ring (CSS trick)
  const ringStyle = useMemo(() => {
    const pct = Math.min(100, Math.max(0, sector.score));
    return {
      background: `conic-gradient(${ringColor} ${pct * 3.6}deg, #E2E8F0 ${pct * 3.6}deg)`,
    };
  }, [sector.score, ringColor]);

  const RiskIcon = sector.score > 70 ? ShieldCheck : sector.score >= 40 ? ShieldAlert : AlertTriangle;

  return (
    <div className="bg-card rounded-xl border border-border-light shadow-card p-4 flex flex-col">
      {/* Header row */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-primary truncate">{sector.name}</h4>
          <span className={`inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-md text-[10px] font-medium ${risk.bg}`}>
            <RiskIcon className="w-3 h-3" />
            {risk.label}
          </span>
        </div>

        {/* Circular progress ring */}
        <div className="w-14 h-14 rounded-full p-[3px] shrink-0" style={ringStyle}>
          <div className="w-full h-full rounded-full bg-card flex items-center justify-center">
            <span className="text-base font-bold tabular-nums" style={{ color: ringColor }}>
              {sector.score}
            </span>
          </div>
        </div>
      </div>

      {/* Mini radar */}
      <div className="w-full h-[140px] -mx-2">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={radarData}>
            <PolarGrid stroke={CHART_GRID} strokeWidth={0.5} gridType="circle" />
            <PolarAngleAxis
              dataKey="axis"
              tick={{ fontSize: 8, fill: '#718096' }}
              tickLine={false}
            />
            <Radar
              dataKey="value"
              stroke={radarColor}
              fill={radarColor}
              fillOpacity={0.12}
              strokeWidth={1.5}
              animationDuration={500}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      {/* Recommendations */}
      <div className="mt-2 space-y-1.5">
        <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide">
          Recommendations
        </p>
        <ul className="space-y-1">
          {sector.recommendations.slice(0, 3).map((rec, i) => (
            <li key={i} className="flex items-start gap-1.5 text-xs text-text-secondary leading-snug">
              <span
                className="w-1.5 h-1.5 rounded-full mt-1 shrink-0"
                style={{ backgroundColor: ringColor }}
              />
              {rec}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

// -- Grid Wrapper Component --------------------------------------------------

const AIScorecardsGrid = ({ sectors }: AIScorecardsGridProps) => {
  const items = sectors && sectors.length > 0 ? sectors : DEFAULT_SECTORS;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {items.map(sector => (
        <AIScorecard key={sector.name} sector={sector} />
      ))}
    </div>
  );
};

export { AIScorecard, AIScorecardsGrid };
export type { SectorScorecard, AIScorecardProps, AIScorecardsGridProps };
export default AIScorecardsGrid;
