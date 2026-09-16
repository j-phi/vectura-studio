# ROUND 3 — RESUME BRIEFS (secretary, 2026-09-12)

**Written after Jay's pause of 2026-09-12 07:50 EDT.** Incident 8 killed three agents on 2026-09-11 and
none was resumed. **All three restart FRESH today.** This file holds one self-contained section per agent:
hand an agent ONLY its own section plus `docs/3d-audit/lane-reports/AGENT-PROTOCOL.md`. Nothing else is
required reading, and nothing in another section applies to it.

**Common ground for all three (already verified by the orchestrator this morning, do not re-verify):**

- Repo root (MAIN): `/Users/jayphi/Documents/github/vectura-studio`. Never `cd`; use absolute paths and
  `git -C <path>`.
- Local `main` is `426cc5e4` + the pause-point docs commit `549b9ba9` (v1.4.1). **44+ ahead of `origin/main`
  and NOT pushed. Never push, never merge, never tag, never bump the version** (the hook cannot fire in a
  worktree).
- **All five `-3` worktrees are clean** — no modified tracked files; the only stash entries are graphify
  noise. Lane HEADs: `fill-audit-a3` `32ec6ef0` (WIP) · `fill-collapse-3` `d00ec210` (WIP) ·
  `fill-audit-3` `141ed0b5` · `fill-audit-d3` `426cc5e4` · `handoff-c3` `426cc5e4`.
- **Stale dev servers on 8475 / 8476 / 8460 were killed. Ports 8475 / 8481 / 8482 / 8476 / 8470 are FREE.**
  MAIN is already served fresh on **8460** (gallery:
  `http://localhost:8460/docs/3d-audit/fill-audit/index.html`) — do not kill it, do not start a second one.
- **Reports and evidence live in MAIN, never in the lane worktree.** Reports go to
  `<MAIN>/docs/3d-audit/lane-reports/<W-id>-<role>.md`; evidence to
  `<MAIN>/docs/3d-audit/fill-audit/after/<W-id>/`. A missing file inside a worktree is **not** evidence of a
  missing deliverable — the U9b reviewer issued a REJECT on exactly that false premise on 2026-09-11.
- Your final message to the orchestrator is **exactly one line**:
  `REPORT docs/3d-audit/lane-reports/<file> — <STATUS> — <≤15 words>`. Nothing else.

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

## 1. BRIEF A — F1-placement implementer

**Model: Sonnet. Role: implementer.**
**Worktree: `/Users/jayphi/Documents/github/vectura-studio/.claude/worktrees/fill-audit-a3`**
**Branch: `3d-scene/fill-audit-a3` · Port: 8475 (verified free)**
**Report to: `/Users/jayphi/Documents/github/vectura-studio/docs/3d-audit/lane-reports/F1-placement-impl.md`**

> Run every vitest file in the FOREGROUND with the Bash tool parameter `timeout: 600000` (ten minutes).
> Never use run_in_background, never arm a Monitor and end your turn. If a file still exceeds ten minutes,
> kill it and rerun alone with `--pool=forks --poolOptions.forks.singleFork=true`, again with
> `timeout: 600000`.

Node 20 (`.nvmrc` v20.20.2). Your lane's Tier-2 slow files are `scene3d-mark-laws-draw`,
`scene3d-ribbon-wall-coverage`, `scene3d-ribbon-f1b-streaks`, `scene3d-curved-density-floor` and
`-sparse-end`. Give each `timeout: 600000`.

### Your situation

Your predecessor was killed by a rate limit mid-unit on 2026-09-11 and **is dead — its transcript is gone.**
Its work survives as one **UNVERIFIED WIP commit, `32ec6ef0`**, on top of `8adfd5af` (W-36c). There is **no
`F1-placement-impl.md`** — you write the first one. There IS partial evidence on MAIN (see §Evidence).

### STEP 0 — VERIFY-OR-REVERT `32ec6ef0` (do this before anything else)

`32ec6ef0` contains, and nothing else:

| file | change |
|---|---|
| `src/core/scene3d/surface-fill.js` | +31 — a new `wvPlaceCov(localPitch)` beside `wvFlatCov()`, plus one line in `weightCovAt`'s fallthrough: `if (isWaveLaw() && !isWv6()) return wvPlaceCov(localPitch);` — i.e. **Prototype B (LOCAL), correctly scoped** |
| `tests/helpers/scene3d-blank-map.js` | +196 (new) |
| `tests/unit/scene3d-ribbon-flat-field-placement.test.js` | +470 (new) |

**Verify it** by running, in the worktree, in the foreground, one at a time, each with `timeout: 600000`:

1. `npx vitest run tests/unit/scene3d-ribbon-flat-field-placement.test.js` — the new oracle file (must be
   green, and must include the byte-identity block described under condition 4 below).
2. `npx vitest run tests/unit/scene3d-mark-laws-draw.test.js` — T1/T1b/T4's oracle; **30/30** is the number
   T4 and W-36c both measured. Anything less is a regression you caused or inherited.
3. `npx vitest run tests/unit/scene3d-ladder-uniform-field-spacing.test.js` — **9/9**, W-26's R1a, and the
   source of the 1.15 bar.
4. `npx vitest run tests/unit/scene3d-style-fill-lines.test.js` — **15/15**.

**If the WIP is green:** adopt it, finish the unit on top of it (evidence, report, `## Bars changed`,
commit). Say in your report that you verified rather than authored it, and name the four runs above with
their counts.

**If the WIP is red and you cannot fix it within ONE honest attempt:**
`git -C /Users/jayphi/Documents/github/vectura-studio/.claude/worktrees/fill-audit-a3 revert --no-edit 32ec6ef0`
and start Prototype B from `8adfd5af` per `docs/3d-audit/lane-reports/F1-placement-plan.md` §7 Fix 1. **Do not
stack a second attempt on top of an unverified checkpoint.** Record the revert and why, in the report.

