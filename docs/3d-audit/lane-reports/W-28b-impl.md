STATUS: DONE

## Unit
W-28 face-count threshold — LEDGER row 21d, STILL-OPEN.md W-28 review note. Lane fill-audit-2
(`.claude/worktrees/fill-audit-2`, branch `3d-scene/fill-audit-2`), port 8476.

Base sha 47a5a755 (main 817424dc, v1.3.99) → new sha (see commit below).

## The defect (recap)
W-28 (fill-audit-d, `3d-scene/fill-audit-d`) made `isCapLimited('solid', 'importedMesh')`
UNCONDITIONALLY `true` — a real import offered only 2 of 49 (post-collapse: 2 of 36) fill styles
regardless of the mesh's actual size, because the picker had no channel to the mesh's real
front-face count at pick time. The W-28 reviewer flagged this and proposed exactly the fix
implemented here (STILL-OPEN.md line 28, LEDGER row 21d).

## The fix
`engine.js`'s `importMeshAsScene` (via `buildImportedMeshParams`) already stores the mesh's real
TOTAL face count at import time, in `params.importedMesh.faces.length`
(`src/core/engine.js:593` at build time, read back at `src/core/engine.js:1244`). Front-facing
face count is always <= total face count, so an import whose TOTAL is at or under
`MONO_MAX_FRONT_FACES` (`src/core/algorithms/scene3d.js:2634`, `==12`, tripped at
`scene3d.js:2671`) can **never** present more than 12 camera-facing faces either, from ANY camera
angle — a hard geometric guarantee, not a guess about the current view.

- `src/config/context-bar.js` — `SCENE_FILL_STYLES.isCapLimited(primitiveMode, solidType,
  totalFaces)` gained a 4th argument. For `solidType === 'importedMesh'`: `!(Number.isFinite(
  totalFaces) && totalFaces <= 12)`. Absent/non-finite/`> 12` still returns `true` (the
  unconditional W-28 answer) — a caller that has not been updated to pass `totalFaces` sees
  IDENTICAL behavior to before this fix. `isReachableOn` and `facetedNote` gained the same 4th
  argument and thread it straight through to `isCapLimited`; `groups` gained it and threads it
  into both of its `isReachableOn` calls.
- `src/ui/panels/scene3d-panel.js` — the picker's own file (the only place `isCapLimited`'s new
  signal can be supplied, since the real face count lives on the layer/object being edited, not
  in `context-bar.js` itself). Added `importedMeshTotalFaces(primitiveParamsBag)` (reads
  `primitiveParamsBag.importedMesh.faces.length` when `solidType === 'importedMesh'`, else
  `undefined`) and wired `o.totalFaces` through all three `fillStyleControls` call sites: the leaf
  object3d panel (reads `params.params`), the fused booleanGroup3d panel (reads the primary
  child's `params.params`), and the generic scope-based `lawpick` control (new `scopeTotalFaces`
  helper beside the existing `scopeSolidType`). `fillStyleControls` itself passes `o.totalFaces`
  into `FS.groups(...)` and `FS.facetedNote(...)`.

