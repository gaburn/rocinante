import { useEffect, useMemo, useRef, useState } from 'react';
import {
  forceSimulation,
  forceManyBody,
  forceLink,
  forceCenter,
  forceCollide,
  type Simulation,
} from 'd3-force';
import type { GraphNode, GraphEdge } from './networkTypes';
import type { Session } from '../../types';
import { buildGraph, buildAdjacencyMap } from './graphLayout';
import { useSettingsContext } from '../../context/SettingsContext';
import { getNodeSizeMultiplier, getPhysicsParams } from '../../types/settings';

function createLinkForce(
  nodes: GraphNode[],
  edges: GraphEdge[],
  params: ReturnType<typeof getPhysicsParams>,
) {
  const nodeById = new Map<string, GraphNode>();
  for (let i = 0; i < nodes.length; i += 1) {
    nodeById.set(nodes[i].id, nodes[i]);
  }

  return forceLink<GraphNode, GraphEdge>(edges)
    .id((node) => node.id)
    .distance((edge) => {
      const source = nodeById.get(edge.sourceId);
      const target = nodeById.get(edge.targetId);

      if (!source || !target) {
        return 60;
      }

      if (source.type === 'session' && target.type === 'agent') {
        return params.sessionLinkDist;
      }

      if (source.type === 'agent' && (target.type === 'agent' || target.type === 'subagent')) {
        return params.agentLinkDist;
      }

      return 60;
    });
}

function copyNodePosition(fromNode: GraphNode, toNode: GraphNode): void {
  if (typeof fromNode.x === 'number') {
    toNode.x = fromNode.x;
  }
  if (typeof fromNode.y === 'number') {
    toNode.y = fromNode.y;
  }
  if (typeof fromNode.vx === 'number') {
    toNode.vx = fromNode.vx;
  }
  if (typeof fromNode.vy === 'number') {
    toNode.vy = fromNode.vy;
  }
}

export function useForceGraph(sessions: Session[]): {
  nodes: GraphNode[];
  edges: GraphEdge[];
  adjacency: Map<string, Set<string>>;
  isSimulating: boolean;
} {
  const { settings } = useSettingsContext();
  const physicsStrength = settings.network.physicsStrength;
  const nodeSizeScale = getNodeSizeMultiplier(settings.network.nodeSizeScale);
  const physicsParams = useMemo(() => getPhysicsParams(physicsStrength), [physicsStrength]);

  const { nodes, edges } = useMemo(() => buildGraph(sessions, nodeSizeScale), [sessions, nodeSizeScale]);
  const adjacency = useMemo(() => buildAdjacencyMap(nodes, edges), [nodes, edges]);

  const simulationRef = useRef<Simulation<GraphNode, GraphEdge> | null>(null);
  const tickCounterRef = useRef(0);
  const [, setTickVersion] = useState(0);

  useEffect(() => {
    if (nodes.length === 0) {
      if (simulationRef.current) {
        simulationRef.current.stop();
        simulationRef.current = null;
      }
      return;
    }

    const previousNodeById = new Map<string, GraphNode>();
    if (simulationRef.current) {
      const previousNodes = simulationRef.current.nodes();
      for (let i = 0; i < previousNodes.length; i += 1) {
        const previousNode = previousNodes[i];
        previousNodeById.set(previousNode.id, previousNode);
      }
    }

    for (let i = 0; i < nodes.length; i += 1) {
      const nextNode = nodes[i];
      const previousNode = previousNodeById.get(nextNode.id);
      if (previousNode) {
        copyNodePosition(previousNode, nextNode);
      }
    }

    if (!simulationRef.current) {
      const simulation = forceSimulation<GraphNode>(nodes)
        .force(
          'charge',
          forceManyBody<GraphNode>().strength((node) =>
            node.type === 'session' ? physicsParams.sessionCharge : physicsParams.agentCharge,
          ),
        )
        .force('link', createLinkForce(nodes, edges, physicsParams))
        .force('center', forceCenter(0, 0).strength(physicsParams.centerStrength))
        .force('collide', forceCollide<GraphNode>().radius((node) => node.radius + 6))
        .alphaDecay(0.015)
        .alphaMin(0.005)
        .velocityDecay(physicsParams.velocityDecay);

      simulation.on('tick', () => {
        tickCounterRef.current += 1;
        if (tickCounterRef.current % 2 === 0) {
          setTickVersion((version) => version + 1);
        }
      });
      simulation.on('end', () => {
        setTickVersion((version) => version + 1);
      });

      simulationRef.current = simulation;
      return;
    }

    const simulation = simulationRef.current;
    simulation.nodes(nodes);
    simulation.force(
      'charge',
      forceManyBody<GraphNode>().strength((node) =>
        node.type === 'session' ? physicsParams.sessionCharge : physicsParams.agentCharge,
      ),
    );
    simulation.force('link', createLinkForce(nodes, edges, physicsParams));
    simulation.force('center', forceCenter(0, 0).strength(physicsParams.centerStrength));
    simulation.force('collide', forceCollide<GraphNode>().radius((node) => node.radius + 6));
    simulation.velocityDecay(physicsParams.velocityDecay);
    simulation.alpha(0.3).restart();
  }, [nodes, edges, physicsParams, physicsStrength]);

  useEffect(() => {
    return () => {
      if (simulationRef.current) {
        simulationRef.current.stop();
        simulationRef.current = null;
      }
    };
  }, []);

  /* eslint-disable react-hooks/refs */
  const isSimulating = simulationRef.current
    ? simulationRef.current.alpha() > simulationRef.current.alphaMin()
    : false;
  /* eslint-enable react-hooks/refs */

  return {
    nodes,
    edges,
    adjacency,
    isSimulating,
  };
}
