STATUS: ACCEPT-WITH-FOLLOWUPS

# T3 review — mkDashRamp LOW-density row-coverage floor (user-reports/10.png)

- **Role:** adversarial reviewer, READ-ONLY.
- **Pinned range:** `8780e97c..64b160a0` on branch `3d-scene/fill-audit-a3`.
- **Worktree read from:** `.claude/worktrees/fill-audit-a3` (read-only; never edited/stashed/reset).
- ⚠ **Operational finding, not a T3 defect (see "A note on the worktree" below): the worktree was
  found DIRTY mid-review** — a concurrent session was actively editing `surface-fill.js` with an
  unrelated "W-31b" prototype and had added an untracked `tests/unit/zzw31b-measure.test.js`. This
  transiently produced a false failure (`scene3d-curved-density-floor.test.js`, crosshatch mapper
  pinned count 22→21) when I first ran a guard directly in the worktree. **All numbers in this report
  are from a `git archive`/`git clone` export pinned to the exact commits, immune to that
  contamination** — see the method note under condition 1.

## Method

- `mkdir -p /private/tmp/claude-501/scratch-T3/{pre,post}`, `git -C <worktree> archive 8780e97c | tar -x -C .../pre`, `git -C <worktree> archive 64b160a0 | tar -x -C .../post`, `node_modules` symlinked from MAIN.
- Additionally cloned the worktree (`git clone --local --no-hardlinks <worktree> .../gitclone`, `node_modules` symlinked) to get a git-aware, contamination-immune checkout for guard reruns and one ad-hoc spot-check spec (`zz-t3-review-spotcheck.test.js`, written, run, then deleted — no probe files left in the reviewed worktree or in MAIN).
- Vitest 3.2.6, Node (repo `.nvmrc` v20.20.2 environment), every run foreground with generous timeouts, one file at a time.
- Evidence captures: `node scripts/audit/scene3d-capture.js --tier B --root /private/tmp/claude-501/scratch-T3/gitclone --port 8495 --rig {create,addLayer} --out docs/3d-audit/fill-audit/after/T3/review`, port killed after use.

## Condition 1 — RED/GREEN + mutation proof (BLOCKING)

