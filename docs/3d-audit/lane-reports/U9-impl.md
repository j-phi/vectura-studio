STATUS: DONE/FU

# U9 — Shadow path resolve half (implementer report)

Lane: handoff-c2. Worktree: `/Users/jayphi/Documents/github/vectura-studio/.claude/worktrees/handoff-c2`,
branch `3d-scene/handoff-c2`, port 8470. Base `main` 47a5a755 (v1.3.99) → this unit's new commit (see
bottom). Working tree confirmed clean (`git status`, `git stash list`) before starting.

**SCOPE, per the orchestrator's ruling** (`docs/3d-audit/lane-reports/LEDGER.md`, end of file, "U9 is
scoped to its RESOLVE half"): only the shadow-side tone-law ALIASES resolution bug, RED on main today. The
uniqueness re-pin ("offered × collapse options") and `onePenDown`/`TONE_LAW_NOT_DISTINGUISHABLE` handling
are **U9b**, filed QUEUED behind U8 — **not touched here** (see "U9b handoff" below).

## The bug

`src/config/scene3d-tone-laws.js:909` (`ALIASES`) maps a folded id to its picker-tier survivor, e.g.
`fineLadder -> { into: 'ladder', params: { rungMode: 'fine' } }`. For the **style** path
(`style.params.toneLaw`), `normalizeStyle`'s migration shim independently re-reads the raw pre-clamp value
and writes the sibling collapse param (`rungMode`) back onto the same bag, so
`Params.resolveToneLaw({toneLaw:'ladder', rungMode:'fine'})` can reconstruct the internal id `'fineLadder'`
for `surface-fill.js`'s dispatch.

