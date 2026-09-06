STATUS: ACCEPT-WITH-FOLLOWUPS

# W-10d — originSpiral hidden on the torus via isReachableOn (review)

**Lane:** fill-audit (`.claude/worktrees/fill-audit`, branch `3d-scene/fill-audit`, port 8476)
**Reviewed:** base `8bd1581b` → head `142afe58653ac9d6efe8c56dffcc97b53190fe1b`
**Reviewer scope:** read-only in the worktree; scratch export at `/private/tmp/claude-501/scratch-W-10d`
(archive of `8bd1581b` + symlinked `node_modules`); live verification on the worktree's own dev server,
already running on `localhost:8476` (no server started by me).

## 1. Diff scope

`git diff --stat 8bd1581b..142afe58`:

```
src/config/context-bar.js                                        | 16 ++
tests/integration/scene3d-fill-style-picker.test.js               | 86 ++++-
2 files changed, 101 insertions(+), 1 deletion(-)
```

Confirmed: exactly the two files the impl report claims. The source change is a single-line gate
(`if (primitiveMode === 'torus' && id === 'originSpiral') return false;`) plus a 15-line comment,
inserted after the pyramid+hatch+fineLadder check and before the final `return true;` — matches the
exact location STILL-OPEN.md's W-10d entry names (`context-bar.js:397` pre-patch). No touch to
`surface-fill.js`, `surface-fill-mono.js`, or `scene3d.js`'s render path.

## 2. Is "disabled + ' — no effect here'" the right convention here?

Per the orchestrator's ruling, this is **not** a rejection ground — it is the picker's established
convention, and matches W-03's `CURVED_SPIRAL_STIPPLE_INERT` gate exactly (same file, same
`isReachableOn` → `groups()` → `disabled:true` + `NO_EFFECT_SUFFIX` pipeline, no `<option>` removal).
Read `SCENE_FILL_STYLES.groups()` (context-bar.js:259-286) directly: it is unconditional — every
option is always rendered, gated only through `disabled`/label-suffix. STILL-OPEN.md's own W-02 note
("Fill Style row is ABSENT... not greyed") is a stale **worklist-text** mismatch already logged there,
not a second live convention — confirmed by reading the code, not just the docs. I concur with the
orchestrator: accept the mechanism as-is.

One genuine label-accuracy nuance worth recording (not a reject ground, a follow-up):
`NO_EFFECT_SUFFIX = ' — no effect here'` is literally true for the faceted-primitive and
spiral/stipple gates (byte-identical to Ladder, measured) but is **not literally true** for the
torus/originSpiral case — the defect is not "no effect," it is "effect, but unplottable ink wedges."
A user reading "no effect here" could reasonably infer the render is safe-but-unchanged, which is the
wrong mental model for this specific gate. Low priority; flagging for whoever eventually revisits
picker copy (not blocking).

## 3. RED/GREEN reproduction (scratch export of `8bd1581b`)

```
mkdir -p /private/tmp/claude-501/scratch-W-10d
git archive 8bd1581b | tar -x -C /private/tmp/claude-501/scratch-W-10d
ln -sfn <worktree>/node_modules /private/tmp/claude-501/scratch-W-10d/node_modules
cp <worktree>/tests/integration/scene3d-fill-style-picker.test.js  \
   /private/tmp/claude-501/scratch-W-10d/tests/integration/scene3d-fill-style-picker.test.js
npx vitest run tests/integration/scene3d-fill-style-picker.test.js -t "W-10d"
```

Result: **3 failed / 128 skipped (131)** — exact match to the impl report's claimed RED numbers,
including the exact assertion failures (`isReachableOn('originSpiral','torus')` false vs true,
`torusEntry.disabled` false vs true, deserialization `isReachableOn` false vs true). The oracle is
real, not vacuous.

