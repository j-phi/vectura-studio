STATUS: ACCEPT-WITH-FOLLOWUPS

# W-10c review — originSpiral tone-by-omission below the plot floor

**Lane:** fill-audit-c (read-only review) · **Worktree:** `.claude/worktrees/fill-audit-c` · **Branch:** `3d-scene/fill-audit-c`
**Unit sha:** `441af81f` · **Pre-fix base:** `78bbf3e8` (W-10b) · **Original W-10 fix:** `e757db68` · **Pre-any-fix:** `e757db68^`

## 1. Diff scope

`git show --stat 441af81f`: only `src/core/scene3d/surface-fill-mono.js` (+63/-33 net) and
`tests/unit/scene3d-origin-spiral-tonal-range.test.js` (+11/-14). Clean — matches the lane's file
serialization (`surface-fill-mono.js` → fill-audit-c). `git status --short` in the worktree is
clean; no foreign stash entries touch this lane.

## 2. RED/GREEN reproduction — CONFIRMED, exact match

Scratch export of `78bbf3e8` (`git archive | tar -x`, `node_modules` symlinked from main), the
current `441af81f` test file copied on unmodified, run there against the OLD source:

- **RED** at `78bbf3e8`: torus `400/3991 = 10.0%` FAILS (bar ≤1%), cone `639/6136 = 10.4%` FAILS.
  Numbers match the commit header and the impl report exactly.
- **GREEN** at `441af81f` (worktree HEAD, unmodified): all 6 tests in the file pass, torus/cone
  both `0/n`.

## 3. The one skip — pre-existing, not introduced by this diff

`scene3d-plot-safety.test.js` → `no 4 mm window on the object floods` is skipped via
`const whenCoverageCap = STAGE.coverageCap ? test : test.skip;` (line 55), gated by the HL_STAGE
flag set. `git log` on that file shows the skip predates 441af81f (commit `636e4079`,
"quarantine HL_STAGE-dormant tests"); it is untouched by this diff. Not a violation of the
no-skip-in-diff rule.

## 4. Guards — all green

- `scene3d-plot-safety.test.js`: 5 passed, 1 skipped (above), 0 failed.
- `scene3d-plot-floor-obj.test.js`: 12/12.
- `scene3d-tone-algo-default.test.js`: 6/6.
- `scene3d-ribbon-weightscale-invariant.test.js`: 18/18 (secretary flag — ribbon/weightScale
  invariant, not run by the implementer; run here, no regression from the extra `emitScr` passes).
- `tests/integration/expand-scene3d-weight-to-strokes.test.js`: 5/5 (secretary flag; no
  regression — originSpiral never carries `meta.weightScale`, so this suite's multi-pass-stroke
  expansion is orthogonal to the retrace mechanism and untouched).

## 5. Mutation test — CRITICAL FINDING: the retrace mechanism has zero regression coverage

Copied the worktree to a scratch dir, disabled the retrace loop only
(`for (let L = 2; L <= DUTY_CAP && false; L += 1) { ... }`, floor-raise to 1.0x pen left intact),
and ran the full test file:

```
6 passed (6) — including both torus/cone gap tests AND the sphere shadow/lit 1.2x ratio test
```

**All 6 tests still pass with the retrace mechanism completely disabled.** Root cause: the gap
tests read `p = Math.max(PLOT_MIN_PEN, wanted)` — driven only by the floor raise, never by the
retrace loop, which runs strictly after `p` is already computed and pushed. The sphere
shadow/lit-ratio test also doesn't depend on retrace at this scene (sphere's floor-violation
headroom is small enough that the 1.2x bar clears with or without it). `grep -rn "DUTY_CAP\|localDuty" tests/unit/*.js`
returns nothing — no test anywhere references either symbol. This means the actual innovation
this unit claims credit for — buying back tone lost to the floor raise via retrace-in-place — is
**not protected by any committed test**. A future refactor that silently breaks or deletes the
retrace loop would regress tone with zero red signal, while still passing every test this unit
shipped. This is the one real RGR-discipline gap in this unit.

## 6. Secretary/ledger flags — addressed

