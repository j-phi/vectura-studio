STATUS: PLAN-READY

# W-10d-3 — plan: the Style tab shows the WRONG sub-control value for a folded tone law

**Lane:** fill-audit-2 (`.claude/worktrees/fill-audit-2`, branch at `47a5a755`, clean; port **8476**).
**Planner scratch:** `/private/tmp/claude-501/scratch-W10d3` (export of `47a5a755`, `node_modules`
symlinked, removed at the end of this plan). Everything numbered below was **measured in that export**,
not reasoned from the source.
**Read:** `AGENT-PROTOCOL.md`; `STILL-OPEN.md` W-10d/-2/-3 (lines 66, 88, 96–98, 162, 179);
`LEDGER.md` rows 52/54/56, row **21d**, the 2026-09-05 **write-back ruling** (LEDGER.md ~800),
the U9 scope ruling (~740); `W-10d-impl.md`, `W-10d-review.md`;
`.claude/worktrees/fill-collapse-2/docs/3d-audit/lane-reports/U5b-impl.md`, `U5b-review.md`,
`U5b-2-review.md`; `U9-impl.md`, `U9-review.md`. Lane commits diffed read-only:
`fill-collapse-2` **49475ccd**, **1e681432**; `handoff-c2` **fc8b0fba**.

---

## 1. Reproduce the UI lie

### 1.1 The scene (measured, end to end through the real save/open path)

A scene-tree `object3d` sphere, `mapper: 'hatch'`, whose style bag carries a **raw folded law id** —
the exact shape any `.vectura` saved before the U1→U5 collapse (v ≤ 1.3.98) contains:

```js
const e1 = new V.VectorEngine();
const gid = e1.addLayer('scene3d');                       // scene group + one object3d child
const obj = e1.getLayerDescendants(gid).find((l) => l.type === 'object3d');
obj.params.style = { penId: null, mapper: 'hatch', params: { toneLaw: 'bundleDither' } };
const e2 = new V.VectorEngine();
e2.importState(JSON.parse(JSON.stringify(e1.exportState())));   // save → open
```

Measured in the scratch export at `47a5a755`:

| | value |
|---|---|
| leaf bag **after open** (`obj2.params.style.params`) | `{"toneLaw":"bundleDither"}` — **raw, unmigrated** |
| assembled bag the compositor renders (`group._sceneAssembled.styleTable.byObject[id].params`) | `{"toneLaw":"bundleCount","bundleMode":"dither"}` |
| `Params.resolveToneLaw(assembled)` — **what the canvas draws** | **`bundleDither`** ✅ |
| docked Style tab, row "Bundle mode" | **`count`** ❌ (should read `dither`) |
| docked Style tab, Fill Style row | `bundleCount` ✅ (correct — `FS.resolve` is alias-aware) |
| docked Style tab caveat line (`.vs3-lawnote.is-caveat`) | **absent** ❌ (`BY_ID.bundleDither.caveat` is a real measured caveat) |
| ctxbar Style flyout, row "Bundle mode" | **`count`** ❌ |

Same lie on all three collapse clusters (measured, both surfaces):

| raw stored `toneLaw` | Fill Style row shows | sub-control shows **today** | must show | canvas actually renders |
|---|---|---|---|---|
| `fineLadder` | `ladder` | Rung detail = **`coarse`** | `fine` | `fineLadder` |
| `bundleDither` | `bundleCount` | Bundle mode = **`count`** | `dither` | `bundleDither` |
| `contFieldTouch` | `contFieldSigmoid` | Field metric = `screen` (correct), Field floor = **`plot`** | `touch` | `contFieldTouch` |

All **13** `ALIASES` entries lie: every alias's seeded value differs from its descriptor's `default`
(`rungMode` fine/finePhase/perceptual vs default `coarse`; `bandProfile` hard/nib vs `taper`;
`weightEase` smooth vs `step`; `bundleMode` eased/dither/handoff vs `count`; `fieldMetric`
foreshortened/surface/quantised vs `screen`; `fieldFloor` touch vs `plot`) ⇒ **13/13 wrong**.

### 1.2 File:line — the whole path, at `47a5a755`

**Compose (render side — correct):**
- `src/core/engine.js:2650` `_composeSceneGroup(group)`; collects each child as
  `{ kind:'object', id: layer.id, params: layer.params }` (**the live layer bag by reference**).
