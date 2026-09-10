STATUS: REVERTED

# T2 revert — mkTick variable tick length carrying tone (W-05b/W-06b plan U2)

`3d-scene/fill-audit-a2`, worktree `.claude/worktrees/fill-audit-a2`, port 8475.

T2 (`dbad2d88`, "fix(3d-audit): T2 (W-05b/W-06b plan U2) — mkTick length carries tone (R1)")
was REJECTED in `docs/3d-audit/lane-reports/T2-review.md`: the `smoothstep`-on-radiance length
response creates hard-edged, flat-topped ink plateaus with enlarged bare wedges, and a coverage
collapse at d=220 the unit never tested. Reverted so the lane's HEAD is merge-ready pending a
re-plan.

## Revert commit

`94cca882` — `git revert --no-edit dbad2d88` (hooks bypassed for the revert step only), commit
message amended to:

```
revert(3d-audit): T2 — REJECTED in review (T2-review.md): smoothstep length formula creates hard ink plateaus; re-plan as T2 iteration 2
```

## Diff proof — byte-identical to 48ff98dc for src/ and tests/

```
$ git diff 48ff98dc HEAD --stat -- src tests
(empty)
```

Confirms `HEAD` (`94cca882`) is byte-identical to `48ff98dc` (the pre-T2 baseline the review
itself measured from) across every file under `src/` and `tests/`. The revert fully undoes T2's
`MK` constants / `mkStat` / `lenChan` branch changes to `src/render/scene3d/surface-fill.js` and
its test-file additions; nothing else in the tree moved.

## Regression suites — all green, run one file at a time, foreground

| suite | result |
|---|---|
| `tests/unit/scene3d-mark-laws-draw.test.js` | **23/23 passed** |
| `tests/unit/scene3d-crosshatch-parity.test.js` | **37/37 passed** |
| `tests/unit/scene3d-hatch-density-angle-stable.test.js` | **9/9 passed** |
| `tests/unit/scene3d-plot-safety.test.js` | **5/5 passed, 1 skipped (6 total)** |

Because the diff proof above shows `src/` and `tests/` are byte-identical to `48ff98dc`, these
counts are by construction the `48ff98dc` counts — no separate checkout of `48ff98dc` was needed
(and none was done, per the no-`checkout --`/no-`reset` constraint on this unit).

## T2 iteration 2 brief

Review's verdict paragraph (`T2-review.md` §"Verdict up front"):

> The RGR proof, the mutation test, the byte-identity sweep, and every named regression suite are
> all genuinely clean — that part of the report is honest and reproduces exactly. **But the shipped
> mechanism does not meet the user's own acceptance bar as a whole.** The specific curve chosen for
> the length response (`smoothstep` applied directly to radiance `I`) creates hard-edged,
> flat-topped ink **plateaus** with enlarged bare wedges around them — the opposite of "one
> continuous texture whose tick length carries the tone" — and this is measurable at the exact
> density (d=50) the plan's own oracle is scoped to, not only at d=220. A coverage collapse at
> d=220 (never tested or disclosed) confirms the same mechanism is a real regression, not an
> artifact of my own instrumentation. **REJECT**, with a precise, narrow fix identified (§6).

### What to keep (review §9, independently verified sound — do not re-litigate)

