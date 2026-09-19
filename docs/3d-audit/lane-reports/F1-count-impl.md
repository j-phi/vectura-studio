STATUS: DONE

# F1-count — implementer report (lane fill-audit-a4)

**Lane:** fill-audit-a4. **Worktree:** `/Users/jayphi/Documents/github/vectura-studio/.claude/worktrees/fill-audit-a4`.
**Base sha → new sha:** `a5d8a1be` → `7ef20455`. **Port:** 8475 (not started — this unit is a pure
stats/observability change with no UI surface; verification is vitest + a scratch-export/mutation proof, per
the round-4 process regime for tests-only-shaped units).

## Files touched

- `src/core/scene3d/surface-fill.js` — `ribbonize()`'s fill-depth refusal path only (39 insertions, 1 line
  changed into a 9-line block). No other function touched.
- `tests/unit/scene3d-ribbon-fill-depth-count.test.js` — new, 12 tests.

`git show --stat HEAD` confirms exactly these two files, 255 insertions(+), 1 deletion(-).

## The gap (LEDGER row 2d/6, F1-erode-plan.md §1)

`ribbonize()` erodes a clipped ribbon region twice per stretch: once (shallow, `penWidth/2`) for the
OUTLINE, once again (deeper, chained off the outline, `penWidth * (0.5 - RIBBON_OVERLAP)` = `penWidth *
0.35`) for the FILL. `erodeEmpty` only fires when `any` — "outline shipped OR fill shipped" — is false. A
stretch whose OUTLINE succeeds and whose FILL then comes back empty leaves `any === true`, so `erodeEmpty`
never fires, even when the deeper `insetMultiPolygon` call swallowed a `FillBoolean` failure exactly like
the one F1-erode's retry ladder (`geometry-utils.js:1298-1329`) fixed. F1-erode's own planner/implementer
measured this by instrumenting `GeometryUtils.insetMultiPolygon` from OUTSIDE the shipped tree (no counter
existed at the time): pre-F1-erode, 6 swallowed-and-empty `insetMultiPolygon` calls total on an 8-mapper ×
torus sweep, of which only 2 surfaced as `erodeEmpty`/`degenerate` (both cases where the OUTLINE itself was
also empty: `hatch/interlockWeave`, `crosshatch/interlockWeave`). The other 4 were invisible: `contour/
trochoidLoop` ×1, `contour/weaveDepth` ×2, `crosshatch/weaveDepth` ×1 — LEDGER's own words: "the fix landed;
the blindness did not."

## The fix

`src/core/scene3d/surface-fill.js`:

1. `ribbonStat` object literal — added `fillEmpty: 0` next to `erodeEmpty`, with a comment explaining the
   mechanism, the deliberate non-inclusion in `degenerate`, and the honest limit of what it can prove (see
   "What this counter is NOT" below).
2. The fill-depth refusal site (was `if (!fillMP.length) ribbonStat.outlineOnly += 1;`) — now also
   increments `ribbonStat.fillEmpty` inside the same block. **No control flow changed**: the stretch still
   ships its outline exactly as before; only a stats counter is touched.

`fillEmpty` is exposed automatically via the existing `...ribbonStat` spread into `lastRibbonStats`
(`publishRibbonStats`, unedited) — no separate plumbing needed.

### What this counter is NOT

It is **not** literally "routed through `ribbonRefuse(...)`" in the sense of calling that closure — I
deliberately did not, for two provable reasons, both confirmed by running the guards below:

- `ribbonRefuse(why)` also does `outp.push(centrePass(...)); return;` — discarding the outline the stretch
  just shipped and replacing it with a bare centreline. That is an OUTPUT change, forbidden by this unit's
  scope ("GREEN must be byte-identical in OUTPUT"). Calling it here would have changed geometry, not just
  observability.
- `ribbonRefuse(why)` also does `ribbonStat.degenerate += 1`. `scene3d-ribbon-degeneration-counter.test.js`
  pins the structural invariant `degenerate === noRing + clipEmpty + erodeEmpty` as a REGRESSION LOCK
  (verified: still 5/5 green after my change). Adding `fillEmpty` to `degenerate` would break that pinned
  guard.

So `fillEmpty` lives in the *same family* as `erodeEmpty`/`clipEmpty`/`degenerate` (same object, same
`stats` surface, immediately adjacent) without being folded into either the refusal control-flow or the
`degenerate` total — the only way to satisfy "observability only, byte-identical output" and "don't break
the pinned invariant" simultaneously.

