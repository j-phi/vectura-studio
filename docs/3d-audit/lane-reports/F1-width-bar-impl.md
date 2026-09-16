STATUS: DONE

# F1-width-bar — a FLOOR on ribbon WIDTH (TESTS ONLY, MEASURE-FIRST)

Lane: fill-audit-a3. Worktree: `/Users/jayphi/Documents/github/vectura-studio/.claude/worktrees/fill-audit-a3`.
Branch: `3d-scene/fill-audit-a3`. Base sha at start (per resume brief): `9d911b05`. **Mid-task the orchestrator
reverted T2-2** (Incident 10 resume); the actual base this unit commits on is **`179d9218`**
(`Revert "fix(3d-audit): T2-2 ..."`), whose `src/core/scene3d/surface-fill.js` is confirmed **byte-identical**
to `3bc61c32` (F1-amp's own landed sha) via `git diff 3bc61c32 179d9218 -- src/core/scene3d/surface-fill.js` =
zero lines. All baselines below were re-derived on `179d9218`, not trusted from the pre-revert run.

## Files touched (tests-only; no `src/` file touched)

- `tests/helpers/scene3d-ribbon-width.js` — new. Shared width/ink measurement helper (the canonical
  measurement logic), used identically by the script and the test file below.
- `scripts/audit/scene3d-ribbon-width.js` — new. The ONE canonical CLI script (JOB 1).
- `tests/unit/scene3d-ribbon-width-bar.test.js` — new. The guard itself (JOB 3): 10 tests.

## Baselines re-derived on `179d9218` (foreground, one file at a time, per §0b)

| file | result |
|---|---|
| `scene3d-ribbon-f1b-streaks.test.js` | **44/44** |
| `scene3d-ribbon-wall-coverage.test.js` | **36/36** |
| `scene3d-ribbon-f1-amp.test.js` | **47/47** |
| `scene3d-ribbon-flat-field-placement.test.js` | **22/22** (one unrelated `[vitest-worker] onTaskUpdate` RPC timeout flagged as an "Unhandled Error" by the harness under shared-machine load — a known infrastructure flake per `tests/helpers/load-vectura-runtime.js`'s own header comment, not a test failure; all 22 tests still passed) |
| `scene3d-ribbon-erode-refusal.test.js` | **16/16** |
| `scene3d-mark-laws-draw.test.js` | **30/30** |
| `scene3d-ribbon-width-bar.test.js` (new, this unit) | **10/10** |

All match the brief's expected numbers exactly. Nothing pre-existing red; nothing turned red by this unit
(§0 rules 4/5 — n/a, no other unit's test touched, no pin at risk: this unit adds a new file only).

## JOB 1 — the ONE canonical script, and the −0.98% vs −1.10% discrepancy resolved

**Canonical script:** `scripts/audit/scene3d-ribbon-width.js`. States its rig (`addLayer` — the same
`engine.addLayer('scene3d')` construction every RGR file in this lane uses), fixture (torus/hatch/density 50,
default camera), and pen (0.30mm, read back from `lastRibbonStats.penWidth`, not assumed) in its own header,
per the brief.

**The discrepancy, resolved, not merely explained-away.** F1-amp's implementer reported
`trochoidLoop` torus/hatch/d=50 ink `6645.83 → 6581.01mm (−0.98%)`; F1-amp's reviewer independently measured
`6645.828 → 6572.712mm (−1.10%)` on "md5-identical source," cause unresolved. Method: ran the canonical
script's own construction against the **actual committed `3bc61c32` `surface-fill.js` content**
(`git show 3bc61c32:<path>` fed in via `loadVecturaRuntime`'s `scriptOverrides` — the same technique every
RGR file in this lane already uses for a pre-fix RED proof, confirmed byte-identical to this worktree's
current file by a zero-line `git diff`). Result: **`6572.7118mm`** — matching the **reviewer's** number to 4
decimal places, not the implementer's `6581.01`. All three OTHER subject laws (`interlockWeave`,
`amplitudeOnly`, `onePenDown`) matched **both** reports exactly, pre **and** post — which independently rules
out a rig/fixture/density difference (that would have moved all four, not one). Determinism was checked
directly: three fresh runtime loads of the identical tree gave the identical `trochoidLoop` figure to the
last printed digit (no run-to-run noise on this pipeline/fixture).

**Conclusion:** the reviewer's `−1.10%` is this repo's canonical, reproducible number for
`torus/hatch/trochoidLoop/d=50` on the `addLayer` rig at `3bc61c32`; the implementer's original `6581.01` /
`−0.98%` does not reproduce from the committed source under the standard construction and is a measurement
slip in that one script, not a legitimate second rig/fixture reading. There is no live "two right answers"
ambiguity here despite the "md5-identical source" framing suggesting one. Full reasoning is in the script's
own header comment (load-bearing, not decorative — future width/ink claims should cite it).

## JOB 2 — the honest quantity, measured on both trees

Chose **mean drawn width per `CLS_RIBBON` stretch, length-weighted by arc length** (the first candidate
listed in the brief, and F1-erode-plan.md §7's own method, reproduced exactly): `RibbonGeometry
.buildRibbonMultiPolygon` is wrapped for the duration of one `computeAllDisplayGeometry()` call; CLS_RIBBON
calls are told apart from CLS_WALLS calls (both call the same function) by `minHalfWidth`
(`penWidth/2` vs `penWidth*0.05` — a >3x difference).

**Measured, addLayer rig, torus/hatch/d=50, camera 'a', pen 0.30mm:**

| law | pre (`6e1ed52f`) width mm (pen) | post (current, `179d9218`) width mm (pen) | Δ |
|---|---|---|---|
| interlockWeave | 1.1381 (3.7938) | 0.9832 (3.2772) | **−13.6%** |
| trochoidLoop | 0.9739 (3.2463) | 0.9377 (3.1258) | **−3.7%** |
| onePenDown | 1.0089 (3.3630) | 0.8801 (2.9335) | **−12.8%** |
| ampSpacing (WV6 control) | 0.7787 (2.5955) | 0.7787 (2.5955) | 0.0% (byte-identical — confirms WV6 untouched, as F1-amp's own report requires) |
| amplitudeOnly | n/a (0 `CLS_RIBBON` stretches) | n/a (0 `CLS_RIBBON` stretches) | — |

**New finding for decision 10's evidence packet, not previously reported by any unit:** F1-amp's own report
attributed its ink loss to erosion/self-occlusion interaction with added arc length, not to width. This
unit's own measurement shows F1-amp **also measurably thins WIDTH** on all three laws that have a width to
measure — a further 3.7–13.6% on top of whatever F1-placement had already done (F1-erode-plan.md §7:
`onePenDown` pre-F1-placement 1.0301mm → post-F1-placement 0.9860mm; this unit's own pre-F1-amp reading is
1.0089mm, close to but not identical to F1-erode-plan's 0.9860mm — expected, since F1-erode's own fix landed
between those two measurements and F1-erode-plan.md §8 states `onePenDown` is md5 byte-identical across the
erosion fix, so the small remaining gap is most likely camera/measurement-method noise between the two
studies, not a third mechanism; not chased further, out of this unit's scope to re-audit F1-erode's own
numbers).

**`amplitudeOnly` is measured, not assumed, to have zero `CLS_RIBBON` population on this fixture** on both
trees — every one of its stretches falls into the narrower CLS_WALLS/CLS_CENTRE buckets here. Per §0 rule 1
("name the clause you do not cover") this law is **excluded from the width floor** and instead gets its own
`ribbonStretchCount === 0` control test, so a future change that starts pushing it into the wide bucket is at
least visible.

**Both-rigs disclosure (§0 rule 3).** The INK half of "measure on both rigs" is satisfied: F1-amp's own
reviewer already measured `onePenDown` at −7.99% on `create` (condition 3), and this unit's own evidence
captures (`docs/3d-audit/fill-audit/after/F1-width-bar/`, both rigs) document the current shipped state
visually on both. The WIDTH half is **not** extended to the `create` rig: `RibbonGeometry
.buildRibbonMultiPolygon` wrapping only works inside a Node-controlled runtime; the `create` rig's own
measurement pipeline runs inside a real browser page driven by MAIN's `scripts/audit/scene3d-capture.js`,
which does not expose per-stretch width and is a MAIN-owned script outside this unit's tests-only grant to
edit. **Disclosed, not hidden** — the floor below is proven on the `addLayer`/unit fixture only, matching the
rig every sibling RGR file in this lane already uses for its own bars.

## JOB 3 — the bar, the drift envelope, and the mutation-kill

**Which half this gates (§0 rule 1):** a FLOOR only — "does not go THINNER than X." No ceiling; says nothing
about ink, fill rate, or streak geometry (already covered by sibling files).

**Drift envelope, measured (T4b-style: camera 'a' vs 'b', the two angles `scene3d-capture.js` itself
shoots), on the SHIPPED (post) tree:**

| law | camera 'a' mm | camera 'b' mm | spread |
|---|---|---|---|
| interlockWeave | 0.9832 | 0.9784 | −0.5% |
| trochoidLoop | 0.9377 | 0.8270 | **−11.8%** (this law's own documented lattice sensitivity — LEDGER row 2c) |
| onePenDown | 0.8801 | **not measured** — attempted, aborted after 40+ minutes under heavy shared-machine load (`uptime` load average ~4 at the time; every other build in this session completed in well under a minute). **Disclosed, not hidden.** |

Repeat-run determinism was separately confirmed exact (three fresh loads of the identical tree gave the
identical figure to the last digit) — no floor slack is needed for run-to-run noise on this fixture.

**Floor = 0.85× the LOWER of the two measured camera angles**, where both exist (`interlockWeave`,
`trochoidLoop`); for `onePenDown`, where only camera 'a' could be measured, a **larger 0.80× margin** stands
in for the unmeasured cross-camera risk:

| law | floor (mm) |
|---|---|
| interlockWeave | 0.8316 |
| trochoidLoop | 0.7030 |
| onePenDown | 0.7041 |

**Mutation-kill (§0 rule 1, BLOCKING) — two mutations on the same instrumentation:**

1. **POSITIVE (must trip the floor):** scales the half-width value fed into `buildRibbonMultiPolygon` for the
   CLS_RIBBON branch specifically (`hw.push(Math.max(half[i], HALF_MIN))` → `... * 0.6`) by 0.6.
   **Disclosed dead end, not hidden:** an earlier attempt mutated the upstream per-sample assignment
   (`half[i] = penWidth * (perSample ? ... : runW) / 2`) instead, and measurement showed it did **not** move
   `onePenDown`'s width at all (identical ink to 12 significant digits) — `onePenDown` takes the `runW`
   branch, and scaling that line let borderline samples migrate OUT of the CLS_RIBBON bucket entirely
   (survivor bias) rather than narrowing the surviving ones. Mutating the **post-classification** `hw.push`
   call instead avoids both problems: `classAt` has already run against the unscaled `half[]` values, so
   `ribbonStretchCount` is provably unaffected (asserted in the test) and the scale applies uniformly to
   every law that reaches CLS_RIBBON at all. Result: all three laws' mutated width drops clearly below their
   floor (interlockWeave 29% below margin, trochoidLoop 20% below margin, onePenDown 25% below margin), with
   `ribbonStretchCount` provably unchanged from shipped.
2. **NEGATIVE (must NOT trip the floor):** F1-amp's own amplitude-floor wiring-revert (`WIRING_NEEDLE`,
   reproduced verbatim from `scene3d-ribbon-f1-amp.test.js` as this file's own copy — no cross-file
   `require`). This un-ships F1-amp's own amplitude floor, a real mechanism change, and F1-erode-plan.md §7
   already established width comes from "the weight field," not amplitude. If this mutation tripped the
   width floor, the floor would be vacuously sensitive to any diff. **It does not** — confirming the floor
   measures the thing it claims to (width), not an incidental correlate.

**If the populations had not separated (§0 rule 1 / JOB 3's own caution):** they do — the mutation's ~40%
drop lands 20–29% past each floor's own margin below the shipped value, and the negative control's mechanism
change moves nothing. No coin bar; a real signal with real margin on both sides.

## Test file

`tests/unit/scene3d-ribbon-width-bar.test.js` — 10 tests, all passing:
- 3× GREEN (shipped tree clears its own floor)
- 3× RED/mutation-kill positive (0.6x thinning trips the floor, `ribbonStretchCount` unchanged)
- 3× negative control (amplitude-floor revert does not trip the floor)
- 1× `amplitudeOnly` control (`ribbonStretchCount === 0`, measured not assumed)

## Evidence

`docs/3d-audit/fill-audit/after/F1-width-bar/` — captured from MAIN's `scripts/audit/scene3d-capture.js`
(`--root .claude/worktrees/fill-audit-a3 --port 8475`), both rigs, `torus/hatch/{interlockWeave,trochoidLoop,
amplitudeOnly,onePenDown}/med/a` (all four confirmed to exist in `manifest.B.*.jsonl` before naming them).
This unit makes **no `src/` change**, so there is no before/after visual diff of its own to show — the
captures document the CURRENT shipped state as the visual backing for the width numbers measured above (`report.json`
records this explicitly, so no cell is a silent "byte-identical, unexplained" pair).

**Looked at both `onePenDown` renders (native-resolution PNG conversion of the 800×~370px `.webp`, no crop
needed at this zoom — the defect is whole-ring, not sub-mm):** both rigs show the ring's ribbons as thin
zigzag lines with visible black gaps between successive teeth — a wireframe-like read, not a bold filled
band. This matches the "thin wireframe zigzags" description that raised decision 10, and is consistent with
this unit's own measured mean CLS_RIBBON width (0.88mm / 2.93 pen on the addLayer rig) being thinner than the
pre-F1-amp reading (1.01mm / 3.36 pen) and thinner still than F1-placement's own pre-fix number
(F1-erode-plan.md §7: 1.03mm at `8adfd5af`).

## What this unit answers for Jay (decision 10, both branches)

Built the same way regardless of the answer, per the brief. Under **(A)** accept the thinner, even style
(what is shipped today) — this is now the guard that stops the next unit from thinning a ribbon further,
unnoticed, on `interlockWeave`/`trochoidLoop`/`onePenDown`. Under **(B)** restore the weight — this is
F1-weight's acceptance instrument: F1-weight's own fix would need to clear these SAME floors from above,
plus (necessarily, since decision B implies increasing width) a NEW ceiling this unit does not set (out of
scope — a floor answers "did we thin it further," not "did we restore it enough").

## `## Bars changed`

**ADDED only** (this unit's report is scoped to additions, per its own brief — no pre-existing bar was
touched, up or down):

- `tests/unit/scene3d-ribbon-width-bar.test.js:186` — NEW — `WIDTH_FLOOR_MM.interlockWeave = 0.83164mm`
  (0.85× the lower of camera 'a'/'b' measured post-fix width, 0.9784mm) — why: floors the mean `CLS_RIBBON`
  width so a future change cannot thin this law's ribbons further without a red test.
- `tests/unit/scene3d-ribbon-width-bar.test.js:187` — NEW — `WIDTH_FLOOR_MM.trochoidLoop = 0.70295mm`
  (0.85× the lower of camera 'a'/'b' measured post-fix width, 0.8270mm) — same reason.
- `tests/unit/scene3d-ribbon-width-bar.test.js:188` — NEW — `WIDTH_FLOOR_MM.onePenDown = 0.70408mm`
  (0.80× the camera-'a'-only measured post-fix width, 0.8801mm — a larger margin than the other two laws,
  standing in for the cross-camera spread that could not be measured within the available time) — same
  reason.

No existing test file, tolerance, count bar, or pinned fingerprint was changed, widened, or re-pinned.

## Open follow-ups

1. `onePenDown`'s camera-'b' width was never measured (machine load); its floor uses a compensating larger
   margin (0.80× vs 0.85×) rather than a directly-measured cross-camera envelope. A future session with a
   quieter machine could tighten this once the real camera-'b' number is in hand — not blocking, since the
   margin is already conservative relative to `trochoidLoop`'s own measured worst-case spread (−11.8%).
2. The width floor is proven on the `addLayer`/unit fixture only (see JOB 2's both-rigs disclosure above) —
   extending it to the `create`/gallery rig would need `scene3d-capture.js` itself instrumented for
   per-stretch width, which is a MAIN-owned script outside this unit's grant.
3. This unit does not attempt to re-audit or re-confirm F1-erode-plan.md §7's own pre-F1-placement width
   numbers (1.0301mm/0.9860mm) — it takes them as given input, per the brief ("use it, do not re-derive it"),
   and reports its own small residual gap against them (§ JOB 2 above) without chasing the cause.

## Machine-load note (process, not scope)

This session's canonical-script measurements ran markedly slower than sibling test files under heavy
concurrent load from OTHER sessions on this shared machine (`uptime` load average ~3–4.4 throughout; several
long-running `probe*.js`/`measure*.js` processes from other sessions were visible in `ps aux`, none started
by this unit). One measurement (`weaveDepth`, a WV6 control law not required for this unit's own floor) was
abandoned after 25+ minutes and dropped from the default law list with a comment explaining why; `onePenDown`
camera-'b' was abandoned after 40+ minutes for the same reason (see follow-up 1). Every measurement actually
used in this report's floors and mutation-kill completed and is reported above.
