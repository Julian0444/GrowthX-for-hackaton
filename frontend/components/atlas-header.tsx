"use client"

import type { AtlasViewState } from "@/components/atlas/atlas-shell"

export function AtlasHeader({ view, onReset }: { view: AtlasViewState; onReset: () => void }) {
  const resettable = view !== "idle" && view !== "analyzing"

  return (
    <header className="atlas-header">
      <button
        className="brand"
        type="button"
        title="GrowXth"
        aria-label="GrowXth — start a new search"
        onClick={() => {
          if (view !== "idle") onReset()
        }}
      >
        {/* La X del wordmark es el glifo de X (ex Twitter); el alto se ajusta a
            la altura de mayúscula del resto de la palabra. */}
        <h1 aria-label="GrowXth">
          Grow
          <svg className="brand-x" viewBox="0 0 300 300.251" aria-hidden="true" focusable="false">
            {/* stroke leve para empatar el peso 600 del wordmark a este tamaño */}
            <path
              fill="currentColor"
              stroke="currentColor"
              strokeWidth="14"
              d="M178.57 127.15 290.27 0h-26.46l-97.03 110.38L89.34 0H0l117.13 166.93L0 300.25h26.46l102.4-116.59 81.8 116.59h89.34M36.01 19.54h40.65l187.13 262.13h-40.66"
            />
          </svg>
          th
        </h1>
        <span className="sub">Developer growth intelligence</span>
      </button>
      {resettable && (
        <div className="header-right">
          <button className="reset-btn" type="button" onClick={onReset}>
            New search
          </button>
        </div>
      )}
    </header>
  )
}
