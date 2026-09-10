STATUS: DONE

# U5b — folded fill-law caveats must stay visible in the picker

**Lane:** fill-collapse-2 (worktree `.claude/worktrees/fill-collapse-2`, branch `3d-scene/fill-collapse-2`, port 8482)
**Base:** `47a5a755` (main, v1.3.99) → **new commit:** see `git log -1` after commit below.
**Blocking status:** was **BLOCKING BEFORE MERGE** per LEDGER.md row U5b and the standing ruling
"Folding a law must NOT hide its measured caveat" (2026-09-06). Fixed.

## The bug

`SCENE_FILL_STYLES.note(id)` (src/config/context-bar.js) reads a law's caveat directly off
`entry(id)`, i.e. off `SCENE3D_TONE_LAWS.BY_ID[id].caveat`. Both UI surfaces that render a
Fill Style row — the docked Style tab (`fillStyleControls` in
`src/ui/panels/scene3d-panel.js`) and the ctxbar Style flyout (`buildStyleBody` in
`src/ui/shell/context-bar.js`) — call `FS.note(law)` where `law` is the **resolved survivor
id** (`FS.resolve(storedValue)`), never the folded id a collapse sub-control actually selects.

Two folded laws in this exact collapse chain (U4, U5) carry real measured caveats their
survivor does not:
- `bundleDither` (folded into `bundleCount` via `Bundle mode: Dithered`) — caveat: "A negative
  result... waving the pass-count boundary made long-wave moire worse... (3.43 vs 2.90 RMS on
  sphere·hatch)". `bundleCount.caveat` is `null`.
- `contFieldTouch` (folded into `contFieldSigmoid` via `Field floor: Ink-width floor`) —
  caveat: "It is a hatch-only law: on sphere·crosshatch it floods completely...".
  `contFieldSigmoid.caveat` is `null`.

So a user who picks "Bundle · Count" then sets "Bundle mode" to "Dithered" (or picks
"Continuous Field · Sigmoid" then sets "Field floor" to "Ink-width floor") silently loses the
warning that used to show when `bundleDither`/`contFieldTouch` were their own picker rows —
a genuine product regression introduced by the U1-U5 fold, not a fail of U1-U5 itself (per
LEDGER.md: "U5b... explicitly not a fail of U1-U5").

This exact gap was already documented (not fixed) by two "KNOWN GAP" tests in
`tests/unit/scene3d-tone-law-collapse.test.js` (U4/U5 caveat-visibility-gap describe blocks) —
this unit closes it.

## The fix

Added `SCENE_FILL_STYLES.effectiveLaw(survivorId, paramsBag)` to `src/config/context-bar.js`.
It mirrors `Scene3D.Params.resolveToneLaw`'s survivor+params rule (rules 3/4: exactly one
collapse descriptor resolving to a non-default option → that option's law; zero active →
the bare survivor; more than one active at once → the UNREPRESENTABLE case, deterministic
fallback to the bare survivor, never a throw) but reads only `STYLE_PARAMS` (already owned by
this config file via `styleParams()`) rather than depending on the core engine module —
`context-bar.js` is a config file two independent UI surfaces read and must not gain a new
load-order dependency on `src/core/scene3d/params.js`.

