import type { GraphNode, GraphEdge, Particle, ViewTransform, HoverState } from './networkTypes';
import {
  BACKGROUND_COLOR,
  EDGE_ACTIVE_COLOR,
  EDGE_COLOR,
  EDGE_DIM_COLOR,
  LABEL_COLOR,
  LABEL_DIM_COLOR,
  PARTICLE_BASE_ALPHA,
  getNodeColors,
  type ThemeColors,
} from './networkColors';

export interface NetworkRenderConfig {
  animationSpeed: number;
  labelVisibility: 'always' | 'zoom-dependent' | 'never';
  nodeSizeScale: number;
}

const DEFAULT_RENDER_CONFIG: NetworkRenderConfig = {
  animationSpeed: 1,
  labelVisibility: 'zoom-dependent',
  nodeSizeScale: 1,
};

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

function getNodePosition(node: GraphNode | null | undefined): { x: number; y: number } {
  return {
    x: typeof node?.x === 'number' ? node.x : 0,
    y: typeof node?.y === 'number' ? node.y : 0,
  };
}

function getEdgePositions(
  edge: GraphEdge,
): { source: { x: number; y: number }; target: { x: number; y: number } } | null {
  const sourceNode = typeof edge.source === 'object' ? edge.source : null;
  const targetNode = typeof edge.target === 'object' ? edge.target : null;

  if (!sourceNode || !targetNode) {
    return null;
  }

  return {
    source: getNodePosition(sourceNode),
    target: getNodePosition(targetNode),
  };
}

function resolveEdgeNodeId(value: string | GraphNode): string {
  return typeof value === 'string' ? value : value.id;
}

function getNodeIdByTypeOrder(type: GraphNode['type']): number {
  if (type === 'subagent') {
    return 0;
  }
  if (type === 'agent') {
    return 1;
  }
  return 2;
}

