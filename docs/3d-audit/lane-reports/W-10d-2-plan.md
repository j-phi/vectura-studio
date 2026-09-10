STATUS: PLAN-BLOCKED

# W-10d-2 — plan: resolve an unreachable `toneLaw` by write-back, once

**Lane:** fill-audit-2 (`.claude/worktrees/fill-audit-2`, branch at **66d9092d** = W-10d-3; port 8476).
Never touched — a W-10d-3 reviewer is reading it.
**Planner scratch:** `/private/tmp/claude-501/scratch-W10d2` (export of `66d9092d`, `node_modules`
symlinked, removed at the end of this plan). **Every number below was measured in that export**, through
the real `engine.addLayer('scene3d')` → `computeAllDisplayGeometry` → `group.scenePaths` path and the
real `Scene3DPanel.build` panel, not reasoned from source.
**Read:** `AGENT-PROTOCOL.md`; `LEDGER.md` rows 52/56 and the 2026-09-05 **write-back ruling** (~L572);
`STILL-OPEN.md` L66, 88, 96–98, 162; `W-10d-impl.md`, `W-10d-review.md`; `W-10d-3-plan.md`,
`W-10d-3-impl.md`; `U9-impl.md`, `U9-review.md`; `U5b-review.md`. Read-only diff:
handoff-c2 `fc8b0fba`.

---

## STATUS: why this is PLAN-BLOCKED, not PLAN-READY

Three **measured** facts contradict the premises the ruling and this brief rest on. Each on its own
would change the unit's shape; together they mean an implementer cannot build to the stated contract
without either destroying user data or silently rewriting saved artwork. The W-10d reviewer refused to
assume the design; this planner is refusing to assume it a second time, for new reasons the ruling
could not have known.

### B-1. The canvas does **not** already draw the fallback. Write-back **changes the render.**

The brief says "write-back must not change what the canvas draws — the canvas already draws the
fallback". Measured on the motivating case, torus + hatch + `originSpiral`, through the real compose:

| stored `toneLaw` | paths / points / coord-checksum |
|---|---|
| `originSpiral` (today, at `66d9092d`) | **556 / 5851 / 34 682 089.55** |
| `ladder` (what write-back would produce) | **135 / 910 / 5 151 872.19** |