Both UI call sites now compute the caveat off `effectiveLaw`, while the (i) popover's blurb
(mechanism/strengths/weaknesses) stays on the plain resolved survivor `entry`/`note`, per the
ruling ("Keep the (i) popover's blurb on the survivor — the two are conflated in the current
code"):

- `src/ui/panels/scene3d-panel.js` `fillStyleControls` — the caveat block (previously
  `if (note.caveat) …`) now reads `FS.note(FS.effectiveLaw(law, styleParamBag)).caveat`.
- `src/ui/shell/context-bar.js` `buildStyleBody` — same change: `if (note.caveat) …` →
  `const effectiveLaw = FS.effectiveLaw(law, params); const caveatNote = FS.note(effectiveLaw); if (caveatNote.caveat) …`.

`note.text` (the always-on mark-class line) and `entry.mechanism/strengths/weaknesses` (the
popover) are UNCHANGED — both still read off the plain survivor `law`, exactly as before.

## RGR proof

**RED** (confirmed against the pre-fix tree, this same worktree before the `context-bar.js`
edit — see the vitest failures below, produced before any implementation change landed):

- `tests/unit/scene3d-tone-law-collapse.test.js` — 2 new tests
  (`"U5b FIX: effectiveLaw resolves..."` in the U4 and U5 caveat-visibility-gap describe
  blocks) failed: `expected 'undefined' to be 'function'` / `FS.effectiveLaw is not a
  function`.
- `tests/integration/scene3d-fill-style-picker.test.js` — 4 new tests (2 docked panel, 2
  ctxbar flyout) failed: `expected null to be truthy` (no `.vs3-lawnote.is-caveat` /
  `.ctxbar-fly-note.is-caveat` element existed after picking the folded sub-control value).

**GREEN** (after the fix):

- `tests/unit/scene3d-tone-law-collapse.test.js`: 56/56 pass (full file; includes the 2 new
  U5b tests plus the pre-existing U0–U5 collapse suite, all still green).
- `tests/integration/scene3d-fill-style-picker.test.js`: 144/144 pass (full file; includes
  the 4 new U5b tests, the 2 pre-existing "KNOWN GAP"-adjacent tests that use `bundleSubNib`
  as an unfoldable control, and everything else in the Fill/Shadow Style picker suite).
- `tests/unit/scene3d-tone-laws-config.test.js`: 8/8 pass.
- `tests/integration/stroke-fill-style-control.test.js`: 30/30 pass (Stroke Fill Style sits
  directly beneath Fill Style in the same panel — guard against layout/row-order drift).
- `tests/unit/scene3d-faceted-tone-law.test.js`: 19/19 pass.
- `tests/unit/scene3d-tone-law-plumbing.test.js`: 5/5 pass.

All targeted vitest files run individually in the foreground, no `--pool` flag changes.
Machine was under heavy concurrent load from other worktree sessions (per AGENT-PROTOCOL.md
"machine is shared") — two runs hit vitest's internal RPC keep-alive timeout warning
(`[vitest-worker]: Timeout calling "onTaskUpdate"`) but still reported a clean pass count and
exit code 0; not a real regression, not re-run.

## Evidence (real running app, no gallery cell — this is UI text, not geometry)

Dev server started from the worktree on port 8482 (`node scripts/dev-server.js 8482`), driven
with a Playwright script (chromium.launch → screenshot → browser.close() + server.kill(), run
once in the foreground, no background/Monitor use). `window.Vectura.APP_VERSION` reported
`1.3.99`, matching this worktree's `package.json` (confirms no version bump).

The script built a real standalone `object3d` leaf via `window.app.engine.addLayer('object3d')`
— the same engine call the scene-tree "Add shape" UI action invokes — selected it, called
`window.app.ui.buildControls()` (the exact method the layer-selection UI path calls to render
`#dynamic-controls`), clicked the real "Style" tab button, then drove the real `<select>`
elements for "Fill Style" and the collapse sub-control exactly as a user would (set `.value`,
dispatch a real `change` event). This exercises the actual `fillStyleControls`/
`SCENE_FILL_STYLES.effectiveLaw` code path end to end, not an isolated function call.

Screenshots saved under `docs/3d-audit/fill-audit/after/U5b/`:

- `bundleCount-baseline-no-caveat.png` / `contFieldSigmoid-baseline-no-caveat.png` — full app,
  bare survivor selected (sub-control at its default), no caveat line. **LOOKED**: confirmed
  no red caveat paragraph under the Style controls in either.
- `bundleDither-full.png` + `bundleDither-crop-native.png` (native-resolution crop of the
  caveat region) — Fill Style = "Bundle · Count", Bundle mode = "Dithered". **LOOKED**:
  crop shows "Fill Style: Bundle · Count" (survivor, unchanged — correct), "Bundle mode:
  Dithered", and a red caveat paragraph reading bundleDither's exact measured caveat text
  from `src/config/scene3d-tone-laws.js`.
- `contFieldTouch-full.png` + `contFieldTouch-crop-native.png` — Fill Style =
  "Continuous Field · Sigmoid", Field floor = "Ink-width floor". **LOOKED**: crop shows
  "Field metric: Screen metric" (default, unchanged), "Field floor: Ink-width floor", and a
  red caveat paragraph reading contFieldTouch's exact measured caveat text.
- `raw-capture-results.json` — script-emitted JSON: exact caveat `textContent` +
  `getBoundingClientRect()` for both cases, `before: null` confirmed for both baselines,
  `pageErrors: []`.
- `report.json` — structured summary of both cases, cross-referenced against
  `BY_ID.<id>.caveat` in the roster config.

No byte-identical-pair question applies here (this unit changes UI text routing, not
geometry/render output).

## Bars changed

None. No numeric threshold, tolerance, count bar, or pinned fingerprint changed in any test.

## Files touched

- `src/config/context-bar.js` — added `SCENE_FILL_STYLES.effectiveLaw`.
- `src/ui/panels/scene3d-panel.js` — `fillStyleControls`'s caveat block reads the effective
  law instead of the resolved survivor.
- `src/ui/shell/context-bar.js` — `buildStyleBody`'s caveat line, same change.
- `tests/unit/scene3d-tone-law-collapse.test.js` — 2 new RGR tests (U4/U5 caveat-visibility
  describe blocks).
- `tests/integration/scene3d-fill-style-picker.test.js` — 4 new RGR tests (docked panel ×2,
  ctxbar flyout ×2).
- `docs/3d-audit/fill-audit/after/U5b/` — evidence (screenshots, report.json,
  raw-capture-results.json).

## Docs contract

This is a UI **behavior fix** restoring previously-visible copy, not a new label or new
copy — the picker's user-visible text contract is unchanged (the same caveat strings that
used to show under `bundleDither`/`contFieldTouch` as their own rows now show again once
their collapse sub-control selects them). No in-app help/roster text change is needed: the
roster copy (`BY_ID[id].caveat`) is untouched, only which id it is looked up on. Recommend
the orchestrator add one CHANGELOG line under the next release, worktree/version left to the
orchestrator's merge:

> Fixed: a folded Fill Style law's measured caveat (e.g. Bundle mode: Dithered, Field floor:
> Ink-width floor) now shows again in the Style picker and Style tab — it was silently hidden
> by the U1–U5 fill-roster collapse.

## Also queued on this lane (not started, out of scope for this unit)

LEDGER.md: `W-30b` (`buildFaceFootprint` wired to `Shadows.projectLightToPlane`) is queued on
`fill-collapse` **after U5b**, and this report's lane is `fill-collapse-2`, not
`fill-collapse` — the orchestrator should confirm which worktree actually owns W-30b before
starting it (LEDGER.md says "fill-collapse", this worktree is "fill-collapse-2"). Not touched
here; flagging only.