- `src/core/engine.js:2690` `const assembled = Params.collectSceneParams(group.params, collected);`
- `src/core/scene3d/params.js:1138` `collectSceneParams` → `:1075` `style: normalizeStyle(src.style)`
  (inside `normalizeObjectLayerParams`).
- `src/core/scene3d/params.js:833` `normalizeStyle` — the **U0 migration shim** (`:848`–`:872`) rewrites
  a folded id to `{ toneLaw: <survivor>, <collapseKey>: <value> }` **on the copy it returns**, never on
  `src.params`.
- `src/core/engine.js:2714` `paths = algo.generate(assembled, rng, noise, bounds)` →
  `src/core/algorithms/scene3d.js:1191` `const p = Params.normalizeParams(params);` →
  `src/core/scene3d/params.js:810` `resolveToneLaw` → `bundleDither`. **Render correct.**

**Panel (read side — wrong):**
- `src/ui/panels/scene3d-panel.js:627` `fillStyleControls`.
- `:678` `const styleParamBag = o.paramsBag || {};` — **the raw live layer bag**.
- `:679`–`:690` `FS.styleParams(law).forEach(...)`:
  `const has = styleParamBag[d.key] !== undefined && ...; const dv = has ? styleParamBag[d.key] : d.default;`
  → `d.default`, because the shim's sibling key only exists on the discarded copy. **This is the lie.**
- Call sites, all three passing a raw bag: `:1307` (object3d **leaf** panel — the one a user reaches),
  `:1684` (fused `booleanGroup3d`), `:4114` (`renderControl` `'lawpick'`, scene/object/face editor).
- ctxbar twin: `src/ui/shell/context-bar.js:1522` `buildStyleBody`, `:1552`
  `const law = FS.resolve(params.toneLaw)`, `:1607`–`:1625` the identical `styleParams` loop (and its
  `mixed:` closure, which repeats the same default-fallback).
- The bag both surfaces read on a tree object comes from `src/render/renderer.js:12712`
  `getSceneObjectResolvedStyle` → `:12756` `_sceneStyleResolveTable`, which patches in the **child
  layer's LIVE `params.style`** — i.e. the raw bag again. **Both surfaces lie identically; there is no
  surface-vs-surface divergence to exploit, only UI-vs-canvas.**

**Where `normalizeParams`/`sanitizeSceneParams` *are* called (and why the leaf escapes):**
- `src/core/engine.js:411` — `sanitizeImportedParams` runs `sanitizeSceneParams` for
  `layerType === 'scene3d'` ⇒ a **monolith**'s `styleTable` **is** migrated at load and persisted
  (`:1931 layer.params = sanitizeImportedParams(...)`).
- `src/core/engine.js:422` — for `object3d` / `sceneGroup3d` / `booleanGroup3d` it runs **only**
  `migrateScene(sanitized)` (the `SCENE_MIGRATIONS` chain). **`normalizeStyle` is never reached.**
  This is the load channel, and it is narrower and more precise than the note in STILL-OPEN.
- `src/core/algorithms/scene3d.js:1191`, `src/render/renderer.js:10178`, `:12322`,
  `src/core/engine.js:1267` (`expandMonolithToTree`, which normalizes **first** — so monolith→tree
  expansion is clean).

### 1.3 Record correction owed to the ledger

STILL-OPEN/LEDGER say `_composeSceneGroup` "feeds `algo.generate()` **without ever calling**
`normalizeParams`/`sanitizeSceneParams`". Measured: **`algo.generate` calls `normalizeParams` itself**
(`scene3d.js:1191`), so the render is always normalized. The true defect is narrower and should be
recorded as such: **normalization is applied to a throw-away copy and never written back to
`layer.params`, and both UI surfaces read the layer bag.** The reachable load channel is
`engine.js:422` (object3d leaves get `migrateScene` only), **not** the compose call.

---

## 2. Root cause, and how it sits against W-10d-2 / U5b / U9

**Root cause (one sentence).** `normalizeStyle`'s U0 migration shim reconstructs
`{survivor + collapse sub-param}` into the *assembled copy* the compositor consumes; the panel and the
ctxbar read the *layer's own* bag, where the folded id still sits alone, so every collapse sub-control
falls back to its descriptor `default`.

