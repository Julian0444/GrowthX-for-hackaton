# GrowthX — Growth Atlas

A living map of the developer world: 136 real events ingested from Luma (SF + NYC) pulsing over an ink-on-paper atlas, ranking where a devtools company should grow next. Built with Next.js and Cursor for Creative Coding Night (a16z · QuiverAI · Cursor).

## Made with Quiver AI

The constellation emblem on the intake screen — the first thing you see — was generated with **Quiver AI** (Arrow 2.0) through its MCP server, driven from Cursor. Raw asset lives in `frontend/public/quiver/constellation-emblem.svg`; it renders inline via `frontend/components/quiver/constellation-emblem.tsx` with a sequential stroke draw-in, post-processed to `currentColor` + bare `viewBox` so it inherits the atlas palette.

A second Quiver mark, the GX monogram (`frontend/public/quiver/gx-monogram.svg`, same Arrow 2.0 pipeline), was produced during the end-to-end MCP verification run and is versioned as a spare for header/favicon use.
