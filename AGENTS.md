# Repository Guidelines

## Project Structure & Module Organization
- `index.html` is the app shell and loads Tailwind via CDN. `styles.css` contains custom UI styles.
- `src/` holds modular JavaScript. Key areas: `src/app/` (bootstrap), `src/core/` (engine, RNG, layers), `src/render/` (canvas renderer), `src/ui/` (controls), `src/config/` (defaults, machines, descriptions), and `src/core/algorithms/`.
- `dist/` contains prebuilt static assets if a bundled build is produced; it is not required for local development.
- `README.md` contains information about the project design and capabilities; ALWAYS update this when adding/removing features and always review it to assess if updates are needed when making corrections or changes.
- A version is present in the HTML of the project; ALWAYS auto-increment this upon making any changes.
- The in-app help guide and shortcut list must be kept current; update it whenever features or UI behaviors change.

## Build, Test, and Development Commands
- `python -m http.server` runs a simple static server at `http://localhost:8000` for local testing.
- You can also open `index.html` directly in a browser for a zero-build run.

## Coding Style & Naming Conventions
- Follow `.editorconfig`: 2-space indentation, LF line endings, trim trailing whitespace.
- Use vanilla JavaScript, IIFE modules, and the `window.Vectura` namespace pattern seen in `src/app/app.js`.
- Naming: PascalCase for classes (`App`, `Renderer`), camelCase for methods/variables, lowercase file names (e.g., `engine.js`).
- Keep semicolons and existing formatting consistent with nearby files.

## Testing Guidelines
- No automated test framework is configured. Validate changes manually in the browser.
- When touching rendering or UI, verify: generation runs, canvas draws, controls update, and stats refresh.

## Commit & Pull Request Guidelines
- Git history currently only includes `Initial commit`, so no formal convention exists. Use short, imperative subjects (e.g., “Add new layer preset”).
- PRs should include: a brief summary, steps to test locally, and screenshots/GIFs for UI or rendering changes.

## Configuration & Deployment Notes
- Asset paths are relative so the site works on GitHub Pages subpaths.
- Update defaults and machine presets in `src/config/*.js` instead of hardcoding values in UI or engine code.
