STATUS: REJECT

# T2 review — mkTick variable tick length carrying tone (W-05b/W-06b plan U2)

Reviewed range **48ff98dc..dbad2d88** exactly, worktree `.claude/worktrees/fill-audit-a2`
(read-only — never edited, stashed, or committed to). All measurement was done in scratch
git-archive exports (`git archive 48ff98dc|dbad2d88 | tar -x`, `node_modules` symlinked from main),
now deleted per protocol; every number below was re-derived independently, not read off
`T2-impl.md`. Montage: `docs/3d-audit/fill-audit/after/T2/review-montage.png`.

## Verdict up front

The RGR proof, the mutation test, the byte-identity sweep, and every named regression suite are
all genuinely clean — that part of the report is honest and reproduces exactly. **But the shipped
mechanism does not meet the user's own acceptance bar as a whole.** The specific curve chosen for
the length response (`smoothstep` applied directly to radiance `I`) creates hard-edged,
flat-topped ink **plateaus** with enlarged bare wedges around them — the opposite of "one
continuous texture whose tick length carries the tone" — and this is measurable at the exact
density (d=50) the plan's own oracle is scoped to, not only at d=220. A coverage collapse at
d=220 (never tested or disclosed) confirms the same mechanism is a real regression, not an
artifact of my own instrumentation. **REJECT**, with a precise, narrow fix identified (§6).

## 1. RGR reproduction (independent)

Copied `dbad2d88`'s test file onto a clean scratch export of `48ff98dc` and ran
`npx vitest run tests/unit/scene3d-mark-laws-draw.test.js`:

