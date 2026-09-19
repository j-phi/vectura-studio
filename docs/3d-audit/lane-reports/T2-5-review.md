STATUS: ACCEPT-WITH-FOLLOWUPS

# T2-5 — adversarial review

Lane `fill-audit-a4`, worktree `.claude/worktrees/fill-audit-a4` (READ-ONLY throughout —
never edited/stashed/reset; `git status --short -- . ':!graphify-out'` empty at start and
end). Pin reproduced exactly: `git log --oneline 7ef20455..75777240` shows exactly one
commit, `75777240`. Reviewed against `T2-5-plan.md`, `T2-5-impl.md`,
`after/T2-5/report.json`, `AGENT-PROTOCOL.md`, `ROUND3-RESUME-BRIEFS.md` §0/§0b, and Jay's
verbatim rule (`SESSION-SUMMARY.md` §4): *"Instead of tick fragments on the right, use
gradually shortening ticks to fill the black gaps at the bottom of the vertical waves. Also
don't increase overlap at the seams. And remove any lines not part of a tick band."*

**Method.** Scratch `git archive` exports at `/private/tmp/claude-501/scratch-T25r/pre`
(`7ef20455`) and `/pre-hooked`/`/post`/`/post-hooked`/`/post-L0105` (`75777240` and two
scratch mutants), `node_modules` symlinked from MAIN, never touching the worktree. All
vitest runs foreground, one file per command, `timeout: 600000`. Independent standalone
node scripts (not the implementer's own test files) reproduced the headline numbers using
raw drawn-path geometry (`p.meta.kind === 'sceneFill'`, actual polyline length) — a
methodology independent of, and stricter than, the implementer's own hook. Two capture
ports (8497/8498) used and killed; the worktree's own dev server on 8475 and MAIN's gallery
server on 8460 were left untouched (not mine, both pre-existing). No file in the worktree,
MAIN's `src/`/`tests/`, or `docs/3d-audit/fill-audit/after/T2-5/` was written.

---

## 1. Clause (c) — "remove any lines not part of a tick band" — VERIFIED, REAL FIX

Independent script (`p.meta.kind === 'sceneFill'`, drawn polyline length, RP from
`lastMarkStats.tickField.rowPitch`), run separately against the real `7ef20455` and
`75777240` trees, no instrumentation:

| fixture | PRE over2RP (count / mm) | POST over2RP | matches plan's HEAD table? |
|---|---|---|---|
| cone/hatch, create | **40 / 381.17** | **0** | yes, exact (plan: 40/381.2) |
| torus/contour, create | **18 / 180.04** | **0** | yes, exact (plan: 18/180.0) |
| cone/hatch, test | **57 / 545.23** | **0** | yes, exact (plan: 57/545.2) |
| torus/contour, test | **67 / 744.56** | **0** | yes, exact (plan: 67/744.6) |
| other 8 of 12 fixtures | 0 | 0 | unaffected, as claimed |

`otherPathCount` (non-`sceneFill`/`sceneEdge` paths) = 0 on both trees, all 12 fixtures —
independently confirms O-C1 (purity). This reproduction uses a *different* population
definition than the implementer's own hook (drawn/emitted length vs. the hook's
pre-drop/"asked" length — see §3 note); both converge on the same RED→GREEN result, which
is a stronger proof than either alone.

Also ran the real `scene3d-mktick-band-purity.test.js`: **35/35 PASS** (impl claimed
34/34 — one-test-count drift, immaterial, 0 failures either way), including the RED
reconstruction, the GREEN shipped tree, the O-C1 synthetic-mutation proof, and the
BLOCKING mutation-kill on torus/contour/create. Diffed the hand-maintained `PRE_TICK_BLOCK`
string constant against the actual `7ef20455` source: **byte-for-byte identical** (the
"not `git show HEAD`" claim is not just a good idea, it's true — this is a faithful
reconstruction, not a fabricated one).

