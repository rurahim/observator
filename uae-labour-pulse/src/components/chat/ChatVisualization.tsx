/**
 * ChatVisualization — renders dynamic charts from agent visualization specs.
 * Routes to the appropriate chart type based on spec.type.
 */
import {
  ResponsiveContainer,
  BarChart, Bar,
  LineChart, Line, Area, AreaChart,
  PieChart, Pie, Cell,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import ChartTooltip from '@/components/charts/ChartTooltip';
import {
  COLORS, getSeriesColor, GRID_PROPS, AXIS_TICK, AXIS_TICK_SM,
  POLAR_TICK, RADIUS_TICK, CHART_GRID, BAR_RADIUS, BAR_RADIUS_H,
} from '@/utils/chartColors';
import type { VisualizationSpec, VisualizationSeries } from './parseVisualization';

interface ChatVisualizationProps {
  spec: VisualizationSpec;
  /** Compact mode for inline chat bubbles */
  compact?: boolean;
}

function getColor(series: VisualizationSeries, index: number): string {
  return series.color || getSeriesColor(index);
}

function DynamicRadarChart({ spec, compact }: ChatVisualizationProps) {
  const height = compact ? 200 : 360;
  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <RadarChart data={spec.data} cx="50%" cy="50%" outerRadius="75%">
          <PolarGrid stroke={CHART_GRID} strokeWidth={0.5} gridType="circle" />
          <PolarAngleAxis
            dataKey={spec.xKey}
            tick={compact ? { ...POLAR_TICK, fontSize: 9 } : POLAR_TICK}
            tickLine={false}
          />
          <PolarRadiusAxis
            angle={90}
            domain={[0, 1]}
            tickCount={6}
            tick={RADIUS_TICK}
            axisLine={false}
          />
          {spec.series.map((s, i) => (
            <Radar
              key={s.dataKey}
              name={s.label}
              dataKey={s.dataKey}
              stroke={getColor(s, i)}
              fill={getColor(s, i)}
              fillOpacity={0.2}
              strokeWidth={1.5}
            />
          ))}
          <Legend iconType="circle" wrapperStyle={{ fontSize: compact ? 10 : 12 }} />
          <Tooltip content={<ChartTooltip />} />
        </RadarChart>
      </ResponsiveContainer>
      {spec.caption && !compact && (
        <div className="mt-3 px-4">
          <p className="text-sm font-semibold text-gray-800">{spec.title}</p>
          <p className="text-xs text-gray-500 italic">{spec.caption}</p>
        </div>
      )}
    </div>
  );
}

function DynamicBarChart({ spec, compact }: ChatVisualizationProps) {
  const height = compact ? 160 : 300;
  // If data has long category names, use horizontal layout
  const isHorizontal = spec.data.some(
    d => String(d[spec.xKey] || '').length > 15,
  );

  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={spec.data}
          layout={isHorizontal ? 'vertical' : 'horizontal'}
        >
          <CartesianGrid {...GRID_PROPS} />
          {isHorizontal ? (
            <>
              <XAxis type="number" tick={AXIS_TICK_SM} />
              <YAxis
                type="category"
                dataKey={spec.xKey}
                tick={AXIS_TICK_SM}
                width={120}
              />
            </>
          ) : (
            <>
              <XAxis dataKey={spec.xKey} tick={AXIS_TICK_SM} />
              <YAxis tick={AXIS_TICK} />
            </>
          )}
          <Tooltip content={<ChartTooltip />} />
          {spec.series.map((s, i) => (
            <Bar
              key={s.dataKey}
              dataKey={s.dataKey}
              fill={getColor(s, i)}
              name={s.label}
              radius={isHorizontal ? BAR_RADIUS_H : BAR_RADIUS}
            />
          ))}
          {spec.series.length > 1 && (
            <Legend wrapperStyle={{ fontSize: compact ? 10 : 11 }} />
          )}
        </BarChart>
      </ResponsiveContainer>
      {spec.caption && !compact && (
        <div className="mt-3 px-4">
          <p className="text-sm font-semibold text-gray-800">{spec.title}</p>
          <p className="text-xs text-gray-500 italic">{spec.caption}</p>
        </div>
      )}
    </div>
  );
}

function DynamicLineChart({ spec, compact }: ChatVisualizationProps) {
  const height = compact ? 160 : 300;
  const useArea = spec.type === 'area';

  const Chart = useArea ? AreaChart : LineChart;

  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <Chart data={spec.data}>
          <CartesianGrid {...GRID_PROPS} />
          <XAxis dataKey={spec.xKey} tick={AXIS_TICK_SM} />
          <YAxis tick={AXIS_TICK} />
          <Tooltip content={<ChartTooltip />} />
          {spec.series.map((s, i) => {
            const color = getColor(s, i);
            return useArea ? (
              <Area
                key={s.dataKey}
                type="monotone"
                dataKey={s.dataKey}
                stroke={color}
                fill={color}
                fillOpacity={0.12}
                strokeWidth={1.5}
                name={s.label}
                dot={false}
              />
            ) : (
              <Line
                key={s.dataKey}
                type="monotone"
                dataKey={s.dataKey}
                stroke={color}
                strokeWidth={1.5}
                name={s.label}
                dot={false}
              />
            );
          })}
          <Legend wrapperStyle={{ fontSize: compact ? 10 : 11 }} />
        </Chart>
      </ResponsiveContainer>
      {spec.caption && !compact && (
        <div className="mt-3 px-4">
          <p className="text-sm font-semibold text-gray-800">{spec.title}</p>
          <p className="text-xs text-gray-500 italic">{spec.caption}</p>
        </div>
      )}
    </div>
  );
}

function DynamicPieChart({ spec, compact }: ChatVisualizationProps) {
  const height = compact ? 180 : 300;

  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={spec.data}
            dataKey={spec.series[0]?.dataKey || 'value'}
            nameKey={spec.xKey}
            cx="50%"
            cy="50%"
            innerRadius={compact ? 35 : 60}
            outerRadius={compact ? 65 : 100}
            paddingAngle={2}
            label={compact ? false : ({ name, value }) => `${name}: ${value}`}
            labelLine={!compact}
          >
            {spec.data.map((_, i) => (
              <Cell key={i} fill={getSeriesColor(i)} />
            ))}
          </Pie>
          <Tooltip content={<ChartTooltip />} />
          <Legend wrapperStyle={{ fontSize: compact ? 10 : 11 }} />
        </PieChart>
      </ResponsiveContainer>
      {spec.caption && !compact && (
        <div className="mt-3 px-4">
          <p className="text-sm font-semibold text-gray-800">{spec.title}</p>
          <p className="text-xs text-gray-500 italic">{spec.caption}</p>
        </div>
      )}
    </div>
  );
}

const ChatVisualization = ({ spec, compact = false }: ChatVisualizationProps) => {
  switch (spec.type) {
    case 'radar':
      return <DynamicRadarChart spec={spec} compact={compact} />;
    case 'bar':
      return <DynamicBarChart spec={spec} compact={compact} />;
    case 'line':
    case 'area':
      return <DynamicLineChart spec={spec} compact={compact} />;
    case 'pie':
      return <DynamicPieChart spec={spec} compact={compact} />;
    default:
      return <DynamicBarChart spec={spec} compact={compact} />;
  }
};

export default ChatVisualization;
