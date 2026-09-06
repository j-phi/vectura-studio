STATUS: DONE

# W-10d — hide the `originSpiral` Fill Style on the torus (impl)

**Lane:** fill-audit (`.claude/worktrees/fill-audit`, branch `3d-scene/fill-audit`, port 8476)
**Base:** `8bd1581b` (accepted W-15c) → **new HEAD:** `142afe58653ac9d6efe8c56dffcc97b53190fe1b`
**Files touched:** `src/config/context-bar.js`, `tests/integration/scene3d-fill-style-picker.test.js` — nothing else.

## Background

STILL-OPEN.md (W-10/W-10b/W-10c) and `W-10c-impl-2.md`/`-impl-3.md`: `originSpiral` cannot be made
plottable on the torus. After W-10c's plot-floor raise (0.8x → 1.0x pen), the mono law's lower-left
radial fan renders as solid ink wedges — measured **87.8%** of interior pixels sit in a blank-paper run
longer than two pen widths, **worse** than W-10b's 73.9%. Iteration 3 (`e6b85de4`) tried an in-lane gate
in `surface-fill-mono.js` and came back BLOCKED: no primitive id reaches that file (`chartFor` has
already resolved the primitive to a bare parametrization function before `lawSpiral` runs), and the only
geometric-inference alternative reads 0% hole fraction on the real gallery scene — empirically
unreliable on the exact scene it would need to gate. STILL-OPEN.md's own W-10d entry names the exact
patch and the exact file/lane: `SCENE_FILL_STYLES.isReachableOn` in `src/config/context-bar.js:397`
(fill-audit lane, not fill-audit-c), the same mechanism W-03 used to hide 45 styles on spiral/stipple.

## What changed

`src/config/context-bar.js`, inside `SCENE_FILL_STYLES.isReachableOn`, after the pyramid+hatch+
fineLadder check and before the final `return true;`:

```js
if (primitiveMode === 'torus' && id === 'originSpiral') return false;
```

Unconditional of `mapper` — hatch/crosshatch/contour all dispatch the same mono law, and the wedge
defect lives in the law itself, not in which Type reaches it. Every other law stays reachable on torus
(isFaceted('torus') is still false — it is curved exactly like sphere/cone/cylinder). Cone and sphere
are unaffected; the gate names `'torus'` specifically.

**Mechanism note (matches the existing convention, not a new one):** `SCENE_FILL_STYLES.groups()`
already renders every option in the `<select>` and marks the unreachable ones `disabled: true` with a
`" — no effect here"` label suffix — it does **not** remove the `<option>` element. "Hide" in this
codebase means greyed + suffixed, not absent from the DOM (confirmed both by reading `groups()`'s
source and by the live screenshots below, and consistent with the STILL-OPEN.md note on the W-02 doc/
implementation mismatch).