**vs. W-10d-2 — INDEPENDENT, not a subset and not a prerequisite.**
- W-10d-2 is about an **unreachable** law (torus + `originSpiral`): the stored law is one the picker
  refuses to offer, the correct resolution changes **what the canvas draws**, and the 2026-09-05 ruling
  therefore mandates a **WRITE-BACK, once** (load + first compose after a live edit) so the Style tab and
  the canvas agree.
- W-10d-3 is about a **folded** law: the canvas is **already right** (measured above). Nothing needs to
  change on the render side, and a write-back is the *wrong* tool here — it would dirty a document and
  push an undo entry as a side effect of merely opening a panel, for a value that is not wrong.
- They share a *description* ("the layer bag is never migrated"), not a fix. **Neither blocks the other.**
- **Forward-compatibility, proven by construction:** the rank-1 fix seeds a display value **only when
  `toneLaw` is itself a key of `ALIASES`**. After W-10d-2 (or any future write-back) migrates the bag,
  `toneLaw` is a survivor id, never an `ALIASES` key ⇒ the seed never fires and the helper returns the
  **same object reference** it was given. W-10d-3 becomes a provable no-op the day W-10d-2 lands; no
  double-correction, no ordering constraint.

**vs. U5b's `effectiveLaw` shim — W-10d-3 completes it on the raw path (measured).**
U5b (`49475ccd`, `1e681432`, fill-collapse-2) routes the caveat through
`SCENE_FILL_STYLES.effectiveLaw(survivor, paramsBag)`, which reconstructs the folded id **from the bag's
sibling key**. On a raw folded bag there is no sibling key, so `effectiveLaw('bundleCount',
{toneLaw:'bundleDither'})` returns `'bundleCount'` and **U5b's fix is silently defeated** — the caveat is
still missing. Measured, stacking the rank-1 fix under a local simulation of U5b's two hunks:
the caveat renders verbatim (`"A negative result, kept as one: waving the pass-count bounda…"`) with
**zero extra code**, because the rank-1 fix hands `effectiveLaw` a seeded bag. The two units compose;
the implementer must **not** duplicate `effectiveLaw`.

**vs. U9's shadow bag — HARD BOUNDARY, do not cross.**
U9 (`fc8b0fba`, handoff-c2) makes `normalizeShadow` pass a folded id through **unchanged**, because
`shadows.js`'s `HATCH_LAW_RECIPES` is keyed by the *internal* id. The reviewer's binding constraint is
**two mechanisms, not one path**: style bag = shim reconstruction, shadow bag = raw pass-through.
The shadow tone-law rows (`scene3d-panel.js:3193`, `src/ui/shell/context-bar.js:1872`) render a **bare
`FS.resolve(shadowToneLaw)` select with no `FS.styleParams` sub-controls and no caveat** (verified in
source). Therefore:
- The fix touches **only** the `FS.styleParams(law)` sub-control loops. The shadow rows are structurally
  out of reach and **must stay untouched** — adding a sub-control there would give the shadow bag the
  style bag's two-key shape, which is exactly what U9's reviewer forbids.
- **Recorded, not fixed (follow-up):** the shadow picker *is* also cosmetically imprecise post-U9 — it
  shows `Ladder` for a stored `fineLadder` while `shadows.js:2713` renders `fineLadder`'s own recipe.
  That is a **one-key display question on a one-key bag**, adjacent to **U9b**, and is explicitly out of
  scope here. File as **W-10d-3b**.

---

## 3. RED oracle

### 3.1 Integration (primary) — `tests/integration/scene3d-fill-style-picker.test.js`

Extend the existing file; its harnesses already exist: `mountLeaf` (`:1576`), `leafRow` (`:1596`),
`openStyle`/`rowCtl`/`openFly` (`:855`–`:866`), and the real-tree pattern at `:568`–`:572`
(`engine.addLayer('scene3d')` + `getLayerDescendants`).

Baseline today: **140/140 pass** (re-measured in the scratch export, 20.8 s).

