STATUS: ACCEPT-WITH-FOLLOWUPS

# U5b review — folded fill-law caveats restored in the picker

**Reviewer scope:** adversarial review of unit U5b, lane `fill-collapse-2`
(`.claude/worktrees/fill-collapse-2`, branch `3d-scene/fill-collapse-2`), pinned range
`47a5a755..49475ccd`. Read-only in the worktree throughout; all reproduction done in
scratch exports (`/private/tmp/claude-501/scratch-U5b-pre`, `-post`, both deleted at the
end of this review).

Read first, per protocol: `AGENT-PROTOCOL.md` §Reviewers, `U5b-impl.md`, `after/U5b/*`,
the standing ruling ("Folding a law must NOT hide its measured caveat", LEDGER.md line
610-612), the `U5b` row (LEDGER.md line 53), the `U1-U5` chain report/review, and
`ROUND2-BRIEFS.md` §"Lane fill-collapse-2 — first unit U5b" (lines 41-63).

## Verdict summary

The fix is correct, complete, minimal, RGR-proven, and renders nothing differently. One
real structural gap (no automated cross-check between the new `effectiveLaw` and the
existing `Params.resolveToneLaw`) and one real product-copy gap (the caveat strings are
audit prose, not user-facing text) keep this at ACCEPT-WITH-FOLLOWUPS rather than a clean
ACCEPT. Neither blocks merge — both are independently verified non-issues **today** (I
proved the two resolvers agree on every input I could construct, and the wording issue is
additive polish on top of a fix whose whole point was "show the warning at all").

## Condition-by-condition, with exact numbers measured

### 1. RED — new tests fail at 47a5a755, pass at 49475ccd

Reproduced in scratch exports (`git archive 47a5a755` / `49475ccd`, `node_modules`
symlinked from the worktree), never by stashing/editing the worktree.

- Copied the post-sha versions of the two touched test files
  (`tests/unit/scene3d-tone-law-collapse.test.js`,
  `tests/integration/scene3d-fill-style-picker.test.js`) into the **pre**-sha scratch tree
  (the only way to run "new tests against old code" — they don't exist at 47a5a755
  otherwise) and ran `-t "U5b"`:
  - `scene3d-tone-law-collapse.test.js`: **2 failed** / 54 skipped — `expected 'undefined'
    to be 'function'` and `FS.effectiveLaw is not a function`.
  - `scene3d-fill-style-picker.test.js`: **4 failed** / 140 skipped — all four
    `expected null to be truthy` (`.vs3-lawnote.is-caveat` / `.ctxbar-fly-note.is-caveat`
    absent).
  - Matches the implementer's report exactly (2 unit + 4 integration = 6 new tests).
- At **49475ccd** (real worktree files, no copy trick needed), full-file runs:
  - `scene3d-tone-law-collapse.test.js`: **56/56 passed** (1 vitest-worker
    `onTaskUpdate` RPC timeout warning, exit code 0, 483.57s wall — same benign warning
    class the implementer flagged, confirmed independently, not a real failure).
  - `scene3d-fill-style-picker.test.js`: **144/144 passed** (22.14s wall).
  - Both counts match the implementer's report verbatim.

RED confirmed for the right reason at this step; see condition 2 for proof it is not the
TypeError-as-RED trap the orchestrator asked me to rule out.

### 2. Mutation — removing the caveat wiring re-fails the tests (no vacuous pass)

Patched **only** `SCENE_FILL_STYLES.effectiveLaw` in the post-sha scratch tree to a
present-but-wrong stub (`return survivorId;` immediately, function exists, does nothing) —
i.e. exactly the shape of bug the "TypeError-as-RED trap" flag was worried about (a test
that only proves a symbol exists, not that the right law is picked).

- Unit file, `-t "U5b"`: both tests now fail on **real assertions**, not TypeErrors:
  `expected 'bundleCount' to be 'bundleDither'` and `expected 'contFieldSigmoid' to be
  'contFieldTouch'`.
- Integration file, `-t "U5b"`: all 4 fail again with the identical `expected null to be
  truthy` the RED run produced (caveat element absent in the DOM).
- Reverted the mutation before moving on (diffed back to the original file; confirmed
  clean).

This proves the 6 new tests exercise the actual behavior (which internal law id the
caveat is read off), not merely "does `effectiveLaw` exist" — the RED-at-pre failure being
a TypeError is simply because nothing existed yet at 47a5a755, not because the tests are
shallow.

### 3. Completeness — every folded law with a measured caveat now surfaces it, both surfaces