**4.1× the path count.** Nothing in `src/core/` consults `isReachableOn` — grep confirms its only
consumers are `src/config/context-bar.js` (its own definition + `groups()`), `src/ui/panels/
scene3d-panel.js` and `src/ui/shell/context-bar.js`, plus one *comment* in `scene3d.js:758`. W-10d's
own source comment says so verbatim ("This does NOT reach saved documents … the torus wedge is hidden
from new picks, not repaired"). A write-back therefore **repairs the wedge by substitution** — which
may well be the right product answer, but it is a deliberate change to what a saved `.vectura` draws,
and the brief's byte-identity requirement is unsatisfiable for exactly the case that opened the unit.

### B-2. There is **no UI/canvas disagreement today** — the stated benefit is already true.

The ruling's justification is "so the Style tab shows the same law the canvas renders". Measured on
the docked Style tab for a torus leaf carrying `toneLaw: 'originSpiral'`:

```
Fill Style select value = "originSpiral"
option label            = "Origin Spiral — no effect here"
option disabled         = true
canvas renders          = originSpiral (556 paths, above)
```

UI and canvas **agree**. They agree before a live primitive change and after one (the panel re-reads
`layer.params` on every rebuild; the option is greyed but stays selected — browsers display a disabled
selected option). The only thing that lies is the **label copy**: `NO_EFFECT_SUFFIX = ' — no effect
here'` is false here, which is already filed as W-10d follow-up (1) in LEDGER row 56 and STILL-OPEN
L96. Write-back does not close a lie; it changes both sides in step.

### B-3. `isReachableOn` is **not a safe engine-side oracle.** It gates degraded pictures, not no-ops.

Swept all 35 `PICKER_IDS` × 10 primitives × 8 mappers = **2800 combinations**:

- **2014 / 2800 (71.9%) are `isReachableOn === false`.**
- **1365 of those 2014 sit in a context where `ladder` itself is unreachable** — every primitive under
  `none` / `wireframe` / `contourSlice`, and every faceted primitive under `contour`/`spiral`/`stipple`.
  There is **no fallback to write back to** in 68% of the unreachable set.
- And the gate is not a no-op gate. Measured, law vs. `ladder` on the same scene:

| class | example | `isReachableOn` | render identical to `ladder`? |
|---|---|---|---|
| faceted + hatch, non-mono law | `box`/`hatch`/`contourFlow` | false | **YES** (146/292/1657521.57 both) |
| faceted solid, cap-limited | `solid`/`hatch`/`etfKang`, `mazeFill` | false | **YES** (133/266/1515873.89 both) |
| curved + spiral, W-03 inert list | `sphere`/`spiral`/`taperedEnds` | false | **NO** — 136/1986 vs 106/1034 |
| " | `sphere`/`spiral`/`bundleCount` | false | **NO** — 155/2916 vs 106/1034 |
| " | `sphere`/`spiral`/`mkScribble` | false | **NO** — 129/1180 vs 106/1034 |
| curved + stipple | `sphere`/`stipple`/`bundleCount` | false | **NO** — 1292/8749 vs 872/5809 |
| pyramid + spiral | `pyramid`/`spiral`/`taperedEnds` | false | **NO** — 142/1694 vs 107/714 |
| torus gate | `torus`/`hatch`/`originSpiral` | false | **NO** — 556/5851 vs 135/910 |

W-03's own comment says this out loud — the 36 laws it added to `CURVED_SPIRAL_STIPPLE_INERT` are
"bare centreline … **18-19 distinct pictures across 39 laws**", not byte-identical to Ladder. The gate
means *"too degraded to be worth offering"*, **not** *"draws nothing different"*.

**Consequence:** a blanket `isReachableOn`-keyed write-back (what LEDGER row 52 and STILL-OPEN L97
describe: "gate `n.style.params.toneLaw` at `params.js:1094`" / "remap an unreachable id to the roster
default `ladder`") would, on load, silently rewrite the stored fill style of **most** scene objects in
the corpus and materially change the render of every curved+spiral/stipple document. That is the
opposite of a migration; it is data loss.

### The ruling the orchestrator must give (pick one; the rest of this plan is written for both)

- **Contract A — CURATED.** Write back only for an explicit, named set of (primitive, mapper, law)
  combinations — today exactly one: `torus` + any surface-fill mapper + `originSpiral`. Accepts a
  deliberate render change for that combination (it is the "repair" W-10c/W-10d deferred), needs a
  CHANGELOG line, and is byte-identical everywhere else. **Recommended.** Small, provable, and it is
  the only variant that actually addresses the unit's stated subject.
- **Contract B — RENDER-SAFE.** Write back only where `isReachableOn === false` **and** the write-back
  is a measured render no-op (the two faceted classes above). Byte-identical by construction — but it
  **excludes the torus case**, and those classes have no UI lie to fix either, so the user-visible
  value is ~zero. Include only if the orchestrator wants byte-identity kept as an absolute.
- **Contract C — WITHDRAW.** Close W-10d-2 as MEASURED/NOT-NEEDED on B-2 and re-point the residual
  user-visible defect at the label copy (W-10d follow-up 1). Defensible on the evidence.

Contracts A and B are **not** compatible with each other's oracle, so the implementer cannot start.
Everything below is complete for whichever is chosen.

---

## 1. The two trigger points, and what "unreachable" means today

### 1.1 Load channel — `src/core/engine.js:419–423`

```js
if (layerType === 'object3d' || layerType === 'sceneGroup3d' || layerType === 'booleanGroup3d') {
  const sceneParams = window.Vectura?.Scene3D?.Params;
  if (sceneParams && typeof sceneParams.migrateScene === 'function') {
    return sceneParams.migrateScene(sanitized);      // engine.js:422
  }
}
```

- `sanitizeImportedParams` is **defined at `engine.js:400`** and called from exactly one place,
  `engine.js:1931` — `layer.params = sanitizeImportedParams(data.params || {}, data.type);` — inside
  `importState`. So **anything this function returns is persisted onto the live layer**: this is a real
  write-back channel, not a copy.
- For a **scene3d monolith** (`engine.js:408–411`) the branch runs `sanitizeSceneParams` — i.e.
  `normalizeParams(migrateScene(...))` (`params.js:1683`) — so a monolith's `styleTable` **is** already
  normalized and written back at load. A `.vectura` monolith is therefore reachable from
  `normalizeParams` (`params.js:1387`), where `out.objects` (each with `.primitive`) and
  `out.styleTable.byObject` are both in scope — the "correlation pass" LEDGER row 52 describes.
- For an **object3d leaf** only `migrateScene` runs — `normalizeStyle` is never reached, which is why
  a raw stored law survives untouched. Measured: `exportState` → `importState` of a torus leaf carrying
  `originSpiral` reopens as `{"penId":null,"mapper":"hatch","params":{"toneLaw":"originSpiral"}}`.
  Here `sanitized.primitive` and `sanitized.style` are **both in one scope**, so it is the natural leaf
  write-back site.

### 1.2 Live channel — first compose after an edit makes the law unreachable

- `src/core/engine.js:2650` `_composeSceneGroup(group)`; `:2668` collects each child as
  `{ kind:'object', id: layer.id, params: layer.params }` — **the live layer bag by reference**.
- `src/core/engine.js:2690` `const assembled = Params.collectSceneParams(group.params, collected);`
- `src/core/scene3d/params.js:1138` `collectSceneParams` → `:1177` `normalizeObjectLayerParams(item.params)`
  → `:1075` `style: normalizeStyle(src.style)`. **`n.primitive` and `n.style` are both resolved here**
  (`params.js:1055–1080`) — the primary gate site LEDGER row 52 names.
- The output is a **throw-away copy**: `_composeSceneGroup` publishes it as `group._sceneAssembled`
  (`engine.js:2696`) and hands it to `algo.generate` (`engine.js:2714`); nothing is written back to
  `layer.params`. That is W-10d-3's corrected root cause, and it applies verbatim here.
- `_computeSceneGroups` (`engine.js:2634–2640`) runs from `computeAllDisplayGeometry`, i.e. **on every
  display pass**. A rewrite placed there without a once-only guard is exactly the "per-pass silent
  rewrite" the ruling forbids.

### 1.3 What "unreachable" means today

`SCENE_FILL_STYLES.isReachableOn(id, primitiveMode, solidType, mapper, totalFaces)` —
`src/config/context-bar.js:503–570`. Returns false when:

1. `mapper` is a **known** value outside `Vectura.Scene3D.Params.SURFACE_FILL_MAPPERS`
   (`none`/`wireframe`/`contourSlice`) — **every** id, including `ladder` and `none`.
2. faceted primitive (`box`/`plane`/`solid`) + mapper not `hatch`/`crosshatch` — again every id.
3. faceted + hatch/crosshatch + a law `SurfaceFillMono.isMono(id)` rejects.
4. faceted + hatch/crosshatch + mono law + `isCapLimited` (default `solid`, or `importedMesh` over the
   12-face budget).
5. curved + `spiral`/`stipple` + a member of `CURVED_SPIRAL_STIPPLE_INERT` (45 of 48); plus
   `pyramid` + `none`.
6. `pyramid` + `hatch` + `fineLadder`.
7. **`torus` + `originSpiral`** — W-10d, `context-bar.js:566`.

It **fails open** on an absent `primitiveMode` or `mapper`. Consumers: `groups()`
(`context-bar.js:306–341`) — it does **not** drop the `<option>`; it sets `disabled: true` and appends
`NO_EFFECT_SUFFIX`. `scene3d-panel.js:644` and `src/ui/shell/context-bar.js` feed it `o.primitiveMode`
/ `o.mapper`.

**The picker's existing fallback is `FILL_STYLE_DEFAULT = 'ladder'`** (`context-bar.js:106`), which is
also `SCENE_FILL_STYLES.resolve`'s fallback (`:241`, `:245`), `SCENE3D_TONE_LAWS.DEFAULT` (measured
`'ladder'`), and `clampStyleParam('toneLaw', …)`'s terminal fallback (`params.js:771`). **No new
constant is needed or permitted.** Note it is deliberately *not* a member of `IDS` (48) or
`PICKER_IDS` (35) — it is the 36th option, and `IDS.indexOf('ladder') === -1`.

**Note (out of scope, record it):** post-collapse, `fineLadder` is no longer in `PICKER_IDS`, so gate 6
is unreachable *from the picker* — a document reaches `fineLadder` as `{toneLaw:'ladder',
rungMode:'fine'}`, whose *stored survivor* is reachable while its *resolved internal law* is inert on
pyramid+hatch. Any reachability write-back must key on the **resolved** law
(`Params.resolveToneLaw(bag)`), not on `bag.toneLaw` — and rewriting a *sub-control* value is a
different shape from rewriting a law id. Adjacent to W-10d-3b / U9b; **not this unit**.

---

## 2. Interaction with W-10d-3's displayParams and U5b's caveat

### 2.1 W-10d-3 (`displayParams`, landed at `66d9092d`) — **keep both; not redundant, not overlapping**

`SCENE_FILL_STYLES.displayParams(rawValue, bag)` seeds `ALIASES[rawValue].params` into a **display-only
copy** when `rawValue` is a *folded* id. The two units are orthogonal on three axes:

| | W-10d-3 | W-10d-2 |
|---|---|---|
| trigger id class | **folded** (`ALIASES` key, 13 of them) | **unreachable survivor** (`PICKER_IDS` member) |
| canvas today | already correct | draws the stored law (B-1) |
| mechanism | display copy, no write | persistent write-back |
| overlap | `ALIASES` keys ∩ `PICKER_IDS` = **∅** (measured: 48 IDS = 35 picker + 13 aliases) | — |

Because the two id sets are disjoint, `displayParams` returns the **same object reference** for every
id W-10d-2 acts on, and W-10d-2 never touches a folded id. **Keep both:** removing `displayParams`
would re-break all 13 alias sub-controls (its own RED), and W-10d-2 cannot substitute for it (it never
sees those ids). Forward-compat holds in the other direction too — W-10d-3's guard G3 (same-reference
identity for every `PICKER_IDS` id) stays true after any W-10d-2 write-back, because a write-back
produces `'ladder'`, which is not an `ALIASES` key.

