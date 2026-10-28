# Repository Guidelines

## Project Structure & Module Organization
- `index.html` is the app shell and loads Tailwind via CDN. All UI styling lives under `src/ui/skin/` (tokens + motion + components + per-skin palette files) — the legacy `styles.css` was retired in v1.1.10.
- `src/` holds modular JavaScript. Key areas: `src/app/` (bootstrap), `src/core/` (engine, RNG, layers), `src/render/` (canvas renderer), `src/ui/` (controls), `src/config/` (defaults, machines, descriptions), and `src/core/algorithms/`.
- `dist/` contains prebuilt static assets if a bundled build is produced; it is not required for local development.
- `README.md` contains information about the project design and capabilities; ALWAYS update this when adding/removing features and always review it to assess if updates are needed when making corrections or changes.
- `CHANGELOG.md` is the human-curated release history. Keep `Unreleased` current during development and add release notes for every version.
- `plans.md` is the active repo punchlist. Keep `Inbox`, `In Progress`, `Done`, and `Decisions` current as work evolves.
- `docs/agentic-harness-strategy.md` is the source-of-truth metadocument for agentic development workflow in this repo.
- `src/ui/skin/` holds the multi-skin theme system: `tokens.css` + `motion.css` + `components.css` (skin-agnostic) plus per-skin palette files (`classic-dark.css`, `classic-light.css`, `classic-lark.css`, `meridian-dark.css`, `meridian-light.css`, `meridian-lark.css`). Adding a new skin: run `npm run skin:new -- <id>` to scaffold from `_template.css`, edit the palette, then add a manifest entry to `src/config/defaults.js` under `window.Vectura.THEMES`. Full guide at `docs/skin-authoring.md`. Skin authoring is **CSS + manifest only** — do not branch JavaScript on skin id; gate behavior on `manifest.capabilities` instead.
- **Presets:** strictly file-based under `user-presets/<layer_type>/` — full rules (directory naming, bundler behavior, id naming convention, default-origins caveats) in `CLAUDE.md` → "Configuration".
- `package.json` is the canonical version source. Run `npm run version:sync` whenever the version changes so `src/config/version.js` and the visible app badge stay aligned.
- The in-app help guide and shortcut list must be kept current; update it whenever features or UI behaviors change.
- Mermaid diagrams are the standard for architecture diagrams-as-code in repo documentation. Update them whenever architecture meaningfully changes.
- Universal noise work must converge on the shared `Noise Rack` model. Do not introduce new algorithm-specific noise stacks once shared primitives exist.

## Build, Test, and Development Commands
- Node 20.19 or newer is required for the development and test toolchain; use Node 24 (`.nvmrc`), the CI major and the only one where golden values are checked.
- `python -m http.server` runs a simple static server at `http://localhost:8000` for local testing.
- You can also open `index.html` directly in a browser for a zero-build run.
- `npm run version:sync` syncs derived version surfaces from `package.json`.

## Coding Style & Naming Conventions
- Follow `.editorconfig`: 2-space indentation, LF line endings, trim trailing whitespace.
- Use vanilla JavaScript, IIFE modules, and the `window.Vectura` namespace pattern seen in `src/app/app.js`.
- Naming: PascalCase for classes (`App`, `Renderer`), camelCase for methods/variables, lowercase file names (e.g., `engine.js`).
- Keep semicolons and existing formatting consistent with nearby files.
- **CSS placement:** all new CSS lands in `src/ui/skin/` — placement map and layout rules in `CLAUDE.md` → "CSS & Layout Rules".

