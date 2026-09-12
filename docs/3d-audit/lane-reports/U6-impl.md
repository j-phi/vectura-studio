STATUS: DONE

# U6 implementer report — fill-collapse-3 (C-06/W-18a, `penInterleave`/`penMode`, the FROZEN-ON-JAY cluster)

- **Lane / worktree**: fill-collapse-3, `.claude/worktrees/fill-collapse-3` (port 8482)
- **Branch**: `3d-scene/fill-collapse-3`
- **Base sha**: `426cc5e4` (v1.4.1, main's round-2 wrap-up)
- **Final sha**: `2af329dd` — one commit, working tree clean before and after.

## Jay's decision (the thing this unit was blocked on)

LEDGER.md row 11 / `docs/3d-audit/lane-reports/W-22-24-W-18-plan.md` §4 decision 2: **penStipple MOVES**
from the `'dot'` mark class ("Dots & stipple") to `'hatch'` ("Parallel hatching") — a visible picker
re-categorisation — with caveat text explaining why. Implemented as option A exactly as specified:
fold `penStipple` into `penInterleave` as `penMode:'stipple'` (lossless — `IDS`/engine vocabulary
untouched), correct `FILL_STYLE_MARK_OF.penStipple` from `'dot'` to `'hatch'`, and rewrite
`penStipple`'s `laws.json` caveat (U5b-2 plain-language precedent) to state the move in plain
language:

> "Pen Stipple moved from "Dots & stipple" to "Parallel hatching": it has never drawn dots — its
> highlight fade comes from shortening the fine nib's hatch marks, the same ruled-darks mechanism as
> the other Pen options. If you want an actual dot pattern, this option won't give you one."

## Roster / picker numbers

| | before | after |
|---|---|---|
| `IDS` (48-id engine vocabulary) | 48 | 48 (unchanged forever) |
| `PICKER_IDS` (picker options) | 33 | **30** |
| `ALIASES` | 15 | **18** |
| Picker total offered (`PICKER_IDS` + `'ladder'`) | 34 | **31** |

Survivor `penInterleave` ← folded `penPitchMatch` (`penMode:'pitchMatch'`), `penFacing`
(`penMode:'facing'`), `penStipple` (`penMode:'stipple'`). `penCross` (856.2 mm ink, crossed) and
`penReserve` (1166.7 mm, transverse reserves) are genuinely different pictures and are **NOT
folded** — the plan says so explicitly; not touched by this unit.

## RGR proof

**RED** (verified via `git stash` before implementing, and reproduced live in the guard suite): at
`426cc5e4`, `resolveToneLaw({toneLaw:'penInterleave', penMode:'stipple'})` returned `'penInterleave'`
unchanged (`STYLE_PARAMS.penInterleave` did not exist) — diverging from `penStipple`'s own picture
(868.1 vs 910.6 mm ink on torus+hatch+med per the plan's §1 table). The picker showed Pen Stipple
under "Dots & stipple", and `FILL_STYLE_MARK_OF.penStipple === 'dot'`.

**GREEN**: `scripts/build-tone-laws.js` gained one `COLLAPSE.penInterleave` row (key `penMode`, 4
options); `src/config/context-bar.js`'s `FILL_STYLE_MARK_OF.penStipple` moved from the `'dot'` group
to the `'hatch'` group; `node scripts/build-tone-laws.js` regenerated `src/config/scene3d-tone-laws.js`
cleanly (`PICKER_IDS 30, ALIASES 18`, `48 law(s) (37 production / 11 library)`, no integrity-throw
failures — `penInterleave` is a real roster id, no `DEFAULT_LAW` special case needed).

## The shadow path also moves — not just the picker (the trap this unit specifically had to watch for)

`src/core/scene3d/shadows.js`'s `shadowMarkLines` dispatches on **markClass**, not tone-law id, to pick
a recipe table. Before this unit, `penStipple`'s shadow rendered via a real, deliberately-designed
`DOT_LAW_RECIPES.penStipple` entry (`dotMarks(rings, spacing, {pitchMult:1.3, flickLenMult:0.5,
jitterMult:1.4})`). Moving its markClass to `'hatch'` alone — without a matching
`HATCH_LAW_RECIPES.penStipple` entry — would have silently dropped its shadow onto the undifferentiated
`hatchRingsEvenOdd` fallback: **byte-identical to `'ladder'` on shadows**, the exact failure mode this
same file's own `onePenDown` comment already names as known-bad (a law whose markClass changes but has
no recipe of its own). Added `HATCH_LAW_RECIPES.penStipple: (rings, angleDeg, spacing) =>
hatchEndTrim(hatchRingsEvenOdd(rings, angleDeg, spacing), 0.24)` — translating penStipple's own
"shortening its marks" mechanism into hatch terms via the same `hatchEndTrim` device
`taperedEnds`/`endShorten` already use for "shorten". `DOT_LAW_RECIPES.penStipple` is left in place
(now dead/unreachable, commented as such) rather than deleted, documenting the pre-move design intent.

Verified live: `tests/unit/scene3d-shadow-tone-law.test.js`'s new "HEADLINE (U6)" test confirms
`shadowToneLaw:'penStipple'` now emits real, non-empty geometry that differs from plain `'ladder'`
(i.e. it did NOT degrade to the fallback), and `Shadows.toneLawMarkClass('penStipple') === 'hatch'`.
`scene3d-shadow-tone-law-uniqueness.test.js`'s HEADLINE ("no two offered options render byte-identical
shadow geometry") stays green — confirms the new `penStipple` recipe doesn't collide with any other
offered law's shadow.

## Byte-identity — two independent proofs, both scoped to all 3 folded ids × the survivor

1. **In-tree resolver sweep** (real `algo.generate()`-captured opts, sphere/torus/cone × low/med/max
   fillDensity, mapper hatch — 9 combinations per fold, 27 total across the 3 folded ids; `box`
   excluded, confirmed unreachable for this whole threePen family even at the `hatch` mapper per
   `docs/3d-audit/fill-audit/manifest.B.unreachable.jsonl`, unlike U7/U8's wave-family unreachable-on-
   every-mapper shape): **27/27 byte-identical**, plus the bare survivor (`penMode:'interleave'` or
   omitted) unaffected by geometry/density. Landed as a permanent regression guard in the collapse test
   file's "U6 multi-primitive x multi-density" `describe` block, reusing U7/U8's exact harness shape
   per the brief's instruction.
2. **Cross-tree, real gallery-capture pipeline** (`scripts/audit/scene3d-capture.js`, real headless-
   Chromium): a scratch export of the true pre-U6 commit (`426cc5e4` — HEAD was still this at capture
   time, since all U6 edits were uncommitted working-tree changes; no stash needed) on port 8483, vs
   the post-U6 worktree on port 8482. 36 cells (sphere/torus/cone × hatch × penInterleave/
   penPitchMatch/penFacing/penStipple × low/med/max, angle a). **36/36 md5-identical.**
   Additionally — unlike U7/U8, which both hit a stale-committed-gallery mismatch — these same 36
   cells are **also** 36/36 md5-identical against the committed `docs/3d-audit/fill-audit/shots/B/`
   main gallery baseline (`MISSING=0, DIFF=0`). No staleness finding to report here.

I looked at `torus__hatch__penInterleave__med__a`, `torus__hatch__penStipple__med__a`,
`torus__hatch__penPitchMatch__med__a`, and `torus__hatch__penFacing__med__a` directly (converted
webp→png via `sips`, Read tool): all four are the same capsule-stepped ruling family on a torus (thick
white capsule/dash-segmented bands over black) — visually indistinguishable at plot scale, matching the
plan's own note ("By eye the four are the same capsule-stepped rulings on torus hatch/contour and
sphere hatch"). `penFacing` shows slightly larger/longer capsule segments toward the upper-right of the
ring — a genuine, minor difference consistent with its distinct path count (154 vs 118–121 for the
others per the plan's ink table) — not enough to call it a different picture: a picker-tier
near-duplicate, not a rendering-tier one, per the plan's own characterization. Confirmed this is a
genuine fold, not a C-05-style near-duplicate requiring a STOP.

## The caveat condition — widened from U7/U8's two-caveat pair to a four-caveat cluster, with an honest wrinkle

Per the standing ruling ("folding a law must NOT hide its measured caveat", U5b) and this brief's own
instruction to check all four: **all four members carry real, non-empty measured caveats**
(`docs/tone-laws/laws.json`). Unlike U7/U8 (exactly 2 distinct caveats each), **NOT all four of this
cluster's caveats are pairwise distinct** — measured, not assumed: `penPitchMatch` and `penFacing`
carry the **byte-identical** "three pens are simulated" sentence (`"Three pens are SIMULATED, not
expressible: penId is carried per style group, not per run."`), both correctly restating the same true
measured fact. `penInterleave`'s own (longer, mentions `scene3d.js`, "read every number with that in
mind") and `penStipple`'s own (the mark-class-move explanation) are each distinct from every sibling.
This is a real finding, not a bug in my test — flagged loudly here per the "sum the table"/honesty
habit this chain has established, and pinned as an explicit assertion (not a blanket
all-pairwise-distinct claim) in both the collapse file's "U6 caveat" block and the shared cross-check.

Verified `FS.effectiveLaw`/`Params.resolveToneLaw` surface the RIGHT one of the four at each `penMode`
state:
- `penMode:'interleave'` (default, or omitted) → `penInterleave` → **its own** caveat.
- `penMode:'pitchMatch'` → `penPitchMatch` → its own caveat (= `penFacing`'s, see above).
- `penMode:'facing'` → `penFacing` → its own caveat (= `penPitchMatch`'s, see above).
- `penMode:'stipple'` → `penStipple` → its own, **distinct** caveat (the mark-class-move text).

Extended the **shared** U5b-3/U7/U8 cross-check file, `tests/unit/scene3d-fill-style-effective-law.test.js`
(not a private test in the collapse file, matching precedent), with a new "U6" test asserting all four
states, both resolvers agreeing, and the correct distinct/duplicate pattern. Also added a dedicated "U6
caveat" `describe` block in the collapse file for the local, cluster-specific proof, plus a "U6
mark-class move" block that pins `penStipple`'s markClass/optgroup membership directly.

**Live-verified** (see Evidence below): real running app screenshots via BOTH the docked Style tab and
the ctxbar Style flyout (real scene-object selection, `CB.getContext().kind === 'scene-object'`) show
`penInterleave`'s own caveat at the default `Pen mode = Interleaved nibs` state, and `penStipple`'s
distinct, mark-class-move caveat once `Pen mode = Stipple` is picked — word-for-word matching
`laws.json`.

## Guard-test bumps (mandatory `## Bars changed` disclosure)

1. `tests/unit/scene3d-tone-laws-config.test.js:118` — `EXPECTED_PICKER_IDS_LENGTH` **33 → 30**;
   `:119-123` — `EXPECTED_ALIAS_IDS` gained `'penPitchMatch'`, `'penFacing'`, `'penStipple'` (15 → 18
   entries). Why: U6 folds 3 more ids out of the picker.
2. `tests/integration/scene3d-fill-style-picker.test.js` (box-primitive dead-count bar) — **23 → 20**.
   Why: all 3 folded ids (`penPitchMatch`, `penFacing`, `penStipple`) are threePen-family laws, dead on
   `box`+`hatch` exactly like their survivor `penInterleave` (confirmed against
   `docs/3d-audit/fill-audit/manifest.B.unreachable.jsonl` — box+hatch unreachable for all four ids);
   `alive` (11, none of the four is a mono law) is unaffected. Re-measured directly, not assumed: ran
   the test unedited first, got `expected 20 to be 23` (real failure, not a `TypeError`), then applied
   the fix.
3. `tests/integration/scene3d-fill-style-picker.test.js` — **two assertions re-expressed, not numeric
   bars, disclosed for transparency per the U8 precedent**:
   - "the note leads with the mark class; simulated laws are prefixed; caveats survive" — `F.note
     ('penStipple').text` expected prefix changed `/^Dots & stipple —/` → `/^Parallel hatching —/`. This
     is the deliberate, intended consequence of the mark-class move — `note()` reads `markClass` live,
     and `penStipple`'s is now `'hatch'`.
   - "the note names the mark class, and a previously-demoted law renders its caveat" — its
     `sel.value = 'penStipple'` no longer selects anything (that id left `PICKER_IDS`, so the flat
     `<select>` no longer offers it as its own `<option>`); switched the example id to `penCross`
     (still directly selectable, still `simulated`, exercises the identical property the test was
     written to check).

No other numeric threshold, tolerance, count bar, or pinned fingerprint changed anywhere in this unit's
diff.

## Guards run (foreground, one/few files at a time, per AGENT-PROTOCOL — machine shared with several
other live worktree sessions throughout, confirmed via `ps aux`; the collapse file needed
`--pool=forks --poolOptions.forks.singleFork=true` after the default pool exceeded the 15-min
threshold once)

| Suite | Result |
|---|---|
| `tests/unit/scene3d-tone-law-collapse.test.js` (full file, singleFork) | **111/111**, 840.8s |
| `tests/unit/scene3d-tone-laws-config.test.js` | **8/8** |
| `tests/unit/scene3d-fill-style-effective-law.test.js` | **5/5** |
| `tests/integration/scene3d-fill-style-picker.test.js` (full file) | **166/166** |
| `tests/unit/scene3d-shadow-tone-law.test.js` | **26/26** |
| `tests/unit/scene3d-shadow-tone-law-uniqueness.test.js` | **3/3** |
| `tests/integration/stroke-fill-style-control.test.js` | **30/30** |
| `scene3d-panel` + `scene3d-panel-style-live-sync` + `context-bar-scene-flyouts` (batch) | **83/83** |
| `scene3d-tone-law-plumbing` + `params` + `dispatch` + `faceted-tone-law` + `solid-cap-reachability` + `one-pen-down-reachability` (batch) | **59/59** |
| `scene3d-ribbon-weightscale-invariant` (unit) + `scene3d-ribbon-weightscale` (integration) | **59/59** |

**Total: 550/550 across every named guard, 0 failures.** All runs exit code 0; the usual benign
`[vitest-worker]: Timeout calling "onTaskUpdate"` RPC warning and `[FillBoolean] polygon union failed on
degenerate geometry` stderr noise fired on the heavy runs (matches every prior unit's report —
pre-existing, unrelated to this change).

`scene3d-shadow-tone-law-uniqueness.test.js` stays green (0 collisions) — confirmed the new
`HATCH_LAW_RECIPES.penStipple` recipe does not render byte-identical to any other offered law's shadow.

Preset exposure re-verified in this worktree: `grep -rl "toneLaw" user-presets/` → 0 files;
`grep -rlE "penInterleave|penPitchMatch|penFacing|penStipple" user-presets/ src/config/user-presets.js`
→ 0 files. `npm run user-presets:bundle` not run (nothing to regenerate).

## Live verification (real running app, port 8482, dev server started/killed by me)

`window.Vectura.APP_VERSION` = `1.4.1`, matches this worktree's `package.json` (no bump — worktrees
cannot bump per protocol). `pageErrors: []` throughout. Used Playwright (`chromium.launch()`) per
CLAUDE.md's chrome-devtools singleton-browser guidance.

1. Built a real scene3d layer + sphere object via the app's own API (monolith `scene3d` layer form,
   the exact pattern `context-bar-scene-flyouts.test.js`'s `addSelectScene()` helper uses),
   `styleTable.scene.params = {toneLaw:'penInterleave'}`, opened the real docked **Style** tab.
2. **Baseline** (`Pen mode = Interleaved nibs`, the default) —
   `docs/3d-audit/fill-audit/after/U6/penInterleave-interleave-crop-native.png`. **LOOKED**: "Fill
   Style: Pen · Interleave", "Pen mode: Interleaved nibs", caveat = "Simulated — 3 nib widths on one
   pen layer. Three pens are SIMULATED, not expressible: penId is carried per style group in
   scene3d.js, not per run, so no real plot could name three nibs within one fill — read every number
   with that in mind." — matches `penInterleave`'s own `laws.json` caveat verbatim.
3. **Folded** (`Pen mode = Stipple`) —
   `docs/3d-audit/fill-audit/after/U6/penStipple-stipple-crop-native.png`. **LOOKED**: "Pen mode:
   Stipple", caveat now reads "Simulated — 3 nib widths on one pen layer. Pen Stipple moved from "Dots
   & stipple" to "Parallel hatching": it has never drawn dots — its highlight fade comes from
   shortening the fine nib's hatch marks, the same ruled-darks mechanism as the other Pen options. If
   you want an actual dot pattern, this option won't give you one." — `penStipple`'s own, distinct
   caveat, verbatim.
4. **ctxbar Style flyout** (real scene-object selection: `app.renderer.setSelection` +
   `app.renderer.setSceneSelection({...mode:'object', objectIds:['obj-1']})`, `CB.restoreState()`,
   confirmed `CB.getContext().kind === 'scene-object'`) —
   `docs/3d-audit/fill-audit/after/U6/ctxbar-style-stipple-crop-native.png`. **LOOKED**: same caveat
   swap live in the ctxbar flyout (not just the docked panel); the (i) blurb still reads "Parallel
   hatching — Choose it for an even, technical, unfussy ruling..." (`penInterleave`'s own static blurb,
   unaffected by the fold — matches U7/U8's finding that the (i) popover stays on the plain survivor
   `entry`).
5. Picker `<select>` optgroup structure read directly off the live DOM: **"Parallel hatching"** group
   contains `ladder, taperedEnds, weightModulated, bundleCount, bundleSubNib, bundleLozenge,
   contFieldSigmoid, penInterleave, endShorten` (penInterleave present, penPitchMatch/penFacing/
   penStipple absent as their own rows); **"Dots & stipple"** group contains only `lozengeStipple,
   mkDotScreen` — `penStipple` is genuinely gone from it. This is the direct, DOM-level proof the
   mark-class move is real and live, not just asserted in a unit test.
6. A saved-`.vectura` round trip (real `sanitizeSceneParams`) with `toneLaw:'penStipple'` is covered by
   the collapse test file's "a saved .vectura naming a folded toneLaw resolves through the real engine
   unchanged in effect" test (passing). The raw-bag **display** default gap (what the sub-control
   literally shows on a freshly-reopened raw-folded document before the user touches the picker once)
   is the same class of gap U1–U8's own live verification found and flagged as **W-10d-3** (already
   planned, HELD by this lane) — not fixed here, correctly out of scope (data-only unit).

