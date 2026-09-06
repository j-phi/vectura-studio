STATUS: ACCEPT-WITH-FOLLOWUPS

# U1-U5 review — fill-collapse (fill-roster picker collapse, C-01..C-05)

- **Lane / worktree**: fill-collapse, `.claude/worktrees/fill-collapse` (read-only; no edits/stash/commits made)
- **Pinned range**: `a8d84bef` (U0) .. `8610fd66` (U5) — U1 `799eaa36`, U2 `cf12b0af`, U3 `6ed9002d`,
  U4 `4186412e`, U5 `8610fd66`
- **Method**: `git archive a8d84bef` → `.../scratchpad/u5-before`, `git archive 8610fd66` → `.../scratchpad/u5-after`,
  `node_modules` symlinked into both from main. Also archived each of the 5 intermediate commit shas into their own
  scratch exports to independently re-measure per-unit picker counts. All numbers below are independently
  re-derived from these exports, not trusted from the implementer's worktree or report.json files.

## 1. Diff scope — PASS

`git diff --stat a8d84bef..8610fd66 -- . ':!graphify-out'`: exactly 8 files — `docs/3d-audit/lane-reports/U0-impl.md`
(a report doc, from the `eab7d0b0` U0-report commit riding along in this range), `scripts/build-tone-laws.js`,
`src/config/scene3d-tone-laws.js`, `tests/integration/scene3d-fill-style-picker.test.js`,
`tests/integration/scene3d-panel.test.js`, `tests/integration/stroke-fill-style-control.test.js`,
`tests/unit/scene3d-tone-law-collapse.test.js`, `tests/unit/scene3d-tone-laws-config.test.js`. No touch to
`surface-fill.js`, `surface-fill-mono.js`, `mappers.js`, `hlr.js`, `shadows.js`, `FILL_STYLE_MARK_OF`. No REJECT
trigger.

**Regeneration byte-identity — PASS.** Ran `node scripts/build-tone-laws.js` inside the after-export and diffed
the regenerated `src/config/scene3d-tone-laws.js` against the committed one: byte-identical
(`PICKER_IDS 35, ALIASES 13` printed by the script, matching the committed file exactly).

## 2. LOSSLESS oracle — independently reproduced, stronger than the implementer's own

Captured all **18** relevant cells (5 survivors + 13 folded ids: ladder family ×4, taperedEnds family ×3,
weightModulated family ×2, bundleCount family ×4, contFieldSigmoid family ×5) at `torus__hatch__<id>__med__a`
directly from **both** scratch exports on fresh ports (8530 = before/`a8d84bef`, 8531 = after/`8610fd66`, both
killed after use), then md5-diffed the pairs myself — a true before/after of the whole U1-U5 chain, not a
comparison against a possibly-stale gallery baseline.

**18/18 md5-identical, 0 differences.** Every md5 I captured matches the md5s quoted in the implementer's own
`report.json` files exactly, cell-for-cell — no fabricated numbers found.