**A write-back does not make the display seed redundant** even in the write-back's own cases: the seed
fires on the *folded* axis, the write-back on the *reachability* axis. A document can be both (raw
`bundleDither` on a torus under `spiral`) — then W-10d-3 fixes the sub-control display and W-10d-2
(Contract A) leaves it alone, because `bundleDither` is not the curated torus/`originSpiral` pair.

### 2.2 U5b (`effectiveLaw` caveat shim, fill-collapse-2 `49475ccd`/`1e681432`) — **contract after write-back**

The brief asks: must a written-back survivor still show the folded law's caveat? **No.** Contract:

> After a write-back the document **holds the survivor**. The caveat surface is a pure function of what
> the bag now says — `FS.effectiveLaw(FS.resolve(bag.toneLaw), bag)` — so it shows `ladder`'s caveat
> (none), not the replaced law's. This is correct and required: the replaced law is no longer what the
> canvas draws, and a caveat about a law the document no longer carries would be a second UI lie of
> exactly the kind W-10d-2 exists to prevent.

W-10d-2 must therefore **not** special-case, preserve, or re-derive a pre-write-back caveat, and must
not call `effectiveLaw` at all. What it **must** do is leave a trace the user can see once (§4, the
notice), because a silent substitution of a stored value is otherwise indistinguishable from the app
losing their setting.