- **RED**: 2/26 fail — both O5 cases, `TypeError: undefined is not iterable` on
  `stat.cntByThird`/`lenByThird` (the seams don't exist pre-fix). Real RED, for the right reason
  (the feature doesn't exist yet), on the tree this unit actually starts from.
- **GREEN** (`dbad2d88` scratch export, unmodified): **26/26 pass.**
- **Mutation** (GREEN tree, `MK.mkTick.chan` reverted `'len'` → `'count'`, nothing else touched):
  O5 goes red on both asserted cells — `cone/hatch d50: 5.398 < 6.194` (meanDark < meanMid, the
  same non-monotone signature as the original defect), `sphere/hatch d50: 5.054 < 5.122`. The
  oracle genuinely guards the fix.

## 2. The plan's own §3.2 formula, independently reproduced as broken

Patched the GREEN tree's `lenChan` branch to the plan's literal pseudocode (`P = clamp(law.P0*R,
...); L = clamp(g*P, LMIN*R, L0*R); P = clamp(L/g, ...)`) and re-ran O5:

- `cone/hatch d50`: **5.229 < 6.196** (non-monotone, meanDark < meanMid)
- `sphere/hatch d50`: **4.974 < 5.168** (non-monotone)

Confirms the implementer's claim exactly: the plan's own `g`-driven formula is barely
distinguishable from the pre-fix `chan:'count'` design once actually run, for the reason the
implementer gives (`g` saturates against `R/w`'s 5-16x in-object swing). **Not a fabricated
justification for the deviation.**

## 3. The replacement's math, independently verified — sound

`area = L·w/(R·P)`; the tone solve's target is `askArea`; solving `L·w/(R·P) = askArea` for `P`
gives `P = L·w/(R·askArea) = L/g` (since `g = askArea·R/w`). **Algebraically exact** — this is not
an approximation, and it holds for *any* `L`, confirming the "conserves the ask for any `L`" claim.
It is also **not a bespoke, unreviewed trick**: the same `L`-then-re-derive-`P` pattern is already
load-bearing in this exact function's pre-existing `countChan`/`elong` branch (`P = clamp(L/g,
PMIN, MK_PMAX)`), so this is a reuse of an established, already-shipped conservation mechanism, not
new unverified math. The abutment claim checks out too: at `I=0`, `t=1`, `eased=1` ⇒ `L = L0·R =
1.02R` (full row pitch, matching the pre-fix full-length abutment mechanism exactly); at `I=1`,
`eased=0` ⇒ `L = LMIN·R = 0.18R`. **This part of the redesign is not where the defect is.**

## 4. Byte-identity — independently re-swept, confirmed

Own md5 script (not the implementer's), 45 cells (`mkDotScreen, mkScribble, ladder, fineLadder,
phaseFineLadder` × {sphere,torus,cone} × hatch × {d1,d50,d220}) against clean `48ff98dc` and
`dbad2d88` scratch exports: **45/45 identical, 0 mismatches.** Confirmed the scope reasoning
against `src/config/scene3d-tone-laws.js`'s own `IDS` roster directly: of the plan's 10 "other mark
laws" only `mkDotScreen`/`mkScribble` are in `IDS` at all (the other 6 named laws — `mkLozenge,
mkChevron, mkComma, mkSFlick, mkCrossPlus, mkTriangle, mkDotLozenge, mkRadialFlick` — are not
reachable via `toneLaw` dispatch on this build and silently fall back to `'ladder'`, matching T1's
own established, already-reviewed finding). Not a new gap T2 introduced.

## 5. Regression suites — independently re-run at `dbad2d88` (worktree tip)

All match the impl report's claims exactly: `scene3d-crosshatch-cell-shape` (W-31) **23/23**,
`scene3d-crosshatch-parity` (W-36) **37/37**, `scene3d-fill-ruling-corners` (W-33) **19/19**,
`scene3d-hatch-density-angle-stable` (W-36b) **9/9**, `scene3d-plot-safety` (T1b) **5/5+1 skip**,
`scene3d-ladder-uniform-field-spacing` (W-26 gap-jump) **9/9**. Perf ceiling (torus d=220
mkTick/mkDashRamp, ≤2500ms) passes inside the full 26/26 run. `git diff --stat 48ff98dc..dbad2d88`
touches exactly the two claimed files; hunks confined to `MK` constants/`mkStat`/the `lenChan`
branch. Merge check: `git merge-base main dbad2d88`'s ancestor = `47a5a755`; main HEAD (`a7d39601`)
is docs-only since then — no conflict on `surface-fill.js`, clean to merge.

## 6. The acceptance bar itself — where this unit fails

### 6.1 Method

Patched a scratch copy of `surface-fill.js` (both `48ff98dc` and `dbad2d88`) with a pure logging
hook: every attempted mark-lattice site along a row records `{a (arc mm), I, R, P, drawn, len}`,
added at the exact point `layMark` already computes `drawnLen`/`sv.I`/`sv.R` — no formula touched,
same file the implementer's own `lenByThird`/`cntByThird` seam lives in. Ran all **six**
primitive×mapper combinations (sphere/torus/cone × hatch/contour) at **d=50 and d=220**, not just
the plan's two named cells.

- **(a) coverage** = Σ(cell area `R·P`, `drawn=true`, `I < 0.90`) / Σ(cell area, `I < 0.90`) — an
  area-weighted fraction, "highlight" operationalized as `I ≥ 0.90` (swept 0.80-0.95 for
  sensitivity, §6.4).
- **(b) worst un-ticked band** = longest contiguous run of `!drawn && I<0.90` sites within one row,
  in units of that run's own mean `R` (row pitch).
- **(c) length ratio** = `lenByThird[0]/cntByThird[0]` ÷ `lenByThird[2]/cntByThird[2]`, reusing the
  implementer's own shipped `mkStat` seam (unmodified) directly, cross-checked against my
  independent site log.

### 6.2 Acceptance table — all six cells, d=50 and d=220

| cell | d | (a) coverage ≥0.9 | (b) worst gap ÷ pitch ≤2 | (c) ratio ≥3x, monotone |
|---|---|---|---|---|
| sphere/hatch | 50 | **0.973 PASS** (pre 0.994) | **5.99 FAIL** (pre 6.77) | **3.60 PASS** |
| sphere/contour | 50 | **0.989 PASS** (pre 0.994) | **8.08 FAIL** (pre 5.88) | **3.12 PASS** |
| torus/hatch | 50 | **0.987 PASS** (pre 0.999) | **9.95 FAIL** (pre 9.09) | **3.15 PASS** |
| torus/contour | 50 | **0.985 PASS** (pre 0.994) | **4.41 FAIL** (pre 4.18) | **3.68 PASS** |
| cone/hatch | 50 | **0.981 PASS** (pre 0.997) | **9.84 FAIL** (pre 6.59) | **3.35 PASS** |
| cone/contour | 50 | **0.995 PASS** (pre 0.998) | **0.15 PASS** (pre 0.00) | **3.77 PASS** |
| sphere/hatch | 220 | **0.814 FAIL** (pre 0.925) | 64.7 (pre 64.7, shared) | 2.18, no bar met |
| sphere/contour | 220 | **0.789 FAIL** (pre 0.944) | 58.9 (pre 58.9, shared) | **n/a — zero drawn ink in the light third at all** |
| torus/hatch | 220 | **0.670 FAIL** (pre 0.907) | 63.6 (pre 63.6, shared) | **n/a — zero light-third ink** |
| torus/contour | 220 | **0.746 FAIL** (pre 0.949) | **25.1 FAIL** (pre 16.4) | 2.09, no bar met |
| cone/hatch | 220 | **0.806 FAIL** (pre 0.936) | 35.8 (pre 35.1, ~flat) | 1.80, no bar met |
| cone/contour | 220 | **0.791 FAIL** (pre 0.989) | **4.6 FAIL** (pre 1.65) | **n/a — zero light-third ink** |

**(c) at d=50 genuinely generalizes** — all six cells clear ≥3x monotone, not just the plan's two
asserted ones (3.12-3.77x). This part of the implementer's claim is real and broader than reported.

**(a) fails on all six cells at d=220**, a density the implementer never tested for this oracle.
**(b) already fails pre-existing (T1b baseline) on 5 of 6 cells at d=50**, so this specific bar is
not new — but T2 worsens it on 4 of those 5 (roughly +10% to +49%), and worsens it further on 2 of
3 measurably-different cells at d=220.

### 6.3 Root cause, proven with the shipped code's own counters (not just my instrumentation)

At d=220, `SF.lastMarkStats` itself (unmodified, no patch needed) shows:

| cell | metric | pre (48ff98dc) | post (dbad2d88) |
|---|---|---|---|
| cone/hatch d220 | `tooShort` | 360 | **776** (+116%) |
| cone/hatch d220 | `offSurface` | 5 | 6 (flat) |
| torus/contour d220 | `tooShort` | 361 | **1246** (+245%) |
| torus/contour d220 | `offSurface` | 0 | 3 (flat) |

`offSurface` (geometry/limb refusal — T1's walk, unrelated to tone) is unchanged. `tooShort`
(the tone-formula's own "computed length fell under `MIN_MARK_MM`" drop) more than doubles or
triples. **This is airtight: the d=220 coverage collapse is caused by the length formula T2
shipped, not by geometry, not by the pre-existing row-coverage scaffold.**

Mechanistically: `smoothstep(t)` has zero derivative at both `t=0` and `t=1`, so `L(I)` stays
close to `L0·R` for `I` well above 0 and close to `LMIN·R` for `I` well below 1, spending almost
all its *change* in a narrow middle band. Mapped over a spatially continuous `I` field, this
produces exactly two near-constant-length **shelves** joined by a steep transition — not a
gradient. A decile breakdown of drawn-fraction vs `I` confirms it directly: at d=220,
`cone__hatch` drawn-fraction is 0.85-0.92 through `I=0.0-0.5` in the **pre**-fix tree and only
crashes in the last decile (`I=0.9-1.0`, 0.167) — legitimately "gaps only at highlights." In
**post**, the same fraction is already down to **0.038 at I=0.7-0.8** and **0.0 at I=0.8-0.9**,
i.e. the drop starts roughly a third of the way into the tone range, not at the true highlight.
This is the implementer's own documented design property ("holds each third's own bulk close to
its own anchor") working exactly as intended for the mean-of-thirds oracle — and that is precisely
what creates the plateau artifact.

### 6.4 Sensitivity check

Swept the highlight threshold `I ≥ {0.80, 0.85, 0.90, 0.95}`: the d=220 coverage regression
(post ~0.73-0.85 vs pre ~0.93-0.95) is **stable across all four thresholds** — not an artifact of
my 0.90 pick. The worst-gap-run metric is threshold-sensitive at d=50 (the two trees converge at a
low threshold, diverge at a high one, because post's own collapse zone extends further from the
true highlight as the threshold is raised) — consistent with, not contradicting, §6.3's mechanism.

## 7. Secretary flags, addressed explicitly

**(1) Band attribution.** Confirmed two distinct phenomena at different scales, both visible in the
montage:
- The **broad, 3-4-band macro structure** (whole rows sparse or empty) is the pre-existing
  `MK_ROW_COV` row-coverage-floor scaffold — unchanged (T2 does not touch `isMarkLaw()`'s
  row-coverage line or `rowFloor`), matching T1/T1b's own already-established finding. **T3's
  territory, correctly out of scope for this unit.**
- The **flagged blank diagonal bands and sawtooth block edges** the orchestrator pointed at (cone
  right flank, torus inner regions) are a **finer, within-row phenomenon** — hard-walled,
  flat-topped ink plateaus with newly bare wedges around them, at locations that carried
  continuous (if shorter) ink pre-fix. §6.3's `tooShort` counters and decile breakdown attribute
  this specifically to T2's own length formula, not to the row scaffold. **This is new, and it is
  T2's.**

**(2) Six-cell table.** Delivered in §6.2. Good news first: (c) (length ratio ≥3x, monotone)
genuinely holds on all six cells at d=50, not just the two asserted — the implementer's claim was
conservative, not cherry-picked. Bad news: (a) fails on all six at d=220 (untested, undisclosed),
and (b) already fails pre-existing on 5/6 cells at d=50 and is worsened by T2 on most of them.

**(3) Replaced formula.** Verified independently in §3 (broken-as-claimed) and §3 of this doc /
above (§3, the `area=L·w/(R·P)` identity and abutment claim) — both check out exactly. **The
`P=L/g` re-derivation is sound and is not the defect.** The defect is the *shape* chosen for
`L(I)` (smoothstep on `I`), which the implementer picked specifically to satisfy the mean-of-thirds
oracle — and that same choice is mechanistically what produces the plateau.

**(4) Sawtooth-ends origin.** Mixed, disentangled: the fine per-tick jaggedness at individual mark
endpoints is inherited from T1's chart-walk limb-truncation (visible in the pre-fix crop too, and
an expected, correct consequence of variable length by design — not itself a defect). The
**larger bare wedges and flat-topped plateau boundaries are new**, per §6.3's counters, and are a
different, broader phenomenon than T1b's own already-disclosed near-duplicate-stub tail (which was
narrow, tail-only, and about overlapping ink, not about missing ink).

## 8. `## Bars changed` — the O1 rescope, ruled

T1's O1 test (torus/contour d50 sagitta median, all-population) was re-scoped from "all walked
ticks" to "the longest third by chord length," bar unchanged (`≥0.10mm`). **Ruled a legitimate
re-scope, not a hidden loosening**: sagitta scales as `L²/8r`, so once U2 makes length vary with
tone BY DESIGN, an all-population median necessarily drops for a purely geometric reason (more
short chords, which have less curve to show) — this is not the walk regressing. Measuring the
longest third isolates exactly the population T1's own oracle measured before length varied at
all, and it is the same reasoning T1-review itself used when analytically deriving O1's achievable
range. Independently plausible and consistent with T1-review's own methodology; not reproduced
bit-for-bit here (out of this review's scope — T1's own oracle, already ACCEPT-WITH-FOLLOWUPS'd) but
the *logic* is sound and correctly disclosed.

## 9. What should ship, and what should not

**Keep:** the `chan:'len'`/`LMIN` mechanism, the `P=L/g` conservation re-derivation, the
`lenByThird`/`cntByThird` seam, the RGR/mutation proof, the byte-identity sweep, the O1 rescope
reasoning, the roster-comment/table-note documentation updates. All independently verified sound.

**Fix before re-submission:** replace or retune the `L(I)` response curve so it does not have
near-zero derivative at both ends (the exact property that creates the plateau/wedge artifact) —
e.g. a curve tuned to hold the O5 mean-of-thirds bar without flattening at the anchors, or a
different oracle shape that does not reward "flat near both anchors, steep in between." Add: (i) an
area-coverage oracle at d=220 in addition to d=50 (§6.2 shows this density is not a free pass); (ii)
a direct plateau/continuity check (e.g. max run of near-identical drawn length within one row) since
the mean-of-thirds oracle is blind to exactly the artifact this review found; (iii) re-verify the
implementer's own "what I saw" description against a native-resolution crop before re-claiming
"smooth length gradient" — the crop in the montage shows the opposite at the same cell/density
(`torus__contour__mkTick__med__a`) the report described as smooth.

## Evidence

`docs/3d-audit/fill-audit/after/T2/review-montage.png` — three rows: cone/hatch/med full-frame
pre/post + native-resolution right-flank crops (shows the new blank wedge at the silhouette edge);
torus/contour/med full-frame pre/post; native-resolution fan-peak crops (pre: one continuous curving
comb; post: hard-walled flat-topped columns with enlarged bare wedges between them — directly
contradicts `T2-impl.md`'s "smooth length gradient... continuous tone gradient" description of this
exact cell). Sourced from `docs/3d-audit/fill-audit/after/T2-pre/` (T1b baseline, `48ff98dc`) and
`docs/3d-audit/fill-audit/after/T2/` (this unit, `dbad2d88`) — both already-committed evidence
directories, both confirmed present in `manifest.B.*.jsonl` before use.

Scratch directories used for this review (`T2-review/`, including `instrumented`/`instrumented-pre`
patched surface-fill.js copies, `acceptance.js`, `decile.js`, `md5sweep.js`) were deleted after use,
per protocol.
