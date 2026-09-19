# 3D Scene fill audit + stroke-fill handoff continuation — HANDOFF

**Current as of 2026-09-18 (round 4 merge, integration branch `3d-scene/integrate-r4`, v1.4.3).**
Local `main` before this merge was `b43fa4e3` (round 3 closed, v1.4.2) = `origin/main`. Round 4
merged two lanes — `border-4` (W-32r4 + W-32r4b + W-32r4c, refined curved-primitive silhouette
border) and `fill-audit-a4` (T3b, W-36e, F1-count, T2-5, T3c, T2-6, mkTick/mkDashRamp fill
mechanisms) — see `docs/3d-audit/lane-reports/MERGE-plan-r4.md` and `MERGE-impl-r4.md` for the
full unit list, the twelve re-derived `scene3d-mktick-wedge.test.js` goldens, and test counts.
**Not pushed as of the merge commit** — pending merge review (ACCEPT), then orchestrator
fast-forward of `main` and an explicit push instruction, per the standing push rule
(`push = A`: merge → all five `test:ci` suites green → merge review ACCEPT → fast-forward → push).
The per-unit truth is `lane-reports/LEDGER.md`; open items are tracked in `plans.md` → Now / Blocked
on Jay. This paragraph supersedes the 2026-09-06 state below, kept for history.
(`main` HEAD d5af9e30, v1.3.98). All work sits on six `3d-scene/*` branches in worktrees under
`.claude/worktrees/`. The next session resumes with the same work style: orchestrator + Sonnet
implementer → Sonnet adversarial reviewer (+ judge) per unit, evidence in the audit gallery,
orchestrator scrutinises images, commit-then-stop, never push.

## Read this first

1. **The deliverable is the gallery.** `docs/3d-audit/fill-audit/index.html` (untracked in `main`, served at
   `http://localhost:8460/docs/3d-audit/fill-audit/index.html` by `node scripts/dev-server.js 8460`).
   Tabs: **Gallery** (7440 real-app renders: 12 primitives × 8 Types × 49 fill styles × density 1/50/220 ×
   2 camera angles, 800 px, object-only), **Findings** (the Fable audit: 22 defects F-01…F-22, 13
   duplicate clusters C-01…C-13, 24 work items W-01…W-24 in `findings.json` / `worklist.json`),
   **Before / After** (one card per `after/<W-id>/report.json`, byte-identical pairs badged).
   Rebuild after any change, in this order:
   ```
   node scripts/audit/scene3d-assemble.js       --out docs/3d-audit/fill-audit
   node scripts/audit/scene3d-audit-findings.js --out docs/3d-audit/fill-audit
   node scripts/audit/scene3d-before-after.js   --out docs/3d-audit/fill-audit
   ```
   Re-shoot any subset from any worktree/commit without touching main:
   ```
   node scripts/audit/scene3d-capture.js --tier A|B --root <worktree or git-archive export> --port <free> \
     --only '^(sphere|torus)__hatch__ladder__(low|med|max)__a$' --out docs/3d-audit/fill-audit/after/<W-id>
   ```
   Add `--rig addLayer` (default `create`, byte-identical) to build the object from the plain
   `engine.addLayer('scene3d')` deserialization-defaults path every ribbon-lane unit test uses instead of
   the "Add primitive" shelf's `PRIMITIVE_CREATE_DEFAULTS` rig — see GH-2 and `after/F1-erode/report.json`'s
   `gallery_capture_finding` for why some fixes need it to show up in the gallery at all (`--rig addLayer`
   shots/manifests get an `__addlayer` suffix / `.addlayer.jsonl`, so they never collide with the default rig).
   `shots/` (373 MB) and `after/*/shots` are NOT committed; the manifests, `report.json`s, findings and
   `index.html` are.
2. **Two user rules are binding, verbatim.** (a) "ladder, fine ladder, and contour must not have irregular
   gaps unless they're required to create a perceptual gradient of light and shadow" — that is W-26, the
   most important open item; root cause and plan in `docs/3d-audit/plan-W26-W27.md`. (b) contour lines
   "should not have angles in them … rounding … should not be turned off by default" — W-27/W-27b, landed.
3. **Harness-clean is not app-clean** still applies: every unit closes with a real screenshot the
   orchestrator looked at. Two "fixes" this round passed their tests and were rejected on the picture
   (W-10 first pass, W-27 first pass); one (Unit D) went three iterations before a judge measured the
   patch as genuinely denser.
4. **Evidence rules:** one pipeline, one zoom (`FIXED_ZOOM = 3.6`, dsf 2), object-only, before and after
   from the same capture script; a byte-identical pair means the fix did nothing there and must be
   explained in `report.json`.

## Branch / worktree map (ports were the dev servers used; any free port works)

| Worktree (`.claude/worktrees/`) | Branch | HEAD | Contents |
|---|---|---|---|
| handoff-c (:8470) | 3d-scene/handoff-c | 79c98ca8 | Unit C closed, Unit D (3 iterations) landed, A2 landed (KEEP) |
| handoff-b (:8471) | 3d-scene/handoff-b | 9b2a33bb | Unit A stop-report (5 intentionally-red tests), Unit E accepted, Unit F measured |
| fill-audit (:8476) | 3d-scene/fill-audit | 58f00fc3 (WIP) | W-02, W-03, W-21, drift guard, freeze, W-15 (measure), W-15b measured, **W-15c WIP** |
| fill-audit-a (:8475) | 3d-scene/fill-audit-a | c861bf97 (WIP) | W-01, W-05, W-06, W-07, **W-01 M1 WIP** |
| fill-audit-c (:8477) | 3d-scene/fill-audit-c | 441af81f (WIP) | W-10, W-10b, W-19, W-20, **W-10c WIP** |
| fill-audit-d (:8481) | 3d-scene/fill-audit-d | 2dc7b3aa (WIP) | W-27, W-27b, W-25/W-28 landed, **W-27c WIP** |

Version-bump hook cannot fire from a worktree — every branch is still v1.3.98; bump once at merge.

## Lanes — what landed, verdicts, what is open

Legend: **DONE** = implemented + adversarial review accepted; **DONE/FU** = accepted with follow-ups (listed in
`docs/3d-audit/STILL-OPEN.md`); **MEASURED** = honest stop-report, no fix shipped; **WIP** = unverified checkpoint
commit made at the session limit (agent died mid-unit; tests may be red — finish or revert first).