The **shadow** bag has no such shim and no sibling sub-control field (`DEFAULT_SHADOW` — one flat
`shadowToneLaw` string, nothing else). Before this fix, `normalizeShadow` ran `shadowToneLaw` through the
*shared* `clampStyleParam('toneLaw', …)` case (`params.js` ~:741-771), whose ALIASES branch
(`ALIASES[value].into`) collapses a folded id straight to its survivor with **no way to get the lost
`rungMode` back**. `shadows.js:2713` (`clampToneLawId(shadowBag.shadowToneLaw)`) then dispatches into
`HATCH_LAW_RECIPES` (`shadows.js:1003`) keyed by that already-collapsed `'ladder'` — but `HATCH_LAW_RECIPES`
is keyed by the **internal** id, and `'ladder'` deliberately has NO entry there (comment: "it must always
take the fallback… never a recipe"), while `fineLadder` **does** have its own entry
(`hatchOffset(rings, angleDeg, spacing, 0, 0.97)`). Result: any scene/preset saved with
`shadow.shadowToneLaw: 'fineLadder'` (or any other folded id) silently rendered plain-hatch `'ladder'`
geometry instead of its own recipe — a real, byte-level regression for every such saved document.

## RED

Two new failing tests (both against the pre-fix tree, run and confirmed failing before any `src/` edit):

1. `tests/unit/scene3d-shadow-tone-law.test.js` — new HEADLINE case
   `'HEADLINE (U9) — shadowToneLaw:"fineLadder" (a folded id) still renders its OWN recipe, not the
   plain-hatch fallback'`: `buildShadows({shadowToneLaw:'fineLadder'})` vs `buildShadows({shadowToneLaw:
   'ladder'})` through the full `Scene3D.Shadows.build` pipeline — RED because the two geomSignatures were
   IDENTICAL (`expected […] not to be […]` — same string).
2. Same file, new case under `Scene3D.Params — shadowToneLaw whitelist`:
   `'U9 — a FOLDED id (e.g. "fineLadder") survives normalization unchanged, not collapsed to its
   survivor'` — loads a roster fixture with `ALIASES` into the bare-require global scope (the existing
   sibling "roster IS loaded" test's pattern) and asserts `Params.normalizeShadow({shadowToneLaw:
   'fineLadder'}).shadowToneLaw === 'fineLadder'` — RED: received `'ladder'`.

Both run via `npx vitest run tests/unit/scene3d-shadow-tone-law.test.js` (foreground, one file at a time,
per protocol) — 2/22 failing, 20/22 passing, before the fix.

## GREEN — the fix

`src/core/scene3d/params.js` (shadow bag only, ~:1002-1035): added a new, shadow-bag-local
`clampShadowToneLaw(value)` — **not** a change to the shared `clampStyleParam('toneLaw', …)` case (that
function is still used, unchanged, by `normalizeStyle` for `style.params.toneLaw`, and is contended
territory with fill-collapse-2's W-10d-2/-3). The new function:
- accepts the roster's own shipped `DEFAULT` explicitly (same reasoning as the shared clamp);
- checks `ALIASES` membership **directly** (mirroring `resolveToneLaw`'s own rule 2: "an id that is itself
  a key of ALIASES is already the correct internal id") and passes it through **unchanged** — no
  `.into` rewrite;
- otherwise falls back to `IDS` membership, then to `'ladder'` with a one-time warn for a genuinely
  unrecognized id — same shape as the shared clamp.

`normalizeShadow`'s `shadowToneLaw` field now calls `clampShadowToneLaw(src.shadowToneLaw)` instead of
`clampStyleParam('toneLaw', src.shadowToneLaw)`.

The picker only ever offers `PICKER_IDS` (folded ids excluded — confirmed by reading
`SCENE_FILL_STYLES.groups()` in `src/config/context-bar.js`), so this never lets a *new* pick reach a
folded value; it only preserves what an already-saved scene/preset/document carries.

Both RED tests pass after the fix: `npx vitest run tests/unit/scene3d-shadow-tone-law.test.js` → **22/22
passing**.

## Stale guard discovered and updated (RGR, not silenced)

Running the wider blast radius surfaced a **real conflict with an existing, already-merged guard**:
`tests/unit/scene3d-tone-law-collapse.test.js` (owned by the already-merged U0-U8 fill-collapse units, a
DIFFERENT lane's file) contained **6 test executions**, at 4 source locations, all named
`'clampStyleParam belt-and-brace: shadowToneLaw carrying a folded id maps to the survivor, never warns'`,
asserting the OLD (buggy) contract — that a folded `shadowToneLaw` value collapses to its survivor. That
was written when the shared `clampStyleParam` ALIASES branch was believed correct for shadows too; U9's own
root-cause analysis (this plan, orchestrated) established that it was in fact the bug.

Per `CLAUDE.md`'s RGR discipline ("stale assertion → update the test to reflect the new contract; never
delete coverage to 'make it pass'"), and following the **exact same pattern already used in this same file**
by a prior unit (search "STALE ASSERTION UPDATE (U1)" at line ~222 of the file, pre-existing), I updated all
4 locations with a "STALE ASSERTION UPDATE (U9, resolve half)" comment block and changed the expectation
from `.toBe(survivor)` to `.toBe(id)` (pass-through), keeping the "never warns" assertion (still true — a
folded id is a known, valid id). Locations:
- line ~207 (U0 foundation, synthetic alias) — test 7, renamed to name the new contract + "(U9)".
- line ~397 (U1 cluster, real `fineLadder`/`phaseFineLadder`/`perceptualRamp`).
- line ~580 (`describeSingleParamCluster` helper, shared by U2/U3/U4 — 3 executions from one source edit).
- line ~896 (U5 cluster).

Full file re-run: `npx vitest run tests/unit/scene3d-tone-law-collapse.test.js` → **54/54 passing**
(was 48/54 passing, 6 failing, before this update — confirmed both before my fix, where all 54 would have
passed under the OLD contract, and immediately after my `params.js` fix, where these exact 6 broke, proving
the fix and the stale guard are the same defect from two sides).

This file is fill-collapse-2's normal territory (their U7/U8 chain is "QUEUED — after U9" per
`ROUND2-BRIEFS.md`), so I limited the edit to the smallest possible diff (4 comment blocks + 2 changed
tokens each: the assertion target and, in one place, the test's own name) and documented the exact
reasoning inline so their next unit sees why it changed, not just that it changed.

## `## Bars changed`