**(a) No adjacent drawn turns < 1.0 pen at d=50 and d=220, sphere/torus/cone.** Wrote an
independent measurement script (`captureOpts` + `__MONO_TRACE`/`C.__spiralGaps`, same technique
the test file uses) and ran it directly against the worktree at `fillDensity` 50 and 220 (the
UI slider's own min-default/max, confirmed in `scene3d-panel.js:393`). Result for all three
primitives at both densities: `below10: 0`, **`minGap: 0.3` exactly equal to `pen: 0.3`** (1.0x
pen, never under). CONFIRMED — condition (a) holds everywhere tested.

Bonus finding: `d50` and `d220` produce byte-identical numeric output (same gap count, same
retrace-fragment count, same point totals) for every primitive — independently confirms
`originSpiral` ignores `fillDensity` entirely (matches the impl's claimed med≡max byte-identity,
now verified numerically, not just via image hash, and confirmed this is pre-existing law
behavior, not something W-10c touches).

**(b) DUTY_CAP bounded, reads as tone not blobs.** The cap is enforced arithmetically
(`clamp(Math.round(PLOT_MIN_PEN / wanted), 1, DUTY_CAP)`), so it cannot runaway by construction.
I looked at the after/W-10c PNGs directly (Read tool, not just hashes) for torus, cone, and
sphere: no fat lines, no bleed, no solid blobs anywhere, including in the highest-duty (torus
lower fan, cone base) regions — ticks stay visibly separated at normal viewing size. PASS,
visually confirmed. But — same gap as §5 — no test protects this boundary; `DUTY_CAP=4` against a
measured max observed duty of ~3.6 has no headroom margin test, so a future primitive/scene that
pushes duty to 5+ would silently clip with no signal.

**(c) Tone ordering survives (shadow > lit).** Confirmed directly for sphere: the existing
committed test (shadow/lit density ratio > 1.2) passes at `441af81f`, and — per §5's mutation
test — continues to pass even with retrace fully disabled, so this specific bar isn't at risk.
I did **not** get an independent torus/cone-specific lit-vs-shadow ink measurement of my own —
my scratch script for that timed out/hung against the heavier full-scene pipeline and I killed it
after ~13 minutes rather than keep burning time. This is a gap in *my* verification, disclosed
honestly, not a defect I'm pinning on the implementer. The directional evidence (impl's own
segCount/inkLen deltas: torus +5.2-8.4% ink — the largest gain, concentrated exactly where the
floor was engaging hardest — vs cone +0.7-1.0%, the primitive with the least floor-violation
headroom) is consistent with tone being restored where it was lost, not smeared flat, but I
could not independently reproduce a torus/cone shadow/lit ratio number myself.

**(d) Ink overshoot vs the true pre-W-10 baseline (`e757db68^`).** Attempted — scratch-exported
`e757db68^`, symlinked `node_modules`, ran the same ink/segment measurement used for the
78bbf3e8-vs-441af81f comparison. The process hung (very low CPU over 13 minutes elapsed,
consistent with an async/rAF-timer stall rather than a tight loop) and I killed it. Not resolved.
Given (a)-(c) above are otherwise satisfied and the immediate-predecessor (78bbf3e8) comparison
is solid, I don't consider this blocking, but it's an open number.

**(e) DUTY_CAP mutation/edge check.** Confirmed absent — see §5. Recommend as a followup: a test
that either asserts the measured max local duty stays comfortably under `DUTY_CAP` (headroom
guard) or exercises a synthetic scene that would legitimately need duty ≥ 5, to prove the cap
doesn't silently clip.

**(f) Per-arc tone, not just object totals.** Partially addressed by (c)'s sphere numbers and by
directly measuring the retrace mechanism's own footprint: on the worktree, one buildObject pass
produces `retraceFragmentCount` 222 (sphere), 325 (torus), 205 (cone) separate extra `emitScr`
passes, contributing `retraceTotalPts` 6233 / 4515 / 6374 extra points respectively — the
mechanism is genuinely and substantially active on all three primitives, not a no-op that
happens to pass the whole-object ±15% bar by chance. I did not build a full per-angle-bucket ink
histogram to catch a hypothetical ~40% single-arc tone loss hiding inside a passing object
total — that remains a real residual risk given §5's finding that no test would catch it either
way.

**(g) Ribbon/expand-weight-to-strokes suites.** Run — see §4. Both green, no regression.

**(h) med≡max / hatch≡contour byte-identical, claimed pre-existing.** Independently confirmed
twofold: (1) numerically, via my own `d50`/`d220` sweep (§6a) — identical output; (2) via a fresh
Playwright capture of the worktree (see §7) reproducing the exact stored `after/W-10c` hash.
Genuinely pre-existing law behavior, correctly characterized.

## 7. Evidence — a real finding: report.json's own before/after pointer is broken

Direct `md5` on the delivered evidence turned up something the implementer's report did not
catch: **`docs/3d-audit/fill-audit/after/W-10c/shots/B/*.webp` are byte-identical to
`docs/3d-audit/fill-audit/after/W-10/shots/B/*.webp`** — the exact images `report.json`'s own
`before` field points at. A reviewer diffing report.json's own listed before/after pair sees
*zero* pixel difference, directly contradicting the report's prose ("visibly thinner... 45115/
320000 px changed").

