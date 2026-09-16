STATUS: ACCEPT-WITH-FOLLOWUPS

# T4b review — CI guard for T4's restored dark end (TESTS ONLY)

- **Lane:** fill-audit-a3, worktree `.claude/worktrees/fill-audit-a3`, branch `3d-scene/fill-audit-a3`
- **Pinned range reviewed:** `dcc91872..7f805654` (one commit, one new file
  `tests/unit/scene3d-mkdashramp-dark-end.test.js`, +181, `git diff --stat` confirmed — no `src/` touched).
- **Method:** `git archive` of `dcc91872` → `pre/`, `7f805654` → `post/`, both under
  `/private/tmp/claude-501/scratch-T4b/`, node_modules symlinked from MAIN. `noT4/` = a copy of `post/`
  with `git diff a3b651f0^ a3b651f0 -- src/core/scene3d/surface-fill.js` reverse-applied
  (`git apply -R`, exit 0; confirmed `MK_BAND_MAX_PASSES` absent AND the surrounding code byte-identical
  to `pre/src/core/scene3d/surface-fill.js` via `diff` — the revert is complete, not just the flag
  missing). `slabmut/` = a copy of `post/` with the exact rejected-first-draft formula from T4-review.md
  §2 (`bandPitch = truePitch`, `bandN` with no `MK_BAND_MAX_PASSES` ceiling) re-applied by hand, used only
  for condition 2 below. Never edited/stashed/reset the worktree; it was read-only throughout, verified
  clean (`git status --short`) before and after.

## Condition 1 — pipeline identity

**Verdict: PASS, with the claim slightly restated.** The fixture drives `engine.addLayer('scene3d')` →
`addSceneTree` → `addObjectToScene` (confirmed by reading `addSceneTree()` at `src/core/engine.js:906` —
seed primitive from `ALGO_DEFAULTS.object3d`, sphere sized from `PRIMITIVE_CREATE_DEFAULTS.sphere` =
`{radius:25, detail:28}` at `src/core/scene3d/params.js:124`), identical harness shape to
`scene3d-insert-default-ink.test.js`. It is **not** a synthetic params bag — the fixture never types a
radius/detail literal; only `style` (mapper/density/toneLaw) is overridden on the real seeded object, and
a separate test (`the fixture reproduces the CREATE-defaults sphere...`) pins that this actually happened.
The camera is likewise never set explicitly — it rides `finite(src.yaw, DEFAULT_CAMERA.yaw)` etc.
(`params.js:454`, `yaw:-30, pitch:20`) i.e. camera angle **'a'** by omission, matching
`scripts/audit/scene3d-capture.js:128` (`angleKey === 'a' → {...DEFAULT_CAMERA}`) exactly. This is row
1a's requirement satisfied, not evaded.

I reproduced the baseline **independently** (own Node script driving the identical `engine.addLayer`
sequence, not copied from the test or from T4b-impl.md): **`1501.063657816772`**. This differs from the
committed test's own literal (`1501.0636578167772`) and from T4-review's own number
(`1501.0636578167414`) starting at the **13th significant digit** (`toPrecision(20)` shows
`...7720927` vs `...7770949`) — ordinary floating-point summation-order noise (array/child-ordering
differences between independently-constructed scripts), exactly the class of noise T4b-impl itself
disclosed when comparing its own number to T4-review's. Not a methodology gap: same pipeline, same
inputs, same 10-sig-fig agreement.

## Condition 2 — envelope, extra perturbations, floor status

**Verdict: PASS on the numbers, but the report OVERSTATES what the band buys — see below.**

Reproduced the implementer's 8-point sweep exactly (own script, independent runtime instance):

| perturbation | mine | T4b-impl's |
|---|---|---|
| baseline | 1501.063657816772 | 1501.0636578167772 |
| sun az +2 | 1505.1192343873242 | 1505.119234387324 |
| sun az −2 | 1498.2486127649706 | 1498.248612764971 |
| sun el +2 | 1497.659752055402 | 1497.659752055402 |
| sun el −2 | 1505.9735434776896 | 1505.973543477690 |
| camera yaw +2 | 1501.4347031410225 | 1501.434703141023 |
| camera yaw −2 (max) | **1517.5171325517256** | 1517.517132551726 |
| camera pitch +2 | 1493.0947690654434 | 1493.094769065443 |
| camera pitch −2 (min) | **1479.741978529062** | 1479.741978529062 |

Envelope **[1479.74, 1517.52] mm confirmed to reported precision.**

**My own additional perturbations:**
- `fillDensity` 218/219/221 all measured **bit-identical** to baseline (1501.063657816772) — the
  discretization of density near d=220 saturates locally; only 222 moved it (1505.947). No instability.
- sphere `detail` ±2/±4 around the create-default 28 (a fixture-fidelity axis nobody swept):
  detail 24→1505.45, 26→1503.22, 28→1501.06, 30→1501.38, 32→1503.35 — all comfortably inside
  [1479.74, 1517.52].