## Testing Guidelines
- Automated tests are configured and required where applicable: Vitest (`test:unit`, `test:integration`, `test:visual`, `test:perf`) and Playwright (`test:e2e`).
- `docs/testing.md` is the one guide for test commands, the CI graph, goldens and corpora. Policy is in `docs/agentic-harness-strategy.md` section 5.
- **CI is the full gate.** The required check is `ci-ok`. A PR runs 8 uninstrumented Vitest shards with a strict merge, 4 `e2e-smoke` legs (3 desktop, 1 touch smoke on one Chromium and one WebKit project), perf, and the Scene3D audits when `scripts/audit-paths.js` matches. The coverage ratchet runs on every main push (12 shards). The full touch roster, the touch audit and the linux pixel snapshots run nightly. A red main or nightly opens a `ci-red-main` issue.
- **Local rule.** Before a commit, run `npm run test:feedback` and the test files you touched. `npm run test:ci` is optional. Run the touch specs a change affects (`npm run test:playwright -- tests/e2e/touch/<spec>`); the PR touch smoke covers two projects only.
- **Fix tests.** A fix commits a test of the current contract. Put the RED proof in the commit message or PR. Do not rebuild old source trees from git history in tests (`tests/unit/no-git-history-in-tests.test.js`).
- **Test performance budget.** A test file is the unit of sharding: aim for at most ~120 s hosted coverage time per file and split above ~240 s. Prefer cheap layers, avoid repeated full renders, and make every render feed an assertion. Scene3D tests should stay at or below 50 % of coverage file-seconds (reported, not gated). See `docs/test-performance-lessons.md`.
- Every cache or trim needs a mutation proof that the witness still fails. Never lower a threshold, add a skip or raise a timeout to save time. Every test runs pre-merge on every PR that can affect it (path-routed, shared dependencies included), and every test runs on `main` nightly with an auto-issue on red.
- Refresh shard weights from Vitest blob durations only (`scripts/test-shard-weights-refresh.js`). Keep 2 CI workers. Measure wall time from workflow creation to the last check.
- Run Vitest through npm scripts (`npm run test:vitest -- run <test-path>` for a focused run) so owned workers are cleaned up on exit/cancellation. The default per-attempt deadline is 30 minutes locally / three hours in CI (`VECTURA_TEST_TIMEOUT_MS`); lifecycle tests run via `npm run test:runner` and before unit tests. Use WSL on Windows.
- **Shared local test queue (mandatory).** All heavy test commands go through `scripts/test-queue.js`, one machine-wide lock shared by every worktree and agent session. Run tests only through the npm entrypoints (`npm run test:*`; for a single file use `npm run test:vitest -- run <file>` or `npm run test:playwright -- <spec>`). Do not run `npx vitest`, `npx playwright test`, or the `node_modules/.bin` binaries directly. A waiting run prints the lock holder; check it with `npm run test:queue:status`. Do not delete the lock or kill its holder. CI runs bypass the queue. Full contract in `docs/testing.md` → "Shared Local Test Queue".
- Local Playwright runs may fall back to an installed Chrome when managed browser assets are unavailable; CI remains the authoritative environment for Playwright artifact capture.
- When touching rendering or UI, verify: generation runs, canvas draws, controls update, and stats refresh.
- Pre-push hook: run `npm run hooks:install` once after cloning. It installs a `pre-push` hook that runs `npm run test:feedback` (bounded local feedback; see `docs/testing.md`) before every push. The minimal browser journey runs locally; the complete browser roster remains in CI. Bypass with `SKIP_PREPUSH=1 git push` only when intentional.

## Commit & Pull Request Guidelines
- **Concurrent work safety:** before any destructive git op (`reset`, `clean`, `checkout -- `, `rebase`, `push --force`) or before starting a second effort atop uncommitted WIP, follow `CLAUDE.md` → "Concurrent Development & Working-Tree Safety" — checkpoint first, isolate parallel work in disjoint worktrees, and do not push/merge/tag without explicit approval. A PreToolUse guard hook enforces this.
- Use short, imperative commit subjects (e.g., “Add new layer preset”).
- PRs should include: a brief summary, steps to test locally, and screenshots/GIFs for UI or rendering changes.
- Use `.github/pull_request_template.md` and complete all checklist items before requesting review.

## Agentic Harness Governance
- `docs/agentic-harness-strategy.md` is the harness source of truth for agent workflow, documentation contracts, and verification expectations.
- Any PR that changes workflow, tooling, test policy, docs governance, or agent instructions MUST update `docs/agentic-harness-strategy.md` in the same PR.
- If no harness metadocument change is needed, the PR author MUST explicitly state why in the PR checklist.
- Test and CI policy has one home: `docs/agentic-harness-strategy.md` (policy) and `docs/testing.md` (operation). `AGENTS.md`, `CLAUDE.md` and `README.md` only summarize and link; update their summaries when the policy changes.

## Configuration & Deployment Notes
- Asset paths are relative so the site works on GitHub Pages subpaths.
- Update defaults and machine presets in `src/config/*.js` instead of hardcoding values in UI or engine code.
- Keep all presets strictly file-based in the `user-presets/` folder; do not introduce separate per-system JS preset files.

## Pre-Release Hardening Log Policy
- If an idea is hardening-oriented and not needed for beta testing or development, do not auto-implement it.
- Log it in `docs/pre-release-hardening-log.md` as a new `PRH-###` entry.
- Mention the new or updated `PRH-###` entry in your response.
- Only implement logged hardening items when explicitly requested, or when the team enters final-release hardening mode.
