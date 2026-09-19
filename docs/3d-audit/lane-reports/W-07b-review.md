STATUS: REJECT — CLAUSE A/mutation proof are real and solid, but the shipped fix buys the ink bar by pushing traverse amplitude to its clamp ceiling, and the resulting picture is a self/neighbour-crossing scribble, not the promised half-pitch zig-zag; CLAUSE A' is unasserted.

# W-07b adversarial review — deepFillTSP shadow-third density and lit-region drift

Role: Sonnet, READ-ONLY reviewer. Worktree `.claude/worktrees/fill-audit-b5` (commit `776d9285` on
base `0b87a9b9`) confirmed clean (`git status --short -- . ':!graphify-out'` empty). Reproduced from
scratch `git archive` exports under `/private/tmp/claude-501/scratch-W-07b-review/{pre,post}`
(`node_modules` symlinked to the main repo's), never by editing/stashing in the worktree. Node
`v20.20.2` per `.nvmrc`. No dev server started (nothing in this review needed one); port 8476 unused.

## Verdict: REJECT

Six flags, in the orchestrator's priority order.

### 1. PICTURE (highest weight) — CONFIRMED, REJECT-worthy

Read the named crop at native resolution
(`docs/3d-audit/fill-audit/after/W-07b/crops/sphere__hatch__deepFillTSP__med__a__addlayer__shadowcrop.png`)
plus the full-object shot, the torus shadow crop, and the cone/max crops (ladder and deepFillTSP), both
addLayer. **This is not the "clean, continuous diamond-weave pattern... no smear, no noise" the impl
report describes.** The full-sphere shot
(`.../W-07b/crops/sphere__hatch__deepFillTSP__med__a__addlayer__full.png`) shows a lit hemisphere that
is genuinely clean (smooth radial fan, matches CLAUSE B's claim) transitioning into a shadow hemisphere
that is a **jagged, irregular sawtooth** — spikes of visibly varying amplitude and period, overlapping
their own neighbours 2-3 rulings deep, reading as scribble, not a controlled traverse. The torus shadow
crop shows the same pattern.

**Quantified.** I wrote a standalone segment-segment crossing-density measurement (own script, run as a
vitest test against `algo.generate` directly — a raw `node -e` harness hung indefinitely outside vitest's
jsdom environment, so this was ported into a `describe/test` block using the same
`loadVecturaRuntime`/`algo.generate` pattern the shipped tests use; not committed anywhere, scratch-only,
deleted after this review). Bottom-left quadrant of the drawable `BOUNDS` (same convention as the
capture script's own "shadowcrop"), proper (non-endpoint) segment-segment intersections only:

| primitive | law | density | rig | **pre-fix** crossings/mm² | **post-fix** crossings/mm² | change |
|---|---|---|---|---|---|---|
| sphere | ladder | 50 | addLayer | 0.000320 (baseline, untouched by this diff) | 0.000320 | — |
| sphere | deepFillTSP | 50 (med) | addLayer | 0.000108 | **0.000463** | **4.3x** |
| sphere | deepFillTSP | 220 (max) | addLayer | 0.000302 | **0.001932** | **6.4x**, and **6.0x Ladder's own rate** |
| cone | ladder | 220 | addLayer | 0.001739 (apex-convergence artifact, untouched) | 0.001739 | — |
| cone | deepFillTSP | 220 | addLayer | 0.000352 | **0.001566** | **4.4x** |

(`ladder` numbers are identical pre/post as expected — `ladder`'s own code path is untouched — and serve
as an internal control on the crossing-counter itself: cone/ladder's own baseline is inflated by
apex-convergence geometry, not a defect, which is why the cone row is reported but not leaned on as
heavily as sphere's.)

**Sphere is decisive and clean of that confound: the fix increased self/neighbour-crossing density
4.3-6.4x, taking `deepFillTSP` from BELOW Ladder's own crossing rate (pre-fix) to 6x ABOVE it
(post-fix).** This did not exist before this unit; it is this unit's own introduction, traded for the
CLAUSE A ink win.

**Root cause, read against the diff itself.** `TSP_AMP_SHARE = 1.5` (the fix's own new constant) — the
diff's own comment says it "exactly saturates the `1.5 * p` width clamp below at k=1, i.e. this is the
largest share that ever changes anything." That means at full ramp the traverse now runs its lateral
excursion to the absolute ceiling of the pre-existing plot-safety clamp on every sample: peak-to-peak
swing of `3 x localPitch`, i.e. each ruling's zig-zag reaches 1.5 pitches past its immediate neighbour
into the territory of the SECOND ruling over, on both sides, independently phase-offset per ruling. The
law's own mechanism comment (`surface-fill.js` :9568-9573, unchanged by this diff) says the golden-ratio
phase offset exists "so the zigs never line up into a secondary lattice" — but a woven diamond mesh IS a
secondary lattice, and it is exactly what forms once amplitude is pushed to 3x the minimum a genuine
"half-pitch" traverse would need (a half-pitch fill needs ~0.5x localPitch of one-sided amplitude to
reach the adjacent gap, not 1.5x). **The fix bought the CLAUSE A ink bar by amplitude, not by structure**
— precisely the failure mode this flag was written to catch. The impl report's own diagnosis (the
~30% pre-existing base-grid/placement gap, disclosed as out-of-scope) is the correct locus for a real
fix; `TSP_AMP_SHARE` was tuned against the ink oracle without a corresponding check against the picture,
and it shows.

### 2. Clause A' (no traverse segment > 3×masterPitch) — NOT asserted, NOT mutation-tested

Grepped the shipped `W-07b` describe block (`tests/unit/scene3d-mark-laws-draw.test.js:672-984`) for
`masterPitch`, `3 *`/`3x`, or any segment-length oracle: **no such assertion exists.** The impl report is
honest about this (`## Open follow-ups #3`: "argued, not re-measured with fresh instrumentation") — it is
a disclosed gap, not a hidden one — but checklist rule 1 is explicit that **"the mutation proof is
BLOCKING; a reviewer may REJECT without it,"** and this is one of the two clauses the round-1 finding
specifically reopened the law over. The argument given (the amplitude clamp `Math.min(amp, endMM[s]/2,
1.5*p)` is preserved verbatim, so the scout's own "never worse than Ladder's own baseline" reading should
still hold) is plausible but unverified — and is now in tension with finding #1: the clamp being
*unchanged* doesn't help when the fix drove `k*TSP_AMP_SHARE*p` to saturate that same clamp on every
sample, which is a materially different operating point than pre-fix (where `amp` measured ~0 almost
everywhere per the scout).

### 3. Clause A (10/12 pass, cone/max disclosed) — CONFIRMED HONEST

Reproduced RED at base sha (scratch `pre/`, `npx vitest run tests/unit/scene3d-mark-laws-draw.test.js -t
"W-07b"`): CLAUSE A core **10/10 failing** (`expected 10 to be +0`), CLAUSE A cone/max **RED at
0.3444** (below its own 0.80 disclosed floor), MUTATION PROOF's own real ratio **RED at 0.5055** — matches
the impl report's numbers exactly. Reproduced GREEN at post sha (`post/`): same command, **5/5 passing**,
and the full file **35/35 passing** in 18.9s (impl reported 17.45-17.82s — consistent). The `core`
population filter (`cellResults.filter(r => !(primitive==='cone' && fillDensity===220))`) is exactly what
it's described as — it does not silently drop or narrow beyond the disclosed cone/max exclusion, and the
excluded 2 cells get their own separate, honestly-bounded test (`> 0.80`, `< 1.0`, both asserted — not a
one-sided floor dressed as a pass). No population-narrowing violation.

### 4. Clause C byte-identity / sweep coverage — CONFIRMED

`git diff 0b87a9b9 776d9285 -- tests/unit/scene3d-mark-laws-draw.test.js` is **one hunk**,
`@@ -668,5 +668,312 @@`, purely additive at the end of the existing `W-07` describe block — zero lines
touched in any other describe block, zero population/fixture changes to any pre-existing test. The
`ladder` byte-identity spot check (4 cells: sphere/hatch, med/max, both rigs) reproduces byte-identical at
**both** pre and post sha — a legitimate non-regression control, and it is labelled a "spot check,"
1/37 laws, not oversold as a sweep. Mapper coverage (`hatch` only, 1/3 reachable) and the other disclosed
exclusions (density=1, camera angle b, crosshatch/contour) match the scout's own S5 exclusions and are not
independently re-verified here — same open status as the scout and impl reports leave them.

### 5. Mutation proof — BLOCKING, independently exceeded

Beyond reproducing the impl's own inline mutation, I reverted **each of the two fixes independently** in
fresh scratch copies of the post-fix source, keeping the other fix as shipped, and reran the CLAUSE A /
MUTATION PROOF tests against each:

- **Mutant 1** (revert only `algoCoverage`'s flat-`1` fix, back to the halving formula; keep `tspAt`'s new
  `TSP_AMP_SHARE` amplitude): CLAUSE A core **RED** (still failed, `expected 0.35... > 0.8`), MUTATION
  PROOF's real ratio **RED at 0.5207**.
- **Mutant 2** (revert only `tspAt`'s amplitude formula, back to the gap-derived
  `(drawn - drawnBase) / 2`; keep `algoCoverage`'s flat-`1`): CLAUSE A core **RED**, `2` of 10 core cells
  fail (`expected 2 to be +0`).

Both halves are independently load-bearing and both trip red when reverted alone — a stronger mutation
proof than the impl report's single combined mutation, and it confirms CLAUSE A's guard is real (not
vacuous). This flag is satisfied.

### 6. CI-safety — CONFIRMED clean

Grepped the new `W-07b` describe block (lines 672-984) for `child_process`, `execSync`, `spawn`, `git `,
`/private/tmp`, `.skip`/`.only`/`xdescribe`/`xtest`: no matches. The block only calls
`algo.generate(...)` with in-memory params, exactly the pattern the rest of the file already uses. Clean.

## Bars changed

None introduced by this diff beyond what the impl report already disclosed (new tests only, no existing
threshold/population touched) — confirmed by the single-hunk, purely-additive test diff (flag 4).

## Why REJECT and not ACCEPT-WITH-FOLLOWUPS

CLAUSE A's ink bar, its mutation proof, and the byte-identity/CI-safety flags are all solid — on those
alone this would be a clean ACCEPT-WITH-FOLLOWUPS (cone/max gap, Clause A', mapper/angle sweep as noted
follow-ups). But the brief's own instruction is explicit: **"a picture that is a self-crossing scribble is
REJECT-worthy even if clause A's ink number passes — the fix may have bought ink by amplitude instead of
structure."** That is exactly what was found and independently quantified (4.3-6.4x crossing-density
increase on sphere, introduced by this unit, not pre-existing) — not a subjective read, a measured one, on
the orchestrator's own named crop. Combined with Clause A' being wholly unasserted for a blocking clause
the law was specifically reopened over, this does not clear the bar to ship.

## Recommended path for a redo (not binding, for the record)

The impl report's own diagnosis is correct: the real fix belongs in ruling-count/placement code (the
~30% pre-existing base-grid gap between `deepFillTSP` and `ladder`, measured under a zero-shadow fixture),
outside `algoCoverage`/`tspAt`. A redo should either (a) widen the Files Allowed to include that placement
code and close the ink gap by adding rulings rather than amplitude, or (b) if amplitude is kept as the
lever, cap `TSP_AMP_SHARE` well under the point where it saturates the `1.5*p` clamp (e.g. a literal
"half-pitch" share, ~0.5) and accept a smaller, honest CLAUSE A recovery rather than trading the picture
for the number. Either redo should add the missing CLAUSE A' assertion (segment/pitch bound) with its own
mutation proof before re-review.

## Reproduction commands (for a re-reviewer)

```
mkdir -p /private/tmp/claude-501/scratch-W-07b-review/{pre,post}
git -C .claude/worktrees/fill-audit-b5 archive 776d9285 | tar -x -C .../post
git -C .claude/worktrees/fill-audit-b5 archive 0b87a9b9 | tar -x -C .../pre
ln -s <repo>/node_modules .../post/node_modules   # and .../pre/node_modules
cp post/tests/unit/scene3d-mark-laws-draw.test.js pre/tests/unit/  # RED reproduction
cd pre  && npx vitest run tests/unit/scene3d-mark-laws-draw.test.js -t "W-07b"   # 3 failing (RED)
cd post && npx vitest run tests/unit/scene3d-mark-laws-draw.test.js              # 35/35 (GREEN)
```

Scratch trees, mutant copies, and the crossing-density test were deleted after this review; nothing was
written to the worktree, MAIN's `src/`/`tests/`, or any other lane.