**Does not reach saved documents.** `clampStyleParam`'s `'toneLaw'` case (`src/core/scene3d/params.js`)
only rejects ids the roster does not recognize *at all* — it takes no `primitiveMode` argument and
cannot know an id is unreachable on a specific shape. A torus layer already saved (or hand-edited) with
`toneLaw: 'originSpiral'` still normalizes to `'originSpiral'` unchanged and the engine still renders
the known wedge. `isReachableOn` is the only place that knows better, and it only shapes the dropdown.
Verified this directly with a new test calling `Scene3D.Params.normalizeStyle` and `sanitizeSceneParams`
— no throw, id preserved through both the single-style and full-scene-sanitize paths. This is the
"documented fallback" the brief asked me to find and cite: there isn't an engine-level correction: this
unit is a UI-picker hide, not a render-path repair, exactly as STILL-OPEN.md frames it ("hidden, not
repaired") and exactly as FU-1 (thread a primitive id into the mono fill) exists to eventually change.

## RGR proof

**RED at base `8bd1581b`** (`tests/integration/scene3d-fill-style-picker.test.js`):
- `'torus is curved like any other chart-wrapped primitive, EXCEPT originSpiral is hidden there (W-10d)'`
  — `expect(F.isReachableOn('originSpiral', 'torus')).toBe(false)` failed: received `true`.
- `'groups("torus") marks originSpiral disabled + suffixed; groups("cone"/"sphere") leaves it live (W-10d)'`
  — `expect(torusEntry.disabled).toBe(true)` failed: received `false`.
- `'a torus layer saved with toneLaw "originSpiral" deserializes unchanged... (W-10d)'`
  — `expect(F.isReachableOn(...)).toBe(false)` failed: received `true`.
- 3 failed / 128 skipped (describe-scoped `-t "W-10d"` run), matching the fix's expected surface exactly.

I also updated the pre-existing pinned test `'a curved (chart-wrapped) primitive reaches every law —
sphere and pyramid'`, which used to loop `['sphere', 'pyramid', 'torus', 'cylinder']` and assert every
roster id + `ladder`/`none` reachable on all four. This is a deliberate, documented contract change
(RGR rule: stale assertion, product behavior intentionally changed) — I removed `'torus'` from that
loop and added the new torus-specific test above in its place, which asserts every OTHER law stays
reachable and only `originSpiral` is excluded.

**GREEN after the one-line gate:** all 3 new/updated assertions pass; full file **131/131** passed.

## Guard suites run (all named in the brief)

| Suite | Result |
|---|---|
| `tests/integration/scene3d-fill-style-picker.test.js` (W-02/W-03 picker tests) | 131/131 |
| `tests/unit/scene3d-solid-cap-reachability.test.js` | 6/6 |
| `tests/integration/scene3d-panel.test.js` | 36/36 |
| `tests/integration/scene3d-panel-style-live-sync.test.js` | 6/6 |
| `tests/unit/scene3d-tone-algo-default.test.js` | 6/6 |
| `tests/unit/scene3d-tone-law-params.test.js` (params.js normalize/clamp, read-only sanity — unmodified) | 13/13 |

**198/198 total, 0 failed, 0 skipped** across these 6 files.

## Live verification (localhost:8476, v1.3.98 — matches worktree `package.json`)

The shelf's "Add Layer → Algorithm Layer" native dropdown menu would not stay open under Playwright's
automated click path in this session (repeated toggling, a known flakiness with this custom menu under
synthetic events) — I built the equivalent state through `app.engine.addLayer('scene3d')` /
`engine.setObjectPrimitive(objId, 'torus')`, the same engine calls the shelf UI itself invokes, then
drove the real docked panel (Object → Style tab) by clicking through the actual DOM, which is the
surface under test. No shortcut was taken around `isReachableOn`/`groups()` themselves — those ran
live, unmodified from what a real user session executes.

- Selected object primitive **torus**, Type = Hatch (default). Opened the docked panel's Style tab.
  The `Fill Style` control is a native `<select>` — its open dropdown popup is OS-painted and not
  capturable by a normal page screenshot, so I temporarily set the element's `size` attribute to render
  it as an inline listbox (a real, supported HTML behavior, not a DOM mutation of app state), scrolled to
  the `originSpiral` row, screenshotted, then removed the attribute. Result:
  **`docs/3d-audit/fill-audit/after/W-10d/torus-fillstyle-list-scrolled.png`** — shows
  **"Origin Spiral — no effect here"** rendered dimmed/disabled, exactly as `groups()` computes.
  The accessibility snapshot independently confirms: `option "Origin Spiral — no effect here" [disabled]`.
- Switched the same object to **cone** (Type still Hatch), rebuilt the Style tab. Result:
  **`docs/3d-audit/fill-audit/after/W-10d/cone-fillstyle-list-scrolled.png`** — shows
  **"Origin Spiral"** at full brightness, not disabled, no suffix. Canvas rendered a normal cone with a
  hatch fill; 0 console errors across the whole session (1 pre-existing unrelated warning, unchanged by
  this fix).
- Sphere was not separately screenshotted (cone and sphere share the identical code path — the gate
  names `'torus'` only) but is covered directly by the automated suite (both are asserted reachable in
  the new tests, 131/131 passing).

No capture-script cells were shot for this unit: it is a picker-presentation change in
`context-bar.js`, not a render-pipeline change — no `scene3d-capture.js` cell exists for "Fill Style
dropdown contents," and nothing in `surface-fill-mono.js`/`scene3d.js`'s render path was touched. The
known torus wedge pixels are unchanged; `report.json`'s `byte_identical_pairs` records this explicitly.

## Documentation contract lines (for the orchestrator to apply at merge — not edited in this worktree)

- **README.md:** "The Origin Spiral fill style is hidden (greyed out) in the Fill Style picker when the
  selected object is a torus — its known ink-wedge defect on that shape could not be fixed, so it is
  hidden from new picks rather than shipped broken."
- **CHANGELOG.md:** "Fixed: the Origin Spiral fill style is no longer offered as a live pick on torus
  objects in the 3D Scene Fill Style picker (it rendered as solid ink wedges there); cone and sphere are
  unaffected."

## Open follow-ups (not attempted here, correctly out of scope)

- **FU-1** (STILL-OPEN.md): thread `primitiveMode: opts.mode` into `MonoFill().emit()`
  (`src/core/scene3d/surface-fill.js` ~10202) and through `surface-fill-mono.js`'s `emit`/`makeCtx`, so
  a future code-level engine gate (not just the UI hide) could read `C.primitiveMode === 'torus'`
  directly. Spans `surface-fill.js` (fill-audit-a) and `surface-fill-mono.js` (fill-audit-c) — two
  other lanes, serialized.
- The torus wedge itself remains genuinely unrepaired (STILL-OPEN.md: "the torus is not fixed") — this
  unit only removes it from new picker choices.

## Commit

`142afe58653ac9d6efe8c56dffcc97b53190fe1b` in the worktree (not pushed, not merged). `git show --stat`
confirms exactly the two intended files changed (+101/-1).