GREEN, in the worktree itself:
- `tests/integration/scene3d-fill-style-picker.test.js` — **131/131 passed**.
- Guard suite (named in the brief): `scene3d-solid-cap-reachability` 6/6, `scene3d-panel` 36/36,
  `scene3d-panel-style-live-sync` 6/6, `scene3d-tone-algo-default` 6/6, `scene3d-tone-law-params` 13/13.
  **198/198 total across the 6 files, 0 failed, 0 skipped** — matches the impl report exactly.

## 4. Live verification — the picker convention (new picks)

Confirmed independently: selecting a torus object and opening the Style tab shows Fill Style =
"Origin Spiral — no effect here" **disabled**, exactly reproducing the impl's screenshot claims (I
drove the same DOM path, not a shortcut).

## 5. Live verification — the saved-document gap (the orchestrator's actual ask)

This is the part that needed independent proof, not just the doc's assertion. I constructed the
scenario a saved/hand-edited `.vectura` would produce — a scene-tree torus object3d layer whose
`params.style.params.toneLaw` is directly set to `'originSpiral'` (bypassing the picker entirely, the
same as a pre-fix document loading, or a hand-edited file) — via the app's own engine calls
(`engine.addSceneGroup()` → `engine.addObjectToScene(groupId, 'torus')`, then set
`layer.params.style.params.toneLaw = 'originSpiral'` directly, then `engine.computeAllDisplayGeometry()`
+ `app.renderer.draw()`, all real app code paths, nothing mocked), then screenshotted the canvas AND
the docked Style tab in the same state:

- **Canvas**: renders large solid black/white banded wedges on the torus — visually exactly the "solid
  ink wedge" defect STILL-OPEN.md's W-10c section describes (87.8% interior-pixel blank-paper-run
  measurement). The picker gate does **not** block this render; nothing short-circuits `generate()`.
- **Style tab, same object**: Fill Style field reads **"Origin Spiral — no effect here"**, shown as
  the *currently selected* value of a disabled option — the UI is internally consistent (it does show
  the true state) but the label is doubly wrong here: not "no effect" (see §2) and not something the
  user is being warned is currently, actively producing bad ink on their canvas.

This independently confirms the impl report's and STILL-OPEN.md's claim (b): `clampStyleParam`'s
`'toneLaw'` case (`src/core/scene3d/params.js`) takes no `primitiveMode` and only rejects ids the
roster does not recognize at all, so a torus object carrying `toneLaw:'originSpiral'` — from a
pre-fix document, a hand-edit, or (I confirmed) even a fresh in-session direct param write —
normalizes and renders completely unchanged. W-10d is a picker-presentation fix only, as documented,
and that framing is accurate.

## 6. Feasibility of a saved-document fallback inside lane files (params.js / scene3d.js / context-bar.js)

**Yes, achievable without touching `surface-fill.js`/`surface-fill-mono.js`/scene3d.js's render path —
confined to `src/core/scene3d/params.js`, which already sits in this lane's working set (the impl's own
new deserialization test calls `Params.normalizeStyle`/`sanitizeSceneParams`).** Two call sites, both
in params.js, both already have a primitive and its style resolved in the same scope:

