STATUS: REJECT (mid-ring-break fix is real and should be kept; whole-ring cull must be re-scoped to the crowded zone before this ships — see verdict)

# W-27c-0a iteration 3 — adversarial review 3

Reviewer: Sonnet, read-only in `.claude/worktrees/fill-audit-d`
(`git status --short -- . ':!graphify-out'` empty before/during/after; zero
edits/commits in the worktree — all measurement below is in from-scratch
`git archive` scratch exports at `/private/tmp/claude-501/scratch-W-27c-0a-3/{base,red,green,mutant,floor-check}`,
symlinked to the MAIN repo's `node_modules` — the worktree's own
`node_modules` is empty). Range: `61ff00cb..ec79e2b9` (single commit
`fix(scene3d): W-27c-0a iteration 3 — whole-RING-only crowding cull`).
Responds to the coordinator's mid-task ruling (4 items) in addition to the
original 5-item brief.

## 1. Diff scope

`git diff 61ff00cb..ec79e2b9 --stat`: exactly two files —
`src/core/algorithms/scene3d.js` (+213/-... , two hunks: `@@ -269,58 +269,102
@@`/`@@ -328,53 +372,37 @@` — the crowding-cull mechanism block and its
header comment — and `@@ -4037,20 +4065,36 @@`/`@@ -4059,8 +4103,7 @@` — the
emit-loop wiring) and `tests/unit/scene3d-contour-slice.test.js`. No touches
to `mappers.js`, `surface-fill*.js`, `hlr.js`, `context-bar.js`. **Confirmed clean.**

## 2. Structural oracle (extended micro-gap oracle) — RED/GREEN/mutation

Copied `ec79e2b9`'s test file into a from-scratch `61ff00cb` export and ran
`extended micro-gap oracle` standalone (local `node_modules/.bin/vitest`,
not `npx` — `npx` silently resolved a different global vitest 4.x the first
time and threw a config-format warning; pinned to the workspace's 3.2.6 for
every run below):

- **RED at 61ff00cb**: `expected 1 to be +0` — **exactly** reproduces the
  impl report's own stated RED. Confirmed fresh, from scratch.
- **GREEN at ec79e2b9**: `0` — passes.
- **Mutation** (re-enable chunk/per-point culling): restored the exact
  removed `crowdCullRun`/per-point-suppression mechanism from the
  `61ff00cb..ec79e2b9` diff on top of the `ec79e2b9` tree (own scratch copy,
  `mutant/`), rewired the emit loop to split at each suppression boundary
  instead of dropping the whole ring, reran the same oracle:
  **`expected 11 to be +0` — fails.** The oracle is sensitive to the exact
  failure mode it claims to guard, not vacuously green. **Confirmed.**

## 3. Native-resolution crops — torus med/max, hole + lower band

Cropped `before-789ba0fa/shots/A/torus__contourSlice__ladder__{med,max}__a.webp`
vs `shots/A/...` (the re-shot `ec79e2b9` evidence) at native resolution
(Pillow, no downscaling, 3-5x nearest-neighbour zoom for viewing):

- **Left-saddle apex** (`(140,60)-(330,220)`, 5x): before shows the fused
  wedge tip — several rings merge into one fat, indistinguishable white
  blob at the point. After: individual rings stay visually distinct nearly
  to the tip, taper cleanly, **no notch, no gap, no partial artifact** — the
  intended fix genuinely works here, better than iteration 2's small-but-
  visible notch (per review-2 §1).
- **Lower-front band + left-saddle inner rings** (`(0,140)-(420,399)`, 3x):
  **zero mid-ring breaks** in either image — every ring present in
  `ec79e2b9` is a single continuous line, matching `before`'s character.
  Condition holds: the reopened defect (dashes cut into ring middles) is
  gone.
- No whole-ring dropout in this crop reads as a torn/broken band — the
  rings that remain are evenly spaced and coherent, not a jagged partial
  pattern. **However** (see §5 below): a straight side-by-side count in
  this exact crop shows **4 nested rings in `before` vs 2 in `ec79e2b9`** in
  the lower ellipse — two whole rings are gone from a region with no
  saddle/pole crowding at all.
- `torus__contourSlice__ladder__med__a.webp` and `...max__a.webp` are
  **byte-identical** within both `before-789ba0fa` and `shots/A` (MD5
  confirmed). This is an undisclosed evidence-hygiene gap — the protocol
  requires byte-identical pairs to be explained, and the impl-3 report does
  not mention it (it does not affect my findings below, which hold on
  either file, but should be fixed or explained next iteration).

## 4. O2 sub-bars, independently reproduced at all three shas

