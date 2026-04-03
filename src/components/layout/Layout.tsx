import { type ReactNode, useState, useCallback, useRef, useEffect } from "react";
import Header from "./Header";

/* ------------------------------------------------------------------ */
/*  Layout – structural shell for the Copilot Session Dashboard       */
/*                                                                    */
/*  ┌──────────────────────────────────────────────────────┐          */
/*  │  Header                                              │          */
/*  ├─────────────────────────────────┤ ├──────────────────┤          */
/*  │  left                           │↔│  right           │          */
/*  │  flex-1                         │ │  resizable       │          */
/*  │                                 │ │  (scroll)        │          */
/*  └─────────────────────────────────┘ └──────────────────┘          */
/*                                                                    */
/*  Below md (768 px) the columns collapse to a vertical stack:       */
/*   • left  panel  → 40 vh                                           */
/*   • right panel  → remaining space                                 */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = 'rocinante-detail-width';
const DEFAULT_WIDTH = 480;
const MIN_WIDTH = 320;
const MAX_WIDTH = 800;

function loadWidth(): number {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const n = parseInt(raw, 10);
      if (!Number.isNaN(n) && n >= MIN_WIDTH && n <= MAX_WIDTH) return n;
    }
  } catch { /* ignore */ }
  return DEFAULT_WIDTH;
}

interface LayoutProps {
  left: ReactNode;
  right: ReactNode;
  fullContent?: ReactNode;
  bottomPanel?: ReactNode;
}

export default function Layout({
  left,
  right,
  fullContent,
  bottomPanel,
}: LayoutProps) {
  const [rightWidth, setRightWidth] = useState(loadWidth);
  const dragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const persistWidth = useCallback((w: number) => {
    try { window.localStorage.setItem(STORAGE_KEY, String(w)); } catch { /* ignore */ }
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    dragging.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const newWidth = Math.round(rect.right - e.clientX);
      const clamped = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, newWidth));
      setRightWidth(clamped);
    };
    const onPointerUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      setRightWidth((w) => { persistWidth(w); return w; });
    };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [persistWidth]);

  return (
    <div className="h-screen overflow-hidden bg-surface-primary flex flex-col">
      {/* Scoped scrollbar styles – thin, dark, unobtrusive */}
      <style>{scrollbarCSS}</style>

      <Header />

      {fullContent ? (
        <div className="flex-1 min-h-0">{fullContent}</div>
      ) : (
        <div
          ref={containerRef}
          className="flex-1 min-h-0 flex flex-col md:flex-row"
        >
          {/* ── Left panel: kanban board ── */}
          <aside
            className={[
              "layout-scrollable min-h-0 overflow-hidden min-w-0 flex-1",
              "h-[40vh] md:h-auto",
              "border-b border-border-default",
              "md:border-b-0 md:border-r",
            ].join(" ")}
          >
            {left}
          </aside>

          {/* ── Resize handle ── */}
          <div
            onPointerDown={onPointerDown}
            className="
              hidden md:flex items-center justify-center
              w-[5px] cursor-col-resize
              hover:bg-border-active/30 active:bg-border-active/50
              transition-colors duration-100 shrink-0
            "
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize detail panel"
          >
            <div className="w-[1px] h-8 bg-border-default/40 rounded-full" />
          </div>

          {/* ── Right panel: session detail ── */}
          <main
            className="layout-scrollable overflow-y-auto min-h-0 shrink-0"
            style={{ width: rightWidth }}
          >
            {right}
          </main>
        </div>
      )}

      {/* Terminal panel — renders at bottom, controls its own height */}
      {bottomPanel}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Custom scrollbar styles                                           */
/*                                                                    */
/*  Uses the same OKLch palette as the theme tokens defined in        */
/*  index.css so the scrollbar blends into the dark chrome.           */
/*                                                                    */
/*  • Webkit (Chrome / Edge / Safari) – full visual control           */
/*  • Firefox / standards – thin track via scrollbar-width + color    */
/* ------------------------------------------------------------------ */
const scrollbarCSS = `
  /* ---- Webkit ---- */
  .layout-scrollable::-webkit-scrollbar {
    width: 6px;
  }
  .layout-scrollable::-webkit-scrollbar-track {
    background: transparent;
  }
  .layout-scrollable::-webkit-scrollbar-thumb {
    background: var(--color-border-default);
    border-radius: 9999px;
  }
  .layout-scrollable::-webkit-scrollbar-thumb:hover {
    background: var(--color-surface-hover);
  }

  /* ---- Firefox / standards ---- */
  .layout-scrollable {
    scrollbar-width: thin;
    scrollbar-color: var(--color-border-default) transparent;
  }
`;
