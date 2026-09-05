# 3D Scene fill audit + stroke-fill handoff continuation — HANDOFF

**Current as of 2026-09-05 (evening), session `014DjdT7`.** Nothing pushed. Nothing merged to `main`
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
3. **W-26 (user rule, P0)**: continuous ladder placement so gaps carry tone only — plan in `plan-W26-W27.md`; lane
   fill-audit-a after W-01 M1. Touches `surface-fill.js` dispatch/emitContFamily only; never the master grid.
4. **A3** (user's "not close to zero yet"): PenFill/boolean-erosion dropped geometry — brief in STILL-OPEN; lane handoff-c.
5. **W-15c** (F-14 plane 3 rulings at d=50) — design C brief in STILL-OPEN; lane fill-audit.
6. **W-07b, W-10c, W-27c items 2–4, W-06 sign-off, W-25 floor scope, W-28 face-count threshold, Unit D phase alignment.**
7. **Slider collapses W-22/W-23/W-24 + W-18** (the audit's 13 duplicate clusters → ~24-law roster): one lane, serial,
   after the P0/P1 items — the biggest product win still untouched.
8. Reviewer/judge every landing; re-shoot evidence into `after/<W-id>/`; rebuild the gallery; update STILL-OPEN.
9. Merge (see checklist below) only when the queue is exhausted or Jay says so.

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