### 2.3 U9 (shadow bag, handoff-c2 `fc8b0fba`) — **hard boundary, and the file-disjointness proof**

U9's reviewer's binding constraint is **two mechanisms, not one path**: the style bag reconstructs via
`normalizeStyle`'s shim; the **shadow bag passes a folded id through unchanged** via the new
`clampShadowToneLaw`. W-10d-2 must not collapse, share, or route through the shadow bag.

**Line-range disjointness proof** (fill-audit-2's `src/core/scene3d/params.js` at `66d9092d`; U9's
hunks land at identical coordinates because both lanes share this region unchanged):

| owner | region | content |
|---|---|---|
| **U9 `fc8b0fba` hunk 1** | inserts 36 lines immediately **before line 1002**; diff context **999–1004** | `clampShadowToneLaw` |
| **U9 `fc8b0fba` hunk 2** | replaces **1014–1016**; diff context **1013–1019** | `shadowToneLaw: clampShadowToneLaw(...)` |
| **U9 total footprint** | **params.js 999 – 1019** | shadow bag only |
| W-10d-2 allowed site 1 | `normalizeStyle` **833 – 881** | style bag |
| W-10d-2 allowed site 2 | `normalizeObjectLayerParams` **1055 – 1080** | style bag |
| W-10d-2 allowed site 3 | `collectSceneParams` **1138 – 1230** | style bag |
| W-10d-2 allowed site 4 | `normalizeParams` **1387 – 1428** | style bag |
| W-10d-2 allowed site 5 | exports **1720 – 1735** | — |

Nearest approach: **1055 − 1019 = 36 lines** below, **999 − 881 = 118 lines** above. Both far outside
git's 3-line merge context ⇒ **textually disjoint, no conflict**. fill-collapse-2's round-2 units
(U5b, W-30b, U7) do not touch `params.js` at all, so U9's block is the only other round-2 edit to it.

---

## 3. RED oracle

Primary file: **`tests/integration/scene3d-fill-style-picker.test.js`** (baseline **140/140**, 20.8 s;
re-measured in the scratch export). Its harnesses already exist: `mountLeaf(type, style, primitive)`
(:1648), `leafRow` (:1668), `addSelectScene`/`openStyle`/`rowCtl`/`openFly` (:880–:900), and the
`exportState`/`importState` round-trip shape from W-10d-3's R4.

Assertions are **on the stored params**, never on the display — that is the whole distinction from
W-10d-3.

| # | Test | Assertion (Contract A wording) | Today | Must be |
|---|---|---|---|---|
| **R1** | `.vectura` load: object3d **torus** leaf, `style.params.toneLaw = 'originSpiral'`, through `exportState`→`new VectorEngine().importState` | `obj2.params.style.params.toneLaw` | **`'originSpiral'`** (measured) | `'ladder'` |
| **R1b** | same doc, monolith form (`styleTable.byObject['obj-1']` on a torus object) | `layer.params.styleTable.byObject['obj-1'].params.toneLaw` | `'originSpiral'` | `'ladder'` |
| **R2** | **once-only**: after R1, run `importState` again on the already-migrated state | params **byte-identical** (`JSON.stringify` equal) to R1's result | n/a | equal (idempotent) |
| **R3** | **no per-pass rewrite**, reachable law: sphere leaf, `toneLaw:'etfKang'`; snapshot `JSON.stringify(layer.params)`; run `computeAllDisplayGeometry()` **3×** | snapshot unchanged, **byte-identical** | passes today | passes (guard) |
| **R4** | **no per-pass rewrite**, unreachable law reached by a LIVE edit: sphere+hatch+`originSpiral` (reachable) → set `obj.params.primitive = 'torus'` → compose | after compose #1 `toneLaw === 'ladder'`; `JSON.stringify(layer.params)` after compose #2 and #3 **byte-identical to after #1** | `'originSpiral'` on all three | one rewrite, then stable |
| **R5** | **no undo entry at load**: `app.history.length` across `applyState` of a doc needing write-back | equals the length the unaffected load produces | — | equal (see §4 history) |
| **R6** | **undo/redo survives**: after R4's rewrite, `app.pushHistory()`, edit, `undo()` | `toneLaw` is `'ladder'` at every restored point, never `'originSpiral'` | — | `'ladder'` |
| **R7** | **round trip**: save the migrated doc (`exportState` → JSON) | serialized `toneLaw` is `'ladder'`; re-import is a no-op (R2) | `'originSpiral'` | `'ladder'` |
| **R8** | **no-fallback guard**: leaf with `mapper:'wireframe'`, `toneLaw:'mkTick'` (every id unreachable, `ladder` too) | `toneLaw` **unchanged** — never rewritten | `'mkTick'` | `'mkTick'` |
| **R9** | **blast-radius guard (Contract A)**: `sphere`+`spiral`+`taperedEnds` (unreachable, render **differs** from ladder) | `toneLaw` **unchanged**; render sig unchanged | `'taperedEnds'` | `'taperedEnds'` |
| **R10** | **UI agreement**: after R1, mount the leaf Style tab | Fill Style select value `'ladder'`; no disabled selected option | `'originSpiral'` disabled | `'ladder'` |

