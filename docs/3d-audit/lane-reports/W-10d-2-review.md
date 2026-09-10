STATUS: ACCEPT-WITH-FOLLOWUPS

# W-10d-2 — adversarial review (Contract A, curated write-back)

**Reviewer scope:** `.claude/worktrees/fill-audit-2`, read-only, pinned `66d9092d..79b626d2` (single
commit `79b626d2`). Verified in scratch exports under `/private/tmp/claude-501/.../scratchpad/`
(`w10d2-pre` = `66d9092d`, `w10d2-post` = `79b626d2`, `node_modules` symlinked from the worktree),
both removed at the end of this review. No edits, stashes, or deletions made in any worktree or main.

## 1. RED / GREEN / mutation

- **RED at `66d9092d`** (post-fix tests overlaid on pre-fix `context-bar.js`/`engine.js`/`params.js`,
  restored via `git show 66d9092d:<file>`): **7 failed, 153 passed (160)**. All 7 failures are real-value
  mismatches (`expected 'originSpiral' to be 'ladder'`), never `TypeError`/`is not a function`: R1, R1b,
  R4, R6, R7, R10, plus the updated pre-existing W-10d test ("normalizeStyle alone is context-blind…").
  Matches the implementer's claimed row set exactly.
- **GREEN at `79b626d2`**: `scene3d-fill-style-picker.test.js` + `scene3d-tone-law-writeback.test.js`
  together — **167/167**, reproduced independently.
- **Mutation 1 (disable the write-back)** — `writeBackFor` stubbed to unconditionally return `null`:
  **11 failed, 156 passed**. Exactly R1, R1b, R4, R6, R7, R10, the updated W-10d test, G1b, G2, G5, and
  the file's own mutation-check harness (which restores from a now-mutated "original"). Non-vacuous.
- **Mutation 2 (widen the curated set to `sphere`+`taperedEnds`)**: **5 failed, 162 passed** — the
  companion sphere-guard assertion inside the updated W-10d test, **R9 (blast-radius guard)**, **G1**
  (exact-array equality), **G1b** (sweep expects only `torus` to hit), and — as a bonus, unprompted,
  independent confirmation of real blast radius — the pre-existing **W-03 "sphere+spiral+taperedEnds
  ships zero ribbons"** test also breaks, because widening the table measurably changes that render.
  This is strong evidence the guard rows are load-bearing, not decorative.

## 2. Secretary flag 1 — is the changed test genuinely disjoint, and is the companion assertion real?

- `normalizeStyle(style)` (params.js, post-fix ~L833) takes **only** a `style` argument — no
  `primitiveMode` parameter exists in its signature at all. It is structurally, not just by
  convention, unable to see the primitive. The kept first three assertions
  (`normalizeStyle` alone / `F.resolve` / `F.isReachableOn`) are therefore correctly preserved as
  still-true claims about a different function than the one this unit changes.
- The companion assertion (`sphere`+`spiral`+`taperedEnds` through the same `sanitizeSceneParams` call,
  expecting `'taperedEnds'` unchanged) is **not decorative**: Mutation 2 above flips it to fail the
  instant the curated table gains a second entry naming that pair. It is exactly the guard against
  Contract-A-drifting-into-Contract-B-by-widening that the secretary flagged.

## 3. Secretary flag 2 — is G1 vacuous?

No. `G1` asserts `expect(F.UNREACHABLE_WRITEBACK).toEqual([{ primitive: 'torus', id: 'originSpiral' }])`
— an exact array-equality check, not a length check or `.toBeTruthy()`. Mutation 2 confirms it fails the
moment a second entry is added. `G1b` additionally sweeps the full 10×8×35 = 2800-combination space and
asserts hits > 0 (guarding against the sweep itself being vacuous) while pinning every hit to
`(torus, originSpiral)` specifically.

## 4. Secretary flag 3 — U9 disjointness, re-derived against U9's real hunk

Read `handoff-c2`'s actual `fc8b0fba` diff directly (not inferred from its absence on this branch).
U9's two hunks land at old-file `@@ -999,6 +999,42 @@` (new `clampShadowToneLaw`, shadow-bag only) and
`@@ -1011,9 +1047,7 @@` (the `shadowToneLaw:` call-site swap) — footprint **999–1019** on the
pre-U9 base. Confirmed **byte-identical base**: `git show 66d9092d:src/core/scene3d/params.js` on
fill-audit-2 diffs empty against `git show fc8b0fba^:src/core/scene3d/params.js` on handoff-c2 — both
lanes forked from the same unedited file, so the line numbers transfer directly; this is not an
absence-based inference.

