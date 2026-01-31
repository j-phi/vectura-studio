# Vectura Studio

Vectura Studio is a physics-inspired vector generator for plotter-ready line art.

This version is **no-build**: it runs directly in the browser with Tailwind loaded via CDN and modular JavaScript files.

## Run locally

Option A — open directly:

- Double-click `index.html`.

Option B — simple static server:

```bash
python -m http.server
```

Then visit `http://localhost:8000`.

## GitHub Pages (no build step)

1. Push this repo to GitHub.
2. In **Settings → Pages**, set **Source** to `Deploy from a branch`.
3. Select your branch (e.g., `main`) and the root (`/`) folder.

All asset paths are relative (`./...`) so the site works under a GitHub Pages subpath.

## Project structure

- `index.html` — App shell + Tailwind CDN config
- `styles.css` — Custom UI styling (scrollbars, form controls, animation, texture)
- `src/` — Modular JS (config, algorithms, engine, renderer, UI, app bootstrap)