- `tests/unit/scene3d-tone-law-collapse.test.js:214` (U0 foundation, test 7) — `expect(shadow.shadowToneLaw).toBe('ladder')` → `.toBe('syntheticFolded')` (the raw id) — because `normalizeShadow` no longer collapses a folded id to its survivor (U9 fix). Old behaviour was the bug being fixed.
- `tests/unit/scene3d-tone-law-collapse.test.js:402` (U1 cluster) — `.toBe('ladder')` → `.toBe(id)` (per-id, `fineLadder`/`phaseFineLadder`/`perceptualRamp`) — same reason.
- `tests/unit/scene3d-tone-law-collapse.test.js:585` (`describeSingleParamCluster` helper, U2/U3/U4) — `.toBe(survivor)` → `.toBe(id)` — same reason.
- `tests/unit/scene3d-tone-law-collapse.test.js:901` (U5 cluster) — `.toBe(SURVIVOR)` → `.toBe(id)` — same reason.
- No numeric threshold/tolerance/count bar changed. No fingerprint re-pin. The uniqueness sweep
  (`tests/unit/scene3d-shadow-tone-law-uniqueness.test.js`) was run unmodified and still passes 3/3 (its own
  re-pin, if any, is U9b's job, per the ROUND2 brief's explicit "U9's re-pin depends on it [U8]").

## Live verification (bespoke — no gallery cell renders a cast shadow)

