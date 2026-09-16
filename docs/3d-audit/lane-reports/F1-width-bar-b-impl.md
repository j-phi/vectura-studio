STATUS: DONE/FU

# F1-width-bar-b — sizing the `create`-rig ribbon-width gap (TESTS ONLY)

Lane: fill-audit-a3. Worktree: `/Users/jayphi/Documents/github/vectura-studio/.claude/worktrees/fill-audit-a3`.
Branch: `3d-scene/fill-audit-a3`. Base sha: `81925ee8` (T2-3).

**Resume note (2026-09-15).** The original attempt was killed by the weekly rate limit on 2026-09-13. The
orchestrator checkpointed the three untracked files as WIP commit `7d015e94` (unverified). This session:
(1) verified the checkpoint's test file green (12/12, unchanged from the pre-kill run), (2) per the
coordinator's resume note, **deleted `scripts/audit/scene3d-ribbon-width-create-rig-identity.js`** — it was
a one-off identity-proof PROBE, never required by the committed test, and `scripts/audit/` is shared with
MAIN-owned tooling — and folded its findings into this report instead (methodology below, not a second
script), (3) updated the test file's header comment to point at this report rather than the deleted script,
(4) re-ran the create-rig test file (still 12/12) and every baseline guard named in the brief, (5) writes this
report and makes a **NEW commit** on top of `7d015e94` (never an amend, per the resume instruction).

## Files touched (tests-only; no `src/` file touched)

- `tests/helpers/scene3d-ribbon-width-create-rig.js` — new. The `create`-rig fixture builder + measurer,
  reproducing MAIN's `scripts/audit/scene3d-capture.js` `buildAndMeasure()` `else` branch (`--rig create` /
  default, GH-2 `6ffaf9c6`) verbatim inside the existing jsdom harness.
- `tests/unit/scene3d-ribbon-width-create-rig.test.js` — new. The measurement + (partial) floor oracle: 12
  tests.
- `scripts/audit/scene3d-ribbon-width-create-rig-identity.js` — **written, run, then DELETED** per the resume
  instruction (probe only, not required by the test; its findings are reported below instead of kept as a
  second script in a MAIN-shared directory).

## Scope, per the ledger's own wording (row 2b-1)

"SIZE the `create`-rig width gap, do not assume a bar is needed... report per-law `create`-rig mean
`CLS_RIBBON` width beside the `addLayer` numbers, and propose a floor only if the populations warrant one."
This is a MEASURE-FIRST unit, not an automatic floor-for-every-law unit. Also: "Take `onePenDown` camera 'b'
while you are there IF the machine is genuinely idle... check `uptime` first."

## The construction — reproduced verbatim, not reinvented

Read `scripts/audit/scene3d-capture.js`'s `buildAndMeasure()` on MAIN (GH-2 `6ffaf9c6`, since this worktree's
own committed copy of that script predates GH-2 and has no `--rig` flag at all). The `else` branch (the
`--rig create` / default path) is:

1. `engine.addLayer('scene3d')` for the id only, then strip every child the scaffold ships with.
2. `g.isGroup = true; g.containerRole = 'scene';`
3. `g.params.camera = camera` — a full REPLACE.
4. `g.params.ground = { enabled: false }; g.params.backdrop = { enabled: false };` — both explicit and off.
5. Object bag = `{ ...PRIMITIVE_PARAM_DEFAULTS[primitive], ...PRIMITIVE_CREATE_DEFAULTS[primitive] }`.
6. `q.objects = [OBJ]; q.lights = [SUN];` (inline bag, not a descendant-layer leaf).
7. `q.styleTable` with `fillAngle: 45` (explicit literal), `fillDensity: <density>`, `toneLaw: <law>`.

`tests/helpers/scene3d-ribbon-width-create-rig.js`'s `measureRibbonWidthCreate()` reproduces steps 1-7
exactly (reading `Vectura.Scene3D.Params.PRIMITIVE_PARAM_DEFAULTS`/`PRIMITIVE_CREATE_DEFAULTS`/`DEFAULT_CAMERA`
live, never hand-copied), then applies the IDENTICAL width-measurement method as the addLayer-rig helper
(`RibbonGeometry.buildRibbonMultiPolygon` wrap, `minHalfWidth === penWidth/2` CLS_RIBBON classification,
arc-length-weighted mean width) as its own copy — not a cross-file `require` — per this lane's established
convention.

**Ground-plane ink is structurally excluded, not merely disclosed.** Unlike the addLayer rig (whose own
`measureRibbonWidth()` never touches ground, producing the ~2269mm ground-ink confound
`F1-width-bar-reshoot.md` found), the create rig's own construction sets `ground.enabled = false`
UNCONDITIONALLY — every `totalInkMm` in this file is OBJECT ink only, by construction, verified by a test
that greps the helper source for the literal (`Ground-plane ink exclusion` describe block).

