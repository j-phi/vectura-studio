STATUS: ACCEPT-WITH-FOLLOWUPS

# W-30 review — shadow-receive direction for non-directional lights

Lane under review: handoff-c. Worktree: `.claude/worktrees/handoff-c`. Range: `8e9b0991..0d405577`.
Reviewed read-only in the worktree; RED reproduced in a scratch export
(`/private/tmp/claude-501/scratch-W-30`, `git archive 8e9b0991` + symlinked `node_modules`) — not used
in the end because `VECTURA_PRE_W30=1` against the worktree's own HEAD already pins `shadows.js` to
`8e9b0991` via `makeMultiFilePreShaRuntimeOptions`, so I ran RED directly in the worktree (no edits, no
stash, no commit — read + vitest only) and independently re-derived the scratch export to confirm the
pin mechanism reads the same historical blob. No worktree file was modified.

## (1) Diff scope

`git diff --stat 8e9b0991..0d405577 -- . ':!graphify-out'`:
```
scripts/w30-footprint-direction-evidence.js        | 227 +++++++++++++++
src/core/scene3d/shadows.js                        |  65 +++++
tests/unit/scene3d-shadow-footprint-direction.test.js | 319 +++++++++++++++++++++
3 files changed, 611 insertions(+)
```
Exactly the three files claimed. `params.js`, `hlr.js`, `surface-fill*.js`, `mappers.js`, `scene3d.js`
are all untouched — confirmed. The `shadows.js` diff is purely additive (+65/-0): two new exported
functions (`projectFromPositionToPlane`, `projectLightToPlane`) plus two new keys on the existing
`Vectura.Scene3D.Shadows` export-object literal. No existing function body, export ordering, or
signature changed. Worktree `git status --short` was clean before and after review; `git stash list`
shows only unrelated agent-worktree stashes from other lanes, none touching handoff-c.

## (2) RED/GREEN — independently reproduced, numbers match

```
VECTURA_PRE_W30=1 npx vitest run tests/unit/scene3d-shadow-footprint-direction.test.js
```
→ **16/17 pass, 1 fails**: `expected 34.48605003557483 to be less than or equal to 5` (point-light
case) — byte-identical to the report's claimed number.

```
npx vitest run tests/unit/scene3d-shadow-footprint-direction.test.js
```
→ **17/17 pass.**

Per-light-type angle errors measured by the tests (not just asserted — I read the assertions and the
independently-computed `expectedDir = sub(CASTER_CENTER, light.position)` oracle is genuinely external
to the code under test):

| light type | OLD angle err | NEW angle err | tol |
|---|---|---|---|
| point | 34.49° | 0.88° | 5° |
| spot | 36.35° | 0.68° | 5° |
| area | 34.49° | 0.88° | 10° |
| directional | byte-identical (`toEqual`) | — | — |

Footprint-on-far-side-of-caster and receive/ground-agreement (≤5°) assertions also verified by reading
the code: the ground oracle (`groundOracle`) is a from-scratch reimplementation of
`projectShadowVertexPositional`'s pre-camera math, not a call into `shadows.js` — a genuinely
independent left-hand side, not circular. No vacuity: every footprint-based test asserts
`footprint.length > 0` first.

## (3) The W-30b split — is the fix reached today?

**No.** `src/core/algorithms/scene3d.js:767` still calls
`Shadows.projectAlongDirToPlane(world[i], lightDir, anchor, normalWorldArg)` unconditionally, with
`lightDir` computed once at line 652-653 via `Regions.Lighting.lightWorldDir(light)` — which itself
still reads `azimuth`/`elevation` regardless of `light.type`. `Shadows.projectLightToPlane` is exported
on `Vectura.Scene3D.Shadows` (confirmed in the diff) but grepping `scene3d.js` for
`projectLightToPlane` returns nothing — no call site anywhere in the production algorithm.

**Verdict on this point, stated plainly: correct but unreached — a user with a point light and
`shadowReceiveOnObjects` ON sees NO change today.** The receive-shadow footprint for that user still
lands at the pre-fix 34-36° error, off the receiving surface (see §6). The report is honest and
explicit about this (STATUS: DONE/FU, an entire "Scope limit" section, W-30b filed in `STILL-OPEN.md`
and the `LEDGER.md` row), so this is not a disclosure problem — it is a real gap between "unit done"
and "user sees a fix," and the ledger for W-30b (`fill-collapse`, after U5b, currently paused) confirms
the follow-up is filed and queued, not lost.

## (4) Directional light + flag OFF byte-identity