Confirmed via `SCENE_FILL_STYLES.groups()`/manifest inspection and the ROUND2 brief itself: the gallery is
object-only, no manifest cell covers a shadow. Evidence is a bespoke real-app capture:
`scripts/u9-shadow-resolve-evidence.js` (new, in this worktree) — served from THIS worktree's dev server on
port 8470, driven with Playwright (chrome-devtools MCP was unavailable this session — connection failure —
so Playwright was used per `CLAUDE.md`'s fallback instruction).

Scene: sphere (r=34) on an enabled ground plane, one directional light (azimuth 135°, elevation 40°,
`castShadows: true`), orthographic camera. Three builds, same view (`applyView` reused verbatim):
1. `shadow.shadowToneLaw: 'ladder'` — "before" stand-in (proven byte-identical to pre-fix `'fineLadder'` by
   the unit test's own geomSignature equality — no need to check out the pre-fix source into the worktree,
   which the protocol forbids doing via `stash`).
2. `shadow.shadowToneLaw: 'fineLadder'` — "after", under the current (fixed) worktree.
3. `shadow.shadowToneLaw: 'penCross'` (an ordinary, non-folded survivor) — control, sanity-checks the
   general dispatch mechanism independent of this one folded id.

Output: `docs/3d-audit/fill-audit/after/U9/` (`before-full.png`, `before-crop.png`, `after-full.png`,
`after-crop.png`, `control-penCross-full.png`, `stats.json`, `report.json`). **I looked at the PNGs**
(Read tool, both full frames and the crops):
- `before-full.png`/`after-full.png` show the sphere (its own meridian-line hatch), the ground's own sparse
  parallel hatch, and the shadow footprint as a denser fine-hatch teardrop where the two overlap-looking
  families combine.
- `before-crop.png` vs `after-crop.png`, at the same 340mm/1200px crop centred on the shadow's own fill
  bbox: the difference is genuinely **subtle** by design — `HATCH_LAW_RECIPES.fineLadder` is a 0.97x
  spacing multiplier (comment in `shadows.js`: the family's recipes are "chosen so no two ids land on the
  same (angle, mult) pair", not necessarily a dramatically different look). I do NOT overclaim a visually
  obvious texture change here — that would be dishonest for this specific recipe.
- **Numeric confirmation, not just "trust the pixels":** `shadowPathCount` 147 (before) → 151 (after),
  +2.72%. Predicted from the 0.97x spacing multiplier: `1/0.97 - 1 = 3.09%` more lines in the same
  footprint — `147 * 1.0309 ≈ 151.5`, matching the measured 151 almost exactly. `geomSig` (exact-coordinate
  signature, same check the unit tests use) differs (`stats.json summary.afterDiffersFromBefore: true`).
- `control-penCross-full.png` (a 'cross' mark-class id) shows an obviously crosshatched shadow texture, a
  visibly different picture from the plain-hatch before/after shots (`controlShadowPathCount: 190`,
  `controlDiffersFromBefore: true`) — confirms the dispatch mechanism itself (not just this one folded id)
  still works correctly.
- `stats.json` carries the full per-build `geomSig`/`shadowPathCount`/`shadowBB` for independent
  re-verification.

`report.json` in that directory states explicitly that this cell is bespoke (no gallery manifest cell
covers it) and explains the "before" stand-in's proof of validity.

## Tests run (full list, all foreground, one file/group at a time per protocol)

- `tests/unit/scene3d-shadow-tone-law.test.js` — **22/22 passing** (2 new RED→GREEN cases).
- `tests/unit/scene3d-shadow-tone-law-uniqueness.test.js` — **3/3 passing**, unmodified (U9b's territory).
- `tests/unit/scene3d-tone-law-collapse.test.js` — **54/54 passing** (6 stale assertions updated, see
  above).
- `tests/unit/scene3d-shadow-cross-wave-continuity.test.js` — **23/23 passing**, unmodified.
- `tests/unit/scene3d-shadow-tone-gradient.test.js` — **28/28 passing**, unmodified.
- `tests/unit/scene3d-tone-law-params.test.js` — **13/13 passing**, unmodified (confirms the STYLE path
  through `clampStyleParam('toneLaw', …)` is untouched).
- `tests/unit/scene3d-border-offset-geometry.test.js`, `scene3d-border-offset.test.js`,
  `scene3d-mono-substrate.test.js` — **27/27 passing**, unmodified (other `params.js` consumers, sanity
  check for collateral damage).
- `tests/integration/scene3d-fill-style-picker.test.js` — **140/140 passing**, unmodified (confirms the
  ctxbar Shadow flyout / Style flyout pickers are unaffected).

The machine was under heavy concurrent load from other lanes' sessions for most of this unit (up to ~37
vitest-related processes observed via `ps aux`); several commands were auto-backgrounded by the harness
after a 120-180s timeout and re-checked once complete — no test file was run with `run_in_background` or a
Monitor wait-loop by choice, per protocol.

## Files touched

- `src/core/scene3d/params.js` — shadow bag only (~:1002-1047): new `clampShadowToneLaw`, `normalizeShadow`
  call-site swap. `clampStyleParam` itself (the shared style-path chokepoint) is untouched.
- `tests/unit/scene3d-shadow-tone-law.test.js` — 2 new RED/GREEN cases (one full-runtime, one params-only
  with a roster+ALIASES fixture).
- `tests/unit/scene3d-tone-law-collapse.test.js` — 4 stale-assertion updates (6 test executions), documented
  inline, following the file's own pre-existing "STALE ASSERTION UPDATE" convention.
- `scripts/u9-shadow-resolve-evidence.js` — new, bespoke Playwright evidence script (worktree-local).
- `docs/3d-audit/fill-audit/after/U9/` — new evidence directory (5 PNGs, `stats.json`, `report.json`).

## U9b handoff — deliberately NOT touched

- **The uniqueness re-pin** ("sweep the offered set × each survivor's collapse options" instead of the
  current "one build per OFFERED law id"). `tests/unit/scene3d-shadow-tone-law-uniqueness.test.js` was run
  unmodified and passes as-is; U9b re-pins its sweep once U8 lands the roster/UI completion it depends on.
- **`onePenDown` / `TONE_LAW_NOT_DISTINGUISHABLE` handling** — "after U8 the shadow row must exclude the
  *combination*, not the bare id… the shadow Fill Style row does not render the `penDown` sub-control and
  pins `penDown:'perRuling'`." Not started; depends on U8's roster/UI completion.
- **Full survivor × sub-control sweep live verification** (every offered survivor stepped through every
  sub-control option, screenshotted) — the plan's original §U9 live-verification bullet describes this full
  sweep; the resolve-half scope only required proving the ONE concrete regression (a folded id reaching
  `normalizeShadow` from an old saved scene) is fixed, which this unit's bespoke capture does. A full sweep
  is naturally U9b's job once the uniqueness re-pin defines the complete offered set.
- `src/config/scene3d-tone-laws.js` — read-only this unit (confirmed `ALIASES`/`IDS`/`PICKER_IDS` shape);
  no edit was needed there for the resolve half.

## Commit

`fix(scene3d): resolve collapsed fill styles on the shadow recipe path (U9)` — see the worktree's git log
for the hash (created after this report; the commit body repeats the `## Bars changed` numbers verbatim per
protocol).