## Files touched

`scripts/build-tone-laws.js` (+38 — one `COLLAPSE.penInterleave` row + comments),
`docs/tone-laws/laws.json` (+1/-1 — `penStipple.caveat` rewritten),
`src/config/context-bar.js` (+13/-1 — `FILL_STYLE_MARK_OF.penStipple` moved 'dot'→'hatch' +
comments), `src/config/scene3d-tone-laws.js` (regenerated, +54/-1),
`src/core/scene3d/shadows.js` (+21/-1 — `HATCH_LAW_RECIPES.penStipple` added,
`DOT_LAW_RECIPES.penStipple` commented as now-dead),
`tests/unit/scene3d-tone-law-collapse.test.js` (+257 — U6 cluster block via
`describeSingleParamCluster`, a "U6 mark-class move" describe block, a "U6 caveat" describe block, and
a "U6 multi-primitive x multi-density" describe block),
`tests/unit/scene3d-fill-style-effective-law.test.js` (+59 — U6 caveat-survival cross-check, appended
to the shared file), `tests/unit/scene3d-shadow-tone-law.test.js` (+38 — the "HEADLINE (U6)" shadow-path
regression test, matching U9's fineLadder precedent), `tests/unit/scene3d-tone-laws-config.test.js`
(bar bump), `tests/integration/scene3d-fill-style-picker.test.js` (bar bump + 2 re-expressed
assertions). `surface-fill.js`, `surface-fill-mono.js`, `mappers.js`, `hlr.js`, any UI panel file —
**never touched**, confirmed via `git diff --stat 426cc5e4 HEAD`.

## Evidence

`docs/3d-audit/fill-audit/after/U6/report.json` (byte-identity methodology, both proofs, mark-class-move
detail, caveat-survival verification, visual inspection notes) + `manifest.B.1-1.jsonl` + 36 `.webp`
gallery cells under `shots/B/` + 6 live-app screenshots (`penInterleave-interleave-full.png`,
`penInterleave-interleave-crop-native.png`, `penStipple-stipple-full.png`,
`penStipple-stipple-crop-native.png`, `ctxbar-style-stipple-full.png`,
`ctxbar-style-stipple-crop-native.png`) — all written to MAIN's `docs/3d-audit/fill-audit/after/U6/`
per protocol, left uncommitted there (MAIN is shared scratch for concurrent lanes' gallery output,
matching every prior unit's precedent).

## Docs contract (not edited here — shared-file rule, same as U7/U8's precedent)

Draft CHANGELOG line for whoever applies it:

> Fill Style picker: 33 → 30 options (roster total, cumulative with U1–U5/U7/U8). `penInterleave`,
> `penPitchMatch` and `penFacing` (near-identical capsule-stepped rulings) now live behind one
> "Pen mode" control under Pen · Interleave. `penStipple` also folds in as `Pen mode: Stipple` — and,
> since it never actually drew dots, it moves from "Dots & stipple" to "Parallel hatching" in the
> picker (a real re-categorisation, explained in its own caveat text). All four render exactly as
> before; saved documents migrate automatically at load.

## Open items for the orchestrator / next session

1. **The penPitchMatch/penFacing byte-identical caveat** — a real, harmless duplicate (both correctly
   state the same true "three pens simulated" fact). Not a defect; flagged for visibility per the
   "sum the table" honesty habit, not something to fix.
2. **Caveat wording jargon** — `penInterleave`/`penPitchMatch`/`penFacing`'s caveats are still
   engineering-jargon ("penId is carried per style group in scene3d.js") exactly like the laws U5b-2
   already rewrote to plain language. `penStipple`'s NEW caveat (this unit) is already plain-language
   by design; the other three are out of scope for this data-only unit — flagged, not fixed.
3. **W-10d-3** (raw-folded-id display-default gap) is unaffected by this unit beyond adding
   `penPitchMatch`/`penFacing`/`penStipple` to its affected-id set — already planned on this lane, HELD.
4. **CHANGELOG.md / plans.md / worklist.json / findings.json** — not edited here (shared-file rule,
   same as every prior unit in this chain); draft line above.
5. This closes the last FROZEN-ON-JAY item in the C-0x roster-collapse chain (U1–U9 are all now
   either DONE or already-shipped per LEDGER.md's own accounting) — remaining decisions 1/3/4 in §4
   (T4 max-density band, ground-plane density, F1 "which white") are unrelated to the fill-roster
   collapse and out of scope for this unit.
