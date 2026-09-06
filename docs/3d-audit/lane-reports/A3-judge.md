STATUS: AMEND-PLAN — the plan's *measurement* is correct and independently reproduced; its *closure* is not. `ringNotInkMm2` (both halves) is a scatter of sub-0.5 mm specks and was never the user's streak. Land the oracle split; do NOT close Unit A / F1 with it.

# A3 — judge verdict

**Judge (read-only), 2026-09-05.** Nothing in any worktree was edited, stashed or committed.
All measurement ran in the planner's existing scratch export of `79c98ca8`
(`…/scratchpad/a3`, verified byte-identical to the `handoff-c` worktree on
`surface-fill.js`, `ribbon-geometry.js`, `pen-fill.js`, `geometry-utils.js`,
`tests/helpers/scene3d-ring-coverage.js`). Own diagnostics written there:
`judge1.js` (re-classification + picture), `judge2.js`/`judge2b.js` (synthetic probe of the
predicate), `judge3.js` (blank-run map over the whole front region), `judge4.js`
(synthetic-void honesty check), `png.js`. Throwaway.

Evidence images and JSON copied to `docs/3d-audit/lane-reports/A3-judge-evidence/`
(new, untracked).

---

## 0. Verdict

**AMEND-PLAN.**

Everything the plan *measured* holds up. I re-derived it independently and it is right:

* **"0 dropped geometry" — CONFIRMED.** On my own runs at `79c98ca8`: `interlockWeave`
  `wide 35 → ribbons 35 → clipped 35`, `clipEmpty 0`, `noRing 0`, `degenerate 0`,
  `erodeEmpty 0`, `outlineOnly 1`; `trochoidLoop` `wide 58 → ribbons 58`, `erodeEmpty 0`.
  Every wide stretch produced a ribbon and a clip. `ringFillRate` 0.9969 / 0.9975 —
  the emitted ribbon polygons are essentially fully inked. Nothing is being lost inside them.