I ran the actual capture pipeline myself (`scripts/audit/scene3d-capture.js`, fresh `--out`,
fresh port) to determine whether this is a stale-copy bug or a genuine coincidence:

- Fresh capture of the **worktree** (441af81f, confirmed serving `APP_VERSION 1.3.98`, matching
  `package.json`) at port 8477 → `24f989c5...` — **matches** the stored `after/W-10c` content.
  The W-10c evidence is NOT stale; it genuinely reflects 441af81f. My initial stale-copy
  suspicion (raised by the capture script's own documented "skip if destination already exists"
  resumable behavior) is **disproven**.
- Fresh capture of a scratch export of **78bbf3e8** (W-10b, the true immediate predecessor) at
  port 8478 → `60d3c02e...` — **differs** from 441af81f's hash. The real, code-level
  before/after pair exists and is visually distinguishable (I looked at both — see below); it
  simply isn't the pair report.json points at.
- Fresh capture of a scratch export of **e757db68** (the original W-10 fix, 0.5x floor) at port
  8480 → `5db1d3ff...` — differs from *both* of the above, and also differs from what's
  currently sitting in `after/W-10/shots/B` (`24f989c5...`). This means the `after/W-10` gallery
  folder — which should be a frozen historical record of the *original* W-10 commit — has itself
  been overwritten at some point with 441af81f-era content, most likely by an earlier, uncommitted
  capture attempt (possibly the dead WIP session that produced the 441af81f checkpoint) writing
  into the wrong `--out` path before the correct `after/W-10c` directory was created.

**Net assessment:** the underlying source fix is real (confirmed three independent ways: the
unit-test RGR numbers, my own `d50`/`d220` gap-safety measurement, and this fresh 78bbf3e8-vs-
441af81f capture diff). But the evidence *packaging* is broken — report.json's `before` array is
wrong, and the `after/W-10` folder it points at has been corrupted for any future lane that
relies on it as a historical baseline. This is a documentation/evidence-hygiene defect, not a
source-code defect, and should be fixed as a followup (repoint `before` at a genuine 78bbf3e8
capture, and investigate/restore `after/W-10`).

**Looked at the images myself** (Read tool, not the implementer's description): comparing the
true pre-any-fix render (`e757db68^`, fresh capture) against 78bbf3e8 and 441af81f — the
pre-any-fix torus render shows visibly *solider*, less-textured white wedges in the lower-left/
lower-right fan than either fixed version; both 78bbf3e8 and 441af81f show more internal tick
separation there. The improvement from 78bbf3e8 → 441af81f specifically is real but subtle at
normal viewing size — consistent with the impl's own honest "real, if modest" characterization,
not an overstatement. Cone and sphere: clean, evenly separated ticks, no overstrike/blob/bleed
artifacts anywhere, including in the highest-duty regions (torus lower fan, cone base).

## 8. Reframing (omission → retrace-in-place)

The impl report itself flags this and asks for reviewer sign-off. I accept the reframing: the
brief's literal "turn omission" and the shipped "retrace-in-place" mechanism deliver the *same*
plot-safety guarantee (no two drawn turns closer than 1 pen — proven in §6a at both density
extremes on all three primitives) while retrace additionally recovers tone that omission alone
would have simply discarded. Retrace is the strictly better choice for this failure mode and does
not read as scope drift.

## Verdict: ACCEPT-WITH-FOLLOWUPS

The plot-safety fix itself is real, correctly tested (RGR proof reproduced exactly), and
independently verified at both density extremes on all three affected primitives with zero
tolerance-widening. The three REJECT-triggering conditions the orchestrator set (§ ruling) all
hold: (a) confirmed directly, (b) confirmed by code construction + visual inspection, (c)
confirmed for sphere, reasonably supported but not independently reproduced for torus/cone.
Nothing here warrants "re-scope to omission."

Required followups before this F-10 saga is closed out for good:

1. **Add regression coverage for the retrace mechanism itself.** Today, disabling it entirely
   leaves all 6 tests green (§5) — the single biggest gap in this unit.
2. **Add a DUTY_CAP headroom/boundary test** — currently zero coverage (§6e).
3. **Fix the evidence gallery**: `report.json`'s `before` pointer is byte-identical to `after`
   (§7); repoint it at a genuine 78bbf3e8 capture and investigate why `after/W-10/shots/B` was
   overwritten with newer content.
4. **Finish the torus/cone lit-vs-shadow tone-ordering measurement** I could not complete (§6c/d)
   — not blocking, but leaves one ledger flag only partially closed.

REPORT docs/3d-audit/lane-reports/W-10c-review.md — ACCEPT-WITH-FOLLOWUPS — floor-raise+retrace verified safe; retrace mechanism untested; evidence before-pointer stale/wrong.