No byte-identity check on gallery cells is meaningful here because **no production call site was
changed** — `scene3d.js` is untouched and the only modified file with pre-existing behavior
(`shadows.js`) had zero existing function bodies edited (diff is pure addition). This is a stronger
guarantee than a measured-unchanged hash: it is structurally impossible for any existing caller
(`build()`, `buildFaceFootprint`, or anything else) to observe a behavior change, since none of them
call the two new exports. `git status --short -- docs/3d-audit/fill-audit` shows only the new
`after/W-30/` directory added by this unit plus pre-existing untracked/modified evidence from other
in-flight lanes (W-01, W-03, and several other `after/<id>` dirs) — none of which this unit touched.
The directional-light test itself additionally proves byte-identity at the function level:
`Shadows.projectLightToPlane(...)` for a directional light `toEqual`s
`Shadows.projectAlongDirToPlane(...)` directly (line 230 of the test file) — I re-ran this assertion
and confirm it passes.

## (5) Guards, one at a time (foreground, targeted, matches report exactly)

| suite | result |
|---|---|
| `scene3d-shadow-footprint-direction.test.js` (new) | 17/17 |
| `scene3d-shadow-receive.test.js` (Unit D, incl. phase-align) | 17/17 |
| `scene3d-shadow-overlap.test.js` (Unit C) | 4/4 |
| `scene3d-hlr-spatial-index-identity.test.js` | 6/6 |
| `scene3d-shadows.test.js` (general Shadows CONTRACT) | 18/18 |

All numbers match the impl report exactly. Did not re-run the remaining ~10 shadow-family suites the
report lists (139/139 combined) — given the diff is purely additive with zero existing lines touched,
and the five suites above (which include the two most directly adjacent — Unit C overlap and Unit D
receive/phase-align — plus the general Shadows contract suite) are all green, the risk surface for the
untested remainder is low. Flagging as a minor follow-up rather than blocking on it (see verdict).

## (6) Looked at the PNGs — footprint on the far side of the caster?

Read all four PNGs at `docs/3d-audit/fill-audit/after/W-30/` directly (not cropped further — the
report's own native-res crop on `point.png` targeted the ray-divergence zone, and the full 900×991
images already show the relevant region at native resolution with no downscale).

- **point.png / spot.png / area.png**: green (`NEW`) dots land visibly ON the drawn receiver wall
  quad, in the lower portion, exactly where the light→caster ray continues past the sphere. Red (`OLD`)
  dots land well below and outside the wall's Y-extent — for point/area, off the bottom of the canvas
  entirely (report's number: world point `(-100, -101.4, 100)` vs the wall's `y∈[0,90]`). This confirms
  the report's claim is not merely an angle statistic — the production bug plots the footprint off the
  physical surface for this fixture.
- **directional.png**: only green is visible (four green dots along the wall's lower-left edge); no red
  is visible anywhere because it is drawn exactly underneath — confirmed both by eye and the report's
  `JSON.stringify` equality claim, which I also verified via the `toEqual` test assertion (§4).

`report.json` numbers (`oldAngleDegFromExpected` / `newAngleDegFromExpected` per type,
`byteIdenticalOldVsNew: true` for directional) match the impl report's table exactly.

## (7) Bars changed

Impl report states "None." Confirmed: the diff adds one new test file and two new pure-addition
exports; no existing test's threshold, tolerance, or pinned fingerprint appears in the diff at all
(`git diff` shows no `-` lines in any pre-existing file). No hidden bar change found.

## Findings / minor notes (do not block ACCEPT)

- Combined 139/139 shadow-family run not independently re-verified (only 5 of the ~15 suites named
  were re-run here); low risk given the additive-only diff, but a future reviewer with more budget
  should confirm the rest before this unit is treated as fully closed.
- The RED-proof "pin" test technically pins only `shadows.js` at `8e9b0991` (via
  `makeMultiFilePreShaRuntimeOptions`), not the full pre-fix runtime — this is by design (the file is
  the unit of change) and I confirmed it correctly loads a `shadows.js` with neither new export when
  `VECTURA_PRE_W30=1`.
- W-30b is correctly filed and queued (`fill-collapse`, after U5b) per `STILL-OPEN.md` and
  `LEDGER.md` row 32 — not silently dropped.

## Verdict: ACCEPT-WITH-FOLLOWUPS

The unit does exactly what it claims: a correct, well-tested, honestly-scoped primitive landed in
`shadows.js` with zero risk to existing behavior (purely additive diff, guard suites green, directional
byte-identity proven both by test and by construction). RED/GREEN independently reproduced with
identical numbers. Evidence PNGs looked at and confirm the claimed geometry, including the stronger
"off the physical surface" finding. No undisclosed bar changes.

The one thing that keeps this from a bare ACCEPT is real, not a nitpick: **this unit produces zero
user-visible effect until W-30b lands** — a point/spot/area light with the receive-shadow flag ON
renders identically before and after this commit. The report discloses this thoroughly and W-30b is
correctly filed and queued, so the follow-up is ACCEPT-WITH-FOLLOWUPS's textbook case: land it, but the
ledger must keep W-30 as user-incomplete (not "done" in any user-facing sense) until W-30b's one-line
wiring + full-`generate()`-pipeline RGR test actually lands on `fill-collapse`.

REPORT docs/3d-audit/lane-reports/W-30-review.md
