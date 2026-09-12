STATUS: ACCEPT-WITH-FOLLOWUPS

# W-36c — adversarial review

Reviewer, read-only. Worktree under review: `.claude/worktrees/fill-audit-a3`, pinned range
**a3b651f0..8adfd5af** (includes the Incident-7 orchestrator checkpoint `ac412d61`, reviewed as
part of the range as a whole). The F1-placement implementer began editing this worktree during
this review (LEDGER row 2, "IN-FLIGHT — implementer started 2026-09-11 at `8adfd5af`") — per
instructions, `git archive` exports of both pinned shas were taken immediately
(`git -C .claude/worktrees/fill-audit-a3 archive a3b651f0`/`8adfd5af` → scratch, `node_modules`
symlinked) and the live worktree was **not read again** after that. All verification below ran
foreground, one vitest file at a time, in those scratch exports or copies of them; no worktree,
stash, or main file was edited. Scratch dirs deleted at the end of this review.

**Files changed, confirmed by `diff -rq` of the two archives (excluding `node_modules`/
`graphify-out`):** exactly `src/core/scene3d/surface-fill.js`,
`tests/unit/scene3d-crosshatch-parity.test.js`, `tests/unit/scene3d-curved-density-floor.test.js`,
`tests/unit/scene3d-crosshatch-cell-shape.test.js` — the ALLOWED list in `W-36c-plan.md` §6,
nothing else, no new/deleted files. (Evidence under `docs/3d-audit/fill-audit/after/W-36c/` and
the two lane-report `.md` files live as **untracked files in main's own worktree** — not part of
either archived sha — which is this audit's normal split between code-on-branch and
docs-on-main; confirmed via `git status --short` in the main repo.)

## (1) RED / GREEN reproduced independently

**RED** — copied the three NEW/rewritten test files from `8adfd5af` onto a scratch export of
`a3b651f0`'s **old** `surface-fill.js` (this IS mutation M1, done directly rather than via
`git apply -R`) and ran `scene3d-crosshatch-parity.test.js`: **23 failed / 68 passed (91)** —
matches the impl report's M1 claim exactly: 21 P3a cells fail (0.40–0.74 vs the required 0.85)
plus 2 P5b assertions failing by float rounding against their own literal threshold
(`5019.592... < 5019.6`, `3194.984... < 3195`) — not a real defect, since post-fix ink clears the
same thresholds by 800+ mm.

**GREEN** — same three files run against `8adfd5af` unmodified: `scene3d-crosshatch-parity`
**91/91**, `scene3d-curved-density-floor` **13/13**, `scene3d-crosshatch-cell-shape` **23/23**
(36/36 combined) — matches the impl report.

## (2) Mechanism — diff inspected directly, matches the plan's six edits

`diff` of `surface-fill.js` between the two archives shows exactly the plan's §5 Rank-1 edits, at
the same call sites: `CROSS_PAIR_BUDGET=1.1` (shared half-split) → `CROSS_FAMILY_BUDGET=1.0`
(per-family); the new `crossMinPitch`/`crossFloorPitch` cap; `ladderPairWantedPitch` floored by
`Math.max(masterPitch/c, crossFloorPitch(...))`; `dfMaxMul` widened to
`Math.max(1/share, crossFloorPitch/masterPitch)`; `crossShare.delta` threaded through both
`crossShareA`/`crossShareB` call sites. No edit outside these six locations. This is the mechanism
the impl report describes, verified against the actual bytes, not the prose.

## (3) Four plan mutations — M1/M2 reproduced directly, M3/M4 verified structurally

