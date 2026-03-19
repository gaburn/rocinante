export interface GraphNode {
  id: string;
  type: 'session' | 'agent' | 'subagent';
  label: string;
  status: string;
  sessionId: string;
  parentId: string | null;
  radius: number;
  depth: number;
  agentCount?: number;
  task?: string;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
  index?: number;
}

export interface GraphEdge {
  id: string;
  source: string | GraphNode;
  target: string | GraphNode;
  sourceId: string;
  targetId: string;
}

export interface Particle {
  edgeId: string;
  t: number;
  speed: number;
}

export interface ViewTransform {
  x: number;
  y: number;
  k: number;
}

export interface HoverState {
  nodeId: string | null;
  connectedNodeIds: Set<string>;
  connectedEdgeIds: Set<string>;
}
