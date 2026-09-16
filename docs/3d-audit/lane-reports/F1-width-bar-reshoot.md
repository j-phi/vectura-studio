STATUS: DONE

# F1-width-bar — evidence re-shoot at the MEASURED fixture (fillAngle-mismatch follow-up)

Unit type: EVIDENCE-INTEGRITY. Read-only against `.claude/worktrees/fill-audit-a3` — never edited, never
stashed, never checked out. Reproduced from a scratch `git archive` export only:
`mkdir -p /private/tmp/claude-501/scratch-FWB-shoot && git -C .../fill-audit-a3 archive 42acff7b | tar -x -C
/private/tmp/claude-501/scratch-FWB-shoot`, `node_modules` symlinked from MAIN. The worktree's live T2-3 WIP
(`surface-fill.js` +200/-12, `tests/helpers/scene3d-mktick-wedge.js`) was observed via `git status` and never
touched.

## Problem restated

`F1-width-bar-review.md` follow-up 2: the captures in `docs/3d-audit/fill-audit/after/F1-width-bar/` (both
rigs) were shot with an explicit `fillAngle: 45`, while every number in `F1-width-bar-impl.md`'s JOB 1/JOB 2
tables was measured by `tests/helpers/scene3d-ribbon-width.js`, which never sets `fillAngle` at all. The
reviewer found the two constructions' `inkMm` disagree by ~35–40% for identical law/mapper/density and flagged
it as undisclosed, non-blocking.

## (1) How the existing shots got fillAngle 45

**It is the capture script's own hardcoded literal — not a manifest-row property, not a bespoke scene, not a
CLI-selectable option.** Read `scripts/audit/scene3d-capture.js` directly (MAIN):

- Line 280 (`--rig addLayer` branch): `obj.params.style.params = { ...(obj.params.style.params || {}),
  fillAngle: 45, fillDensity: densityValue, toneLaw: item.style };`
- Line 313 (`--rig create` branch): `const style = { penId: null, mapper: item.mapper, params: { fillAngle:
  45, fillDensity: densityValue, toneLaw: item.style } };`

Both branches write the literal `45` unconditionally. `parseArgs` (lines 56–75) has no `--fill-angle` flag or
any other way to override it. **There is therefore no cell anywhere in `manifest.B.*.jsonl`, on either rig,
shot at an unset fillAngle** — confirmed by reading the source, not inferred from the manifest.

## (2) Re-shot at the measured fixture — bespoke scene, as instructed