- **M1 (revert engine, keep tests):** reproduced above — 23/91 fail, matches to the digit.
- **M2 (keep per-family budget, disable the cap):** patched a scratch copy so
  `ladderPairWantedPitch` returns `masterPitch / c` unconditionally (cap removed). Measured:
  **cylinder d=220 ink 9046.6 mm, coverage 0.9858**; **sphere d=220 coverage 0.9830**. This is
  within ~1% of the impl's claimed `9136.777 mm` / `0.9867` / `0.9839` — the small residual gap is
  because my minimal patch left `dfMaxMul`'s own (harmless, permissive-only) reference to
  `crossFloorPitch` in place rather than also reverting it — but the qualitative and near-quantitative
  result is unambiguous: without the cap, ink balloons toward the ~9000+ mm / cov ≈0.98–0.99
  saturated regime, reproducing judge C1's rejected-Rank-3 number to within measurement noise.
  **Confirms the cap guards a real mechanism, not a fingerprint.**
- **M3 (cap at 4×inkWidth, over-tight) / M4 (restore the old half-split budget with the cap kept):**
  not independently re-run (time budget), but verified **structurally**: P5b is exactly the
  assertion M3 is designed to fail (ink ≥ shipped v1.4.1 value) and P3a is exactly the assertion M4
  is designed to fail (each family ≥0.85× hatch) — both pass on the real fix (91/91, confirmed
  above), which is the logical converse of M3/M4 failing. This is weaker than direct reproduction
  and is flagged as a minor gap, not a blocker — M1/M2 (the RED proof and the saturation proof, the
  two mutations that matter most) are independently confirmed.

## (4) Per-cell numbers, cap binding, P1–P6

Re-ran the full `scene3d-crosshatch-parity.test.js` fresh (not trusting the impl's own numbers) —
every P1/P2/P3a/P3b/P4/P5a/P5b/P5c/P6 assertion is itself a pinned numeric check against the real
engine, and **91/91 pass**, which independently re-derives every cell in the plan's/impl's tables
to the precision the test pins (hatch counts, A/B ruling counts, ink, coverage, Jay's cell). I did
not hand-recompute the full 13-cell table separately — the test suite **is** that recomputation,
run fresh by me against the actual fix.

**P1/P2/P4/P6 kept verbatim, confirmed by diff, not prose.** `diff` of
`scene3d-crosshatch-parity.test.js` between the two archives shows the `describe('P1...')`,
`describe('P2...')`, `describe('P4...')`, `describe('P6...')` blocks **do not appear in the diff at
all** — byte-identical. Only `describe('P3...')` → `P3a`/`P3b` and the old single `describe('P5...')`
→ `P5a`/`P5b`/`P5c` changed. This directly confirms the "kept verbatim" claim rather than trusting
it.

**Cap binding:** confirmed via the plan's own §2.4 table (cap dormant ≤ d≈140, first-touch at 140,
binds at 170+) and P5c (median gap ≥0.80× `crossMinPitch` where the cap binds) passing at 91/91.

## (5) The two disclosed bar moves — ruled

### (a) `scene3d-crosshatch-cell-shape.test.js` C1/C2/C5 (W-31's ceiling)

Diffed the pinned `CEILING` array directly (ground truth — not the plan's separately-measured
pre-T4 numbers) between the two archives, for all 11 configs:

- **C2 (spread) worsens on exactly 9 of 11 configs**, confirmed by direct arithmetic on the
  before/after `spreadA`/`spreadB` pairs: sphere d=220 (a **and** b) are the two that do NOT
  worsen (both move down slightly: a 15.74/15.87→15.18/15.58, b 15.11/15.19→15.00/14.97); the
  other 9 all show at least one of spreadA/spreadB rising. Three spot-checked deltas match the
  disclosure table to the digit: torus d=220 spreadB **5.90→7.49**, ellipsoid d=220 spreadA
  **12.97→14.70**, cone d=50 spreadB **11.79→16.88**.
- **Stop condition 4 honoured**: these three (and, by extension, the other 6) land exactly at the
  plan's own §3.4 pre-measured numbers (on `426cc5e4`, before T4), not beyond them — confirmed by
  direct digit match, independent of trusting the impl's re-derivation claim.
- **C1 (aspect range) does not regress, confirmed directly from the pinned `cols[].aspect` data**:
  sphere d=50 a range narrows 0.898–1.052 → 0.951–1.032; torus d=220 a narrows 0.872–1.124 →
  0.926–1.100; cone d=220 a narrows (both bounds move inward) 0.600–1.773 → 0.644–1.643. Flat on 4;
  wider on 2 that gained measurable columns (cylinder d=50 a: 2→3 cols, range widens but on more
  data; ellipsoid d=50 a: 3→5 cols, same pattern) — matches the disclosure exactly.
- **C5 (measurability) improves on all 11** — `windows` and `cols[].n` rise everywhere in the
  diffed array (e.g. sphere d=220 a windows 90→110, cone d=50 a windows 9→28).
- **Attribution to W-31b is correct**: `W-31-impl.md` names the mechanism precisely (`probe()`'s
  per-ruling MEAN `mmPerFrac` spent as one scalar step) as a **pre-existing, already-filed** defect,
  not something W-36c introduces — denser families and a larger order-statistic population simply
  make it more visible. **Ruling: ACCEPT** — the re-pin is exactly what the plan predicted, C1 (what
  W-31 actually protects) does not regress net, C5 improves everywhere, and the attribution is
  independently verifiable in W-31's own diff (W-31 shipped zero source diff — `surface-fill.js` is
  untouched by W-31 — so the mechanism genuinely predates W-36c and cannot be this unit's own
  regression).

