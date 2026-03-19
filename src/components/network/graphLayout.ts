import type { Session, SubAgent } from '../../types';
import type { GraphEdge, GraphNode } from './networkTypes';
import { countAgents } from '../../utils/formatters';

const MAX_RECURSION_DEPTH = 10;
const SESSION_LABEL_MAX_LENGTH = 20;

export function truncateLabel(text: string, maxLength: number): string {
  if (maxLength <= 0) {
    return '';
  }

  if (text.length <= maxLength) {
    return text;
  }

  if (maxLength === 1) {
    return '…';
  }

  return `${text.slice(0, maxLength - 1)}…`;
}

export function buildGraph(
  sessions: Session[],
  nodeSizeScale: number = 1,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  function addAgentTree(params: {
    agent: SubAgent;
    sessionId: string;
    parentNodeId: string;
    depth: number;
    isRoot: boolean;
  }): void {
    const { agent, sessionId, parentNodeId, depth, isRoot } = params;

    if (depth > MAX_RECURSION_DEPTH) {
      return;
    }

    const nodeId = `agent-${agent.id}`;
    const isChildAgent = !isRoot && depth <= 2;

    const node: GraphNode = {
      id: nodeId,
      type: isRoot || isChildAgent ? 'agent' : 'subagent',
      label: agent.name,
      status: agent.status,
      task: agent.task,
      sessionId,
      parentId: parentNodeId,
      radius: (isRoot ? 16 : Math.max(10, 16 - depth * 2)) * nodeSizeScale,
      depth
    };

    nodes.push(node);

    edges.push({
      id: `${parentNodeId}->${nodeId}`,
      source: parentNodeId,
      target: nodeId,
      sourceId: parentNodeId,
      targetId: nodeId
    });

    for (const child of agent.children) {
      addAgentTree({
        agent: child,
        sessionId,
        parentNodeId: nodeId,
        depth: depth + 1,
        isRoot: false
      });
    }
  }

  for (const session of sessions) {
    const sessionNodeId = `session-${session.id}`;
    const agentTotal = countAgents(session.rootAgent);

    nodes.push({
      id: sessionNodeId,
      type: 'session',
      label: truncateLabel(session.name, SESSION_LABEL_MAX_LENGTH),
      status: session.status,
      sessionId: session.id,
      parentId: null,
      radius: (24 + Math.min(agentTotal, 20) * 0.4) * nodeSizeScale,
      depth: 0,
      agentCount: agentTotal
    });

    addAgentTree({
      agent: session.rootAgent,
      sessionId: session.id,
      parentNodeId: sessionNodeId,
      depth: 1,
      isRoot: true
    });
  }

  return { nodes, edges };
}

export function buildAdjacencyMap(
  nodes: GraphNode[],
  edges: GraphEdge[]
): Map<string, Set<string>> {
  const adjacency = new Map<string, Set<string>>();

  for (const node of nodes) {
    adjacency.set(node.id, new Set<string>());
  }

  for (const edge of edges) {
    if (!adjacency.has(edge.sourceId)) {
      adjacency.set(edge.sourceId, new Set<string>());
    }

    if (!adjacency.has(edge.targetId)) {
      adjacency.set(edge.targetId, new Set<string>());
    }

    adjacency.get(edge.sourceId)!.add(edge.targetId);
    adjacency.get(edge.targetId)!.add(edge.sourceId);
  }

  return adjacency;
}