W-10d-2's actual hunks in `79b626d2` (`git show 79b626d2 -- params.js`): `@@ -879,6 +879,23 @@`,
`@@ -1072,7 +1089,13 @@`, `@@ -1419,6 +1442,28 @@`, `@@ -1682,6 +1727,23 @@`,
`@@ -1730,6 +1792,7 @@`. Nearest approach to U9's 999–1019 block is 1072−1019 = 53 lines below;
nowhere near git's 3-line merge context. **Disjoint, confirmed against U9's real block, post-merge-safe.**

Also independently checked against **W-35** (`fill-audit-d2` `323e2583`): its one hunk is
`@@ -729,6 +729,10 @@` (inside `clampStyleParam`'s switch, a case W-10d-2 is explicitly forbidden from
touching and does not touch) — same byte-identical-base proof holds (fill-audit-d2's pre-commit
`params.js` diffs empty against fill-audit-2's `66d9092d`). Also disjoint from all five of W-10d-2's
hunks.

## 5. Secretary flag 4 — ONCE semantics, undo, per-pass repeat

- **No undo entry at load**: `applyState` (app.js) never references `this.history` anywhere in its
  body (grepped), and `importState`/`sanitizeImportedParams` (the function whose return is persisted,
  `engine.js:1931`) never calls `pushHistory` either. R5 (compares `app.history.length` before/after
  for an affected vs. an unaffected doc) passed in the real GREEN run and was untouched by both
  mutations — consistent with it testing a structural property independent of the write-back's value.
- **Exactly one rewrite on a live edit, not per-pass**: read R4 directly. After a live sphere→torus
  edit, compose #1's `group._sceneAssembled.styleTable.byObject[...].params.toneLaw` becomes `'ladder'`;
  the **live layer bag** (`obj.params.style.params.toneLaw`) stays `'originSpiral'` throughout — the
  write-back never reaches the stored bag from this channel, only its render-facing throwaway copy.
  `JSON.stringify(obj.params)` is snapshotted and asserted byte-identical across composes #2 and #3
  against #1 — this is idempotence-by-construction (a pure function on an unchanging input), not a
  per-pass flag, matching stop condition 7 in the plan.
- **No repeat on subsequent composes / re-import**: R2 (byte-identical re-import of an already-migrated
  doc) and R3 (byte-identical across 3 composes for a reachable law) both passed in the real run.

## 6. `.vectura` round trip and the 48/48 byte-identity guard

- R7 (save the migrated doc, re-import is a no-op) and R8/R9 (no-fallback and blast-radius guards
  leave a non-curated stored law untouched) all passed in the real GREEN run.
- **Independently reproduced the 48/48 md5 guard**, file-by-file, from
  `docs/3d-audit/fill-audit/after/W-10d-2/guard-tierB-{before,after}/shots/B/`: both directories hold
  exactly 48 `torus__hatch__<law>__med__a.webp` files, the same 48-law set, `originSpiral` present in
  neither (confirming the picker's own reachability gate — unchanged by this unit — excludes it from
  both shoots as claimed), and **0 of 48 pairs differ** by md5. This includes `ladder` itself.

## 7. The only render change is torus+originSpiral — independently reproduced to exact figures

Wrote two throwaway vitest probes (not committed, removed) exercising the real
`VectorEngine`/`computeAllDisplayGeometry` stack, seed pinned to 424242 as the report describes:

| scene | pathCount | pointCount | checksum |
|---|---|---|---|
| pre-fix (`66d9092d`) raw `originSpiral` | 556 | 5851 | 1343838.2003113925 |
| post-fix write-back result (export→import round trip) | 135 | 910 | 203336.35766751465 |
| post-fix explicit `ladder` pick (same seed) | 135 | 910 | 203336.35766751465 |

All three figures match `report.json`'s `evidence.geometryIdentityProbe` **exactly**, to the last
decimal. This is the load-bearing proof and it reproduces bit-for-bit.

**Caveat found, not previously flagged this way**: the raw before/after `leaf-scene/*-exported-state.json`
files in the evidence directory are **not** a single-key diff — they also differ in `activeLayerId`,
several object/parent UUIDs, and two unrelated `seed` values, because BEFORE and AFTER are separate
from-scratch Playwright captures with fresh session-random ids. The implementer's own report discloses
this exact confound in the "Geometry identity probe" section (why they pivoted to `group.scenePaths`
comparison instead of a DOM/JSON diff) — so this is a known, stated limitation of the raw JSON pair, not
a hidden one, and the geometry probe substituted for it is strictly stronger (exact numeric identity,
not eyeballed JSON). Still, a reader skimming only the two JSON files without reading the report text
could mistake the multiple incidental diffs for a wider blast radius than the fix actually has.

## 8. Looked at the PNGs

- `before-style-row.png` / `after-style-row.png`: confirmed exactly as described — "Origin Spiral — no
  effect here" (greyed) → "Ladder (default)" (enabled).
- `before-canvas.png` / `after-canvas.png`: confirmed visually distinct. BEFORE shows a visibly denser
  radial/spiral fan texture on the torus; AFTER shows sparser, evenly-spaced concentric rings —
  consistent with the 556→135 path-count reduction. The ground shadow beneath is materially unchanged
  between the two shots, as expected (style-only change, not a lighting change).

## 9. Shadow bag, docs contract, merge state

- G4 (`normalizeShadow({shadowToneLaw:'originSpiral'})` and a folded id both pass through unchanged)
  passed in GREEN and was unaffected by either mutation, consistent with `normalizeShadow` having no
  `primitiveMode` parameter to gate on — structurally unreachable from this unit, matching U9-review.md's
  binding constraint (shadow bag = raw pass-through, never collapsed).
- `SCENE_FILL_STYLES.DEFAULT` (context-bar.js:185, `DEFAULT: FILL_STYLE_DEFAULT`) and
  `SCENE3D_TONE_LAWS.DEFAULT` (`scene3d-tone-laws.js:1153`, `'ladder'`, file untouched by this diff) are
  both **pre-existing** at `66d9092d` — confirmed by reading the base file directly. No new constant was
  introduced; G2/G5 assert against the live properties, not a literal.
- Worktree tree is clean, branch unmerged into main, not pushed — consistent with an in-flight unit.
- CHANGELOG.md/README.md were correctly **not** edited in the worktree, per the report's disclosed
  "report-only, do not edit CHANGELOG.md" instruction for this run; the proposed CHANGELOG line's cited
  figure (torus 87.8% ink-wedge coverage) is traceable verbatim to W-10c's own measurement in
  `STILL-OPEN.md` line 64 ("87.8% at 441af81f"), not fabricated.
- **Minor defect found**: the commit body for `79b626d2` states "…output (135 paths/910 points) is an
  EXACT match to an explicit ladder pick, vs. 556 paths/910 points for the pre-fix originSpiral wedge
  render" — the second `910 points` is wrong; the pre-fix figure is **5851 points** (confirmed above and
  in the implementer's own `report.json`). A copy-paste slip in the commit message prose, not in any
  test, threshold, or code path — no `## Bars changed` implication, but it should be corrected in the
  commit body before this lands (e.g. via a follow-up note or at squash/merge time) since AGENT-PROTOCOL
  holds commit-body numbers to the same standard as the report.

## Verdict

**ACCEPT-WITH-FOLLOWUPS.** The fix is real (mutation-proven both ways), correctly scoped to the one
curated pair, respects every cross-lane boundary (U9's shadow bag, W-35's and U9's params.js hunks all
independently re-verified disjoint against their actual commits), creates no undo entry, is idempotent
by construction rather than by a per-pass flag, and its headline numeric claims reproduce bit-for-bit in
an independent scratch build. Two non-gating follow-ups: (1) fix the `910`→`5851` point-count typo in
the `79b626d2` commit body; (2) note in the evidence README that the raw `leaf-scene/*-exported-state.json`
pair is not a single-key diff (session-random ids/seeds also differ) so a future reader doesn't mistake
it for a wider blast radius than the geometry probe actually proves.

Scratch dirs removed (`w10d2-pre`, `w10d2-post`, throwaway probe files and logs).
