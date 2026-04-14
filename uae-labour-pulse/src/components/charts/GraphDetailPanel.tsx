import type { GraphNode } from '@/api/graphTypes';

interface GraphDetailPanelProps {
  node: GraphNode;
  connectedNodes: GraphNode[];
  onClose: () => void;
  colorMap?: Record<string, string>;
}

const DEFAULT_COLORS: Record<string, string> = {
  gap: '#DE350B',
  matched: '#00875A',
  oversupply: '#0052CC',
  occupation: '#003366',
  institution: '#8B5CF6',
  course: '#5BA3C9',
  origin: '#C9A84C',
  related: '#007DB5',
  knowledge: '#003366',
  skill: '#007DB5',
  'skill/competence': '#007DB5',
  technology: '#C9A84C',
  competence: '#00A86B',
  essential: '#003366',
  optional: '#94A3B8',
  unknown: '#94A3B8',
  default: '#94A3B8',
};

const GAP_LABELS: Record<string, { label: string; desc: string }> = {
  gap: { label: 'SKILL GAP', desc: 'Demanded by employers but NOT taught in universities' },
  matched: { label: 'COVERED', desc: 'Both demanded by employers and taught in universities' },
  oversupply: { label: 'OVERSUPPLY', desc: 'Taught in universities but not demanded by employers' },
};

export default function GraphDetailPanel({
  node,
  connectedNodes,
  onClose,
  colorMap,
}: GraphDetailPanelProps) {
  const colors = { ...DEFAULT_COLORS, ...colorMap };
  const nodeColor = colors[node.color_group] ?? colors[node.type] ?? colors.default;

  const metaEntries = Object.entries(node.metadata).filter(
    ([, v]) => v !== null && v !== undefined && v !== '',
  );

  return (
    <div className="absolute right-3 top-3 w-64 bg-white/95 backdrop-blur border border-gray-200 rounded-xl shadow-xl p-3 z-30">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <span
          className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
          style={{ backgroundColor: nodeColor + '18', color: nodeColor }}
        >
          {node.type}
        </span>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 text-xs leading-none"
          aria-label="Close detail panel"
        >
          ✕
        </button>
      </div>

      {/* Label */}
      <h4 className="text-sm font-bold text-gray-900 break-words leading-snug">{node.label}</h4>

      {/* Gap status banner */}
      {GAP_LABELS[node.color_group] && (
        <div className="mt-1.5 px-2 py-1.5 rounded-lg text-[10px]"
          style={{ backgroundColor: nodeColor + '12', borderLeft: `3px solid ${nodeColor}` }}>
          <span className="font-bold" style={{ color: nodeColor }}>{GAP_LABELS[node.color_group].label}</span>
          <p className="text-gray-500 mt-0.5">{GAP_LABELS[node.color_group].desc}</p>
        </div>
      )}

      {/* Key metrics */}
      {(node.metadata.demand_jobs != null || node.metadata.supply_courses != null) && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          {node.metadata.demand_jobs != null && (
            <div className="text-center p-1.5 rounded bg-gray-50">
              <div className="text-xs font-bold text-gray-900">{Number(node.metadata.demand_jobs).toLocaleString()}</div>
              <div className="text-[8px] text-gray-400">Jobs Demand</div>
            </div>
          )}
          {node.metadata.supply_courses != null && (
            <div className="text-center p-1.5 rounded bg-gray-50">
              <div className="text-xs font-bold text-gray-900">{Number(node.metadata.supply_courses).toLocaleString()}</div>
              <div className="text-[8px] text-gray-400">Courses Supply</div>
            </div>
          )}
        </div>
      )}

      {/* Metadata */}
      {metaEntries.length > 0 && (
        <div className="mt-2 pt-2 border-t border-gray-100 space-y-1">
          {metaEntries.slice(0, 8).map(([key, val]) => (
            <div key={key} className="flex items-start gap-1.5">
              <span className="text-[10px] text-gray-400 capitalize shrink-0 min-w-[60px]">
                {key.replace(/_/g, ' ')}
              </span>
              <span className="text-[10px] text-gray-700 font-medium break-words">
                {typeof val === 'boolean' ? (val ? 'Yes' : 'No') : String(val)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Connected nodes */}
      {connectedNodes.length > 0 && (
        <div className="mt-2 pt-2 border-t border-gray-100">
          <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">
            Connected ({connectedNodes.length})
          </p>
          <div className="space-y-1 max-h-36 overflow-y-auto">
            {connectedNodes.slice(0, 10).map(n => {
              const c = colors[n.color_group] ?? colors[n.type] ?? colors.default;
              return (
                <div key={n.id} className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: c }} />
                  <span className="text-[10px] text-gray-600 truncate flex-1">{n.label}</span>
                  <span
                    className="text-[9px] px-1 rounded"
                    style={{ backgroundColor: c + '18', color: c }}
                  >
                    {n.type}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