**C-05 uniqueness check (coordinator's item 2) — CONFIRMED NOT lossily folded.** Extracted just the 5 C-05 cells
(`contFieldSigmoid`, `contFieldFore`, `contFieldSurface`, `contFieldQuant`, `contFieldTouch`) from the after-export
capture and checked for distinct md5s: **5/5 distinct**, matching 5/5 distinct in the before-export. If C-05 had
been folded as a naive rename (the trap the plan's §0.1(4) explicitly warns against), all five would render
identically post-fold; they do not. Also ran the collapse test file myself in the after-export and watched the
U5 "HONESTY CHECK: the 4 folded ids genuinely differ from the survivor and from each other at the render level"
test pass live (not read off the report). **C-05 was folded correctly at the picker level only — the two
descriptors (`fieldMetric`, `fieldFloor`) still resolve to 5 distinct internal ids; nothing was merged at the
render level.** This is the honest, harder design the plan called for (two params, not a naive one-param rename),
and it is what actually shipped.

**Picker counts per commit — independently measured, not trusted.** Archived each of the 5 commit shas separately
and read `PICKER_IDS.length`/`ALIASES` keys directly out of the generated config with a small Node script (not
from a test file):

| sha | unit | PICKER_IDS | + default = picker total | ALIASES |
|---|---|---|---|---|
| `799eaa36` | U1 | **45** | 46 | 3 |
| `cf12b0af` | U2 | **43** | 44 | 5 |
| `6ed9002d` | U3 | **42** | 43 | 6 |
| `4186412e` | U4 | **39** | 40 | 9 |
| `8610fd66` | U5 | **35** | 36 | 13 |

Matches the plan's §5 table (45/43/42/39/35) and the implementer's own claims exactly.

## 3. Deserialization — extended, run in the after-export myself

Extended U0's own `normalizeStyle`/`resolveToneLaw` round-trip check to all 13 folded ids in the `8610fd66`
export: for every one, `normalizeStyle({mapper:'hatch', params:{toneLaw:<foldedId>}})` produces the correct
`{toneLaw:<survivor>, <descriptorKey>:<value>}` bag, and `resolveToneLaw` on that bag round-trips back to the
exact original folded id. **13/13 correct**, e.g. `contFieldTouch → {toneLaw:'contFieldSigmoid', fieldFloor:
'touch'} → contFieldTouch`. No lossy migration.

Presets: `grep -rl "toneLaw" user-presets/` → 0 files; `grep -rlE "fineLadder|whiteBand|nibAngle|
weightSmoothstep|bundleEased|bundleDither|bundleHandoff|contFieldFore|contFieldSurface|contFieldQuant|
contFieldTouch|phaseFineLadder|perceptualRamp" user-presets/ src/config/user-presets.js` → 0 files, both re-run in
the after-export. No shipped preset names a folded law; the bundler does not need to run and correctly wasn't
run.

## 4. Picker counts — MEASURED (see table above), not trusted from any report

Confirms the plan's §5 table exactly. No discrepancy found anywhere in the chain.

## 5. Bars changed / guard tests — complete disclosure, re-run independently, all match

Ran the full named guard batch myself in the after-export (foreground, one/few files at a time, per protocol):

| suite | result | matches claim |
|---|---|---|
| `scene3d-tone-laws-config.test.js` | 8/8 | yes |
| `scene3d-fill-style-picker.test.js` | 131/131 | yes |
| `scene3d-panel.test.js` + `context-bar-scene-flyouts.test.js` + `stroke-fill-style-control.test.js` | 105/105 (36+39+30) | yes |
| `scene3d-tone-law-collapse.test.js` | 54/54, 443s wall | yes (390-455s claimed) |
| `scene3d-tone-law-plumbing/params/dispatch/faceted-tone-law/solid-cap-reachability/one-pen-down-reachability` | 55/55 (5+13+7+19+6+5) | yes |
| `scene3d-shadow-tone-law-uniqueness.test.js` | **1 failed / 2 passed** — 5 collision groups, 18 ids total (ladder×4, taperedEnds×3, weightModulated×2, bundleCount×4, contFieldSigmoid×5) | matches the plan-predicted §2.4 trap exactly; correctly left red, correctly disclosed as U9's job |

The two benign `[vitest-worker]: Timeout calling "onTaskUpdate"` RPC errors reproduced on my machine too —
pre-existing shared-machine harness noise (same as U0-review's finding), not test failures.

**`Bars changed` sections in all 5 commit bodies are present and complete** — every count-bar bump
(`scene3d-tone-laws-config.test.js`, `scene3d-fill-style-picker.test.js` dead-count) is stated with old→new and
the arithmetic that produces it, and cross-checks exactly against the independently-measured picker totals above
(e.g. U4's dead=29 = 40−11, U5's dead=25 = 36−11). Read every diff hunk touching `tests/`: no widened numeric
tolerance anywhere (only new `toBeGreaterThan(0)` structural sanity assertions on non-empty strings/arrays, and
count-bar bumps with proof).

**Re-fixtures are legitimate, not coverage removal (coordinator's item 1, verified).** U4 re-fixtured 3
integration tests from `bundleDither` to `bundleSubNib` (a LIBRARY-tier, caveat-bearing law no cluster in this
plan folds). Read the diffs directly: each swap carries a multi-line comment explaining the test's real purpose
(prove the GENERAL "a library law's caveat renders outside the popover" mechanism) is preserved, only the specific
fixture id changed because the old one became unreachable via that UI path by design. Same pattern, same
diligence, at U2 (`stroke-fill-style-control.test.js`'s Stroke-Fill-row-adjacency test — rewritten to compute the
sub-control row offset live via `FS.styleParams(FS.resolve(...)).length` instead of a hardcoded `+1`, so it stays
correct for any future survivor) and at U1→U2 (U1's own report incorrectly claimed 4 guard files "unaffected"
without re-running them; U2 caught this, re-ran them, found 2 real latent-U1 fixture breaks
(`scene3d-panel.test.js`'s exact-`toEqual` fixtures needed `rungMode:'coarse'` added), fixed them, and corrected
U1's `report.json` in place — a genuine self-caught process error, corrected within the same chain rather than
left standing).

## 6. The two flagged gaps

- **Caveat-visibility gap** (`bundleDither` U4, `contFieldTouch` U5): the docked/ctxbar Fill Style caveat line is
  rendered from `FS.note(FS.resolve(o.value))` — the **resolved survivor id**, not the specific folded law the
  sub-control selects. Confirmed by reading `scene3d-panel.js`'s `fillStyleControls` directly
  (`const law = FS.resolve(o.value); … const note = FS.note(law);`) and by running the two "KNOWN GAP" unit tests
  the implementer added (`FS.resolve('bundleDither') === 'bundleCount'`, `FS.note('bundleCount').caveat === ''`,
  live). Real, bounded, correctly test-proven, NOT fixed (a UI-file change, out of scope for a data-only chain).
  Coordinator has already ruled this BLOCKING-BEFORE-MERGE as a follow-up (U5b), not a fail of U1-U5 itself — I
  independently agree with that framing: the byte-identity oracle (this unit's actual pass condition) holds
  cleanly, and the loss is a UI affordance, not a rendering defect. Does not block U4/U5.
- **W-10d-3** (new, sub-control shows wrong value on load): confirmed by reading `fillStyleControls`
  (`o.paramsBag` is the raw, unmigrated `style.params` object; `styleParamBag[d.key]` falls back to the
  descriptor's own default when the key is absent) and by looking directly at
  `after/U1-U5/folded-law-roundtrip.png` — Fill Style correctly reads "Ladder (default)" but Rung detail
  incorrectly shows "Coarse — 4 rungs" instead of "Fine rungs" after a save/reload round-trip of a raw
  `toneLaw:'fineLadder'` bag, while the canvas render (a dense multi-ring torus) is visibly the fine-ladder
  pattern, not the coarse one. **Render is correct; only the displayed sub-control value is wrong.** Same root
  cause and fix site as the already-queued W-10d-2. Does not block U1-U5.

## 7. Live picker screenshots — LOOKED at, cross-checked against the accessibility snapshots

`after/U1-U5/sphere-style-tab.png` + `.yml`, `torus-style-tab.png` + `.yml`, `folded-law-roundtrip.png` + `.yml`,
all real running-app captures (`V.1.3.98` badge visible), not test harness output.

- **Sphere Fill Style dropdown**: read the full accessibility-tree option list — exactly **36 options**, "No Tone"
  through "Maze Fill". None of the 13 folded ids (`fineLadder`, `phaseFineLadder`, `perceptualRamp`, `whiteBand`,
  `nibAngle`, `weightSmoothstep`, `bundleEased`, `bundleDither`, `bundleHandoff`, `contFieldFore`,
  `contFieldSurface`, `contFieldQuant`, `contFieldTouch`) appears as its own row — matches `PICKER_IDS(35)+1`
  exactly. A separate "Rung detail" combobox with exactly 4 options ("Coarse — 4 rungs" [selected], "Fine rungs",
  "Fine + phase dither", "Perceptual ramp") sits directly under Fill Style — correctly distinct from the flat list.
- **Torus Fill Style dropdown**: same 36 options, same Rung detail sub-control. Also independently confirms the
  pre-existing W-10d gate: `option "Origin Spiral — no effect here" [disabled]` on torus vs. plain
  `option "Origin Spiral"` (not disabled) on sphere — an older, unrelated mechanism, undisturbed by this chain.
- **Folded-law roundtrip screenshot**: canvas shows a torus rendered with a dense multi-ring pattern consistent
  with `fineLadder`, not the 4-ring coarse ladder — visually consistent with the W-10d-3 finding above (render
  correct, display wrong).

## 8. Report-accuracy finding (non-blocking, style of U0-review's "342 vs 335")

`U1-U5-impl.md` line 30 states "18 folded ids across 5 units" — this is imprecise; the actual count of folded ids
(ALIASES entries) is **13** (3+2+1+3+4), independently confirmed above. The number 18 is real but describes
something else: 5 survivors + 13 folded ids = 18 total cells captured per-unit (table sums to 18, matching), and
separately, 18 is also the total id-count across the 5 shadow-collision groups I independently reproduced in §5.
Line 42's headline "**21/21 md5-identical**" does not match either the 18-cell table sum immediately above it or
my own independently-reproduced 18/18 sweep — I found no basis for 21 anywhere. This is an arithmetic slip in the
writeup, not a correctness defect: every md5 pair I captured myself matches the implementer's own quoted values
exactly, and the true count is 18/18, not 21/21. Non-blocking; fix the number in the record (mirrors U0-review's
"342 vs 335" finding — a second instance of the same class of self-report error in this lane).

## 9. Process deviation (non-blocking, but real)

The plan's §"U1-U8" section requires **per-unit** live verification: "open :8490 … step the new sub-control
through every option and screenshot each; confirm the folded rows are gone … in both the docked panel and the
ctxbar flyout, that … a caveat-bearing option (e.g. `bundleDither`, `contFieldTouch` …) still prints its caveat."
The implementer instead ran ONE combined live-verification pass at the very end of the chain (3 screenshots total:
sphere Style tab, torus Style tab, one roundtrip), not per-unit, and did not screenshot the ctxbar flyout at all
or step every sub-control option individually. This is very likely why the caveat-visibility gap was only
discovered retroactively (via a unit test, not a live screenshot) rather than being caught live at U4 exactly
when the plan's own live-verification step would have surfaced it. The gap was still found, tested, and
disclosed — so this did not produce a false "all clear" — but it is a real protocol-adherence shortfall worth
naming for future units (U6-U8 should do per-unit live verification as the plan specifies, not defer it to a
final aggregate pass).

## Verdict: ACCEPT-WITH-FOLLOWUPS for all five units (U1, U2, U3, U4, U5)

All five: byte-identity independently reproduced and clean (18/18), picker counts independently reproduced and
correct at every step (45/43/42/39/35), no scope violation, no widened tolerance, no vacuous or fabricated proof,
migration/deserialization verified round-trip-correct for all 13 folded ids, no preset breakage, guard suites
independently re-run and green exactly as claimed (388 total tests across the 9 named files, plus the one
correctly-predicted red in shadow-uniqueness). U2 in particular deserves credit for self-catching and correcting
a genuine error in U1's own report rather than letting it stand.

Per-unit color:
- **U1 — ACCEPT-WITH-FOLLOWUPS.** The `DEFAULT_LAW` exception is a sound, narrowly-scoped, well-disclosed fix for
  a real gap the plan's literal wording didn't anticipate (`ladder` as both shipped default and C-01 survivor).
  Follow-up: U1's own report claimed 4 guard files "unaffected" without re-running them — wrong, self-corrected at
  U2, but flag that this pattern (claiming a file unaffected without running it) should not recur at U6-U8.
- **U2 — ACCEPT.** Clean; also the unit that caught and fixed U1's process error.
- **U3 — ACCEPT.** Simplest unit (1 folded id, 1 param), clean, no new issues.
- **U4 — ACCEPT-WITH-FOLLOWUPS.** Caveat-visibility gap (bundleDither) — real, bounded, test-proven, correctly
  not fixed here (data-only scope), correctly flagged; re-fixtured tests verified legitimate.
- **U5 — ACCEPT-WITH-FOLLOWUPS.** C-05 correctly folded at the picker level only (verified NOT lossy at the
  render level — the coordinator's specific concern); caveat-visibility gap (contFieldTouch) same shape as U4;
  the C-05 "byte-identical" wording correction is explicitly and correctly left for U8's docs-contract commit,
  stated loudly here and in the impl report rather than silently ignored.

None of the five warrants REJECT. No REJECT-triggering scope violation, lossy fold, widened tolerance, or
unproven fingerprint re-pin was found anywhere in the chain.