Loaded the worktree's built `src/config/scene3d-tone-laws.js` directly (not the report's
claim) and read `BY_ID[id].caveat` for all 18 ids folded across U1-U5
(`fineLadder, phaseFineLadder, perceptualRamp, whiteBand, nibAngle, weightSmoothstep,
bundleEased, bundleDither, bundleHandoff, contFieldFore, contFieldSurface, contFieldQuant,
contFieldTouch`): **only `bundleDither` and `contFieldTouch` carry a non-null caveat** —
every other folded id's `caveat` is `null`. So the two laws the implementer named are the
complete set for U1-U5; there is no folded law with a caveat still hidden today.

More important: `SCENE_FILL_STYLES.effectiveLaw` is **not** hardcoded to those two ids —
it walks `STYLE_PARAMS[survivorId]` generically for any survivor, so it automatically
covers whatever U6 (`penStipple`) folds later, per the ruling's explicit "the same rule
binds U6" clause. I verified both call sites (`scene3d-panel.js:707`,
`context-bar.js:1604`) read the caveat off `effectiveLaw(law, <live params bag>)` and nothing
narrower.

### 4. No rendering change — `SF.buildObject` byte-identical

This unit's diff touches only `src/config/context-bar.js`, `src/ui/panels/scene3d-panel.js`,
`src/ui/shell/context-bar.js`, and the two test files — confirmed via
`git diff --stat 47a5a755..49475ccd` (14 files, all doc/evidence/test/UI-config, zero
`surface-fill*.js`/`mappers.js`/`hlr.js`/`shadows.js`/`scene3d.js` touched). Also confirmed
by direct code inspection that `SCENE_FILL_STYLES.note`/`.effectiveLaw` are referenced only
in comments (not calls) inside `scene3d.js`/`params.js`/`shadows.js` — there is no code path
from this fix into the render pipeline.

Measured directly anyway, per the brief: ran a probe against `SF.buildObject` (same
`captureOpts('hatch')` harness the existing collapse suite uses — sphere, orthographic
camera, `styleTable.scene.mapper = 'hatch'`) for 7 laws, md5 of `JSON.stringify(result)`,
pre vs post:

| law | pre md5 | post md5 | match |
|---|---|---|---|
| ladder | `527afc02b04aebee9121edbb3b955306` | same | yes |
| bundleCount | `104af6489116ca38e06a7280f8a8b5c3` | same | yes |
| bundleDither | `3a5cf8197385b5cbaa74db9ab671a02a` | same | yes |
| contFieldSigmoid | `6bc7e45575f38780ebc418b171da1201` | same | yes |
| contFieldTouch | `0bae0be8a34d727418cd944aa6fb882f` | same | yes |
| taperedEnds | `366281bb0e25e65a0b2e35d91c4d55bf` | same | yes |
| weightModulated | `81d033832a01204fd4bee97b85c8ef9d` | same | yes |

**7/7 byte-identical, 0 differences.** (A pre-existing, unrelated `[FillBoolean] polygon
union failed on degenerate geometry` stderr warning fires identically on both sides —
noise, not a regression.)

### 5. `## Bars changed` — honest

`git diff 47a5a755..49475ccd -- tests/unit/scene3d-tone-law-collapse.test.js
tests/integration/scene3d-fill-style-picker.test.js` has **0 removed content lines** (the
only two `-` lines are the `---` diff headers) — the test diff is purely additive. No
numeric threshold, tolerance, count bar, or pinned fingerprint changed anywhere in the
commit. "Bars changed: None" is accurate.

### 6. PNGs — looked at them myself

Read all 4 non-baseline images plus both baselines (native-res crops and full-app
screenshots) directly from
`.claude/worktrees/fill-collapse-2/docs/3d-audit/fill-audit/after/U5b/`:

- `bundleCount-baseline-no-caveat.png` / `contFieldSigmoid-baseline-no-caveat.png`: real
  app, Object 3D leaf, Style tab, survivor law selected, sub-control at default — **no**
  red caveat paragraph present in either. Confirmed.
- `bundleDither-crop-native.png`: "Fill Style" reads "Bundle · Count" (survivor label,
  correct — the (i) popover stays on the survivor), "Bundle mo…" reads "Dithered", and a
  red caveat paragraph directly below reads bundleDither's exact roster caveat text
  verbatim, matching `raw-capture-results.json`'s captured `textContent` and
  `BY_ID.bundleDither.caveat` exactly.
- `contFieldTouch-crop-native.png`: "Field metric" = "Screen metric" (unchanged default),
  "Field floor" = "Ink-width floor", red caveat paragraph below reads contFieldTouch's
  exact roster caveat verbatim.
