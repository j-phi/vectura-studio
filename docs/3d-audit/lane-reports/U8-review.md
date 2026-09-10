STATUS: ACCEPT-WITH-FOLLOWUPS

# U8 review — fold `onePenDown` → `interlockWeave` (C-08, param `penDown`)

- **Lane / worktree under review**: `fill-collapse-2`, `.claude/worktrees/fill-collapse-2` (READ-ONLY —
  no edits, stash, or commits made in the worktree at any point; the W-30d implementer is now editing it,
  so both pinned shas were `git archive`'d immediately and the live worktree was never read again afterward).
- **Pinned range**: `79c07770` (base, W-30c) `..` `2d931b1a` (final) — includes the orchestrator checkpoint
  `9a26aa5e` ("U8 checkpoint (unverified)", rate-limit kill/resume), reviewed as one range per the brief.
- **Method**: `git -C fill-collapse-2 archive 79c07770` → scratch `u8-before`; `git archive 2d931b1a` →
  scratch `u8-after`; `node_modules` symlinked into both from main. All numbers below are independently
  re-derived from these two exports plus two real dev-server captures (scratch ports 8593/8594, killed
  after use) — none trusted from the implementer's worktree, `report.json`, or `U8-impl.md` without
  reproduction. Both scratch exports, both capture output dirs, and every scratch temp file created during
  this review were deleted at the end.

## 0. Diff scope — PASS

`git -C fill-collapse-2 diff --stat 79c07770..2d931b1a -- . ':!graphify-out'`: exactly 7 files —
`scripts/build-tone-laws.js` (+24), `src/config/scene3d-tone-laws.js` (regenerated, +26/−1),
`tests/integration/scene3d-fill-style-picker.test.js` (+16/−4… net line-diff, one behavioral bar bump),
`tests/unit/scene3d-fill-style-effective-law.test.js` (+29), `tests/unit/scene3d-one-pen-down-reachability.test.js`
(+20/−6, one test re-expressed), `tests/unit/scene3d-tone-law-collapse.test.js` (+170), `tests/unit/scene3d-tone-laws-config.test.js`
(+4/−2). No touch to `surface-fill.js`, `surface-fill-mono.js`, `mappers.js`, `hlr.js`, `shadows.js`, or any
UI file. The one hunk in `scene3d-tone-law-collapse.test.js` is a single append at EOF
(`@@ -1242,0 +1243,170 @@`) — it does not touch the `e429cfc5` hazard region (main, lines 127–165) or any of
the four sites U9 (`fc8b0fba`) rewrote, so the pre-existing three-way merge hazard `STILL-OPEN.md:200`
already documents is not made worse by this unit — same finding U7 made for its own EOF append.

## 1. RED — reproduced, semantic not vacuous

Copied the after-export's 5 changed test files onto the before-export (`79c07770` source) and ran
`scene3d-tone-law-collapse.test.js -t "U8"`: **9 failed / 6 passed (of 87 total, 72 skipped by the filter)**,
matching the report exactly. Every failure is a semantic mismatch (`expected 'onePenDown' to be
'interlockWeave'`, `expected 'interlockWeave' to be 'onePenDown'`, an `offenders` array populated with all 9
primitive×density combinations, and the two effective-law/caveat assertions) — never a `TypeError` or a
module-load crash. RED is real and for the right reason.

## 2. GREEN — reproduced

Ran in the after-export, foreground, `--pool=forks --poolOptions.forks.singleFork=true` throughout (multi-file
batches under singleFork hit a benign `onTaskUpdate` RPC timeout that silently truncates the run after the
first file — same noise class every prior unit's report flags, but here it also cuts off unrun files rather
than just printing a warning; worked around by running suites one file at a time):

| suite | result | matches claim |
|---|---|---|
| `scene3d-tone-law-collapse.test.js` (full file) | **87/87**, 681.8s wall (1 benign `onTaskUpdate` RPC timeout) | yes |
| `scene3d-fill-style-effective-law.test.js` (4) + `scene3d-tone-laws-config.test.js` (8) | **12/12** | yes |
| `scene3d-fill-style-picker.test.js` (full file) | **144/144** | yes |
| `scene3d-tone-law-plumbing` (5) + `-params` (13) + `-dispatch` (7) + `faceted-tone-law` (19) + `solid-cap-reachability` (7) | **51/51** — see §7, claimed as "57/57" | mismatch, see below |
| `scene3d-one-pen-down-reachability.test.js` (after the re-expression) | **5/5** | yes |
| `stroke-fill-style-control.test.js` | **30/30** | yes |
| `scene3d-panel` (36) + `scene3d-panel-style-live-sync` (6) + `context-bar-scene-flyouts` (39) | **81/81** | yes |
| `scene3d-shadow-tone-law` (20) + `scene3d-shadow-tone-law-uniqueness` (3) | **23/23**, uniqueness stays 0-collision | yes |
| `scene3d-shadow-footprint-torus-visibility` (6) + `scene3d-shadow-receive-lighttypes` (8, one sub-test needs a real `.git` dir to diff against `90f3411f` and can't run from a bare `git archive` export — a scratch-methodology artifact, not a defect) | **14/14 in a real git checkout; 13/14 reproducible from a bare archive** | consistent |

Total genuinely reproduced: 87+12+144+51+5+30+81+23+14 = **447**, not the report's own claimed row-sum of
453 (87+12+144+**57**+5+30+81+23+14) or its stated **"Total: 426/426"** — neither figure matches the sum of
the table it sits under. See §7 for the standalone-file discrepancy and the arithmetic slip in the total.
None of this reflects an actual failing test — every suite is independently green — it is a **report-accuracy
error**, the same class LEDGER.md already flags for U0 ("342 vs 335") and U1–U5 ("21 vs 18"), here larger
(6 off on one row, 27 off on the stated total) and, unlike U7's own report, not clean.

## 3. Mutation kill — PASS

In the after-export, swapped the two `law` values inside `STYLE_PARAMS.interlockWeave.options` in the
**generated** `src/config/scene3d-tone-laws.js` (`perRuling`→`onePenDown`, `continuous`→`interlockWeave`, a
mis-map not a deletion) and re-ran `-t "U8"`: **4/4 U8-scoped tests failed** — the byte-identity sweep, the
`effectiveLaw` caveat-swap test, and the shared cross-check file's own U8 test all broke with correctly
diagnostic messages (e.g. `resolved to "interlockWeave", not onePenDown` across all 9 primitive×density
combinations). Restored the file from a pre-mutation copy and confirmed byte-identical to the original
(scratch-only; the worktree was never touched). The sweep is not vacuous.

## 4. Byte-identity — DOUBLE-PROVEN, both proofs independently reproduced

**Method 1 (in-tree resolver sweep)**: confirmed via the 87/87 full-file run above — both new U8 describe
blocks ("multi-primitive x multi-density: ... byte-identical across every reachable primitive x density
pair", 51.6s, and "... bare survivor ... unaffected by geometry or density", 40.5s) passed.

**Method 2 (real headless-Chromium capture, independently re-run)**: started fresh dev servers on scratch
ports 8593 (`u8-before`, `79c07770`) and 8594 (`u8-after`, `2d931b1a`) and ran
`node scripts/audit/scene3d-capture.js --tier B --root <export> --port <port> --only
'^(torus|sphere|cone)__hatch__(interlockWeave|onePenDown)__(low|med|max)__a$' --out <scratch>` from MAIN
against each, 18 cells both sides. **18/18 md5-identical between the true pre-U8 and post-U8 trees**,
reproduced myself via `md5 -q` over both output directories, not read off `report.json`.

**Stale-baseline symmetry, independently re-checked and CONFIRMED SYMMETRIC**: diffed all 18 post-U8 cells
and all 18 pre-U8 cells against the committed `docs/3d-audit/fill-audit/shots/B/` gallery. Both sides diverge
from the gallery on the **identical 10 of 18 cells** (torus at all 3 densities × both ids = 6, sphere/cone at
`low` only × both ids = 4) and agree on the other 8 — exactly the report's claim, reproduced cell-by-cell, not
assumed. Pre-existing drift (the gallery predates v1.3.99), unrelated to U8, same finding class as U7's own
symmetry check.

## 5. The caveat condition — PASS, traced at the code level, not just test-observed

Read `resolveToneLaw` (`src/core/scene3d/params.js:810`) and `SCENE_FILL_STYLES.effectiveLaw`
(`src/config/context-bar.js:279`) directly, both untouched by this diff. Both are fully data-driven off
`STYLE_PARAMS`/`ALIASES`, confirming structurally (not just via `git diff --stat`) that U8 needed no
U8-specific code: a descriptor's default option never increments `activeCount`, so `penDown:'perRuling'`
(or omitted) returns the bare survivor id `'interlockWeave'` — never `undefined`, never silently empty —
and `penDown:'continuous'` returns `'onePenDown'`. Confirmed independently three ways: (1) the code trace
above; (2) `docs/tone-laws/laws.json` read directly — `interlockWeave` and `onePenDown` each carry their own
real, non-empty, **distinct** `caveat` string (verified verbatim against the report's quotes — both mention
"not single-weight" but for opposite reasons: `interlockWeave` splits per sample along the line,
`onePenDown` deliberately does not); (3) the live screenshots
`after/U8/interlockWeave-perRuling-crop-native.png` / `-continuous-crop-native.png` — **LOOKED at directly**
— show the exact matching caveat text at each `Pen down` state, word for word against `laws.json`, with the
(i) popover blurb unchanged between the two (the survivor's own static text, matching U7's finding). No
leakage.

## 6. The Pen down sub-control — PASS

`scripts/build-tone-laws.js` diff adds exactly one `COLLAPSE` row: `interlockWeave: [{key:'penDown',
label:'Pen down', default:'perRuling', options:[{value:'perRuling', law:'interlockWeave'},
{value:'continuous', law:'onePenDown'}]}]` — matches the plan's contract exactly (§1 "C-08 → U8"; wording,
default, and both `law` mappings all verified against `W-22-24-W-18-plan.md`). Regenerated
`src/config/scene3d-tone-laws.js` from the after-export's build script + `docs/tone-laws/laws.json`:
**byte-identical to the committed file**, own repro. Build script prints `PICKER_IDS 33, ALIASES 15`, `48
law(s) (37 production / 11 library)` — matches. `docs/tone-laws/laws.json` confirmed **byte-identical**
between the two scratch exports — untouched, so `SCENE3D_TONE_LAWS.VERSION`
(`1819221f2a80c42be1ede76b2e8cee274d4b392b`) is unchanged in both exports (own repro, not the drift hash
merely re-pinned). `.vectura` round-trip both directions is covered by the passing "a saved .vectura naming
a folded toneLaw resolves through the real engine (sanitizeSceneParams) unchanged in effect" test (part of
the 87/87). `trochoidLoop` confirmed **not folded** — still its own `PICKER_IDS` row, own `STYLE_PARAMS`
entry absent, matching the plan's explicit deferral. Preset exposure re-verified in the after-export:
`grep -rl "toneLaw" user-presets/` → 0 files; `grep -rlE "interlockWeave|onePenDown" user-presets/
src/config/user-presets.js` → 0 files.

## 7. `## Bars changed` — mostly honest, one row-count error and a larger total-arithmetic error

Two disclosed bars, both confirmed as the **only** numeric changes in the diff:

1. `tests/unit/scene3d-tone-laws-config.test.js:118` — `EXPECTED_PICKER_IDS_LENGTH` 34 → 33;
   `EXPECTED_ALIAS_IDS` gained `'onePenDown'` (14 → 15). Directly reproduced: `PICKER_IDS.length` 33,
   `Object.keys(ALIASES).length` 15 in the after-export's loaded config.
2. `tests/integration/scene3d-fill-style-picker.test.js:410` — box dead-count 24 → 23. **Independently
   re-verified as a genuine behavioral fact**: both `interlockWeave` and `onePenDown` are confirmed
   unreachable on `box` under every mapper in `docs/3d-audit/fill-audit/manifest.B.unreachable.jsonl` (16
   matching lines: 8 mappers × 2 ids, all `status:"unreachable"`), and the picker test itself (144/144,
   reproduced) exercises `dead.length === 23` / `alive.length === 11` directly — a real recount, not a
   masked capability loss.
3. `tests/unit/scene3d-one-pen-down-reachability.test.js:78-91` — re-expression, not a numeric bar,
   confirmed correctly scoped to exactly what the plan's own §5 guard table names for this test, with the
   round-trip assertion (`resolveToneLaw` on the migrated bag still resolves to the exact internal id
   `onePenDown`) present and passing.

**New finding — the "Guards run" table's own arithmetic does not check out**, independently re-derived:

- The row claimed **"57/57"** for `scene3d-tone-law-plumbing + params + dispatch + faceted-tone-law +
  solid-cap-reachability` is actually **51/51** — I ran each of the five named files individually (5 + 13 +
  7 + 19 + 7 = 51) after a combined run of all five under `--pool=forks --poolOptions.forks.singleFork=true`
  silently truncated after the first file (a real infra footgun in this environment worth a process note,
  not a correctness issue — see §2). All five files are genuinely green; only the printed count for that row
  is wrong.
- The report's own **"Total: 426/426"** does not equal the sum of its own table even taken at face value
  (87+12+144+57+5+30+81+23+14 = **453**, not 426), and does not equal the correctly-summed total either
  (**447**, using the true 51 for the mis-stated row). Every suite I independently re-ran was in fact green
  (0 real failures anywhere in scope), so this does not indicate a missed regression — it is a pure
  report-accuracy slip, but a bigger one than the audit's own precedent (U0's 342-vs-335 off-by-7, U1–U5's
  21-vs-18 off-by-3) and, unlike U7's report (praised in `U7-review.md` for having *no* such slip), U8's does
  have one. **Recommend correcting the "57/57" row to "51/51" and the "Total" line to the true 447 (or
  re-deriving whatever the intended total actually was) before this lands on the ledger as a clean number.**
  This is the reason for ACCEPT-WITH-FOLLOWUPS rather than a plain ACCEPT — the underlying test coverage and
  fold are sound, but the report's own headline total is not trustworthy as printed and should not be copied
  forward into `CHANGELOG.md`/`LEDGER.md` without correction.