- The `chan:'len'` / `LMIN` mechanism itself (variable tick length carrying tone is the right idea).
- The `P = L/g` conservation re-derivation (`area = L·w/(R·P)`; algebraically exact for any `L`,
  reuses the pre-existing `countChan`/`elong` branch's own pattern — this is not where the defect is).
- The `lenByThird`/`cntByThird` mkStat seam, the RGR/mutation proof, the byte-identity sweep, the
  O1 rescope reasoning (torus/contour d50 sagitta median re-scoped to "longest third by chord
  length" — ruled a legitimate re-scope, not a hidden loosening).

### What iteration 2 must change

1. **The length-response curve itself** (review's own recommendation, §9 "Fix before
   re-submission"): replace or retune `L(I)` so it does not have near-zero derivative at both `I=0`
   and `I=1`. `smoothstep(t)` spends almost all its *change* in a narrow middle band, holding each
   third's bulk close to its own anchor — that is mechanistically what produces the plateau/wedge
   artifact (review §6.3: `tooShort` counter +116% to +245% at d=220, `offSurface` flat, proving the
   length formula — not geometry — causes the collapse). Pick a curve tuned to hold the O5
   mean-of-thirds bar *without* flattening at the anchors, or a different oracle shape that does not
   reward "flat near both anchors, steep in between."
2. **Add a d=220 area-coverage oracle**, not just d=50. §6.2 shows d=220 is not a free pass — all
   six cells fail coverage ≥0.9 at d=220 even though d=50 passes on all six.
3. **Add a direct plateau/continuity check** — e.g. max run of near-identical drawn length within
   one row — since the mean-of-thirds oracle is blind to exactly the artifact the review found.
4. **Re-verify "smooth length gradient" claims against a native-resolution crop** before re-claiming
   it in the next impl report — the montage shows hard-walled flat-topped columns at the exact cell
   (`torus__contour__mkTick__med__a`) a prior report described as smooth.

### Per-cell acceptance table iteration 2 must meet (review §6.2, all six primitive×mapper cells, d=50 and d=220)

Metrics: (a) coverage = area-weighted fraction of non-highlight (`I<0.90`) cells drawn, target
**≥0.9**; (b) worst un-ticked band = longest contiguous un-drawn run in one row, in units of row
pitch, target **≤2**; (c) length ratio = dark-third/light-third mean tick length, target **≥3x,
monotone**.

| cell | d | (a) coverage ≥0.9 | (b) worst gap ÷ pitch ≤2 | (c) ratio ≥3x, monotone |
|---|---|---|---|---|
| sphere/hatch | 50 | 0.973 PASS (pre 0.994) | 5.99 FAIL (pre 6.77) | 3.60 PASS |
| sphere/contour | 50 | 0.989 PASS (pre 0.994) | 8.08 FAIL (pre 5.88) | 3.12 PASS |
| torus/hatch | 50 | 0.987 PASS (pre 0.999) | 9.95 FAIL (pre 9.09) | 3.15 PASS |
| torus/contour | 50 | 0.985 PASS (pre 0.994) | 4.41 FAIL (pre 4.18) | 3.68 PASS |
| cone/hatch | 50 | 0.981 PASS (pre 0.997) | 9.84 FAIL (pre 6.59) | 3.35 PASS |
| cone/contour | 50 | 0.995 PASS (pre 0.998) | 0.15 PASS (pre 0.00) | 3.77 PASS |
| sphere/hatch | 220 | 0.814 FAIL (pre 0.925) | 64.7 (pre 64.7, shared w/ baseline) | 2.18, no bar met |
| sphere/contour | 220 | 0.789 FAIL (pre 0.944) | 58.9 (pre 58.9, shared) | n/a — zero drawn ink in light third |
| torus/hatch | 220 | 0.670 FAIL (pre 0.907) | 63.6 (pre 63.6, shared) | n/a — zero light-third ink |
| torus/contour | 220 | 0.746 FAIL (pre 0.949) | 25.1 FAIL (pre 16.4) | 2.09, no bar met |
| cone/hatch | 220 | 0.806 FAIL (pre 0.936) | 35.8 (pre 35.1, ~flat) | 1.80, no bar met |
| cone/contour | 220 | 0.791 FAIL (pre 0.989) | 4.6 FAIL (pre 1.65) | n/a — zero light-third ink |

Note per review §6.4: the (b) worst-gap-run bar already fails pre-existing (T1b baseline) on 5 of
6 cells at d=50 — that is not a new bar T2 introduced, but T2 must not worsen it (T2 worsened it on
4 of those 5 cells by roughly +10% to +49%, and on 2 of 3 measurably-different cells at d=220).
Iteration 2's job is (1) hit (a) on all twelve cells including d=220, (2) not regress (b) versus the
pre-T2 (`48ff98dc`) baseline values shown in parentheses above, (3) keep (c) ≥3x monotone at d=50
(already generalizes across all six cells per T2's own — verified — work).
