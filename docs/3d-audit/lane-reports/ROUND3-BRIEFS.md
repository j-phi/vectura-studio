# ROUND 3 — lane map and first-unit briefs (secretary, 2026-09-10)

**Base for every lane: `main` `426cc5e4` (v1.4.1, round 2 merged, gallery rebuilt at creation defaults —
3480 cells). NOT pushed; main is 44+ ahead of origin.** The five round-2 lanes (`*-a2`, `fill-collapse-2`,
`fill-audit-d2`, `fill-audit-2`, `handoff-c2`) are **historical — nobody works in them.**

**All nine §4 decisions are answered** (SESSION-SUMMARY §4). **Nothing in round 3 is frozen.**

Every implementer reads `AGENT-PROTOCOL.md` first, then its lane section. Ports are reserved; the gallery is
served from MAIN at `http://localhost:8460/docs/3d-audit/fill-audit/index.html`. The version hook cannot fire
in a worktree — never bump. Commit in the worktree, then STOP. Never push.

**Standing constraints, unchanged and binding:** serialization by file (below); `## Bars changed` disclosure
is mandatory; RED from a scratch `git archive` export, never `git stash` in the worktree; crop evidence at
NATIVE resolution before judging; one-line final message `REPORT <path> — <STATUS> — ≤15 words`.

**Round-2 process changes that now bind from the start** (`fill-audit-handoff.md` §How to run the next
session): **spike-gate any plan whose Rank 1 is argued rather than prototyped** · **ask of every new bar what
quantity it actually measures** (five instrument defects in round 2) · **re-derive a plan's RED numbers on the
CURRENT tree** · **foreground only — including reviewers and planners** · **sweep BOTH cameras in the slices
pass** · **name behaviours no single lane can test and make them merge-checklist items.**

## Lane map

| worktree (`.claude/worktrees/`) | branch | port | file ownership | first unit | planner? |
|---|---|---|---|---|---|
| `fill-audit-a3` | `3d-scene/fill-audit-a3` | 8475 | `surface-fill.js` (`MK`/mark sink, ladder/cross placement) | **T4** | no — PLAN-READY by path |
| `fill-collapse-3` | `3d-scene/fill-collapse-3` | 8482 | collapse chain, `context-bar.js` / `scene3d-panel.js` | **U6** | no — PLAN-READY by path |
| `fill-audit-3` | `3d-scene/fill-audit-3` | 8476 | `scene3d.js` faceted path + `context-bar.js` + `params.js` | **W-38** | **YES — Opus planner first** |
| `fill-audit-d3` | `3d-scene/fill-audit-d3` | 8481 | `mappers.js` + slices pass; **`geometry-utils.js` claimed for W-37** | **W-37 (scout first)** | **scout, then decide** |
| `handoff-c3` | `3d-scene/handoff-c3` | 8470 | `hlr.js` / `shadows.js` / pen-fill / fill-boolean | **idle** | — |

---

## Lane fill-audit-a3 — first unit **T4** (W-06 max density, Jay's decision 1 = B)

- **Brief status: PLAN-READY by path.** `W-05b-W-06b-plan.md` **§3.4 + §7 unit U4** (band-width cap +
  `bandMax`; "carries the max sign-off report"). Its stated prerequisite — U1/U2 landed and reviewed — is
  **partly unmet: T1 and T1b landed, but T2 was REJECTED and reverted.** The plan says "U4's band is only safe
  once each pass is a walked arc", which T1 delivered; **T2's length response is not a prerequisite for the
  band cap**. State that reading explicitly in the report, and stop if the band turns out to depend on it.
- **Jay's bar, verbatim (decision 1 = B):** T4 restores a dark end — **sphere Density 220 ≥ 1500 mm ink, with
  no slab defect**. The lost byte-identity is signed off; **the ink collapse is not**.
- **Files ALLOWED:** `src/core/scene3d/surface-fill.js` (`MK` table, mark constants, `mkCap`/`mkShape`, the
  `emitMarks` block only), `tests/unit/scene3d-mark-laws-draw.test.js`.
  **FORBIDDEN:** the master grid `:5084–5285` (read, never write), `emitContFamily` internals, anything W-26
  touched, `HL_STAGE` (`coverageCap` must stay `false`), and every other lane's files.