**GREEN.** Reproduced in the git-clone checkout (immune to the worktree's live contamination):

- `tests/unit/scene3d-mkdashramp-low-end.test.js`: **13/13** at `64b160a0`.
- `tests/unit/scene3d-mark-laws-draw.test.js`: **30/30** at `64b160a0` (unchanged count from T4's own 30/30).

**RED, re-derived** (the test's own mutation-kill runtime — `loadVecturaRuntime({ scriptOverrides })` with `rowFloor: true` string-stripped from `mkDashRamp`'s `MK` entry — reproduces the pre-fix tree exactly, since T3's entire diff is gated on that one flag):

- O6 mutation-kill: `marks=7, rows=3` at d=1, sphere/hatch — **exact match** to the plan's/report's claimed pre-fix 7.
- O7 mutation-kill: sequence `[7, 7, 6, 12, 73]` at d={1,5,10,25,50}, sphere/hatch, with a real drop at d=5→d=10 — **exact match**.

I additionally reproduced the count sweep independently via the mutation technique inside a throwaway spec (not the report's own test) and got the same numbers; a bare-`node` script attempting the same via two sequential `loadVecturaRuntime()` calls outside vitest hung indefinitely on this shared machine (killed after several minutes, 0.3% CPU) — this is an environment quirk of running the helper outside vitest, not a project defect, and is why my independent reproduction runs through vitest specs instead.

**Monotonicity, GREEN tree:** sphere `[46, 46, 62, 63, 73]` (d=1/5/10/25/50), torus `[37, 51, 70, 77, 79]` — both non-decreasing, confirmed by the passing `O7` `test.each` in the 13/13 run above.

**Verdict: MET, blocking condition satisfied.**

## Condition 2 — orchestrator picture flag ("bundle of 6–8 parallel passes")

**CONFIRMED by eye and by number — but NOT caused or worsened by T3.**

Captured `sphere/hatch/mkDashRamp/low`, both rigs, from the git-clone checkout at `64b160a0`:
`docs/3d-audit/fill-audit/after/T3/review/shots/B/sphere__hatch__mkDashRamp__{low,med,max}__a{,__addlayer}.webp`, plus torus. Cropped at native and 2×/4× resolution.

**What I saw:** the full-frame low-density sphere (both rigs) shows 6 curving rows. A 4×-native crop of one bundle segment shows **6 clearly-separated parallel hairlines that all start and stop together** — i.e. each drawn "dash" a viewer would point to is actually a multi-line ribbon segment, not a single stroke. The darker/lower rows read as denser multi-line bands; the sparsest rows near the highlight taper to 1–2 lines. **This matches the ledger's description almost exactly.**

**Quantified (`lastMarkStats.pens / lastMarkStats.marks`, sphere/hatch/mkDashRamp, addLayer rig):**

| d | PRE (`8780e97c`, mutant) marks / pens / pens-per-mark | POST (`64b160a0`) marks / pens / pens-per-mark |
|---|---|---|
| 1 | 7 / 40 / **5.71** | 46 / 181 / **3.93** |
| 50 | 73 / 155 / 2.12 | 73 / 155 / 2.12 (byte-identical) |
| 220 | 575 / 575 / 1.00 | 575 / 575 / 1.00 (byte-identical) |

**This is the decisive finding: pens-per-mark at d=1 was already 5.71 PRE-fix and DROPS to 3.93 post-fix.** T3 does not introduce or thicken the multi-pass bundling — that mechanism (`layMark`'s morph `bandN`/`MK_BAND_MAX_PASSES=6` ramp) is T4's own, entirely untouched by T3's diff (T3 only changes `algoCoverage`'s `isMarkLaw()` return value and `solveAt`'s row-pitch divisor — never `layMark`, never `bandN`, never the pass-count logic). T3 adds ROWS; the newly-revealed rows near the sparse/highlight end draw thinner (fewer-pass) marks on average, which is why the ratio falls rather than rises.

**Is it "row-wide tiles"?** No — at native resolution there is substantial black background between adjacent row-bands and between duty-cycle segments within a row (see the crops); nothing here tiles edge-to-edge into a filled cell the way the original pre-T4 "F-06" slab defect did (T4's own report describes that as "wide, disconnected, hard-edged rectangular slabs", which is visibly not what these curving multi-line ribbons are). So under the task's own literal rule ("if it is tiles, REJECT even if the count bar passes"), **this does not trigger a mandatory reject** — it is not tiles.

**Is it "discrete dashes riding rulings"?** Not cleanly — a single "dash" reading as 2–6 simultaneous parallel hairlines is a different visual object than a classic single-stroke dash, and this is a legitimate, still-open half of Jay's original complaint. It is inherited from T4 (already shipped, already `DONE`), unaffected by T3, and outside T3's own stated scope (T3-impl.md never claims to change per-dash appearance, only row/count sparsity). **The ledger's "no bar measures passes-per-dash" is accurate** — I built the missing instrument as a throwaway spot-check above; it is not shipped as a guard.

**Ruling:** CONFIRMED-BUT-NOT-CAUSED-BY-T3. Converts to a **follow-up**, not a reject of this unit: file a dedicated passes-per-dash/bundle-width instrument and get Jay's eye on whether the T4-era banding mechanism itself satisfies "discrete dashes" — that is F4/T4's territory, not T3's.

## Condition 3 — d=50 / d=220 untouched

**Byte-identity CONFIRMED**, three independent ways:

1. `scene3d-mkdashramp-low-end.test.js`'s own non-regression `describe` (mutant vs. current tree, exact mark-count equality at d=50/d=220, sphere/torus/cone) — passed in the 13/13 clean run.
2. `scene3d-mkdashramp-dark-end.test.js` (T4b's own floor/ceiling): **4/4**, unchanged, reproduced in the clean git-clone checkout.
3. My own md5 spot-check (git-clone mutant vs. current tree, sphere/hatch/mkDashRamp, addLayer rig): `d=50: identical=true`, `d=220: identical=true`.

`scene3d-mark-laws-draw.test.js` **30/30** green (includes `G4` ×3 primitives and `O8`), reproduced clean.

**d=220 ink:** unchanged from T4/T4b's own reported number — `sphere/hatch/mkDashRamp/max`, create rig: **1501.1mm**, meeting Jay's ≥1500mm bar (confirmed unaffected by T3: pens-per-mark = 1.00 exactly, i.e. every "mark" at d=220 is a single-pass line, matching T4's own "even, legible gradient, no bundles" description — visually confirmed in `sphere__hatch__mkDashRamp__max__a.webp`, read directly).

**Verdict: MET.**

## Condition 4 — `scene3d-mark-laws-draw.test.js` +25/−6, enumerated

Read the full diff (`git -C <worktree> diff 8780e97c..64b160a0 -- tests/unit/scene3d-mark-laws-draw.test.js`). **Exactly one test is touched, nothing else in the file changes:**

- Test renamed: `'ink is monotone non-decreasing d=1 -> 50 -> 220 (sphere/hatch) ...'` → `'ink is monotone non-decreasing med -> max (sphere/hatch) ... (T4, unaffected by T3)'`.
- Body: `expect(med).toBeGreaterThan(low);` **removed**, replaced by `expect(low).toBeGreaterThan(0);`. `expect(max).toBeGreaterThan(med);` is **unchanged** (T4's own half of the chain, still gated).
- The remaining ~20 inserted lines are a comment block explaining the rescope (matches the `## Bars changed` prose in T3-impl.md/report.json nearly verbatim).

This is **exactly and only** the bar change disclosed under `## Bars changed` in both the report and (per the commit message header) the commit body. No other numeric literal, population, or fixture in this file moved. **Disclosure is accurate and complete — PROVEN, not merely trusted.**

## Condition 5 — byte-identity sweep, coverage as a fraction

The report's own claim: `MARK_LAWS` lists 12 raw internal shapes; only 4 (`mkDotScreen`, `mkTick`, `mkDashRamp`, `mkScribble`) are members of the current `SCENE3D_TONE_LAWS` roster; the other 8 fall back to `ladder` and are excluded for that reason. The shipped sweep covers `mkDotScreen`, `mkTick`, `mkScribble`, `ladder` × 3 primitives × 3 densities = 36 cells (addLayer rig) + 12-cell create-rig spot check, **0 mismatches** — reproduced clean (13/13 run above includes both).

**Independent extension I ran** (own throwaway spec, git-clone checkout, mutant-vs-current md5 comparison, sphere/hatch, d=1/50/220): `contFieldPitch`, `contFieldTouch` (both also fall back to `ladder` — confirms the same reachability limit extends to the `contField*` family, consistent with the isolation argument), `fineLadder`, `phaseFineLadder`, `ladder` — **all 5×3=15 cells byte-identical, 0 mismatches.**

**Structural confirmation from the source itself:** `contField*` laws resolve through an entirely separate hardcoded coverage table (`surface-fill.js:4756–4761`, `contFieldPitch: 1, contFieldEase: 1, ...`) that never calls `markRowCoverage()` — `algoCoverage`'s `isMarkLaw()` gate means non-mark tone laws never reach the branch T3 touched at all. This is why the sweep — both the shipped one and my extension — shows uniform zero-mismatch: it is structurally guaranteed, not merely measured-and-lucky.

**Verdict: MET**, coverage stated honestly as a fraction (4/12 reachable mark laws; contField/ladder family independently confirmed isolated by both code-path inspection and measurement).

## Condition 6 — lane red set at `64b160a0`

- `scene3d-mktick-wedge.test.js`: **44 passed / 2 skipped / 1 FAILED FILE** (the `git show HEAD:` self-test) at BOTH `8780e97c` and `64b160a0` — checked out and reran each commit explicitly in the git-clone. **Identical.** Correctly attributed to T2-3b, not T3.
- `scene3d-ribbon-f1b-streaks.test.js`: **44/44**, clean.
- `scene3d-ribbon-wall-coverage.test.js`: **36/36**, clean.
- `scene3d-ribbon-width-bar.test.js`: **10/10**, `scene3d-ribbon-width-create-rig.test.js`: **12/12** (two spot-checked as asked; both green).
- Also reran `scene3d-ribbon-f1-amp.test.js` **47/47** and `scene3d-curved-density-floor.test.js` + `scene3d-curved-density-sparse-end.test.js` **14/14 + 20/20** in the clean git-clone (these are exactly the guards that gave a false failure when I first ran them in the live, contaminated worktree — see "Operational finding" above).

**Verdict: MET**, unchanged except as attributed.

## A note on the worktree (not a T3 finding)

Partway through this review, `.claude/worktrees/fill-audit-a3`'s working tree became dirty (`surface-fill.js` modified, +241/−11 vs. `64b160a0`, plus a new untracked `tests/unit/zzw31b-measure.test.js`) — clearly a different, concurrent "W-31b" effort landing in the same shared worktree while I was reading it. I never edited, staged, or reset anything there. The only consequence was that guards I ran *directly in the worktree* after that point (`scene3d-curved-density-floor.test.js` showing a spurious 21-vs-22 crosshatch mismatch) reflected the concurrent edit, not T3. I re-verified everything material via `git archive`/`git clone` at the pinned shas, which are immune to a dirty working tree by construction; all such reruns are clean and are what this report cites. Flagging this for the orchestrator per the "one active workstream per worktree" rule — it is a process hazard on the shared lane, not a defect in `64b160a0`.

## Follow-ups (non-blocking)

1. **No instrument measures passes-per-dash / bundle width.** The multi-pass-ribbon appearance is real, visually confirmed, and is the "other half" of Jay's original complaint — but it is T4's own inherited mechanism, unaffected and not worsened by T3 (pre-fix pens-per-mark at d=1 was 5.71, higher than post-fix's 3.93). File a dedicated instrument + get Jay's eye on whether T4's banding, now revealed at more densities by T3, actually reads as "discrete dashes." This should NOT block T3, which answers a different, narrower, correctly-scoped bar (count + monotonicity).
2. Torus at d=1 (37 marks) sits just under the sphere's 40-dash bar — already disclosed by the implementer as a secondary, non-gated check (the bar was stated for the 40mm sphere specifically).
3. `scene3d-mktick-wedge.test.js`'s known-red self-test (T2-3b's) remains open, unrelated to and untouched by T3.
4. 8 of 12 raw `MARK_LAWS` internal shapes are dead code (unreachable via the current roster) — pre-existing, orthogonal to this unit, worth its own cleanup/wire-in decision if anyone wants it.

## Verdict

**ACCEPT-WITH-FOLLOWUPS.** All six conditions are met on their own terms; the picture flag is confirmed as an accurate visual description but is proven (quantitatively: pens-per-mark 5.71→3.93 at d=1) to be inherited from T4 and not worsened by T3, and the defect is not "tiles" by the gap/fill criterion the task specifies — so it does not trigger the conditional REJECT. Ship T3 as-is; carry follow-up 1 forward as its own unit.

REPORT docs/3d-audit/lane-reports/T3-review.md — ACCEPT-WITH-FOLLOWUPS — bundle flag confirmed but T4-inherited, not T3-caused (pens/mark 5.71→3.93); all 6 conditions met.
