import { useCallback, useEffect, useRef } from 'react';

import { useSettingsContext } from '../../context/SettingsContext';
import { useSessionContext } from '../../context/SessionContext';
import { getNodeSizeMultiplier } from '../../types/settings';
import { renderFrame, updateParticles, type NetworkRenderConfig } from './canvasRenderer';
import { getThemeColors } from './networkColors';
import type { GraphNode, Particle } from './networkTypes';
import { useCanvasInteraction } from './useCanvasInteraction';
import { useForceGraph } from './useForceGraph';

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface NetworkCanvasProps {
  onSelectNode: (nodeId: string | null) => void;
  selectedNodeId: string | null;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function NetworkCanvas({
  onSelectNode,
  selectedNodeId,
}: NetworkCanvasProps) {
  /* ---- data ---- */
  const { sessions, isLoading } = useSessionContext();
  const { settings } = useSettingsContext();
  const { nodes, edges } = useForceGraph(sessions);
  const renderConfig: NetworkRenderConfig = {
    animationSpeed: settings.network.animationSpeed,
    labelVisibility: settings.network.labelVisibility,
    nodeSizeScale: getNodeSizeMultiplier(settings.network.nodeSizeScale),
  };

  /* ---- refs ---- */
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const sizeRef = useRef({ w: 0, h: 0 });
  const rafRef = useRef<number>(0);
  const prevTimeRef = useRef<number>(0);

  /* ---- drag callbacks (pin / unpin nodes) ---- */

  const findNode = useCallback(
    (id: string): GraphNode | undefined => nodes.find((n) => n.id === id),
    [nodes],
  );

  const handleDragStart = useCallback(
    (nodeId: string) => {
      const node = findNode(nodeId);
      if (!node) return;
      node.fx = node.x ?? 0;
      node.fy = node.y ?? 0;
    },
    [findNode],
  );

  const handleDragMove = useCallback(
    (nodeId: string, x: number, y: number) => {
      const node = findNode(nodeId);
      if (!node) return;
      node.fx = x;
      node.fy = y;
    },
    [findNode],
  );

  const handleDragEnd = useCallback(
    (nodeId: string) => {
      const node = findNode(nodeId);
      if (!node) return;
      node.fx = null;
      node.fy = null;
    },
    [findNode],
  );

  /* ---- canvas interaction ---- */

  const { transform, hover, selectedNodeId: internalSelectedId, setSelectedNodeId } =
    useCanvasInteraction(
      canvasRef,
      nodes,
      handleDragStart,
      handleDragMove,
      handleDragEnd,
    );

  /* ---- sync selection: props → hook ---- */

  useEffect(() => {
    if (selectedNodeId !== internalSelectedId) {
      setSelectedNodeId(selectedNodeId);
    }
    // Only react to prop changes — avoid infinite loop from internal updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNodeId]);

  /* ---- sync selection: hook → parent ---- */

  useEffect(() => {
    if (internalSelectedId !== selectedNodeId) {
      onSelectNode(internalSelectedId);
    }
    // Only react to internal selection changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [internalSelectedId]);

  /* ---- responsive resize ---- */

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const applySize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const dpr = window.devicePixelRatio || 1;
      const logicalW = container.clientWidth;
      const logicalH = container.clientHeight;

      canvas.width = logicalW * dpr;
      canvas.height = logicalH * dpr;
      canvas.style.width = `${logicalW}px`;
      canvas.style.height = `${logicalH}px`;

      sizeRef.current = { w: canvas.width, h: canvas.height };
    };

    // Set initial size immediately.
    applySize();

    const observer = new ResizeObserver(applySize);
    observer.observe(container);

    return () => observer.disconnect();
  }, []);

  /* ---- animation loop ---- */

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const tick = (timestamp: number) => {
      // Delta time in seconds, capped to avoid spiral-of-death on tab re-focus.
      const dt = prevTimeRef.current
        ? Math.min((timestamp - prevTimeRef.current) / 1000, 0.1)
        : 0.016;
      prevTimeRef.current = timestamp;

      const { w, h } = sizeRef.current;
      const resolvedTheme: 'dark' | 'light' = document.documentElement.classList.contains('light')
        ? 'light'
        : 'dark';
      const themeColors = getThemeColors(resolvedTheme);

      // Advance particle simulation.
      particlesRef.current = updateParticles(
        particlesRef.current,
        edges,
        nodes,
        dt,
        renderConfig,
      );

      // Draw everything.
      renderFrame(
        ctx,
        w,
        h,
        nodes,
        edges,
        particlesRef.current,
        transform,
        hover,
        selectedNodeId,
        timestamp,
        renderConfig,
        themeColors,
      );

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      prevTimeRef.current = 0;
    };
    // We intentionally read mutable refs (particles, size) inside the loop
    // rather than listing them as deps. The values that *do* change identity
    // (nodes, edges, transform, hover, selectedNodeId) are listed so the
    // loop restarts with fresh closures when the graph or interaction state
    // changes.
  }, [nodes, edges, transform, hover, selectedNodeId, renderConfig]);

  /* ---- render ---- */

  const showEmpty = sessions.length === 0 && !isLoading;
  const showLoading = isLoading && sessions.length === 0;
  const resolvedTheme: 'dark' | 'light' = document.documentElement.classList.contains('light')
    ? 'light'
    : 'dark';
  const themeColors = getThemeColors(resolvedTheme);

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        style={{ background: themeColors.background }}
      />

      {/* ---- empty state overlay ---- */}
      {showEmpty && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center select-none">
          <div className="space-y-2 text-center">
            <div className="text-2xl opacity-40" aria-hidden="true">
              🕸️
            </div>
            <p className="text-sm text-fg/45">No sessions to visualize</p>
          </div>
        </div>
      )}

      {/* ---- loading state overlay ---- */}
      {showLoading && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center select-none">
          <div className="space-y-2 text-center">
            <div
              className="mx-auto h-5 w-5 animate-spin rounded-full border-2 border-fg/20 border-t-white/60"
              aria-hidden="true"
            />
            <p className="text-sm text-fg/40">Loading…</p>
          </div>
        </div>
      )}
    </div>
  );
}
