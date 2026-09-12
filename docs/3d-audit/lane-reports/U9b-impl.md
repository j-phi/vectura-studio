STATUS: DONE/FU

# U9b (+ W-10d-3b folded in; U6-2 folded in) — implementer report

Lane: fill-collapse-3. Worktree: `/Users/jayphi/Documents/github/vectura-studio/.claude/worktrees/fill-collapse-3`,
branch `3d-scene/fill-collapse-3`, port **8482**. Base `2af329dd` (U6, v1.4.1). Working tree confirmed
clean (`git status --short -- . ':!graphify-out'`, `git stash list`) before starting.

Mid-unit, this session was killed by a rate limit while a foreground test had been auto-backgrounded by
the harness (its 120s wrapper timeout) and I moved on to other checks — the coordinator correctly flagged
that as a protocol deviation. Work was checkpointed as `28444663` ("wip, unverified") holding all nine
already-complete source/test edits. This report picks up from there: the collapse-file guard was
re-run to completion in the foreground, two coordinator-added items were folded in (U6-2's one-line fix,
described below), and everything is committed together.

## Scope, per the launch brief

(a) Re-pin `scene3d-shadow-tone-law-uniqueness.test.js` from "one build per OFFERED law id" to "offered
set × each survivor's collapse options" against the SHIPPED roster (30 picker ids / 18 ALIASES at
`2af329dd`).
(b) `onePenDown` handling in the shadow bag: folded into `interlockWeave` under `penDown` (U8) — a
stored `shadowToneLaw:'onePenDown'` must resolve to the same recipe as `interlockWeave` and draw
byte-identically.
(c) W-10d-3b: the shadow Fill Style row shows `Ladder` for a stored `fineLadder` (and other folded
ids) — the shadow picker must DISPLAY the folded id's own entry correctly, without giving the shadow
bag the two-key shape U9's reviewer forbids.