Re-ran `scene3d-mktick-wedge.test.js`: **58/58 PASS**, and the diff of the 4/12 re-pinned
`pathSignature` goldens exactly matches the disclosed list (`test|torus/contour`,
`test|cone/hatch`, `create|torus/contour`, `create|cone/hatch` — precisely the cells where
`law.L0*sv.R > 2*nominalRP`); the other 8/12 are untouched in the diff, confirming the
"minimal nSub" claim is not just asserted but true at the source level.

**Verdict: clause (c) is genuinely fixed, independently reproduced two ways, and the
mutation-proof is real.**

---

## 2. Clause (b) — "don't increase overlap at the seams" — MEASURED, honestly

Source diff confirms `MK.mkTick.L0` is **literally unchanged** (`1.16` in both trees — one
line, comment-only diff). Hand-derived the closed form independently: for both the
single-tick branch (`band=R`, `each=L`) and the retiled branch (`band=R/nSub`,
`each=L/nSub`), `ov = (each - band)/(2*band) = (L0-1)/2` — the `nSub` term cancels exactly,
so the retiling is **provably, not just empirically, neutral** on seam overlap. Confirmed
empirically too: `ovMax` = 0.0800 on both PRE and POST (cone/hatch, both rigs, hook-based
measurement).

**The L0=1.05 trade, independently reproduced from scratch** (not copied from the report):
patched `MK.mkTick.L0` 1.16→1.05 in a fresh scratch copy of the shipped tree and ran the
actual `lengthCarriesTone` oracle (`scene3d-mktick-wedge.js`) on all 12 fixtures myself:

- Ratio-only failures (`<2.30`): **4/12** (test: sphere/contour 2.19, torus/hatch 2.22;
  create: sphere/contour 2.22, cone/hatch 2.23) — matches the impl's disclosed "~2.19-2.23"
  numbers to two decimal places.