## IDENTITY PROOF — md5 cannot match; geometric equivalence does

Per the brief: "prove identity by md5 of the emitted paths against a capture from MAIN['s script, run against
this worktree's tree] at `81925ee8` for one cell... or explain precisely why md5 cannot match and give a
geometric equivalence instead."

**Method.** A one-off script (written, run, then deleted per the resume note above) reused MAIN's own
`ensureServer`/`openPage`/`getConstants` (from `scripts/audit/scene3d-capture.js`, required by absolute path,
never edited) to drive a REAL headless Chromium page against THIS worktree's tree (`--root
.claude/worktrees/fill-audit-a3`, `81925ee8`), built the object EXACTLY as `buildAndMeasure()`'s `else` branch
does (copied verbatim into the `page.evaluate` body — not reinvented), and extracted `g.scenePaths`. The SAME
cell was built via `measureRibbonWidthCreate()` in the SAME node process (jsdom). Both were canonically
serialized (9-decimal rounding, point + `meta.kind`/`weightScale`) and md5'd; a second, unrounded point-by-point
`max(|dx|,|dy|)` diff was also computed.

**Result, all four laws, torus/hatch/d=50/camera-a:**

| law | browser paths | jsdom paths | md5 match | max coord delta (mm) |
|---|---|---|---|---|
| interlockWeave | 282 | 282 | NO | 5.115907697472721e-13 |
| trochoidLoop | 278 | 278 | NO | 8.526512829121202e-14 |
| onePenDown | 138 | 138 | NO | 2.842170943040401e-14 |
| amplitudeOnly | 229 | 229 | NO | 2.2737367544323206e-13 |

**Why md5 cannot match, precisely (not "explained away"):** path/point COUNTS are identical on every law —
zero structural divergence. The md5 mismatch is caused entirely by cross-engine float64 last-ULP noise:
jsdom's `vm`-hosted V8 and a full headless Chromium's independent V8 instance compute the same transcendental
math (sin/cos/atan2/sqrt, throughout the torus/HLR/fill-lattice pipeline) to slightly different last-bit
roundings. Any single 1-ULP difference anywhere across ~280 paths' worth of coordinates changes the hash.
This is NOT a canvas/DOM-dependent code path masquerading as a real divergence: `grep` confirms
`src/core/scene3d/*.js` never calls `getImageData` (the one canvas method `tests/helpers/load-vectura-
runtime.js`'s stub fakes), so the jsdom canvas stub cannot be the source of a REAL geometric difference here
even in principle.

**Geometric equivalence, proven, not asserted:** the max per-coordinate delta across all four laws is
2.84e-14mm to 5.12e-13mm — 12 to 13 orders of magnitude below the 0.3mm pen width this entire file measures
in, and below any precision this unit (or any sibling unit in this lane) reports a number to. The jsdom
`create`-rig construction and a real-browser render of the identical construction are the same geometry to
every digit that matters.

## MEASURED — create rig, both cameras, torus/hatch/d=50/fillAngle-45, `81925ee8`

| law | camA width mm (pen) | camA ribbonCount | camB width mm (pen) | camB ribbonCount | addLayer camA width (F1-width-bar's own number, for comparison only) |
|---|---|---|---|---|---|
| interlockWeave | 0.98298 (3.2766) | 45 | 0.98121 (3.2707) | 41 | 0.9832 |
| trochoidLoop | 0.93154 (3.1051) | 40 | 0.85254 (2.8418) | 63 | 0.9377 |
| onePenDown | 0.92022 (3.0674) | 4 | 0.91425 (3.0475) | 6 | 0.8801 |
| amplitudeOnly | n/a | 0 | — | — | n/a (0) |

Total ink (object-only, ground off) camera a: interlockWeave 1987.700mm (fill 1755.252), trochoidLoop
2192.595mm (fill 1960.146), onePenDown 2084.539mm (fill 1852.090), amplitudeOnly 1008.181mm (fill 775.733).

**Repeat-run determinism confirmed exact**: three fresh `loadVecturaRuntime` loads of the identical tree gave
`interlockWeave` camera-a the identical figure (`0.9829752499340432`) to the last printed digit — no floor
slack needed for run-to-run noise on this rig either.

**`onePenDown` camera 'b' — closes the addLayer-rig unit's own open follow-up 4.** Both that unit's
implementer and reviewer attempted this measurement and were beaten by shared-machine load (reviewer watched
load average climb 2.5→5.0). `uptime` was checked first here (~3.5 load average, moderate) and the
measurement completed without incident: **0.91425mm, 6 stretches.** This does not retroactively floor
`onePenDown` on the addLayer rig (out of this unit's scope — that file is closed) but it is now a real,
measured number rather than a gap, on THIS rig.

## Floor decision, per law (measured, not assumed)

**`interlockWeave` and `trochoidLoop`: FLOORED.** Both have a substantial `CLS_RIBBON` population that stays
in the same order of magnitude across both cameras (45→41, 40→63) and a real, characterizable drift envelope
(interlockWeave −0.18%, trochoidLoop −13.1% — trochoidLoop's own already-documented lattice sensitivity,
LEDGER row 2c, reproduced on a second rig now). Floor = 0.85× the lower of the two measured camera widths,
identical convention to the addLayer-rig file:

| law | floor (mm) |
|---|---|
| interlockWeave | 0.83403 (0.9812093786482116 × 0.85) |
| trochoidLoop | 0.72466 (0.852543721783034 × 0.85) |

**`onePenDown`: MEASURED ONLY, NO FLOOR — ship the measurement, per the ledger's own instruction.** Its
`CLS_RIBBON` population on this rig is tiny AND camera-unstable: 4 stretches at camera 'a', 6 at camera 'b' —
a 50% swing in POPULATION SIZE (not just width) between the two angles the gallery itself shoots. A mean over
4-6 stretches is dominated by whichever single stretch is largest; any floor derived from either camera's
reading here would be a coin bar dressed as a regression guard, not a real signal. Per §0 rule 1 ("name the
clause you do not cover") and the ledger's explicit instruction ("propose a floor only if the populations
warrant one"), this law does NOT get a width floor on the create rig. It gets a `ribbonStretchCount` PIN
instead (both cameras, 4 and 6 respectively) so a future change that further destabilises this already-thin
population is at least visible — the same convention `amplitudeOnly`'s own zero-population control already
uses.

**`amplitudeOnly`: EXCLUDED, own zero-population control** — `ribbonStretchCount === 0` on this rig too
(measured, matching the addLayer rig's own finding; unaffected by rig choice).

## Mutation-kill (§0 rule 1, BLOCKING) — the SAME two mutations, on the create rig

Reused the addLayer-rig file's own two needles (own copy in the test file, not a cross-file require):

1. **POSITIVE** (`hw.push(Math.max(half[i], HALF_MIN))` → `* 0.6`): `ribbonStretchCount` UNCHANGED from
   shipped for both floored laws (45 and 40 — no survivor bias, classification ran before the mutated line).
   Width drops interlockWeave 0.983 → 0.590 (30% below its floor) and trochoidLoop 0.932 → 0.559 (23% below
   its floor). Both trip.
2. **NEGATIVE** (F1-amp's own amplitude-floor wiring-revert): `ribbonStretchCount` CHANGES (45→30, 40→36 — a
   real mechanism/classification shift, expected and harmless on its own) but width stays well above each
   floor (interlockWeave 1.096, trochoidLoop 0.961). Neither trips.

Both mutations were verified to run against the actual live source (`patchOne`'s own `count !== 1` guard
would throw on drift — it did not).

## Test file — 12 tests, all passing (17.4s, well under the default timeout; not a slow-list candidate)

- 2× GREEN (interlockWeave, trochoidLoop, camera a — shipped tree clears its own floor)
- 2× GREEN (interlockWeave, trochoidLoop, camera b — same)
- 2× RED/mutation-kill POSITIVE (0.6x thinning trips the floor, `ribbonStretchCount` unchanged)
- 2× NEGATIVE CONTROL (amplitude-floor revert does not trip the floor)
- 2× `onePenDown` population-stability control (camera a = 4, camera b = 6 stretches, measured not assumed)
- 1× `amplitudeOnly` zero-population control
- 1× ground-plane-exclusion structural guard (greps the helper source for `q.ground = { enabled: false }`)

```
npx vitest run tests/unit/scene3d-ribbon-width-create-rig.test.js
✓ 12 tests passed, 17.4s (re-run post-resume: 12/12, 17.1s)
```

## Baselines re-derived on this tree (foreground, one file at a time, per §0b)

| file | result | note |
|---|---|---|
| `scene3d-ribbon-f1b-streaks.test.js` | **44/44** | unchanged |
| `scene3d-ribbon-wall-coverage.test.js` | **36/36** | unchanged |
| `scene3d-ribbon-f1-amp.test.js` | **47/47** | unchanged |
| `scene3d-ribbon-width-bar.test.js` | **10/10** | unchanged (existing addLayer-rig floor untouched) |
| `scene3d-ribbon-width-create-rig.test.js` (this unit, new) | **12/12** | |
| `scene3d-mktick-wedge.test.js` | **44 passed, 2 skipped, 1 file-level failure** | **PRE-EXISTING, see below — not caused by this unit** |

## Pre-existing red (§0 rule 5 — named, test by test, reproduced at BASE sha)

`tests/unit/scene3d-mktick-wedge.test.js`'s own `describe('RED at the pre-fix tree (this file HEAD, i.e.
T2-2-revert `179d9218`/F1-width-bar `42acff7b`...)')` block does `execSync('git show HEAD:src/core/scene3d/
surface-fill.js', ...)` and asserts the result `.toContain("chan: 'count'")` / `.not.toContain("chan: 'len'")`
— i.e. it assumes `HEAD` still points at the commit BEFORE T2-3's own fix landed. Once T2-3's fix and this
very test file landed together in the SAME commit (`81925ee8`), `HEAD` is that commit itself, whose own
`surface-fill.js` already contains `chan: 'len'` — the assertion at line 280 (`.not.toContain("chan:
'len'")`) fails immediately in the shared `beforeAll`, which skips the block's two tests:

- `lenByThird/cntByThird/tickField do not exist pre-fix (the mechanism this unit adds is entirely new)`
- `O5 (R1) is unmeasurable pre-fix, which is itself the RED: length never carried tone at all (fixed L0*R design)`

**Reproduced at BASE sha, not argued:** a clean `git clone --no-hardlinks` of this worktree, checked out to
`81925ee8` itself (T2-3's own landing commit, before this unit's WIP or commit existed), run standalone —
**identical result: 44 passed, 2 skipped, 1 file-level failure, same line, same message.** This is
definitively inherited from T2-3's own commit, not caused or worsened by this unit — my checkpoint commit
`7d015e94` and this unit's own commit touch zero lines of `src/core/scene3d/surface-fill.js` (`git diff
--stat 81925ee8 HEAD -- src/core/scene3d/surface-fill.js` is empty), so `git show HEAD:<path>` returns
byte-identical content whether `HEAD` is `81925ee8` or this unit's own commit. This is the same class of
`git show HEAD:` fragility already flagged once in this round (W-38) — a "pre-fix via HEAD" oracle stops
being able to see its own pre-fix state the moment the fix lands, because HEAD moves. **Filed for whoever
owns `scene3d-mktick-wedge.test.js` (T2-3) to fix by pinning an explicit pre-fix sha instead of `HEAD`; not
this unit's file to touch (out of the F1-width-bar-b grant, and not part of the ribbon-width-per-law scope).**
Not blocking this unit: the baseline is UNCHANGED from the base sha, which is all this unit's own checklist
requires.

## `## Bars changed`

**ADDED only** — two NEW floors, no pre-existing bar touched:

- `tests/unit/scene3d-ribbon-width-create-rig.test.js` (`WIDTH_FLOOR_MM.interlockWeave`) — NEW —
  `0.83403mm` (0.85× the lower of camera a/b measured create-rig width, 0.9812093786482116mm) — why: floors
  the mean `CLS_RIBBON` width on the `create` rig so a future change cannot thin this law's ribbons further
  on the rig the gallery actually renders, unnoticed.
- `tests/unit/scene3d-ribbon-width-create-rig.test.js` (`WIDTH_FLOOR_MM.trochoidLoop`) — NEW — `0.72466mm`
  (0.85× the lower of camera a/b measured create-rig width, 0.852543721783034mm) — same reason.

No existing test file, tolerance, count bar, fingerprint, or POPULATION was changed, widened, narrowed, or
re-pinned. `onePenDown` and `amplitudeOnly` deliberately do NOT get a width floor on this rig (see Floor
decision above) — this is a scoping choice disclosed above, not a bar change (no bar existed for either on
this rig before this unit).

## Open follow-ups

1. `onePenDown` has no width floor on the `create` rig — its population (4-6 `CLS_RIBBON` stretches) is too
   small and camera-unstable to floor honestly. A future unit could revisit this if the underlying mechanism
   ever produces a larger, more stable population on this fixture (out of this unit's scope to force).
2. `tests/unit/scene3d-mktick-wedge.test.js`'s "RED at the pre-fix tree" describe block is structurally
   broken by its own `git show HEAD:` construction now that its fix has landed — filed above, not fixed here
   (belongs to T2-3's scope, not this unit's file grant).
3. The identity-proof script was written, run, and then deleted per the resume instruction (`scripts/audit/`
   being MAIN-shared). If a future unit needs to re-verify create-rig/browser identity, the method is fully
   described above (reuse `scene3d-capture.js`'s exported `ensureServer`/`openPage`/`getConstants`, build the
   scene via the verbatim `else`-branch code in a `page.evaluate`, diff `g.scenePaths` against
   `measureRibbonWidthCreate`'s own output) — reproducible from this report without needing the deleted file.

## Machine-load note

`uptime` load average was ~3.5 for the bulk of the original (pre-kill) session and comparable at resume; no
measurement in this report was abandoned for load reasons — `onePenDown` camera 'b' (the ledger's own "take
it if idle" ask) completed without issue on both attempts.