> 🛑 **THIS BLOCK WAS WRONG AND IS SUPERSEDED — struck 2026-09-12 by the implementer who ran this brief.**
> **The redness is NOT pre-existing: Prototype B causes all nine failures.** The WIP's "proof" set
> `VECTURA_PRE_F1P=1`, but **`scene3d-ribbon-f1b-streaks.test.js` reads a different flag
> (`VECTURA_PRE_F1B`, unrelated baseline) and `scene3d-ribbon-wall-coverage.test.js` reads none** — both of
> its runs executed identical post-fix code. A real `git archive 8adfd5af` export measures **44/44 and
> 36/36, CLEAN**; `cd541f87` measures **36/44 and 35/36**. Traced to `ribbonize()`'s `erodeEmpty` centreline
> fallback (`surface-fill.js` ~:7208-7228). **Ruled: the guards are NOT re-pinned; the fix is the new unit
> F1-erode (LEDGER row 2a).** The block below is kept only as the record of what the brief said.
> **Standing lesson: "pre-existing" is a MEASUREMENT — grep the target file for the flag name and confirm
> the fix's own symbol is absent from the tree you are calling pre-fix, or `git archive` the base sha.**

⚠ ~~**Known pre-existing redness on this lane — READ BEFORE YOU PANIC.**~~ The WIP's own `report.json` records
that `tests/unit/scene3d-ribbon-f1b-streaks.test.js` fails **8 of 44** and
`tests/unit/scene3d-ribbon-wall-coverage.test.js` also fails, **identically and to 13 decimal places
(`ringFillRate = 0.9363204944266638`) both WITH the fix and with `VECTURA_PRE_F1P=1` against the pristine
`8adfd5af` source.** It is therefore **not caused by the fix.** An earlier run in that session showed
f1b-streaks green 44/44 and the cause was never found.

✅ **ORCHESTRATOR RULING 2026-09-12 — this is NOT a blocker, on two conditions:**

- **(a) the failing set must be IDENTICAL at `8adfd5af` and at your final commit** — same files, same tests,
  same numbers. Reproduce it yourself both ways and show it.
- **(b) name it test-by-test in your report under a heading `## Pre-existing red`.** **Five of the eight
  f1b-streaks failures are Unit A's known intentionally-red streak tests; the other three are unaccounted
  for and YOU MUST NAME THEM INDIVIDUALLY.** "It was already broken" with no enumerated set is treated as a
  hidden regression.

**Do NOT try to fix it** — it points at the self-occlusion/erosion pipeline, outside your allowed files. It
is filed as MERGE CHECKLIST item 25 (reconcile every intentionally-red test before the merge).

### The five ruled conditions — VERBATIM, they govern the unit

Jay's decision 4 = **A**: the **41.7 × 6.6 mm bare strip on the lower front torus IS the streak.**
F1-placement ships **Prototype B**, under these five conditions (LEDGER row 2, `F1-placement-plan.md` §10):

1. **deep-blank (> 2 mm) is the primary oracle with a ±10 % band.** The `dist > 2.0 mm` blank area over the
   front visible-form region is the gate. Everything else is secondary.
2. **the total-area bar is restated to what B meets, AND disclosed under `## Bars changed`.** The plan's
   32 mm² bar was set for Prototype A (which measured 22.77 mm²); B measures more area but far less depth.
   Raising that bar **is** a bar change and must appear as
   `tests/unit/scene3d-ribbon-flat-field-placement.test.js:<line> — 32 → <new> — Prototype B measures <n> mm²; Prototype A measured 22.8 and is the alternative`.
3. **RED-1(b) is restated on the drawn perpendicular gap** (not the index gap). Under B the index gaps are
   legitimately non-uniform — that is the point, screen-even not index-even. The plan's rule stands: **do not
   restate a bar on a quantity you have not first shown RED at.**
   ✅ **ORCHESTRATOR RULING 2026-09-12 — "RESTATED" MEANS A GATE, NOT A RETIREMENT.** You must **gate the
   drawn perpendicular gap, with pre- and post-fix numbers measured on THIS tree.** The only honest
   alternative is a **measured stop-report on this single condition, disclosed under `## Bars changed`** —
   ship the numbers and state plainly that the metric does not separate defect from fix. **Silently
   downgrading it to "measured, not gated", as your dead predecessor did, REJECTS the unit.**
4. **`ampSpacing` and the WV6 laws are byte-identical.** (U7 already proved `ampSpacing` on a dimensioned
   harness; `weaveDepth` and `taperedEnds` must also not move.)
5. **F1-amp is filed as the follow-up, serialized after this unit.** Placement is only half the mechanism —
   the three subject laws are pre-Round-6 and never got the amplitude floor (`wvAmpAsk`/`wvRamp` return 0 for
   `I ≥ WV_I0 = 0.62`), so a ~3 mm plain-ruling stripe in the highlight is geometrically unavoidable however
   evenly the rulings are placed. **Say so in the report so nobody reads a placement-only GREEN as "F1
   closed".**

⚠ **What the dead predecessor already did against these conditions** — verify each claim yourself, then
either adopt or correct it (its `report.json` is at
`docs/3d-audit/fill-audit/after/F1-placement/report.json`):

- **Condition 1:** it **re-derived RED on the current tree**, as required. The plan's §10 pre-fix numbers
  (11.89 / 14.70 / 12.15 mm²) were measured at `3c88605f` and are **stale**; at `8adfd5af` the pre-fix
  deep-blank is **3.02 / 4.00 / 1.79 mm²** (interlockWeave / onePenDown / trochoidLoop) and Prototype B gives
  **0.03 / 0.00 / 0.00**. It proposed a bar of **≤ 0.5 mm² (±10 % → 0.55)**.
- **Condition 2:** pre-fix largest `>0.8 mm` cluster **45.89 / 39.04 / 55.67 mm²**, B **39.81 / 21.27 /
  14.03 mm²**; proposed restated bar **area ≤ 45 mm², longest extent ≤ 30 mm**. It disclosed honestly that
  this bar **does not cleanly separate pre- from post-fix per law** (pre-fix onePenDown 39.04 sits below
  post-fix interlockWeave 39.81) — which is exactly why condition 1 is the primary gate.
- **Condition 3:** it **RETIRED the perpendicular-gap bar as a gate** ("measured, NOT gated"), arguing the
  nearest-approach distance on serpentine families is dominated by weave crests, not placement (pre-fix ratio
  10.4 / 12.8 / 18.3; B 11.9 / 12.4 / 5.1 — no bar separates defect from fix). ⚠ **The ledger condition says
  "restated", not "retired". You may keep this disposition only if you reproduce those numbers yourself and
  state the reasoning in the report as a deviation from the ruled condition; flag it in your one-line report
  so the orchestrator can rule.**