| Lane / branch | Commits (oldest → newest) | Item | Status |
|---|---|---|---|
| handoff-c | a65428e9, 03b0bef3 | Unit C shadow-overlap darkening | DONE (mutation proof, 3.06x in-app) |
| handoff-c | abeacdff, 2893d842, 1e9c96a4, 19b48789 | Unit D shadows onto other objects — flag `shadow.shadowReceiveOnObjects` (default OFF), UI toggle "Shadows land on objects", crisp projected footprint on flat receivers | DONE/FU (judge measured 1.45x denser inside footprint; inside hatch family reads as broken dashes → phase-align; dense-scene perf 4.3x) |
| handoff-c | 79c98ca8 | Unit A2 torus self-occlusion → analytic field (authoritative) | KEEP (reviewer) — did NOT fix the streaks; refutes Unit A's hypothesis |
| handoff-b | 25e76b65 | Unit A F1 streaks | MEASURED — 5 intentionally RED tests in `scene3d-ribbon-f1b-streaks.test.js` |
| handoff-b | 66b05aa3 | Unit E expand fidelity | DONE (does not reproduce; oracle proven mutation-sensitive) |
| handoff-b | 1efcd985, 9b2a33bb | Unit F imported-mesh red-line | MEASURED — hatch/contour 0 survivors; spiral 1 survivor RED by design (root cause later disproven by W-25) |
| fill-audit | 5d32e12e, b397cdb3 | W-02 gate every style off none/wireframe/contourSlice | DONE/FU (worklist text mismatch: row is absent, not greyed) |
| fill-audit | 3ce569c4, ae624b9c | W-03 hide 45 styles on spiral/stipple (until W-13 wires width) | DONE |
| fill-audit | c6938400, 8ad282d7, d8066b3f | W-21 buckyball contour rings + `SURFACE_FILL` single literal + drift guard | DONE/FU |
| fill-audit | f37dcfdf, a83fae78, 5ebccf7c | W-15 / W-15b faceted density (plane 3 rulings at d=50) + frozen export + floor comment | MEASURED ×3 designs (A/B/… all invert O20/O9) — F-14 still OPEN |
| fill-audit | 58f00fc3 | W-15c design C (uniform density term) | **WIP** |
| fill-audit-a | 16c197d7 | W-01 curved density 1–49 now varies | DONE/FU — MUST-FIX M1 torus/hatch/ladder tie d=1 vs 25 |
| fill-audit-a | 44db27a4 | W-05 mkTick | DONE (test bar 200 vs spec 1500) |
| fill-audit-a | 5641e2bd | W-06 mkDashRamp | DONE/FU — **max density changed 2995→529 mm ink; needs Jay's sign-off** |
| fill-audit-a | 912f8471 | W-07 deepFillTSP | DONE/FU — visual effect ~2%; reopen as W-07b with the worklist oracle |
| fill-audit-a | c861bf97 | W-01 M1/M2 | **WIP** |
| fill-audit-c | e757db68, 78bbf3e8 | W-10 / W-10b originSpiral floor 0.5→0.8×pen | DONE/FU — 10% of torus/cone turns still < 1 pen |
| fill-audit-c | 03783afe, 7c1d3505 | W-19 defectSplit (+ edgeAt bug: first evidence was the collapsed state) | DONE/FU — etfKang OPEN |
| fill-audit-c | 7d69292c, 6642c4f4, 219c3034, 4a7a1691 | W-20 dutyConst gradient (+turingStripe partial) | DONE/FU — turingStripe OPEN |
| fill-audit-c | 441af81f | W-10c tone-by-omission | **WIP** |
| fill-audit-d | 2a44afc0, 18e5a097 | W-27 / W-27b contourSlice rings on the true surface (sphere circles) | DONE/FU — cone apex rings, rotated-ellipsoid accuracy 0.309 mm, cone/cyl/torus assertions |
| fill-audit-d | 55ddb720 | W-28 imported meshes cap-limited in picker | DONE/FU (face-count threshold would be better) |
| fill-audit-d | 44797f53 | W-25 spiral min-turns floor on thin cusp faces | DONE/FU — floor also engages on default buckyball (own or retune) |
| fill-audit-d | 2dc7b3aa | W-27c | **WIP** |
| main (untracked → committed at wrap-up) | — | gallery, findings, worklist, evidence report.json, scripts/audit, this doc | — |

## Queue for the next session (same style, same lanes), in priority order

1. **Finish or revert the four WIP checkpoints** (fill-audit 58f00fc3, fill-audit-a c861bf97, fill-audit-c 441af81f,
   fill-audit-d 2dc7b3aa): run the lane's targeted tests first; if red and not quickly fixable, `git revert` the WIP commit.
2. **W-27c item 1**: on an idle machine, `npm run test:unit && npm run test:integration` at fill-audit-d — name the
   "contourSlice x-ray" failure the W-25 agent saw (never reproduced under load).
   **W-27c item 0 (user, `user-reports/11.png`, torus contourSlice after W-27b — "MUCH better" but):** two residual
   defects on the torus: (a) **angled points** — the inner-hole rings still show corners where they meet the hole's
   near/far cusp (the ring is refined to the true surface but the HLR clip cuts it into segments whose ends meet at
   an angle, and the innermost rings near the saddle still have visible vertices); (b) **micro-gaps** — short breaks
   in the rings around the hole and a small gap in the lower-left ring (circled). Both are HLR-clip artefacts on the
   refined ring, not tessellation: check `SLICE_CLIP_WORK`/clip sampling on the denser ring, collinear-segment merging
   after the clip, and whether the analytic projection moves a point across the occluder boundary so a visible run is
   split. Acceptance: no visible gap under 1 pen in any ring outside genuine occlusion, and no corner sharper than 8°
   anywhere on the torus rings, verified on the re-shot image.
   **W-29 (user, `user-reports/12.png`, solid/buckyball contourSlice, present before AND after — byte-identical, so
   pre-existing):** one slice ring near the top has an OPEN END — a line that stops mid-face instead of closing or
   meeting the silhouette. A slice ring on a closed faceted solid must always be a closed loop or terminate exactly on
   an occlusion/silhouette edge. Likely cause: `buildSliceSegments` linking (scene3d.js ~135–168/3395–3402) dropping a
   segment when the plane passes through a mesh vertex/edge (degenerate crossing counted once), or the HLR clip
   consuming the closing segment. RGR: on the default buckyball at sliceCount 26, every emitted ring is either closed
   (first≈last within 0.01 mm) or both endpoints lie on a silhouette/occluder boundary; RED on the ring in the
   screenshot. Lane fill-audit-d (slices code), independent of the analytic-projection work (faceted solids are excluded
   from refinement).
3. **W-26 (user rule, P0)**: continuous ladder placement so gaps carry tone only — plan in `plan-W26-W27.md`; lane
   fill-audit-a after W-01 M1. Touches `surface-fill.js` dispatch/emitContFamily only; never the master grid.
