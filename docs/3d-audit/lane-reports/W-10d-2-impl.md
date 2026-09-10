STATUS: DONE

# W-10d-2 — implementation report (Contract A, CURATED write-back)

**Lane:** fill-audit-2 (`.claude/worktrees/fill-audit-2`, branch `3d-scene/fill-audit-2`, port 8476).
**Base:** `66d9092d` (W-10d-3). No new commit sha yet — see "Commit" at the end.
**Plan:** `docs/3d-audit/lane-reports/W-10d-2-plan.md`, Contract A (the orchestrator's assignment named
Contract A explicitly).

## What this unit does

Writes back exactly one unreachable `(primitive, toneLaw)` pair — `torus` + `originSpiral` — to the
picker's own fallback (`ladder`) at two trigger points: the `.vectura` load channel (persisted) and the
first live-compose after an edit makes the pair unreachable (render-facing only; see "Live channel"
below for why the live path never touches the stored layer bag). Every other combination of the
2800-combination sweep (10 primitives × 8 mappers × 35 `PICKER_IDS`) is a same-reference no-op.

`originSpiral` cannot be plotted cleanly on a torus (W-10c measured 87.8% of interior pixels covered by
solid ink wedges longer than two pen widths) and the picker already hides it from new picks
(`context-bar.js:567`, `isReachableOn`). This unit closes the remaining gap the picker's own comment
names verbatim: "the torus wedge is hidden from new picks, not repaired." A saved document (or any
hand-edited/preset file) that still carries the raw id is now migrated, once, to the fallback the app
already treats as safe everywhere else. This is a deliberate, CHANGELOG-listed render change for this
one combination — not a repair (FU-1, the engine-level fix, remains out of scope).

## Files touched

- `src/config/context-bar.js` (+24) — `SCENE_FILL_STYLES.UNREACHABLE_WRITEBACK` (the curated table, one
  entry) + `SCENE_FILL_STYLES.writeBackFor(id, primitiveMode, mapper)`, appended immediately after
  `isReachableOn` (~L568-592). Target read from the existing `FILL_STYLE_DEFAULT` — no new constant.