- **Condition 4:** claimed **18/18 byte-identical** on a `SF.buildObject` unit harness (ampSpacing/weaveDepth
  × torus/sphere/cone × density 25/50/100) and **6/6 byte-identical** on real captures. Re-run both.
- **Condition 5:** the handoff section was drafted but the report body was never written.

### Files ALLOWED / FORBIDDEN (lane fill-audit-a3, `F1-placement-plan.md` §12)

**Allowed**
- `src/core/scene3d/surface-fill.js` — and within it **only** the wave laws' own placement-coverage path:
  `wvFlatCov()`, the new `wvPlaceCov()` beside it, `weightBaseCov()`'s `isWaveLaw()` branch, and
  `weightCovAt`'s fallthrough. Nothing else in the file.
- `tests/unit/scene3d-ribbon-flat-field-placement.test.js` (new).
- `tests/helpers/scene3d-blank-map.js` (new shared blank-map rasteriser — already in the WIP).
- `docs/3d-audit/lane-reports/F1-placement-impl.md`, `docs/3d-audit/fill-audit/after/F1-placement/report.json`,
  `docs/3d-audit/STILL-OPEN.md`, `CHANGELOG.md`, `plans.md`.

**Forbidden**
- **The master grid, `surface-fill.js:5084–5285` — read, never write** (the W-26 brief is still in force).
- `emitContFamily` and everything W-26 changed inside it, including `probe()` / `baseSteps`.
- `ladderStep`, `ladderKeeps`, `spanDrops` — the accumulator is correct; it is being fed a tone-free
  constant. **Fix the input.**
- `ribbonizeCore` and the stretch classifier (Fix D is REJECTED with measurement — 91 % of blank-adjacent
  samples belong to dropped whole rulings; do not spend the unit there).
- `contMapper`'s gate (Fix 3) — needs an explicit scope grant you do not have.
- `HL_STAGE` (`coverageCap` must stay `false`); `surface-fill-mono.js`; `hlr.js` / `shadows.js` /
  `pen-fill.js` / `fill-boolean.js`; `mappers.js`; `geometry-utils.js`; any other worktree.

### Guards — run every one individually, foreground, `timeout: 600000`

`scene3d-ladder-uniform-field-spacing` (9/9) · `scene3d-style-fill-lines` (15/15) ·
`scene3d-curved-density-floor` · `scene3d-curved-density-sparse-end` · `scene3d-ribbon-f7-self-occlusion` ·
`scene3d-ribbon-f1b-streaks` (see the pre-existing-redness note) · `scene3d-ribbon-c3-rule5` ·
`scene3d-ribbon-outline-fill-seam` · `scene3d-ribbon-wall-coverage` (same note) ·
`scene3d-ribbon-wall-region-clip` · `scene3d-ribbon-weightscale-invariant` · `scene3d-ribbon-primitives` ·
`scene3d-ribbon-f6-self-occlusion` · `scene3d-fill-even-spacing` · `scene3d-fill-span-verdict` ·
`scene3d-fill-ruling-continuity` · `scene3d-fill-seam-continuity` · `scene3d-fill-boundary-ends` ·
`scene3d-plot-floor-obj` · `scene3d-plot-safety` · `scene3d-tone-algo-default` · `scene3d-hatch-density-500` ·
`scene3d-subwindow-density` · `scene3d-appdefault-lit-floor` · `expand-scene3d-weight-to-strokes` ·
`scene3d-mark-laws-draw` (30/30 — T4's, and W-36c landed in this file after it).

Every guard must be shown **non-vacuous** (it asserts a real moved number, not "no throw"). **Any bar you
move, up or down, goes under `## Bars changed` as `file:line — old → new — why`, and into the commit body. A
bar change with no entry REJECTS the unit.**

### Stop conditions (ship the measurement, do not fudge)

1. **Scope leak** — `ampSpacing`, `weaveDepth`, `taperedEnds` or `weightSmoothstep` move at all on the blank
   map or on ink.
2. **Ink** — any subject law's whole-object ink moves more than **±8 %** at Density 50 (measured for B:
   −5.3 to −5.8 %; `ampSpacing` +10.8 % is exactly what a leak looks like).
3. `ringFillRate` **< 0.995** on any of the five, or `degenerate > 0`, or `wide` **falls** for any of the five.
4. **The band does not close** — ship the numbers, say placement is only half the mechanism, open F1-amp, and
   **do not widen the bar.**
5. **New `[FillBoolean]` failures** that did not occur at base are a stop-and-report, not a shrug. One was
   already seen under Prototype B — expect it and characterise it.
6. **You may report MEASURED or DONE/FU. You may NOT report "F1 CLOSED"** — no F1 screenshot exists anywhere
   in the repo and `docs/stroke-fill-handoff.md` §A requires Jay to confirm by eye.

### Evidence cells — ALL VERIFIED TO EXIST in `docs/3d-audit/fill-audit/manifest.B.*.jsonl` and `shots/B/`

Re-shoot **from MAIN** so output lands in main's gallery dir:

```
node scripts/audit/scene3d-capture.js --tier B \
  --root /Users/jayphi/Documents/github/vectura-studio/.claude/worktrees/fill-audit-a3 --port 8475 \
  --only '^torus__hatch__(interlockWeave|onePenDown|trochoidLoop|ampSpacing|weaveDepth)__(med|max)__a$' \
  --out docs/3d-audit/fill-audit/after/F1-placement
```

plus the two non-torus wave-law cells: `^cone__contour__(ampSpacing|amplitudeOnly)__med__a$`.
⚠ **CORRECTION 2026-09-12 (accepted): only `cone__contour__ampSpacing__med__a` is a CONTROL.
`amplitudeOnly` is one of `isWaveLaw()`'s four pre-Round-6 members (`surface-fill.js:75`), so
`isWaveLaw() && !isWv6()` legitimately puts it inside `wvPlaceCov`'s scope and its capture is CORRECTLY
not byte-identical.** Condition 4 is therefore **5/6 by md5 and that is the right answer**. The
must-not-move list is `ampSpacing`, `weaveDepth`, `taperedEnds`, `weightSmoothstep` only — the plan §13
wording calling `amplitudeOnly` a control was imprecise.