### (b) `scene3d-curved-density-floor.test.js` — the `2.5→2.0` ceiling + removed sub-check — REFERRED TO THIS REVIEWER (LEDGER row 4)

**The `2.5→2.0` magnitude reduction itself: ACCEPT.** Verified the root-cause claim analytically
from the two formulas (not just re-stated): `c = clamp(ladderCov(I) * crossPairShare(ratio, role),
LADDER_COV_MIN, 1)` clamps to its ceiling `c=1` once `ladderCov(I) >= 1/share`. At role `'b'`,
ratio `0.25`: **old** (`CROSS_PAIR_BUDGET=1.1`, `half=0.55`) → `share = 0.55/0.25 = 2.2` → clamp
bites above `ladderCov(I) ≈ 1/2.2 = 0.4545`; **new** (`CROSS_FAMILY_BUDGET=1.0`) → `share =
1.0/0.25 = 4.0` → clamp bites above `ladderCov(I) ≈ 1/4.0 = 0.25`. This is an exact algebraic
derivation from the shipped constants, matching the disclosed "cov ≈0.45 → cov ≈0.25" claim
precisely, not an approximation. The measured ratio numbers (2.25 @ d=10, 2.542 @ d=100, both
comfortably above the new 2.0 floor — 12.5%/27% headroom) are real margin, not a coin bar.

**The "cannot be gamed by a flat response" claim, as stated, is FALSE — measured by mutation.**
Constructed a scratch mutation of `crossPairShare`'s role-`'b'` branch that freezes the response for
`crossDensityRatio <= 1` (compresses it to a 2%-slope near-constant) while leaving `ratio > 1`
unchanged. Swept `crossFamilyBCount` at d=10/d=100 across the full dial:

| | nB(0.25) | nB(1.0) | nB(2.0) | endpoint ratio (≥2.0 bar) | strict monotonic? | old sub-check (≥2.0×mid) |
|---|---|---|---|---|---|---|
| d=10 | 8 | 7 | 4 | **2.00 — PASSES** | **PASSES** | 1.14 — FAILS |
| d=100 | 55 | 47 | 24 | **2.29 — PASSES** | **PASSES** | 1.17 — FAILS |

This mutation — which makes the dial's **lower half [0.25, 1.0] nearly inert** (a real,
user-visible defect: turning the ratio dial from 0.5 to 1.0 would do almost nothing) — **passes
both of the bars that remain after the sub-check's removal** (the endpoint-ratio bar and strict
monotonicity), and would ship undetected. This is exactly the failure mode the old sub-check
(`nB(0.25) >= 2.0×nB(1)`) existed to catch, and it is not a contrived edge case: the direction of
the freeze (compressing the lower half, expanding the upper half) mirrors the real mechanism's own
asymmetry around ratio=1 (see the coverage-clamp derivation above). A uniformly-flat/constant
response IS caught (it fails both monotonicity and the endpoint ratio) — the claim is accurate only
for that narrower case, not for the general "flat response" framing used to justify the sub-check's
removal.

