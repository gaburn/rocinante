import { useState, useEffect, useCallback, useRef, type RefObject } from 'react';
import type { GraphNode, ViewTransform, HoverState } from './networkTypes';

const INITIAL_TRANSFORM: ViewTransform = { x: 0, y: 0, k: 1 };
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 4.0;
const ZOOM_STEP = 1.1;
const CLICK_DRAG_THRESHOLD_PX = 5;

function screenToWorld(
  screenX: number,
  screenY: number,
  transform: ViewTransform,
  canvasWidth: number,
  canvasHeight: number,
): { x: number; y: number } {
  return {
    x: (screenX - canvasWidth / 2 - transform.x) / transform.k,
    y: (screenY - canvasHeight / 2 - transform.y) / transform.k,
  };
}

function findNodeAtPosition(worldX: number, worldY: number, nodes: GraphNode[]): GraphNode | null {
  for (let i = nodes.length - 1; i >= 0; i -= 1) {
    const node = nodes[i];
    const nodeX = typeof node.x === 'number' ? node.x : 0;
    const nodeY = typeof node.y === 'number' ? node.y : 0;
    const dx = worldX - nodeX;
    const dy = worldY - nodeY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance < node.radius) {
      return node;
    }
  }
  return null;
}

function buildHoverState(nodeId: string | null, nodes: GraphNode[]): HoverState {
  if (!nodeId) {
    return {
      nodeId: null,
      connectedNodeIds: new Set<string>(),
      connectedEdgeIds: new Set<string>(),
    };
  }

  const node = nodes.find((n) => n.id === nodeId);
  if (!node) {
    return {
      nodeId: null,
      connectedNodeIds: new Set<string>(),
      connectedEdgeIds: new Set<string>(),
    };
  }

  const connectedNodeIds = new Set<string>();
  const connectedEdgeIds = new Set<string>();

  if (node.parentId) {
    connectedNodeIds.add(node.parentId);
    connectedEdgeIds.add(`${node.parentId}->${node.id}`);
  }

  for (let i = 0; i < nodes.length; i += 1) {
    const candidate = nodes[i];
    if (candidate.parentId === node.id) {
      connectedNodeIds.add(candidate.id);
      connectedEdgeIds.add(`${node.id}->${candidate.id}`);
    }
  }

  return {
    nodeId,
    connectedNodeIds,
    connectedEdgeIds,
  };
}

function pointInsideCanvas(clientX: number, clientY: number, canvas: HTMLCanvasElement): boolean {
  const rect = canvas.getBoundingClientRect();
  return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
}