⚠ **`docs/3d-audit/fill-audit/after/F1-placement/` ALREADY HOLDS the dead predecessor's shots** — 12 `.webp`
under `shots/B/` (all ten torus cells + the two cone controls), `manifest.B.1-1.jsonl`,
`manifest.B.unreachable.jsonl`, and a `report.json` that **was mid-write when the agent died.** Treat all of
it as **unverified**: re-shoot from your own tree and overwrite, or verify each file's provenance explicitly.
Do not cite it as your own evidence without re-shooting.

`before` pointers go to the top-level `shots/A|B/...` gallery baseline. **Every `after` path must start
`after/F1-placement/`** or GH-1's hard refusal rejects the report.
**`ampSpacing` / `weaveDepth` / cone cells are expected byte-identical — that is the correct-scoping proof —
so they must appear in `identical_exceptions` with that reason.**

**LOOK at the four subject cells yourself with the Read tool, crop the strip under the inner hole at NATIVE
resolution (PIL crop → Read) before judging, and describe what you see before and after. That strip is the
whole unit.** A whole 800 px cell hides sub-mm defects — on 2026-09-05 a cull that cut mid-ring passed the
implementer, the reviewer and every metric until the orchestrator cropped the hole region.

### Finish

Commit in the worktree with `git add <explicit paths>` only; message names F1-placement and carries the
before/after numbers and the `## Bars changed` rows. **Then STOP. Never push.** Write the full report to
`docs/3d-audit/lane-reports/F1-placement-impl.md` with a first line
`STATUS: DONE | DONE/FU | MEASURED | REVERTED | BLOCKED`, and return exactly one line.

---

## 2. BRIEF B — U9b-2 + U5b-4 implementer (ONE run, TWO commits)

**Model: Sonnet. Role: implementer.**
**Worktree: `/Users/jayphi/Documents/github/vectura-studio/.claude/worktrees/fill-collapse-3`**
**Branch: `3d-scene/fill-collapse-3` · Port: 8482 (verified free)**
**Reports to: `docs/3d-audit/lane-reports/U9b-2-impl.md` and `docs/3d-audit/lane-reports/U5b-4-impl.md`**

> Run every vitest file in the FOREGROUND with the Bash tool parameter `timeout: 600000` (ten minutes).
> Never use run_in_background, never arm a Monitor and end your turn. If a file still exceeds ten minutes,
> kill it and rerun alone with `--pool=forks --poolOptions.forks.singleFork=true`, again with
> `timeout: 600000`.

Node 20 (`.nvmrc` v20.20.2). **`tests/unit/scene3d-tone-law-collapse.test.js` is Tier 1 on this lane: 117
tests, 390–840 s, and EVERY prior unit in this chain had to run it with
`--pool=forks --poolOptions.forks.singleFork=true`. Start it with singleFork; one file per command.**
`tests/integration/scene3d-fill-style-picker.test.js` (170 tests) is Tier 2 — same `timeout: 600000`.

### Your situation

Your predecessor was killed by a rate limit on 2026-09-11 and **is dead.** Its work survives as one
**UNVERIFIED WIP commit, `d00ec210`**, on top of `49a5ef88` (U7-2). It contains **only**
`tests/integration/scene3d-shadow-writeback.test.js` (+274, new). **Commit 1 was never made** and **there is
no report.** You write both reports.

### STEP 0 — VERIFY-OR-REVERT `d00ec210`

Run, in the worktree, foreground, `timeout: 600000`:
`npx vitest run tests/integration/scene3d-shadow-writeback.test.js`

- **Green and it actually asserts the U9b-2 scope below** → adopt it as the start of commit 1 and extend it.
- **Red, or it asserts something else, and you cannot fix it in ONE honest attempt** →
  `git -C /Users/jayphi/Documents/github/vectura-studio/.claude/worktrees/fill-collapse-3 revert --no-edit d00ec210`
  and write the test from scratch. Record the revert and why.

**Do not build on an unverified checkpoint.** Note that a test file alone proves nothing about RED: derive
your RED from a scratch `git archive` export of `49a5ef88` (see §RED below), never by `git stash` in the
worktree.

### COMMIT 1 — U9b-2: disclose and test the `onePenDown` shadow write-back

**Why it exists (LEDGER row 10a, U9b review follow-up 1).** U9b made `onePenDown` — the ONE folded id with no
shadow recipe of its own, whose `markClass` `shadowMarkLines` forces to `'hatch'` regardless of its real
`'wave'` class — **resolve FORWARD to its survivor** (`interlockWeave` + `penDown`) via an opt-in
`shadowResolvesToSurvivor` flag used at exactly one site. **That is not merely a display choice: it rewrites
the stored shadow bag, i.e. a WRITE-BACK-ON-LOAD**, and it is a genuine departure from U9's "no write-back"
contract that every other folded id keeps. **W-10d-2's entire contract exists because write-backs need
stating.** It is undisclosed and untested against the real load path.

**Scope — four deliverables, all of them tests + disclosure, no mechanism change:**

1. **Prove it fires ONCE at load** — not on every render, not on every param read.
2. **Prove it creates NO undo entry.**
3. **Prove it round-trips the survivor in a saved `.vectura`** — through the real
   `engine.loadState` / `sanitizeImportedParams` path, not a synthetic bag.
4. **Add a guard that TRIPS if a second id ever acquires `shadowResolvesToSurvivor`.** This is the
   secretary's flag-3 concern made executable: **an exception justified by one measurement must not quietly
   gain callers that were never measured.** Today the flag is passed at exactly one of the six
   `describeSingleParamCluster(...)` call sites in `tests/unit/scene3d-tone-law-collapse.test.js`, as
   `['onePenDown']`; the other five leave it `undefined` and `(shadowResolvesToSurvivor || []).includes(id)`
   correctly defaults to raw pass-through. **Tie the test-side literal to the production-side
   `Shadows.toneLawApplies` set** and note in a comment that the coupling is manual.

Also worth folding in if it costs nothing (U9b review follow-up 2): add `bundleDither` (or another
recipe-bearing folded id) to `scripts/audit/u9b-shadow-display-evidence.js`'s `IDS` list, so the "shows its
own text" claim is demonstrated on more than one case.

**Commit 1 alone, then move on.** Do not squash the two units.

### COMMIT 2 — U5b-4: render the caveat on the SHADOW row, BOTH surfaces

