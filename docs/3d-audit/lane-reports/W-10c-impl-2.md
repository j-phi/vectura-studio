STATUS: DONE/FU

# W-10c impl-2 report — review followups + orchestrator wedge follow-up

**Lane:** fill-audit-c
**Worktree:** `/Users/jayphi/Documents/github/vectura-studio/.claude/worktrees/fill-audit-c`
**Branch:** `3d-scene/fill-audit-c`
**Base sha (from impl-1):** `441af81f` → **new sha:** `04ab79bd`
**Prior reports:** `docs/3d-audit/lane-reports/W-10c-impl.md` (impl-1), `docs/3d-audit/lane-reports/W-10c-review.md` (ACCEPT-WITH-FOLLOWUPS)

This session addressed, in order: (1) the reviewer's two mandatory followups, (2) the orchestrator's
subsequent wedge re-check, which supersedes some of the reviewer's characterization once the real
mechanism was understood.

## Reviewer followup #1 — retrace mutation coverage (DONE, corrected mid-flight)

Added `tests/unit/scene3d-origin-spiral-tonal-range.test.js` → *"originSpiral retrace: torus shadow
arc computes duty > 1, and every gap still clears 1.0x pen"*, reading a new per-angle
`__spiralDuty` trace (`{guard, i, theta, duty, dutyRaw}`) published in `surface-fill-mono.js`
alongside the existing `__spiralGaps` trace, test-only behind `__MONO_TRACE`.

**Self-caught error, corrected before delivery:** this duty-trace test is *not* actually sensitive
to the retrace loop being disabled — `localDuty[i]` is computed before that loop runs, so
disabling it (`&& false` mutation) left this test green in a direct scratch-copy check. Rewrote
the doc comment to say so plainly and added a second, genuinely mutation-sensitive test — *"originSpiral
retrace: disabling the retrace loop measurably drops torus output (real mutation guard)"* — that
calls `algo.generate` on the app-default torus/hatch/originSpiral scene and asserts `pathCount >
350` and `inkLen > 1450mm`. Independently reproduced:

- **RED** at the retrace-disabled mutation (scratch copy, `for (...; L <= DUTY_CAP && false; ...)`
  in `surface-fill-mono.js`): `pathCount 293`, `inkLen 1365.7mm` — both below the bars.
- **GREEN** on the committed tree: `pathCount 409`, `inkLen 1551.7mm`.

The duty-trace test is kept (relabeled honestly) because it does verify the duty *value* is
computed correctly and that a real torus arc requests duty > 1 — necessary, just not sufficient,
context for the real guard next to it.

## Reviewer followup #2 — DUTY_CAP boundary (DONE, with an honest finding)

Added *"originSpiral retrace: DUTY_CAP=4 clamp is applied correctly (no engagement observed on any
tested fixture)"*: verifies `duty === clamp(dutyRaw, 1, 4)` for every recorded sample. Honest
finding recorded in the test and in `report.json`: **DUTY_CAP never actually engages** on any
fixture tried — torus max observed `dutyRaw` is 3 (not 4), and forcing `penWidth` to 3x default
(0.9 vs 0.3, to inflate `PLOT_MIN_PEN`/`wanted`) still topped out at 3. `pitchFor`'s own floor
(`INK / A_DARK`) scales with the same `inkWidth`/`penWidth` pair that sets `PLOT_MIN_PEN`, so the
ratio between them stays roughly fixed regardless of absolute pen size — a structural reason, not
a fixture accident. The test asserts correctness of the clamp formula, not "the cap bites."

## Reviewer followup #3 — evidence `before` pointer (DONE)