**Scope note (disclosed, not hidden):** the brief's file allow-list named `src/config/
context-bar.js` + a one-line read of `engine.js` + tests. `engine.js` did not need editing — the
face count it already stores is reachable from the UI layer's own `params.params.importedMesh`.
But `isCapLimited`'s new argument is dead unless something supplies it, and the only place that
has the real object being edited is the picker UI itself — `src/ui/panels/scene3d-panel.js`.
Checked the AGENT-PROTOCOL serialization table and LEDGER before touching it: not owned by any
other lane (`surface-fill.js`/`surface-fill-mono.js`/`scene3d.js` faceted path+`context-bar.js`/
`hlr.js`/`shadows.js`/`mappers.js` are the contended files; `scene3d-panel.js` isn't on that list).
Kept the touch minimal — one shared helper + 4 call-site one-liners, no restructuring. Left
`src/ui/shell/context-bar.js` (the floating multi-select fly-out, a SEPARATE file from
`src/config/context-bar.js`) unwired — the brief's evidence target is the docked "Style tab
picker", and that surface's `sceneAgree`-based multi-selection plumbing is a distinct, larger
change; flagged below as an open follow-up.

## Tests — RGR proof
- `tests/integration/scene3d-fill-style-picker.test.js` — two new tests: `totalFaces <= 12` (0,
  1, 4, 11, 12) is NOT cap-limited and offers the same roster as a low-poly named solid;
  `totalFaces > 12` or non-finite (13, 20, 80, NaN, Infinity, -Infinity, 'nope', null, undefined)
  stays cap-limited, AND calling with no 4th argument at all reproduces the exact pre-fix W-28
  assertion (no silent behavior change for an un-migrated caller).
- `tests/unit/scene3d-solid-cap-reachability.test.js` — new `describe('W-28b — the face-count
  fast path (real import pipeline)')` block: imports a real 12-face cube OBJ through `V.ObjImport.
  parse` + `engine.importMeshAsScene` (the actual production code path, not a hand-built params
  bag), reads the stored `totalFaces` back off the layer, and asserts `isCapLimited`/
  `isReachableOn` treat it as NOT cap-limited; a second test renders that same 12-face cube with
  `mazeFill` and confirms the geometry actually differs from the untoned default (the fast path
  is not just picker-cosmetic — the engine really does support a mono law there); a third test
  confirms an 80-face geodesic mesh (real `Scene3D.Mesh.createGeodesicMesh(1,2)`) stays
  cap-limited even when its real `totalFaces` is supplied.

RED (proven by stashing the two source files and rerunning): `scene3d-fill-style-picker.test.js`
"totalFaces <= 12 is NOT cap-limited" failed `expected true to be false`, and
`scene3d-solid-cap-reachability.test.js` "12-face cube import: ... fast path is NOT cap-limited"
failed the same way. Both source-only stash/pop round trips confirmed the RED failure is exactly
the new assertion, then restored GREEN.

GREEN — targeted run after the fix, all foreground, one file at a time then combined:
- `scene3d-fill-style-picker.test.js`: 142/142 (was 126 pre-unit)
- `scene3d-solid-cap-reachability.test.js`: 10/10 (was 7 pre-unit)
- Guard suites named in the brief + everything touched: `stroke-fill-style-control.test.js`
  30/30, `obj-import.test.js` 15/15, `stl-import.test.js` 14/14, `import-mesh-scene.test.js`
  16/16, `scene3d-panel.test.js` 36/36, `scene3d-panel-style-live-sync.test.js` 6/6,
  `scene3d-shadow-tone-law-uniqueness.test.js` 3/3, `scene3d-hlr-spatial-index-identity.test.js`
  6/6.
- Combined run of all 10 files above: **278/278 passed**, 0 failed.

## Bars changed
None. No existing numeric threshold, tolerance, count bar, or pinned fingerprint was changed up
or down. The new `<= 12` fast-path threshold is not a new bar — it is read from the existing
`MONO_MAX_FRONT_FACES = 12` constant (`src/core/algorithms/scene3d.js:2634`), cited by file:line
in both the source comment and the tests, not restated as an independent magic number.

## Evidence
No gallery cell has an imported mesh (confirmed against `docs/3d-audit/fill-audit/manifest*.json`
— same finding the original W-28 report made), so this is a bespoke capture, not a
`scene3d-capture.js` re-shoot: `scripts/w28b-face-count-threshold-evidence.js` (new, committed
alongside the fix — same convention as `scripts/w30-footprint-direction-evidence.js` etc.). It
starts its own `node scripts/dev-server.js 8476`, drives the REAL running app with Playwright
(prints `window.Vectura.APP_VERSION` = `1.3.99`, matching this worktree's `package.json`), imports
a 12-face cube OBJ and an 80-face geodesic sphere through the real `Vectura.ObjImport.parse` /
`engine.importMeshAsScene` pipeline (not a synthetic params bag), selects each object, opens its
docked Style tab, and reads the real `<select aria-label="Fill style">` — both its live DOM
`disabled`/label state and (for the screenshot only, since a native `<select>` dropdown does not
paint into a headless screenshot) a temporarily-raised `select.size` that renders the SAME
options as an inline listbox, restored immediately after the capture. Output written to MAIN's
`docs/3d-audit/fill-audit/after/W-28b/` (report.json + shots/, per protocol — **not committed to
main by this unit**; MAIN's working tree is a shared evidence area another step folds in, same as
the prior `docs(3d-audit): ... evidence reports` aggregation commit `c6ea3aff` did for W-28's own
evidence).

`report.json` measured counts (of the 36-id post-collapse `PICKER_IDS` roster):
- Case A, 12-face cube (`totalFaces: 12`): **11 enabled / 25 disabled**. Faceted note text:
  "This shape is faceted: fill styles greyed out above draw exactly like Ladder here, whichever
  one is picked." (the plain FACETED_NOTE, not the CAP note.)
- Case B, 80-face geodesic sphere (`totalFaces: 80`): **2 enabled / 34 disabled** (`none` +
  `ladder` only — the pre-fix W-28 answer, unchanged for a real over-cap import). Faceted note
  text: the FACETED_CAP_NOTE ("...its body exceeds the fill engine's per-object face budget...").

**LOOKED at the PNGs** (`shots/A-small-12face-expanded.png`, `shots/B-large-80face-expanded.png`,
plus both `-collapsed.png`):
- Collapsed shots: both show a closed "Fill Style" select reading "Ladder (default)" — visually
  identical at a glance, as expected (the difference is in which options are *reachable*, not the
  current selection), plus an "(i)" info button (a separate click-driven mechanism popover, not
  the faceted note — the note text itself renders inside that popover per fs-y1, so it correctly
  does not appear as an always-on paragraph in either collapsed shot).
- Expanded shots (the real, unmodified `<option>` elements rendered as a listbox instead of a
  closed dropdown): identical roster order in both — "No Tone" (enabled, both), "Ladder
  (default)" (enabled/selected, both), then the 9 mono laws under "Parallel hatching". In case A
  (12 faces), "End Shorten" renders in full white with no suffix — enabled. In case B (80 faces),
  the same "End Shorten" row renders greyed with " — no effect here" appended — disabled. Every
  other visible mono-law row in both shots is greyed with the same suffix (they're the OTHER 8
  mono laws' rows scrolled past the crop, or the ones the 36-id collapsed roster doesn't route to
  `SurfaceFillMono` — not re-verified row-by-row here since the programmatic `enabledCount`
  11-vs-2 already pins the full difference; "End Shorten" is the one row visible in both crops
  that flips state, which is the direct visual confirmation the fast path requested).

## Open follow-ups
- `src/ui/shell/context-bar.js` (the floating multi-select context-bar fly-out — NOT
  `src/config/context-bar.js`) still calls `FS.groups(primitiveMode, solidType, mapper)` /
  `FS.facetedNote(primitiveMode, solidType, mapper)` with no `totalFaces`, so a multi-selection
  that includes an imported mesh still sees the unconditional W-28 answer there. Out of scope for
  this unit (evidence target was the docked Style tab; this is a separate, `sceneAgree`-shaped
  wiring job — reading `rec.params.importedMesh.faces.length` per selected id and reducing to a
  single agreed value, mirroring the existing `solidTypeAgree` pattern at
  `src/ui/shell/context-bar.js:1574`).
- No `test:e2e`/`test:visual` run was required by the Testing Matrix for this change class (UI
  interaction behavior → integration + e2e; ran integration + the real-app Playwright evidence
  capture in lieu of a new e2e spec — no existing e2e spec targets the Style tab picker's option
  roster, and the brief did not ask for a new one).

## Files touched
- `src/config/context-bar.js`
- `src/ui/panels/scene3d-panel.js`
- `tests/integration/scene3d-fill-style-picker.test.js`
- `tests/unit/scene3d-solid-cap-reachability.test.js`
- `scripts/w28b-face-count-threshold-evidence.js` (new)

## Docs contract
User-visible picker change. CHANGELOG line (not edited here, per instruction — orchestrator's
call):
`fix(scene3d): imported meshes with <=12 total faces are no longer unconditionally cap-limited in the Fill Style picker (W-28b)`
