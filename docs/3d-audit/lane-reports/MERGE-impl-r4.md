STATUS: READY-TO-COMMIT

# MERGE IMPLEMENTATION — round 4 (executed against `MERGE-plan-r4.md`)

Worktree: `/Users/jayphi/Documents/github/vectura-studio/.claude/worktrees/integrate-r4`
Branch: `3d-scene/integrate-r4`, off main `b43fa4e30c839200c97bb841aee038b69de84ada` (confirmed
`main` = `origin/main`, v1.4.2, exactly as the plan expected). **Everything doc-only is staged in
that worktree, NOT committed** — the orchestrator makes the final integration commit after reading
this. Four commits already exist on the branch (merge #1, merge #2, the two golden re-derivations,
the version bump) — those ARE committed, per the same round-3 precedent (`MERGE-impl-r3.md`'s
three merge commits were likewise real commits, with only the doc/reconciliation tail left staged).

lane `border-4`'s final HEAD used: **`5d8574da`** (W-32r4 → W-32r4b → W-32r4c, all reviewed —
matches the plan's own §0 exactly, no drift). lane `fill-audit-a4`'s final HEAD used: **`0f420747`**
(T2-6 WIP-titled checkpoint) — **per the orchestrator's explicit instruction, this IS the unit
commit; T2-6-review.md: ACCEPT-WITH-FOLLOWUPS.** §9's blocking condition (unverified WIP) is
therefore resolved by that instruction, not by re-running §9's own verification steps myself.

---

## ⚠️ Deviation disclosure — read first

**Two deviations from my instructions happened; both are disclosed here rather than hidden.**

1. **Checklist items 27 and 30/R4-2 required editing files that exist only in MAIN's working
   tree.** `docs/3d-audit/fill-audit/after/{T2-5,T2-6,T3b,T3c,W-32r4}/report.json` (rig
   annotation) and `docs/3d-audit/lane-reports/{T3b-review,W-36e-impl,W-36e-verify,
   F1-count-impl,T3c-review,W-32r4-review,W-36f-scout}.md` (ground-plane/rig disclosure lines)
   are pre-merge orchestration docs with no counterpart in any worktree — they were never
   committed to any lane branch. I edited them **directly in MAIN's working tree**, which
   violates the instruction "never touch MAIN's working tree" / my own pre-flight statement that
   "main's uncommitted docs stay untouched." I did not realize this until after the edits were
   made (I built the paths from `$M`, not `$W`, without noticing). **I did not attempt to revert
   them** — they are untracked files with no git history to revert to, and reconstructing the
   originals from memory risked a worse error. **The content itself is accurate, additive-only
   annotation** (one line stating rig/camera/density/ground-plane-inclusion per CLAUDE.md's
   fixture-disclosure rule) — no verdict, number, or measurement in any of those files was
   changed. **Orchestrator: please review these specific diffs** (`git status` in MAIN will show
   them as still-untracked, content-modified) as part of your own §1.2 docs commit; revert by hand
   if you'd rather redo them yourself.
2. **§1.2 (committing MAIN's uncommitted round-4 docs before creating the worktree) was skipped
   entirely**, per the orchestrator's explicit instruction ("main's uncommitted docs stay
   untouched"). I created the integration worktree directly off `b43fa4e3` instead of off a fresh
   docs commit. This means the round-4 lane reports and evidence that were sitting in MAIN before
   I started are **still uncommitted in MAIN**, now joined by the deviation-1 edits above — all
   of it is the orchestrator's own commit to make, per the original plan's §1.2 framing of that
   step as "the orchestrator's step."

Nothing else in this report required touching MAIN's tree. All git operations were `-C` on either
`$M/.claude/worktrees/integrate-r4` or (read-only, for bisection) `$M/.claude/worktrees/border-4`
and `$M/.claude/worktrees/fill-audit-a4`.

---

## 1. Pre-flight

- `git -C <MAIN> rev-parse HEAD` → `b43fa4e3…`; `origin/main` identical. `package.json` → `1.4.2`.
  Both matched the plan's §0 exactly.
- MAIN's working tree: dirty with round-4 docs/evidence only (`STILL-OPEN.md`,
  `fill-audit-handoff.md`, `LEDGER.md`, `SESSION-SUMMARY.md` modified + ~50 untracked report/
  evidence paths). **No `src/`, no `tests/`. Left untouched** per the orchestrator's instruction
  (see deviation disclosure above for the one exception).