* **"89–98 % pen-unreachable" — CONFIRMED, and the predicate is honest.** See §1.
  My re-implementation (finer candidate lattice, reachability evaluated against **every**
  group containing the cell rather than the planner's first-match owner) reproduces
  `interlockWeave` REACHABLE = **0.1519 mm²** to the digit.
* **"the fix is oracle-side" — TRUE OF THE METRIC, FALSE OF THE COMPLAINT.** See §2–§3.

What fails is the closure. Three findings:

1. **The metric was never the user's streak, and the plan's own numbers prove it.**
   The whole `ringNotInkMm2` residue — *reachable and unreachable together* — is a scatter
   of ~150 clusters per law, none larger than **0.124 mm²**, none longer than **0.95 mm**,
   none wider than **0.53 mm**. There is no band anywhere. `docs/stroke-fill-handoff.md`
   §A said this in advance: *"Ring-fill-rate clears the 0.995 contract bar on all five, which
   is exactly why this needs a human eye rather than a metric — the contract passes and the
   render still reads wrong"*, and its **done when** ends *"…and the user confirms it by eye
   on the bench."* Correcting the denominator so the number passes closes the last numeric
   trace of a complaint that the number never modelled. That is the silent drop.
2. **The plan's GREEN target is lattice-bought at the margin.** `trochoidLoop` measured
   **0.1856 mm² (33 cells)** on my finer lattice against the plan's 0.1800 (32 cells) —
   i.e. *over* the 0.18 band. The plan itself says a finer lattice "can only reclassify cells
   as reachable, i.e. can only make the test stricter". Exactly: one legitimate refinement
   of the search flips `trochoidLoop` from pass to fail. A pass that depends on how coarsely
   you search is not a pass. The plan's own §11 stop condition fires here.
3. **There *is* one thing in the residue that looks like a real fill defect, and the plan
   does not name it.** A **0.45 × 0.30 mm pinhole at document (148.6, 87.0)**, in the middle
   of a solidly inked ~1.5 mm band, appears **identically in `interlockWeave` and
   `trochoidLoop`** (19 cells, 0.1069 mm², same coordinates to 0.05 mm). It is 70 % of
   `interlockWeave`'s and 58 % of `trochoidLoop`'s entire reachable residue. Law-independent
   ⇒ it is a fixed pipeline artefact, not a tone-law artefact. That is the only fill-side
   lead this measurement produces, and it is option B, not option A.

---

## 1. Is "pen-unreachable" measured correctly? — YES, with one named blind spot

The predicate is exactly the **morphological opening** of the clipped ribbon polygon by the
pen disk: a cell is reachable iff it lies in `g ∘ B_r` (`r = pen/2 = 0.15 mm`). That is the
correct formalisation of "the pen centre must stay `r` inside the polygon".

I tested it on synthetic regions where a ruling **is** deliberately dropped (`judge2.js`,
`judge2b.js`; pen 0.3, same `cs = pen/4` grid):

| case | notInk mm² | **REACHABLE (kept as defect)** | UNREACHABLE (excused) | excused |
|---|---|---|---|---|
| A 20×3 mm ribbon, complete rulings @0.28 | 3.206 | 3.184 | 0.0225 | 0.7 % |
| **B 20×3 mm, ONE ruling dropped** | 9.191 | **9.169** | 0.0225 | **0.2 %** |
| **C 20×3 mm, EVERY 2nd ruling dropped** | 30.167 | **30.144** | 0.0225 | **0.1 %** |
| S 20×2.2 mm, 0.34 mm un-inked edge strip | 4.635 | 4.618 | 0.0169 | 0.4 % |
| S2 same, 0.25 mm un-inked edge strip (<1 pen) | 4.635 | 4.618 | 0.0169 | 0.4 % |
| H 3×3 square, best-possible pen coverage | 0.0225 | **0.0000** | 0.0225 | 100 % |

**The definition does NOT excuse a dropped ruling.** In every wide-polygon case the void
stays 99.8–99.9 % REACHABLE. Case H shows the complement: perfect coverage of a square leaves
exactly the four 90° corner wedges (0.0056 mm² each), which is the analytic
`r(csc(θ/2) − 1) = 0.062 mm` depth the plan derives. The predicate is a derivation, not a
fudge.

**The one blind spot — name it in the helper's header.** Any region narrower than **one pen
width** is excused unconditionally, however long:

| case | notInk mm² | REACHABLE | UNREACHABLE |
|---|---|---|---|
| 20 × 0.10 mm sliver, zero ink | 1.502 | **0.000** | 1.502 (100 %) |
| 20 × 0.20 mm sliver, zero ink | 4.506 | **0.000** | 4.506 (100 %) |
| 20 × 0.28 mm sliver, zero ink | 6.008 | **0.000** | 6.008 (100 %) |
| 20 × 0.32 mm sliver, zero ink | 6.008 | **5.991** | 0.017 (0.3 %) |
| tapering wedge 0→1.2 mm, zero ink | 12.032 | 11.289 | 0.743 |

A 20 mm long, 0.28 mm wide blank sliver scores **0.0000 mm² of defect**. There is a hard
cliff at 0.30 mm. This matters because the pipeline's own `narrow` / `CLS_WALLS` branch
*does* ink sub-pen stretches with a centreline — so "the pen cannot ink it" is a policy of
the erosion path, not a law of plotting.

**On this fixture the blind spot is not what is happening.** I split the unreachable set
into CORNER (an admissible pen centre exists within `3r = 0.45 mm`) vs NECK (none):

| law | notInk mm² | REACHABLE | UNREACH-CORNER | **UNREACH-NECK** |
|---|---|---|---|---|
| interlockWeave | 2.0588 | 0.1519 (27 cells) | 1.9012 (338) | **0.0056 (1 cell)** |
| trochoidLoop | 1.7100 | 0.1856 (33 cells) | 1.5131 (269) | **0.0112 (2 cells)** |

So 338/339 and 269/271 of the "excused" cells are shallow corner fringe with ink within
0.45 mm. The plan's 89–98 % figure survives scrutiny. **Verdict on (1): the definition is
correct; document the sub-one-pen cliff and add case D3 above as a helper test so a future
change that starts producing blank slivers cannot hide behind it.**

## 2. Where are the residual non-unreachable areas — and are they streaks? — NO

`interlockWeave`: 151 clusters. Largest = **19 cells, 0.1069 mm², 0.45 × 0.30 mm**, all
reachable, at (148.6, 87.0). Every other cluster ≤ 9 cells / ≤ 0.051 mm² / ≤ 0.48 mm across.
`trochoidLoop`: 147 clusters. Largest = 22 cells, 0.1237 mm², **0.90 × 0.30 mm**, entirely
CORNER-class, at (137.0, 74.0); then the same 19-cell reachable pinhole at (148.65, 87.01).

I looked at them. `A3-judge-evidence/interlockWeave-zoom.png` and
`trochoidLoop-zoom-reach.png` (90 px/mm, 6 × 4 mm field, ink = white, uncovered-reachable =
red): a single red speck in the middle of a **solidly inked 1.5 mm band**. Nothing else in
frame is uncovered. `trochoidLoop-zoom.png` shows the biggest CORNER cluster: a 0.9 mm blue
notch exactly at the pinch where two inked lobes meet — a convex-corner wedge, drawn as
predicted.

At the render scale (~8 px/mm) these are 2–7 px. **A human would not call any of them a
streak, and no arrangement of them makes a band.**

## 3. Are the white bands the user sees the "pen-unreachable" regions? — NO. They are neither half of this metric

The unreachable set is 338 cells in ~150 clusters of ≤ 9 cells, hugging boundaries, 0.005–0.05 mm²
each. It cannot be a band either. So the user's complaint is **not** the reachable residue and
**not** the unreachable residue — it is not in `ringNotInkMm2` at all.

Where the blank actually is: I mapped distance-to-nearest-ink over the **whole front-facing
region** (1224 mm², the clip target, not the ribbon polygons), `judge3.js`:

| law | region mm² | max dist to ink | blank >0.8 mm | blank >1.2 mm | blank >2 mm |
|---|---|---|---|---|---|
| interlockWeave | 1223.97 | 2.78 mm | 131.6 mm² (10.8 %) | 54.3 (4.4 %) | 4.35 (0.36 %) |
| taperedEnds (clean control) | 1223.97 | 2.26 mm | 188.9 mm² (15.4 %) | 53.3 (4.4 %) | 0.62 (0.05 %) |

`interlockWeave-blank.png` vs `taperedEnds-blank.png` show wide red (>0.8 mm blank) **bands**
on both — because on both they are the *intended* spacing between ribbon stretches. The
oracle's denominator is the ribbon polygons, so it never sees this area at all; and a
naive blank-run bar over the region would flag the clean control just as hard.

**Consequence for the brief:** the residual user-visible defect, if it still exists, is a
*placement* property (where ribbons go and how far apart), not a *coverage* property of an
emitted ribbon. That is W-26 territory (continuous placement so gaps carry tone), not A3's.
The honest statement is: **A3's instrument cannot see the user's defect, and A3 did not find
it.** It must not be closed as if it had.

**Caveat I could not remove:** there is no user screenshot for F1 anywhere in the repo
(`user-reports/` holds only W-05b/W-06b/W-27c/W-29 images). The quote *"Not close to zero just
yet"* comes from a bench session on `docs/stroke-fill-handoff.md`. Nobody can confirm which
white the user meant without putting the torus back in front of him. That is itself the
strongest argument against closing the item on a number.

## 4. Honesty check of the corrected metric — it passes

Real fixture, `interlockWeave`, every 2nd emitted `sceneFill` path dropped (`judge4.js`,
`DROP=2`, reachability sampled 1-in-6):

* `ringNotInkMm2` 2.06 → **317.77**
* REACHABLE 0.152 → **~315** (52.50 measured on the 1-in-6 sample)
* UNREACHABLE ~1.91 → ~2.7

A 2000× rise. The corrected metric is falsifiable — the plan's §6.3 item 1 will go red
convincingly. That part of the plan is sound and worth landing.

---

## 5. AMENDED UNIT BRIEF (what to do instead)

**Keep** plan §6.1 (the `ringNotInkReachableMm2` / `ringUnreachableMm2` split, additive,
independent pure-JS, sibling files byte-identical), §6.3 (all three honesty tests) and §7 E
(the `insetMultiPolygon` swallowed-failure ladder, as its own W-id). **Reject** the closure
and the two items below.

**Files (unchanged from the plan's allow-list):** `tests/helpers/scene3d-ring-coverage.js`,
`tests/unit/scene3d-ribbon-f1b-streaks.test.js`,
`tests/unit/scene3d-ring-coverage-reachability.test.js`, `docs/3d-audit/STILL-OPEN.md`,
`CHANGELOG.md`, `plans.md`. **No `src/` change.** Forbidden list stands.

**A1 — do not assert `ringNotInkReachableMm2 <= 0.18`.** Measured at a finer lattice
`trochoidLoop` is 0.1856. Instead:
* Pin the reachability lattice **in the helper** as a named constant, and add a test that
  halving the step changes the reachable-cell count by ≤ 1 cell per law. If it changes more,
  the number is resolution-bought and the unit stop-reports.
* Assert the raw `ringNotInkMm2 < 3` as an anti-explosion guard (as the plan proposes), and
  record `ringNotInkReachableMm2` per law as a **pinned diagnostic** with today's values
  (0.152 / 0.051 / 0.186 / 0.028 / 0.017), not as the unit's pass criterion.

**A2 — replace the band assertion with an oracle that measures what a human calls a streak.**
Return a cluster breakdown from the helper (flood-fill of uncovered cells, 8-connected) and
assert, on all five laws **and both controls**:
* no connected uncovered run inside a ribbon polygon with **max extent > 1.2 mm**, and
* no uncovered cluster **wider than one pen (0.30 mm) over a length > 1.0 mm**.
Today's worst is 0.90 × 0.30 mm (`trochoidLoop`, corner-class) and 0.45 × 0.30 mm
(the pinhole). Those are the honest bars to pin and drive down; a genuine lengthwise streak
violates them by construction, and — unlike the mm² band — a human can check the assertion
against the picture. Include the synthetic case D3 (20 × 0.28 mm blank sliver) as a
documented known-blind case so the cliff is on the record.

**A3 — Unit A / F1 stays OPEN.** Exact wording for `docs/3d-audit/STILL-OPEN.md` (replace the
Unit A and A2/A3 bullets' forward-looking half; keep their history):

> - **A3 (79c98ca8, handoff-c) — MEASURED, F1 NOT CLOSED.** Both prior hypotheses are dead:
>   self-occlusion (A2) and dropped geometry (A3). Independently re-derived at `79c98ca8`:
>   every wide stretch produces a ribbon and a clip (`wide == ribbons == clipped`,
>   `clipEmpty/noRing/degenerate/erodeEmpty` all 0), 0–1 boolean failures per render and
>   **0 mm² dropped**; 89–98 % of `ringNotInkMm2` is pen-unreachable (the morphological
>   opening of the clipped ribbon by the pen disk — a correct predicate, verified against
>   synthetic dropped-ruling cases, blind only to regions narrower than one pen width).
>   **The metric is not the user's defect.** The entire residue, reachable and unreachable,
>   is ~150 clusters per law of which the largest is 0.124 mm² / 0.90 × 0.30 mm; there is no
>   band anywhere in it (see `docs/3d-audit/lane-reports/A3-judge.md` and its evidence dir).
>   `ringNotInkMm2` therefore cannot be used to close F1: `docs/stroke-fill-handoff.md` §A's
>   *done when* requires **"the user confirms it by eye on the bench"**, and the user's
>   *"Not close to zero just yet"* was about the render, not the number. **F1 stays OPEN
>   pending a bench look at the torus with the five laws; no screenshot of the original
>   complaint exists in the repo, so the first step is to ask the user which white he meant.**
>   Two leads carried forward, neither of them oracle-side: (a) a law-independent
>   0.45 × 0.30 mm ink pinhole at document (148.6, 87.0), identical in `interlockWeave` and
>   `trochoidLoop`, = 70 %/58 % of each law's reachable residue — a real fill hole in a solid
>   band, `surface-fill.js` outline↔fill seat / PenFill pitch, **serialize against
>   `fill-audit-a`**; (b) the blank the eye actually sees on the torus is *between* ribbon
>   stretches, outside the oracle's denominator — a placement question that belongs to W-26
>   (continuous placement), not to a coverage metric.

**A4 — evidence.** The plan's §10 re-shoot is fine and the byte-identical result is the right
proof for a test-only change, but it is not evidence about the streak. Add to
`after/A3/report.json`, in words: *"the metric's residue is invisible at tier-A zoom; the
0.1 mm² clusters were located at (148.6, 87.0) and (137.0, 74.0) and are not visible; this
unit therefore proves nothing about the user's complaint, which stays open."* Do not let the
report imply otherwise.

---

## 6. Numbers a reviewer can re-derive

Scratch export `…/scratchpad/a3` (already byte-identical to the worktree):
`node judge2.js && node judge2b.js` (~40 s, synthetic predicate probe);
`node judge1.js interlockWeave ./judge-out` (~12 min, classification + pictures);
`NORENDER=1 DROP=2 SAMPLE=6 node judge4.js interlockWeave ./judge-drop` (~10 min, honesty check);
`node judge3.js interlockWeave,taperedEnds ./judge3-out` (~12 min, blank-run map).
All wrap the loaded runtime only — no tracked file was edited to obtain any number here.

LOOK: docs/3d-audit/lane-reports/A3-judge-evidence/interlockWeave-zoom.png — the WHOLE largest defect the F1B metric finds, at 90 px/mm: one 0.45 x 0.30 mm red speck in a solidly inked 1.5 mm band. That is what "2.06 mm2 of streak" looks like.