## 8. PNGs — LOOKED at directly

- `after/U8/interlockWeave-perRuling-crop-native.png`: Fill Style "Interlock Weave", the (i) note ("Wavy
  lines & scribble — Superseded by the Round 6 family..."), a real red caveat paragraph matching
  `interlockWeave`'s own `laws.json` entry verbatim, "Pen down: One stroke per ruling".
- `after/U8/interlockWeave-continuous-crop-native.png`: same Fill Style row and (i) note (unchanged), caveat
  text swapped to `onePenDown`'s distinct wording ("splitsAlongLine() excludes it by name..."), also verbatim
  against `laws.json`, "Pen down: One pen-down per fam[ily]".
- Converted and reviewed the gallery capture cells directly (not the implementer's own crops):
  `torus__hatch__interlockWeave__med__a` / `…onePenDown…` — both a torus in a "ragged spike" sawtooth-crown
  fill along both edge-bands with smoother wavy centreline strokes in the darker interior; visually
  indistinguishable at plot scale between the two, matching the plan's C-08 note and the report's claim.

## 9. Merge notes

- **`e429cfc5` (main, collapse-test chunking) / U9 `fc8b0fba` three-way collision on
  `scene3d-tone-law-collapse.test.js`** (`STILL-OPEN.md:200`): U8's own contribution is a clean EOF append
  (§0) — it does not touch either hazard's lines and does not deepen the pre-existing hazard. The
  rebase-by-hand-and-rerun-whole instruction in `STILL-OPEN.md:200` still stands for whoever integrates all
  three lanes.
- **U1–U5 multi-primitive×density re-sweep recommendation** (U7 reviewer's flag-4, tracked at
  `STILL-OPEN.md:307` as a merge-checklist item, explicitly not a reject condition): still open, unaffected
  by U8. U8 correctly builds its own byte-identity proof on the same stronger (primitive × density) harness
  U7 introduced rather than the weaker single-cell precedent U1–U6 used — consistent with, but does not by
  itself close, that recommendation.
- **U9b unblocked** (LEDGER.md row 18b, lane `handoff-c2` — distinct from U8's own lane `fill-collapse-2`,
  and the report correctly states this): verified directly that (a) `ALIASES.onePenDown = {into:
  'interlockWeave', params:{penDown:'continuous'}}` and the `STYLE_PARAMS.interlockWeave` descriptor are
  live in the generated config; (b) `scene3d-shadow-tone-law-uniqueness.test.js`'s `offeredLawIds()` sweeps
  only `PICKER_IDS` survivors (confirmed by reading the test source) so U8 introduces no new collision — ran
  unmodified, 3/3 green; (c) `shadows.js:762`'s `TONE_LAW_NOT_DISTINGUISHABLE` set still names `onePenDown`
  by its bare id, confirmed untouched — U9b's job (per the report and LEDGER row 18b) is to move that
  exclusion onto the `(interlockWeave, penDown:'continuous')` combination and not render the sub-control on
  the shadow path, correctly out of scope for this data-only unit.

## Verdict

**ACCEPT-WITH-FOLLOWUPS.** RED is real and semantic, GREEN reproduces suite-by-suite (independently re-run,
not batch-trusted), the mutation kill is clean and diagnostic, byte-identity is double-proven and the
stale-baseline symmetry claim holds cell-by-cell under independent re-capture, the caveat condition is proven
both by code trace and by live screenshot against the raw `laws.json` corpus, the two disclosed bars are the
only real bars that moved and both are honest, `trochoidLoop` is correctly left unfolded, preset exposure is
zero, the `VERSION` drift hash is unchanged, and the diff is provably confined to picker-tier config + tests
with no touch to `surface-fill.js`/`shadows.js`/UI files. U9b is genuinely unblocked exactly as described, on
the correct (different) lane.

**One follow-up required before this is copied into `CHANGELOG.md`/`LEDGER.md`**: the "Guards run" table's
`57/57` row is actually `51/51` (independently re-run one file at a time: 5+13+7+19+7=51), and the report's
own "Total: 426/426" does not match the sum of its own table under either the stated (453) or corrected (447)
per-row numbers. No test anywhere is actually failing — this is a pure report-accuracy slip, larger than the
audit's own prior precedent (U0, U1–U5) and, unlike U7's own report, present here — correct the numbers before
they propagate. Non-blocking process note: running more than one heavy scene3d test file at once under
`--pool=forks --poolOptions.forks.singleFork=true` silently truncated to just the first file's results on
this machine (a benign-looking `onTaskUpdate` RPC timeout actually cut off unrun files, not just logged
noise) — worth a one-line callout in `AGENT-PROTOCOL.md` so the next reviewer runs suites one file at a time
rather than trusting a truncated multi-file summary.
