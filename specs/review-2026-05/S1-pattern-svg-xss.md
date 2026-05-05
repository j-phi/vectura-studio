# S1 — SVG Pattern XSS (CRITICAL)

## Problem

User-imported SVG tiles in the Pattern Designer are stored verbatim into `draftMeta.svg` and later assigned via `innerHTML` inside `buildSourceFillSampler`, which executes embedded `<script>`, `on*` handlers, and `javascript:` URLs. The file-import path in `ui-file-io.js` already strips `on*` attributes, but the pattern path bypasses that sanitizer entirely, leaving a working XSS vector. C2 (silent catches in `pattern.js`) is bundled here because it concerns the same module's hardening.

## Files in scope

- `src/ui/ui-pattern-designer.js` — line ~1047 (raw `svgText` → `draftMeta.svg`)
- `src/ui/ui-file-io.js` — lines 188–191 (existing partial sanitizer; replace with shared call)
- `src/core/pattern.js` — line 1528 (`tempSvg.innerHTML = svg.innerHTML` in `buildSourceFillSampler`); lines 701 and 851 (silent catches)
- `src/core/svg-sanitize.js` — **new file** (IIFE on `window.Vectura.SvgSanitize`)
- `index.html` — script load order: insert `svg-sanitize.js` before any consumer
- `tests/unit/security_xss.test.js` — extend with new pattern-path cases

## EARS requirements

- **REQ-1 (Ubiquitous):** The system shall expose a single sanitizer `Vectura.SvgSanitize.sanitize(svgString)` that returns an SVG string with all `<script>` and `<foreignObject>` elements removed, all `on*` attributes stripped, and any `href`/`xlink:href` whose value matches `^\s*javascript:` rewritten to `#`.
- **REQ-2 (Event-driven):** When the user imports an SVG via the Pattern Designer, the system shall pass the raw markup through `Vectura.SvgSanitize.sanitize` before assigning it to `draftMeta.svg`.
- **REQ-3 (Event-driven):** When the user imports an SVG via the file-open path, the system shall pass the raw markup through `Vectura.SvgSanitize.sanitize` instead of the in-line regex strip.
- **REQ-4 (Ubiquitous):** The `buildSourceFillSampler` routine shall continue to use `innerHTML` assignment, but its input is required (by contract) to have already been sanitized.
- **REQ-5 (Unwanted behavior — C2):** If a `try`/`catch` block in `pattern.js` catches an error, then the system shall emit `console.warn('[Pattern] <context>:', err)` rather than swallow silently.

## Implementation notes

- `SvgSanitize.sanitize` should parse with `DOMParser` (`image/svg+xml`), walk the tree, drop `<script>` and `<foreignObject>` nodes, iterate attributes and remove any whose lowercased name starts with `on`, and rewrite `href`/`xlink:href`/`xlink\:href` containing `javascript:` (case-insensitive, leading-whitespace-tolerant) to `#`.
- Return serialized markup via `XMLSerializer`. On parse error, return an empty `<svg/>` shell rather than the original string.
- Keep the function pure and synchronous — no DOM mounts.
- Insert `<script src="src/core/svg-sanitize.js"></script>` in `index.html` before `src/core/pattern.js` and any UI consumer.
- For C2: replace `} catch (_) {}` at pattern.js:701 with a `console.warn` carrying a short context label (e.g. `'sampler init'`); same for line 851 (`'tile bake'` or accurate label).
- Do not change pattern rendering semantics; sanitization is a pre-store filter only.

## Out of scope

- Engine state (`B1-A6-engine-state-encapsulation.md`).
- Renderer math (`B3-renderer-precision.md`).
- Noise rack refactor (`A4-noise-rack-discipline.md`).
- Algorithm tuning extraction (`A5-algorithm-tuning-config.md`).
- Math-utils consolidation (`A3-C1-math-utils-consolidation.md`).
- Reworking pattern rendering, tile baking, or sampler internals beyond the trust boundary.

## Acceptance tests

- `tests/unit/security_xss.test.js` — `<image onerror="...">` in pattern import: sanitized output has no `onerror` attribute and the handler does not fire under jsdom.
- `tests/unit/security_xss.test.js` — `<script>` element in pattern SVG: removed from sanitized output; no execution side effect observed.
- `tests/unit/security_xss.test.js` — `<animate onbegin="...">`: `onbegin` stripped, element retained.
- `tests/unit/security_xss.test.js` — `<a href="javascript:alert(1)">`: `href` rewritten to `#`.
- `tests/unit/security_xss.test.js` — file-open path uses the same sanitizer (assert by mocking `SvgSanitize.sanitize` and asserting it was called for both code paths).
- `tests/unit/pattern_logging.test.js` (new or appended) — force a thrown error inside the two former silent catches and assert `console.warn` was called with `[Pattern]` prefix.

## Done when

- [ ] `src/core/svg-sanitize.js` exists and is loaded in `index.html` before consumers.
- [ ] `ui-pattern-designer.js` and `ui-file-io.js` both route imported SVG through `SvgSanitize.sanitize`.
- [ ] `pattern.js` silent catches replaced with `console.warn` calls.
- [ ] `npm run test:unit` passes including new XSS cases.
- [ ] Manual smoke: importing a malicious SVG into Pattern Designer no longer fires handlers.
