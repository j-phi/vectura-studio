STATUS: ACCEPT-WITH-FOLLOWUPS

# T2-6 — adversarial review

Lane `fill-audit-a4`, worktree `.claude/worktrees/fill-audit-a4` (READ-ONLY throughout except
for two foreground vitest runs of `scene3d-mkdashramp-single-pass.test.js`/`-low-end.test.js`,
which require real git history for their own `git show <sha>` mutant fixtures and cannot run
against a `git archive` scratch export — no file was edited, staged, or committed;
`git status --short -- . ':!graphify-out'` empty before and after). Pin reproduced exactly:
`git log --oneline f0b0b0c8..0f420747` shows exactly one commit, `0f420747`, touching exactly
the five files the implementer disclosed (`surface-fill.js`, `scene3d-mktick-band-purity.test.js`,
`scene3d-mktick-gap-fill.test.js` + its helper, `scene3d-mktick-wedge.test.js`). Reviewed against
`AGENT-PROTOCOL.md`, `ROUND3-RESUME-BRIEFS.md` §0/§0b, `T2-6-impl.md`, `after/T2-6/report.json`,
`T2-6-plan.md` (A1/A2/A3 oracles, Rank 1, the gate table, §4.4 dial cliffs, §6 the unit), and
`T2-5-review.md` §3 (baseline: clause (a) NOT delivered by T2-5, 0 fragments removed, 0 gap area
closed, "the picture did not move"). Jay's clause (a), verbatim (`SESSION-SUMMARY.md` §4): *"Instead
of tick fragments on the right, use gradually shortening ticks to fill the black gaps at the bottom
of the vertical waves. Also don't increase overlap at the seams. And remove any lines not part of a
tick band."*

