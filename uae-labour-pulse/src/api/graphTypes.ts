export interface GraphNode {
  id: string;
  label: string;
  type: string; // "skill" | "occupation" | "institution" | "course"
  size: number; // 0-1 normalized
  color_group: string;
  metadata: Record<string, any>;
}

export interface GraphEdge {
  source: string;
  target: string;
  weight: number; // 0-1
  label?: string;
  type: string;
}

export interface GraphResponse {
  nodes: GraphNode[];
  edges: GraphEdge[];
  meta: Record<string, any>;
}