| # | Test | Assertion | **Today** | Must be |
|---|---|---|---|---|
| R1 | docked leaf, `params:{toneLaw:'fineLadder'}` | `leafRow(c,'Rung detail').querySelector('select').value` | **`'coarse'`** | `'fine'` |
| R1g | same | `leafRow(c,'Fill Style').…value` (over-fix guard) | `'ladder'` | `'ladder'` (unchanged) |
| R2 | docked leaf, `toneLaw:'bundleDither'` | `leafRow(c,'Bundle mode').…value` | **`'count'`** | `'dither'` |
| R3 | ctxbar flyout on a **real tree** child, `toneLaw:'contFieldTouch'` | `rowCtl(fly,'Field floor').querySelector('select').value` | **`'plot'`** | `'touch'` |
| R3g | same | `rowCtl(fly,'Field metric').…value` | `'screen'` | `'screen'` (untouched) |
| R4 | save→open round trip (`exportState`/`importState`, §1.1) | leaf `Bundle mode` after reopen | **`'count'`** | `'dither'` |
| R5 | **canvas-vs-UI anchor** (same fixture as R4) | `Params.resolveToneLaw(group._sceneAssembled.styleTable.byObject[id].params)` | `'bundleDither'` | `'bundleDither'` (**passes today** — pins that the render is already right and this unit must not move it) |

### 3.2 Unit (generative) — **new file** `tests/unit/scene3d-fill-style-display-params.test.js`