**Unit file (new): `tests/unit/scene3d-tone-law-writeback.test.js`.**
Do **not** edit `tests/unit/scene3d-tone-law-collapse.test.js` — documented three-way merge hazard
(main `e429cfc5` + U9 `fc8b0fba` + fill-collapse-2's checkpoint); U5b-2 and W-10d-3 both split out for
this reason.

- **G1 — the curated set is exactly one pair (Contract A).** Assert the write-back table has exactly
  one entry and it is `torus` × `originSpiral`; assert every other `(primitive, mapper, id)` of the
  2800-combination sweep is left unchanged by the write-back helper.
- **G2 — target is the picker's own fallback, not a literal.** Assert the target equals
  `Vectura.SCENE_FILL_STYLES.DEFAULT` **and** `Vectura.SCENE3D_TONE_LAWS.DEFAULT` — mutate either and
  the test must fail (no hard-coded `'ladder'` in the assertion).
- **G3 — identity.** For every non-triggering bag the helper returns the **same object reference**.
- **G4 — no shadow reach.** `normalizeShadow({shadowToneLaw:'originSpiral'})` and a folded
  `'fineLadder'` both pass through **unchanged** (U9's contract, pinned from this side too).

**Mutation check (mandatory, reported).** Stub the write-back to identity. R1/R1b/R4/R7/R10 must
re-fail on **real value assertions** (`expected 'originSpiral' to be 'ladder'`), never on `TypeError` /
`is not a function`. Revert; diff clean.

**Byte-identity of renders.** Contract A's oracle is *not* "nothing changes":
- **Must be byte-identical:** every combination outside the curated pair. Prove with a re-shoot of the
  48-law `torus__hatch__<law>__med__a` Tier-A row against main's `shots/B/` (**47/48 md5-identical**;
  `originSpiral` is excluded from that row on both sides by W-10d, so the row is silent about it — say
  so rather than claiming 48/48).
- **Must differ, deliberately:** the curated pair. Capture a bespoke torus+hatch+`originSpiral` scene
  before/after and show the after is **md5-identical to an explicit `ladder` pick** on the same scene
  (556→135 paths). Explain the pair in `report.json`. **A byte-identical before/after here is a FAILED
  fix**, not a pass.

---

## 4. Ranked fixes

### Rank 1 (Contract A) — a curated `UNREACHABLE_WRITEBACK` table, applied at the two channels

**Edit 1 — `src/config/context-bar.js`** (lane-owned; W-10d-3 already added `displayParams` here).
Add, immediately after `isReachableOn` (ends `:570`) — no new constant, the target is read from the
existing default:

```js
  // W-10d-2 — the ONLY (primitive, law) pairs a saved document is migrated
  // away from. Deliberately NOT `isReachableOn`: measured, 2014 of 2800
  // (primitive x mapper x law) combinations are unreachable, 1365 of those in
  // a context where `ladder` is unreachable too, and the curved+spiral/stipple
  // arm of the gate hides DEGRADED pictures, not no-ops (sphere/spiral/
  // taperedEnds renders 136 paths vs ladder's 106). Rewriting on that gate
  // would destroy user picks and change most renders. This table is the
  // narrow case where the render is genuinely unplottable and the product
  // ruling is to substitute: W-10c measured torus+originSpiral at 87.8% of
  // interior pixels in a blank-paper run longer than two pen widths.
  SCENE_FILL_STYLES.UNREACHABLE_WRITEBACK = [
    { primitive: 'torus', id: 'originSpiral' },
  ];
  // -> the picker's own fallback (FILL_STYLE_DEFAULT), or null for no change.
  SCENE_FILL_STYLES.writeBackFor = (id, primitiveMode, mapper) => {
    if (typeof id !== 'string' || !id) return null;
    // Never rewrite where no fallback is live: `none`/`wireframe`/
    // `contourSlice` (and a faceted primitive off hatch/crosshatch) make
    // EVERY option inert, `ladder` included - there is nothing to move to.
    if (!SCENE_FILL_STYLES.isReachableOn(FILL_STYLE_DEFAULT, primitiveMode, undefined, mapper)) return null;
    const hit = SCENE_FILL_STYLES.UNREACHABLE_WRITEBACK
      .some((e) => e.primitive === primitiveMode && e.id === id);
    return hit ? FILL_STYLE_DEFAULT : null;
  };
```

**Edit 2 — `src/core/scene3d/params.js`, in `normalizeObjectLayerParams` (`:1055–1080`)**, the one
scope holding both `obj.primitive` and `src.style`. Apply the write-back to the style it returns:

```js
      style: applyLawWriteBack(normalizeStyle(src.style), obj.primitive),
```

with a small private helper defined next to it (lazy `Vectura.SCENE_FILL_STYLES` read — safe, the same
lazy cross-module read `context-bar.js` already does in the opposite direction), returning the **same
object** when `writeBackFor` yields null. This covers the live/compose channel (`collectSceneParams`
`:1177`) and the leaf normalize path in one place.

**Edit 3 — `src/core/scene3d/params.js`, `normalizeParams` (`:1387–1428`)**, a correlation pass after
`out.styleTable = normalizeStyleTable(src.styleTable);` (`:1421`): build `id → primitive` from
`out.objects`, then walk `out.styleTable.byObject` and `byFace` (`byFace` keys are `objectId/faceId`).
This covers the **monolith** load channel, which is already persisted (`engine.js:411` → `:1931`).

**Edit 4 — `src/core/engine.js:419–423`**, the object3d leaf load channel. Route `object3d` /
`booleanGroup3d` through the same helper after `migrateScene`, so a leaf's stored law is migrated **at
load** and persisted by `:1931` — not merely on the first compose. Minimal: keep `migrateScene` and
add one `Scene3D.Params.writeBackObjectLayerStyle(sanitized)` call whose no-op path returns the same
object.

**Once-only, by construction.** No flag, no counter: the write-back is **idempotent** — after it runs,
the stored id is `ladder`, which never matches `UNREACHABLE_WRITEBACK`, so pass 2 is a same-reference
no-op. That satisfies "no per-pass silent rewrite" more strongly than a first-pass guard would, and R3
/ R4 pin it with byte-identical `JSON.stringify(layer.params)` across three composes.

**History / undo — it must NOT create an undo entry, and does not:**
- **File open:** `src/ui/ui-file-io.js` `openVecturaFile` calls `this.app.applyState(state)` and then,
  **after** it succeeds, `this.app.history = []; this.app.pushHistory();` (ui-file-io.js ~:160–162).
  History is *reset* around the load, so a write-back inside `importState` can produce no entry.
- **Live compose:** `_composeSceneGroup` is display-geometry, not a user action; it must not call
  `pushHistory`. The implementer adds **nothing** to the history path. R5 pins the count.
- **Undo/redo:** `App.restoreState` → `engine.importState` (`app.js:986`) re-runs
  `sanitizeImportedParams` on every restore, so the write-back is re-applied on each restored snapshot
  and is idempotent. Consequence to state in the report: **the write-back is not undoable** — undoing
  past it re-applies it. That is correct for a migration and matches how the existing
  `HIGHLIGHT_TREATMENT_ALIASES` / `normalizeStyle` shim already behave, but it must be documented.
- **UI freshness after a live-edit write-back:** the panel and ctxbar read `layer.params` on rebuild
  (`scene3d-panel.js` `fillStyleControls`, `context-bar.js` `buildStyleBody` via
  `renderer.getSceneObjectResolvedStyle` → `_sceneStyleResolveTable`, `renderer.js:12712`/`:12753`,
  which patch in the child layer's **live** `params.style`). A primitive change already rebuilds both.
  R10 pins it. If a case is found where it does not rebuild, **stop and report** — do not add a
  panel-refresh side effect inside the compose pass.
- **User notice (required for Contract A):** substituting a stored value silently is the failure mode
  the ruling is trying to avoid. Add **one** toast/note on the load path — "One fill style could not be
  plotted on a torus and was changed to Ladder" — routed through the existing toast used by
  `openVecturaFile`, fired at most once per load. Do **not** add a per-compose notice.

### Rank 2 (Contract B) — write back only where the render is a measured no-op

Same edits, but `writeBackFor` keys on `isReachableOn === false` **AND** membership of a measured
render-no-op class (faceted + hatch/crosshatch + non-mono; faceted cap-limited). Byte-identical
everywhere, no CHANGELOG render note needed — and it does **not** touch torus/`originSpiral`. Include
only if byte-identity is ruled absolute. The implementer must **measure**, not assume, that each class
in the list is byte-identical (the two rows in §B-3 are the only ones this planner measured).

### Not taken

- **Blanket `isReachableOn` remap** (LEDGER row 52 / STILL-OPEN L97 as written) — B-3. If the
  orchestrator still wants it, it needs its own ruling and a corpus-wide render diff, not this unit.
- **Gate at `collectSceneParams:1094` only** — copy-only, leaves the layer bag stale; the ruling
  already rejected it.
- **`clampStyleParam('toneLaw')`** — single-key, no primitive in scope, and **shared with the shadow
  path's history**; changing it risks U9's boundary. Forbidden.

### Files

**Allowed:** `src/config/context-bar.js` (the table + `writeBackFor` only);
`src/core/scene3d/params.js` (**style path only** — `normalizeObjectLayerParams` 1055–1080,
`normalizeParams` 1387–1428, exports 1720–1735; ranges proved disjoint from U9's 999–1019 in §2.3);
`src/core/engine.js:419–423` (the leaf load channel, one call);
`tests/integration/scene3d-fill-style-picker.test.js` (appended);
`tests/unit/scene3d-tone-law-writeback.test.js` (**new**);
`docs/3d-audit/fill-audit/after/W-10d-2/` (evidence, in MAIN); `docs/3d-audit/lane-reports/W-10d-2-impl.md`;
`CHANGELOG.md`, `README.md`, `plans.md`, `docs/3d-audit/STILL-OPEN.md`.

**Forbidden:** `src/core/scene3d/params.js` lines **995–1025** (U9's shadow bag — `clampShadowToneLaw`,
`normalizeShadow`) and `clampStyleParam` (`:655–779`); `src/core/scene3d/surface-fill.js`,
`surface-fill-mono.js`, `shadows.js`, `hlr.js` (other lanes; and no render-engine gate is wanted —
that is FU-1); `src/ui/shell/context-bar.js` and `src/ui/panels/scene3d-panel.js` **beyond a read**
(W-10d-3 just landed there; this unit changes stored data, not display);
`tests/unit/scene3d-tone-law-collapse.test.js` (three-way merge hazard);
`src/config/context-bar.js`'s `isReachableOn` body, `CURVED_SPIRAL_STIPPLE_INERT`, `NO_EFFECT_SUFFIX`
and the note constants (W-10d/W-02/W-03 territory; the label-copy follow-up is a separate unit).

**Guards that must stay green** (foreground, one file at a time):
`tests/integration/scene3d-fill-style-picker.test.js` (**140/140** measured today — the strongest
no-op proof), `tests/unit/scene3d-solid-cap-reachability.test.js`,
`tests/unit/scene3d-tone-laws-config.test.js`, `tests/unit/scene3d-faceted-tone-law.test.js`,
`tests/unit/scene3d-tone-law-plumbing.test.js`, `tests/unit/scene3d-shadow-tone-law.test.js`,
`tests/unit/scene3d-tone-law-collapse.test.js` (**run it, do not edit it**; ~484 s on a loaded machine).

**Bars changed: expected NONE.** No tolerance, count bar or fingerprint is in scope. Any bar that moves
means the patch escaped the curated set — stop and report under a `## Bars changed` heading.

---

## 5. Evidence

Dev server from the lane worktree on **8476**; every capture prints `window.Vectura.APP_VERSION` and
the report compares it to the worktree `package.json` (1.3.99 — no bump in a worktree). Playwright,
foreground, single run, no `run_in_background`, no Monitor.

**The scene (one, used for every shot):** `engine.addLayer('scene3d')` → select the `object3d` child →
`primitive = 'torus'`, `style = { penId:null, mapper:'hatch', params:{ toneLaw:'originSpiral' } }` →
`exportState` → `importState` (so every shot is of a **reopened document**, not a hand-poked bag) →
select the child → `app.ui.buildControls()` → click the real **Style** tab.

1. **Style tab, BEFORE** — native-resolution crop of the Fill Style row. Expected today (measured):
   value `originSpiral`, label **"Origin Spiral — no effect here"**, option **disabled**.
2. **Style tab, AFTER** — same crop. Expected: **`Ladder`**, enabled, no `— no effect here` suffix.
3. **Canvas, BEFORE / AFTER**, same crop box, md5 compared — **must differ** (556 → 135 paths), and the
   AFTER must be **md5-identical** to a third shot taken with an explicit `ladder` pick on the same
   scene. This pair is the fix; a byte-identical before/after is a failure.
4. **A saved `.vectura`** — `exportState` → JSON, showing the object3d leaf's
   `style.params.toneLaw === "ladder"`, with the pre-fix JSON beside it showing `"originSpiral"`.
   Quote both lines verbatim in the report.
5. **Blast-radius negative** — sphere + spiral + `taperedEnds` (unreachable, render differs):
   canvas + stored bag before/after, both **byte-identical**, proving the curated table did not widen.
6. **Tier-A guard row** — re-shoot `torus__hatch__<law>__med__a` from the lane worktree; expect
   **47/48 md5-identical** to main's `shots/B/` (`originSpiral` is excluded on both sides by W-10d).
   Confirm every named cell exists in `docs/3d-audit/fill-audit/manifest*.json` **before** naming it.

Write `docs/3d-audit/fill-audit/after/W-10d-2/report.json` (paths **must** be `after/W-10d-2/…`),
**Read the PNGs yourself** and say what you saw, including every byte-identical pair and why.

---

## 6. Docs contract items

| Doc | Item |
|---|---|
| `CHANGELOG.md` | **Required** under Contract A: a saved torus scene using Origin Spiral now opens as Ladder; what it draws changes, once, on load. Name the reason (unplottable ink wedges, W-10c 87.8%). |
| `README.md` | Only if the greyed-out Fill Style wording (updated by W-10d) needs the migration sentence added. |
| `plans.md` | Log the unit + the residual: torus/Origin Spiral is now *substituted*, still not *repaired* (FU-1 remains the engine-level route). |
| `docs/3d-audit/STILL-OPEN.md` | **Three record corrections** (all measured here): (1) `isReachableOn` is not a safe engine oracle — 2014/2800 unreachable, 1365 with no live fallback, and the curved+spiral/stipple arm gates degraded pictures, not no-ops; (2) there is **no** UI/canvas disagreement for an unreachable law today — the Style tab shows the disabled option and the canvas renders it, so the ruling's premise needs restating; (3) the leaf load channel is `engine.js:419–423`, and `sanitizeImportedParams`'s return **is** persisted at `engine.js:1931` — a real write-back channel (this also corrects the older "`_composeSceneGroup` never calls `normalizeParams`" note, already corrected once by W-10d-3). |
| `LEDGER.md` | Row 52 rewritten to the chosen contract; record that the `params.js:1094` gate and the `ladder`-for-every-unreachable-id remap it prescribes were **measured unsafe**. |
| `docs/3d-audit/lane-reports/W-10d-2-impl.md` | Full report per AGENT-PROTOCOL, `## Bars changed` heading present even if empty. |

---

## 7. Stop conditions

1. **The orchestrator has not picked A, B or C.** Do not start. This plan is PLAN-BLOCKED precisely
   because the two viable contracts have incompatible oracles.
2. **The chosen fix wants to key on `isReachableOn` across the board.** STOP — §B-3. 1365 combinations
   have no reachable fallback and the curved+spiral/stipple arm is not a no-op gate.
3. **A render byte-identity check fails *outside* the curated pair.** The patch escaped its table.
   Revert to measurement and report; never re-baseline a gallery cell.
4. **The curated pair's before/after comes back byte-identical.** The write-back did not reach the
   render path. That is a failed fix, not a clean no-op — report it as such.
5. **`src/core/scene3d/params.js` lines 995–1025 look necessary**, or any shadow surface needs to
   change. STOP — U9's "two mechanisms, not one path" binds this unit (§2.3).
6. **A write-back would create an undo entry, or would need a `pushHistory` call.** STOP. The ruling's
   contract is a migration, not a user edit (§4 history).
7. **A per-compose flag, counter or `_writeBackDone` marker looks necessary.** STOP — idempotence is
   the mechanism; if it is not idempotent the table is wrong.
8. **A guard suite fails and the honest reading is a stale assertion.** Do not re-pin. Report the
   assertion, old and new values, and stop.
9. **The RED failures are `TypeError` / `is not a function`.** The tests prove a symbol exists, not the
   behaviour. Rewrite against the measured values in §B-1/§B-3/§3.

---

## Planner's own verification (what was actually run)

Scratch export of `66d9092d`, `node_modules` symlinked. Two throw-away integration probes (deleted with
the scratch dir), both through the **real** `App` + `VectorEngine` + `Scene3DPanel` stack:

- **Probe 1** — (a) torus+hatch, `originSpiral` **556 paths / 5851 pts / 34 682 089.55** vs `ladder`
  **135 / 910 / 5 151 872.19**, NOT identical; (b) leaf Style tab for that scene: select value
  `originSpiral`, option label `"Origin Spiral — no effect here"`, `disabled === true`; (c) the
  2800-combination reachability sweep — **2014 unreachable, 1365 of them with `ladder` unreachable
  too**, per-context rows recorded; (d) `exportState`→`importState` of the torus leaf reopens as
  `{"penId":null,"mapper":"hatch","params":{"toneLaw":"originSpiral"}}` — unmigrated, confirming the
  `engine.js:422` channel.
- **Probe 2** — render-identity by class: `box/hatch/contourFlow` and `solid/hatch/{etfKang,mazeFill}`
  are **byte-identical** to `ladder`; `sphere/spiral/{taperedEnds,bundleCount,mkScribble,
  weightModulated}`, `sphere/stipple/{taperedEnds,bundleCount}`, `pyramid/spiral/taperedEnds`,
  `torus/{hatch,contour}/originSpiral` are **not**. Full figures in §B-3.
- **Source reads (no edits):** `context-bar.js` 106/240–245/306–341/503–570; `params.js` 636/655–779/
  810–881/882–900/999–1019/1055–1080/1138–1230/1387–1428/1683; `engine.js` 400–423/1902–1931/2634–2730;
  `app.js` 986/1161–1199; `ui-file-io.js` 107–166; `scene3d-panel.js` 605–700; `renderer.js` 12712/12753.
- **Roster probe:** `IDS` 48, `PICKER_IDS` 35, `ALIASES` 13, `DEFAULT` `'ladder'`; `originSpiral` is a
  **picker** id, not an alias ⇒ W-10d-3's and W-10d-2's id sets are disjoint (§2.1).
- **U9 diff** read read-only from handoff-c2 `fc8b0fba`; line ranges in §2.3.

No repo file was modified by this plan other than this report. The fill-audit-2 worktree was never
written to. Scratch dir removed.