export function renderFrame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  nodes: GraphNode[],
  edges: GraphEdge[],
  particles: Particle[],
  transform: ViewTransform,
  hover: HoverState,
  selectedNodeId: string | null,
  timestamp: number,
  config: NetworkRenderConfig = DEFAULT_RENDER_CONFIG,
  themeColors?: ThemeColors,
): void {
  const colors = themeColors ?? {
    background: BACKGROUND_COLOR,
    edge: EDGE_COLOR,
    edgeActive: EDGE_ACTIVE_COLOR,
    edgeDim: EDGE_DIM_COLOR,
    label: LABEL_COLOR,
    labelDim: LABEL_DIM_COLOR,
  };

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = colors.background;
  ctx.fillRect(0, 0, width, height);

  const nodeById = new Map<string, GraphNode>();
  for (let i = 0; i < nodes.length; i += 1) {
    nodeById.set(nodes[i].id, nodes[i]);
  }
  const edgeById = new Map<string, GraphEdge>();
  for (let i = 0; i < edges.length; i += 1) {
    edgeById.set(edges[i].id, edges[i]);
  }

  const hoverActive = hover.nodeId !== null;

  ctx.save();
  ctx.translate(width * 0.5, height * 0.5);
  ctx.translate(transform.x, transform.y);
  ctx.scale(transform.k, transform.k);

  ctx.lineCap = 'round';
  for (let i = 0; i < edges.length; i += 1) {
    const edge = edges[i];
    let positions = getEdgePositions(edge);
    if (!positions) {
      const sourceId = edge.sourceId ?? resolveEdgeNodeId(edge.source);
      const targetId = edge.targetId ?? resolveEdgeNodeId(edge.target);
      const sourceNode = nodeById.get(sourceId);
      const targetNode = nodeById.get(targetId);
      if (sourceNode && targetNode) {
        positions = {
          source: getNodePosition(sourceNode),
          target: getNodePosition(targetNode),
        };
      }
    }

    if (!positions) {
      continue;
    }

    if (!hoverActive) {
      ctx.strokeStyle = colors.edge;
      ctx.lineWidth = 1;
    } else if (hover.connectedEdgeIds.has(edge.id)) {
      ctx.strokeStyle = colors.edgeActive;
      ctx.lineWidth = 1.5;
    } else {
      ctx.strokeStyle = colors.edgeDim;
      ctx.lineWidth = 1;
    }

    ctx.beginPath();
    ctx.moveTo(positions.source.x, positions.source.y);
    ctx.lineTo(positions.target.x, positions.target.y);
    ctx.stroke();
  }

  const skipParticleBlur = nodes.length > 300;
  for (let i = 0; i < particles.length; i += 1) {
    const particle = particles[i];
    const edge = edgeById.get(particle.edgeId);
    if (!edge) {
      continue;
    }

    let sourceNode: GraphNode | undefined;
    if (typeof edge.source === 'object') {
      sourceNode = edge.source;
    } else {
      sourceNode = nodeById.get(edge.sourceId ?? edge.source);
    }

    const positions = getEdgePositions(edge);
    if (!positions) {
      const fallbackTargetId = typeof edge.target === 'string' ? edge.target : edge.target.id;
      const fallbackTargetNode = nodeById.get(edge.targetId ?? fallbackTargetId);
      if (!sourceNode || !fallbackTargetNode) {
        continue;
      }

      const sourcePos = getNodePosition(sourceNode);
      const targetPos = getNodePosition(fallbackTargetNode);
      const x = lerp(sourcePos.x, targetPos.x, particle.t);
      const y = lerp(sourcePos.y, targetPos.y, particle.t);
      const sourceColors = getNodeColors(sourceNode.status);

      ctx.globalAlpha = PARTICLE_BASE_ALPHA;
      ctx.fillStyle = sourceColors.core;
      if (skipParticleBlur) {
        ctx.shadowBlur = 0;
        ctx.shadowColor = 'transparent';
      } else {
        ctx.shadowBlur = 8;
        ctx.shadowColor = sourceColors.glow;
      }

      ctx.beginPath();
      ctx.arc(x, y, 2, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }

    const x = lerp(positions.source.x, positions.target.x, particle.t);
    const y = lerp(positions.source.y, positions.target.y, particle.t);

    if (!sourceNode) {
      continue;
    }

    const sourceColors = getNodeColors(sourceNode.status);

    ctx.globalAlpha = PARTICLE_BASE_ALPHA;
    ctx.fillStyle = sourceColors.core;
    if (skipParticleBlur) {
      ctx.shadowBlur = 0;
      ctx.shadowColor = 'transparent';
    } else {
      ctx.shadowBlur = 8;
      ctx.shadowColor = sourceColors.glow;
    }

    ctx.beginPath();
    ctx.arc(x, y, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';

  const nodesForDraw = [...nodes].sort((a, b) => getNodeIdByTypeOrder(a.type) - getNodeIdByTypeOrder(b.type));

  for (let i = 0; i < nodesForDraw.length; i += 1) {
    const node = nodesForDraw[i];
    const pos = getNodePosition(node);
    const colors = getNodeColors(node.status);
    const isHovered = hover.nodeId === node.id;
    const isSelected = selectedNodeId === node.id;
    const isConnected =
      hover.connectedNodeIds.has(node.id) ||
      isHovered ||
      (hover.nodeId !== null && hover.nodeId === node.id) ||
      isSelected;
    const isDimmedByHover = hoverActive && !isConnected;

    const breathing =
      node.status === 'active' || node.status === 'running'
        ? 1 + 0.05 * Math.sin(timestamp * 0.003 * config.animationSpeed + hashCode(node.id))
        : 1;
    const radius = node.radius * config.nodeSizeScale * breathing;

    if (isDimmedByHover) {
      ctx.globalAlpha = 0.12;
    } else if (node.status === 'completed') {
      ctx.globalAlpha = 0.35;
    } else {
      ctx.globalAlpha = 1;
    }

    ctx.shadowColor = colors.glow;
    ctx.shadowBlur = node.type === 'session' ? 20 : 12;
    ctx.fillStyle = colors.core;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
    ctx.fill();

    if (isHovered || isSelected) {
      ctx.globalAlpha = isDimmedByHover ? 0.8 : 1;
      ctx.shadowBlur = 0;
      ctx.shadowColor = 'transparent';
      ctx.strokeStyle = colors.glow;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, radius + 3, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (let i = 0; i < nodesForDraw.length; i += 1) {
    const node = nodesForDraw[i];

    if (config.labelVisibility === 'never') {
      continue;
    }
    if (config.labelVisibility === 'zoom-dependent') {
      if (node.type === 'session' && transform.k <= 0.4) {
        continue;
      }
      if (node.type === 'agent' && transform.k <= 0.7) {
        continue;
      }
      if (node.type === 'subagent' && transform.k <= 1.2) {
        continue;
      }
    }

    const isRelated =
      !hoverActive ||
      hover.connectedNodeIds.has(node.id) ||
      hover.nodeId === node.id ||
      selectedNodeId === node.id;

    const pos = getNodePosition(node);
    const y = pos.y + node.radius * config.nodeSizeScale + 10;

    ctx.globalAlpha = 1;
    ctx.fillStyle = isRelated ? colors.label : colors.labelDim;

    if (node.type === 'session') {
      ctx.font = "11px 'JetBrains Mono', monospace";
    } else if (node.type === 'agent') {
      ctx.font = "10px 'JetBrains Mono', monospace";
    } else {
      ctx.font = "9px 'JetBrains Mono', monospace";
    }

    ctx.fillText(node.label, pos.x, y);
  }

  ctx.restore();
}

export function updateParticles(
  particles: Particle[],
  edges: GraphEdge[],
  nodes: GraphNode[],
  deltaTime: number,
  config: NetworkRenderConfig = DEFAULT_RENDER_CONFIG,
): Particle[] {
  const nodeStatusById = new Map<string, string>();
  for (let i = 0; i < nodes.length; i += 1) {
    nodeStatusById.set(nodes[i].id, nodes[i].status);
  }

  const advanced: Particle[] = [];
  for (let i = 0; i < particles.length; i += 1) {
    const particle = particles[i];
    const nextT = particle.t + particle.speed * deltaTime * config.animationSpeed;
    if (nextT < 1) {
      advanced.push({ ...particle, t: nextT });
    }
  }

  const countByEdgeId = new Map<string, number>();
  for (let i = 0; i < advanced.length; i += 1) {
    const particle = advanced[i];
    countByEdgeId.set(particle.edgeId, (countByEdgeId.get(particle.edgeId) ?? 0) + 1);
  }

  for (let i = 0; i < edges.length; i += 1) {
    const edge = edges[i];
    const sourceId = edge.sourceId ?? resolveEdgeNodeId(edge.source);
    const targetId = edge.targetId ?? resolveEdgeNodeId(edge.target);
    const sourceStatus = nodeStatusById.get(sourceId);
    const targetStatus = nodeStatusById.get(targetId);
    const sourceIsActive = sourceStatus === 'active' || sourceStatus === 'running';
    const targetIsActive = targetStatus === 'active' || targetStatus === 'running';

    if (!sourceIsActive && !targetIsActive) {
      continue;
    }

    const activeCount = countByEdgeId.get(edge.id) ?? 0;
    if (activeCount >= 2) {
      continue;
    }

    if (Math.random() < deltaTime * 0.001 * config.animationSpeed) {
      advanced.push({
        edgeId: edge.id,
        t: 0,
        speed: 0.0005 + Math.random() * 0.0005,
      });
      countByEdgeId.set(edge.id, activeCount + 1);
    }
  }

  return advanced;
}