**Why it exists (LEDGER row 11a).** U7-2 found it while rewriting copy: **the shadow row's Fill Style picker
renders NO standalone caveat paragraph on EITHER surface.** Only the docked object **Style tab**
(`src/ui/panels/scene3d-panel.js:750` on main — `caveatLine.className = 'vs3-lawnote is-caveat'`) and the
**ctxbar Style flyout** (`src/ui/shell/context-bar.js:1622` — `flyNote(fly, caveatNote.caveat).classList.add('is-caveat')`)
do. Those are the only two `.is-caveat` render sites in the whole app. **So a user picking a caveat-bearing
law as a SHADOW tone law never sees the warning unless they open the (i) popover and read past the
mechanism/strengths text to "Weaknesses:".** U7-2 confirmed this both by a live DOM probe
(`hasStandaloneCaveatElement: false`) and by direct source read.

That is the standing ruling **"folding a law must NOT hide its measured caveat"** failing on a **third
surface nobody had checked** — U5b fixed two; the shadow row was never in scope.

**Scope:**

- Add the caveat paragraph to **BOTH** shadow surfaces: the docked panel's "Shadow" section (`.vs3-shadow`)
  **and** the ctxbar **Shadow** flyout. Half of it is not a fix.
- **Use the same `effectiveLaw` mechanism** the Style row already uses:
  `const effectiveLaw = FS.effectiveLaw ? FS.effectiveLaw(law, <bag>) : law; const caveatNote = FS.note(effectiveLaw);`
  (`src/config/context-bar.js:279` defines `SCENE_FILL_STYLES.effectiveLaw`). `FS.note(shadowInfoLaw).caveat`
  is **already computed at the shadow render path and discarded** — mirror the Style-row code exactly.
- ⚠ **Mind U9's boundary: the shadow bag has NO sub-control.** This is **a caveat paragraph, not a param
  seed** — do not add a sub-control, and do not seed the bag. U9's reviewer explicitly prohibits it.
- Line numbers above are **MAIN's**; this lane is ahead of main by U6 / U9b / U7-2. **Re-locate them on the
  lane before editing.**

### Files ALLOWED / FORBIDDEN (lane fill-collapse-3)

**Allowed:** `scripts/build-tone-laws.js` · `src/config/context-bar.js` · `src/ui/panels/scene3d-panel.js` ·
`src/ui/shell/context-bar.js` · the collapse/picker tests
(`tests/unit/scene3d-tone-law-collapse.test.js`, `tests/unit/scene3d-fill-style-display-params.test.js`,
`tests/unit/scene3d-fill-style-effective-law.test.js`, `tests/unit/scene3d-tone-laws-config.test.js`,
`tests/integration/scene3d-fill-style-picker.test.js`,
`tests/integration/scene3d-shadow-writeback.test.js`) · your two reports and
`docs/3d-audit/fill-audit/after/{U9b-2,U5b-4}/`.

**Forbidden:** `src/core/scene3d/surface-fill.js` and `surface-fill-mono.js` · `mappers.js` · the slices pass ·
`hlr.js` · **`shadows.js`** · `src/core/algorithms/scene3d.js` · any other worktree · any push/merge/bump.

### Two standing rulings that bind this run

