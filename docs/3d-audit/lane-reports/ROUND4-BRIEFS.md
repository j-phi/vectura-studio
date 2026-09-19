# ROUND 4 — lane map and briefs (secretary, 2026-09-17)

**Base for every lane: `main` `b43fa4e3` (v1.4.2) — round 3 merged at `d3b01d28` and PUSHED to `origin`.**
**The five `-3` worktrees are HISTORICAL — nobody works in them.**

✅ **ALL FOURTEEN of Jay's decisions are answered (SESSION-SUMMARY §4 is authoritative; answers arrive on the
Decision Desk and are transcribed there). NOTHING IS FROZEN.**

⚠⚠ **ROUND 4 OPENS ON A USER REJECTION, NOT A QUEUE.** Jay's eye check on the mkTick cone came back **"Wrong
direction"**, and **T2-5 is that rule — P0, and the lane's first unit.** ⚠ **Three rejected attempts, one
accepted attempt and a positive orchestrator picture preceded it. The lesson is not that a unit failed; it is
that every instrument round 3 built measured something real and none of them measured what he was looking
at.** **Read that before designing any bar this round.**

## Lane map

| worktree (`.claude/worktrees/`) | branch | port | file ownership | queue | planner? |
|---|---|---|---|---|---|
| `fill-audit-a4` | `3d-scene/fill-audit-a4` | 8475 | `surface-fill.js` | **T2-5 (P0) → T3b → W-36f** | **T2-5: Opus planner. T3b / W-36f: no — PLAN-READY by path** |
| `border-4` | `3d-scene/border-4` | 8470 | `scene3d.js` edge pass `:4641–4790` + `hlr.js` | **W-32 Rank 4** | **YES — Opus planner** |

⚠ **The two lanes are provably disjoint by file, so they run in PARALLEL. Everything inside `fill-audit-a4`
is STRICTLY SERIAL — one implementer per worktree, no exceptions.**

**Serialization, unchanged:** `surface-fill.js` → `fill-audit-a4` · `hlr.js` + the `scene3d.js` edge pass →
`border-4`. **Neither lane touches `surface-fill-mono.js`, `mappers.js`, the slices pass, or the collapse
chain — all idle this round.**

---

## 0a. PROCESS REGIME (Jay's ruling, 2026-09-15) — how units are staffed

**The roster was over-levelled. Binding from now:** **tests-only units get a LIGHT VERIFY PASS** — RED reproduces, mutation trips, `## Bars changed` accurate — **and are marked VERIFIED, not reviewed.** **"Secretary flags" are written only for units that change `src/`, capped at SIX.** **No planner unless the unit was REJECTED or its mechanism is UNKNOWN.** **No evidence-integrity side units unless a mismatch blocks a decision of Jay's.** **Read-only scouts stay — they were the best value of the round.** ⚠ **This trims the ceremony around units, not the rigour inside them: §0 below binds in full, unchanged.**

## 0. THE BINDING CHECKLIST — paste this whole section into every brief, verbatim

**Six rules, all promoted to STANDING because a unit broke each one at least once. They are here rather
than only in `LEDGER.md` because the single rule that ever reached implementers reliably was the one
printed in their own brief.** ⚠ **Two of these were broken by the very NEXT unit after they were
promoted** — sweep breadth (F1-erode → F1-amp) and rig-naming (GH-2 → F1-amp). Both were caught by
reviewers, so the system worked; it worked at the cost of a review cycle each time.