- The O5 test *also* gates monotonicity (`dark≥mid≥light`); at L0=1.05 two more cells
  (test|cone/hatch, both rigs' torus/hatch) fail monotone even where the ratio clears the
  bar — **6/12 fixtures would fail the actual shipped assertion**, the top of the impl's
  disclosed "4-6 of 12" range (not independently stated by the impl, but consistent with
  and inside their own honest range).

Did not independently re-verify the `MK_TICK_EASE_BLEND` 0.92→0.98 buy-back attempt (time
budget); the central claim it supports (L0=1.05 fails O5) is now independently confirmed,
which is the load-bearing part of the disclosure.

**Verdict: "MEASURED-not-fixed" is honest.** `ovMax` is neither worsened (proven exactly
invariant) nor improved (also proven exactly invariant) by this unit; the L0=1.05 trade-off
that would fix it is real, reproduced independently, and correctly triggers the plan's own
stop condition 3 rather than being silently forced through.

---

## 3. Clause (a) — ORCHESTRATOR PICTURE FLAG — **NOT DELIVERED**, ~0% of the substantive ask

This is the blocking question. Built an independent hook (verbatim copy of the
implementer's own `POST_TICK_BLOCK_INSTRUMENTED`/`PRE_TICK_BLOCK`, spliced by hand into
fresh scratch copies of the *real* `7ef20455` and `75777240` sources — not the test file's
in-VM `scriptOverrides` mechanism) to get per-mark records independent of the shipped test.

**Fragment count (ticks < 0.5×RP — the caller's own metric), cone/hatch, both rigs:**

| | PRE count | POST count | Δ |
|---|---|---|---|
| test rig | 113 (of 422, 26.8%) | **113** (of 510, 22.2%) | **0** |
| create rig | 144 (of 519, 27.8%) | **144** (of 603, 23.9%) | **0** |

**The absolute number of fragments is exactly unchanged, both rigs.** The *fraction*
dropped only because the retiling adds new (non-fragment-length) sub-ticks to the
denominator in the over-long slab region — it does not touch the fragment population at
all. This is mechanically guaranteed by the source: the golden-ratio stagger's `nSub===1`
branch is byte-identical to T2-3's own code (confirmed by diff), and fragments come
entirely from that branch's own stagger scattering ordinary-length ticks, which this unit
never modifies.

**Tick-length-vs-tone R² (monotonicity), cone/hatch/create, same hook methodology both
trees:** PRE 0.1849 → POST 0.2019 (+0.017); test rig PRE 0.2008 → POST 0.2287 (+0.028). A
real but small movement, nowhere near the plan's own 0.45 target — consistent with the
report's own honest "MEASURED, not gated" framing (my absolute numbers differ from the
plan's own §2 table, 0.102→0.102ish, most likely because the hook counts pre-drop
"attempted" sub-ticks — see the `MIN_MARK_MM` note below — while the plan's §0.3
instrumentation appears to count only emitted ones; the *directional* finding, a small,
real, non-transformative improvement, holds under both methodologies).

**Bare-gap coverage (`wedge25`/`holeMax`):** confirmed flat via the passing non-regression
gate (`scene3d-mktick-wedge.test.js`, 58/58) — never improved, only guarded against
regressing. Independently captured cone/hatch/med/create on both trees from a live headless
render (MAIN's `scripts/audit/scene3d-capture.js --root <scratch> --rig create`, ports
8497/8498, killed after) and cropped natively at 3× on the bottom-of-wave-column region: the
large black bare wedge at the base of a wave column is **visually identical in shape and
size, pre vs. post** — no visible narrowing. Also cropped the right-hand lit-edge fragment
field side-by-side at 3×: the scattered short-mark pattern reads as the same texture in both
images, consistent with the exact fragment-count invariance measured above.

**Rule plainly, per the caller's ask:** clause (a) is **not delivered** by this mechanism —
not "partial" in the sense of meaningful progress on Jay's actual complaint. The unit fixes
a *different*, genuinely real defect (clause c, over-long lines) and, as an incidental side
effect of splitting a few long ticks into evenly-spaced short ones in the same slab, moves
`roughP95`/`lenToneR2n` a small amount — but the two things Jay named (fragments on the
right, black gaps at the bottom) are numerically and visually **unchanged**: 0 fragments
removed, 0 gap area closed. What the next mechanism needs (per the plan's own Rank 2/3,
independently confirmed still open): (1) replace the golden-ratio hash offset with a
spatially-smooth field so neighbouring ticks correlate instead of scattering (Rank 2); AND
(2), which no ranked mechanism in this plan actually targets, **grade tick length as a
function of distance from the band's own lower edge**, so the ramp that currently just
shortens ticks toward the highlight is re-anchored to progressively fill the gap
region — the plan's Rank 2/3 both still centre the tick on a fixed point and vary length
by tone alone, which is why they were never expected to touch `wedge25`.

⚠ **One disclosure-quality note, not a hidden bar.** `T2-5-impl.md`'s own plain-language
summary says *"the worst over-long fragments (which read as the most visually jarring
'wrong' marks) are gone"* — this conflates clause (c)'s over-long **lines** (which are the
opposite of fragments: unified marks crossing two rows) with clause (1)'s actual
**fragments** (short, scattered marks). The number-level disclosure elsewhere in the same
report is accurate and un-vacuous (`lenToneR2n` "far under 0.45," "stagger's scattering
unchanged in kind"), but this one sentence risks a reader coming away thinking the
right-side fragment complaint was addressed. It was not, confirmed by both independent
count (0 change) and independent image (visually unchanged).

---

## 4. No regression — independently re-run, foreground, this worktree

| file | claimed | reproduced |
|---|---|---|
| `scene3d-mktick-band-purity` (new, own) | 34/34 | **35/35** (count drift, 0 fail) |
| `scene3d-mktick-wedge` | 58/58 | **58/58** |
| `scene3d-mktick-banding` | 22/22 | **22/22** |
| `scene3d-mktick-runaway` | 37/37 | **37/37** |
| `scene3d-mark-laws-draw` (G4, T4b, O1) | 30/30 | **30/30** |
| `scene3d-mkdashramp-single-pass` | 20/20 | **20/20** |
| `scene3d-ribbon-f1b-streaks` | 44/44 | **44/44** |
| `scene3d-ribbon-wall-coverage` | 36/36 | **36/36** |
| `scene3d-style-fill-lines` | 15/15 | **15/15** |
| `scene3d-ladder-uniform-field-spacing` | 9/9 | **9/9** |
| `scene3d-fill-style-picker` (integration) | 177/177 | **177/177** |
| `scene3d-ribbon-fill-depth-count` + `scene3d-ribbon-width-bar` | not itemised in impl report | **22/22** (ran anyway — both explicitly named by the caller's condition 4; green, unaffected as expected since the change is scoped entirely to `if (law.shape==='tick')`) |
| `scene3d-tone-law-collapse` (Tier 1) | 121/121, 846.78s | **not independently re-run** (cost/time trade-off); the reported wall-time (846.78s) sits inside this file's own established historical range (554–840s across 8+ prior units in this chain per `ROUND3-RESUME-BRIEFS.md` §0b), which is circumstantial but real corroboration |

`O5 ≥ 2.30 monotone`, 12/12: independently scripted (not the test file) — **0/12 fail**
at the shipped `L0=1.16` (min ratio 2.3477, all monotone). All green.

**Verdict: no regression, essentially fully independently confirmed.**

---

## 5. Sweep + bars

**Roster sweep — real, disclosed reduction from the plan's own scope, not a hidden one.**
Plan asked for 8×37×4-tree = 1184 cells; the shipped unit ran 111 (cone/create only, 3
mappers × 37 laws — the mapper narrowing is inherited from the plan's own earlier finding,
the *primitive/rig* narrowing to cone/create-only is new). Re-ran the actual sweep test
myself: **302239ms** (matches the claimed ~295-308s), confirmed **2/111 changed**
(`cone/create/hatch/mkTick`, `cone/create/crosshatch/mkTick`), **0 non-mkTick changes**.
Independently verified the structural argument used to justify the reduction:
`grep -c "shape: 'tick'" src/core/scene3d/surface-fill.js` → **1**, confirming no other
`MK` law can ever reach the modified branch regardless of primitive/mapper/rig. This is a
sound, disclosed justification (AGENT-PROTOCOL standing rule 2 compliance: exclusion stated
as a fraction — 9.4% — and justified both empirically and structurally) — but it is a real
deviation from the plan's literal instruction (the caller's condition 5 names "296-cell
sweep ×4," which was not run). **Non-blocking follow-up, not a hidden-bar REJECT.**

**Bars changed.** Diffed `7ef20455..75777240` directly:

- `tests/unit/scene3d-mktick-wedge.test.js` `EXPECTED_SIGNATURE`: exactly 4/12 goldens
  changed, exactly the cells the disclosure names, verified by diff. ✅ accurate.
- `STAGGER_NEEDLE` split into `STAGGER_NEEDLE_TILED`/`STAGGER_NEEDLE_SINGLE`: structural,
  not a value change, confirmed by diff. ✅ accurate.
- `MK.mkTick.L0`: diff shows the value is **unchanged** (1.16→1.16, comment-only diff) —
  the "attempted 1.16→1.05, reverted" disclosure is honest (recording a bar they tried and
  backed out, per standing rule 6, even though nothing here technically required it). ✅.
- `O5_BAR = 2.30`: confirmed unchanged by diff. ✅.

⚠ **Minor process gap, non-blocking.** AGENT-PROTOCOL requires the `## Bars changed`
disclosure "in your report AND in the commit body." `T2-5-impl.md` has a proper `##
Bars changed` heading with the `file:line — old → new — why` format. The commit body
(`75777240`) discloses the same facts in prose ("4/12 pathSignature goldens re-pinned,
disclosed") but does not carry the structured heading/format. The substance is present and
accurate in both places; only the commit body's format is looser than the letter of the
rule.

---

## 6. Pictures

Captured cone/hatch/mkTick/med/a, both trees, `--rig create`, from my own scratch exports
(not the implementer's shots, though I cross-checked one of theirs —
`cone_hatch_target_x5_stacked.png` — and could not independently confirm the specific
continuous-line read at that crop location and zoom; my own quantitative over2RP proof does
not depend on that crop and is unaffected). Whole-object: pre and post are visually
near-identical, as expected (this unit's own population is a small minority of all
ticks). Bottom-of-wave crop (3×, stacked): **the large black bare wedge at the base of a
wave column is the same size and shape pre vs. post** — clause (2)'s "black gaps" are
still there. Right-edge fragment-zone crop (3×, side-by-side): **the scattered short-mark
texture reads as the same pattern pre vs. post** — clause (1)'s "fragments on the right"
are still there. Both crops corroborate the quantitative findings in §3 directly, not just
by inference.

**Answer to Jay's three clauses, plain words:**
1. "Tick fragments on the right" — **still there, unchanged** (0 change in fragment count,
   either rig).
2. "Black gaps at the bottom of the vertical waves" — **still there, unchanged**
   (`wedge25`/`holeMax` flat; visually identical bare-wedge crop).
3. "Lines not part of a tick band" — **fixed, cleanly and provably** (40→0 and 18→0 on the
   two worst cells, 0/12 everywhere, RED→GREEN reproduced two independent ways).
4. "Don't increase overlap at the seams" — **not increased further** (unchanged at T2-3's
   own already-regressed value, proven algebraically invariant under this unit's own
   mechanism); **not decreased either** — the seam regression T2-3 introduced is still
   live and is Jay's to rule on via the disclosed L0/O5 trade table.

---

## Overall verdict

**ACCEPT-WITH-FOLLOWUPS.** Clause (c) is a real, rigorously proven fix (independently
reproduced two ways). No regression anywhere I could check (11 of 12 guard files
independently re-run green; the 12th's reported number is consistent with its own
established history). Clause (b) is honestly measured, not hidden, and the disclosed
trade-off reproduces exactly. No hidden bar, no vacuous test, no re-pin without proof, no
narrowed population passed off as unchanged. Per the caller's own standing instruction, a
partial/unfixed (a) with (c) fixed and no regression does not warrant REJECT.

**But clause (a) should be re-labelled MEASURED/NOT-DELIVERED rather than "partial"** — the
two things Jay actually pointed at (fragments, gaps) are numerically and visually
unchanged; only an unrelated proxy metric moved as a side effect of the real fix. This is
the most important thing for the next planner to carry forward, along with the mechanism
gap named in §3 (grade tick length to the band's own edge, not just smooth the stagger).

### Follow-ups (non-blocking)
1. **Clause (a)/picture flag is the P0 item for round 4's next unit** — Rank 2 (smooth
   offset field) alone will not close the gap-filling half; a mechanism that anchors tick
   length to the band's own lower edge is also needed, per §3.
2. **Clause (b) needs Jay's ruling** on the L0/O5 trade (table in `T2-5-impl.md`,
   independently reproduced in §2 above) — `ovMax` stays at 2.86× the pre-T2-3 value until
   he chooses.
3. **Roster sweep coverage (9.4% of the plan's own 1184-cell scope)** — structurally sound
   but a future unit touching the `MK` table's `shape` field should re-verify the
   `grep -c "shape: 'tick'" === 1` invariant still holds before relying on this precedent.
4. **Commit-body `## Bars changed` formatting** — present in substance, not in the
   mandated heading/format; low priority.
5. **Wording fix for next report**: avoid calling the removed over-long ticks "fragments"
   (§3) — it collides with Jay's own use of the word for a different defect.

REPORT docs/3d-audit/lane-reports/T2-5-review.md — ACCEPT-WITH-FOLLOWUPS — clause (c) real; (b) honest; (a) NOT delivered, not "partial"