- camera yaw/pitch ±5° (double the implementer's sweep): 1490.37–1546.59 — still clears the 1400 floor
  with >90mm to spare at the worst point measured, and stays inside the ±10% band.

**Is 1400 a coin bar? No** — it sits 79.74mm (5.4%) below the measured envelope floor and 641.5mm
(84.6%) above the measured RED value, and every additional perturbation I ran (density, mesh detail,
±5° angles) still clears it with wide room. It measures **total path-length ink (mm) contributed by
`group.scenePaths`**, summed exactly as `scripts/audit/scene3d-capture.js`'s `inkMm` does (confirmed by
reading `totalInk()` against the capture script's own ink-summation logic — same `Math.hypot` per-segment
sum). Per T4's own "3.5 is not minimal but principled" precedent, the report is honest that 1400 isn't the
unique passing value ("any value in roughly [800, 1479] would have worked") — this is disclosure, not
concealment, and matches the standing convention.

**⚠ But the secretary's condition 1/2 catch a real overstatement, confirmed by measurement:**
`BASELINE_INK * 0.9 = 1350.9573mm`, which is **below the 1400 floor** (1400 − 1350.96 = 49.04mm). The
band's LOWER bound can never be the operative check — anything that clears the floor (>1400) automatically
clears the band's lower half (≥1350.96) with 49mm to spare. The report's framing ("a second, tighter,
independent check... layered ON TOP of the floor") is only half true: the band's lower half is dead
weight, not a second check. **The band is live only as an UPPER bound** (≤1651.17mm) — the report should
say so plainly instead of describing the band as symmetric protection.

**What is the live upper half actually for? Mutation-tested, not asserted:** I re-applied T4-review's own
"rejected first draft" formula (`bandPitch = truePitch`, no `MK_BAND_MAX_PASSES` ceiling — the exact
mutation that regrew slabs) onto a full copy of `post/` and measured **THIS test's own cell**
(sphere/hatch/d=220): **1501.063657816772 — byte-identical to the shipped fix.** The slab-regrowth
mutation does not sail under the band ceiling; it produces **no detectable change at all** at d=220. I
then measured the same mutation at d=1 (the density T4-review's own G4 mutation test used, where the slab
defect actually lives): shipped fix **826.36mm**, slab mutation **2207.37mm** (+167%) — the classic slab
signature, fully reproduced, but invisible at d=220 because `floor(0.90*truePitch/w)` already saturates
near/under `MK_BAND_MAX_PASSES=6` at this density regardless of whether the ceiling exists. **This guard's
upper band bound cannot and does not catch the slab half of Jay's decision-1 bar** — not "barely", not
"only at extreme regressions" — it is structurally blind to it at this cell, because the slab defect and
this guard's cell are mutually exclusive densities. The report never states this; it should, since it
frames the guard as covering "the restored dark end" (T4's whole unit) rather than only the ink-magnitude
half.

## Condition 3 — RED

**Verdict: PASS, exact reproduction, via vitest on the committed file (not just a script).**
Copied the actual committed `tests/unit/scene3d-mkdashramp-dark-end.test.js` into `noT4/` and ran it with
vitest there:

```
× HEADLINE (T4b) ... — expected 758.5005509047427 to be greater than 1400
× non-regression sanity ... — expected 758.5005509047427 to be greater than 1137.750826357114
Test Files  1 failed (1)   Tests  2 failed | 2 passed (4)
```

`758.5005509047427` — bit-for-bit identical to T4b-impl's own reported RED number, and matches
T4-review's independently-measured `758.501mm` to 10 significant digits. The revert was verified
necessary AND sufficient: `MK_BAND_MAX_PASSES` is absent, and a full `diff` of `noT4/`'s
`surface-fill.js` against the original pre-T4 (`dcc91872`'s ancestor) capOf/bandN code shows the two are
**byte-identical** (the LENGTH-cap formula `min(floor(1.12*R/w)*per, 2*truePitch)` restored exactly,
matching T4-impl.md's own quoted pre-fix formula) — not a partial revert that happens to reproduce the
number by coincidence.

## Condition 4 — band centre, regression-catching, whether band alone would catch 758.5

**Verdict: PASS on the described mechanics; PASS on the specific question asked.** Band is centered on the
MEASURED baseline (`1501.0636578167772`), not the pinned `1501.1` from LEDGER/T4-impl — a deliberate,
correct choice (the measured in-process number, not a rounded headline, is what CI can actually assert
bit-reproducibly). A genuine regression down to `~1351mm` (`1501.1 × 0.9`) would **not** be caught by a
bare ±10% band alone on the LOWER side — but per condition 2 above, the FLOOR (1400) is what's actually
doing that job (1400 > 1350.96), so the band's lower half was never going to be the thing that caught it
anyway; it's the floor. Confirmed directly: **T4's own pre-fix number, 758.5mm, is caught by the floor
alone** (758.5 < 1400) — the band's lower bound (1350.96) would ALSO have caught it, but redundantly,
since 758.5 is far below both. So yes: the floor is the real guard, the band's lower half is
drift-tolerance that never binds ahead of the floor, and the band's upper half (per condition 2) guards
against ink INCREASES only — which, also per condition 2, does not include the specific slab-regrowth
regression at this density.

## Condition 5 — tests-only

**Verdict: PASS.** `git diff --stat dcc91872 7f805654` shows exactly one file,
`tests/unit/scene3d-mkdashramp-dark-end.test.js`, +181/-0. No `src/` file touched. The report's
`## Bars changed` section correctly says "None" and lists the new floor/band/non-regression assertions as
ADDED (a new file, nothing pre-existing widened) — accurate, matches the diff.

## Condition 6 — runtime, pass counts, red-set stability

**Verdict: PASS.**
- New file: **4/4 passed, 9.64s** (mine) vs the report's **8167ms** — consistent (shared-machine
  variance), both comfortably under any timeout tier.
- `scene3d-ribbon-f1b-streaks.test.js` spot-checked: **36/44**, same 8-failure signature (confirmed
  `interlockWeave` streak/degenerate failures at the same assertions), matching the report's disclosed
  pre-existing F1-erode red set exactly — this unit did not touch it (worktree diff confirms only the new
  test file changed).
- Did not re-run `scene3d-ribbon-wall-coverage.test.js` (35/36) independently — the diff-stat alone
  (one new test file, zero other files touched) is sufficient proof that unit could not have moved that
  count, and the AGENT-PROTOCOL spot-check bar ("spot-check one") is satisfied by f1b-streaks.
- `scene3d-mark-laws-draw.test.js` (T4/T1/T1b's oracle) was not independently re-run this review (Tier-2
  slow, and the diff-stat proves zero risk of it moving — no `src/` change exists in this commit that
  could touch it).

## Condition 7 (secretary) — fixture-identity canary

**Verdict: deliberate, and correctly framed.** The `radius === 25 / detail === 28` assertions are
explicitly named in the test as a precondition ("the fixture reproduces the CREATE-defaults sphere...,
not the smaller PARAM-defaults reference") and in the file's own header comment. A future
`PRIMITIVE_CREATE_DEFAULTS.sphere` change would fail THIS test first, by name, with an assertion message
that says exactly what changed (`radius` or `detail`) — not as a confusing downstream ink-number failure.
This is a canary, reads as one, and is good practice; no note needed beyond confirming it.

## Verdict

**ACCEPT-WITH-FOLLOWUPS.** Every headline number reproduces independently to the reported precision
(pipeline identity, 8-point envelope, RED at 758.5005509047427 via vitest on the committed file itself,
tests-only diff, red-set stability). The guard is real and non-vacuous — it does fail on the reverted
mechanism, by the floor, with wide margin, and the floor's own margins (5.4% below envelope, 84.6% above
regression) are honestly earned, not a coin bar. Two follow-ups, not blocking, both about a claim being
broader than what the numbers support:

1. **Restate the band's role.** `BASELINE_INK * 0.9 = 1350.96mm < 1400mm` (the floor) — the band's lower
   half is mathematically dead; it can never be the operative check below the floor. The report should
   describe the band as a **one-sided upper-bound check layered on the floor**, not a symmetric "second,
   independent check."
2. **State plainly that this guard covers only the ink-magnitude half of Jay's decision-1 bar, not the
   slab half, at this cell.** Mutation-tested: T4-review's own rejected-first-draft (slab-regrowing)
   formula produces **byte-identical** ink at sphere/hatch/d=220 (1501.063657816772, same as the shipped
   fix) — it only regrows the slab at low density (d=1: 826→2207mm, the same defect G4 catches elsewhere),
   which this file never touches. A future regression that reintroduces the slab defect ONLY at low
   density (exactly the shape of the bug T4 actually fixed) would pass this guard at 100% margin. This is
   not a defect in what T4b built — row 1a scoped it to "the named cell" — but the report's own language
   ("CI guard for T4's restored dark end") reads as covering the whole T4 acceptance bar, and it doesn't;
   the slab half remains guarded only by `scene3d-mark-laws-draw.test.js`'s G4 tests (unaffected, still
   30/30), which this unit correctly left alone.

Neither follow-up requires a code change to accept; both are report-language corrections plus, optionally,
a cheap low-density slab-mutation assertion in a future follow-up unit if Jay wants the "no slab" half
CI-gated too (currently it is, but only via G4 in the mark-laws file, not via this new file).

REPORT docs/3d-audit/lane-reports/T4b-review.md — ACCEPT-WITH-FOLLOWUPS — numbers reproduce; band's lower half is dead, upper half misses the slab defect.