export function useCanvasInteraction(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  nodes: GraphNode[],
  onDragStart?: (nodeId: string) => void,
  onDragMove?: (nodeId: string, x: number, y: number) => void,
  onDragEnd?: (nodeId: string) => void,
): {
  transform: ViewTransform;
  hover: HoverState;
  selectedNodeId: string | null;
  setSelectedNodeId: (id: string | null) => void;
  resetTransform: () => void;
} {
  const [transform, setTransform] = useState<ViewTransform>(INITIAL_TRANSFORM);
  const [hover, setHover] = useState<HoverState>({
    nodeId: null,
    connectedNodeIds: new Set<string>(),
    connectedEdgeIds: new Set<string>(),
  });
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const transformRef = useRef<ViewTransform>(INITIAL_TRANSFORM);
  const nodesRef = useRef<GraphNode[]>(nodes);
  const isPanningRef = useRef(false);
  const draggingNodeIdRef = useRef<string | null>(null);
  const lastMouseClientRef = useRef<{ x: number; y: number } | null>(null);
  const totalMouseMovementRef = useRef(0);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    transformRef.current = transform;
  }, [transform]);

  const resetTransform = useCallback(() => {
    transformRef.current = INITIAL_TRANSFORM;
    setTransform(INITIAL_TRANSFORM);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return undefined;
    }

    const setCursor = (cursor: string): void => {
      canvas.style.cursor = cursor;
    };

    const toCanvasSpace = (event: MouseEvent | WheelEvent): { x: number; y: number } => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
    };

    const updateHoverFromMouse = (event: MouseEvent): void => {
      if (isPanningRef.current || draggingNodeIdRef.current) {
        return;
      }

      const currentTransform = transformRef.current;
      const canvasPoint = toCanvasSpace(event);
      const world = screenToWorld(canvasPoint.x, canvasPoint.y, currentTransform, canvas.width, canvas.height);
      const hoveredNode = findNodeAtPosition(world.x, world.y, nodesRef.current);

      if (hoveredNode) {
        setHover(buildHoverState(hoveredNode.id, nodesRef.current));
        setCursor('pointer');
      } else {
        setHover({
          nodeId: null,
          connectedNodeIds: new Set<string>(),
          connectedEdgeIds: new Set<string>(),
        });
        setCursor('grab');
      }
    };

    const handleWheel = (event: WheelEvent): void => {
      event.preventDefault();

      const canvasPoint = toCanvasSpace(event);
      const current = transformRef.current;
      const zoomFactor = event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
      const nextK = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, current.k * zoomFactor));
      const worldBefore = screenToWorld(canvasPoint.x, canvasPoint.y, current, canvas.width, canvas.height);

      const nextTransform: ViewTransform = {
        k: nextK,
        x: canvasPoint.x - canvas.width / 2 - worldBefore.x * nextK,
        y: canvasPoint.y - canvas.height / 2 - worldBefore.y * nextK,
      };

      transformRef.current = nextTransform;
      setTransform(nextTransform);
    };

    const handleMouseDown = (event: MouseEvent): void => {
      if (event.button !== 0) {
        return;
      }

      const canvasPoint = toCanvasSpace(event);
      const currentTransform = transformRef.current;
      const world = screenToWorld(canvasPoint.x, canvasPoint.y, currentTransform, canvas.width, canvas.height);
      const hitNode = findNodeAtPosition(world.x, world.y, nodesRef.current);

      lastMouseClientRef.current = { x: event.clientX, y: event.clientY };
      totalMouseMovementRef.current = 0;

      if (hitNode) {
        draggingNodeIdRef.current = hitNode.id;
        isPanningRef.current = false;
        setCursor('grabbing');
        if (onDragStart) {
          onDragStart(hitNode.id);
        }
        return;
      }

      draggingNodeIdRef.current = null;
      isPanningRef.current = true;
      setCursor('grabbing');
    };

    const handleMouseMoveWindow = (event: MouseEvent): void => {
      const last = lastMouseClientRef.current;
      if (!last) {
        return;
      }

      const dx = event.clientX - last.x;
      const dy = event.clientY - last.y;
      const moveStep = Math.sqrt(dx * dx + dy * dy);
      totalMouseMovementRef.current += moveStep;
      lastMouseClientRef.current = { x: event.clientX, y: event.clientY };

      const draggingNodeId = draggingNodeIdRef.current;
      if (draggingNodeId) {
        if (onDragMove) {
          const canvasPoint = toCanvasSpace(event);
          const currentTransform = transformRef.current;
          const world = screenToWorld(canvasPoint.x, canvasPoint.y, currentTransform, canvas.width, canvas.height);
          onDragMove(draggingNodeId, world.x, world.y);
        }
        setCursor('grabbing');
        return;
      }

      if (isPanningRef.current) {
        const nextTransform: ViewTransform = {
          x: transformRef.current.x + dx,
          y: transformRef.current.y + dy,
          k: transformRef.current.k,
        };
        transformRef.current = nextTransform;
        setTransform(nextTransform);
        setCursor('grabbing');
      }
    };

    const handleMouseMoveCanvas = (event: MouseEvent): void => {
      updateHoverFromMouse(event);
    };

    const handleMouseUpWindow = (event: MouseEvent): void => {
      const hadMouseDown = lastMouseClientRef.current !== null;
      if (!hadMouseDown) {
        return;
      }

      const draggedNodeId = draggingNodeIdRef.current;
      if (draggedNodeId && onDragEnd) {
        onDragEnd(draggedNodeId);
      }

      draggingNodeIdRef.current = null;
      isPanningRef.current = false;

      const isClick = totalMouseMovementRef.current <= CLICK_DRAG_THRESHOLD_PX;
      if (isClick && pointInsideCanvas(event.clientX, event.clientY, canvas)) {
        const canvasPoint = toCanvasSpace(event);
        const currentTransform = transformRef.current;
        const world = screenToWorld(canvasPoint.x, canvasPoint.y, currentTransform, canvas.width, canvas.height);
        const hitNode = findNodeAtPosition(world.x, world.y, nodesRef.current);
        if (hitNode) {
          setSelectedNodeId(hitNode.id);
        } else {
          setSelectedNodeId(null);
        }
      }

      lastMouseClientRef.current = null;
      totalMouseMovementRef.current = 0;

      if (pointInsideCanvas(event.clientX, event.clientY, canvas)) {
        updateHoverFromMouse(event);
      } else {
        setHover({
          nodeId: null,
          connectedNodeIds: new Set<string>(),
          connectedEdgeIds: new Set<string>(),
        });
        setCursor('grab');
      }
    };

    const handleMouseLeave = (): void => {
      if (isPanningRef.current || draggingNodeIdRef.current) {
        return;
      }

      setHover({
        nodeId: null,
        connectedNodeIds: new Set<string>(),
        connectedEdgeIds: new Set<string>(),
      });
      setCursor('grab');
    };

    canvas.addEventListener('wheel', handleWheel, { passive: false });
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMoveCanvas);
    canvas.addEventListener('mouseleave', handleMouseLeave);
    window.addEventListener('mousemove', handleMouseMoveWindow);
    window.addEventListener('mouseup', handleMouseUpWindow);
    setCursor('grab');

    return () => {
      canvas.removeEventListener('wheel', handleWheel);
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('mousemove', handleMouseMoveCanvas);
      canvas.removeEventListener('mouseleave', handleMouseLeave);
      window.removeEventListener('mousemove', handleMouseMoveWindow);
      window.removeEventListener('mouseup', handleMouseUpWindow);
    };
  }, [canvasRef.current, onDragStart, onDragMove, onDragEnd]);

  return {
    transform,
    hover,
    selectedNodeId,
    setSelectedNodeId,
    resetTransform,
  };
}