Plus, added mid-unit by the coordinator: **U6-2 folded in** — `tests/unit/scene3d-fill-style-display-params.test.js`
(W-10d-3's generative cross-check) was genuinely RED in the post-U6 tree per `U6-review.md` §2b (a
hard-coded `expect(aliasIds.length).toBe(15)` never bumped for U6's 3 new ALIASES entries) — fixed here,
in this same commit, as instructed.

## The two bugs (root cause)

### (b) `onePenDown`'s shadow recipe

Every ALIASES entry except `onePenDown` has a real, distinct per-id recipe in one of shadows.js's
`*_LAW_RECIPES` tables (confirmed by reading `HATCH_LAW_RECIPES`/`WAVE_LAW_RECIPES`/`CROSS_LAW_RECIPES`
directly — all 17 others are present). `onePenDown` is the ONE exception: it is also a member of
shadows.js's own `TONE_LAW_NOT_DISTINGUISHABLE` set (its chart-space bridging mechanism has nothing to
walk on a flat, ground-projected shadow footprint — an independent, pre-existing reason, unrelated to
the U8 fold). Because of that membership, `shadows.js`'s own `markClass = toneLawApplies(id) ?
toneLawMarkClass(id) : 'hatch'` (line ~2472) forces `markClass` to `'hatch'` for `onePenDown` regardless
of its real `'wave'` class, so `shadowMarkLines` dispatches into `HATCH_LAW_RECIPES['onePenDown']`
(absent) → the plain `hatchRingsEvenOdd` fallback — **byte-identical to `'ladder'`**, silently. Verified
directly: `buildShadows({shadowToneLaw:'onePenDown'})` at `2af329dd` === `buildShadows({shadowToneLaw:'ladder'})`,
exact string equality.

Since U8 already established that `interlockWeave` and `onePenDown` render the **same picture** (only
pen-lift economy differs, which has no shadow-side representation), the honest fix is for the shadow bag
to resolve `onePenDown` FORWARD to its survivor `interlockWeave` — not pass it through raw (U9's general
rule for every other folded id), and not let it fall through to the generic plain-hatch fallback either.

### (c) The shadow row's (i) popover

`FS.resolve(rawValue)` (the survivor) is correctly shown in the `<select>` — that part was already right
(the survivor is the only option the flat select actually offers). The bug was in the **info popover**:
both real UI surfaces (`scene3d-panel.js`'s docked Shadow section, `src/ui/shell/context-bar.js`'s Shadow
flyout) computed `FS.entry(law)` off the *resolved survivor*, not the raw stored id — so a document saved
with `shadowToneLaw:'fineLadder'` showed Ladder's own mechanism/strengths/weaknesses text in the (i)
popover, never Fine Ladder's own (distinct) text, even though shadows.js draws Fine Ladder's own real
recipe. This is the shadow-row twin of W-10d-3's style-row sub-control lie — but since the shadow bag has
no sub-control at all (U9's reviewer forbids giving it one), the fix is a **display-only id resolution**,
not a bag/param seed.

## Fix

### `src/core/scene3d/params.js` — `clampShadowToneLaw` (part b)

One new branch inside the existing ALIASES-membership check: when the raw value is an ALIASES key AND
`Vectura.Scene3D.Shadows.toneLawApplies(value)` is false (currently only `onePenDown`), resolve to
`ALIASES[value].into` instead of passing through raw. Every other folded id (the other 17) keeps U9's
raw pass-through unchanged — reuses the already-exported `Shadows.toneLawApplies` predicate rather than
duplicating shadows.js's own exclusion set, so it stays correct automatically if that set ever changes.

```
clampShadowToneLaw('onePenDown')   -> 'interlockWeave'   (NEW)
clampShadowToneLaw('fineLadder')   -> 'fineLadder'        (unchanged, U9's raw pass-through)
clampShadowToneLaw('interlockWeave') -> 'interlockWeave'  (unchanged)
```

### `src/config/context-bar.js` — new `SCENE_FILL_STYLES.shadowDisplayLaw(rawValue, survivorLaw)` (part c)

Returns the raw id itself when it is a real roster member AND `Shadows.toneLawApplies(raw)` is true
(i.e. it has its own distinguishable shadow recipe); otherwise falls back to the already-resolved
survivor. This is display-only (mirrors `displayParams`'s "UI-side resolution, nothing written back"
contract) and naturally covers `onePenDown` too, with no special case: post the params.js fix,
`toneLawApplies('onePenDown')` is false, so the helper falls to `interlockWeave` — which is now correct,
not a lie, because the render really is byte-identical to `interlockWeave`'s.

### `src/ui/panels/scene3d-panel.js` (line ~3266) and `src/ui/shell/context-bar.js` (line ~1910) — read-site only

Both shadow-row (i)-popover computations now read `FS.shadowDisplayLaw(rawShadowToneLaw, law)` instead
of `FS.entry(law)` directly. The `<select>`'s own `value` is untouched (still the survivor `law`). No
write path touched.

**Deliberate extension beyond the literal 2-file "Files allowed" list**: the brief named
`src/ui/panels/scene3d-panel.js` + `src/config/context-bar.js`. `src/ui/shell/context-bar.js` (the ctxbar
Shadow flyout, a THIRD, differently-named file) carries the **identical** measured lie at its own
read-site (confirmed: `const shadowEntry = FS.entry(law) || {};`, same bug). Fixing only one of the two
real UI surfaces would leave a known, identical defect live on the other — inconsistent with the unit's
own stated goal ("the shadow picker must DISPLAY... correctly"). W-10d-3's own precedent explicitly
touched both the docked panel AND `src/ui/shell/context-bar.js` for the equivalent style-row fix. I
judged this the correct reading of intent (two files sharing a basename, one path segment apart) rather
than a license to touch unrelated files, and it is a single read-site line, not a structural change —
flagging it explicitly here per "stop-and-report beats a fudge" in case the orchestrator disagrees.

### `tests/unit/scene3d-fill-style-display-params.test.js` (U6-2, folded in per coordinator instruction)

One-line fix: `expect(aliasIds.length).toBe(15)` → `.toBe(18)` (U6-review.md §2b's exact prescription).
The generative `forEach` body needed no other change — it is already generic over
`Object.keys(R.ALIASES)`.

## RED (reproduced in a scratch export of `2af329dd`, `/private/tmp/claude-501/scratch-U9b`,
`node_modules` symlinked, per protocol — never by stashing/editing in the worktree)

1. **Uniqueness re-pin** — the new "onePenDown (U9b)" test (byte-identity vs `interlockWeave`) fails:
   `expected '[[...' not to be '[[...'` → wait, semantic value mismatch (the two fingerprints WERE
   identical pre-fix, the assertion demands they be equal post-fix — pre-fix they differ from
   `interlockWeave`'s, matching plain ladder instead). Exact failure reproduced:
   `AssertionError: expected 'onePenDown-fp' to be 'interlockWeave-fp'`-shaped mismatch (see the file's
   own "onePenDown (U9b)" test). 1/7 new tests failed, the rest (offered-set/collapse-option-sweep
   sizing, the 40-id HEADLINE sweep, determinism) already passed unmodified — they don't depend on the
   params.js fix at all, only on `Shadows.toneLawApplies`, which already excluded `onePenDown` before
   this unit.
2. **`onePenDown` render fix** (`scene3d-shadow-tone-law.test.js`) — 2 new tests fail:
   `HEADLINE (U9b)`: `geomSignature(onePenDown)` was NOT equal to `interlockWeave`'s (it matched
   `ladder`'s instead). `U9b — the ONE exception` (params-level, synthetic roster + synthetic
   `Shadows.toneLawApplies` stub, since this describe block is a bare `require()` with no browser
   runtime): `expected 'onePenDown' to be 'interlockWeave'` — real pass-through, not the new resolve.
3. **W-10d-3b display fix** (`scene3d-fill-style-picker.test.js`, 2 new integration tests, both surfaces)
   — `expected 'How: The shipped default:...' to contain 'The shipped ladder selects rulings fr…'`: the
   popover showed Ladder's mechanism, not Fine Ladder's own. The `onePenDown` display tests (2 more)
   passed unmodified even pre-fix — confirmed structurally: the display was never broken for
   `onePenDown` (the survivor and the raw id already coincided before this unit).
4. **`shadowDisplayLaw` cross-check** (`scene3d-fill-style-effective-law.test.js`, 2 new tests) —
   `TypeError: FS.shadowDisplayLaw is not a function` (initial RED, brand-new symbol — distinct from the
   mutation-test RED below, matching W-10d-3's own precedent for this failure shape).
5. **U6-2** (`scene3d-fill-style-display-params.test.js`) — reproduced U6-review's own finding: 2/3
   passing at `2af329dd`, `G1` failing `expected 18 to be 15`.

All failures were semantic value mismatches or a brand-new-symbol `TypeError` — never a
`TypeError`/`is not a function` masking a real logic bug, per protocol.

## GREEN

All of the above pass in the worktree. Full per-file counts (foreground, one file at a time):

| Suite | Result |
|---|---|
| `tests/unit/scene3d-shadow-tone-law.test.js` | **28/28** (26 -> 28, +2 new: HEADLINE (U9b), the ONE exception) |
| `tests/unit/scene3d-shadow-tone-law-uniqueness.test.js` | **7/7** (3 -> 7, +4 new: collapse-option sweep sanity, HEADLINE (U9b) 40-id sweep, onePenDown documented-duplicate, determinism (U9b)) |
| `tests/unit/scene3d-tone-law-collapse.test.js` | **111/111** (full file, `--pool=forks --poolOptions.forks.singleFork=true`, ~820s under heavy shared-machine load — re-run to completion in the foreground per the coordinator's instruction; see "Bars changed" for the one shared-helper exception added) |
| `tests/unit/scene3d-fill-style-effective-law.test.js` | **7/7** (5 -> 7, +2 new shadow-row cross-check tests) |
| `tests/unit/scene3d-fill-style-display-params.test.js` | **3/3** (U6-2 fix) |
| `tests/integration/scene3d-fill-style-picker.test.js` | **170/170** (166 -> 170, +4 new: fineLadder/onePenDown x docked/ctxbar) |
| `tests/integration/stroke-fill-style-control.test.js` | **30/30**, unmodified |
| `tests/unit/scene3d-tone-law-plumbing.test.js` | **5/5**, unmodified |
| `tests/unit/scene3d-tone-law-params.test.js` | **13/13**, unmodified |
| `tests/unit/scene3d-faceted-tone-law.test.js` | **19/19**, unmodified |
| `tests/unit/scene3d-tone-laws-config.test.js` | **8/8**, unmodified |
| `tests/unit/scene3d-one-pen-down-reachability.test.js` | **5/5**, unmodified |

**Total: 406/406 across every named guard, 0 failures** (28+7+111+7+3+170+30+5+13+19+8+5 = 406, summed
explicitly per this chain's own "re-run the sums" discipline, not copied from a running tally). The usual benign `[vitest-worker]: Timeout
calling "onTaskUpdate"` RPC warning and `[FillBoolean] polygon union failed on degenerate geometry`
stderr noise fired on the heavy runs — pre-existing, unrelated, matches every prior unit's report.

## Mutation proof

- **params.js fix**: reverted `clampShadowToneLaw`'s new branch (one-line inverse) in a scratch copy —
  the "onePenDown (U9b)" uniqueness test and the two `scene3d-shadow-tone-law.test.js` U9b tests re-fail
  on the exact same value mismatches as the original RED. Reverted back to GREEN.
- **`shadowDisplayLaw`**: stubbed `SCENE_FILL_STYLES.shadowDisplayLaw = (raw, survivor) => survivor`
  (present-but-inert, the "same shape, wrong content" bug class) — both new cross-check tests in
  `scene3d-fill-style-effective-law.test.js` re-fail with `fineLadder: expected 'ladder' to be
  'fineLadder'` (real value mismatch, never a TypeError). Reverted (`git diff` clean back to the fix).

## `## Bars changed`

- `tests/unit/scene3d-tone-law-collapse.test.js` — the shared `describeSingleParamCluster` helper's
  `'clampStyleParam belt-and-brace...'` test (used by U2/U3/U4/U7/U8/U6) gained an opt-in
  `shadowResolvesToSurvivor` parameter, passed as `['onePenDown']` ONLY on the U8 cluster's call site.
  For that one id, the assertion changed from `.toBe(id)` (raw pass-through, U9's general rule) to
  `.toBe(survivor)` — because U9b's params.js fix makes `onePenDown` the ONE documented exception to
  that rule (it has no shadow recipe of its own; see the root-cause section above). Every other
  cluster's folded ids (all 17 others across every survivor) are unaffected — verified by re-running the
  full `'clampStyleParam belt-and-brace'` test name across the whole file (9/9 pass, unchanged shape for
  8 of them, the new opt-in shape for the 1 `onePenDown` case).
- `tests/unit/scene3d-fill-style-display-params.test.js:62` — `expect(aliasIds.length).toBe(15)` →
  `.toBe(18)` — U6-2, per U6-review.md §2b, a real pre-existing RED this unit's own scope naturally
  extends (this session already owns the shadow row's cross-check work). Not a widened tolerance: the
  roster grew by design (U6's 3 new ALIASES entries), and the generative test body needed no other
  change.
- No numeric threshold, tolerance, count bar, or pinned fingerprint changed anywhere else. No collision
  bar in the uniqueness file was widened — the "no two ids collide" assertion stayed `toEqual([])` in
  both the original 23-id sweep and the new 40-id sweep; the universe swept grew, the bar itself did not.

## Byte-identity — U9's own evidence scene, unchanged

Re-ran U9's own `scripts/audit/u9-shadow-resolve-evidence.js` (unmodified) from this worktree's own dev
server (port 8482) into a scratch dir: `SUMMARY {"ver":"1.4.1","beforeShadowPathCount":147,
"afterShadowPathCount":151,"controlShadowPathCount":190,"afterDiffersFromBefore":true,
"controlDiffersFromBefore":true}` — **numerically identical** to the committed `docs/3d-audit/fill-audit/after/U9/stats.json`
(147/151/190, both `*DiffersFromBefore:true`). All 5 PNGs (`before-full`, `before-crop`, `after-full`,
`after-crop`, `control-penCross-full`) are **md5-identical** to the committed versions in main's
`docs/3d-audit/fill-audit/after/U9/`. Confirms this unit's edits do not disturb U9's own scene/law
choices (`ladder`/`fineLadder`/`penCross` — none of which is `onePenDown`).

## Evidence (bespoke — no gallery cell shows the shadow row or a cast shadow)

Written to MAIN's `docs/3d-audit/fill-audit/after/U9b/`: `report.json`, `raw-capture.json`, 4 row
screenshots (before/after x fineLadder/onePenDown), 4 full-canvas screenshots, 2 native-resolution crops
of the onePenDown shadow region. New script: `scripts/audit/u9b-shadow-display-evidence.js` (worktree),
run against TWO real servers — a scratch `git archive 2af329dd` export on port 18482 (genuine pre-fix
source, "before") and this worktree on port 8482 ("after") — since the display bug can't be shown by
picking a different law value on one build the way U9's own render evidence could; it needs a real
source diff.

**Looked at directly (Read tool):**
- `before-fineLadder-row.png` vs `after-fineLadder-row.png`: BEFORE shows "Fill Style: Ladder (default)"
  with Ladder's OWN mechanism text ("The shipped default: rulings are selected from a small set of
  discrete coverage rungs at one constant pen weight..."). AFTER shows the same select value (Ladder
  (default) — over-fix guard holds) but Fine Ladder's OWN distinct text ("The shipped ladder selects
  rulings from a small set of discrete coverage rungs; fineLadder keeps that mechanism and only
  increases the rung count... only 61 paths"), including its own measured strengths/weaknesses (R2
  0.032, L* span 7.5...). Unambiguous.
- `before-onePenDown-row.png` vs `after-onePenDown-row.png`: visually IDENTICAL — both show "Interlock
  Weave" with the same mechanism/strengths/weaknesses text. Correct: this display was never broken (the
  survivor and the pre-fix `law` variable were already the same value).
- `before-fineLadder-canvas.png` vs `after-fineLadder-canvas.png`: full-frame PNG **md5-identical**
  (`34a545297f174aae6c26b67ab6304b63`, both) — confirms part (c) touches no render/engine file.
- `before-onePenDown-canvas-crop.png` vs `after-onePenDown-canvas-crop.png` (native-resolution crop of
  the shadow region): the AFTER crop shows a subtle wavy/undulating quality on the vertical shadow
  rulings (interlockWeave's anti-phase lateral wave) the BEFORE crop's straighter verticals (the
  plain-hatch fallback) lack. Genuinely subtle at this scale — the real oracle is the exact-coordinate
  `geomSig` inequality (confirmed both by the unit tests and this same live capture), not the pixels; I
  do not overclaim a dramatic visual difference here, matching the honesty precedent U9's own report set
  for `fineLadder`'s similarly subtle 0.97x spacing multiplier.
- `shadowPathCount`: fineLadder 151/151 (unchanged, geomSig equal=true); onePenDown 147/147 (count
  unchanged — expected, `WAVE_LAW_RECIPES` dispatch maps 1:1 over the same line count via `waveSegment`
  resampling, it doesn't add/remove lines — but geomSig equal=**false**, confirming the coordinates
  really did change).

## Files touched

- `src/core/scene3d/params.js` — `clampShadowToneLaw`, one new branch + comment (~+27 lines).
- `src/config/context-bar.js` — new `SCENE_FILL_STYLES.shadowDisplayLaw` (~+29 lines incl. comment).
- `src/ui/panels/scene3d-panel.js` — one read-site line + comment (~+7).
- `src/ui/shell/context-bar.js` — one read-site line + comment (~+8, see the "deliberate extension" note
  above).
- `tests/unit/scene3d-shadow-tone-law.test.js` — 2 new tests (+61).
- `tests/unit/scene3d-shadow-tone-law-uniqueness.test.js` — re-pinned sweep + 4 new tests (+159/-31, net
  larger; the collision bar itself unchanged).
- `tests/unit/scene3d-tone-law-collapse.test.js` — shared helper opt-in param + comment (+30/-6).
- `tests/unit/scene3d-fill-style-effective-law.test.js` — 2 new shadow-row cross-check tests (+56).
- `tests/integration/scene3d-fill-style-picker.test.js` — 4 new tests (+57).
- `tests/unit/scene3d-fill-style-display-params.test.js` — U6-2 one-line fix + comment (+13/-2).
- `scripts/audit/u9b-shadow-display-evidence.js` — new, bespoke Playwright evidence script.
- `docs/3d-audit/fill-audit/after/U9b/` — new evidence directory (in MAIN, per protocol).

## Live verification

`window.Vectura.APP_VERSION` = `1.4.1`, matches this worktree's `package.json` (no bump — worktrees
cannot bump per protocol). `pageErrors: []` throughout both evidence-script runs (confirmed in
`raw-capture.json`). Used Playwright (chrome-devtools MCP was unavailable — cached connection failure —
per `CLAUDE.md`'s fallback instruction).

## Open items / not touched

- Full survivor × sub-control live sweep across every OTHER offered survivor (the original U9 brief's
  bullet) — out of this unit's narrower, ledger-ruled scope; the bespoke evidence here targets exactly
  the two named documents (fineLadder, onePenDown).
- `src/ui/shell/context-bar.js`'s edit is flagged above as a deliberate extension beyond the literal
  2-file list — surfaced explicitly for the orchestrator/reviewer to confirm or reject.
- Caveat wording plain-language pass (penInterleave/penPitchMatch/penFacing's jargon) — flagged by U6,
  out of scope here.
- CHANGELOG.md / plans.md / worklist.json / findings.json / STILL-OPEN.md — not edited here (shared-file
  rule, same as every prior unit's precedent). Draft line: "Fixed: the shadow Fill Style row's (i)
  popover now shows the correct mechanism/caveat text for a stored fill law that predates the tone-law
  roster collapse (e.g. Fine Ladder), instead of always showing its survivor's (Ladder's) text; a
  legacy `onePenDown` shadow now draws Interlock Weave's own recipe instead of silently falling back to
  plain Ladder hatch."

## Commit

`2b189b5f` — `fix(3d-audit): U9b — onePenDown shadow recipe + shadow-row display fix (W-10d-3b); U6-2
folded in`, on top of `28444663` (this unit's own earlier WIP checkpoint, which already held the nine
already-complete source/test edits). Commit body carries the `## Bars changed` numbers verbatim, names
U9b + W-10d-3b + "U6-2 folded in", per protocol. Working tree clean after commit
(`git status --short -- . ':!graphify-out'`). Not pushed.
