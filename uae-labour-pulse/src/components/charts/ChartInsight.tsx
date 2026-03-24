import { Lightbulb } from 'lucide-react';

interface ChartInsightProps {
  text: string;
  /** SGI-style severity: 'critical' | 'shortage' | 'balanced' | 'surplus' */
  severity?: 'critical' | 'shortage' | 'balanced' | 'surplus';
}

const severityStyles = {
  critical: 'bg-sgi-critical/5 border-sgi-critical/15 text-sgi-critical',
  shortage: 'bg-sgi-shortage/5 border-sgi-shortage/15 text-sgi-shortage',
  balanced: 'bg-sgi-balanced/5 border-sgi-balanced/15 text-sgi-balanced',
  surplus: 'bg-sgi-surplus/5 border-sgi-surplus/15 text-sgi-surplus',
};

const iconColors = {
  critical: 'text-sgi-critical',
  shortage: 'text-sgi-shortage',
  balanced: 'text-sgi-balanced',
  surplus: 'text-sgi-surplus',
};

const ChartInsight = ({ text, severity = 'shortage' }: ChartInsightProps) => (
  <div className={`flex items-start gap-2 mt-3 px-3 py-2 rounded-lg border ${severityStyles[severity]}`}>
    <Lightbulb className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${iconColors[severity]}`} />
    <p className="text-[11px] leading-relaxed">{text}</p>
  </div>
);

export default ChartInsight;
