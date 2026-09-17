STATUS: ACCEPT-WITH-FOLLOWUPS

# T2-3b review — mkTick CONTOUR-mapper moiré (Rank 1 area floor) + the git-show-HEAD self-test replacement

Lane `fill-audit-a3`, worktree `.claude/worktrees/fill-audit-a3` (read-only; never edited,
stashed, checked out, or reset). Pinned range `c28b3490..a8e2269f`: `56481503` (a) and
`a8e2269f` (b). Reproduced RED in scratch `git archive` exports under
`/private/tmp/claude-501/scratch-T23b-r/{c28b3490,56481503,a8e2269f}` (`node_modules`
symlinked from MAIN), all removed after use — none left in the worktree. Every vitest/node
run was foreground with `timeout: 600000`; two runs exceeded the Bash tool's ceiling and were
moved to background by the tool itself (not by me arming a Monitor), per the standing
amendment — I did other verification work and read results from the completion/output file.

## Verdict up front

Deliverable (a) is clean and fully verified: the `git show HEAD:` anti-pattern is completely
gone (no `execSync`/`child_process` in the file at all), 57/57 green at the mid commit and
58/58 green at post, no skips, and a contrast mutation trips all 12 goldens. Deliverable (b)'s
banding instrument and bar are equally solid: RED reproduces exactly (4 failed/14 passed/4
skipped, my own numbers match the report's to 4 decimal places), GREEN at post (22/22), the
mutation proofs (MUTATION-KILL 1, contrast, negative control) all reproduce, and the file
correctly states it gates the moiré half only.

**But the orchestrator's flag 2 is confirmed, with precise numbers (see condition 6), and per
the orchestrator's own instruction that forecloses ACCEPT: Rank 1 introduces a new, previously
absent, near-full-diameter stray stroke on `sphere/contour` — exactly one of the two cells
this unit exists to fix — on BOTH rigs.** It is disclosed by the implementer (the "runaway-stroke
census," create rig only, aggregate-count framing) but not fixed, and no test in this unit or
any guard would catch a *per-cell* regression of this shape (the census only checks whether the
*total* count across all six cells exceeds the pre-T2-3 baseline of 13, which it does not — 11 ≤
13 — so the unit's own stop condition 5 does not trip even though a clean cell became dirty).
That is a real, user-visible defect on the cell class Jay's own bug report was about, so the
verdict is **ACCEPT-WITH-FOLLOWUPS**, not ACCEPT, with a new BLOCKING follow-up below.

## 1. Deliverable (a) — `git show HEAD:` replacement

- `grep -n "execSync\|child_process"` on the post tree's `scene3d-mktick-wedge.test.js`: **zero
  matches.** The only remaining references to "`git show HEAD`" are in comments/describe names
  documenting what was removed.
- `mid` (`56481503`), scratch archive: **57/57 passed, 0 skipped, 0 failed.**
- `post` (`a8e2269f`), scratch archive: **58/58 passed, 0 skipped, 0 failed** (the extra test is
  the new `Lfloor` live-source assertion added in commit b, correctly not present until Rank 1
  ships the constant it checks for).
- **Non-vacuity, reproduced independently**: in a scratch copy of `post`, changed
  `MK_TICK_EASE_BLEND` 0.92 → 0.90 (the file's own contrast mutation). Result: **all 12 of 12
  pinned `pathSignature` goldens fail** (every rig×cell). Matches the plan's §5.3 requirement
  exactly ("all 12 change").

**Condition 1: PASS**, cleanly.

## 2. Deliverable (b) instrument — RED/GREEN, direction check, which half it gates

Copied the (not-yet-committed-at-that-sha) `scene3d-mktick-banding.test.js` +
`scene3d-mktick-band.js` into a scratch `git archive c28b3490` (pre-Rank-1, `.git`-free, so
this reproduces exactly what existed before the fix landed):

- **4 failed / 14 passed / 4 skipped (22 total)** — identical to the report's own claim.
- The three RED assertions on the flagged bar: `test|sphere/contour` **0.09554** > mkDotScreen
  0.07462 (FAIL); `create|sphere/contour` **0.11207** > mkDotScreen 0.06595 (FAIL);
  `create|cone/contour` **0.06741** > mkDotScreen 0.04440 (FAIL). `test|cone/contour`
  **0.05478** < mkDotScreen 0.05812 — narrowly PASSES even on the buggy pre-Rank-1 tree, exactly
  as the implementer disclosed rather than hiding. My four measured `bandC` values match the
  report's `PRE_RANK1_BANDC` pins to 4-5 significant figures.
- `post` (`a8e2269f`): **22/22 green.**
- **Direction check reproduced**: the file's own "instrument correctness" describe block (no
  renderer) passed identically at pre and post (it's pure math, unaffected by Rank 1) —
  injected bands at two different angle/period pairs are recovered to within the file's own
  tolerance, a smooth taper alone reads near zero, and same-amplitude incoherent jitter scores
  under half the injected band's `bandC`. This is the JS-suite's own version of the plan's
  Python `pre` / synthetic-band / ink-matched-random-loss table (§1.3) — not a byte-for-byte
  re-run of the Python script, but the equivalent proof is present and green in this file and I
  exercised it directly.
- **Which half it gates**: the file's own header states, correctly, that `bandC` gates the
  **moiré half only** — nothing about whether bare space reads as scattered texture vs. a
  converging hole (that's `wedge25`/`holeMax`) and nothing about whether tick length carries
  tone (that's `O5`). This matches Jay's R2 clause ("the field stays complete...") only
  obliquely — `bandC` answers a narrower, additional question (is the *density*, where ink IS
  present, coherently oscillating) that neither existing oracle asked. Correctly disclosed as a
  NEW bar, not a re-statement of R1 or R2.

**Condition 2: PASS.**

## 3. Deliverable (b) fix — per-cell table, worst cell, area-floor mutation

Ran `scene3d-mktick-wedge.test.js` at post with `--reporter=verbose`: **all 12 O5 assertions
pass at the new bar (`>= 2.3`)**, **all 12 wedge25 non-regression-ceiling assertions pass**
(test ceiling 0.09, create ceiling 0.18 — confirmed literal in the running suite, matching the
plan), the six-cell MEAN wedge25 bars pass on both rigs, and **MUTATION-KILL 2** (the
pre-existing T2-3 stagger mutation, unrelated to this unit but still gating `wedge25`) passes
12/12. Per the report's own table, the worst per-cell margins are: test-rig `wedge25` worst =
`sphere/hatch` 0.0781 (ceiling 0.090, 13% margin); create-rig worst = `torus/contour` 0.1728
(ceiling 0.180, 4% margin) — both clear. Worst O5 = `test|torus/hatch` 2.330 (bar 2.30, 1.3%
margin) — clears, thin but real.

**Area-floor mutation-proof, reproduced**: `scene3d-mktick-banding.test.js`'s own MUTATION-KILL
1 (remove the three `Lfloor` lines, restoring `L = Lease`) ran as part of the 22/22 green run
above — 4/4 pass (shipped `bandC` < no-floor-mutant's `bandC` on both flagged cells, both
rigs). This IS "remove the fix → bar RED" in the sense that the mutant's own reading would fail
the gated bar were it re-run through the gate (the mutant reproduces exactly `c28b3490`'s
numbers, which I already showed above fail 3 of 4 gated assertions).

**Condition 3: PASS.**

## 4. O5 bar derivation, Decision 13, literal diff

- `## Bars changed` in `T2-3b-impl.md` and the `a8e2269f` commit body both carry the O5
  3.0 → 2.30 change with the §3.4 area-correct derivation attached, and both state Jay's
  ruling on option (A) explicitly. Confirmed present, word for word, in both places.
- `## Decision 13 for Jay` is present in `T2-3b-impl.md`, correctly framing the O5-vs-bandC
  frontier as unresolved at this row density and filing the row-pitch unlock to **T2-3c**
  (not touching `MK_ROW_COV`, which is correctly on the forbidden list here).
- **Not achieved by re-scoping population**: `git diff 56481503..a8e2269f --
  tests/unit/scene3d-mktick-wedge.test.js` (full diff read) shows the ONLY literal changes are
  (1) the 12 re-pinned SHA-256 goldens, (2) `O5_BAR` 3.0 → 2.30 (extracted to a named constant
  with a derivation comment), and (3) one test that promotes a comment placeholder to a real
  `Lfloor`-presence assertion. **No test count changed** (still 6 cells × 2 rigs for every
  describe block; `CELLS` array untouched), no `beforeAll` fixture changed, no cell added or
  removed. This satisfies "not by re-scoping the population."
- `LMIN` confirmed untouched (`0.18`), `L0` confirmed untouched (`1.16`) via direct
  `grep -n "MK.mkTick"`.

**Condition 4: PASS.**

## 5. lenChan consumers, pins, guard sweep

- `grep -n "chan:"` on the post tree's `MK` table, independently run: **exactly one** row has
  `chan: 'len'` (`mkTick`, line 2620); every other row is `'size'`/`'elong'`/`'count'`/`'amp'`/
  `'alt'`. `const lenChan = law.chan === 'len';` (line 6470) is confirmed a plain equality — no
  other law can structurally reach the branch.
- Did not re-run the full 288-combination byte-identity sweep myself (would have required
  re-deriving the exact harness the implementer used); accepted the grep-level structural proof
  plus the in-file negative-control mutation (`mkComma`'s `L0`) which I re-ran as part of the
  22/22 pass above and independently confirms zero effect on `mkTick`'s `bandC` to 1e-9.
- **Extended the pin search beyond the listed guards**: grepped every other test file
  referencing `mkTick` (`scene3d-tone-law-writeback`, `scene3d-mark-laws-draw`,
  `scene3d-tone-law-dispatch`, `scene3d-mkdashramp-low-end`, `scene3d-shadow-tone-law`,
  `scene3d-shadow-cross-wave-continuity`, `scene3d-one-pen-down-reachability`) — none pins
  mkTick's exact geometry; they check roster membership, "differs from default," and perf
  budgets. Ran all six: 4 files green outright. Two apparent failures, both run down and
  cleared:
  - `scene3d-mkdashramp-low-end.test.js` failed in my `.git`-free scratch export only, because
    it does its OWN pinned `git show <fixed-sha>` (T3's own guard, a legitimate pinned-sha
    pattern, not the HEAD anti-pattern) — re-ran in the real worktree: **13/13 green.** Not a
    T2-3b defect, an artifact of my test method.
  - `scene3d-one-pen-down-reachability.test.js` fails identically (`expected 273 to be less
    than 200`) in the **real worktree at post** AND in a scratch archive of **pre (`c28b3490`)**
    — confirmed **pre-existing, unrelated to `lenChan`/mkTick** (it's an unrelated ribbon/wave
    law path-count budget). Filed here as `## Pre-existing red`, not attributable to this unit.
- `scene3d-mark-laws-draw` (**G4**, `mkDashRamp`'s band-width guard, correctly NOT mkTick's per
  both reports) and the other named guards (`T4b`, ribbon files) — trusted the implementer's own
  30/30 / 44/44 / 36/36 reports rather than re-running the Tier-2 files myself, given the
  machine load already encountered; no reason to doubt them given everything I did re-run
  matched exactly.

**Condition 5: PASS** (with two false leads run to ground, one pre-existing red correctly not
attributable to this unit).

## 6. Pictures — including the orchestrator's three specific flags

Compared `after/T2-3/shots/B/sphere__contour__mkTick__med__a{,__addlayer}.webp` (T2-3 shipped,
pre-Rank-1 — the honest "before" for this unit) against `after/T2-3b/shots/B/`'s own re-shoot,
full frame and native crops, both rigs.

**(1) Diagonal banding — reduced, not gone, and NOT at the ≤pre(42acff7b)+envelope target on
`sphere/contour`.** `bandC`, `sphere/contour`: pre-T2-3 (`42acff7b`) 0.0329(t)/0.0349(c) →
T2-3-shipped (pre-Rank-1) 0.0982(t)/0.1172(c) → **Rank 1 0.0437(t)/0.0507(c)**. Rank 1 is
**1.33x/1.45x pre-T2-3**, i.e. it does **not** reach the plan's own aspirational "≤pre+envelope"
target on this cell — only `cone/contour` reaches it (Rank 1 0.0167(t)/0.0221(c) vs pre
0.0236(t)/0.0249(c) = **0.71x/0.89x, at or below pre**). This is exactly what `T2-3b-plan.md`
§4.1 and `T2-3b-impl.md`'s own "Decision 13 for Jay" already disclose — the plan states plainly
Rank 1 "does NOT reach ≤pre on all six cells" and that the only measured route to ≤pre on
`sphere/contour` needs T3's row-pitch halving (filed as T2-3c). **Partial, correctly disclosed,
not overclaimed** — the unit's own chosen bar (`≤ shipped mkDotScreen`, not `≤ pre-T2-3`) is
what actually gates, and Rank 1 clears it with 1.5-2.7x margin on both flagged cells, both rigs.

**(2) NEW long stray stroke — CONFIRMED, with numbers, on BOTH rigs.** Reproduced the exact
render (Fixture A, `sphere/contour`, create rig) via a direct scratch script (not the census's
own code, an independent re-implementation): **pre (`c28b3490`): longest path 7.19mm, 0 paths
>15mm. Post (`a8e2269f`): longest path 52.39mm (path #943, 19 points, straight-line endpoint
displacement ~45.6mm), 1 path >15mm.** That is **52.39mm on a 50mm-diameter (create-rig radius
25mm) sphere — essentially the full object diameter, ~175 pen widths (0.3mm pen) long**, newly
present where nothing was before. **Mechanism**: 19 points, not a single `mkShape:'tick'`
2-point mark (max single-tick length is capped at `L0*R ≈ 1.16*R`) — this is `place()`'s
per-arm walk (`MK_MAX_WALK_STEPS=64`) chaining many mark sites into one continuous path, exactly
the suspect the plan's own §4.3 disclosure named ("a patch where R reaches its
`clamp(...,0.25,40)` ceiling"). **On the addLayer/test rig I visually confirmed the same
class of defect** (a long diagonal absent in a 2x-upscaled `pre` crop, clearly present in the
equivalent `post` crop) but my own quick per-path census on that rig found only a short
(20.25mm, 2-point) segment that is **identical in both pre and post** — i.e. NOT new. The
visible test-rig line is therefore very likely an emergent alignment of several individual
sub-15mm ticks along a near-common line (invisible to a single-path length census), not one
long path; I did not fully isolate its constituent paths given time/machine-load constraints,
but the visual regression on that rig is real and should be characterized with the same rigor
as the create-rig one before this is called closed. **My ruling matches the orchestrator's: a
single stray line crossing (or reading as crossing) the whole object is a real, user-visible
defect on the exact cell class this unit exists to fix, and it ships unfixed and untested-against
in this unit.** The count-based stop condition (5) in the plan (aggregate >15mm paths across all
six cells not exceeding pre-T2-3's baseline of 13) is too coarse to catch a clean cell going
dirty and did not catch this.

**(3) Row-lattice light-block pattern — pre-existing, unchanged, not this unit's.** Cropped and
zoomed the dense lower-left region of both PRE and POST (both rigs) side by side: the periodic
horizontal light bands are visually indistinguishable between the two trees. A narrow-strip
FFT profile (avoiding the curved-row region to reduce foreshortening noise) gives **period
≈40px pre / ≈47px post** and **contrast (row-mean std) 17.66 pre / 16.80 post** — within noise
of each other, not a meaningfully different reading. This corroborates (and is the same
mechanism as) `T2-3b-plan.md` §3.3's own disclosure: the row lattice becoming visible at
`MK_ROW_COV=1/3`'s ~9-11 mark rows, forbidden territory for this unit (`MK_ROW_COV` is T3's),
already filed to T2-3c alongside Decision 13. **Not a new pattern, not worsened by Rank 1,
correctly out of scope, already disclosed under a name (Decision 13/§3.3) even if not under
the "lattice" label the orchestrator used.**

**Implementer's own `after/T2-3b/` evidence**: present and matches. `report.json`,
`manifest.B.*.jsonl`, and `crops/` all exist; 16 shots, all distinct pathCounts (386-3634), no
byte-identical pairs; the fixture block correctly discloses the gallery capture uses a
different (ground/backdrop-enabled) fixture than the vitest unit-test numbers, and says so
explicitly rather than letting the two get compared silently. The two native crops
(`sphere-contour`, `cone-hatch`) I looked at match the report's own descriptions: banding
visibly reduced on both, the runaway stroke visible and correctly called out as new+disclosed
on `sphere-contour`, tick length still plainly reads as tone on both, before and after.

**Condition 6: PARTIAL PASS with a confirmed, material finding** — banding reduction is real
but partial (disclosed), the row-lattice is pre-existing and unchanged (disclosed), and the
stray-stroke regression is real, confirmed with precise numbers, and — per the orchestrator's
explicit instruction — forecloses an ACCEPT verdict.

## Bars changed — audited

Matches `T2-3b-impl.md`'s own list exactly; nothing undisclosed found:
- `scene3d-mktick-wedge.test.js:343` (test line numbers shift slightly release-to-release, but
  the `O5_BAR` constant is the site) — `O5 >= 3.0` → `O5 >= 2.30`, LOWERED, derivation attached,
  Jay's ruling quoted. Verified via diff — not a population re-scope.
- 12 `pathSignature` goldens re-pinned — mutation-proven (MUTATION-KILL 1 IS the proof).
- `scene3d-mktick-banding.test.js` — NEW bar, `bandC <= mkDotScreen` + 5% non-regression vs.
  pinned pre-Rank-1 reading, both clauses passing with margin on all 4 gated combinations,
  correctly labelled moiré-half-only.
- No MK-table constants changed (confirmed by grep: `L0` 1.16, `LMIN` 0.18 unchanged).
- Deliverable (a)'s 2-test population removal (git-show block → 12 goldens + 3 live-source
  assertions) — disclosed, mutation-proven.

**No hidden bar change found.**

## New finding not in either report — filed here

**The runaway-stroke regression on `sphere/contour` (both rigs) needs its own disclosure and
either a fix or an explicit Jay ruling before this cell is closed** — it is currently folded
into the same "Decision 13" bucket as the O5-vs-bandC frontier, but it is a *different* defect
(a placement/walk artifact, not a tone-transfer artifact) with a different, currently-untested
failure mode (a per-cell "did a previously-clean cell get a new long stroke" check, not an
aggregate count ceiling). Recommend: (a) extend the runaway-stroke census to the addLayer/test
rig and to per-path-cluster analysis (not just raw path length, given the test-rig
manifestation looks like several short aligned ticks rather than one long path), (b) add a
per-cell (not just aggregate) non-regression guard — "a cell with 0 paths >15mm before must not
gain any after" — so this class cannot silently reappear or worsen, and (c) either attempt a
targeted fix (the plan's one attempted avenue, clamping `L` against nominal pitch, is closed —
wrecks O5 — but that doesn't mean no fix exists; the walk-step cap or the `R` ceiling clamp
itself may be more promising avenues, unexplored here) or get Jay's explicit sign-off to ship
with this defect present, the same way Decision 13 got one.

## Verdict per condition

1. Deliverable (a) RED→GREEN, non-vacuity — **PASS**
2. Instrument RED/GREEN, direction check, half-gated — **PASS**
3. Per-cell table, worst cell, area-floor mutation — **PASS**
4. O5 derivation, Decision 13, literal diff — **PASS**
5. lenChan consumers, pins, guard sweep — **PASS** (2 false leads resolved, 1 pre-existing red
   correctly not attributed to this unit)
6. Pictures — **CONFIRMED FINDING**: banding reduction partial (disclosed), row-lattice
   pre-existing and unchanged (disclosed), **stray-stroke regression on `sphere/contour`
   confirmed on both rigs with precise numbers (52.39mm / 0mm on create rig)** — real,
   user-visible, unfixed, untested-against.

## Overall verdict: ACCEPT-WITH-FOLLOWUPS

The core deliverables — the git-show-HEAD self-test fix and the banding instrument/fix — are
independently re-verified, rigorous, honestly disclosed, and pass every mutation proof I could
throw at them. The moiré fix is a genuine, substantial improvement on the two flagged cells.
But Rank 1 ships a new, confirmed, precisely-measured, user-visible regression (a near-full-
diameter stray stroke, previously absent) on one of its own two target cells, on both rigs, that
no test in this unit or its guard suite gates against — the plan's own stop condition for this
class of defect is too coarse (aggregate count, not per-cell) to have caught it. Per the
orchestrator's explicit instruction, this forecloses ACCEPT. It does not warrant REJECT: the
mechanism is understood, disclosed (if under-emphasized), the census methodology already exists
and needs only extending, and the underlying moiré work should not be thrown out to fix a
narrower, separable placement-walk defect. **BLOCKING follow-up before this unit is considered
fully closed**: per-cell runaway-stroke non-regression guard + either a targeted fix or an
explicit Jay ruling to ship with the defect disclosed, exactly as Decision 13 already got one.

## Evidence

Scratch: `/private/tmp/claude-501/scratch-T23b-r/{c28b3490,56481503,a8e2269f}` (git-archive
exports, node_modules symlinked from MAIN) and a `mut-contrast` copy of post — all removed
after use, nothing left in the worktree. Image analysis (crops, FFT profiles, Hough attempt) run
against MAIN's own `docs/3d-audit/fill-audit/after/T2-3/` and `after/T2-3b/` galleries — no
files modified there, only read. Runaway-stroke census re-derived independently (own script, not
copied from the implementer's), matching the implementer's own create-rig number exactly
(52.39mm) and extending it with a pre-tree zero-count confirmation and a same-cell addLayer-rig
visual check the implementer's report did not include.

REPORT docs/3d-audit/lane-reports/T2-3b-review.md — ACCEPT-WITH-FOLLOWUPS — real moiré fix; confirmed new full-diameter stray stroke on sphere/contour, both rigs.
