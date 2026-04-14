/**
 * Utility to extract visualization specs from agent markdown responses.
 * Looks for ```chart JSON code blocks in the message text.
 */

export interface VisualizationSeries {
  dataKey: string;
  label: string;
  color?: string;
}

export interface VisualizationSpec {
  type: 'radar' | 'bar' | 'line' | 'area' | 'pie';
  title: string;
  caption?: string;
  xKey: string;
  series: VisualizationSeries[];
  data: Record<string, unknown>[];
}

/**
 * Extract the FIRST chart visualization spec from agent markdown.
 * Looks for ```chart ... ``` code blocks containing JSON.
 * (Backward compatible — use parseAllVisualizations for multiple)
 */
export function parseVisualization(text: string): VisualizationSpec | null {
  const all = parseAllVisualizations(text);
  return all.length > 0 ? all[0] : null;
}

/**
 * Extract ALL chart visualization specs from agent markdown.
 * Returns an array of charts in order of appearance.
 */
export function parseAllVisualizations(text: string): VisualizationSpec[] {
  const regex = /```chart\s*\n?([\s\S]*?)```/g;
  const results: VisualizationSpec[] = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    try {
      const spec = JSON.parse(match[1].trim()) as VisualizationSpec;
      if (!spec.type || !spec.data || !Array.isArray(spec.data)) continue;
      if (!spec.series || !Array.isArray(spec.series)) {
        if (spec.data.length > 0) {
          const keys = Object.keys(spec.data[0]).filter(k => k !== spec.xKey);
          spec.series = keys.map(k => ({ dataKey: k, label: k }));
        }
      }
      results.push(spec);
    } catch {
      // skip malformed
    }
  }
  return results;
}

/**
 * Strip ALL chart code blocks from message text for display.
 */
export function stripChartBlock(text: string): string {
  return text.replace(/```chart\s*\n?[\s\S]*?```/g, '').trim();
}