**Method.** Scratch `git archive` exports at `/private/tmp/claude-501/scratch-T26r/pre` (`f0b0b0c8`)
and `/post` (`0f420747`), plus `/private/tmp/claude-501/scratch-T26-red` (`75777240`, T2-6's own
declared base for its PRE reconstruction — confirmed by diff that the tick block is byte-identical
between `75777240` and `f0b0b0c8`, since T3c touched only `mkDashRamp`'s length branch). `node_modules`
symlinked from MAIN. All vitest runs foreground, one file per command, `timeout: 600000`. Four capture
runs via MAIN's `scripts/audit/scene3d-capture.js --tier B --root <scratch>`, ports 8495-8498, all
killed after (confirmed via `lsof`, no leftover listeners). Shots for all six `mkTick/med/a` cells,
both `--rig create` and `--rig addLayer`, pre and post, landed under
`docs/3d-audit/fill-audit/after/T2-6/review/`. No file in the worktree, MAIN's `src/`/`tests/`, or
`docs/3d-audit/fill-audit/after/T2-6/` (the implementer's own evidence dir) was written.

---

## Condition 1 — RED/GREEN + mutation for A1, A2, A3

**RED reproduced.** `tests/unit/scene3d-mktick-gap-fill.test.js`, run on the POST tree: **44/44 PASS**
(matches claim exactly), including the base-sha string-match proof, the byte-for-byte semantic PRE
reconstruction (rendering through the hand-maintained `PRE_TICK_BLOCK` matches a real `git archive
75777240` render on all 12 fixtures), the instrumentation-neutrality proof (hooked POST source ==
unmodified disk source, all 12 fixtures), and the `RED at the PRE-fix` describe block, which encodes
the pre-fix failure as its own passing assertions (`A1b` bar fails on `>= 10` of 12, `A1` bar fails on
all 10 named cells, `A1_combGraded === 0` everywhere pre-fix). I independently confirmed the base-sha
equivalence claim by diffing `75777240..f0b0b0c8` on `surface-fill.js` myself: the diff is 78 lines,
entirely inside T3c's `MK_DASH_LEN_FRAC` addition and the `mkDashRamp` elongation branch — it never
touches `if (law.shape === 'tick')`, so `PRE_TICK_BLOCK`'s claim to represent "this unit's own base
sha" is correct regardless of which of the two nearby commits is named. I read
`tests/helpers/scene3d-mktick-gap-fill.js` in full: the A1 STRICT-monotonicity + `min/max >= 0.5`
gate, the A1b longest-bare-run-in-band computation, and the neutrality check all faithfully implement
`T2-6-plan.md` §2's definitions — no widened tolerance, no vacuous population.

**GREEN independently reproduced.** Both mutation-kills ran and passed as part of the 44:
`MK_TICK_COMB_RHO = 1.0` (flat comb) — the test's own oracle math is strict-monotone-only, so this
correctly drops `A1_gradedGapShare` below shipped while `A1_combSites` stays nonzero (proving the
oracle reads "gradually SHORTENING", not "more than one tick," exactly what item 2's brief demanded).
`MK_TICK_COMB_MAX = 1` (no comb ever fires) — `A1b_bareRunP95` returns to `>= 0.48` on `cone/hatch`,
both rigs, reproducing the pre-fix black-gap size. I did not additionally hand-roll a third, fully
independent oracle script (attempted one; it stalled on a live-render hang after ~15 min of near-zero
CPU and was killed rather than let it eat further budget) — the RED/GREEN proof above rests on
re-running the implementer's own test file (verified line-by-line, not merely re-executed) plus the
independent base-sha diff, which is a materially different, and sufficient, check.

**Which words of Jay's clause each half gates**, stated in the test file's own header and confirmed
accurate: A1/A1b/neutrality gate **"use gradually shortening ticks to fill the black gaps"** only. They
say nothing about "don't increase overlap at the seams" (T2-5's `ovMax`, condition 4) or "remove any
lines not part of a tick band" (T2-5's `over2RP`, condition 4). A2/A3 are explicitly REPORTED, not
gated, per the plan's own inversion warning (A2n necessarily rises when gaps are filled with shorter
ticks) — correctly not treated as blocking.

Guard reproductions, run by me on the post tree: `scene3d-mktick-band-purity.test.js` **35/35 PASS**
(298.96s, one benign pre-existing `onTaskUpdate` RPC timeout noted in `ROUND3-RESUME-BRIEFS.md` §0b,
exit 0) and `scene3d-mktick-wedge.test.js` **58/58 PASS** (12.95s) — both match the impl's claims
exactly.

---

## Condition 2 — "O1 sagitta misses bar 2%, unfixable in-scope"

**Reproduced exactly.** `tests/unit/scene3d-mark-laws-draw.test.js` on the POST tree: **29/30**, one
failure — `O1 — a tick sagittas across a curved surface: torus/contour ticks are no longer a straight
chord`, `expected 0.09794838126911516 to be greater than or equal to 0.1`. This is the implementer's
disclosed number to full float precision (`0.09795`, "2.05% miss"), independently re-derived, not
copied. **Bar** = `test|torus/contour`, d=50, mkTick — matches the disclosed fixture exactly.

**Confirmed this is a T2-6-caused regression, not pre-existing.** I ran the same test (`-t "O1"`)
against the PRE tree (`f0b0b0c8`, T3c, before this unit's own diff): **1/1 PASS**. So the miss is real,
caused by this unit, and did not exist before it.

**Disposition: honest stop-report, not a hidden regression.** (1) `scene3d-mark-laws-draw.test.js` is
explicitly named in `T2-6-plan.md` §6.2 Files FORBIDDEN / §5.5 as "T4/W-36c's oracle, NOT this unit's
file" and the plan told the implementer in advance to "run that file and report the margin, not
assume it" without ruling it a stop condition. (2) The root-cause explanation (the comb shortens
exactly the longest-chord-third population O1 measures; some combed sub-ticks fall to a 2-point,
zero-sagitta walk and drop out of that population) is mechanically sound given the diff I reviewed —
the comb literally replaces one long tick with two shorter ones, and a shorter tick is more likely to
walk as a straight 2-point chord on a curved surface. (3) No tolerance was widened, no population was
narrowed to hide it — `report.json`'s own `findings_not_fixed.O1_sagitta_margin_miss` states the exact
number, the bar, the cause, and "reported, not tuned." This is what AGENT-PROTOCOL calls "stop-and-
report beats a fudge," done correctly. **This is genuinely T2-6's regression to own** (it did not exist
before this commit, mechanically follows from this unit's own change, and no other unit in this chain
touches the comb) — the file itself belongs to T4/W-36c, but the RED test that now fails there is
T2-6's to carry as an open item, which the report does, by name, with the exact margin. Not a REJECT
trigger; a legitimate open follow-up that blocks nothing in this unit's own gate table.

---

## Condition 3 — ORCHESTRATOR PICTURE FLAG

**Confirmed, and materially more visible than either report's prose suggests — this is the most
important finding of this review.**

Captured all six `{sphere,torus,cone}x{hatch,contour}/mkTick/med/a` cells, `--rig create`, pre vs
post, both from my own scratch exports (native 627x749, matching the plan's own fixture size). At
**whole-object, unzoomed viewing scale** — not only at 3-6x crop zoom — four of six cells
(`sphere/hatch`, `torus/hatch`, `sphere/contour`, `cone/hatch`) show the same character change: the
pre-fix transition zone reads as a diffuse field of scattered, irregular-length stub ticks (the
"punctured" texture both reports describe); the post-fix transition zone instead shows one or more
crisp, straight-edged, **blocky rung/ladder-shaped bands** of near-uniform-length combed sub-ticks,
cut off at a hard, visually continuous diagonal edge. On `sphere/hatch` in particular (see
`docs/3d-audit/fill-audit/after/T2-6/review/shots/contact_sphere__hatch__mkTick__med__a.png` and the
tighter crop `B_post_create/sphere_hatch_crop_x3.png`), this reads as a large, sharply-bounded dark
parallelogram/rung shape — a **new, geometrically regular artifact that is arguably more visually
salient than the scattered fragments it replaced**, not less. `torus/contour` and `cone/contour` show
this only weakly or not at all (`create|torus/contour` is one of the two cells where `bandOn` gates the
comb off entirely, matching the disclosed exception; `cone/contour` shows a milder version of the same
rung structure). The pattern reproduces identically on `--rig addLayer` (`cone/hatch`, both rigs
compared — same crisp rung structure appears on the sparser test-rig cone too).

**This is exactly the "STAIR-STEPPED comb edges and bracket-like shapes... fragments persist... gaps
now appear as diagonal steps" description in the caller's flag, independently confirmed by direct
image inspection, not inferred from the numbers.**

**Compared directly to the plan's own prototype picture.** `T2-6-plan-evidence/
crop_midright_x4_HEAD_top_F3_bottom.png` (HEAD on top, "F3"/Rank-1 prototype on bottom) shows the
**identical signature** — a clean diagonal black channel bounded by a straight-edged run of graded
ticks — on `cone/hatch/create`. **The shipped output is faithful to the plan's own reviewed
prototype; this is not an undisclosed implementer deviation.** The plan's own §4.6 already names this
phenomenon ("thin channels that run WITH the rows... legible as pairs") and judges it positively. So
the character change is disclosed, in both the plan and the impl report, in almost identical language
— but both documents characterize it as an unambiguous improvement, and neither explicitly flags that
the resulting shape reads as a *new, more geometrically regular* defect class rather than a reduction
of the old one. My own direct look, especially on `sphere/hatch` (not `cone/hatch`, the cell both
reports focus on), finds the "new artifact" reading the stronger of the two on at least that one cell.

**Instruments that measure adjacent quantities do not contradict this, and do not resolve it either.**
`bandC` (the directional/moiré banding oracle, a much coarser row-scale FFT-style instrument) falls
27-34% on the flagged cells and passed its own mutation-kill proofs when I re-ran
`scene3d-mktick-banding.test.js` (22/22). `A2loc` (isolated-fragment count) is roughly flat. The raster
bare-pixel count and `A1b` both fall substantially. **None of these instruments are built to ask "does
the residual defect read as a new regular/ruled pattern" — they all ask "how much bare area is there"
or "is there a broad diagonal light/dark sweep across many rows."** A crisp, straight-edged rung shape
inside one band's own transition, at sub-row scale, is invisible to `bandC` the same way `wedge25` was
already disclosed (§1.3) to be blind to the cross-row direction. This is a real gap between what is
measured and what the picture shows, of the same kind (if smaller in degree, since the total defect
area genuinely shrank) as the gap T2-5-review found.

**Plain answer to the caller's question:** the after reads as **both** — it IS mechanically "gradually
shortening ticks" (proven by construction and by the strict-monotone oracle), but the picture, read as
an artist, shows a **new class of artifact** on at least `sphere/hatch`: a crisp, ruled/ladder-like
shape that a viewer's eye catches faster than the diffuse scatter it replaced, not a smooth taper. This
does not mean clause (a) is "not delivered" the way T2-5's was (the black-gap area and the along-row
grading both genuinely improved, independently confirmed by every instrument checked) — but it means
the picture has not simply "gotten better," it has changed CHARACTER, and that character has not been
put in front of Jay's own eye yet. Recommend this specific crop set
(`sphere/hatch` whole-object and the 3x crop) be the first thing shown at the next eye-check.

---

## Condition 4 — No regression

Independently re-run, foreground, one file per command, from my own scratch POST export unless noted:

| file | claimed | reproduced |
|---|---|---|
| `scene3d-mktick-band-purity.test.js` | 35/35 | **35/35** |
| `scene3d-mktick-wedge.test.js` | 58/58 | **58/58** |
| `scene3d-mktick-runaway.test.js` | 37/37 | **37/37** |
| `scene3d-mktick-banding.test.js` (incl. the flagged `test|sphere/contour` +6.5% vs x1.05 clause) | 22/22 | **22/22** — the flagged cell's own assertion is inside this green run, so the risk `T2-6-plan.md` §4.4/§6.4 raised is confirmed cleared, not silently skipped |
| `scene3d-mark-laws-draw.test.js` (O1, G4, T4b) | 29/30 | **29/30**, exact number matches, confirmed a genuine new regression vs the pre tree (condition 2) |
| `scene3d-mkdashramp-single-pass.test.js` | 32/33 (combined w/ -low-end, per report) | **19/20** (this file alone; run in the WORKTREE itself, read-only, since its own mutant fixture uses `git show <sha>`, which fails against a `git archive` scratch export with no `.git` — confirmed the worktree was left clean by `git status` before/after) |
| `scene3d-mkdashramp-low-end.test.js` | (combined above) | **13/13**, worktree, read-only |
| combined | 32/33 | **32/33** — matches exactly; the one failure is the disclosed `mkTick is unaffected` sub-test in `-single-pass`, whose own mutant fixture (`b43fa4e3`, T3b's base sha) predates T2-5 and so necessarily diverges once mkTick changes at all — confirmed a naming/scope artifact, not a real `mkDashRamp` regression, by the independent roster-sweep evidence below |

Not independently re-run (budget): `scene3d-style-fill-lines.test.js`,
`scene3d-ladder-uniform-field-spacing.test.js`, `scene3d-ribbon-width-bar.test.js` +
`-fill-depth-count.test.js`, `-f1b-streaks.test.js`, `-wall-coverage.test.js`,
`-crosshatch-cell-shape-b.test.js`, `-curved-density-floor.test.js`, and the Tier-1
`scene3d-tone-law-collapse.test.js`. All are structurally unreachable by this unit's diff (confirmed:
`grep -c "shape: 'tick'"` inside the `MK` table returns 1, and this unit's whole diff sits inside that
one branch), which is the same structural argument `T2-5-review.md` §5 already accepted as sound
corroboration (not a substitute for measurement) for exactly this class of file. Flagging as
NOT independently confirmed rather than silently assuming green.

**`ovMax`/clause (b):** confirmed algebraically sound from the diff (every combed sub-tick's own fit
condition `a0 <= ENV*R/n` guarantees it never crosses its own sub-band boundary, so `ov = 0` for every
combed sub-tick by construction; unsplit sites keep T2-3's byte-identical single-tick stagger) and
confirmed via the passing `scene3d-mktick-wedge.test.js` run (58/58, O-B's own assertions included,
file diff shows no change to the `ovMax`-scoring code).

---

## Condition 5 — Sweep + bars

**`## Bars changed` verified byte-for-byte against the actual diff**, not trusted from prose:

- `scene3d-mktick-wedge.test.js:359-372` `EXPECTED_SIGNATURE` — diffed myself: **all 12 of 12**
  `pathSignature` goldens changed, matching the disclosed list exactly, `O5_BAR`/`WEDGE_MEAN_BAR`/
  `WEDGE_CELL_CEILING` unchanged in the diff. ✅ accurate.
- `scene3d-mktick-wedge.test.js:181-198` `STAGGER_NEEDLE_TILED`/`STAGGER_REPL_TILED` — confirmed removed
  in the diff (the branch it targeted no longer exists), `STAGGER_NEEDLE_SINGLE` confirmed unchanged.
  ✅ accurate, correctly labelled a population narrowing under standing rule 6.
  ✅ accurate.
- `scene3d-mktick-band-purity.test.js:132-222` `POST_TICK_BLOCK_INSTRUMENTED` rewrite and the
  `nSub`->`nOver` mutation-kill needle rename — both confirmed present in the diff, both match the
  disclosed reasoning (the file's own instrumentation-neutrality self-test is what caught the original
  silent-staleness bug, and that self-test passed in my own run). ✅ accurate.
- `src/core/scene3d/surface-fill.js` four new `MK_TICK_COMB_*` constants — confirmed present, each with
  an inline comment naming its own measured trade, matching `T2-6-plan.md` §4.4's table. ✅ accurate.

**Roster sweep.** I independently re-ran the roster-sweep sub-test inside
`scene3d-mktick-band-purity.test.js` (part of the 35/35 above): **cone/create, 3 mappers x 37
PRODUCTION laws (~111 cells), only `mkTick` changes, zero non-`mkTick`** — matching the implementer's
own claim for that sub-scope exactly. I did **not** independently re-run the full disclosed 4-combo x
8-mapper x 37-law = 1184-cell sweep myself (would cost roughly 4x the ~300s single-combo run I already
paid for, a poor use of remaining budget against a claim that is: (a) structurally forced by the
`grep -c "shape: 'tick'" === 1` invariant, confirmed by me directly on the post tree; (b) internally
consistent with the one combo I did reproduce; (c) the exact same reduced-but-justified verification
depth `T2-5-review.md` accepted as sufficient for a materially identical claim). Flagging as NOT fully
independently reproduced at full scope rather than silently assuming it.

**`mkDashRamp` byte-identity (18/18 claimed).** Not independently re-run as a standalone 18-combination
script. Partially corroborated: the roster sweep above (which covers `mkDashRamp` as one of the 37
PRODUCTION laws) shows zero non-`mkTick` cells changed in its own 111-cell scope, and
`scene3d-mkdashramp-low-end.test.js`'s own d=50/d=220 byte-identity assertions passed in my run.
Flagging the full 18-combination claim as corroborated-but-not-independently-reproduced at its exact
disclosed scope.

---

## Condition 6 — PICTURES

All six `mkTick/med/a` cells captured, both rigs, pre vs post, native resolution
(`docs/3d-audit/fill-audit/after/T2-6/review/shots/`). Findings folded into condition 3 above (the
picture read is the central finding of this review, not a separate footnote). Additionally:

**Clause (a), plain words:** on `cone/hatch` and `cone/contour` (both rigs) the after genuinely reads
as gaps filled with a taper, closely matching the plan's own prototype crop. On `sphere/hatch` the
after reads as a NEW crisp ladder/rung defect that is at least as visually noticeable as the scatter it
replaced — a materially different verdict from `cone/hatch`'s. On `create|torus/hatch` and
`create|torus/contour` the after is visually unchanged (the `bandOn` gate correctly disables the comb
there, confirmed by direct side-by-side comparison), matching the disclosed exception exactly, not a
silent omission.

**Clause (b), overlap at seams:** unchanged, confirmed algebraically and by the passing wedge-test run
(condition 4). No picture evidence contradicts this — no new overlap/crossing artifact is visible at
any seam I inspected.

**Clause (c), lines not part of a tick band:** unchanged from T2-5 (this unit does not touch `nOver`),
confirmed by the passing `over2RP = 0/12` assertions inside `scene3d-mktick-band-purity.test.js`
(condition 1/4).

---

## Overall verdict

**ACCEPT-WITH-FOLLOWUPS.** The mechanism is real, the neutrality proof is exact (verified
algebraically and by a passing blocking test), the RED/GREEN proof is sound and independently
reproduced (not merely re-run — the base-sha equivalence and the oracle math were checked by hand),
both mutation-kills are real and correctly target "gradually SHORTENING" rather than "more than one
tick," no regression bar was widened, every `## Bars changed` entry is accurate against the actual
diff, the one new red (`O1`, condition 2) is honestly disclosed with the exact margin and a sound
root cause, and clauses (b)/(c) are genuinely held invariant. **This is a real, disclosed, honestly
measured improvement over T2-5, which delivered nothing on this clause.**

But the caller's ORCHESTRATOR PICTURE FLAG is **substantively correct, and my own independent capture
finds it more pronounced than either the plan or the impl report's prose suggests** — on `sphere/hatch`
in particular, the shipped mechanism trades a diffuse, low-salience scatter defect for a crisp,
geometrically regular rung/ladder defect that a viewer notices faster, not slower. This is the
shipped, reviewed, spike-gated Rank-1 mechanism working exactly as designed and exactly as the plan's
own prototype picture already showed — it is not a hidden implementer deviation, and REJECTing it would
not produce a better mechanism (the plan's own §4.5 measured and rejected every alternative shape). The
right disposition is what the caller's own instructions anticipate: ship the measurement, and put the
picture — specifically `sphere/hatch`, not only `cone/hatch` — in front of Jay before this is called
"delivered."

**The lane may merge as a checkpoint.** Nothing here should block landing this commit into the round's
integration branch: the numbers are honest, the regressions are disclosed and scoped, and reverting
would restore T2-5's own "picture did not move" state, which is strictly worse. It should not be
represented to Jay as "clause (a) is now closed" without first showing him the `sphere/hatch` crop
alongside `cone/hatch`'s.

### Follow-ups (non-blocking, carried to the next round)
1. **P0 — show Jay `sphere/hatch`, not only `cone/hatch`, at the next eye-check.** The two cells read
   differently; `cone/hatch` is the more favourable one and both reports lead with it.
2. **O1 sagitta (`scene3d-mark-laws-draw.test.js`, torus/contour, 2.05% miss)** needs an owner. It sits
   in a file outside this unit's scope but is caused by this unit; the next planner should decide
   whether to accept the miss, adjust `SUB_MAX`/`SPLIT_MIN_R` against the full §4.4 table again, or
   re-scope O1's own population (with disclosure, per standing rule 6).
3. **Full 1184-cell roster sweep and the 18-combination `mkDashRamp` byte-identity claim** were not
   independently reproduced at their full disclosed scope in this review (partial/structural
   corroboration only) — a future unit touching the `MK` table's `shape` field should re-verify before
   relying on this precedent, per `T2-5-review.md`'s own follow-up 3.
4. **Consider a picture-character instrument**, not just a picture-area instrument, for this class of
   defect — `bandC` and `wedge25` both measure "how much" and neither measures "does the residual
   defect read as a new regular pattern," which is exactly the gap condition 3 found.

REPORT docs/3d-audit/lane-reports/T2-6-review.md — ACCEPT-WITH-FOLLOWUPS — mechanism real/honest; sphere/hatch shows a new rung-shaped artifact, show Jay before calling (a) closed
