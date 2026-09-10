STATUS: ACCEPT-WITH-FOLLOWUPS

# W-30d review — torus caster HOLE preserved in the flat-face shadow-receive
footprint (F2a) + thin-torus blank-void graded-search fix

Lane under review: fill-collapse-2. Worktree: `.claude/worktrees/fill-collapse-2`
(READ-ONLY — no edits, stashes, or checkouts made there). Pinned range:
**`2d931b1a..9aad87b8`** (`83d1e021` F2a, `54816268` thin-torus blank-void fix,
`9aad87b8` evidence script). `git status --short -- . ':!graphify-out'` clean;
`git stash list` showed only pre-existing unrelated agent-worktree stashes.

Method: `git archive` exports of `2d931b1a`, `83d1e021`, `9aad87b8` into
`/private/tmp/.../scratchpad/w30d-{pre,f2a,post}` (node_modules symlinked, plus
a copied `.git` **file** — the same worktree gitdir pointer, matching
`W-30c-review.md`'s own precedent — so the tests' own `git show <sha>:<path>`
pin mechanism resolves without touching the live worktree's index/HEAD). One
further instrumented copy (`w30d-instr`, console-free counters added at
`firstOccludedSample`'s hit/null branch, `Shadows.footprintRings`' `loops`
decision, and `buildFaceFootprint`'s per-caster group, all reading/writing
`global.__W30D_*` inside the vm-sandboxed runtime — never the live worktree).
All scratch dirs and probe files were deleted at the end of this review
(confirmed in the closing section). The live worktree was never edited.

## (1) RED / GREEN / mutation, per defect

**GREEN** (current tree, no pin): both new files pass in full —
`scene3d-shadow-footprint-torus-hole-accuracy.test.js` 6/6,
`scene3d-shadow-footprint-torus-thin-blank.test.js` 4/4.

**RED**, reproduced independently via the files' own env-var pins:
- `VECTURA_PRE_W30D_HOLE=1` (pins `shadows.js`+`scene3d.js` to `2d931b1a`):
  directional **2.8685789030868896** vs bar `< 1.3`, point
  **3.021481550701788** vs bar `< 1.3` — both fail. Matches the impl report's
  floats exactly.
- `VECTURA_PRE_W30D_THIN=1` (pins `scene3d.js` to `83d1e021`): thin-torus
  **1.0536038817613673** vs bar `>= 1.8` — fails; regression guard (wide
  torus) still passes. Matches the impl report's floats exactly.

**RED reproduced a second, independent way — real full checkouts, no
scriptOverride at all** (stronger proof than trusting the same override
mechanism twice): copying the CURRENT test files into a real `git archive`
checkout of `83d1e021` and running them directly there gives
hole-accuracy **4/4 pass** (F2a alone already satisfies the hole contract) and
thin-blank **fails at exactly 1.0536038817613673** (byte-for-byte the same
float as the scriptOverride pin). Running hole-accuracy directly at a real
`2d931b1a` checkout fails at exactly **2.8685789030868896 / 3.021481550701788**
— the same floats again. Three independent measurement paths (scriptOverride
pin, real 83d1e021 checkout, real 2d931b1a checkout) agree to the full float
on both defects.

**Per-commit mutation — done, with an important caveat disclosed rather than
glossed over.** A naive `patch -p1 -R` of `83d1e021`'s own diff onto the full
post-tree (i.e. attempting "revert F2a alone, keep the thin-torus commit")
**fails to apply** — hunk #4 (the `firstOccludedSample` region) conflicts,
because `54816268`'s diff lives entirely inside the `INWARD_FRACTIONS`
constant and comment block that `83d1e021` itself introduced (confirmed by
reading both diffs directly: `54816268`'s only code change is
`const INWARD_FRACTIONS = [0.9]` → the graded array, a line that did not exist
before `83d1e021`). **The two commits are not independently invertible by
simple diff reversal — this is expected, not a defect**: `54816268`'s own file
correctly pins its RED baseline at `83d1e021` (its true immediate
predecessor), not at `2d931b1a`, and the real-checkout test above proves that
baseline is exactly right (F2a done, thin-fix not yet → the same 1.0536 blank
reproduces). The isolation that actually matters — does each commit's own
fix contribute something the other doesn't — is demonstrated cleanly above:
F2a alone (at `83d1e021`) already satisfies the hole-accuracy contract in
full (4/4, real checkout, no `54816268` present at all), and the thin-torus
defect is present at that same commit and only fixed by `54816268`. That is a
complete, non-circular isolation of the two fixes; a literal "revert 83d1e021
while keeping 54816268" is not a coherent state to test and the impl report
never claims to have constructed one.

**Termination** (part of secretary flag 2): confirmed by direct code
inspection, not just observation — `firstOccludedSample` is a bounded triple
loop (rings in the group × vertices per ring × the 11 fixed `INWARD_FRACTIONS`
values), with no recursion and no loop bound derived from geometry. It always
terminates, `null` on exhaustion.

## (2) Hole accuracy — independent analytic cross-check (mm², %)

Built a ground-truth occlusion test with **zero reliance on the app's own
silhouette/hull code**: implicit-torus distance test
(`dist = hypot(hypot(x,z) - major, y) - minor`, `major=30`, `minor=3.36` for
the `sx=40/sy=12/sz=40` rig) combined with a genuine ray march per light type
(directional: backward along the light's travel vector, `d` computed
independently from `Regions.Lighting.lightWorldDir`'s own documented formula;
point: along the finite segment to the light position). A flood-fill from a
sample window's own border classifies every non-occluded grid cell as either
"reachable from outside" or "enclosed" (a genuine hole) — no assumption that
the hole is a circle centered on the caster, which matters because a
low-elevation directional light shifts the whole footprint well away from the
caster's own `(x,z)` (confirmed: the app's own outer-ring centroid sits at
world `x=-4.34`, not `x=60` — a naive circle-around-the-caster test window
misses the real shadow entirely and was the first, wrong version of this
check; recentering the analytic window on the app's own reported outer-ring
centroid fixed it — a legitimate "where to look," not a shortcut on "what
counts as occluded").

| | analytic (independent) | app's own inner-ring (hole) area | diff |
|---|---|---|---|
| directional | 1801.75 mm² | 1796.81 mm² | **0.3%** |
| point | 2403.00 mm² | 2387.93 mm² | **0.6%** |

Sub-1% agreement on both light types, computed from first principles (no
shared code with `shadows.js`/`scene3d.js`) — strong confirmation the hole
geometry is not just "visible" but quantitatively correct.

## (3) The graded inward search — does it eliminate the class of bug, or move it?

**Coordinator flag 2's core question, and the one real finding of this
review.** Instrumented `firstOccludedSample` directly (hit/null + winning
fraction index) rather than trusting a screen-space density measurement —
necessary, because my first attempt at this (scaling the torus up via `sx`
inside a FIXED camera frame) produced a spurious "blank void returns" signal
that turned out to be my own test's camera/control-point clipping, not a
real code defect (caught by cross-checking with a properly-scaled control
window, then confirmed authoritatively via direct instrumentation, which is
immune to any measurement/framing artifact).

Sweeping `sx` (ring size) at the floor-clamped `sy=3` (`minor` pinned at
1mm regardless of `sy` once `sy<3.57` — `topoTorus`'s own floor), i.e.
sweeping the major:minor ratio directly:

| major:minor | outcome |
|---|---|
| up to **465:1** (`sx` up to 620) | **hit, on the very first (finest, 0.99) fraction tried**, every time |
| **488:1** (`sx=650`) and beyond, confirmed through **2250:1** | **null — the exact same blank-void failure reproduces** |

**The fix is real and substantial (roughly 3.5–4× wider working range than
before — the original single-0.9-fraction bug failed even at the tested
135:1 rig), but it does not structurally close the class of bug — it raises
a fixed, finite ceiling rather than removing it.** This is not disclosed
anywhere in the impl report, which characterizes the commit as "the fix" for
the reviewer-found blank-void case without noting the new ceiling.

**Reachability, weighed against ACCEPT (mirrors how W-30c-review scoped its
own analogous finding):** the UI's own torus size slider defaults to `min:2,
max:200` for `sx` (`scene3d-panel.js`'s `D()`/`sizeRange` default), so a
UI-driven torus has `major <= 150` — safely inside the confirmed-good range
up to 465:1. Reaching the new failure ceiling (`sx` in the 620–650+ range,
i.e. `major` 465–490mm+) requires either a hand-edited/imported `.vectura`
file with an out-of-slider parameter, or compounding with the object's own
`transform.scale` multiplier — not reachable through ordinary slider-driven
use. Filed as a follow-up below, not a blocker.

## (4) Secretary flag 1 — does the max-band bar actually discriminate "hole
open" from "shadow vanished"?

Both read the SAME centroid ratio (`< 1.3`, unshadowed) whether the hole is
correctly reopened (F2a's intent) or the whole shadow silently failed to
render at all — the max-scanned annulus-band bar (`>= 1.5` in hole-accuracy,
`>= 1.8`/`>= 2.5` in thin-blank) is the ONLY thing separating those two very
different outcomes. Built an independent check: reran the exact same
max-band-ratio measurement with `shadowReceiveOnObjects` toggled OFF (a
direct simulation of "the shadow genuinely isn't there"):

| light | shadow ON (bar `>= 1.5`) | shadow OFF (simulated "vanished") |
|---|---|---|
| directional | 2.4407 | **1.0000** |
| point | 2.6505 | **1.0000** |

With the shadow genuinely off, the ratio reads exactly 1.0000 (uniform, no
annulus anywhere) — well under the bar in both cases. **The bar is a real,
non-vacuous oracle**: it would have failed had F2a's fix actually deleted the
shadow rather than correctly reopening its hole.

## (5) Secretary flag 3 — convex-caster invariance, md5 of paths (not pixels),
and confirming the sibling branch is genuinely exercised

The impl report's own convex-invariance evidence was PNG pixel-diff only
(sphere/box × point/directional, 4 pairs) plus one pre-existing md5 guard
(`scene3d-shadow-footprint-wiring.test.js`, **directional-light box only**).
Independently built the missing coverage:

- **md5 of the actual serialized receiver-fill paths** (not pixels),
  `2d931b1a` vs current tree, for **all four** sphere/box × point/directional
  combinations, via `AlgorithmRegistry.scene3d.generate()`'s real output:
  all four hashes **byte-identical** (`sphere/directional`, `sphere/point`,
  `box/directional`, `box/point` — each old/new md5 pair matched exactly).
- Re-ran `scene3d-shadow-footprint-wiring.test.js` directly: 5/5, confirming
  its own pre-existing box/directional md5 guard independently.
- **Confirmed the sibling branch is what's actually exercised**, not bypassed:
  instrumented `Shadows.footprintRings`' own `loops.length` decision.
  Sphere → `loops.length = 1` for both light types (the single-loop,
  hull-preferred branch). Box → 4 calls per scene (once per receiving face
  candidate), 3 return `null` (degenerate/off-plane faces) and 1 returns
  `loops.length = 1` — never `>1` for either shape. Torus (control) →
  `loops.length = 2` both light types, confirming the hole branch is what it
  actually takes. This directly answers the flag: sphere/box exercise
  `casterSilhouetteLoops` for real and land on the single-loop fallback to
  the hull, exactly as the design intends — the invariance isn't accidental
  or a short-circuit.
- Also independently re-hashed (own `md5 -q`) all four evidence PNG pairs in
  `docs/3d-audit/fill-audit/after/W-30d/`: byte-identical (not just
  matching file size, which I also checked first).

## (6) Files touched, evidence-script placement

`git diff --stat 2d931b1a..9aad87b8 -- . ':!graphify-out'` — exactly:
`scripts/w30d-shadows-evidence.js` (new), `src/core/algorithms/scene3d.js`
(+~146/-?), `src/core/scene3d/shadows.js` (+~192), 3 test files (2 new, 1
modified). **`regions.js` untouched** — confirmed directly, matching the
brief's expectation that this unit stays out of F1's file. No touch to
`surface-fill.js`, `surface-fill-mono.js`, `params.js`, or
`src/config/scene3d-tone-laws.js`.

**Evidence-script location — checked, not a misplacement.** `scripts/
w30d-shadows-evidence.js` sits at the top level of `scripts/`, matching the
established, disclosed convention for this exact chain of bespoke lane
evidence scripts (`scripts/w30-footprint-direction-evidence.js`,
`scripts/w30b-footprint-wiring-evidence.js`,
`scripts/w30c-shadows-evidence.js`). `scripts/audit/` is a different,
generic manifest-cell capture toolkit (`scene3d-capture.js`,
`scene3d-audit-stats.js`, etc.) — not the right home for a rig this specific,
and every predecessor in this same chain lives at the top level too. No
issue.

## (7) Unit D guards, U0, byte-identity, perf — independently re-run

- `scene3d-shadow-receive.test.js` **17/17**, `scene3d-shadows.test.js`
  **18/18** (including I25's own annular-ground-shadow assertion),
  `scene3d-shadow-footprint-direction.test.js` **17/17**,
  `scene3d-shadow-footprint-wiring.test.js` **5/5** — all reran directly,
  all pass, matching the impl report's counts exactly. `shadowReceiveOnObjects`
  default confirmed **`false`** at both `src/config/defaults.js:2141` and
  `src/core/scene3d/params.js:497`/`:1018`.
- U0's 87/87 48-law byte-identity sweep was **not** independently re-run to
  completion this session (it is a 671s job under the same documented
  shared-machine contention W-30c-review also cited) — accepted on the impl
  report's own number plus the structural argument that this diff never
  touches tone-law code, only shadow-footprint geometry (same reasoning
  precedent as `W-30c-review.md` §6).
- **Perf**, re-measured independently on the plan's own rig (torus + 500mm
  plane, directional, 3 runs each): OFF `175/148/149ms`, ON `148/133/131ms` —
  matches the impl report's own numbers closely (no regression; ON measures
  faster here too, consistent with noise/JIT-warmup ordering, not a real
  effect). Comfortably inside the `<=1.10x` F2 budget either way.

## (8) Stale-assertion update — confirmed legitimate, not a hidden bar change

Read `git diff 2d931b1a..9aad87b8 -- tests/unit/scene3d-shadow-footprint-
torus-visibility.test.js` directly. Exactly two assertion **directions**
flip (`>= 1.3` → `< 1.3`) in the "current tree" describe block; the numeric
bar itself (`1.3`) is untouched. The two RED-proof-pin mirror tests at the
same `90f3411f` pin are **retired with a written rationale**, not silently
deleted: at that pin the centroid reads unshadowed for the pre-F2b bug
(ratio ~1.0), and at the current tree it reads unshadowed again for the
*correct* post-F2a reason — a single shared assertion can no longer
discriminate the two states, so re-pointing it would pass trivially and prove
nothing. The sphere control in that same block is untouched and still
passes. Coverage for the actual direction change is fully carried by the new,
correctly `2d931b1a`-pinned `torus-hole-accuracy` file (verified in (1)
above). This matches CLAUDE.md's stale-assertion rule (update/justify, never
silently drop) and the plan's own explicit "non-convex casters... will
change, and must" (`W-30c-plan.md` §4). **No numeric bar moved anywhere in
either commit** — `## Bars changed: None` is accurate.

## (9) Merge notes

`shadows.js`'s diff vs `main` (`git diff --stat main -- src/core/scene3d/
shadows.js` in the worktree, +142/-50, 192 lines) is **numerically identical**
to this unit's own `2d931b1a..9aad87b8` diffstat for that file — confirming
shadows.js was genuinely untouched through W-30b/W-30c (matching
`W-30c-review.md`'s own "0 bytes" finding) and **this is the first real edit
to it on this lane**, i.e. a first stake, not literally a "third" one, though
it is the first time this lane (rather than handoff-c/handoff-c2, its
nominal serialization owner per `AGENT-PROTOCOL.md`) has landed real
`shadows.js` code — a disclosed, planned exception per `W-30c-plan.md` §5's
own lane recommendation, re-confirmed clean here: `handoff-c2`
(`ed778940`) has **zero diff** vs `main` on `shadows.js`, `regions.js`, or
`scene3d.js` (re-ran the same `git diff --stat` check independently). `main`
itself has no commits touching `shadows.js` since the `47a5a755` merge-base.
Low merge risk. Same standing pre-existing caveat every round-2 reviewer has
logged carries forward unchanged: neither `e429cfc5` nor `1193cbe1` is an
ancestor of this lane's HEAD (re-confirmed via `git merge-base
--is-ancestor`), so `scene3d-hlr-spatial-index-identity.test.js`'s golden
hash still needs re-verification once this branch rebases past `1193cbe1` —
not new, not introduced by W-30d.

## (10) PNGs — looked at, native/cropped resolution

- `crop-hole-torus-dir-{before,after}.png`: BEFORE a solid egg-shaped blob,
  no hole; AFTER a clean, unambiguous annulus with a visibly lighter center —
  matches the report's description exactly.
- `crop-hole-torus-point-{before,after}.png`: BEFORE a solid wedge; AFTER the
  same wedge with a real, if less crisp, partial gap/thinning where the hole
  projects — matches (the point light's oblique projection makes the hole
  read less cleanly than the directional donut, as the report says).
- `crop-thin-torus-{before,after}.png` and the `-zoom-` pair: BEFORE unbroken
  diagonal hatch straight through the ring's own outline; AFTER short,
  denser dashed segments appear along the periphery (most visible in the zoom
  crop, lower-right) where before the lines ran unbroken — a genuine, if
  subtle, band. Matches the report.
- `hole-{sphere,box}-{point,directional}-{before,after}.png`: independently
  re-hashed (own `md5 -q`, not trusting the report), byte-identical in all
  four pairs — confirmed above in (5).

## Findings — do not block ACCEPT

1. **The graded-fraction fallback search raises the thin-torus blank-void
   ceiling substantially (~3.5–4×) but does not eliminate the class of bug —
   it has a new, measured, finite breaking point around major:minor 465:1 to
   488:1** (confirmed by direct instrumentation of `firstOccludedSample`'s
   hit/null outcome, immune to the camera/measurement artifacts that produced
   a false signal in an earlier, cruder version of this same check). Not
   disclosed in the impl report. Not reachable through the UI's own default
   torus-size slider (`max: 200` on `sx` → `major <= 150`, safely under the
   ceiling) — requires an out-of-slider parameter (hand-edited file, or
   `transform.scale` stacking). File as an explicit follow-up (a new W-30e,
   or fold into whichever unit next touches `firstOccludedSample`): either
   document the ceiling explicitly, or replace the fixed fraction list with a
   search whose granularity scales with the local tube-to-ring ratio (e.g.
   derived from the ring's own bounding radius vs its narrowest edge length)
   rather than a hardcoded list.
2. Same standing cross-lane caveat every round-2 reviewer has logged:
   `scene3d-hlr-spatial-index-identity.test.js`'s golden hash needs
   re-verification once this branch rebases past `1193cbe1` — pre-existing,
   not introduced here.
3. U0's 48-law sweep was not independently re-run to completion this session
   (machine-contention cost, same as prior reviewers) — accepted on the impl
   report's own number plus the structural argument that nothing in this diff
   touches tone-law code.

## Verdict: ACCEPT-WITH-FOLLOWUPS

RED reproduced exactly for both defects, by three independent methods
(scriptOverride pin, and two real full-tree checkouts) — floats match the
impl report to the last digit. GREEN reproduced (10/10). Per-commit isolation
is real and correctly anchored (F2a alone already satisfies the hole
contract at `83d1e021`; the thin-torus defect is present there and only
`54816268` fixes it) — a literal patch-reversal mutation across the two
commits is not constructible (hunk conflict, by design: `54816268` lives
inside code `83d1e021` introduced), and that is disclosed here rather than
faked. Hole geometry is quantitatively correct to within 0.3–0.6% of an
independently-derived analytic ground truth, for both light types, in mm².
Convex-caster invariance is now confirmed by md5 of the actual paths (not
just pixels) for all four sphere/box × light-type combinations, plus direct
instrumentation proving the single-loop sibling branch is genuinely
exercised (not bypassed) for both shapes. The max-band annulus bar is a real,
non-vacuous oracle — independently confirmed to read exactly 1.0 (fail) when
the shadow is genuinely turned off. Unit D's guards, the direction/wiring
suites, and the stale-assertion update are all independently reproduced and
legitimate; no numeric bar moved in either commit. The one real, undisclosed
gap found this review — the graded search has a new but still finite blank-
void ceiling, reachable only outside the UI's own default slider range — is
squarely analogous in kind and severity to the untested-edge-case finding
`W-30c-review.md` itself accepted-with-followups rather than blocked on; land
it, and carry the ceiling finding plus the two standing cross-lane notes
forward as follow-ups.

REPORT docs/3d-audit/lane-reports/W-30d-review.md
