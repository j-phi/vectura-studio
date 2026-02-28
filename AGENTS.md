# Repository Guidelines

## Project Structure & Module Organization
- `index.html` is the app shell and loads Tailwind via CDN. `styles.css` contains custom UI styles.
- `src/` holds modular JavaScript. Key areas: `src/app/` (bootstrap), `src/core/` (engine, RNG, layers), `src/render/` (canvas renderer), `src/ui/` (controls), `src/config/` (defaults, machines, descriptions), and `src/core/algorithms/`.
- `dist/` contains prebuilt static assets if a bundled build is produced; it is not required for local development.
- `README.md` contains information about the project design and capabilities; ALWAYS update this when adding/removing features and always review it to assess if updates are needed when making corrections or changes.
- `CHANGELOG.md` is the human-curated release history. Keep `Unreleased` current during development and add release notes for every version.
- `plans.md` is the active repo punchlist. Keep `Inbox`, `In Progress`, `Done`, and `Decisions` current as work evolves.
- `docs/agentic-harness-strategy.md` is the source-of-truth metadocument for agentic development workflow in this repo.
- `src/config/presets.js` is a shared preset registry for all systems (not Petalis-only). New presets must include `preset_system`, `id`, `name`, and `params`.
- Preset naming convention (required for new entries): `id` must be lowercase kebab-case and prefixed with its system as `<preset_system>-<preset-name>` (example: `petalis-camellia-pink-perfection`).
- `package.json` is the canonical version source. Run `npm run version:sync` whenever the version changes so `src/config/version.js` and the visible app badge stay aligned.
- The in-app help guide and shortcut list must be kept current; update it whenever features or UI behaviors change.
- Mermaid diagrams are the standard for architecture diagrams-as-code in repo documentation. Update them whenever architecture meaningfully changes.
- Universal noise work must converge on the shared `Noise Rack` model. Do not introduce new algorithm-specific noise stacks once shared primitives exist.

## Build, Test, and Development Commands
- `python -m http.server` runs a simple static server at `http://localhost:8000` for local testing.
- You can also open `index.html` directly in a browser for a zero-build run.
- `npm run version:sync` syncs derived version surfaces from `package.json`.

## Coding Style & Naming Conventions
- Follow `.editorconfig`: 2-space indentation, LF line endings, trim trailing whitespace.
- Use vanilla JavaScript, IIFE modules, and the `window.Vectura` namespace pattern seen in `src/app/app.js`.
- Naming: PascalCase for classes (`App`, `Renderer`), camelCase for methods/variables, lowercase file names (e.g., `engine.js`).
- Keep semicolons and existing formatting consistent with nearby files.

## Testing Guidelines
- Automated tests are configured and required where applicable: Vitest (`test:unit`, `test:integration`, `test:visual`, `test:perf`) and Playwright (`test:e2e`).
- Use `docs/testing.md` for test command details and CI policy.
- Local Playwright runs may fall back to an installed Chrome when managed browser assets are unavailable; CI remains the authoritative environment for Playwright artifact capture.
- When touching rendering or UI, verify: generation runs, canvas draws, controls update, and stats refresh.

## Commit & Pull Request Guidelines
- Use short, imperative commit subjects (e.g., “Add new layer preset”).
- PRs should include: a brief summary, steps to test locally, and screenshots/GIFs for UI or rendering changes.
- Use `.github/pull_request_template.md` and complete all checklist items before requesting review.

## Agentic Harness Governance
- `docs/agentic-harness-strategy.md` is the harness source of truth for agent workflow, documentation contracts, and verification expectations.
- Any PR that changes workflow, tooling, test policy, docs governance, or agent instructions MUST update `docs/agentic-harness-strategy.md` in the same PR.
- If no harness metadocument change is needed, the PR author MUST explicitly state why in the PR checklist.
- Do not allow workflow-policy drift across `AGENTS.md`, `README.md`, `CHANGELOG.md`, `plans.md`, `docs/testing.md`, and `.github/pull_request_template.md`; keep these documents synchronized.

## Configuration & Deployment Notes
- Asset paths are relative so the site works on GitHub Pages subpaths.
- Update defaults and machine presets in `src/config/*.js` instead of hardcoding values in UI or engine code.
- Keep cross-system presets in `src/config/presets.js`; use `preset_system` filtering in UI/engine code instead of creating separate per-system preset files.

## Pre-Release Hardening Log Policy
- If an idea is hardening-oriented and not needed for beta testing or development, do not auto-implement it.
- Log it in `docs/pre-release-hardening-log.md` as a new `PRH-###` entry.
- Mention the new or updated `PRH-###` entry in your response.
- Only implement logged hardening items when explicitly requested, or when the team enters final-release hardening mode.