4. **A3** (user's "not close to zero yet"): PenFill/boolean-erosion dropped geometry — brief in STILL-OPEN; lane handoff-c.
5. **W-15c** (F-14 plane 3 rulings at d=50) — design C brief in STILL-OPEN; lane fill-audit.
6. **W-05b mkTick (user request 2026-09-05, see `user-reports/8.png` = cone/hatch/mkTick before vs W-05 after):**
   ticks must have VARIABLE LENGTH and must fill the form — the tick field must cover the whole shaded surface as a
   continuous texture whose tick length (and density) carries the tone; the only gaps allowed are where highlights
   are. Today's W-05 output leaves large un-ticked bands between rows and a hard-edged tick region on the cone.
   Lane fill-audit-a (surface-fill.js `MK.tick` sink). RGR: coverage of the lit-but-not-highlight surface ≥ 0.9 of the
   silhouette area at d=50, tick length monotone with darkness (≥3x range light→dark), no un-ticked band wider
   than 2× the row pitch outside the highlight zone; sphere/torus/cone × hatch/contour; byte-identity for every
   other law. Re-shoot cone/hatch/mkTick low/med/max and LOOK.
   **Also in W-05b (user, `user-reports/9.png` = torus contour/crosshatch mkTick after W-05):** ticks must be allowed
   to CURVE — follow the surface's ruling/contour direction as short arcs rather than straight chords — so the
   torus does not render as fans of straight spokes and dense straight-line blocks ("bizarre fills"). Tick
   direction should be tangent to the local family, tick curvature from the surface, and the tick field must read
   as one coherent texture across the torus, not per-patch fans.
6b. **W-06b mkDashRamp low density (user, `user-reports/10.png` = sphere/hatch/mkDashRamp low before vs W-06 after):**
   the W-06 after draws ONE dash on the whole sphere at d=1 — "from a design perspective not helpful". Low density must
   still read as a sparse but complete dash texture over the shaded surface (≥ ~40 dashes on a 40 mm sphere at d=1,
   monotone up to med), never a single stroke; the before (row-wide tiles) was also wrong — the target is discrete
   dashes riding rulings at every density. Lane fill-audit-a; extend `scene3d-mark-laws-draw.test.js`. Re-shoot
   sphere/torus × hatch × mkDashRamp × low/med/max and LOOK. (Ties to the open W-06 max-density sign-off.)
7. **W-07b, W-10c, W-27c items 2–4, W-06 sign-off, W-25 floor scope, W-28 face-count threshold, Unit D phase alignment.**
8. **Slider collapses W-22/W-23/W-24 + W-18** (the audit's 13 duplicate clusters → ~24-law roster): one lane, serial,
   after the P0/P1 items — the biggest product win still untouched.
11. **W-31 (USER 2026-09-06, `user-reports/13-w26-judge-montage.webp`)** — lane fill-audit-a. Verbatim: *"I'm
   unclear on why some of these sections have diamond/square gaps and some have rectangular gaps - are lines
   not being evenly spaced? The only reason there should be greater amounts of space in some areas is if we're
   trying to represent highlights on a shape (less ink = more light)"*. **Generalises the P0 ladder-gap rule to
   crosshatch CELL SHAPE**: both families evenly spaced except where tone demands. Re-measure on `0930cb2d` —
   W-26b-1 changed the crossing family's coverage share after that montage was shot.
12. **W-32 (USER, `user-reports/14-w26-capsule-cone-cylinder-spiral.png`)** — lane fill-audit-a (or `hlr.js`,
   decide at planning). Verbatim: *"Some of these lines are breaking out beyond the border."* Silhouette
   overshoot on capsule/cone/cylinder/spiral. **RGR: no ruling endpoint outside the silhouette by > 0.5 pen.**
   `scene3d-fill-boundary-ends` passed 41/41 through W-26, so first establish whether it measures overshoot.
13. **W-33 (USER, same image as W-32)** — lane fill-audit-a. Verbatim: *"I'm observing some non-curved angles
   here"*. **The contour-rounding rule (2b) applies to contour FILL rulings, not only contourSlice** — a scope
   extension of an existing binding rule. Check the `fillCurves`/fitter gate for fill rulings, plus the capsule
   cap and cone base polylines.
14. **W-34 (USER, `user-reports/15-w27c-contourslice.png`)** — lane fill-audit-d. Verbatim: *"There are some
   angles in this curved shape that should not be there."* **Extends W-27c item (b)** and lands on the
   cone-apex dispute (withdrawn 39.8° vs agreed 7.09°). **Bar ≤ 8°**, and the metric must be
   open-polyline-aware — a wrapped closed-ring metric invents phantom corners.
15. **W-35 (USER, same image as W-34)** — lane fill-audit-d + `scene3d/params.js` + `context-bar.js`
   (cross-lane). Verbatim: *"You can observe some minor imperfections where line segments end, creating
   stairstepping. If this is to minimize overlap to prevent bleedthrough, perhaps having a parameter we can
   control for this would make the most sense? Increasing allows for subtly more overlaps and preserves outer
   edge fidelit?"* **A product request**: a user-controllable **end-overlap / edge-fidelity** parameter — higher
   = subtly more overlap at the silhouette and better outer-edge fidelity, lower = less bleed-through. Needs a
   param + context-bar control + preset default, so it carries the full docs contract. Jay names the trade-off
   himself, so this exposes an existing tension rather than fixing a bug.

9. Reviewer/judge every landing; re-shoot evidence into `after/<W-id>/`; rebuild the gallery; update STILL-OPEN.
10. Merge (see checklist below) only when the queue is exhausted or Jay says so.

## Process that earned its keep this round

- **Every unit: implementer → adversarial reviewer → (judge) → orchestrator looks at the image.** Reviewers
  reproduce the red proof by reverse-applying the diff in a scratch export (`git archive <sha> | tar -x`,
  symlink `node_modules`) — never by editing the worktree.
- **Serialize by file.** `surface-fill.js` (fill-audit-a), `surface-fill-mono.js` (fill-audit-c),
  `scene3d.js` faceted path + `context-bar.js` (fill-audit), `hlr.js`/`shadows.js` (handoff-c),
  `mappers.js`/slices (fill-audit-d). Reviewers are read-only and may overlap an implementer in the same
  worktree; two implementers never share one.
- **Stop-and-report beats a fudge.** Units A, E, F, W-15 and W-19 (etfKang) all shipped honest measurement
  instead of a widened tolerance; each one moved the work forward.
- **Rate limits.** Sonnet was throttled server-side for hours; agents die mid-step and must be resumed with
  `SendMessage` (they keep their transcript). One agent died between `git stash` and `git stash pop`
  — check `git stash list` in every worktree before assuming a tree is clean. Avoid stash-based red
  proofs; use scratch exports.
- **The impeccable design hook** flags `scripts/audit/scene3d-audit-findings.js` (side-tab borders,
  `new Image()` decoder) on every stop — internal audit report, false positives, leave it.

## Resume checklist for the next session

1. `git worktree list`; `git -C <each worktree> status --short -- . ':!graphify-out'` and `git stash list`.
2. Start `node scripts/dev-server.js 8460` in main; open the gallery; read the Findings + Before/After tabs.
3. Read `docs/3d-audit/STILL-OPEN.md` (the open-item ledger) and `docs/3d-audit/plan-W26-W27.md`.
4. Continue the queue in §Status, same lanes, same process. Merge only when the queue is exhausted or the
   user says so: integration branch off `main`, merge handoff-c → handoff-b → fill-audit → fill-audit-a →
   fill-audit-c → fill-audit-d, resolve `scene3d.js`/`context-bar.js`/`surface-fill.js` overlaps,
   `npm run test:ci`, reconcile intentionally-red tests, bump version + `version:sync`, CHANGELOG/plans/
   README, commit, STOP.

## ROUND 4 PAUSE POINT (2026-09-18) — READ THIS FIRST

**Jay paused to clear context AFTER the round-4 merge landed. Round 4's work is COMPLETE, REVIEWED AND
MERGED** — what remains is his two open answers and round 5. This block is self-contained.

### (a) Where `main` is

⚠ **SUPERSEDED BY (c): `main` = `7965abd8` (v1.4.3), pushed.** Previously **`b43fa4e3` (v1.4.2)**, also pushed. Round 3 merged at `d3b01d28`
and was pushed on Jay's standing answer **push = A** (86 commits, rounds 2 + 3). **Round 4's lane work is MERGED at `7965abd8` (v1.4.3) and PUSHED — see (c).**

### (b) The two round-4 lanes — BOTH FINAL, ALL UNITS REVIEWED OR VERIFIED

| lane | branch | FINAL HEAD | contents |
|---|---|---|---|
| `fill-audit-a4` | `3d-scene/fill-audit-a4` | **`0f420747`** | **T3b `e60d102e`** · **W-36e `a5d8a1be`** · **F1-count `7ef20455`** · **T2-5 `75777240`** · **T3c `f0b0b0c8`** · **T2-6 `0f420747`** |
| `border-4` | `3d-scene/border-4` | **tip** | **W-32r4 `76a77f22`** + **W-32r4b** + **W-32r4c** — reviewed **ACCEPT** |

⚠⚠ **DO NOT MISREAD T2-6's COMMIT: `0f420747` is titled `wip … checkpoint` because the orchestrator created
it during Incident 15 — but it IS THE REVIEWED UNIT.** The implementer verified after the checkpoint, added
nothing, and the reviewer accepted that content. **It is not an unverified WIP; do not revert it.**

**Both lane HEADs are now MERGED into `main` (see (c)); the `-a4` and `border-4` worktrees are HISTORICAL — round 5 branches off `main`.**

### (c) THE MERGE — LANDED

✅ **MERGE r4: LANDED at `7965abd8` (v1.4.3) · PUSHED: YES.** The merge of **`3d-scene/integrate-r4` @ `e05cd36a`**
on top of the docs commit **`6678a0f1`**, on Jay's standing answer **push = A**. **Gallery rebuilt on `main`.**
**Merge review `MERGE-review-r4.md`: ACCEPT-WITH-FOLLOWUPS — all claims reproduced**, and the README
older-releases duplication it found was **fixed in `e05cd36a`** before the fast-forward.

**Merge commits: `37a1de4e` · `97ad4ad9` · `d301f11f` · `49af44d9` (v1.4.3). 13 goldens re-derived on the
merged tree; all five suites green or at baseline; two deviations disclosed and accepted.**

**Executed from `lane-reports/MERGE-plan-r4.md` in `.claude/worktrees/integrate-r4`, branch
`3d-scene/integrate-r4`, off `b43fa4e3`.** **The one measured conflict was the `scene3d-mktick-wedge`
goldens, re-pinned on BOTH lanes for unrelated correct reasons** — `border-4` because the refined edge moved
them, `fill-audit-a4` because T2-3's mechanism family owns that file. ⚠ **It was SEMANTIC, not textual: two
CORRECT re-pins of the same hashes, where taking either side alone is wrong** — so the **twelve goldens were
RE-DERIVED on the merged tree with their contrast mutations re-run**, not resolved by choosing a side.
Everything else was disjoint by file (`scene3d.js` vs `surface-fill.js`).

⚠ **Still owed by the NEXT merge, neither of them a unit: checklist item 23** (the `git show HEAD:` sweep —
**hunting BROKEN instances as well as always-passing ones, after one was found failing at its own landing
commit**) **and item 30** (ground-plane inclusion across every ink number). **Both cheap, neither optional.**

### (d) OPEN FOR JAY — Decision Desk

**https://claude.ai/code/artifact/811ab725-f61c-4664-bdb6-2780bd4ba56d** — read with
**`read_db` on collection `decisions`, docs `d11b` and `eye_t26`**, then **TRANSCRIBE into SESSION-SUMMARY
§4, which remains the AUTHORITATIVE record** (the desk is where he answers; §4 is where the answer binds).

1. **Decision 11-amended** — his answer to 11 was (B) "retune the cap's onset", and **a scout proved NO
   SETTING EXISTS**: every retune breaks the 0.85 coverage calibrator and cylinder never reaches 1.2× tone
   authority at d=220. **(A) accept the cap as inherent / (B) fund a different mechanism — tone on crosshatch
   ANGLE or PEN WEIGHT at d=220.** **He is not being asked the same question twice: the onset is not the
   lever.**
2. **The T2-6 EYE CHECK** (`cone/hatch` whole cell + native crop, **and `sphere/hatch`**). **Clause (a) is
   "DELIVERED PER BARS, PENDING JAY'S EYE": the ticks DO grade within bands, but stair-stepped comb edges,
   bracket-like shapes and fragments near the highlight remain, and the reviewer found a NEW rung-shaped
   artefact on `sphere/hatch`.** **His answer decides whether T2 CLOSES or T2-7 is planned** — and **T2-6b
   (the rung artefact) is a CANDIDATE, not a row, for the same reason.**

### (e) Round-5 candidates

**SESSION-SUMMARY §3 has the table.** In short: **T2-6b / T2-7** *(pending the eye check)* · **the T3c onset
re-derive — the true cliff is d≈32, not the shipped 35** · **T2-4** *(d=220 mkTick coverage; a `MIN_MARK_MM`
limit, and MEASURED is an acceptable outcome)* · **T2-3d** *(closed unbuilt by decision 13 = A)* · **T2-3e**
*(the row lattice — pre-existing, measured, already disclosed in Jay's T2 row)* · **the W-36f mechanism**
*(only if 11-amended = B)* · **W-07b** · unscheduled (W-33's fitter follow-up, `insetMultiPolygon` ladder,
the W-29 stub family, U10–U12 which stay W-26-blocked).

### (f) Process — binding, unchanged

- **Jay's SCALE-DOWN regime (2026-09-15):** tests-only units get a **light VERIFY pass** (RED reproduces,
  mutation trips, `## Bars changed` accurate) and are marked **VERIFIED**, not reviewed · **secretary flags
  only for units that change `src/`, capped at SIX** · **no planner unless a unit was REJECTED or its
  mechanism is UNKNOWN** · **no evidence-integrity side units unless a mismatch blocks a decision** ·
  **SCOUTS STAY — they closed three items outright across two rounds and deleted a wrong answer before a
  planner could chase it.**
- **`lane-reports/ROUND3-RESUME-BRIEFS.md` §0 is THE BINDING CHECKLIST — paste it VERBATIM into every
  brief** (which half of the bar you gate, **mutation proof BLOCKING** · sweep coverage as a fraction of the
  roster · **state the FIXTURE behind every number — rig, camera, density, non-default params, and whether
  GROUND-PLANE INK is included** · check each pin's FIXTURE not just the law name · say so when you turn
  another unit's test green or inherit its red · `## Bars changed` **including population and fixture
  changes**). **§0b is the slow-file list.**
- **Standing rulings added in round 4:** **an edge-geometry change must run EVERY pinned-golden file over
  curved primitives before commit — GREP, DON'T RECALL** *(this cost a full REJECT on a unit whose mechanism
  was correct)* · **a present report is NOT evidence of a landed unit — check the sha, not the STATUS line**
  *(Incident 15)* · **a fix whose defect no bar measures ships its instrument IN THE SAME UNIT.**
- **SLOW FILES:** `scene3d-tone-law-collapse.test.js` measures **390–1046 s** and **exceeds the Bash tool's
  600 s maximum** — expect the tool to background it and read the completion notification. **That exemption
  covers ONLY the named slow test files; nothing else may be backgrounded.**
- **INCIDENTS 8–15** (2026-09-11 → 18): eight kills, including the first **weekly** cap (~2 days) and ones
  that hit the merge implementer and the secretary. ⚠ **Nothing was ever lost.** **The on-disk record was the
  recovery mechanism every single time** — which is why the ledger is checkpointed to `main`. **Resume killed
  agents with `SendMessage`; checkpoint any mid-unit tree as `wip(...) (unverified)` and make the next agent
  VERIFY-OR-REVERT it.** ⚠ **Orphaned dev servers on scratch ports are the largest cleanup cost of an
  incident — kill them.**

### (g) Resume prompt for the next orchestrator (paste verbatim)

> Resume the 3D fill audit at the ROUND 4 PAUSE POINT. **Round 4 is COMPLETE, REVIEWED AND MERGED: `main` is `7965abd8` (v1.4.3), pushed, gallery rebuilt. Nothing is mid-flight.** Read, in order: `docs/3d-audit/fill-audit-handoff.md` (this pause block), `docs/3d-audit/lane-reports/SESSION-SUMMARY.md` (**§1** what landed in round 4, **§2c** the round-4 handoff block, **§3** the round-5 candidates, **§4** the decisions — **TWO ARE OPEN**, **§6** the merge record), `docs/3d-audit/lane-reports/LEDGER.md` (the **Round 4** section and queue, the standing rulings, and the MERGE CHECKLIST — **items 23 and 30 are still owed**), `docs/3d-audit/STILL-OPEN.md`, `docs/3d-audit/lane-reports/AGENT-PROTOCOL.md`, and **`docs/3d-audit/lane-reports/ROUND3-RESUME-BRIEFS.md` §0 and §0b — paste §0 verbatim into every brief.** **FIRST ACTION: read the Decision Desk (https://claude.ai/code/artifact/811ab725-f61c-4664-bdb6-2780bd4ba56d) with `read_db` on collection `decisions`, docs `d11b` and `eye_t26`, and TRANSCRIBE the answers into SESSION-SUMMARY §4, which stays the AUTHORITATIVE record.** **Then run round 5 per §3.** ⚠ **Do not start T2-6b, T2-7 or the W-36f mechanism until the relevant answer is in** — the T2-6 eye check decides whether T2 CLOSES or T2-7 is planned, and decision 11-amended decides whether a cap mechanism exists at all. **Branch round-5 lanes off `main`; the `-a4` / `border-4` worktrees are HISTORICAL.** Same roles and models — lane secretary first, then Sonnet implementers → Sonnet adversarial reviewers → Opus planners only where earned — **under Jay's scaled-down regime: tests-only units get a light VERIFY pass, no planner unless a unit was rejected or its mechanism is unknown, secretary flags only for `src/` units and capped at six, and scouts stay.** **Kill any stale dev server on a lane or scratch port before starting; serve `main` on 8460 for the gallery; run every vitest file in the FOREGROUND with `timeout: 600000`.** Commit per unit in the lane worktree. **Never push a lane branch.**

---

## ROUND 3 CLOSED (2026-09-17) — merged at `d3b01d28`, v1.4.2, ✅ **PUSHED** — read this first

**Round 3 ran 2026-09-10 → 17 across five `-3` worktrees off `main` `426cc5e4`** (paused by Jay on 09-12,
resumed the same day). **Every unit on the stop line is landed-or-measured; the merge measured ZERO conflicts;
all five `test:ci` suites are green; the gallery is rebuilt.** **Integration branch `3d-scene/integrate-r3`,
integration commit `d3b01d28`, `main` fast-forwarded onto it.** Merge review **ACCEPT-WITH-FOLLOWUPS**
(`lane-reports/MERGE-review-r3.md`). ✅✅ **PUSHED 2026-09-17 on Jay's decision `push = A`: `origin/main` = `main` = `b43fa4e3`, 86 commits covering
rounds 2 AND 3.** **After three rounds of local-only work, this audit is on the remote.**

**Merged lane HEADs:** `fill-audit-a3` `7375918c` · `fill-collapse-3` `28cc745d` · `fill-audit-3` `141ed0b5`.
**`fill-audit-d3` and `handoff-c3` were never written to** — W-37 and the HLR sub-pen unit both closed
MEASURED by read-only passes. **Already on `main` separately:** GH-2 `6ffaf9c6` (the `--rig addLayer` capture
tier) and the docs checkpoint `06c46203`. **The five `-3` worktrees are HISTORICAL; round 4 branches off
`main`.**

**What shipped, by theme:** **F1 is delivered but NOT closed** — placement `cd541f87` (MEASURED), erode
`e2c3ca85`, amp `3bc61c32`: the streak is gone (deep-blank **3.02/4.00/1.79 → 0.03/0.00/0.00 mm²**) and the
weave runs continuously around the torus, **but the wave laws read THINNER than pre-fix** → decision 10.
**Jay's decisions 1 and 6 closed early** (T4, W-36c), with T4b/T4c/W-36d/W-36e adding the CI guards they
shipped without. **The mkTick family took three attempts** — T2-1 and T2-2 both REJECTED and REVERTED; T2-3
fixed the wedge; **T2-3b found a real TONE ERROR behind the contour banding** (`lenChan` clamping `P` without
re-solving `L` — up to 25 % of asked ink undelivered across the midtone, for every length-channel law,
pre-dating T2-3); T2-3c cleared the stray stroke that fix exposed. **Two items closed with NO unit** (W-37,
W-35b), both by read-only scouts. **W-31b is MEASURED-with-guards, not fixed:** three attempts have failed to
find a placement mechanism for Jay's report-13 crosshatch cells and two ranks are marked never-retry — **the
cells can no longer silently get worse; they are not yet even.**

⚠ **THREE BARS WERE RE-PINNED AT THE MERGE, all disclosed:** `scene3d-facet-min-rulings` (12 hashes, from
W-36c) · `scene3d-one-pen-down-reachability` (×4 → ×6, F1 chain) · **`scene3d-self-crossing-tone` (1.4 → 1.3,
F1 chain) — a RIBBON-WEIGHT number in all but name that moved DOWNWARD, i.e. decision 10's thinning showing up
in a pre-existing INDEPENDENT guard.** **Both prior rounds' worst defects were also found by the merge, not by
a lane.**

**FIVE OPEN DECISIONS FOR JAY. ✅ Answers live on the DECISION DESK —
https://claude.ai/code/artifact/811ab725-f61c-4664-bdb6-2780bd4ba56d — which is db-backed and REPLACES the old
page that could not save. The orchestrator reads it via `read_db` and TRANSCRIBES answers into SESSION-SUMMARY
§4. ⚠ §4 REMAINS THE AUTHORITATIVE RECORD: the desk is where Jay answers, §4 is where the answer binds —
reconcile the desk against §4, never the reverse.**
1. **§4 decision 9 AMENDMENT** — W-32 was closed "for now" on a 0.50-pen bar; **the ellipsoid measures 0.72
   pen**, a primitive W-32 never swept. Accept, or reopen Rank 4? *(A conditional design is already written.)*
2. **§4 decision 10 — READY, packet complete.** Accept the thinner even style (A), or fund **F1-weight** (B)?
   **Nothing shipped moves ribbon weight today.**
3. **§4 decision 11** — the anti-saturation cap he asked for **voids tone authority at Density 220**. Accept
   (A) or retune the onset (B)? **A CHANGELOG line discloses it either way.**
4. **§4 decision 12** — mkDashRamp dashes are **multi-pass bands** (T4's mechanism, his own decision 1 = B);
   at d=1 they read as thick tiles. Accept (A), or **T3b** (B)?
5. **§4 decision 13** — the moiré fix **costs tick-length range** (3.0–4.3× → 2.3–3.2×, still monotone).
   Accept (A), or fund **T2-3d** to recover ≥3× via row pitch (B)?

**ROUND-4 CARRY-OVERS, all with briefs or measured starting points already written:** **F1-count** (the
fill-depth swallowed-failure counter — the fix landed, the blindness did not) · **W-36e** (the crosshatch
dial's interior blind spot; **its bar must be ink/budget-based or d ≥ 10**) · **T2-4** (d=220 mkTick coverage;
**MEASURED is an acceptable outcome**) · **T2-3d** (gated on decision 13) · **T2-3e** (the row-lattice pattern
— pre-existing, measured, disclosed in Jay's T2 row) · **W-07b** and the unscheduled list (W-33's fitter
follow-up, W-32 Rank 4, `insetMultiPolygon` ladder, the W-29 stub family, U10–U12 which stay W-26-blocked).

**PROCESS THAT BINDS ROUND 4 — read before staffing anything:**
- **Jay's scale-down ruling (2026-09-15): the roster was over-levelled.** Tests-only units get a **light VERIFY
  pass** (RED reproduces, mutation trips, `## Bars changed` accurate) and are marked **VERIFIED**, not
  reviewed. **Secretary flags only for units that change `src/`, capped at SIX.** **No planner unless a unit
  was REJECTED or its mechanism is UNKNOWN.** **No evidence-integrity side units unless a mismatch blocks a
  decision.** **SCOUTS STAY — they were the best value of the round** (seven; two closed units outright, one
  deleted a wrong answer before a planner could chase it).
- **`lane-reports/ROUND3-RESUME-BRIEFS.md` §0 is THE BINDING CHECKLIST — paste it verbatim into every brief.**
  Six rules: **which half of the acceptance bar you gate (the mutation proof is BLOCKING)** · **sweep coverage
  as a fraction of the roster, exclusions justified** · **state the FIXTURE behind every number — rig, camera,
  density, every non-default param, and whether GROUND-PLANE INK is included** · **check each pin's FIXTURE,
  not just the law name** · **say so when you turn another unit's test green or inherit its red** ·
  **`## Bars changed` is mandatory, INCLUDING population and fixture changes.**
- **§0b lists the known-slow vitest files.** `scene3d-tone-law-collapse.test.js` measured **390–1046 s** and
  **exceeds the Bash tool's 600 s maximum** — expect the tool to background it and read the completion
  notification. **That exemption covers ONLY the named slow test files.**
- **Incidents 8–12 (2026-09-11 → 16), five kills including the first WEEKLY cap (~2 days) and one that hit the
  MERGE IMPLEMENTER.** **Nothing was ever lost.** **The on-disk record was the recovery mechanism every single
  time**, which is why the ledger is now checkpointed to `main`. **Resume killed agents with `SendMessage`;
  checkpoint any mid-unit tree as `wip(...) (unverified)` and make the next agent VERIFY-OR-REVERT it.**

**Resume prompt for the next orchestrator (paste verbatim):**
> Resume the 3D fill audit at round 4. Local `main` is **`d3b01d28`** (v1.4.2, round 3 merged, 44+ ahead of origin, **NOT pushed**). Read, in order: `docs/3d-audit/fill-audit-handoff.md` (this block), `docs/3d-audit/lane-reports/SESSION-SUMMARY.md` (§1 what landed, §3 the round-4 order, §4 the decisions — **five are OPEN**, §6 the merge record), `docs/3d-audit/lane-reports/LEDGER.md` (standing rulings, the round-3 rows and their carry-overs, and the MERGE CHECKLIST — **items 23 and 30 are still owed**), `docs/3d-audit/STILL-OPEN.md`, `docs/3d-audit/lane-reports/AGENT-PROTOCOL.md`, and **`docs/3d-audit/lane-reports/ROUND3-RESUME-BRIEFS.md` §0 and §0b — paste §0 verbatim into every brief.** **The five `-3` worktrees are HISTORICAL — branch round 4 off `main`.** Serve main with `node scripts/dev-server.js 8460` for the gallery, and **kill any stale dev server on a lane port before starting** — leftover servers have held ports in every round, and orphaned scratch-port servers are now the largest cleanup cost of an incident. **Check the Decision Desk (https://claude.ai/code/artifact/811ab725-f61c-4664-bdb6-2780bd4ba56d) with `read_db` and TRANSCRIBE any answers into SESSION-SUMMARY §4, which stays authoritative.** **Do not start a conditional unit (W-32 Rank 4, F1-weight, the cap retune, T3b, T2-3d) until its decision is answered.** **Jay's scale-down regime binds: tests-only units get a light VERIFY pass, no planner unless a unit was rejected or its mechanism is unknown, secretary flags only for `src/` units and capped at six, and scouts stay.** Same roles otherwise: lane secretary first, then Sonnet implementers → Sonnet adversarial reviewers → Opus planners only where earned. Commit per unit in the lane worktree. **Never push.**

---

## ROUND 3 PAUSE POINT (2026-09-12 07:50 EDT) — read this first

**Jay paused the work.** Round 3 ran 2026-09-10 → 12 in five `-3` worktrees off `main` **`426cc5e4`**
(v1.4.1, round 2 merged). **Nothing from round 3 is merged.** `main` is `426cc5e4` plus the uncommitted
docs of this pause point, still **44+ ahead of `origin/main` and NOT pushed**.

**Lane HEADs at the pause** (verified read-only):

| lane | HEAD | state |
|---|---|---|
| `fill-audit-a3` (:8475) | **`32ec6ef0`** | **UNVERIFIED WIP** — F1-placement, on top of `8adfd5af` |
| `fill-collapse-3` (:8482) | **`d00ec210`** | **UNVERIFIED WIP** — U9b-2, test file only, on top of `49a5ef88` |
| `fill-audit-3` (:8476) | `141ed0b5` | clean — W-38 + W-38b, both closed |
| `fill-audit-d3` (:8481) | `426cc5e4` | clean, never written to (W-37 closed MEASURED) |
| `handoff-c3` (:8470) | `426cc5e4` | clean, idle by design |

**Landed on lanes, reviewed and closed:** T4 `a3b651f0` · U6 `2af329dd` · W-38 `575f886d` ·
W-38b `141ed0b5` · W-36c `8adfd5af` (**Jay's decision 6 delivered**) · U9b `2b189b5f` · W-37 CLOSED MEASURED.
**U7-2 `49a5ef88` is DONE but its review is OWED.**

**Three agents died to Incident 8 and were never resumed — restart them FRESH:** the F1-placement
implementer, the U9b-2/U5b-4 implementer, and the U7-2 reviewer. **Both WIP commits are unverified;
verify-or-revert each before building on it.** Note the recurring shape: **the two units that died mid-step
are exactly the two with no report on disk.**

**All nine of Jay's §4 decisions are ANSWERED (SESSION-SUMMARY §4 is the authoritative record — he answered
in chat; the decisions page mirrors them but cannot save). NOTHING IS FROZEN.**

**Resume prompt for the next orchestrator (paste verbatim):**
> Resume the 3D fill audit at the round-3 pause point. Local `main` is **`426cc5e4`** (v1.4.1, round 2 merged, 44+ ahead of origin, NOT pushed). Read, in order: `docs/3d-audit/fill-audit-handoff.md` (this pause block), `docs/3d-audit/lane-reports/SESSION-SUMMARY.md` (§1 landed, §2 the three dead agents, §3 the resume order, §4 all nine decisions ANSWERED — nothing is frozen, §6 merge status), `docs/3d-audit/lane-reports/LEDGER.md` (standing rulings, the round-3 queue, and the round-2 MERGE CHECKLIST, which is self-contained and still has open items), `docs/3d-audit/STILL-OPEN.md`, `docs/3d-audit/lane-reports/AGENT-PROTOCOL.md`, and `docs/3d-audit/lane-reports/ROUND3-BRIEFS.md`. **The five `-3` worktrees are LIVE — work in them, do not branch new ones.** Serve main with `node scripts/dev-server.js 8460` for the gallery, and **kill any stale dev server on 8475/8481/8482/8476/8470 before starting a lane** — leftover servers from a previous round have twice held those ports, and a stale server on a lane port is a silent way to test the wrong tree. **Put an explicit `timeout: 600000` for the known-slow vitest files in EVERY brief — implementer, reviewer and planner alike;** seven background-polling deviations across two rounds were all the same mechanical cause, and more emphatic prose has already failed to fix it. **Restart the three dead agents fresh:** the F1-placement implementer from WIP `32ec6ef0` (**verify-or-revert first**; brief is `F1-placement-plan.md`, Prototype B under its five ruled conditions), the U9b-2/U5b-4 implementer from WIP `d00ec210` (**verify-or-revert first**; scope in LEDGER rows 10a and 11a), and a fresh U7-2 reviewer (pinned `2b189b5f..49a5ef88`; the secretary's four flags are in the ledger). Then continue SESSION-SUMMARY §3's per-lane order. Same process and models: lane secretary first, then Sonnet implementers → Sonnet adversarial reviewers → Opus judges/planners; Fable only orchestrates and looks at pictures. Commit per unit in the lane worktree. **Merge when the round-3 queue is exhausted — and work the round-2 merge checklist's still-open items, the `git show HEAD:` sweep included. Never push.**

## How to run the next session — ROUND 3 (added 2026-09-10, after the round-2 merge)

**Resume prompt for the next orchestrator (paste verbatim):**
> Resume the 3D fill audit at round 3. Local `main` is **`9cf09b39`** (round 2 merged, v1.4.1, 44 ahead of origin, NOT pushed). Read, in order: `docs/3d-audit/fill-audit-handoff.md`, `docs/3d-audit/lane-reports/SESSION-SUMMARY.md` (round 2 is complete and merged — §2 is empty, §3 is the round-3 order, §4 has NINE decisions waiting on me), `docs/3d-audit/lane-reports/LEDGER.md` (standing rulings + the MERGE CHECKLIST, which is self-contained), `docs/3d-audit/STILL-OPEN.md`, and `docs/3d-audit/lane-reports/AGENT-PROTOCOL.md`. **Branch every round-3 lane off the integrated `main`, not off any round-2 lane — those are historical.** Serve main with `node scripts/dev-server.js 8460` for the gallery. Do not start any unit marked FROZEN in §3 until I answer its §4 decision. Same process: lane secretary first, then Sonnet implementers → Sonnet adversarial reviewers → Opus judges/planners; Fable only orchestrates and looks at pictures. Commit per unit in the lane worktree, never push.

**What changed in how to run it, learned in round 2 — apply these from the start:**
- **Spike-gate any plan whose Rank 1 is argued rather than prototyped**, and say so in the plan. W-31's gate
  caught an unshippable mechanism before a line of source moved; W-36's prototyped Rank 1 shipped first time.
- **Ask of every new bar: what quantity does this actually measure?** Five times in round 2 the mechanism was
  right and the instrument was wrong, and each was found by re-deriving a number rather than reading it.
  "The mechanism works" and "the bar measures the mechanism" are separate claims.
- **Re-derive a plan's RED numbers on the CURRENT tree.** Plans written days earlier were repeatedly stale;
  W-36 had to re-derive, and both T2 conditions existed for this reason.
- **Name the behaviours no single lane can test, and make them merge-checklist items.** Both rounds' worst
  defects were found by the merge, not by a lane — round 1's X-ray regression and round 2's ctxbar caveat.
- **Foreground only — and put that rule in REVIEWER and PLANNER briefs, not just implementer briefs.** Three
  of the four background-wait deviations came from agents whose brief only addressed implementers.
- **Sweep both cameras in the slices pass.** Camera-a-only measurement has cost this audit twice in one file.
- **The secretary keeps `LEDGER.md`, `STILL-OPEN.md` and `SESSION-SUMMARY.md`, and the merge checklist must
  stay self-contained** — the merge planner reads it alone.

## How to run the next session (added 2026-09-06 after the local merge — round 2's version, kept)

**Resume prompt for the next orchestrator (paste verbatim):**
> Resume the 3D fill audit. Read, in order: `docs/3d-audit/fill-audit-handoff.md`, `docs/3d-audit/lane-reports/SESSION-SUMMARY.md`, `docs/3d-audit/lane-reports/LEDGER.md` (standing orchestrator rulings + per-unit rows), `docs/3d-audit/STILL-OPEN.md`, and `docs/3d-audit/lane-reports/AGENT-PROTOCOL.md`. Serve main with `node scripts/dev-server.js 8460` for the gallery. Work the per-lane resume order in SESSION-SUMMARY §3; do not start T4, U6, or the W-06/ground-plane items until I answer the five decisions in §4. Same process: lane secretary first, then Sonnet implementers → Sonnet adversarial reviewers → Opus judges/planners; Fable only orchestrates and looks at pictures. Commit per unit in the lane worktree, never push.

**Agent roles and models (what worked; keep it):**
| Role | Model | What it does | Never |
|---|---|---|---|
| Orchestrator | Fable (this session's role) | reads ONLY one-line status lines + images; issues rulings; crops evidence at native resolution; commits main docs; fast-forwards merges | reads agent transcripts or full reports; runs tests itself; edits lane worktrees (one WIP checkpoint commit is the exception) |
| Lane secretary | Opus, ONE long-lived agent, resumed with `SendMessage` | absorbs every report file, keeps `LEDGER.md` + `STILL-OPEN.md` + `SESSION-SUMMARY.md`, returns one status line per unit and a "Secretary flags" list for the reviewer | edits src/tests; runs git that changes state |
| Planner | Opus, read-only, scratch `git archive` export | root cause with file:line, RED oracle with current numbers, ranked fixes, files allowed/forbidden, guards, evidence cells (checked against the manifest), stop conditions | writes into a worktree |
| Implementer | Sonnet, one per worktree | RED → GREEN → guards one file at a time → evidence re-shoot → LOOK (native-res crop) → commit; report to `lane-reports/<W-id>-impl.md`; returns one line | background test runs / monitors (three stalls); silent bar changes (`## Bars changed` is mandatory); two implementers in one worktree |
| Adversarial reviewer | Sonnet, read-only, scratch exports pinned to a sha range | reproduces RED/GREEN and every headline number itself; mutation checks; byte-identity md5; crops the picture; verdict per condition | stash/edit in the worktree; leaving probe files behind |
| Judge | Opus, for P0 items and plan disputes only | rules on whether the USER's rule is met roster-wide, tone preserved, re-pins honest; builds its own montage of unshot cells | re-doing the review |

**Context protection (the orchestrator's budget is the scarce resource):**
- Every agent writes its full report to `docs/3d-audit/lane-reports/` and returns exactly one line (`REPORT <path> — STATUS — ≤15 words`). The orchestrator never opens the transcript files under the task output dir.
- The secretary is the only agent whose replies exceed one line, and only when a decision is needed; forward its "Secretary flags" to the reviewer instead of reading the reports.
- The orchestrator's own tool use is limited to: spawning/messaging agents, `git status`/`log` checks, building before/after montages with PIL and reading them, and the wrap-up commits. Keep `cd` out of Bash commands (the cwd persists and has bitten twice).
- Rate limits kill agents mid-step (nine this session); worktrees survive, so `git status` each lane, then resume each agent with `SendMessage` — they keep their transcript. Checkpoint-commit any stalled implementer's tree as `wip(...) (unverified)` before handing to a fresh one.
- The `.impeccable/config.json` ignore keeps the design hook off `scripts/audit/**` and `docs/3d-audit/**`.

**Round-2 lanes are HISTORICAL** (merged at `9cf09b39` from `3d-scene/integrate-r2 @4421d514`): `fill-audit-a2 @94cca882` · `fill-collapse-2 @9aad87b8` · `fill-audit-d2 @392696ac` · `fill-audit-2 @79b626d2` · `handoff-c2 @ed778940`. **Nobody works in them; the next session branches off `main`.**

**Where things are:** status page (evidence + queue + decisions): https://claude.ai/code/artifact/177595d9-2cb7-43f5-8191-2a20bf5cae1f · merged tree: `main` (local only, v1.3.99) · lane branches kept for history under `.claude/worktrees/` · gallery `http://localhost:8460/docs/3d-audit/fill-audit/index.html`.