Separately confirmed the **impl's own claim that the old sub-check is arithmetically dead on the
real fix** — measured on the actual (unmutated) `8adfd5af` source: `nB(0.25)/nB(1.0)` = 1.286
(d=10) / 1.298 (d=100), both well under the removed 2.0× bar — so the sub-check genuinely cannot
pass under W-36c's mechanism, confirming it isn't being discarded for convenience.

**Ruling: ACCEPT the `2.5→2.0` change; ACCEPT-WITH-FOLLOWUP the sub-check removal.** The 2.0 floor
is minimal-and-honest (derived from measurement, not tuned, with real headroom). Removing the old
sub-check without a replacement that carries equivalent magnitude protection in the specific
sub-range it guarded is a genuine, measured loss of guard coverage — not a defect in the shipped
mechanism (which is not flat in either half today), but a real gap in what would catch a *future*
regression shaped like the one demonstrated above. **Follow-up, not a blocker:** re-add a bounded
lower-half sub-check pinned to the real measured shape (e.g. `nB(0.25) >= 1.2×nB(1.0)` — comfortably
under today's measured 1.286/1.298, so not a coin bar) alongside the kept monotonicity check, so a
regression concentrated in one half of the dial is caught again.

## (6) `CROSS_FAMILY_BUDGET=1.0` + `crossMinPitch`/`crossFloorPitch` + widened `dfMaxMul`

`dfMaxMul`'s widening is necessary and correctly justified: without it, the walk's per-step ceiling
(built from family A's own un-widened step size) clamps the wanted pitch straight back down before
`ladderPairWantedPitch`'s cap can ever be spent — the exact trap the file's own W-26b-1 comment
already documents at that line. Confirmed by inspection of the diff (§2 above); not independently
disabled-and-remeasured (time budget), but the logic is a direct, minimal generalisation of the
pre-existing `1/share` term to `Math.max(1/share, cap/masterPitch)` — a textbook "must widen with
whatever actually sets the pitch" fix, not a speculative addition.

**`CROSS_DFMAX_BOOST_CAP=20` stays slack — confirmed, but the disclosed range undersold.**
Instrumented `dfMaxMul`'s raw (pre-final-clamp) value directly (a non-behavior-changing
`console`-style log added to a scratch copy) and swept it across **6 primitives × 8 densities
(1–300) × 5 ratios (0.25–2.0)** = 480 samples. Measured **min 0.25, max 4.35** (worst cell: cone,
d=300, ratio=0.25) — **the safety rail has ~4.6× headroom, not the ~9× implied by the disclosed
"[1.00, ~2.2]" range.** The disclosed range appears to have been measured on a narrower sweep
(likely 4 primitives and/or a narrower density/ratio span, not cone/capsule at d=300 with ratio
0.25). This does not threaten correctness — 4.35 is nowhere near 20 — but the specific magnitude
claim in the impl report and the source comment is measurably wrong by roughly 2×. **Minor
follow-up:** correct the comment's stated range, or re-sweep to the true bound, so a future
tightening of `CROSS_DFMAX_BOOST_CAP` isn't made against an understated headroom figure.

## (7) W-36b bearings, W-33, W-26 gap-jump, plot-safety, T1/T1b/T4 oracles — reproduced

Ran directly against `8adfd5af` (not trusted from the impl report): `scene3d-hatch-density-angle-stable`
(W-36b) **9/9** at the file's own unwidened 3° tolerance, `scene3d-plot-safety` **5/5 (+1 skip)**,
`scene3d-fill-ruling-corners` (W-33) **19/19**, `scene3d-ladder-uniform-field-spacing` (W-26
gap-jump) **9/9** — 42 passed / 1 skipped across the four files, combined in one run. Also ran
`scene3d-mark-laws-draw.test.js` (T1/T1b/T4's `mkTick`/`mkDashRamp` oracles): **30/30**, confirming
byte-identity — none of these is a coin bar; each is a pinned numeric/behavioral assertion
independent of this unit's own new tests, and each is reading real geometry the fix's narrow
`crossShare != null && isEvenLadder()` gating should not (and, per these results, does not) touch.

## (8) Pictures — looked at, native-resolution crops

Read every image directly (not summarized from the impl report):

- **Jay's own cell** (`jays-cell-before.png` / `jays-cell-after.png`): before shows a visibly
  thinner grid; after is visibly denser on both families, resolving to a clean, even diamond mesh —
  directly answers the literal complaint.
- **`sphere__crosshatch__ladder__max__a`**: full-frame and a 4×-upscaled equator crop both show a
  uniform, cleanly resolved diamond grid — both families clearly present, no blobbing. Pole region
  shows the known, separately-filed W-31c chart-knot convergence, out of this unit's scope.
- **`cylinder__crosshatch__ladder__max__a`**: 4×-upscaled wall crop near the limb shows the
  expected W-31 cell-aspect squash (a pre-existing, differently-owned phenomenon) but the grid stays
  legible throughout — no solid block.
- **`capsule__crosshatch__ladder__max__a`** (the tightest coverage cell, cov 0.8298 — the one that
  decides Rank 1 vs Rank 2): 4×-upscaled crop shows small but **clearly discrete, individually
  resolved diamond cells** — dense, but unambiguously a grid, not a filled block. This directly
  confirms P5a's numeric claim with an actual look at the pixels, per protocol.
- **`sphere__crosshatch__ladder__med__a`** vs **`sphere__hatch__ladder__med__a`**: each crosshatch
  family visually reads as carrying a comparable line density to the single hatch family, consistent
  with the ≈2×-hatch-ink claim at this density.

All crops read as claimed: legible resolved grids at `max`, no solid block, both families visible,
consistent with the coverage instrument's own numbers (0.81–0.83 range on the cells inspected).

## (9) Merge note — fill-audit-a3 vs main; F1-placement lands on top

Main's tip is unchanged at `426cc5e4` (the same commit `a3b651f0` branches from) — `fill-audit-a3`
is a clean, linear, unrebased descendant of main; no divergence, no conflict to resolve for this
unit. Per LEDGER row 2, **F1-placement is now in flight on this same worktree/branch, on top of
`8adfd5af`**, continuing the same serialized single-owner-of-`surface-fill.js` convention this lane
has used throughout — no merge action is needed for W-36c specifically; it stacks cleanly as the
next commit in the same lane, and F1-placement inherits it.

## Overall verdict

Mechanism matches the plan exactly (verified by diff, not prose). RED/GREEN reproduced
independently. The naive-parity/saturation mutation (M2) reproduces the ~9000+ mm / cov≈0.98
regime the cap exists to prevent, within measurement noise of the claimed number — the cap guards
a real mechanism. P1/P2/P4/P6 verbatim, confirmed by diff. The W-31 C2 ceiling re-pin is correctly
attributed to the pre-existing, separately-filed W-31b defect and does not net-regress what W-31
protects (C1 flat-to-narrower, C5 improves on all 11) — **ACCEPT**. The `curved-density-floor`
dial-ceiling reduction (2.5→2.0) is honest and minimal — **ACCEPT**; but its accompanying claim that
replacing the removed sub-check with strict monotonicity "cannot be gamed by a flat response" is
**measurably false in the general case** (a mutation freezing exactly the sub-range the old
sub-check protected passes both remaining bars) — **ACCEPT-WITH-FOLLOWUP**, recommend restoring a
bounded lower-half magnitude check. The disclosed `dfMaxMul` safety-rail range understates the true
measured range by roughly 2× (4.35 vs the claimed ~2.2) — still comfortably slack against the 20
cap, a documentation correction rather than a functional issue. No vacuous-pass guards, no
undisclosed bar moves, no single-pipeline/single-zoom evidence, no fingerprint re-pin lacking proof.

Scratch dirs deleted at the end of this review; nothing left in any worktree.
