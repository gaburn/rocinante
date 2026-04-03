import type { ReactNode } from "react";
import Header from "./Header";

/* ------------------------------------------------------------------ */
/*  Layout – structural shell for the Copilot Session Dashboard       */
/*                                                                    */
/*  ┌──────────────────────────────────────────────────────┐          */
/*  │  Header                                              │          */
/*  ├─────────────────────────────────────────┬────────────┤          */
/*  │  left                                   │  right     │          */
/*  │  1fr                                    │  420 px    │          */
/*  │                                         │  (scroll)  │          */
/*  └─────────────────────────────────────────┴────────────┘          */
/*                                                                    */
/*  Below md (768 px) the columns collapse to a vertical stack:       */
/*   • left  panel  → 40 vh                                           */
/*   • right panel  → remaining space                                 */
/* ------------------------------------------------------------------ */

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
  return (
    <div className="h-screen overflow-hidden bg-surface-primary flex flex-col">
      {/* Scoped scrollbar styles – thin, dark, unobtrusive */}
      <style>{scrollbarCSS}</style>

      <Header />

      {fullContent ? (
        <div className="flex-1 min-h-0">{fullContent}</div>
      ) : (
        <div
          className={[
            "flex-1 min-h-0 grid",
            /* Mobile: single column, session list gets ~40 vh */
            "grid-cols-1 grid-rows-[40vh_1fr]",
            /* Desktop: side-by-side, kanban board fills remaining space, detail panel is fixed */
            "md:grid-cols-[minmax(0,1fr)_480px] md:grid-rows-[1fr]",
          ].join(" ")}
        >
          {/* ── Left panel: kanban board ── */}
          <aside
            className={[
              "layout-scrollable min-h-0 overflow-hidden",
              /* Border: bottom on mobile, right on desktop */
              "border-b border-border-default",
              "md:border-b-0 md:border-r",
            ].join(" ")}
          >
            {left}
          </aside>

          {/* ── Right panel: session detail ── */}
          <main className="layout-scrollable overflow-y-auto min-h-0">
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