- **Two conditions the plan predates** (both cost a unit in round 2): **re-derive every RED number on the
  CURRENT tree** — T1b, W-33, W-36, W-36b and the merge all landed in `surface-fill.js` since it was written —
  and **re-measure the byte-identity set** (the other 10 mark laws + ladder/fineLadder/phaseFineLadder/
  contField\*) against the post-merge tree.
- **Lane order after T4:** **F1-placement** (decision 4 = A; Prototype B under its five ruled conditions) →
  **F1-amp** → **W-36c** (needs a planner — see below) → **T2 iteration 2** (inherits W-36c) → **T3** →
  **W-31b** (needs a planner) → **W-35b**.

## Lane fill-collapse-3 — first unit **U6** (`penStipple`, Jay's decision 2 = A)

- **Brief status: PLAN-READY by path.** `W-22-24-W-18-plan.md` **§"C-06 → U6"** (survivor `penInterleave`,
  param `penMode`; also W-18's roster half), plus §2's migration contract. **U1–U5, U7 and U8 have executed
  this mechanism seven times** — reuse **U7's dimensioned (primitive × density) harness**, not the sphere-only
  precedent.
- **Jay's ruling (decision 2 = A):** **Pen Stipple moves from `'dot'` to `'hatch'`**, and **the caveat text
  must say why it moved** — the re-categorisation is user-visible and must not have to be inferred.
- **Binding from U7:** if **both** the survivor and a folded id carry their own caveats, **a non-empty default
  caveat is the known-good outcome**, not a bug. The standing ruling "folding a law must NOT hide its measured
  caveat" binds U6 explicitly.
- **Files ALLOWED:** `scripts/build-tone-laws.js` (the curated `COLLAPSE` table), `src/config/context-bar.js`,
  `src/ui/panels/scene3d-panel.js`, `src/ui/shell/context-bar.js`, and the collapse/picker tests.
  **FORBIDDEN:** `surface-fill*.js`, `mappers.js`, the slices pass, `hlr.js`, `shadows.js`.
- **Lane order after U6:** **U9b + W-10d-3b** (now unblocked — this is the first tree to hold both U9 and U8;
  scope is written out in `LEDGER.md` §MERGE CHECKLIST item 15) → **U7-2** (plain-language caveat pass over
  **every** folded law — `weaveDepth`'s is still audit prose; U5b-2 did two laws, U7 and U8 then added folds
  without it).

## Lane fill-audit-3 — first unit **W-38** (F-14b product unit, Jay's decision 7 = B) — **NEEDS A PLANNER**

- **Brief status: NEEDS AN OPUS PLANNER.** It is a **product unit with the full docs contract**, it spans
  three files plus the panel, and its own justification lives in `W-15c-E-plan.md` §2 — six measured designs
  proved the graded case's bar **arithmetically impossible**, which is *why* this is a dial and not a formula.
- **Jay's ruling (decision 7 = B):** expose **`FACET_MIN_RULINGS`** as a per-style **"minimum facet rulings"**
  control, **default 3**, and **byte-identical at the default** (the W-35 precedent: the docs contract lands
  with no render change until the user moves it).
- **Files (expected):** `src/core/algorithms/scene3d.js` **faceted path only**, `src/core/scene3d/params.js`,
  `src/config/context-bar.js`, `src/ui/panels/scene3d-panel.js`, plus tests.
  **Guards that must stay green or be re-pinned WITH proof:** `scene3d-box-density-bearing`,
  `scene3d-facet-tone` (O20/O21/**O28 view-independence**), `scene3d-hatch-density-500`,
  `scene3d-subwindow-density`, `scene3d-appdefault-facet-fill`, and the calibration test.
- **The planner must carry forward what F-14 already proved, so it is not re-litigated:** any λ derived from
  **camera-projected** front-face quantities is **per-view** and re-grades the object on orbit (O28 kills it);
  6 rulings on a lit facet is an **inverted drawing in closed form** (0.89× the darkest facet); the subwindow
  control sits at **0.3817 of a 0.40 bar**. **The dial exists because the formula cannot.**

## Lane fill-audit-d3 — first unit **W-37 (scout first, then decide)**

- **Brief status: SCOUT, then PLAN-READY or PARK.** W-37 was filed from W-34's §7.4:
  **`GeometryUtils.toCurveAnchors` returns `{straight:true}` on every contourSlice ring measured, so Fill
  Curves is INERT on contourSlice output** even at the app default `fillCurves:true`. Binding rule 2(b) says
  rounding must not be off by default — **here it is not off, it declines**, a case the rule never anticipated.
- **First task is a measurement, not a fix: confirm it is still real on `426cc5e4`.** W-33, W-34, W-34b, W-35
  and W-27c-0a-6 all landed in this area after W-37 was filed. **If the gate now engages, close W-37 as
  MEASURED and the lane goes idle.**
- ⚠ **W-37 is NOT the same defect as W-33's fitter-limitation follow-up**, and the W-33 reviewer proved it:
  there the gate **never declines** (`anyGateDecline=false` on all four primitives) and
  `flattenSmoothedPath` **reduces** density exactly where the fix made it dense. Two mechanisms, two units.
- **File note:** `geometry-utils.js` is in **no lane's ownership list**; it is claimed for this lane for
  W-37's duration. **Never loosen the fitter's `acceptable()`.**
- Also available here, unscheduled: the degenerate 2/3-point stub paths (sphere 19, ellipsoid 8/19, torus 37,
  capsule several) — **the W-29 family, not W-37**.

## Lane handoff-c3 — **IDLE at start, and honestly so**

- **Nothing on `hlr.js` / `shadows.js` / pen-fill is ready.** W-30b, W-30c and W-30d are closed; U9 and U9-2
  are closed; U9b moved to the collapse lane because that is where U8 is.
- **What it gets when it gets it:** **F1-amp**, which is serialized **after F1-placement** on fill-audit-a3
  (decision 4 = A unblocked the pair), and it may want its own lane at that point.
- **Available as measure-and-park if a lane is wanted now:** an **HLR sub-pen precision unit** folding the
  W-25 imported-torus occluder seam (< 0.05 mm) with W-27c-0a-4's bridged micro-gap pair (**0.0038 mm**,
  explicitly routed to the `hlr.js` owner). **Brief it to measure-and-park** — both are an order of magnitude
  under a pen width, so a stop-report is the likely honest outcome, and that is a fine outcome.

---

## W-36c (Jay's decision 6 = C) — **NEEDS A PLANNER**, runs on fill-audit-a3 after F1-amp

- **Jay's ruling, verbatim in effect:** **EACH crosshatch family carries the single-family hatch count**
  (≈2× ink), **and it needs a NEW anti-saturation cap** so Density 220 does not go solid.
- **Scope for the planner:** re-derive **`CROSS_PAIR_BUDGET`**, **P3 (count ratio)** and **P5
  (anti-saturation)** for per-family = hatch count; **keep P1, P2, P4, P6 and the W-26 gap-jump unchanged**;
  **define the new cap BY MEASUREMENT, not by analogy to the old one** (the current P5 is v1.3.98 + 15%, and
  that reference no longer applies once the convention changes); evidence on **all four primitives plus Jay's
  own cell** (sphere, crosshatch, Ladder, Fine rungs, 45°, d=50).
- **What is already measured and must not be re-derived:** the naive one-line parity (`CROSS_SHARE_BASE`
  0.1 → 1.0) gives **cylinder d=220 = 9136.8 mm, +93.5% vs v1.3.98** — judge C1's saturation restored almost
  exactly. **That is the number the new cap exists to prevent**, and it is the mutation that proves the cap
  guards a mechanism rather than a fingerprint.
- **T2 iteration 2 inherits from W-36c** and must run after it — its own brief is `T2-review.md`
  (a different length-response curve; a per-cell acceptance table on **all six** combinations).