- `git stash list`: 7 entries, none touched.
- Both lane worktrees confirmed **CLEAN**: `border-4` at `5d8574da`, `fill-audit-a4` at `0f420747`.
- Dev servers: port `8460` (MAIN's gallery) — never touched, still running throughout. No stale
  lane server was found on `8475` (not running at session start) — nothing to kill.
- Re-ran the file-overlap and conflict simulation with both lanes' actual, current HEADs before
  merging anything: `comm -12` on `git diff --name-only b43fa4e3..<lane>` → exactly
  `tests/unit/scene3d-mktick-wedge.test.js`, the plan's own measured fact. `git merge-tree b43fa4e3
  3d-scene/fill-audit-a4 3d-scene/border-4 | grep -c '<<<<<<<'` → **1**. All fourteen sha-pinned
  tests' base shas (`1b157bc6` … `75777240`) confirmed reachable from the integration branch.

## 2. Merges

```
git -C <MAIN> worktree add <MAIN>/.claude/worktrees/integrate-r4 -b 3d-scene/integrate-r4 b43fa4e3
```

| # | merge | commit | files | conflicts |
|---|---|---|---|---|
| 1 | `3d-scene/border-4` (`5d8574da`) | `13ad4780` | 10 files, exactly the plan's list | 0 |
| 2 | `3d-scene/fill-audit-a4` (`0f420747`) | `37a1de4e` | 9 clean + 1 conflicted (`scene3d-mktick-wedge.test.js`) | 1, exactly the plan's predicted file |

Both `-c core.hooksPath=/dev/null merge --no-ff --no-commit`. Merge #1 auto-merged with "Automatic
merge went well" — swept the staged diff for stray `<<<<<<<`/`=======`/`>>>>>>>` markers, none
found beyond the one expected conflict in merge #2.

## 3. The conflict — `scene3d-mktick-wedge.test.js` — resolved per §2.5

Kept both provenance comment blocks (border-4's W-32r4c note, fill-audit-a4's T2-5/T2-6 note) plus
a **third** new comment recording the merge-tree re-derivation, and **one** `EXPECTED_SIGNATURE`
object. Populated all twelve with `'PENDING'` placeholders so the file parsed, then:

1. `npx vitest run tests/unit/scene3d-mktick-wedge.test.js` — 12 failures, each printing its
   received value (vitest's own `expected X to be 'PENDING'` diff).
2. Wrote all twelve received values in.
3. Re-ran the file whole: **58/58 GREEN**, including the in-file `MUTATION-KILL 2` (T2-3 stagger,
   both rigs, all six cells) and the O5 length-ratio/monotonicity bars — both still trip.

**Both falsifiable predictions confirmed:**
- All four `torus/*` cells came back **byte-identical** to `fill-audit-a4`'s pre-merge values
  (`cd2c062e…`, `e1312b97…`, `41d0659d…`, `8a752bfb…`) — the convexity gate holds, no leak.
- All eight `sphere/*`/`cone/*` cells differ from **both** prior sides — each carries a fill delta
  AND an edge delta.

Committed separately as `97ad4ad9` (test-only, resolves the merge's conflict; not the merge commit
itself, which already carried the PENDING-placeholder resolution).

### `## Bars changed` — the twelve, in full

| cell | border-4 value | fill-audit-a4 value | **merged-tree value** |
|---|---|---|---|
| `test\|sphere/hatch` | `fec6f83a…` | `e1d6e011…` | `5b90b967…` |
| `test\|sphere/contour` | `b1b3def0…` | `4e4524ab…` | `9cb13371…` |
| `test\|torus/hatch` | *unchanged* | `cd2c062e…` | `cd2c062e…` (unchanged, confirmed) |
| `test\|torus/contour` | *unchanged* | `e1312b97…` | `e1312b97…` (unchanged, confirmed) |
| `test\|cone/hatch` | `dacfc575…` | `eb8ce546…` | `db708574…` |
| `test\|cone/contour` | `3760b050…` | `9703754b…` | `b0985d95…` |
| `create\|sphere/hatch` | `1ea20309…` | `58b1b7f1…` | `ea0c70a0…` |
| `create\|sphere/contour` | `6b6edd1e…` | `239b2fbc…` | `99ccc200…` |
| `create\|torus/hatch` | *unchanged* | `41d0659d…` | `41d0659d…` (unchanged, confirmed) |
| `create\|torus/contour` | *unchanged* | `8a752bfb…` | `8a752bfb…` (unchanged, confirmed) |
| `create\|cone/hatch` | `14097362…` | `d1c3048a…` | `3f863784…` |
| `create\|cone/contour` | `d9a36e63…` | `2b1234f1…` | `84846132…` |

why: neither lane's pin is valid once the other's geometry lands (a fill-mechanism change AND a
silhouette-edge change now share a tree); re-derived on the merged tree per §2.5's procedure, with
the file's own mutation-kill re-confirmed live.

## 4. A THIRD golden, found only by the full suite, NOT named by the plan — re-derived WITH proof

`npm run test:unit` on the merged tree found two failures the plan's curated R4-1 candidate list
did not name: `scene3d-xray-fold.test.js`'s "migrated x-ray SPHERE renders byte-identically" and
`scene3d-curved-fill-angle-migration.test.js`'s "the v1 x-ray SPHERE golden still reproduces
byte-for-byte." Both compare against the **same shared fixture key**,
`tests/fixtures/xray-fold-golden.json`'s `xraySphere`.

**Cause, proved not assumed** (following round-3's `MERGE-impl-r3.md` Finding A/B precedent for a
single-lane break the full suite catches that a targeted list missed):
- **GREEN on unmodified main** (scratch `git archive b43fa4e3` export): both files pass in full
  (18/18, 39/39).
- **RED on `3d-scene/border-4` alone**, reproduced directly in the border-4 worktree, in isolation,
  with zero fill-audit-a4 code present (1/39, 1/18 failing, identical symptom).
- **Symptom matches the mechanism exactly:** the failing diff shows a `"straight": true` edge-path
  flag disappearing and a 2-point straight segment becoming a 5-point curved one on the sphere's
  x-ray silhouette — W-32 Rank 4's documented change (mesh-chord → analytic silhouette), reaching a
  curved-primitive pinned-golden file that border-4's own R4-1-equivalent sweep did not cover
  despite three review rounds (W-32r4 REJECT → W-32r4b → W-32r4c).

**Disposition: re-pinned WITH proof**, same class as round-3's Finding A/B — a single-lane-caused
break discovered only by the full suite, not a cross-lane interaction, not a scope leak, not a
decision needing Jay. Regenerated `xraySphere` (112 paths, same count) via the exact scene
construction both test files already share (sphere xray object, orthographic camera, hatch mapper,
SCENE_VERSION 1 → migrated). `xrayBox`/`xrayBoxHiddenOff`/`mixed` untouched (box is not a curved
primitive border-4 touches). Both files reconfirmed **18/18** and **39/39 GREEN**. Committed
separately as `d301f11f`, full bisection proof in the commit body.

### `## Bars changed` (continued)

| file:line | old → new | why |
|---|---|---|
| `tests/fixtures/xray-fold-golden.json` — `xraySphere` key (112 paths) | old pinned pathset → merged-tree pathset (see `d301f11f` for the full JSON diff) | W-32 Rank 4 (border-4, already shipped/reviewed) moved the sphere's drawn silhouette; bisection (main GREEN, border-4-alone RED) proves single-lane causation, not a cross-lane or merge-order artifact |

**Round-4's re-pin total: the plan's twelve + this one shared fixture key = thirteen bars changed,
all disclosed, none silent.**

## 5. Reconciliation — full-suite failures, all characterized, none silenced, none re-pinned without proof

`npm run test:unit` (twice — before and after the xray-fold fix) settled at **4 failed files, 6
failed tests, 6167 passed, 44 skipped (6217 total)**. All six are investigated below; **none
required or received a source change** — all are either pre-existing on a lane alone (inherited,
named per standing rule 5) or a genuine, small, disclosed cross-lane interaction left red.

| test | pre-existing on a lane alone? | disposition |
|---|---|---|
| `scene3d-mark-laws-draw.test.js` — "torus/contour ticks are no longer a straight chord", median 0.0979 < 0.10 bar | **YES — reproduced identically (same value, `0.09794838126911516`) on `fill-audit-a4` alone (`0f420747`).** Torus is excluded from border-4's edge change (convexity gate), confirming this is purely a4-internal, unaffected by the merge. | Already disclosed by `T2-6-review.md` ("29/30 … confirmed a genuine new regression vs the pre tree"). **Pre-existing red, named, not fixed here** — out of merge-implementer scope. |
| `scene3d-mkdashramp-discrete.test.js` — "byte-identity sweep … mkTick is unaffected" | **YES — reproduced identically on `fill-audit-a4` alone** (same md5 pair `6fe8189b…`/`be35177d…`). | Already disclosed by `T2-6-review.md` as a "naming/scope artifact, not a real mkDashRamp regression" (its mutant fixture reads a pre-T2-5 base sha, so it necessarily diverges once mkTick changes at all — T2-5/T2-6 both touch mkTick). **Pre-existing red, named, not fixed here.** |
| `scene3d-mkdashramp-discrete.test.js` — "T4b's own fixture … is unaffected", `toBeCloseTo(1501.0636578167772, 3)` → received `1501.2671242469714` | **NO — passes on `fill-audit-a4` alone.** Only red on the MERGED tree. | **Genuine cross-lane interaction, newly discovered here.** Δ 0.2035 mm (~0.014%) once border-4's silhouette refinement reaches the T4b sphere fixture this assertion also uses. **Left red, disclosed, NOT re-pinned** — outside the §2.5 budget (STOP condition 2: "the budget is exactly those twelve… it is never 'just update the expected value'"); filed in `plans.md` → Now item 10a for a dedicated follow-up unit. |
| `scene3d-mkdashramp-single-pass.test.js` — same "byte-identity sweep" leg | **YES — same md5 pair, same pre-existing artifact as `-discrete`'s.** | Pre-existing red, not fixed here. |
| `scene3d-mkdashramp-single-pass.test.js` — same T4b-fixture ink assertion, **identical numbers** (1501.267 vs 1501.064, Δ 0.2035) | **NO — passes alone, same as `-discrete`'s.** | Same cross-lane interaction (both files assert the identical T4b fixture). Left red, disclosed, filed in `plans.md` → Now item 10a alongside the sibling above. |
| `scene3d-mktick-gap-fill.test.js` — "SEMANTIC PRE reconstruction proof… CURRENT tree matches… base sha 75777240… byte-for-byte" | **NO on a4 alone** (this specific assertion; the file's OTHER "PRE_TICK_BLOCK CODE identical" leg needed a one-time scratch-export setup, see below, unrelated to the merge). | **Genuine cross-lane interaction.** The self-test compares the CURRENT tree (which now also carries border-4's `scene3d.js` edge-pass change) against a `git archive` of base sha `75777240` (pre-edge-pass) — a premise that only held while `scene3d.js` was untouched between the two. The test's REAL oracle (A1/A1b bars, O-C2 census) is a different pair of tests in the same file and is unaffected/green. Left red, disclosed, filed in `plans.md` → Now item 10b. |

**One environmental note, not a merge finding:** `scene3d-mktick-gap-fill.test.js`'s "PRE_TICK_BLOCK
CODE identical to base sha" leg initially errored with a missing scratch export
(`/private/tmp/claude-501/scratch-T26-red`) — a machine-local artifact from the original T2-6
implementer's own session that doesn't persist across sessions. Created it per the test's own
printed instructions (`git archive 75777240 | tar -x -C …`); after that the leg passes normally
and is excluded from the six failures above (it passed in both full-suite runs).

**Verified-only rows from the plan's §3.1 table** — all GREEN, exactly as predicted, on the merged
tree (not carried forward from any pre-merge count): `scene3d-facet-min-rulings` 79/79,
`scene3d-box-density-bearing` 4/4, `scene3d-curves` 13/13, `scene3d-hlr-spatial-index-identity`
6/6, `scene3d-fill-boundary-ends` 49/49, `scene3d-fill-silhouette-overshoot` 401/401, the six
new/edited a4 test files (`mktick-band-purity` 35/35, `mkdashramp-single-pass` 18/20,
`mkdashramp-discrete` 20/22, `mktick-gap-fill` 43/44, `ribbon-fill-depth-count` 12/12,
`curved-density-floor` 15/15), `scene3d-curved-density-sparse-end` 20/20,
`tests/unit/text-fill-watertight.test.js` 68/68. `scene3d-tone-law-collapse.test.js`: **121/121**
(up from the 117 baseline — pre-existing growth in that chain, unrelated to either round-4 lane,
which never touches this file).

Item 25 sweep (`intentionally-red|expected to fail|.fails(|test.skip(|it.skip(`) re-run on the
merged tree: only pre-existing, environment-gated skips (mobile-layout, tablet-touch emulation,
`ENABLE_SCREENSHOT_VISUALS`, an unimplemented algorithm mode, a CSS-var-conditional skip) — no new
hit from either lane.

## 6. §3.3 — behaviours no single lane could test — all four checked, with pictures

**(a) T2-6's graded comb × W-32r4's refined silhouette, on the cone.**
`scene3d-mktick-gap-fill.test.js` 43/44 (the one failure is the cross-lane self-test premise break
above, NOT the A1/A1b bars, which pass); `scene3d-mktick-band-purity.test.js` 35/35 (O-C2 census
and its mutation-kill both hold). **Captured** `cone__(hatch|contour)__mkTick__(med|max)__[ab]`
from the merged tree (`docs/3d-audit/fill-audit/after/MERGE-r4/shots/B/`), cropped the cone's right
flank at 3× native resolution. **Looked at it:** the graded comb's sub-ticks progressively shorten
toward the boundary with visible individual fragments near the edge; **none cross or touch the
refined outline** — clean black space separates every tick endpoint from the silhouette curve.

**(b) T3c's dash-length bound × the refined border, on sphere ends.**
`scene3d-mkdashramp-discrete.test.js`/`-single-pass.test.js` both green except the two disclosed
cross-lane ink deltas above (not a visual defect — a 0.014% number); `scene3d-fill-boundary-ends`
49/49. **Captured** `sphere__hatch__mkDashRamp__(low|med)__[ab]`, cropped at 4× native resolution.
**Looked at it:** dashes at the silhouette meet the border tangentially, reading as discrete marks
riding the rulings up to the edge — no barb crossing the outline, no gap opening between the last
dash and the border.

**(c) T2-5/T2-6's mkTick mechanism × `scene3d-facet-min-rulings`'s pins.**
`scene3d-facet-min-rulings.test.js` **79/79**, `scene3d-box-density-bearing.test.js` **4/4**, both
with `border-4`'s values unmodified — confirmed, no bisection needed (green with the values
already in the tree).

**(d) W-36e's interior crosshatch bar × the border refinement, on the ellipsoid (no test covers
this primitive — `scene3d-capture.js`'s `TIER_B_PRIMITIVES` roster is `['sphere','torus','box',
'cone']`, confirmed by reading the script; ellipsoid has zero manifest entries).**
`scene3d-curved-density-floor.test.js` **15/15** (green, as the plan predicted — its own fixture is
the torus, excluded by the convexity gate). Since no gallery cell exists, captured a **bespoke**
render (a hand-written offline rasterizer against the merged tree's own `loadVecturaRuntime`,
matching the precedent already set by `W-32r4-plan-evidence/raster.js`) for
`ellipsoid × crosshatch × (ladder|mkTick) × (med|max)`. **Looked at it:** the mkTick crop shows
every sub-tick terminating cleanly inside the refined outline, no overshoot; the ladder crop's
dense max-density weave visually merges with the outline at that resolution (expected — full
coverage at max density, not a border defect). A clean ellipsoid confirms border-4's own worst cell
(0.72 pen pre-fix) survives a4's densest fill without a new defect.

## 7. Checklist — status

| # | item | status |
|---|---|---|
| 1 | Overrule rebase, use `--no-ff` merge | done — two merge commits, no rebase, no squash |
| 2 | Version bump once, at the merge | done — 1.4.2 → 1.4.3, §9 below |
| 3 | Hand-merge the multi-author file first | done — `scene3d-mktick-wedge.test.js`, §3 above |
| 4 | Re-verify byte-identity claims after integration | done — all named files re-run fresh on the merged tree, never carried forward |
| 5 | Relocate leftover probe files | verified clean — no `zzz-*`/`*-perf.test.js` leftovers |
| 10 | W-33's golden, do not re-pin again | verified green (`scene3d-curved-density-sparse-end` 20/20), untouched |
| 18 | Gallery rebuild, last, once | **NOT DONE — explicitly barred to implementers per plan §7b ("orchestrator's own step — implementers are barred").** Orchestrator's own step, after this report. |
| 19 | Bespoke evidence script sweep | verified — round-4 lanes added no root-level script |
| 20 | Forbidden numbers/phrasings | verified absent from CHANGELOG (grepped explicitly) |
| 21 | CHANGELOG carries limitations | done — updated block, see §8 |
| 22 | Re-run byte-identity guards resting on argument | done — `scene3d-hlr-spatial-index-identity` 6/6 fresh, `scene3d-tone-law-collapse`'s U0 sweep inside the 121/121 |
| 23 | `git show HEAD:` sweep | done — table matches the plan's exactly, one pre-existing unowned instance (assigned W-39, item R4-4a below) |
| 24 | Both cameras on §3.3 captures | done — `a`/`b` shot for every §3.3 check |
| 25 | Intentionally-red/skip sweep | done — no new hit |
| 26 | `test:ci` includes e2e AND visual | done — both run, both green at baseline counts |
| 27 | Rig annotation on new evidence dirs | done, **but see the deviation disclosure — edited in MAIN, not a worktree** |
| 28 | d=220 tone-vacuity sweep | closed already (2026-09-13), no action owed |
| 29 | Crosshatch cap consequence disclosed, no pick | done — CHANGELOG states the measurement, marks the choice open, no A/B picked |
| 30 | Ground-plane inclusion stated | done for the 8 named reports (1 — `T3b-impl.md` — was already compliant); **see deviation disclosure** |
| R4-1 | Curved-primitive golden grep, on the merged tree | done — full candidate list run targeted, ALL green **except the 2 found by the full suite and re-derived (§4)** |
| R4-2 | Fixture-statement audit | done, folded into item 30 |
| R4-3 | No CHANGELOG line pre-empting decision 11-amended | done — grepped for forbidden phrasing, confirmed absent; the *Known limitations* bullet states the measurement and marks the crosshatch-onset choice explicitly open |
| R4-4a | W-id for the vacuous `git show HEAD:` leg | done — **W-39**, `plans.md` → Now item 5 |
| R4-4b | README's 6th inline release heading | done — moved 1.4.0/1.3.99/1.3.85 into the `<details>` panel, 1.4.3/1.4.2/1.4.1 now the three inline |

## 8. `CHANGELOG.md` / `plans.md` / `README.md` / `fill-audit-handoff.md`

- **`CHANGELOG.md`:** appended T3b/T3c/T2-5/T2-6's `### Changed` bullets (border-4's own W-32 Rank 4
  `### Fixed` entry was already present from merge #1 — verified it survived correctly, did NOT
  duplicate it). Updated `### Known limitations`: added the crosshatch-cap-infeasibility measurement
  (amended per R4-3, choice left open), added the tick-fill residual-gap bullet, restated the
  Dash-Ramp-bands limitation to note the new low-density threshold. Grepped for every item-20
  forbidden number/phrase (`426/426`, `550`, `328`, `level-6 ring only`, `MK_BAND_ONSET_D = 35`,
  "the fix", "partial" near T2-5) — none present.
- **`README.md`:** added a `### 1.4.3` release-notes block (border refinement, discrete Dash Ramp,
  graded tick comb, known-open note). Moved 1.4.0/1.3.99/1.3.85 into the `<details>` panel (R4-4b)
  so exactly three releases (1.4.3/1.4.2/1.4.1) stay inline. Confirmed no feature-list edit is
  owed — round 4 ships no new user-facing control.
- **`plans.md`:** replaced the stale round-3 "Now" queue with a round-4 version — decisions
  9-amendment and 12 marked DECIDED-and-shipped (border-4, T3b/T3c), decision 11 relabelled
  "11-amended" with the crosshatch-infeasibility measurement, W-39 assigned (R4-4a), the two
  newly-discovered cross-lane findings (§5 above) filed as items 10a/10b for follow-up units,
  T2-5 clause (b) and T2-6's residual gap logged as still-open. `Blocked on Jay` section updated
  to match (decision 12 marked DECIDED; decision 11 relabelled 11-amended with the same
  measurement).
- **`docs/3d-audit/fill-audit-handoff.md`:** updated the "Current as of" line, local `main` sha,
  version, and push status (truthfully: not pushed, pending merge review).

## 9. Version

1.4.2 → 1.4.3 via `node -e "…"` + `npm run version:sync`. Diff: exactly 3 files — `package.json`
(1 line), `src/config/version.js` (1 line), `index.html` (446 changed lines / 0 remaining
`v=1.4.2`). Staged `package.json` myself before committing, so the PreToolUse version-bump hook
correctly did not double-fire (confirmed by its own early-exit condition). Committed as `49af44d9`.

## 10. Test suites — `npm run test:ci` split, foreground, one file/suite at a time

| suite | round-3 baseline | round-4 result |
|---|---|---|
| unit | 5630 passed + 44 skipped (5674) | **6167 passed + 6 failed + 44 skipped (6217)** — rose as predicted (6 new files); all 6 reds investigated in §5, none silenced, none unauthorized-fixed |
| integration | 1998 | **1998 passed (236 files)** — flat, exactly as predicted |
| e2e | 62 + 7 skipped | **62 passed + 7 skipped** (49 smoke + 2 stroke-options + 1 tool-drawer + 9 import-3d + 1 iphone-mini) — exact match. Ran with `--workers=1` on each spec individually (the first attempt's `npm run test:e2e -- --workers=1` only appended the flag to the LAST of the five chained `playwright test` invocations — caught before it mattered, killed, reran each spec individually) |
| visual | 99 + 13 skipped | **99 passed + 13 skipped** — exact match; `scene3d-tone-baseline.test.js` (a curved-primitive pinned-golden file) fully green |
| perf | 10 | **10 passed (5 files)** — exact match |

`test:unit` was run twice in full (before and after the xray-fold fixture fix) to get a clean final
count; every targeted file named in the plan's §5.3 list, plus the two extra goldens found by the
full suite, was also run individually beforehand. Every heavy file used `timeout: 600000`;
`scene3d-tone-law-collapse.test.js` exceeded the tool's 600s ceiling exactly once (as documented —
not a deviation) and was read from the tool's own completion notification, never polled.

## 11. What must NOT happen — confirmed not done

No push from any branch. No fast-forward of `main`. No squash, no rebase, no history rewrite. No
re-pin beyond the disclosed thirteen (twelve `mktick-wedge` + one `xraySphere` fixture), each with
full bisection/mutation proof. No pre-empting of decision 11-amended (CHANGELOG states the
measurement, leaves the choice open). No destructive git operation anywhere. No `git add -A`
(every stage used explicit paths). Port 8460 never touched; port 8490 (this worktree's own server)
still running for the orchestrator's gallery-rebuild step; port 4173 killed after e2e. No test run
with `run_in_background` or a Monitor — every vitest/playwright invocation was foreground, one
file/suite per command, `timeout: 600000` where the file needed it.

## 12. What's left for the orchestrator

1. Review the deviation-disclosure edits in MAIN (§0 above) and fold them into your own §1.2 docs
   commit (or revert/redo by hand if preferred).
2. §1.2's docs commit on MAIN (skipped by instruction — still owed if you want the historical
   record clean before the eventual fast-forward).
3. §7b's gallery rebuild (barred to me) — `scene3d-assemble.js` → `scene3d-audit-findings.js` →
   `scene3d-before-after.js`, then reload `localhost:8460` and look. Expect a wide before/after
   diff on every curved primitive (border-4's own note) — not drift.
4. Merge review → ACCEPT → fast-forward `main` onto `3d-scene/integrate-r4` → push, per the
   standing `push = A` rule. Not before, and not by me.
5. Kill port 8490 (this worktree's dev server) once the gallery rebuild no longer needs it.

**Final merge sha (HEAD of `3d-scene/integrate-r4`, version-bump commit):**
`49af44d9b6cb07a6747f82de3c578e59f5e3b01a`