- `src/core/scene3d/params.js` (+65/-19 net, several sites, **style path only**):
  - New `applyLawWriteBack(style, primitiveMode)` helper (~L880-896) — lazy `Vectura.SCENE_FILL_STYLES`
    read (mirrors context-bar.js's own lazy cross-module read in the opposite direction), same-reference
    no-op when nothing applies.
  - `normalizeObjectLayerParams`'s `style:` line (~L1092-1098, was L1075) now applies the write-back to
    its own **render-facing, throw-away** return value.
  - `normalizeParams`'s monolith correlation pass (new block, ~L1445-1466), right after
    `out.styleTable = normalizeStyleTable(...)` — walks `out.objects` → `primitiveById`, then rewrites
    `out.styleTable.byObject`/`byFace` entries whose primitive+id match the curated table.
  - New `writeBackObjectLayerStyle(sanitized)` (~L1729-1745) + export — the ONE call whose return is
    **persisted** (the object3d/booleanGroup3d leaf load channel).
- `src/core/engine.js` (~L419-432) — `sanitizeImportedParams`'s `object3d`/`sceneGroup3d`/
  `booleanGroup3d` branch now calls `Scene3D.Params.writeBackObjectLayerStyle` after `migrateScene`,
  before returning (its return is assigned onto `layer.params` at `engine.js:1931`, unchanged).
- `tests/integration/scene3d-fill-style-picker.test.js` — appended describe `'W-10d-2 — curated
  unreachable toneLaw write-back (Contract A)'` (R1, R1b, R2–R10); updated ONE pre-existing W-10d test
  (see "Bars changed" below).
- `tests/unit/scene3d-tone-law-writeback.test.js` (**new**) — G1/G1b/G2/G3/G4/G5 + a mutation-check
  sanity test.

## RGR proof

**RED** at `66d9092d` (source reverted via `git show HEAD:<file>` into the live worktree file, tests
kept): **R1, R1b, R4, R6, R7, R10 fail** on real value assertions (`expected 'originSpiral' to be
'ladder'`), never `TypeError`/`is not a function`. R2/R3/R5/R8/R9 already pass at base — they are
guard-style rows with nothing to catch pre-fix (mirrors W-10d-3's own R3 row precedent).

**GREEN** — with the fix applied:
- `tests/integration/scene3d-fill-style-picker.test.js`: **160/160** (149 pre-existing at `66d9092d`,
  one of them — the W-10d torus/`originSpiral` deserialization test — updated IN PLACE for the
  deliberate Contract-A change, not added or removed; +11 new rows: R1, R1b, R2–R10 = 160 total).
- `tests/unit/scene3d-tone-law-writeback.test.js`: **7/7** (new file).
- Both files run together: **167/167**.

**Mutation check** — `SCENE_FILL_STYLES.writeBackFor` stubbed to `() => null` (always-null, the
present-but-inert shape). Re-ran the same integration file: **R1, R1b, R4, R6, R7, R10 all re-failed on
the identical real-value assertions** as the base-sha RED run (`expected 'originSpiral' to be 'ladder'`
etc.), never a `TypeError`. Reverted; `diff` against the fixed file clean (byte-identical restore).

## Tests

| Suite | Result |
|---|---|
| `tests/integration/scene3d-fill-style-picker.test.js` | **160/160** (149/149 at `66d9092d` → +11 new rows R1, R1b, R2–R10; 1 pre-existing W-10d row updated in place, not added/removed) |
| `tests/unit/scene3d-tone-law-writeback.test.js` | **7/7** (new file: G1, G1b, G2, G3, G4, G5, mutation-check harness) |
| `tests/unit/scene3d-solid-cap-reachability.test.js` | **10/10** |
| `tests/unit/scene3d-tone-laws-config.test.js` | **8/8** |
| `tests/unit/scene3d-faceted-tone-law.test.js` | **19/19** (1 transient vitest-worker RPC timeout warning, not a test failure — machine-load, matches W-10d-3's own report) |
| `tests/unit/scene3d-tone-law-plumbing.test.js` | **5/5** |
| `tests/unit/scene3d-shadow-tone-law.test.js` | **20/20** (U9's shadow-bag fix is not merged into this lane — 20, not 22, expected; confirms the shadow boundary was never touched by this unit) |
| `tests/unit/scene3d-tone-law-collapse.test.js` | **54/54** (not edited; ~469s wall — matches W-10d-3's own measured count/runtime, not a bar this unit moved) |

All suites run foreground, one file at a time, per AGENT-PROTOCOL.

## RGR detail — the R-suite

| # | Test | Pre-fix (66d9092d) | Post-fix |
|---|---|---|---|
| R1 | `.vectura` load: torus leaf, `toneLaw:'originSpiral'` reopens | `originSpiral` (FAIL) | `ladder` |
| R1b | same, MONOLITH `styleTable.byObject` form | `originSpiral` (FAIL) | `ladder` |
| R2 | once-only: re-import an already-migrated doc | n/a | byte-identical (idempotent) |
| R3 | no per-pass rewrite, REACHABLE law (sphere/hatch/`etfKang`), 3 composes | passes today | byte-identical ×3 (guard) |
| R4 | no per-pass rewrite, UNREACHABLE reached by a LIVE edit (sphere→torus) | `originSpiral` on assembled (FAIL to migrate) | assembled `ladder` after compose #1, **live layer bag untouched and byte-identical across composes #2/#3** (see "Live channel" below) |
| R5 | no undo entry at load: `app.applyState` history delta | n/a (nothing pushes history either way) | equal for an affected vs. unaffected doc |
| R6 | undo/redo: migrated value survives push/edit/undo | `originSpiral` (FAIL) | `ladder` at every restored point |
| R7 | round trip: save the migrated doc, re-import is a no-op | `originSpiral` (FAIL) | `ladder`, stable |
| R8 | no-fallback guard: mapper `wireframe` (every id unreachable, `ladder` too) | `mkTick` unchanged (pass) | `mkTick` unchanged |
| R9 | blast-radius guard: sphere/spiral/`taperedEnds` (unreachable, differs from ladder) | `taperedEnds` unchanged (pass) | `taperedEnds` unchanged |
| R10 | UI agreement: Style tab after write-back | `originSpiral` disabled (FAIL) | `ladder` value, enabled, no "no effect here" suffix |

## Live channel — why it never touches the live layer bag (measured, not assumed)

The plan's Edit 2 applies the write-back inside `normalizeObjectLayerParams`'s own **returned** style —
consumed by `collectSceneParams` (scene-group compose) and `object3d.js`'s standalone `generate` call.
Both call sites use this function's return purely as a **render input**; neither assigns it back onto
`layer.params`. I measured this directly (a throwaway probe, not committed) before writing R4: after a
live primitive change from sphere→torus and 3 `computeAllDisplayGeometry()` passes, `JSON.stringify(obj.
params)` was **byte-identical across all 3 passes and to the pre-edit snapshot for everything except the
primitive itself** — the write-back never reaches the stored bag from the live path. `group.
_sceneAssembled.styleTable.byObject[id].params.toneLaw` (the render-facing copy) becomes `'ladder'` on
compose #1 and stays `'ladder'` (a same-reference-input, deterministically-identical recompute) on every
subsequent pass. R4 pins both halves. This satisfies stop condition 7 ("a per-compose flag/counter/
`_writeBackDone` marker looks necessary — STOP, idempotence is the mechanism") — there is no flag; the
function is pure, so repeated calls with the same input always produce the same output, and the input
(the live layer bag) is never itself the thing that changes from this path. The document's *stored* law
is migrated only by the load channel (R1/R1b/R7), which is the one place `sanitizeImportedParams`'s
return is actually persisted (`engine.js:1931`).

## Bars changed

**None** by the numeric/tolerance/fingerprint definition in AGENT-PROTOCOL. One pre-existing test in
`tests/integration/scene3d-fill-style-picker.test.js` (`'a torus layer saved with toneLaw "originSpiral"
deserializes unchanged — no throw, no silent rewrite (W-10d)'`) asserted the OLD (pre-Contract-A)
behavior for the **full scene sanitizer round trip** specifically. This is the unit's own deliberate
contract change (the plan's §B-1 calls this test out by name as the one the ruling necessarily makes
stale) — not a regression:
- The test's first three assertions (`normalizeStyle` alone, `F.resolve`, `F.isReachableOn`) are
  **unchanged and still pass** — `normalizeStyle` has no primitive argument in scope and genuinely
  cannot know a law is unreachable on a given shape; that half of the W-10d picker-presentation-only
  claim is still true.
- The FINAL assertion (`sanitizeSceneParams(...).styleTable.byObject['obj-1'].params.toneLaw`) is
  updated from `.toBe('originSpiral')` to `.toBe(F.DEFAULT)` — the full sanitizer now has both the
  primitive and the style in scope (the "correlation pass" this unit adds), so it is no longer
  context-blind for the torus+originSpiral pair specifically.
- A companion assertion was added in the same test proving a NON-curated pair (`sphere`+`spiral`+
  `taperedEnds`) through the same full sanitizer is **untouched** — the migration is scoped to the one
  table entry, not a blanket remap.

File/line: `tests/integration/scene3d-fill-style-picker.test.js`, the test previously named `'a torus
layer saved with toneLaw "originSpiral" deserializes unchanged — no throw, no silent rewrite (W-10d)'`,
now `'a torus layer saved with toneLaw "originSpiral": normalizeStyle alone is context-blind (unchanged);
the full sanitizer migrates it (W-10d / W-10d-2)'`. Old → new: `'originSpiral'` → `F.DEFAULT` (`'ladder'`)
for the `sanitizeSceneParams` round-trip assertion only. Why: Contract A's own stated purpose.

## U9 disjointness (proved, not assumed)

U9's shadow-bag fix (handoff-c2 `fc8b0fba`, `clampShadowToneLaw`) is **not present in this lane** —
fill-audit-2 has not merged handoff-c2. Read directly: this lane's `params.js` still has
`normalizeShadow` (~L1002-1020) calling `clampStyleParam('toneLaw', src.shadowToneLaw)` verbatim, no
`clampShadowToneLaw` symbol exists anywhere in this file. My edits touch:
- `params.js` ~880-896 (new `applyLawWriteBack` helper, inserted between `normalizeStyle` and
  `normalizeStyleTable`)
- `params.js` ~1092-1098 (`normalizeObjectLayerParams`'s `style:` line)
- `params.js` ~1445-1466 (`normalizeParams`'s new correlation-pass block)
- `params.js` ~1729-1745 (new `writeBackObjectLayerStyle` + export)

None of these overlap `params.js` 995-1025 (the shadow-bag region the plan's disjointness proof reserves
for U9) or `clampStyleParam` (655-779, forbidden by the plan). G4 in the new unit test file additionally
pins `normalizeShadow`'s behavior as unchanged by this unit (it has no `primitiveMode` argument to gate
on — structurally cannot reach `UNREACHABLE_WRITEBACK`).

## Evidence

Dev server from the lane worktree on port 8476, own start/kill, foreground Playwright (chrome-devtools
MCP was unavailable this session — connection failure, not "no browser": used Playwright directly per
AGENT-PROTOCOL's fallback). Written to MAIN's `docs/3d-audit/fill-audit/after/W-10d-2/`:

- **`leaf-scene/`** — the plan's exact §5 recipe (`addLayer('scene3d')` → torus + `originSpiral` →
  `exportState`/`applyState` reopen → select → `buildControls()` → Style tab), shot twice (source
  reverted to `66d9092d` for BEFORE, restored for AFTER):
  - `before-style-row.png` / `after-style-row.png` — **looked at both directly**. BEFORE: "Fill Style:
    Origin Spiral — no effect here", visibly greyed/disabled dropdown. AFTER: "Fill Style: Ladder
    (default)", enabled, normal styling, no warning suffix.
  - `before-canvas.png` / `after-canvas.png` — **looked at both directly**. BEFORE: the torus carries a
    dense radial/spiral fan texture with a visibly darker, denser wedge in the lower-left quadrant — the
    W-10c ink-wedge defect, plainly visible even at this zoom. AFTER: clean, evenly-spaced concentric
    ladder rings, no dark wedge, visibly sparser and more even coverage.
  - `before-exported-state.json` / `after-exported-state.json` — the full serialized doc; the object3d
    leaf's `style.params.toneLaw` is `"originSpiral"` in the former, `"ladder"` in the latter (quoted in
    `report.json`).
- **Geometry identity probe** (`report.json` → `evidence.geometryIdentityProbe`) — the load-bearing
  numeric proof, run via throwaway foreground vitest files (not committed) with the object/group **seed
  pinned to 424242** so pre-fix, post-fix, and an explicit-ladder-pick scene are geometrically
  comparable: `group.scenePaths` reduced to `{pathCount, pointCount, checksum}`.
  - Pre-fix `originSpiral`: **556 paths / 5851 points / checksum 1343838.20** — matches the plan's own
    independently-measured baseline (`docs/3d-audit/lane-reports/W-10d-2-plan.md` §B-1: "556 / 5851 /
    34682089.55") on path/point count exactly (the plan's checksum used a different formula/coordinate
    space than this implementer's sum-of-x+y reduction, hence the differing third number — the
    path/point counts, the load-bearing figures, match precisely).
  - Post-fix write-back result: **135 paths / 910 points / checksum 203336.36** — EXACT match (all three
    figures, not just counts) to an independently-built explicit-`ladder`-pick scene on the same seed.
    This is the strongest available proof that the write-back's rendered output is indistinguishable
    from a user picking Ladder directly — the render pipeline itself is untouched by this unit; only the
    `toneLaw` string feeding into it changed.
  - I initially attempted a DOM/canvas-screenshot md5 comparison for this same claim and found spurious
    mismatches even with a pinned numeric seed and matched selection state, traced to per-session
    object/group id randomness in a from-scratch `addLayer` call (two separate Playwright sessions never
    produce identical ids even with the same seed literal). The geometry probe above sidesteps this by
    comparing `group.scenePaths` directly rather than rendered pixels, which is both more precise and
    immune to canvas/DOM timing. `ladder-control-canvas.png` is kept as a secondary, non-load-bearing DOM
    look (visibly similar to `after-canvas.png` on inspection, not md5-compared).
- **Tier-B guard row** (`guard-tierB-before/` / `guard-tierB-after/`) — re-shot
  `torus__hatch__<law>__med__a` for all 48 laws this lane's roster carries (pre-U0-collapse), via
  `scripts/audit/scene3d-capture.js --tier B --root .claude/worktrees/fill-audit-2 --port 8476 --only
  'torus__hatch__.*__med__a'`, run from MAIN once against source reverted to `66d9092d` and once against
  this unit's fix, same worktree both times. **48/48 md5-identical**, including `ladder` itself.
  `originSpiral` is correctly excluded from BOTH shoots (Tier B's own reachability filter skips it — the
  picker gate this unit does not touch). I did **not** compare against main's pre-existing
  `docs/3d-audit/fill-audit/shots/B/` baseline — that baseline is stamped `appVersion:"1.3.98"` (this
  lane serves `1.3.99`) and differs on every single cell I checked, including `ladder`, which this unit
  never touches — i.e. that baseline has drifted from unrelated landed work since it was captured, and a
  same-worktree before/after (isolating only this unit's 3 source-file diff) is the valid comparison.

## Docs contract (report-only, per this run's explicit instruction — CHANGELOG.md not edited)

**CHANGELOG line:**
> Fixed: a saved 3D Scene torus object using the Origin Spiral fill style now opens as Ladder (the
> picker's own default). Origin Spiral cannot be plotted cleanly on a torus — W-10c measured 87.8% of
> interior pixels covered by solid ink wedges longer than two pen widths — so a document carrying that
> combination is migrated once, at load, to the fill style the app already treats as its safe fallback
> everywhere else. This changes what the object draws (once); every other fill-style/primitive
> combination is unaffected.

**Help text** (wherever the Fill Style row's "no effect here" greyed-out copy is documented):
> A torus object that already has Origin Spiral picked cannot show this greyed-out state any more —
> opening or editing such a document migrates it to Ladder automatically, once. Only the torus + Origin
> Spiral combination is migrated this way; every other greyed-out option is left exactly as the user set
> it and simply draws no differently, as before.

## Open follow-ups (recorded, not fixed here)

- **FU-1** (unchanged, out of scope): the engine-level repair for `originSpiral` on a torus — this unit
  substitutes, it does not repair the mono law itself.
- The label-copy follow-up (`NO_EFFECT_SUFFIX` being literally false for the torus/`originSpiral` cell
  while it stays in the dropdown) is now moot for the write-back case specifically (a migrated document
  no longer shows that row at all — R10), but the label itself is untouched source and any OTHER
  still-open instance of that follow-up (STILL-OPEN.md L96, W-10d follow-up 1) is unaffected by this
  unit.

## Commit

Staged: `src/config/context-bar.js`, `src/core/engine.js`, `src/core/scene3d/params.js`,
`tests/integration/scene3d-fill-style-picker.test.js`, `tests/unit/scene3d-tone-law-writeback.test.js`.
No other files in the worktree changed. Not pushed, not merged, version not bumped (worktree — the
bump hook cannot fire here per AGENT-PROTOCOL).