1. **Monolith import/load path** — `normalizeParams` (`params.js:1291`). `out.objects` is assembled at
   `params.js:1304-1307` and `out.styleTable = normalizeStyleTable(src.styleTable)` at `params.js:1325`.
   A correlation pass added immediately after line 1325 — build an `id → primitive` map from
   `out.objects`, walk `out.styleTable.byObject` (and `byFace`, keyed `objectId/faceId`) and remap any
   `params.toneLaw` where `Vectura.SCENE_FILL_STYLES.isReachableOn(toneLaw, primitive, undefined,
   style.mapper)` returns false, to the roster default (`ladder`, mirroring the existing
   "unknown id → ladder" fallback already in `clampStyleParam`'s own `'toneLaw'` case, `params.js:730`).
2. **Live scene-tree compose path** — `collectSceneParams` (`params.js:1042`). This is the **more
   important** of the two: `_composeSceneGroup` (`engine.js:2690`) feeds this function's output
   straight into `algo.generate()` **without ever calling `normalizeParams`/`sanitizeSceneParams`** —
   so a fix only in (1) would correct a `.vectura` file at import but leave every live in-session
   scene-tree edit (exactly the state I reproduced in §5) uncorrected. The object branch already
   resolves both pieces of data in the same iteration: `n.primitive` (from
   `normalizeObjectLayerParams(item.params)`) and `n.style` are both in scope at
   `params.js:1094` (`if (declaresStyle(item.params)) byObject[item.id] = n.style;`) — the same
   `isReachableOn` check could gate `n.style.params.toneLaw` right there before the assignment.

Both call sites can reach `Vectura.SCENE_FILL_STYLES.isReachableOn` safely: it is a **lazy** runtime
read through the shared `Vectura` global, not a load-order dependency — `context-bar.js`'s own
`isReachableOn` already does the *same* cross-module lazy read in the opposite direction (of
`Vectura.Scene3D.Params.SURFACE_FILL_MAPPERS`, which is defined in `params.js`, loaded *after*
`context-bar.js` per the documented config-before-core order) and it works today, because neither
call happens at module-parse time.

**Recommend opening this as W-10d-2, scoped exactly to:**
- `src/core/scene3d/params.js`: `collectSceneParams` (primary — live-tree path) and `normalizeParams`
  (secondary — monolith import path), remap an unreachable `toneLaw` to the roster default at
  normalization time, using `Vectura.SCENE_FILL_STYLES.isReachableOn`.
- Byte-identical guard for every currently-reachable combination (the remap must be provably a
  no-op everywhere except the torus+originSpiral — and any future — unreachable combinations).
- **Open design question the follow-up must settle, not assume:** silently rewriting a live-edited
  scene-tree object's `toneLaw` on every compose pass is a different UX contract than a one-time
  load-time migration (the object's Style tab would show a stale "Origin Spiral" selection while the
  canvas has already snapped to Ladder, unless the panel's displayed value is also corrected in the
  same pass) — this needs an explicit product call, not a silent side effect of the params fix.
- Does **not** require `surface-fill*.js`; FU-1 (threading a primitive id into the mono law itself)
  stays a separate, larger, two-lane follow-up for anyone who wants a true engine-level fix rather
  than a load/compose-time correction.

## 7. Presets

`grep -rl "originSpiral" user-presets/` — **zero matches, anywhere** (not just on torus). No shipped
preset is affected by this gate or would need remediation.

## 8. README/CHANGELOG lines proposed in the impl report

No README/CHANGELOG edits exist in the worktree (correctly deferred to merge time per the impl report).
Checked the proposed text against everything verified above:
- README line: "hidden (greyed out)... when the selected object is a torus... hidden from new picks
  rather than shipped broken" — accurate; does not overclaim a repair.
- CHANGELOG line: "no longer offered as a live pick on torus objects... cone and sphere are
  unaffected" — accurate; "live pick" correctly scopes the claim to new selections, not saved state.

Both lines are honest about scope (picker-only) and match what I independently verified in §4/§5.

## Verdict

**ACCEPT-WITH-FOLLOWUPS.** The unit does exactly what it claims, at exactly the file scope it claims,
with a real RED→GREEN proof reproduced independently against the pre-fix tree, guard suites green
(198/198), no preset impact, and accurate doc-contract lines. Ship it as landed.

Follow-ups (do not block this unit's acceptance):
1. **Open W-10d-2** — saved-document/live-tree `toneLaw` fallback in `params.js`
   (`collectSceneParams` + `normalizeParams`), scoped exactly as §6 above. This is the one item that
   materially matters: right now a torus object that already has `originSpiral` set (old document,
   hand-edit, or a value set before this unit shipped) silently keeps rendering unplottable ink wedges
   forever, with the picker showing a disabled "no effect here" label that is not true for this case.
2. Low-priority copy nit: `NO_EFFECT_SUFFIX` mislabels the torus/originSpiral case (§2) — not a
   blocker, worth folding into whichever unit next touches picker copy.