Confirmed the review's finding: `after/W-10/shots/B/*` was byte-identical to `after/W-10c/shots/B/*`
for every cell checked — a stale/overwritten historical folder, not a real `78bbf3e8` capture.
Re-captured all 12 cells (`sphere/torus/cone × hatch/contour × med/max`) fresh from a scratch
`git archive 78bbf3e8` export into `docs/3d-audit/fill-audit/after/W-10c/before-78bbf3e8/`, and
re-verified via `md5` that **all 12 before/after pairs now differ** (none byte-identical).
`report.json`'s `before` array now points there. `after/W-10`'s own corruption is flagged as a
gallery-hygiene issue for the fill-audit lane/orchestrator to investigate separately — not touched
here (outside this lane's files).

## Reviewer followup #4 (optional, torus/cone lit/shadow measurement) — not reattempted

The reviewer's own attempt hung; given the wedge finding below made this measurement moot for the
decision at hand (the object-total ink metric was already shown to be an unreliable proxy for real
screen coverage — see next section), this was not reattempted. Flagged for STILL-OPEN if still
wanted.

## Orchestrator follow-up: the torus wedge is real, unfixed, and root-caused (this session's main finding)

The orchestrator looked at `after/W-10c` and reported the torus lower-left fan still reads as
solid white wedges despite the 0%-under-1-pen gap metric. Investigated in this order:

1. **Disproved a wrong first hypothesis.** Sampled `C.inv` along every degree from the law's own
   highlight origin (`hiX`/`hiY`) out to `rMax` on both torus and cone: torus has 148/360 = 41.1%
   of angles that never touch the surface at ANY radius (a genuine off-surface "dead zone"), but
   **cone has 147/360 = 40.8%** — essentially identical. Since cone shows no wedge defect, this
   dead-zone fraction does not explain the torus-specific problem; it is apparently normal for any
   primitive when the highlight origin sits near a silhouette edge, not a torus-topology artifact.
2. **Found the real mechanism.** Rendered the same torus cell through a scratch copy with the
   retrace loop disabled (`&& false`) and diffed it against the retrace-enabled render: **0.67%
   pixel difference** (2129/320000 px, max delta 27 — antialiasing jitter only). Retracing an
   identical curve at an identical radius adds essentially **zero new screen coverage** — it
   redraws pixels already inked. The "+5-8% ink length" the impl-1 report cited as evidence of
   tone recovery was real as a path-length sum but illusory as a coverage metric (duplicate
   strokes over already-dark pixels, not new dark area).
3. **Measured the wedge directly (pixel run-length analysis), not just diffed.** Calibrated pen
   width in the rendered PNG from an unambiguous tight-ring region (torus: 7px; cone: 2px), then
   measured, in a verified-interior band, the fraction of pixels sitting in a continuous
   *blank-paper* run longer than 2 pen-widths (the literal "solid white wedge" the orchestrator
   named): **torus 73.9% (78bbf3e8) → 87.8% (441af81f) — WORSE, not better.** Cone, same
   technique: **67.2% → 67.6% — unchanged (within noise)**, confirming the orchestrator's own
   visual read that cone is fine.
4. **Root cause, confirmed structural.** Raising the floor from 0.8x to 1.0x pen mechanically
   widens the true ring-to-ring gap by ~25% wherever the floor was already engaging (torus: ~10%
   of angles, per W-10b's own measurement). The retrace mechanism cannot compensate because it
   never draws a genuinely new, offset ring — only a duplicate of the existing one. The only way
   to add real coverage between two floor-widened rings would be a new ring at a radius *closer*
   than 1 full pen to its neighbor — which is exactly the sub-floor crowding W-10/W-10b/W-10c
   exist to eliminate. This is a proven tension between "no gap under 1 pen" and "no gap over ~2
   pens", not a missing parameter, in any region where the tone-driven pitch is intrinsically
   sparser than 2x the floor.

**Decision per the orchestrator's own numbered directive:**

- **(1) Explained** — see above, and in full in `report.json`'s `orchestrator_followup_response`.
- **(2) Real fix within ~2h: NOT ACHIEVABLE**, for the structural reason above — not attempted as
  a source change. A genuinely different fill strategy for torus (not a parameter retune) would be
  required, well outside this budget.
- **(3) Hide originSpiral on torus via `isReachableOn`: SPEC READY, NOT IMPLEMENTED — BLOCKED BY
  LANE FILE SERIALIZATION.** `SCENE_FILL_STYLES.isReachableOn` lives in
  `src/config/context-bar.js`, which `docs/3d-audit/lane-reports/AGENT-PROTOCOL.md`'s
  serialization table assigns to the **`fill-audit`** lane, not `fill-audit-c` (mine is
  `surface-fill-mono.js` only). I confirmed that lane has a live concurrent session this session
  (its own edits landed in `docs/3d-audit/STILL-OPEN.md`, a shared file, while this unit was in
  progress) — editing `context-bar.js` here would cross the protocol's hard file boundary and risk
  a real collision, not a hypothetical one. Exact patch, ready for whoever owns that file (also in
  `report.json`):

  ```js
  // inside SCENE_FILL_STYLES.isReachableOn, curved/chart-wrapped branch,
  // after the spiral/stipple and pyramid+hatch+fineLadder checks, before
  // the final `return true;`:
  if (primitiveMode === 'torus' && id === 'originSpiral') return false;
  ```

  Plus a picker test (likely `tests/unit/scene3d-fill-style-picker.test.js` or similar — also
  outside this lane) asserting the Fill Style row for originSpiral disappears on torus and stays
  present on cone/sphere.

Cone and sphere are unaffected by any of this (cone measured essentially unchanged; sphere's own
existing tonal-range/wrap-foreshorten tests pass with margin, ink +2.2%) and should keep the
current 1.0x-floor + retrace behavior exactly as shipped in `441af81f`/`04ab79bd`.

## Tests — final state

`tests/unit/scene3d-origin-spiral-tonal-range.test.js`: **9/9** (was 6/6 — 3 new tests: the
corrected duty-computation test, the real output-based mutation guard, the DUTY_CAP boundary
test). Full targeted suite (7 files, same as impl-1): **53 passed, 1 pre-existing skip
(unrelated file/flag, predates this branch), 0 failed.**

No skipped tests in this diff. No tolerances widened. No fingerprints re-pinned without proof.

## Evidence

`docs/3d-audit/fill-audit/after/W-10c/report.json` rewritten in place (not a new file — same
evidence directory, `after/W-10c/shots/B/*` unchanged since the source code didn't change this
round, only tests + trace instrumentation did). Added `before-78bbf3e8/` with 12 freshly-captured
genuine pre-fix images. `REVISION_NOTE`, corrected `notes`, `looked_at_images`, and a new
`orchestrator_followup_response` block record everything above with exact numbers. All 12
before/after pairs independently re-verified via `md5` to differ (no byte-identical pair).

**Looked at the images again, specifically for this follow-up.** The genuine 78bbf3e8-vs-441af81f
torus comparison (not the stale/corrupted `after/W-10` pair impl-1 mistakenly used) shows the wedge
band looking very similar in both, with the run-length measurement confirming "after" is if
anything slightly worse in the measured band. Cone: near-identical, confirmed by measurement.
Sphere: near-identical, clean, no defect.

## Commit

`04ab79bd` in the worktree — `src/core/scene3d/surface-fill-mono.js` (+15/-1: per-angle duty trace
extended with `dutyRaw`) and `tests/unit/scene3d-origin-spiral-tonal-range.test.js` (+135/-1: the
mutation guard, corrected duty test, DUTY_CAP test). No other files touched. No `context-bar.js`
edit (blocked, see above).

## Open follow-ups for STILL-OPEN.md (not done here — outside 30-min/lane scope)

1. **Apply the `isReachableOn` torus gate** (exact patch above) in `src/config/context-bar.js`
   (fill-audit lane) plus a picker test.
2. **Investigate why `after/W-10`'s gallery folder is corrupted** (byte-identical to `after/W-10c`)
   — review's finding, not re-investigated further here since the fix (repointing `before`) was
   sufficient for this unit.
3. **Torus/cone lit-vs-shadow tone-ordering measurement** (reviewer's own unfinished item, §6c/d of
   the review) — not reattempted; lower priority now that the object-total ink metric is known to
   be an unreliable proxy for the specific defect in question.
4. If the torus wedge must eventually be genuinely fixed rather than hidden: the real lever is a
   different fill strategy for non-star-shaped-enough-relative-to-tone-demand silhouettes (not a
   floor/duty parameter), which needs its own design pass and its own W-id.
