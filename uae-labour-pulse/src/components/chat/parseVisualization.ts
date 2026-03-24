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
 * Extract a chart visualization spec from agent markdown.
 * Looks for ```chart ... ``` code blocks containing JSON.
 */
export function parseVisualization(text: string): VisualizationSpec | null {
  // Match ```chart { ... } ``` blocks
  const regex = /```chart\s*\n?([\s\S]*?)```/;
  const match = text.match(regex);

  if (!match) return null;

  try {
    const spec = JSON.parse(match[1].trim()) as VisualizationSpec;

    // Validate required fields
    if (!spec.type || !spec.data || !Array.isArray(spec.data)) return null;

    // Ensure series exists
    if (!spec.series || !Array.isArray(spec.series)) {
      // Try to infer series from data keys
      if (spec.data.length > 0) {
        const keys = Object.keys(spec.data[0]).filter(k => k !== spec.xKey);
        spec.series = keys.map(k => ({ dataKey: k, label: k }));
      }
    }

    return spec;
  } catch {
    return null;
  }
}

/**
 * Strip the chart code block from message text for display.
 */
export function stripChartBlock(text: string): string {
  return text.replace(/```chart\s*\n?[\s\S]*?```/g, '').trim();
}