Ran the (public-API-only) engine-pipeline O2 test at `789ba0fa`, `61ff00cb`,
`ec79e2b9` each from its own from-scratch export (`ec79e2b9`'s test file
copied onto `789ba0fa` to get RED on that unmodified base, per the report's
own stated method; `61ff00cb`'s own already-existing test file for that sha):

| torus | 789ba0fa (RED) | 61ff00cb (iter2b) | ec79e2b9 (iter3) |
|---|---|---|---|
| pct05 | 2.586% | 0% | 1.068% |
| pct1 | 8.902% | 2.760% | 4.888% |
| waist | 0.0388mm (0.13w) | 0.2493mm (0.83w) | 0.0540mm (0.18w) |
| largestW | 3.35mm | 2.10mm | 2.75mm |
| blobCount | 27 | 12 | 13 |
| totalInk | 932.93mm | 885.08mm (94.9%) | 660.95mm (70.8%, per report — not independently re-measured, trusted, matches the pixel-diff cross-check in §5) |

| sphere | 789ba0fa (RED) | 61ff00cb (iter2b) | ec79e2b9 (iter3) |
|---|---|---|---|
| pct05 | 4.078% | 0.013% | 1.750% |
| pct1 | 13.906% | 4.295% | 7.079% |
| waist | 0.0823mm (0.27w) | 0.2404mm (0.80w) | 0.0823mm (0.27w, **byte-identical to RED**) |
| largestW | 34.50mm | 14.85mm | 19.25mm |
| blobCount | 47 | 54 (regressed) | 24 (genuine improvement) |

**Every number in the impl-3 report matches what I independently measured,
exactly.** Nothing is fabricated or misrepresented. The stop-reported misses
(torus waist, sphere waist, torus largestW, sphere largestW) are honestly
labeled as misses, not dressed up as passes.

**But four of these quantities have ZERO test assertion**, confirmed by
reading the diff and the shipped test file directly: the two
`expect(m.waist).toBeGreaterThanOrEqual(0.8 * penWidth)` lines (torus,
sphere) and the two `expect(m.largestW).toBeLessThan(...)` floor lines
(torus, sphere) that existed in `61ff00cb` were **deleted outright** in
`ec79e2b9` and replaced with a `console.log(...)` STOP-REPORT line and
**no `expect(...)` at all**. This is disclosed in the report's own `##
Bars changed` table ("STOP-REPORT: measured + logged only, no pass/fail
assertion") — the disclosure obligation is met — but the practical result
is these four quantities now have **no regression protection whatsoever**:
a future change could make the torus/sphere waist or largest-blob-width
dramatically worse and no test would ever catch it.

**This is exactly the coordinator's ruling-2 condition.** I verified the
required fix is mechanical and feasible (own scratch copy, not the
worktree): adding
```
expect(m.waist).toBeGreaterThanOrEqual(0.054 * 0.90);   // torus, floor+10%
expect(m.largestW).toBeLessThan(2.75 * 1.10);            // torus, floor+10%
expect(m.waist).toBeGreaterThanOrEqual(0.082 * 0.90);   // sphere, floor+10% (==RED)
expect(m.largestW).toBeLessThan(19.25 * 1.10);           // sphere, floor+10%
```
to the two engine-pipeline O2 tests and reran just that describe block:
**both tests still pass, deterministically, with the current code** — no
mechanism change needed, purely a test-only gap. **Not yet landed in
`ec79e2b9`.**

## 5. Ruling item 3 — is O2(c) "waist" a point or a sustained band?

Read the metric code directly (`tests/unit/scene3d-contour-slice.test.js`,
both the unit-rig `measureO2` and the engine-pipeline `measureRealO2`): both
compute `waist` as `if (d < waist) waist = d` over every same-path,
index-distant (`circDist >= 6`, seam-aware) point pair — **a running
minimum over point pairs, i.e. genuinely a single closest-approach POINT**,
exactly as the impl report's §3 claims.

To answer the ruling's actual question — is the underlying GEOMETRIC
phenomenon a fleeting near-miss or a sustained self-fused corridor — I
wrote a standalone reviewer probe (public-API-only, same
`sceneForPrimitive`/`frontFillsOf` pattern, no debug hook) that restates the
same same-path self-approach as the **longest contiguous index-run** (ring
order, seam-aware) where the self-nearest-distance stays below `1.0 *
penWidth`, and reports its arc length:

| torus | point waist | sustained band (longest) | bands found |
|---|---|---|---|
| 789ba0fa | 0.039mm (0.13w) | **0.635mm (2.12w)** | 31 |
| 61ff00cb | 0.249mm (0.83w) | **0.605mm (2.02w)** | 6 |
| ec79e2b9 | 0.054mm (0.18w) | **0.251mm (0.84w)** | 14 |

| sphere | point waist | sustained band (longest) | bands found |
|---|---|---|---|
| 789ba0fa | 0.082mm (0.27w) | 0.500mm (1.67w) | 14 |
| 61ff00cb | 0.240mm (0.80w) | 0.130mm (0.43w) | 4 |
| ec79e2b9 | 0.082mm (0.27w) | **0.500mm (1.67w) — byte-identical to RED, 16 sig figs** | 6 |

**It is a band, not a point** — at baseline the torus's tightest self-fold
persists over ~2 pen widths, not one glancing sample. Per the ruling's own
branching, this makes waist an unfixed defect that belongs in the OPEN list
for Jay. But the restatement also surfaces something the impl report's
point-only framing obscures: **the torus's sustained band shrank
substantially under iteration 3 (2.02w → 0.84w) even though the
single-point minimum got numerically worse (0.83w → 0.18w)** — iteration 3
is not a pure regression on torus waist, it trades a tighter isolated
touch for a much shorter sustained corridor, which is arguably the more
visually relevant quantity. For the **sphere**, both readings — point AND
band — are **exactly byte-identical to RED**: the whole-ring cull never
touches the specific ring carrying the sphere's worst self-fold (it is not
crowded enough against ANOTHER ring to trip the cross-plane gate, since
this is a same-ring self-fold, not cross-plane crowding — a believable,
structurally-consistent explanation, not a metric artifact). **The sphere
waist is confirmed, unambiguously, an untouched, unfixed defect.**

## 6. Ruling item 4 — does 70.8% ink retention read visibly sparser?

**Yes, and it is not subtle.** Pixel-diffed the full-frame `torus__...med`
capture, `before-789ba0fa` vs `ec79e2b9` (>128 luma threshold): 54,627 ink
px → 42,265 ink px, **ratio 0.774** — consistent with the report's own
70.8% mm-based figure (different measurement basis, same conclusion).

A red/green loss-map (red = ink present in `before`, gone in `ec79e2b9`;
faint blue = unchanged) shows the loss is **not** an even thinning spread
across the whole object — it concentrates in two clearly visible
sub-regions: (1) **the entire lower-front band**, where whole nested
rings — not fragments — are solid red end-to-end, and (2) the **left
saddle's inner nested rings**, several of which are also solid red
end-to-end. A direct native-resolution crop of the lower-ellipse region
confirms this by simple ring-count: **4 nested rings in `before`, 2 in
`ec79e2b9`**, at the exact same crop box. This region has no saddle/pole
crowding — it is the flat, low-curvature bottom of the torus, exactly
where the ring density supplies the visual "shading" gradient. Losing half
its rings reads as a genuinely flatter, less-shaded surface there, not just
"a bit less ink."

The saddle-apex fix itself (§3) is real and clean — no argument there. But
the whole-ring decision is not confined to the crowded zone: it also drops
whole rings in an unrelated, uncrowded region of the same object, which is
exactly the coordinator's own "reckless whole-ring ink loss" concern,
now confirmed visually rather than just as an abstract percentage.

**Per the ruling's own explicit branch: this is REJECT-SCOPE.** The
break-free whole-ring mechanism (§2) should be kept — it is a real,
structurally sound fix for the reopened mid-ring-gap defect and should not
be reverted — but the crowding decision needs to be confined to the actual
crowded zone (saddle/pole, where cross-plane rings are genuinely converging)
rather than applying anywhere a ring's WHOLE unclipped arc happens to graze
another ring's ink, which on this rig also fires in the flat lower band.

## 7. Guards (foreground, one file at a time, own scratch export)

- `tests/unit/scene3d-contour-slice.test.js`: **50/50** — reproduced fresh.
  Includes the W-27c item 0(b) fragment-count ceiling (`<=55`, restored
  from 80 — confirmed present at that exact line, matches the `## Bars
  changed` disclosure), the W-27c item 0(b) draft/full ink-ratio invariant,
  and the W-29 faceted-solid topology tests, all in the same file, all
  green.
- `tests/unit/scene3d-mesh-self-occlusion.test.js`: **5/5**.
- `tests/unit/scene3d-hlr-spatial-index-identity.test.js`: **6/6**.

No regressions, no vacuous passes observed (RED reproduces exactly where
claimed for every oracle checked).

## Verdict: REJECT

Not a revert of the whole-ring mechanism — the mid-ring-break fix (§2, §3)
is real, well-designed, and should be kept as the foundation. Two concrete
blockers, both required before this can land:

1. **Re-scope the crowding cull to the saddle/pole zone** (ruling item 4,
   §6 above) — the whole-ring decision currently fires on any ring whose
   WHOLE unclipped arc grazes another ring's ink anywhere on the object,
   which visibly strips ~half the ring density from the torus's uncrowded
   lower-front band. Keep the ring-level (not point-level) decision; scope
   *where* it is allowed to trigger.
2. **Land the floor+10%-band assertions** for the four currently-unguarded
   O2 quantities (torus waist, torus largestW, sphere waist, sphere
   largestW) — verified mechanical and feasible in §4 above, zero mechanism
   risk, blocks nothing else.

**For Jay, plainly:** the mid-ring dash breaks you flagged on the last
picture are gone — confirmed at full resolution, and a new automated check
now guards against that exact regression coming back. The saddle "eyes"
also look cleaner than before (individual rings stay visible almost to the
tip, no fat merged blob). But fixing the dashes cost more than the saddle
fix needed: the torus's lower band and left-saddle's nested rings now show
visibly *fewer* rings than before — about half, in the region I measured —
even though that part of the torus was never crowded to begin with. And the
sphere's own "waist" self-fold (a separate defect from the dashes) is
completely untouched — byte-identical to the original — so if the sphere
still looks tight-waisted to you, that's expected; this fix never reached
it. Recommend one more pass that confines the ring-dropping to the actual
crowded saddle/pole zones before shipping.

REPORT docs/3d-audit/lane-reports/W-27c-0a-review-3.md