1. **The generative cross-check is part of every fold's scope, not a guard that happens to be nearby.**
   `tests/unit/scene3d-fill-style-display-params.test.js` (W-10d-3's, pinned by U5b-3) and
   `tests/unit/scene3d-fill-style-effective-law.test.js` **do not survive a roster or resolution change
   without being extended** — U7 and U8 each had to touch them and **U6 broke one outright.** If your change
   moves either, extend it **in the same commit**. **Both must be green when you finish.**
2. **A unit that turns another unit's test GREEN must SAY SO.** If a file goes red → green inside your unit
   and you did not cause the red, **name the borrowed green explicitly and attribute it** — at merge an
   unattributed red → green reads as "all tests pass" and hides which unit owns the fix. U9b honoured this
   for U6-2; you honour it too.

### RED / GREEN and bars

- **RED from a scratch `git archive` export**, never `git stash` in the worktree:
  `mkdir -p /private/tmp/claude-501/scratch-U9b-2 && git -C <worktree> archive 49a5ef88 | tar -x -C /private/tmp/claude-501/scratch-U9b-2`,
  then symlink `node_modules` from MAIN.
- Each commit needs at least one test that **fails without the change and passes with it.**
- **Any numeric threshold, tolerance, count bar or pinned fingerprint you move — up OR down — goes under
  `## Bars changed` as `file:line — old → new — why`, in the report AND the commit body.** A bar change with
  no entry REJECTS the unit. (U7-2's string re-pins were correctly disclosed as **copy re-pins, not bar
  changes** — the regex checks the same claim in new wording. Use that framing if it applies, and say why.)
- **Sum your own tables; do not restate a headline.** Four arithmetic slips have been caught by reviewers in
  this chain alone (U0 342-vs-335, U1–U5 21-vs-18, U8 426-vs-447, U6 550-vs-544). **The correct U6 numbers are
  53/53 on the row and 544 total — do not copy 550 forward.**

### Guards

`scene3d-tone-law-collapse` (full file, singleFork — **117/117** at `49a5ef88`; it will change with your new
tests, so state the new count and how you got it) · `scene3d-fill-style-effective-law` ·
`scene3d-fill-style-display-params` · `scene3d-tone-laws-config` · `scene3d-fill-style-picker` (integration,
**170/170**) · `scene3d-shadow-tone-law` + `scene3d-shadow-tone-law-uniqueness` +
`scene3d-one-pen-down-reachability` · `stroke-fill-style-control` + `scene3d-panel` +
`context-bar-scene-flyouts` · `scene3d-panel-style-live-sync` · `scene3d-tone-law-dispatch` ·
`scene3d-tone-law-plumbing` · `tests/integration/scene3d-shadow-writeback.test.js`.

### Live verification — MANDATORY, and it is the deliverable for U5b-4

**Harness-clean is not app-clean.** Start your lane's dev server:
`node scripts/dev-server.js 8482` from the worktree (port verified free; kill it when done — and **do not
touch MAIN's server on 8460**). Confirm `window.Vectura.APP_VERSION` matches the worktree's `package.json`
(1.4.1 — no bump in a worktree).

**The chrome-devtools MCP browser is a singleton shared with other live sessions — do not `pkill` it and do
not clear its lock. Use Playwright** (`chromium.launch()`), the way U7-2 did, in a scratch script you delete
afterwards.

Capture, at **native resolution**, element crops proving:

1. the **shadow row caveat paragraph on the docked panel's Shadow section** (`.vs3-shadow`), and
2. the **shadow row caveat paragraph in the ctxbar Shadow flyout**,

for a caveat-bearing shadow law (`dutyConst` is U7-2's own probe case and reproduces the gap). **LOOK at both
crops with the Read tool and describe what you see.** Write them to MAIN's
`docs/3d-audit/fill-audit/after/U5b-4/` with a `report.json`; every `after` path must start `after/U5b-4/`.
Do the same for U9b-2 under `after/U9b-2/` if it produces anything visual (it may legitimately not — say so).

### Finish

Two commits in the worktree, `git add <explicit paths>` only, each message naming its W-id and carrying the
numbers. **Then STOP. Never push.** Two reports, each with a `STATUS:` first line. Return exactly one line
covering both.

---

## 3. BRIEF C — U7-2 adversarial reviewer

**Model: Sonnet. Role: adversarial reviewer. READ-ONLY.**
**Pinned range: `2b189b5f..49a5ef88` on branch `3d-scene/fill-collapse-3`**
**Worktree for reading only: `/Users/jayphi/Documents/github/vectura-studio/.claude/worktrees/fill-collapse-3`**
**Report to: `/Users/jayphi/Documents/github/vectura-studio/docs/3d-audit/lane-reports/U7-2-review.md`**

> Run every vitest file in the FOREGROUND with the Bash tool parameter `timeout: 600000` (ten minutes).
> Never use run_in_background, never arm a Monitor and end your turn. If a file still exceeds ten minutes,
> kill it and rerun alone with `--pool=forks --poolOptions.forks.singleFork=true`, again with
> `timeout: 600000`.

Node 20 (`.nvmrc` v20.20.2). **`tests/unit/scene3d-tone-law-collapse.test.js` is Tier 1: 117 tests,
390–840 s wall, always singleFork, one file per command.** `tests/integration/scene3d-fill-style-picker.test.js`
(170 tests) is Tier 2. **The last two reviewers on this lane were killed while polling background jobs —
deviations 6 and 7 of that class, both with foreground-only wording already in their briefs. The rule for you
is the number above, not the prose.**

### Rules for you specifically

- **You are read-only.** Never edit, never `git stash`, never `git checkout`, never delete anything inside
  the worktree — a reviewer once `rm`'d two untracked PNGs it did not create. Leave no probe files behind.
- **Reproduce in a scratch export, never in the worktree:**
  ```
  mkdir -p /private/tmp/claude-501/scratch-U7-2/pre /private/tmp/claude-501/scratch-U7-2/post
  git -C /Users/jayphi/Documents/github/vectura-studio/.claude/worktrees/fill-collapse-3 archive 2b189b5f | tar -x -C /private/tmp/claude-501/scratch-U7-2/pre
  git -C /Users/jayphi/Documents/github/vectura-studio/.claude/worktrees/fill-collapse-3 archive 49a5ef88 | tar -x -C /private/tmp/claude-501/scratch-U7-2/post
  ln -s /Users/jayphi/Documents/github/vectura-studio/node_modules /private/tmp/claude-501/scratch-U7-2/pre/node_modules
  ln -s /Users/jayphi/Documents/github/vectura-studio/node_modules /private/tmp/claude-501/scratch-U7-2/post/node_modules
  ```
- **Reports and evidence are in MAIN, not the worktree.** The implementer's report is
  `docs/3d-audit/lane-reports/U7-2-impl.md`; its evidence is `docs/3d-audit/fill-audit/after/U7-2/`. **On
  2026-09-11 the U9b reviewer searched the worktree, found nothing, and issued a REJECT on that false
  premise — the verdict had to be withdrawn. A missing file is not evidence of a missing deliverable.**
- Verdict is **ACCEPT / ACCEPT-WITH-FOLLOWUPS / REJECT**, **per condition**, with **the exact numbers you
  measured yourself** — not the report's numbers restated.

### What U7-2 claims (`49a5ef88`, implementer: DONE)

A **copy-only** plain-language pass over **every** folded fill-law caveat. **17 caveats rewritten** in
`docs/tone-laws/laws.json`, regenerated into `src/config/scene3d-tone-laws.js` via
`node scripts/build-tone-laws.js`; **2 string assertions re-pinned** in
`tests/unit/scene3d-tone-law-collapse.test.js` plus a new "U7-2" describe block of 6 tests. Headline:
**555/555, no bars changed, no production/UI wiring file touched.** Every rewritten entry gained a sibling
**`"measured"`** field holding the exact original text, which the build script does **not** copy into the
generated UI-facing file.

### The secretary's flags — these are your review conditions

⚠ **Provenance note, stated so you do not go looking:** SESSION-SUMMARY §2 says "the secretary's four flags
are in the ledger", but **no labelled flag list for U7-2 was ever written down.** LEDGER row 11 carries four
checkable *claims*; the flags below are derived from that row and from `U7-2-impl.md` by the secretary today.
Treat all seven as the review conditions.

**Flag 1 — the 17-caveat count against the roster.** The report says "17 rewritten of the 20 the roster ever
had; 3 were already plain". **The secretary has verified the arithmetic and it holds: `docs/tone-laws/laws.json`
carries 48 laws, of which exactly 20 have a non-empty `caveat`; at `49a5ef88` exactly 17 carry a `measured`
sibling.** So 17 + 3 = 20 ✔. **What you must check is the residue, which nobody has:** identify the **3
untouched caveat-bearing laws** (expected: `bundleDither` and `contFieldTouch` from U5b-2, `penStipple` from
U6) and **confirm each is genuinely already plain** — no `R2`/`L*` codes, no mm figures, no bare cell tokens
(`sphere·hatch`), no function or file names (`WEIGHT_LAWS`, `isWaveLaw()`, `splitsAlongLine()`,
`surface-fill.js`, `scene3d.js`). If any of the 3 still carries jargon, the "every folded law" claim is
false and the unit is incomplete, not wrong.

**Flag 2 — the `measured` field must be absent from the GENERATED file, and that must be structural.** The
claim is that `scripts/build-tone-laws.js`'s `BY_ID[id] = {...}` literal simply does not list `measured`, so
`grep -c '"measured"' src/config/scene3d-tone-laws.js` returns **0** after a fresh regenerate. **Verify it
yourself in the post export:** re-run `node scripts/build-tone-laws.js`, `git diff` the regenerated file to
confirm the build is **deterministic and a pure function of `laws.json`** (the report claims a second
regenerate is byte-identical), then grep. **Then ask the harder question: is the new test that pins this
non-vacuous?** It must fail if `measured` were added to the copied field list — construct that mutation in
your scratch export and show it goes RED. A test that merely asserts a string is absent from a file that
never contained it is the same class of defect as W-38's `git show HEAD:` leg.

**Flag 3 — the two re-pins are claim-preserving copy re-pins, or they are bar changes.** At
`tests/unit/scene3d-tone-law-collapse.test.js` ~1173–1174 (U7's "ampSpacing and weaveDepth each carry their
own non-empty, DISTINCT caveat") and ~1374–1375 (U8's, for interlockWeave/onePenDown), `toMatch(/single-weight/)`
became `/weight.*(?:isn't constant|varies)/` and `/weight (?:varies|isn't constant)/`. The implementer
disclosed these as **copy re-pins, not bar changes** — the regex checks the same underlying claim (the
line's weight is not constant) in the new wording. **Rule on that yourself, and adversarially: does the new
regex still fail on a caveat that has LOST the claim?** Mutate one rewritten caveat in your scratch export to
drop the weight statement and show the assertion goes RED. If the new regex is looser than the claim (e.g. it
would match unrelated prose containing "weight" and "varies"), that is a **widened bar**, and it must be
called one.

**Flag 4 — the 555/555 sum.** The report's guard table has ten rows: 117, 6, 15, 7, 8, 170, 40, 107, 47, 59.
**A naive sum is 576, not 555.** The secretary reconciles it as follows: rows 2 (`-t "U7-2"`, 6) and 3
(`-t "U7 caveat|U8 caveat|U6 caveat|U5b-2"`, 15) are **targeted subsets of row 1's full-file 117**, so
576 − 6 − 15 = **555**. **The headline is defensible but the derivation is nowhere in the report.** Confirm
the reconciliation, confirm the two subsets really are subsets of the 117, and confirm each row's count by
re-running it yourself. **Four arithmetic slips have been caught this way in this chain (U0, U1–U5, U8, U6) —
sum the table, never restate the headline.**

**Flag 5 — the shadow-row caveat gap is a real pre-existing defect, correctly NOT fixed here.** U7-2's live
verification found that the shadow row's Fill Style picker renders **no standalone caveat paragraph on either
surface** — only two `.is-caveat` call sites exist in the whole app (`scene3d-panel.js:750`,
`context-bar.js:1622`, both Style-row). **Confirm the finding is real** by reading the source yourself, and
**confirm it is genuinely pre-existing at `2b189b5f`** (i.e. U7-2 did not cause it). It is filed as **U5b-4**
and is being implemented in a separate run — **do not treat its absence here as a defect of this unit**, but
do rule on whether the copy-only scope boundary was drawn honestly.

**Flag 6 — the collapse-file guard run was effectively a background run.** The report's own words: the file
"needed `--pool=forks --poolOptions.forks.singleFork=true` after the default pool exceeded the tool's
foreground timeout — … let it run to completion in the background and read the result back". **That is the
shape of deviations 6 and 7 on this lane.** It was tolerated for U5b-2/3 (the agent waited rather than
arming a Monitor), but the 117/117 is the unit's central number. **Re-run the file yourself, foreground,
`timeout: 600000`, singleFork, and report YOUR count.**

**Flag 7 — two ids sharing byte-identical caveat text.** The live verification records that
`penPitchMatch`'s new caveat is **byte-identical to `penFacing`'s own** ("confirmed deliberate, matching U6's
finding"). The standing precedent from U7/U8 is that **survivor and folded id each carry their own DISTINCT
caveat**, and a non-empty default caveat is the known-good outcome when both carry one. **Rule on whether two
FOLDED siblings sharing one string violates that, or whether it is correct because they describe the same
simulated-note mechanism.** Say which, with the source read behind it.

### Also check, as a matter of course

- **Byte-identity of the render path.** The unit claims no rendered pixel can move because no production
  render file was touched and `.caveat` is read only by the two UI display sites. **Verify with
  `git diff --stat 2b189b5f 49a5ef88`** that the diff is confined to `docs/tone-laws/laws.json`,
  `src/config/scene3d-tone-laws.js` and `tests/unit/scene3d-tone-law-collapse.test.js`, and that
  `src/config/context-bar.js`, `src/ui/panels/scene3d-panel.js` and `src/ui/shell/context-bar.js` are
  byte-identical across the range.
- **`npm run test:ci` was NOT run**, disclosed by the implementer citing U7/U8's precedent (both ACCEPTed
  without it) for a copy-only unit. ✅ **ORCHESTRATOR RULING 2026-09-12: ACCEPTED on that precedent — but
  the acceptance is CONDITIONAL ON YOU.** You must run, **in your own post export**, the targeted
  **collapse / picker / caveat** files **plus the generative cross-check**
  (`tests/unit/scene3d-fill-style-effective-law.test.js` and
  `tests/unit/scene3d-fill-style-display-params.test.js`), and **re-sum the 555/555 yourself** (see flag 4).
  **Full `test:ci` belongs to the merge, not to this unit** — do not ask for it and do not reject over it.
- **Vacuous-pass guards** in the new "U7-2" describe block (jargon-absence, sentence-count, `measured`
  archival + never-renders, cross-cluster distinctness survival, UI-label references, BY_ID-vs-`FS.note()`
  agreement). **A jargon-absence test that scans a regex list is only as good as the list** — check what it
  would miss.
- **The evidence.** `docs/3d-audit/fill-audit/after/U7-2/` holds 5 full-page PNGs + 5 native-resolution
  element crops + `report.json` + `raw-capture-results.json`. **Open the crops with the Read tool yourself
  and confirm the rendered text matches `laws.json` verbatim** — the implementer claims verbatim matches on
  five caveats across three surfaces.

### Finish

Write the full report to `docs/3d-audit/lane-reports/U7-2-review.md` with a first line
`STATUS: ACCEPT | ACCEPT-WITH-FOLLOWUPS | REJECT`, a verdict **per flag**, and the numbers you measured.
Clean up `/private/tmp/claude-501/scratch-U7-2/` — and **only** that. Return exactly one line.

---

## 4. BRIEF D — F1-width-bar implementer (TESTS ONLY, MEASURE-FIRST)

**Model: Sonnet. Role: implementer. LEDGER row 2b.**
**Worktree: `/Users/jayphi/Documents/github/vectura-studio/.claude/worktrees/fill-audit-a3`**
**Branch: `3d-scene/fill-audit-a3` · Port: 8475**
**Start: after T2 iteration 2 has COMMITTED (one implementer per worktree), BEFORE T3.**
**Report to: `/Users/jayphi/Documents/github/vectura-studio/docs/3d-audit/lane-reports/F1-width-bar-impl.md`**

**§0 above binds this unit in full — all six rules plus the two process rules. Read it first.**

> Run every vitest file in the FOREGROUND with the Bash tool parameter `timeout: 600000` (ten minutes).
> Never use run_in_background, never arm a Monitor and end your turn. If a file still exceeds ten minutes,
> kill it and rerun alone with `--pool=forks --poolOptions.forks.singleFork=true`, again with
> `timeout: 600000`.

### Why this unit exists

**No test anywhere in this repo gates ribbon WIDTH in mm.** That has now been confirmed independently by
three parties: the F1-erode planner, the F1-erode reviewer, and the F1-placement pictures that raised
**§4 decision 10**. The consequence was demonstrated, not theorised: **F1-placement's nine red tests measured
coverage, fill rate, residue and gap geometry while the thing that visibly changed was ribbon width** — a
fill can improve on every bar in the suite and still look wrong when no bar measures the quantity that moved.

### JOB 1 — establish the ONE canonical measurement script, and explain the discrepancy

**Do this before writing any bar.** Two independent scripts have measured `trochoidLoop`'s hatch ink delta
on **md5-identical source** and disagreed: **−0.98 % (F1-amp's implementer) vs −1.10 % (its reviewer)** —
~0.12 pp, same sign, same magnitude class, cause never isolated. It is the **second** unmatched
re-measurement of the round (after F1-placement's WIP quoting 11.9/12.4/5.1 against a re-measured
7.58/11.20/3.50).

- **Find why they differ.** The prime suspects are fixture and density defaults, and **the rig** (§0 rule 3):
  `create` vs `addLayer` seed different radius/detail. Read both scripts' construction paths rather than
  their outputs.
- **Ship ONE canonical script** for ribbon width/ink per law, under `scripts/audit/`, and **state its rig,
  its fixture and its density explicitly in its own header.** Every future width or ink claim cites it.
- **If the two scripts turn out to differ for a legitimate reason** (different rigs, say), that is a finding,
  not a bug — **say so, and record which number belongs to which rig.**

### JOB 2 — decide what the honest quantity IS, then measure it

**Ask what the bar actually measures before choosing it** (§0 rule 1). Candidates, in the order they are
worth trying:

- **mean drawn width per `CLS_RIBBON` stretch** — `ribbonizeCore`'s own `CLS_CENTRE`/`CLS_WALLS`/`CLS_RIBBON`
  classes are the natural handle, and `half[i] = penWidth · clamp(wPts[i]) / 2` (`surface-fill.js:6968`) is
  where width is actually decided;
- **filled-vs-centreline stretch ratio** — this is what F1-erode's defect destroyed and what its fix restored;
- **ink per unit arc** — cheapest, but it is the proxy T4b showed can be byte-identical across a real defect.

**Your input data already exists — use it, do not re-derive it:** `F1-amp-impl.md`'s width/ink table and
`F1-amp-review.md` condition 3 carry per-law numbers pre (`6e1ed52f`) and post (`3bc61c32`), and
`F1-erode-plan.md` §7 carries the pre-F1 width distribution (`hiElongMean` up to 1.42, mean ribbon width
−4.3 %, interior fill ink −9.6 %). **Extend to both rigs** — `onePenDown` is **−4.16 % on `addLayer` and
−7.99 % on `create`**, which is the whole reason rig-naming became a standing rule.

### JOB 3 — set a bar ONLY where the populations separate

- **Set it only where pre and post genuinely separate**, with the margin stated on both sides.
- **Mutation-prove it (BLOCKING, §0 rule 1):** a mutation that thins a ribbon must trip it, and a mutation
  that does something else must not.
- ⚠ **If the populations do NOT separate, ship the measurement and say so.** A stop-report is a fine
  outcome here and an honest one; a bar invented to have a bar is worse than no bar.
- ⚠ **Do NOT reuse the `1.2` constant, or any count-ratio bar, below d≈10** — measured small-integer noise
  (d=1 → 1.400, d=2–5 → 1.167, d=6–9 → 1.333, purely from which integer `N` a density rounds to).

### Files ALLOWED / FORBIDDEN

**Allowed:** a new `tests/unit/scene3d-ribbon-width.test.js` (or similar), `tests/helpers/*` for a shared
width-measurement helper, one canonical script under `scripts/audit/`, your report, and
`docs/3d-audit/fill-audit/after/F1-width-bar/`.
**FORBIDDEN: every `src/` file.** This is **tests-only** — if you believe a source change is needed, that is
a stop-and-report, not a scope extension. Also forbidden: any other lane's worktree; push, merge, tag, bump.

### Guards and baseline

Lane baseline at your start is **`scene3d-ribbon-f1b-streaks.test.js` 44/44** and
**`scene3d-ribbon-wall-coverage.test.js` 36/36** (F1-trochoid was closed by F1-amp). **Re-derive both at your
own base sha** — T2 iteration 2 lands before you and may move them; **§0 rule 5 applies either way.** Also
run `scene3d-ribbon-flat-field-placement` (22/22), `scene3d-ribbon-f1-amp` (47/47),
`scene3d-ribbon-erode-refusal` (16/16), `scene3d-mark-laws-draw` (30/30).

### What this unit answers for Jay

**Under §4 decision 10 answer (A)** — accept the thinner even style — **this is the guard that stops the next
unit thinning a ribbon unnoticed**, which is exactly the failure this whole item documents.
**Under answer (B)** — restore the weight — **this is F1-weight's acceptance instrument, and it must exist
before F1-weight can be judged.** **Build it the same way either way; do not wait on the answer.**