It is also **not** proof, per-increment, that a `FillBoolean` failure was specifically swallowed. That
signal (`FillBoolean.consumeLastOpError()`) is consumed and cleared *inside* `insetMultiPolygon` itself
before it ever returns — by design, post-F1-erode, so no caller leaks a stale error to the next, unrelated
erosion (`geometry-utils.js:1329`, "do not leak a pending error to the next caller"). `geometry-utils.js` is
outside this unit's file grant and was not touched. `fillEmpty` fires on the exact same trigger condition as
the pre-existing `outlineOnly` bucket (`outlineMP.length && !fillMP.length`) — a superset that also includes
genuinely-too-narrow-for-a-second-erosion stretches, which are normal and not bugs. What it buys is that a
FUTURE spike in this event class shows up in `stats`, next to the refusal family, instead of blending
silently into `outlineOnly`'s ordinary ribbon bookkeeping — which is exactly how these 4 events stayed
invisible the first time.

## RED → GREEN proof

### 1. Structural RED (scratch `git archive a5d8a1be`, per AGENT-PROTOCOL "RED comes from a scratch export")

`/private/tmp/claude-501/scratch-F1count/red-a5d8a1be` — unpatched `a5d8a1be` + the new test file copied in
(node_modules symlinked from MAIN, not the worktree's near-empty one). **12/12 failed**, every failure
`fillEmpty=undefined: expected undefined to be +0` (or `Number.isFinite(undefined)` false) — the field does
not exist pre-patch.

### 2. GREEN — the same 12 tests on the patched worktree: 12/12 passed

```
npx vitest run tests/unit/scene3d-ribbon-fill-depth-count.test.js
Test Files  1 passed (1)
     Tests  12 passed (12)
```
(One benign `[vitest-worker]: Timeout calling "onTaskUpdate"` reporter-RPC warning at the end, exit 0 —
same pre-existing harness noise class F1-erode-impl.md's guard run already logged for
`scene3d-ribbon-primitives.test.js`, unrelated to test outcomes.)

### 3. Historical RED — scratch `git archive 7f805654` (pre-F1-erode, lane fill-audit-a3), patched with this
same counter (surface-fill.js only — the geometry-utils.js ladder fix does NOT exist on this tree, matching
the state F1-erode-plan.md measured)

`/private/tmp/claude-501/scratch-F1count/red-pre-7f805654`. A probe test (`tests/unit/_f1count_probe.test.js`,
not committed — removed after the run, per protocol: reports/evidence go to MAIN, probes never live in a
worktree or ship in the source tree) built the same 5 cells via `engine.addLayer('scene3d')`, torus, default
density/pen/camera, and printed `lastRibbonStats`:

| cell | fillEmpty | erodeEmpty | degenerate |
|---|---|---|---|
| hatch/interlockWeave | 1 | 1 | 1 |
| crosshatch/interlockWeave | 1 | 1 | 1 |
| **contour/trochoidLoop** | **1** | 0 | 0 |
| **contour/weaveDepth** | **2** | 0 | 0 |
| **crosshatch/weaveDepth** | **1** | 0 | 0 |

The three bolded cells are the "invisible" ones named by F1-erode-impl.md's own instrumentation table.
**Sum = 1 + 2 + 1 = 4 — exactly matching LEDGER row 2d's stated RED: "a correct counter shows 4 pre-fix and
0 post-F1-erode."** Live on `a5d8a1be` (this worktree's own HEAD, post-F1-erode), the same three cells read
`fillEmpty = 0, erodeEmpty = 0` each (test group 2 of the committed suite) — the "0 post-fix" half of the
same prediction, measured live, not archived.

(`hatch/interlockWeave` and `crosshatch/interlockWeave` show `fillEmpty=1` pre-fix too, but that is the
SAME event `erodeEmpty=1`/`degenerate=1` already counted — the root-cause chain in F1-erode-plan.md §1 has
the swallowed failure at the OUTLINE-depth call for these two, which forces `fillMP` empty via the
`fillMP = outlineMP.length ? erode(...) : []` ternary — not an independent fill-depth event. Post-fix, live
on this tree, these two cells' `fillEmpty` measures 3 and 4 respectively — ordinary, benign `outlineOnly`
narrow-ribbon stretches unrelated to any swallowed failure, elsewhere in the same 40/74-wide render. I
initially wrote (and then corrected before committing) a test asserting `fillEmpty === 0` for these two —
false; removed, replaced with an `erodeEmpty === 0` assertion only, which is the actually-proven claim for
these two cells.)

## Mutation proof (which half this gates)

**States the half:** `fillEmpty` gates **observability of silent ink loss at the fill depth** — not
geometry. It cannot prove causation (swallowed vs. genuinely narrow); it proves the counter fires on the
class of event the LEDGER named.

**The mutant:** in the committed test file's group 3, monkey-patched `GeometryUtils.insetMultiPolygon` to
force the FIRST call whose inset magnitude matches the fill depth (`penWidth * 0.35` = 0.105 mm for the
default 0.30 mm pen — provably distinct from the outline depth, `penWidth * 0.5` = 0.15 mm, so the mutant
targets the fill call specifically) to return `[]` instead of its real (non-empty) result, on
`contour/weaveDepth`/torus. Result: `fillEmpty` incremented (>0) and, in the same run, `erodeEmpty` stayed
at 0 — directly demonstrating the blind spot `erodeEmpty` cannot see is exactly what `fillEmpty` catches.
Confirmed `calls > 0` and `forced === true` (the fixture still has a call at that exact inset magnitude, so
the mutant did not silently no-op).

## GREEN output — byte-identical, md5 sweep on both rigs

Per scope: "GREEN must be byte-identical in OUTPUT: md5 of every emitted path set across the ribbon-law
roster on both rigs." Wrote `/private/tmp/claude-501/scratch-F1count/md5sweep.js`: for each of
`{interlockWeave, onePenDown, trochoidLoop, ampSpacing, weaveDepth}` × `{hatch, contour, crosshatch}` on
torus, built the scene under BOTH rigs — **addLayer** (`engine.addLayer('scene3d')`, matching every RGR test
in this lane) and **create** (deserialization defaults `P.PRIMITIVE_PARAM_DEFAULTS.torus` merged with
creation defaults `P.PRIMITIVE_CREATE_DEFAULTS.torus`, replicating `scripts/audit/scene3d-capture.js`'s
`else` branch inline in jsdom, since the gallery capture script itself needs a live browser page) —
computed md5(kind + 6dp x,y,z for every point of every emitted `scenePath`), ran once against the unpatched
scratch export (`red-a5d8a1be`) and once against the patched worktree.

*(MERGE r4 item 30/R4-2 annotation: harness rule C — no ground layer is ever added by this inline
jsdom rig (`q.ground` is never set), so ground-plane ink is N/A here; the deliverable is a whole-scenePath
md5 identity, not an ink total. Fixture: torus, 5 laws × 3 mappers × 2 rigs (addLayer/create), no camera
in the md5 sweep — path coordinates, not a rendered projection.)*

**30/30 cells byte-identical, 0 mismatches.** Coverage as a fraction: 5 laws × 3 mappers × 2 rigs = 30 of
30 attempted cells (100%); the full 8-mapper roster was not swept because `none`/`wireframe`/`spiral`/
`stipple`/`contourSlice` never reach the ribbon/erode code path this unit touches at all (F1-erode-impl.md's
own extended sweep already established this: "zero cells changed across all 37 laws" for those 5 mappers on
torus) — this unit changes zero lines any of them execute, so they were excluded, not skipped for
convenience.

## Guards — every one run individually, foreground, `timeout: 600000`

All green, no bars touched:

| file | result |
|---|---|
| `scene3d-ribbon-erode-refusal.test.js` | 16/16 |
| `scene3d-ribbon-f1b-streaks.test.js` | 44/44 |
| `scene3d-ribbon-wall-coverage.test.js` | 36/36 |
| `scene3d-ribbon-f1-amp.test.js` | 47/47 |
| `scene3d-ribbon-width-bar.test.js` | 10/10 |
| `scene3d-ribbon-width-create-rig.test.js` | 12/12 |
| `scene3d-ribbon-degeneration-counter.test.js` | 5/5 (the `degenerate === noRing+clipEmpty+erodeEmpty` invariant — still holds) |
| `scene3d-ribbon-primitives.test.js` | 14/14 |

No vitest file exceeded 600 s this run; none needed `singleFork`. No `run_in_background`/Monitor was used for
any vitest run — the two long-running node `md5sweep.js` scripts (not vitest) auto-backgrounded past the
Bash tool's 120 s default on this shared machine; per the tool's own notification behaviour I let them
finish and read the completion results rather than polling in a sleep loop, consistent with
ROUND3-RESUME-BRIEFS §0b's tool-ceiling amendment for `scene3d-tone-law-collapse.test.js` (same underlying
cause: heavy jsdom+geometry work on a shared box).

## Bars changed

**None.** `fillEmpty` is a brand-new field with no prior bar, tolerance, or fingerprint. No existing
threshold in any test file was moved, up or down. No population or fixture an existing assertion measures
over was changed — the two flawed test assertions I wrote and then corrected before committing
(`fillEmpty === 0` for `hatch/interlockWeave` and `crosshatch/interlockWeave`) never reached a committed
state; the committed file only asserts what is proven above.

## Live app verification

**NOT visually verified in the running app** — this is a pure stats/instrumentation change with no UI
surface, no new rendered geometry, and no user-visible behavior (proven byte-identical above). Dev server
was not started for this unit; verification is the vitest RED/GREEN + scratch-export historical RED +
mutation proof + md5 output-identity sweep documented above, which is the applicable evidence class for an
observability-only change with nothing to screenshot.

## Commit

`7ef20455` in the worktree (base `a5d8a1be`), explicit `git add` of the two touched files only. Never
pushed.