1. **STATE WHICH HALF OF THE ACCEPTANCE BAR YOUR GUARD GATES — AND MUTATION-TEST THE HALF YOU CLAIM.
   THE MUTATION PROOF IS BLOCKING; a reviewer may REJECT without it.** "It is an integer gate where only
   the fixed value passes" is an argument, not a proof. If the bar you were given has more than one clause,
   name the clause you cover, name the clauses you do not, and show a mutation that trips the one you claim.
   *(T4b gated the ink half of a two-half bar and read as if it gated both; W-36d's sub-bar missed
   interior-only defects; F1-placement's nine reds never measured the quantity that visibly changed.)*
2. **STATE YOUR SWEEP'S COVERAGE AS A FRACTION OF THE ROSTER, AND JUSTIFY EVERY EXCLUSION.** "The other
   mappers are unrelated" is a claim to be measured, not assumed. The roster is
   `MAPPERS = ['none','hatch','wireframe','crosshatch','contour','spiral','stipple','contourSlice']`
   (`src/core/scene3d/params.js:79`) × `SCENE3D_TONE_LAWS.PRODUCTION` (37 laws).
   *(F1-erode's planner swept `hatch`×4 primitives + `contour`×torus and missed a SECOND live instance of
   its own defect, found only when the sweep was widened to all 8 mappers. F1-amp then reported on `hatch`
   alone — 12.5 % of the roster — and its reviewer had to sweep 8×6 itself.)*
3. **EVERY REPORTED NUMBER STATES THE FIXTURE IT WAS MEASURED ON — RIG, CAMERA, DENSITY, AND EVERY NON-DEFAULT PARAM — in the report
   AND in `report.json`.** ⚠ **A number without its fixture is not reproducible, and "md5-identical source" is NOT a fixture.**
   *(Three script-methodology discrepancies in one round, all in otherwise-rigorous reports, none detectable from the report alone:
   `trochoidLoop` ink −0.98 % vs −1.10 %; `onePenDown` width 0.9860 vs 1.0089 mm, blamed on an intervening fix but actually pre-dating
   it; and a ~35–40 % `inkMm` divergence between one report's pictures and its own table. Naming the rig alone caught none of them.)*
   ⚠ **AND STATE WHETHER GROUND-PLANE INK IS INCLUDED IN ANY INK TOTAL.** *(That third divergence was first blamed on a `fillAngle`
   mismatch; a re-shoot proved `fillAngle` absent ≡ 45 and found the real cause was ground-plane ink counted in one measurement and not
   the other. **Two ink numbers for "the same cell" can differ by a third with both correct and neither wrong — the object's ink and
   the scene's ink are different quantities, and nothing in a bare `inkMm` says which one you have.**)*
   **NAME THE RIG BEHIND EVERY NUMBER.** Since GH-2 (`6ffaf9c6`) there are TWO:
   **`create`** (the default — `PRIMITIVE_CREATE_DEFAULTS` over `PRIMITIVE_PARAM_DEFAULTS`, the denser rig
   **the gallery and Jay's own screenshots use**) and **`--rig addLayer`** (plain `engine.addLayer('scene3d')`
   deserialization defaults, **what every RGR test in these lanes constructs**). **A stop-condition measured
   on one rig is a claim about one rig**, and a bound that matters to the user must be measured on the rig
   the user sees. **An unexplained byte-identical before/after pair can mean the RIG CANNOT SEE YOUR FIX** —
   a third legitimate cause GH-1 now recognises as "rig mismatch". *(F1-erode's fix was invisible on
   `create`; F1-amp's ±8 % ink claim came only from `addLayer` and `onePenDown` is −7.99 % on `create`.)*
4. **WHEN A SWEEP REPORTS A CHANGED LAW, GREP FOR PINS ON THAT LAW AND CHECK THE FIXTURE EACH PIN USES —
   NOT JUST THE LAW NAME.** A law-name match is a hit list, not a verdict: the pin and the changed cell must
   agree on primitive, mapper AND density before the pin is at risk, and before you may call it safe.
   **Re-pinning a guard that was never threatened is the same class of damage as missing one that was.**
   *(F1-erode's one candidate pin on `taperedEnds` survived only because its fixture was the sphere while the
   cone moved.)*
5. **A UNIT THAT TURNS ANOTHER UNIT'S TEST GREEN MUST SAY SO — and one that inherits another unit's RED must
   name it, test by test, under `## Pre-existing red`.** A red→green transition inside an innocent unit reads
   as "all tests pass" at merge and hides which unit owns the fix; an inherited red gets misattributed,
   fixed out of scope, or quietly re-pinned. **Both need the failing set reproduced at your BASE sha, not
   argued.** *(U9b carried U6-2's fix; F1-placement's "pre-existing" red turned out to be caused by its own
   fix, disproved only because the brief demanded the base-sha reproduction.)*
6. **`## Bars changed` IS MANDATORY — `file:line — old → new — why`, in the report AND the commit body.**
   Up or down. A bar change with no entry is treated as a hidden regression and REJECTS the unit. A
   *tightened* bar and a *new* bar are both disclosed too, labelled as such. ⚠ **AND SO IS A CHANGE TO THE
   POPULATION OR FIXTURE AN EXISTING ASSERTION MEASURES OVER, even when the number is untouched** — narrowing a
   population hides a defect exactly as a widened tolerance does. *(T2-2 re-scoped O1 from all walked ticks to the
   longest third, keeping `>= 0.10 mm`; the re-scope is sound and was independently ruled so twice — but it was
   disclosed only because the implementer chose to, since the old wording did not require it. Now it does.)*

**And the two process rules that cost the most when skipped:**

- **RED comes from a scratch `git archive` export of your base sha — never `git stash`, never an in-place
  revert in the worktree.** This applies to **CSS and config files by name**, not only source files; ~8
  in-worktree REDs have been tolerated across three rounds and the exemption has quietly become a habit.
- **Reports go to MAIN's `docs/3d-audit/lane-reports/`, evidence to MAIN's `docs/3d-audit/fill-audit/after/<W-id>/`.
  Never into your worktree. A missing file in a worktree is NOT evidence of a missing deliverable** — a
  reviewer once issued a REJECT on that premise.

---

## 0b. KNOWN-SLOW VITEST FILES — read before running anything

**Seven background-polling deviations across two rounds all had one mechanical cause:** on this shared
machine the heavy vitest files exceed the Bash tool's default 120 s timeout, the tool backgrounds the
command, and the agent then polls it or arms a Monitor. More emphatic prose has already failed to fix this
twice — **the fix is the number below.**

**This sentence is binding for every agent, and appears verbatim in each brief:**

> Run every vitest file in the FOREGROUND with the Bash tool parameter `timeout: 600000` (ten minutes).
> Never use run_in_background, never arm a Monitor and end your turn. If a file still exceeds ten minutes,
> kill it and rerun alone with `--pool=forks --poolOptions.forks.singleFork=true`, again with
> `timeout: 600000`.

### Tier 1 — ALWAYS exceeds the default timeout; budget 10 min and expect singleFork

| file | measured | note |
|---|---|---|
| `tests/unit/scene3d-tone-law-collapse.test.js` | **390 s → 840 s** across U1–U5 (443 s), U7 (554.7 s), W-10d-2 (469 s), U8 (681.8 s), the r2 merge (763 s), U6 (840.8 s), U9b (~820 s), **U7-2's reviewer 803.85 s** | 1585 lines; **117 tests** at `49a5ef88`. Every single unit in the collapse chain has had to run it with `--pool=forks --poolOptions.forks.singleFork=true`. **Start it with singleFork; do not waste a 10-minute default-pool run first.** |

> ⚠ **AMENDMENT, 2026-09-12, measured by the U7-2 reviewer: `scene3d-tone-law-collapse.test.js` EXCEEDS the
> Bash tool's 600 000 ms hard ceiling** — it was started with singleFork and `timeout: 600000` exactly as
> briefed and the tool still moved it to the background at 600 s; it finished **117/117 in 803.85 s, exit 0**.
> **600 000 ms is the tool maximum, so there is nothing higher to ask for.** For this ONE file the correct
> behaviour is: start it foreground with singleFork and `timeout: 600000`, **let the tool background it when
> the ceiling hits, carry on with other verification work, and read the result from the tool's own completion
> notification.** **Do NOT pass `run_in_background`, do NOT arm a Monitor, and do NOT end your turn waiting.**
> **This is a tool constraint, not a protocol deviation — it will not be logged as one.** Every other file in
> the tiers below fits inside 600 s.
| ~~`tests/unit/scene3d-contour-slice.test.js`~~ | ⚠ **SECRETARY ERROR, CORRECTED 2026-09-12: this file is NOT Tier 1.** Measured by the HLR sub-pen unit at **67/67 in 23.3 s** — comfortably inside the default timeout. It was listed here on the indirect evidence that W-27c-0a-4b once ran it under singleFork, not on a measured wall time. **Treat it as Tier 2.** | 3214 lines, 57 tests — the largest unit file in the repo, but not the slowest |

**`tests/unit/scene3d-tone-law-collapse.test.js` is the ONLY Tier-1 file.** Everything else in this document
fits inside the 600 s ceiling.

### Tier 2 — routinely near or over the default 120 s under load; use `timeout: 600000`

`tests/integration/scene3d-fill-style-picker.test.js` (3049 lines, **166–170 tests**; 20–22 s idle, far more
under contention) · `tests/unit/scene3d-mark-laws-draw.test.js` (T4/W-36c's oracle file; 13 heavy
full-geometry tests, wall time never recorded — treat as slow) · `tests/unit/scene3d-ribbon-wall-coverage.test.js`
(44.0 s measured) · `tests/unit/scene3d-ribbon-f1b-streaks.test.js` (33.9 s measured) ·
`tests/unit/scene3d-hlr-spatial-index-identity.test.js` (425 lines, 2 tests — whole-index identity sweeps) ·
`tests/unit/scene3d-mesh-self-occlusion.test.js` (464 lines, 2 tests) ·
`tests/unit/scene3d-shadow-receive.test.js` (934 lines) · `tests/unit/scene3d-shadow-anatomy.test.js` (776
lines) · `tests/unit/scene3d-shadows.test.js` · `tests/unit/scene3d-shadow-tone-gradient.test.js` ·
`tests/unit/scene3d-curved-density-floor.test.js` and `-sparse-end` (12–16 s each, the slowest of W-26b's
battery).

### Runtime and environment

- **Node 20 is required** — `.nvmrc` pins `v20.20.2` (`package.json` says `>=18`, but the repo is developed
  and measured on 20). No `NODE_OPTIONS` is needed; do not set one.
- `vitest.config.mjs` already sets `testTimeout: 180000` and `hookTimeout: 180000` (raised 60 → 180 s in
  `88041036`) and `poolOptions.forks.maxForks: 4` locally. **Those are vitest's internal per-test timeouts —
  they do NOT bound the Bash tool.** The `timeout: 600000` above is the one that stops the backgrounding.
- A single benign `[vitest-worker]: Timeout calling "onTaskUpdate"` RPC warning with **exit code 0** is
  pre-existing shared-machine noise, documented by T1/T1b/U0/U6/W-36c. It is not a regression. Likewise
  `[FillBoolean] polygon union failed on degenerate geometry` on stderr.
- ⚠ **Under `singleFork`, a MULTI-FILE batch can silently truncate to the first file's results** (U8's
  reviewer, 2026-09-09). **Run one file per command.**
- Run TARGETED files, not the full suite, unless your section says otherwise.

---
---

## 1. BRIEF A — T3b implementer (decision 12 = B)

**Model: Sonnet. Role: implementer. LEDGER row 2. Lane `fill-audit-a4`, branch `3d-scene/fill-audit-a4`,
port 8475. Starts AFTER T2-5 commits — one implementer per worktree.**
**Report to: `docs/3d-audit/lane-reports/T3b-impl.md`.**
**§0 above binds in full. PLAN-READY by path — no planner, because the mechanism is known and measured.**

### The defect, already measured and already attributed

**mkDashRamp dashes are MULTI-PASS BANDS** — that is T4's band mechanism, shipped under **Jay's own decision
1 = B** to restore the dark end, and it is doing its job at Density 220. ⚠ **At Density 1 the same mechanism
makes each "dash" a bundle of ~6–8 parallel passes spanning the row, so it reads as a thick TILE rather than
a single-stroke dash.** **T3 already reduced it on the way past: pens per mark 5.71 → 3.93.** **Jay's answer
to decision 12 was (B): draw single-pass dashes below a density threshold.**

### Scope

- **Draw SINGLE-PASS dashes below some density threshold; keep the band mechanism where it earns its keep.**
- ⚠ **DERIVE THE THRESHOLD, DO NOT CHOOSE IT.** The cost Jay accepted is "a new threshold to justify and
  another mode boundary in a file that already has several" — **so justify it: measure where the bundle stops
  reading as a dash and starts reading as a tile, and put that measurement in the report.** A round number
  with no derivation is the thing to avoid.
- **Evidence:** `sphere/hatch/mkDashRamp/low` is the cell Jay's complaint and T3's evidence both use. **Shoot
  BOTH RIGS** and state the fixture per §0 rule 3.

### Guards that must not move — these are the other end of the same dial

**`scene3d-mkdashramp-dark-end.test.js`: T4b's FLOOR of 1400 mm** (and its one-sided ceiling at 1651.17) ·
**`scene3d-mark-laws-draw.test.js`: 30/30, including G4** — ⚠ **T4c proved G4 is the ONLY thing gating the
slab half of Jay's decision-1 bar, so a change that moves it is a regression of a ruling, not of a test** ·
`scene3d-mkdashramp-low-end.test.js` (T3's own) · `scene3d-mktick-runaway.test.js` · `scene3d-mktick-wedge.test.js`.

### Which half you gate (§0 rule 1, and the mutation proof is BLOCKING)

**Name it explicitly: a passes-per-dash bar gates the TILE half. It says nothing about dash COUNT, which is
T3's 7 → 46, or about ink, which is T4b's.** **Mutation-prove the half you claim.**

---

## 2. BRIEF B — W-36f implementer (decision 11 = B)

**Model: Sonnet. Role: implementer. LEDGER row 3. Lane `fill-audit-a4`, port 8475. Starts AFTER T3b commits.**
**Report to: `docs/3d-audit/lane-reports/W-36f-impl.md`.**
**§0 above binds in full. PLAN-READY by path — the mechanism is known and both its proof obligations already
have measured numbers.**

### The defect

**W-36c's anti-saturation cap BINDS at Density 220 — so the tone law has NO AUTHORITY over crosshatch cell
size there. Turning the tone dial at maximum density changes nothing.** ⚠ **Jay asked for "don't go solid"
(decision 6 = C); he did not ask to lose tone response at max density, and he answered decision 11 with (B):
retune the onset so some tone authority survives.**

### Scope, and both proof obligations are ALREADY MEASURED — verify them, do not re-derive them

- **Retune the cap's ONSET so some tone authority survives at d=220, WITHOUT reintroducing the saturation the
  cap prevents.**
- ✅ **The mutation the retuned cap must still kill: naive parity gives `cylinder d=220 = 9136.8 mm, +93.5 %`
  — judge C1's saturation restored almost exactly.** **That number is on record. Reproduce it, then show your
  retuned cap still kills it.**
- ✅ **W-31b's C7 guard already exists** — a tone-authority floor **measured at d=50**, written that way
  precisely because authority at d=220 could not be assumed. ⚠ **Extend it to measure authority AT d=220 —
  that is the quantity this unit exists to create, and C7 is the instrument that was built not to assume it.**
- ⚠ **W-36c's OTHER results are not yours to move:** `CROSS_FAMILY_BUDGET = 1.0` per family, the
  `crossMinPitch`/`crossFloorPitch` pair, the widened `dfMaxMul`, **and Jay's own cell must stay a full even
  crosshatch.** **W-36d's lower-half sub-bar (`nB(0.25) ≥ 1.2 × nB(1.0)` at d=10 and d=100) must stay green**
  — ⚠ **and do NOT extend that 1.2 constant to any other density: below d≈10 it is measured small-integer
  noise (d=1 → 1.400, d=2–5 → 1.167, d=6–9 → 1.333).**

### Docs

⚠ **A CHANGELOG line discloses the outcome either way — merge checklist item 29.** Jay asked for the cap; the
release note must not list the cap without its consequence.

### Which half you gate

**A tone-authority bar at d=220 gates the RESPONSE half. The anti-saturation cap gates the SOLID half, and it
is W-36c's — you must show BOTH still hold, and mutation-prove the one you are adding.**
