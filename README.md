# Coop Designer

A 3D chicken-coop designer built with three.js.

Plan a coop interactively, adjust dimensions, and see the structure in 3D. The designer works with standard sheet sizes and lumber stock lengths, and persists state in the browser.

## Features

- Interactive 3D view with orbit controls
- Parametric coop geometry
- Sheet-size and lumber-stock awareness
- Local persistence of the current design

## Getting started

```bash
npm install
npm run dev
```

Build for production:

```bash
npm run build
npm run preview
```

## Layout

- `src/main.js` — scene setup, controls, state persistence
- `src/coop.js` — parameters, plans, and stock helpers
- `src/geometry.js` — 3D geometry construction
- `src/style.css` — UI styling

## Status

Small standalone design tool.