Since no manifest cell exists without `fillAngle: 45` (task step 1's finding), a bespoke scene was required.
Wrote `scripts/audit/f1-width-bar-measured-fixture-capture.js` into the scratch export (never into any
worktree or MAIN's `scripts/`) that:

- Reuses MAIN's own `ensureServer` / `openPage` / `getConstants` from `scene3d-capture.js` (`require`d as a
  module — it already exports them) so page bootstrap is identical to the gallery's.
- Builds the object exactly as `measureRibbonWidth()` does: `engine.addLayer('scene3d')`, swap
  `obj.params.primitive`, set `obj.params.style.mapper='hatch'`, and `obj.params.style.params = {
  ...existing, toneLaw: law }` — **no `fillAngle` key, no `fillDensity` override, ground/backdrop/camera left
  untouched** (unlike `scene3d-capture.js`'s addLayer branch, which explicitly hides the ground child).
- Reuses `scene3d-capture.js`'s own `frameAndCrop` bbox-crop logic verbatim (same `FIXED_ZOOM=3.6`, same
  luminance-threshold bbox scan) so the crop convention matches the gallery.
- Also wraps `RibbonGeometry.buildRibbonMultiPolygon` in-page (same technique as the shared test helper) to
  measure width, and sums `g.scenePaths` for ink, so the SAME formulas that produced the impl report's numbers
  run inside a real browser instead of jsdom.

Ran it: `node scripts/audit/f1-width-bar-measured-fixture-capture.js --port 8501 --root
/private/tmp/claude-501/scratch-FWB-shoot --out docs/3d-audit/fill-audit/after/F1-width-bar/measured-fixture`
(dev server started with `nohup … &` on the scratch root, port 8501, verified free before use; killed
immediately after the run — never `run_in_background`, no Monitor).

Four cells captured, all at addLayer rig / torus / hatch / density 50 (med) / camera 'a' (default):
`torus__hatch__{interlockWeave,trochoidLoop,onePenDown,amplitudeOnly}__med__a__addlayer__measured.png`, under
`docs/3d-audit/fill-audit/after/F1-width-bar/measured-fixture/shots/`.

## (3) Confirmed by measurement: re-shot render's inkMm matches the report table exactly

| law | report table (impl/review) | re-shot render (this unit) | match |
|---|---|---|---|
| interlockWeave ink mm | 6166.940 | 6166.939706748697 → 6166.9 | ✔ exact |
| interlockWeave width mm | 0.9832 | 0.9831517909663089 → 0.9832 | ✔ exact |
| trochoidLoop ink mm | 6572.712 | 6572.711783566196 → 6572.7 | ✔ exact |
| trochoidLoop width mm | 0.9377 | 0.9377333247222308 → 0.9377 | ✔ exact |
| onePenDown ink mm | 6063.705 | 6063.7045298720695 → 6063.7 | ✔ exact |
| onePenDown width mm | 0.8801 | 0.8800580774240846 → 0.8801 | ✔ exact |
| amplitudeOnly ink mm | 3886.469 | 3886.4688654860893 → 3886.5 | ✔ exact |

Every headline number reproduces to the printed precision, from a real browser render, not jsdom — the
measured fixture and the report table are the same construction. Raw numbers saved at
`docs/3d-audit/fill-audit/after/F1-width-bar/measured-fixture/measured-fixture-raw-results.json`.

## The actual cause of the ~37% gap — NOT fillAngle

Ran the identical bespoke construction a second time with one line added (`groundChild.visible = false`,
matching `scene3d-capture.js`'s own addLayer-branch ground-hiding technique) against the same scratch export,
same session:

| law | measured (ground shown) | ground hidden (this unit) | gallery `manifest.B.1-1.addlayer.jsonl` `inkMm` | delta |
|---|---|---|---|---|
| interlockWeave | 6166.9 | 3897.9 | 3897.9 | 2269.0 |
| trochoidLoop | 6572.7 | 4303.7 | 4303.7 | 2269.0 |
| onePenDown | 6063.7 | 3794.7 | 3794.7 | 2269.0 |
| amplitudeOnly | 3886.5 | 1617.4 | 1617.4 | 2269.1 |

**Hiding the ground child in the measured (fillAngle-absent) construction reproduces the ORIGINAL gallery
addLayer-rig `inkMm` figures to the last printed digit, for all four subject laws — with fillAngle still
absent the entire time.** The residual is a near-constant ~2269mm across every law (the ground quad plus the
torus's own cast-shadow hatch ink, independent of the object's own tone-law pattern) — the signature of a
fixed additive geometry difference, not a per-law angle effect.

**Conclusion: fillAngle is not the cause of the inkMm gap.** Read `src/core/scene3d/params.js` (lines
1585–1587, 1601–1602) and `src/core/algorithms/scene3d.js` (lines 2464, 3111, 3176): `scene3d.js` reads
`finite(styleParams.fillAngle, 45)` at generate time — **an absent `fillAngle` already resolves to 45**, the
same value `scene3d-capture.js` sets explicitly. `src/config/defaults.js`'s `ALGO_DEFAULTS.object3d.style =
{ penId: null, mapper: 'hatch', params: {} }` confirms a fresh `addLayer` object carries no `fillAngle` key at
all, and `params.js`'s own migration comment ("a fresh hatch keeps the panel's 45° seed on a curved
primitive") independently documents the same fallback. The measurement above proves it directly, not just by
code reading: with ground equalized, fillAngle-absent and fillAngle-45 give IDENTICAL ink to the printed
digit. **The review's follow-up 2 was right that the pictures and the numbers used different explicit
constructions, and right to flag it as non-blocking — but the specific mechanism it named (fillAngle) is not
the actual cause. Ground-plane inclusion is:** `measureRibbonWidth()` never touches the ground child;
`scene3d-capture.js`'s addLayer branch explicitly hides it for a clean object-only crop.

This is disclosed as `report.json`'s new `fixture.finding_2026-09-13_fillAngle_is_not_the_cause_of_the_ink_gap`
block, alongside the corrected record of what each cell's real fixture is.

## (4) report.json updated

Added a `fixture` block to `docs/3d-audit/fill-audit/after/F1-width-bar/report.json` stating rig, camera,
density and every non-default param for:
- `original_shots_create_rig` — labelled "illustrative, fillAngle 45, NOT the measured render"
- `original_shots_addLayer_rig` — same label
- `new_shots_addLayer_rig_measured_fixture` — labelled "measured fixture — reproduces F1-width-bar-impl.md's
  JOB 1/JOB 2 numbers to the exact digit"

plus the `finding_2026-09-13_fillAngle_is_not_the_cause_of_the_ink_gap` sub-block (full numbers + method +
conclusion) and a `visual_diff_2026-09-13` field (task 5, below). The `cells` object gained a fourth array,
`addLayer_rig_measured_fixture_2026-09-13`, pointing at the four new PNGs. **Nothing was deleted** — both
original cell arrays and all pre-existing top-level fields are untouched; `git diff --stat` on the file shows
only additions.

## (5) Looked at one new shot vs its original at native resolution

Compared `shots/B/torus__hatch__onePenDown__med__a__addlayer.webp` (original, 800×400, ground hidden) against
`measured-fixture/shots/torus__hatch__onePenDown__med__a__addlayer__measured.png` (new, 800×561, ground
shown), both read at native resolution with the Read tool.

**The torus itself is visually indistinguishable between the two**: the same thin zigzag-tooth ribbon pattern,
the same visible black gaps between successive teeth, the same overall "wireframe-like read, not a bold filled
band" the impl report already described for decision 10. **The new capture additionally shows a large ellipse
below the torus** — the ground plane, rendered with straight diagonal hatch lines (its own fill pattern,
unrelated to the torus's `toneLaw`) — which the original excludes by design (`scene3d-capture.js` hides the
ground child for a clean object-only crop). That ground ellipse is the entire visible difference, and it
accounts for both the taller crop (561px vs 400px) and the ~2269mm ink delta measured above. No difference in
the torus's own rendering is visible at any zoom.

## What this does NOT change

- No `src/` or worktree file was touched. No test, bar, or fingerprint was moved. This is an evidence-integrity
  correction only.
- `F1-width-bar-review.md`'s overall ACCEPT-WITH-FOLLOWUPS verdict and the floor's own correctness are
  unaffected — the floor was always derived from the canonical script's own addLayer-rig readings, never from
  the gallery screenshots, and this unit's finding does not change any of those numbers.
- Follow-up 2 is now answered with a corrected mechanism (ground, not fillAngle) rather than closed as
  "disclosed, not chased."

## Files touched (evidence-integrity, no worktree/src changes)

- `docs/3d-audit/fill-audit/after/F1-width-bar/report.json` — added `fixture` block + 4th `cells` array (edit,
  additions only).
- `docs/3d-audit/fill-audit/after/F1-width-bar/measured-fixture/` — new directory: 4 PNGs, raw results JSON,
  and a copy of the bespoke capture script used (`capture-script-used.js`, for reproducibility; the working
  copy ran from the scratch export and was not committed to any worktree).
- `docs/3d-audit/lane-reports/F1-width-bar-reshoot.md` — this report.

Scratch export `/private/tmp/claude-501/scratch-FWB-shoot/` and its dev server (port 8501, killed after each
of the two runs) are the only things touched outside MAIN's `docs/` tree; nothing was left running.