A new file deliberately: `tests/unit/scene3d-tone-law-collapse.test.js` is a **documented three-way
merge hazard** (main `e429cfc5` + U9 `fc8b0fba` + fill-collapse-2's checkpoint), and U5b-2 already split
work *out* of it for that reason. Do not become the fourth editor.

- **G1 — all 13 aliases, both directions.** For every `id` in `ALIASES`: the value the panel would
  display for the seeded descriptor key must map, through that descriptor's own `options[].law`, to
  **exactly** `Params.resolveToneLaw(Params.normalizeStyle({params:{toneLaw:id}}).params)`.
  Today: **0/13 agree** (each displays the default option, whose `law` is the survivor).
  After: **13/13**.
- **G2 — integrity.** Every `ALIASES[id].params` key is a declared descriptor `key` of
  `STYLE_PARAMS[ALIASES[id].into]`, and every seeded value is a real `options[].value` there.
  (Passes today; pins that the seed can never produce a `<select>` value with no matching `<option>`.)
- **G3 — no-op identity.** For every id in `PICKER_IDS` (a non-folded bag),
  `FS.displayParams(id, bag) === bag` (**same object reference**, not merely equal). Also for
  `undefined`/`''`/`'__garbage__'`.

### 3.3 Mutation check (must be run, and reported)

Stub `SCENE_FILL_STYLES.displayParams = (raw, bag) => bag` (present-but-inert — the shape the U5b
reviewer specifically hunted for). R1–R4 and G1 must re-fail on **real assertions**
(`expected 'coarse' to be 'fine'`), never on `TypeError` / `is not a function`. Revert, diff back clean.

---

## 4. Ranked fixes

### Rank 1 — `SCENE_FILL_STYLES.displayParams`: seed the DISPLAY bag from `ALIASES` (RECOMMENDED)

**Prototyped and measured in the scratch export. It works, and the guard suite is untouched
(140/140 pass with it applied).**

**Edit 1 — `src/config/context-bar.js`, inserted after `styleParams` (ends `:257`):**

```js
  // W-10d-3 — the bag the picker should DISPLAY for a style whose `toneLaw`
  // is still a RAW folded id (a .vectura saved before the U1-U5 collapse; an
  // object3d leaf is never normalized at load — engine.js:422 runs only
  // migrateScene for that type). The compositor sees the shim's reconstruction
  // (params.js normalizeStyle, :848) and renders the folded law correctly; the
  // panel reads the LAYER bag, where the sibling collapse key does not exist,
  // and so falls back to the descriptor default. This seeds that key for
  // DISPLAY only - nothing is written back (a write-back at panel-open time
  // would dirty the document and push an undo entry; the once-only write-back
  // contract belongs to W-10d-2, params.js, fill-collapse-2's file).
  //
  // Precedence mirrors normalizeStyle's shim EXACTLY - `=== undefined` only,
  // so an explicitly stored key (including `null`) always wins, and the panel
  // shows the same law resolveToneLaw dispatches. Returns the SAME object when
  // `toneLaw` is not an ALIASES key, so every reachable picker state is a
  // provable no-op (and stays one once W-10d-2 migrates the bag).
  SCENE_FILL_STYLES.displayParams = (rawValue, paramsBag) => {
    const bag = (paramsBag && typeof paramsBag === 'object') ? paramsBag : {};
    const raw = (typeof rawValue === 'string' && rawValue)
      ? rawValue : (typeof bag.toneLaw === 'string' ? bag.toneLaw : '');
    const R = fillStyleRoster();
    const alias = raw && R && R.ALIASES && R.ALIASES[raw];
    const seed = alias && alias.params;
    if (!seed) return bag;
    const out = { ...bag };
    Object.keys(seed).forEach((k) => { if (out[k] === undefined) out[k] = seed[k]; });
    return out;
  };
```

**Edit 2 — `src/ui/panels/scene3d-panel.js:678`, one line:**

```js
-    const styleParamBag = o.paramsBag || {};
+    const styleParamBag = FS.displayParams
+      ? FS.displayParams(o.value, o.paramsBag || {}) : (o.paramsBag || {});
```

`styleParamBag` is **read-only** in this function (used at `:680`–`:681`, and by U5b's caveat hunk once
merged). Every write still goes through `o.write` / `o.writeStyleParams` against the untouched live bag.
One line fixes **all three** call sites (`:1307`, `:1684`, `:4114`).

**Edit 3 — `src/ui/shell/context-bar.js:1607`,** in the `FS.styleParams(law).forEach` loop only. Do
**not** redefine `params` — it is the write source (`write({ params: { ...params, … } })`):

```js
+      const dispParams = FS.displayParams ? FS.displayParams(params.toneLaw, params) : params;
       FS.styleParams(law).forEach((d) => {
-        const has = params[d.key] !== undefined && params[d.key] !== null;
-        const dv = has ? params[d.key] : d.default;
+        const has = dispParams[d.key] !== undefined && dispParams[d.key] !== null;
+        const dv = has ? dispParams[d.key] : d.default;
```

…and the same seeding inside that row's `mixed:` closure (`:1617`–`:1620`), or a multi-selection of one
raw-folded and one migrated object falsely reads **Mixed**:

```js
-          mixed: sceneAgree(sc, (id) => {
-            const p = rs(id).params || {};
+          mixed: sceneAgree(sc, (id) => {
+            const q = rs(id).params || {};
+            const p = FS.displayParams ? FS.displayParams(q.toneLaw, q) : q;
             return (p[d.key] !== undefined && p[d.key] !== null) ? p[d.key] : d.default;
           }).mixed,
```

**Why the write path needs no change (verified):** with the display seeded, a user picking
`Bundle mode = eased` writes `{toneLaw:'bundleDither', bundleMode:'eased'}`; `normalizeStyle` collapses
`toneLaw → 'bundleCount'` and its shim does **not** overwrite the explicit `bundleMode` ⇒
`resolveToneLaw → 'bundleEased'`. Picking the default `count` yields `'bundleCount'`. Both correct.

**Cost:** ~20 lines of config + 2 UI lines + 1 closure. No engine file. No `params.js`.

### Rank 2 — write back the migrated bag onto the layer, from the UI

Have `fillStyleControls` detect a raw alias and `o.writeStyleParams({toneLaw: into, ...aliasParams})`
once on first render. **Rejected:** it mutates user data as a side effect of *opening a panel* (dirty
flag + undo entry for a value that renders correctly), and the once-only write-back contract is
explicitly reserved to W-10d-2 at `collectSceneParams`/load — i.e. `params.js`, **HELD by
fill-collapse-2**. Keep as the shape W-10d-2 should generalize to, if its owner wants one fix for both.

### Rank 3 — normalize object3d/booleanGroup3d styles at load (`engine.js:422`)

Route those types through `normalizeStyle` (or `normalizeStyleTable`) in `sanitizeImportedParams`.
**Rejected as this unit's fix:** (a) `engine.js` is not this lane's file; (b) it fixes only the load
channel, leaving any live-composed raw bag untouched; (c) it is a persistence migration, so it collides
head-on with W-10d-2's write-back contract; (d) it is strictly more invasive than Rank 1 for the same
user-visible result. Worth recording as the eventual *engine-tier* consolidation once W-10d-2 lands.

### Files

**Allowed (this lane):**
- `src/config/context-bar.js` — lane-owned; add `displayParams` only.
- `src/ui/panels/scene3d-panel.js` — line 678 only.
- `src/ui/shell/context-bar.js` — the `:1607` loop + its `mixed:` closure only.
- `tests/integration/scene3d-fill-style-picker.test.js` — new tests appended.
- `tests/unit/scene3d-fill-style-display-params.test.js` — **new file**.
- `docs/3d-audit/fill-audit/after/W-10d-3/` (evidence, in MAIN), `docs/3d-audit/lane-reports/W-10d-3-impl.md`.

**Forbidden:**
- `src/core/scene3d/params.js` — **HELD by fill-collapse-2** (W-30b now, U7/U8 next; W-10d-2 is theirs).
  Rank 1 needs **no** touch of it. **If an implementer believes it does, STOP and report — do not edit.**
- `src/core/engine.js`, `src/core/algorithms/scene3d.js`, `src/core/scene3d/shadows.js`,
  `src/core/scene3d/surface-fill*.js` — other lanes / no render change is wanted.
- `tests/unit/scene3d-tone-law-collapse.test.js` — three-way merge hazard, see §3.2.
- The shadow tone-law rows (`scene3d-panel.js:3193`, `src/ui/shell/context-bar.js:1872`) — U9 boundary.

### Merge hazard (must be in the report)

U5b's **unmerged** `49475ccd` touches **the same three files, within ~15 lines of every hunk here**:
`src/config/context-bar.js` inserts `effectiveLaw` at `:258` (immediately where `displayParams` goes);
`scene3d-panel.js` rewrites the caveat block at `:698` (immediately below edit 2's loop);
`src/ui/shell/context-bar.js` rewrites the caveat line at `:1595` (immediately above edit 3).
Hunks do not overlap semantically but **git will very likely conflict**. Resolution is
"take both, in order" — and, measured, **no amendment is then needed**: because edit 2 makes
`styleParamBag` the seeded bag, U5b's `FS.effectiveLaw(law, styleParamBag)` starts returning
`'bundleDither'` and the caveat appears by itself. Record this for the merge owner.

### Guards, bars, byte-identity, mutation

- **Guards that must stay green (run one file at a time, foreground):**
  `tests/integration/scene3d-fill-style-picker.test.js` (**140/140 measured today** with the Rank-1
  prototype applied — this is already the strongest no-op proof and it is green),
  `tests/integration/stroke-fill-style-control.test.js` (30),
  `tests/unit/scene3d-tone-laws-config.test.js` (8),
  `tests/unit/scene3d-faceted-tone-law.test.js` (19),
  `tests/unit/scene3d-tone-law-plumbing.test.js` (5),
  `tests/unit/scene3d-tone-law-collapse.test.js` (56 — **run it, do not edit it**; the U5b reviewer
  measured ~484 s wall on a loaded machine, so allow the time rather than killing it).
- **Bars changed: expected NONE.** No tolerance, count bar, or pinned fingerprint is in scope. If any
  bar moves, the unit is wrong — stop and report under a `## Bars changed` heading.
- **Byte-identity — this is a UI-only unit, and it must be proved, not asserted.** No engine or
  render file is touched, and no write path changes. Prove it: re-shoot one Tier-A cell (confirm it
  exists in `docs/3d-audit/fill-audit/manifest*.json` **before** naming it) from the lane worktree and
  show **md5-identical** to main's `shots/`; and capture the bespoke §5 scene's canvas region before and
  after the patch and show those md5-identical too. A byte-identical pair here is the **expected**
  result and must be explained as such in `report.json`.
- **Mutation:** §3.3, mandatory, with the exact failure strings quoted.

---

## 5. Evidence (real running app — no gallery cell shows panels)

Dev server from the lane worktree on **8476**; every capture script prints
`window.Vectura.APP_VERSION` and the report compares it to the worktree `package.json` (no bump in a
worktree). Playwright, foreground, single run, no `run_in_background`, no Monitor.

**The scene (one, used for every shot):** `engine.addLayer('scene3d')` → select the `object3d` child →
set `layer.params.style = { penId: null, mapper: 'hatch', params: { toneLaw: 'bundleDither' } }` →
`exportState` → `importState` (so the shot is of a **reopened document**, not a hand-poked bag) →
select the child → `app.ui.buildControls()` → click the real **Style** tab.
`bundleDither` is the right choice: it shows the sub-control lie *and* (once U5b merges) the caveat loss.

**The two surfaces, before and after, each with a NATIVE-RESOLUTION crop of the row region:**
1. **Docked Style tab** (`scene3d-panel.js` `fillStyleControls`) — crop the "Fill Style" + "Bundle mode"
   rows. Before: `Fill Style = Bundle · Count`, `Bundle mode = Integer pass count`, no caveat.
   After: `Bundle mode = Dithered`; Fill Style unchanged.
2. **ctxbar Style flyout** (`src/ui/shell/context-bar.js` `buildStyleBody`) — open the **Style** pill,
   crop the same two rows. Same before/after.
3. **Canvas, before and after** — same crop box, md5 compared, to show the render did not move.
4. A `contFieldTouch` pair on the docked surface (two descriptors: proves only `Field floor` moves and
   `Field metric` stays `Screen metric` — the over-fix guard, visually).

Write `docs/3d-audit/fill-audit/after/W-10d-3/report.json` (paths **must** be `after/W-10d-3/…`),
**Read the PNGs yourself** and say what you saw, including the byte-identical canvas pair.

---

## 6. Stop conditions

1. **`src/core/scene3d/params.js` looks necessary.** STOP and report. It is fill-collapse-2's file and
   Rank 1 was prototyped without it. Do not "just add one line".
2. **Any shadow surface needs to change.** STOP. U9's reviewer's constraint ("two mechanisms, not one
   path") binds this unit; file **W-10d-3b** instead.
3. **A guard suite fails and the honest reading is a stale assertion.** Do not re-pin. Report the
   assertion, the old and new values, and stop — this unit's whole claim is that nothing else moves.
4. **Any render byte-identity check comes back non-identical.** That means the patch escaped the display
   path. Revert to measurement and report; do not re-baseline a gallery cell.
5. **A bar, tolerance, or fingerprint would have to move.** Not in scope. Stop and report.
6. **`FS.effectiveLaw` already exists in the lane base** (i.e. U5b merged to main first). Then the
   `styleParamBag` seeding also restores the caveat: add a **7th** RED test asserting
   `.vs3-lawnote.is-caveat` is present for a raw `bundleDither` (today absent — measured), and say so.
   Do not re-implement `effectiveLaw`.
7. **The RED failures are `TypeError`/`is not a function` rather than value mismatches.** The tests are
   proving a symbol exists, not the behaviour. Rewrite them against the measured values in §1.1/§3.1.

---

## Planner's own verification (what was actually run)

Scratch export of `47a5a755`, `node_modules` symlinked. Three throw-away probe specs (deleted with the
scratch dir):
- **Probe 1** — docked leaf panel via the file's own `mountLeaf` shape: measured
  `Fill Style = ladder`, `Rung detail = coarse` for raw `fineLadder`; `Fill Style = bundleCount`,
  `Bundle mode = count`, caveat `null` for raw `bundleDither`; and
  `resolveToneLaw(normalizeStyle({toneLaw:'fineLadder'}).params) === 'fineLadder'`.
- **Probe 2** — ctxbar Style flyout: `fineLadder → Rung detail=coarse`,
  `bundleDither → Bundle mode=count`, `contFieldTouch → Field metric=screen, Field floor=plot`;
  normalized-side laws `fineLadder` / `bundleDither` / `contFieldTouch` respectively.
- **Probe 3** — `exportState`/`importState` round trip: leaf bag reopens as `{"toneLaw":"bundleDither"}`;
  `_sceneAssembled` byObject is `{"toneLaw":"bundleCount","bundleMode":"dither"}`;
  `resolveToneLaw` = `bundleDither`.
- **Rank-1 prototype applied**: probes flip to `Rung detail=fine`, `Bundle mode=dither`,
  `Field floor=touch` (Field metric still `screen`);
  `tests/integration/scene3d-fill-style-picker.test.js` **140/140 pass, 20.81 s**.
- **U5b stacked simulation** (local copy of `effectiveLaw` + the panel caveat hunk on top of the
  prototype): raw `bundleDither` renders its caveat verbatim,
  `"A negative result, kept as one: waving the pass-count bounda…"`. Reverted afterwards.

No repo file was modified by this plan other than this report. Scratch dir removed.