- Both full-app screenshots show a real sphere object, real docked panel, real Fill Style
  select populated with survivor labels ("Bundle · Count", "Continuous Field · Sigmoid") —
  this is the real running app, not a synthetic DOM fixture. One cosmetic, unrelated
  oddity: both full screenshots show the right-hand Layers panel as "No layers yet" /
  "0 layers" despite a real object3d layer existing on the canvas — a pre-existing
  layer-list-refresh quirk of the `engine.addLayer` + `buildControls()` capture harness,
  not something this unit touches or could have caused (out of scope, noted only for the
  record).

## Coordinator flags — addressed explicitly

**1. Out-of-brief file: `src/ui/shell/context-bar.js`.**
Confirmed the deviation: `ROUND2-BRIEFS.md` §fill-collapse-2 (lines 50-51) allows only
`src/config/context-bar.js` + `src/ui/panels/scene3d-panel.js` (+ the two test files);
the implementer also edited `src/ui/shell/context-bar.js`. This is **necessary**, not
gold-plating: `buildStyleBody` in that file is the ctxbar Style flyout's own caveat call
site (`FS.note(law)` at line 1584, unchanged from before this unit — U0's own report
already documents this file as the "third UI surface" rendering the identical generic
sub-control loop). The brief's own RED oracle explicitly names "both the picker row and
the Style tab" — the "picker row" is the ctxbar flyout, which lives in this exact file.
Without editing it, the fix would have been half-done (docked panel only), reproducing
the same regression class the unit exists to close. LEDGER.md already records this
(line 583, "Provisionally KEEP") with the identical rationale.
Collision check: `git -C .claude/worktrees/fill-audit-2 status --short` shows only
`src/core/algorithms/scene3d.js` and two test files dirty — **no** uncommitted or
committed touch on `src/ui/shell/context-bar.js` from fill-audit-2 today, and
`W-15c-plan.md` §9 (fill-audit-2's own governing plan) lists that file as "in the lane's
remit; **not expected to be needed** by this change" — so the collision the LEDGER flags
is theoretical, not live. **Verdict: ACCEPT the file addition** as correct and required;
recommend `ROUND2-BRIEFS.md`'s U5b row be corrected after the fact to list the file, so
future greps for "who owns this file" find it.

**2. `effectiveLaw` is a second implementation of `resolveToneLaw` rules 3/4 — no pinning
test.**
Confirmed: no test anywhere in the diff (or the pre-existing suite) asserts
`effectiveLaw(...)` agrees with `Params.resolveToneLaw(...)` for the same inputs — they
are two hand-written copies of the same branching logic, justified in the implementer's
own comment as avoiding a load-order dependency (`context-bar.js` is a config file loaded
before `src/core/scene3d/params.js`). This is a real drift risk: if a future unit (U6/U7/U8
or a `resolveToneLaw` bugfix) changes one without the other, the exact caveat-hiding class
of bug this unit fixes can reappear silently for one of the two surfaces, un-caught by any
guard.
I fuzz-tested the two implementations directly (loaded both `scene3d-tone-laws.js` and
`params.js` standalone in Node, cross-producted every option value — including
`__missing__`/`__garbage__` sentinels — per descriptor for every one of the 5 survivors
with `STYLE_PARAMS`): **45 combinations checked, 0 mismatches**, including the
`contFieldSigmoid` UNREPRESENTABLE case (both `fieldMetric` and `fieldFloor` non-default at
once) — both resolvers independently return the bare survivor `contFieldSigmoid`, never a
throw, in agreement. So the two implementations **are** in sync today, verified directly
rather than assumed.
**Verdict: this is not a merge blocker (proven equivalent right now), but it is a real gap.
Required non-blocking follow-up (call it U5b-3, or fold into U9's coordination pass): add a
generative unit test — for every survivor id in `STYLE_PARAMS`, for every combination of
descriptor values (including default/missing/garbage), assert
`SCENE_FILL_STYLES.effectiveLaw(survivor, bag)` and `Params.resolveToneLaw({...bag, toneLaw:
survivor})` return the same id.** This pins the two together mechanically instead of by
inspection.

**3. Vacuous-pass check on the 6 new tests.**
Addressed fully under conditions 1-2 above. RED at 47a5a755 fails as `undefined`/"not a
function" simply because nothing exists yet at that sha (expected, not a code smell by
itself) — the mutation test (present-but-wrong `effectiveLaw` stub) is what actually rules
out the TypeError-as-RED trap, and it does: all 6 tests re-fail on their real DOM/return-
value assertions, not on the stub's mere presence.

**4. Copy quality — in scope for the verdict.**
Confirmed `note.text` and the (i) popover are **genuinely unchanged**: the full diff of
`scene3d-panel.js` is +13/-2 lines, entirely inside the caveat block (replacing the
`if (note.caveat)` read with `effectiveLaw`/`caveatNote.caveat`); the full diff of
`context-bar.js` (shell) is +9/-1, same shape. Neither diff touches the
`note.text`/`entry.mechanism/strengths/weaknesses` lines above the caveat block —
confirmed by reading the diff hunks directly, not by re-deriving the surrounding code.
On the wording itself (the orchestrator's own flag, separate from presence/absence): **NOT
ACCEPT as final user-facing copy.** Both caveat strings are audit-report prose carrying
raw statistical jargon a plotter-art user has no reason to know — "RMS", "R2", "L* span",
"sphere·hatch" as a bare cell-name token, "the pass-count boundary." This is copy written
for the audit's own findings.json, reused verbatim as product text. **This is exactly a
U5b-2 plain-language-rewrite split, not a REJECT of U5b itself** — U5b's job (and the
standing ruling's bar) was "the warning must be visible at all," which is now true and
independently verified; the wording being unpolished is an additive quality gap on top of
a real fix, not a defect in the fix. Proposed plain wording (≤2 sentences each) for U5b-2:

- **bundleDither** (current: "A negative result, kept as one: waving the pass-count
  boundary made long-wave moire worse, not better, than the plain bundleCount baseline
  (3.43 vs 2.90 RMS on sphere·hatch), and R2 also dropped."): *"Dithered bundle mode can
  make repeating patterns (moiré) more visible than the default Count mode, not less. If
  you see new banding, switch back to Integer pass count."*
- **contFieldTouch** (current: "It is a hatch-only law: on sphere·crosshatch it floods
  completely — R2, L* span, moire and highlight falloff all come back 0 because both
  families flood and the cell renders as a solid black disc with no tone left in it at
  all."): *"On crosshatch fills, this floor setting can flood the whole surface to solid
  black with no visible shading left. If your fill looks like a solid dark blob, try a
  different Field floor option."*

**5. Evidence location.**
Confirmed all evidence lives in the worktree, not main:
`.claude/worktrees/fill-collapse-2/docs/3d-audit/fill-audit/after/U5b/` holds all 6 PNGs +
`report.json` + `raw-capture-results.json` (main's `docs/3d-audit/fill-audit/after/` has no
`U5b/` directory — correct, per protocol, since this hasn't merged yet). Confirmed no
manifest cell renders panel chrome (`docs/3d-audit/fill-audit/manifest*.json` — object-only
gallery, same pattern `after/U1-U5/` and `after/W-30/` already established) — real-app
screenshots are the only possible evidence shape for this unit, and that is what was
captured.

## Files touched (confirmed via `git diff --stat`)

`src/config/context-bar.js` (+36/-0), `src/ui/panels/scene3d-panel.js` (+13/-2),
`src/ui/shell/context-bar.js` (+9/-1, see flag 1),
`tests/integration/scene3d-fill-style-picker.test.js` (+63),
`tests/unit/scene3d-tone-law-collapse.test.js` (+44), plus 6 PNGs, `report.json`,
`raw-capture-results.json`, `docs/3d-audit/lane-reports/U5b-impl.md`. One commit
(`49475ccd`), no version bump (worktree cannot bump per protocol; confirmed
`window.Vectura.APP_VERSION` = `1.3.99` matches `package.json` throughout).

## Open items / required follow-ups (none blocking this unit)

1. **U5b-2** (recommended, not blocking): plain-language rewrite of the two caveat
   strings for end users — see proposed wording above. The roster's own
   `BY_ID[id].caveat` field is used for two audiences today (the audit ledger and the
   product UI); either fork the field (`caveat` for audit, a new `caveatUser` for UI) or
   rewrite `caveat` itself and keep the measured numbers in the ledger/report files where
   they already live.
2. **U5b-3** (recommended, not blocking): a generative cross-check test pinning
   `SCENE_FILL_STYLES.effectiveLaw` and `Scene3D.Params.resolveToneLaw` to agree for every
   survivor + every descriptor-value combination, so the two hand-maintained
   implementations of rules 3/4 cannot silently drift. Verified equivalent today by direct
   fuzz-testing (45/45 combinations, including the UNREPRESENTABLE 2-descriptor case); not
   guarded by anything in the repo.
3. **`ROUND2-BRIEFS.md` correction** (housekeeping): the U5b "Files ALLOWED" line should
   list `src/ui/shell/context-bar.js` alongside the other two, since it is genuinely
   required to close both halves of the bug — not an implementer overreach.
4. Cosmetic, unrelated: the evidence-capture harness's Layers panel shows "No layers yet"
   / "0 layers" even though a real object3d layer is on canvas — a pre-existing quirk of
   `engine.addLayer` + `buildControls()` scripted captures, not caused by or in scope for
   this unit.
