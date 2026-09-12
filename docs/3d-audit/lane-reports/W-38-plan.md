STATUS: PLAN-READY

# W-38 (F-14b) — `facetMinRulings`, a per-style "minimum facet rulings" control — planner report

Unit: **W-38**, created by **Jay's decision 7 → option B (2026-09-10)** on F-14's graded remainder:

> *"a **product unit** exposing `FACET_MIN_RULINGS` as a per-style 'minimum facet rulings' control,
> default 3 and byte-identical there → new id **W-38**."* (`STILL-OPEN.md:395`; the option text is
> `STILL-OPEN.md:225`, from `W-15c-E-plan.md`'s recommendation.)

Planner: **read-only in the repository.** Every number below was measured in a scratch export of
**`426cc5e4`** (v1.4.1, main) at `/private/tmp/claude-501/scratch-W38`, `node_modules` symlinked, the
directory deleted at the end of this unit. No file in the repo was edited except this report.

**This unit ships a KNOB, not a fix for F-14.** `W-15c-E-plan.md` §2 proved in closed form that Density
cannot be made to bear on a graded facet without inverting the tone ladder. W-38 does not relitigate
that; it hands the user the floor the ladder is standing on, so *they* choose ladder contrast versus
fill. Say this in the impl report and in the release note — do not sell it as "F-14 fixed".

---

## 1. Where the floor lives today, and what it does

### 1.1 File:line, at `426cc5e4`

`src/core/algorithms/scene3d.js`

| what | line | text |
|---|---|---|
| the constant | **`:66`** | `const FACET_MIN_RULINGS = 3;` (its §0 rationale block is `:59-65`) |
| `toneOn` | `:1562` | `Boolean(!draft && p.tone && p.tone.enabled && Regions && lightDir)` |
| `isSoloOrientation` | `:1912` | all front facets within `dot ≥ 0.999` of the first ⇒ solo |
| `REGION_MAPPERS` | `:1002` | `new Set(['contour','spiral','stipple'])` — these never reach the grant |
| `faceHatchLines` | `:2457` | the faceted line-fill entry point |
| `soloOrient` | **`:2614`** | `toneOn && zone && isSoloOrientation(record)` |
| the carrier-only gate | `:2657` | `if (i > 0) return;` |
| the grant | **`:2674-2676`** | `ceilCount` / `soloDens` / **`const want = Math.min(ceilCount, Math.max(FACET_MIN_RULINGS, soloDens));`** |
| the pitch it writes | `:2684-2685` | `const target = f.ext / (want + 0.5); if (target < f.plane) { f.plane = target; f.fits = true; return; }` |
| main call site | `:4188` | `faceHatchLines(face, fillParams, face.normalWorld, mapper === 'crosshatch', record, null)` |
| x-ray back-face call site | `:4002` | `faceHatchLines(face, backParams, face.normalWorld, mapper === 'crosshatch')` — **no `record`** |
| region path (not ours) | `:4193`, `:4004` | `faceRegionLines(...)` for contour / spiral / stipple |
| mono short-circuit | `:3028`, `:4187-4188` | `faceMonoLines(...) || faceHatchLines(...)` at `:4187-4188`; `MONO_MAX_FRONT_FACES = 12` at `:3003` |

`want` is the number of rulings the carrier family is *granted* when its own Density-derived ask falls
short. `soloDens` is W-15c's solo-object Density term and is **0 on every graded record**, so on a
graded object the expression collapses to `min(ceilCount, 3)` — a Density-blind constant. That is
F-14's graded remainder, and `FACET_MIN_RULINGS` is the single number that sets it.

### 1.2 How it enters the graded faceted path

```
mapper hatch|crosshatch, toneOn, faceted primitive
  → faceHatchLines(:2457)
  → spacingBand → { spacing, zone, glint }         # the tone ladder's pitch
  → crossFamilies(... DRAW_NOTHING)                # PASS 1: collect the family "asks"  (:2588, toneOn only)
  → plan = asks.map(...)                           # k, ext, plane = screen/k, covOne   (:2617)
  → plan.forEach: i === 0 only                     # CARRIER ONLY                        (:2657)
      ceilCount = floor(zoneCeil / covOne)         # the zone's own ink ceiling
      want      = min(ceilCount, max(3, soloDens)) # ← THE FLOOR                         (:2676)
      target    = ext / (want + 0.5)               # a MAXIMUM pitch, not a count top-up (:2684)
  → hatchPolygon at the resulting pitch
```

Two structural consequences the implementer must not lose:

- The grant **only fires on a facet asking for fewer than the floor.** A facet Density has already
  ruled is untouched, which is why the control silently stops mattering as Density rises (§4.4).
- `ceilCount` is a **hard upper bound** that survives the control. Raising the control above a facet's
  own zone ceiling does nothing — the plot-safety law still wins. Measured: the app-default box's
  `face:+Y` (zone L) stops at **5 rulings** however high the control goes.

### 1.3 What values are meaningful

Measured on the **app-default box** (`engine.addLayer('scene3d')`, factory camera / sun / ground /
tone, `fillAngle 45`, `fillDensity 50`) — the app's own entry point, not `generate(params)`.
`D` = composed paper coverage per face = `ink × penWidth / projectedFaceArea`. Zones: **M** = `face:+X`
(mid), **L** = `face:+Y` (lightest), **F** = `face:+Z` (darkest, and the only facet carrying a second
family).

| control | rulings M / L | D(M) | D(L) | **D(F)** | F/M step | **F/L step** | object ink (mm) |
|---|---|---|---|---|---|---|---|
| 1 | 2 / 1 | 0.0164 | 0.0201 | 0.0668 | 4.07× | 3.32× | 367.49 |
| 2 | 2 / 2 | 0.0164 | 0.0361 | 0.0668 | 4.07× | 1.85× | 396.76 |
| **3 (default)** | **3 / 3** | **0.0223** | **0.0516** | **0.0668** | **3.00×** | **1.29×** | **439.80** |
| 4 | 4 / 4 | 0.0289 | 0.0668 | 0.0668 | 2.31× | **1.00× — TIED** | 484.23 |
| 5 | 5 / 5 | 0.0355 | 0.0820 | 0.0668 | 1.88× | **0.81× — INVERTED** | 528.40 |
| 8 | 8 / 6 | 0.0551 | 0.0972 | 0.0668 | **1.21× — under O20's 1.25× bar** | 0.69× | 605.18 |

**Read this as the trade, and put it in the help text:**

- **1 and 2 break the fill, not the ladder.** At 1 the lightest facet carries a single ruling — the
  exact "a facet reads as bare paper with a line on it" state `scene3d.js:§0` (`:59-65`) was written to
  prevent, and which `scene3d-box-density-bearing.test.js`'s ablation recorded as the defect the grant
  exists for. **Contrast improves** (F/L 1.29× → 3.32×). The user is choosing this knowingly;
  document it, do not forbid it.
- **3 is the last value where the whole ladder is ordered** on this fixture (F/L 1.29×, already close
  to O20's 1.25× readability bar — the ladder has **no** headroom above the default, which is exactly
  `W-15c-E-plan.md` §2's closed-form result arriving from the other direction).
- **4 ties** the lightest facet with the darkest; **5 inverts it**; **8** additionally pushes the
  mid-zone step under O20's 1.25× bar. Above 3 the user is spending ladder contrast for fill — that
  *is* the product decision, and it is the reason the control exists.
- **Above 8 is not useful**: `ceilCount` already clamps the app-default box's L facet at 5 and its M
  facet at 8, the solid's facets at 8, and the object's ink has doubled by then
  (solid 325.7 → 658.8 mm). `scene3d-subwindow-density`'s plot-safety control sits at
  **0.3817 against a 0.40 bar on a graded cube today** (`W-15c-E-plan.md` §3) — 4.6 % of headroom —
  so a larger cap would be a wet-plot footgun with no measured room. **Cap at 8.**
- **0 is deliberately excluded.** With the floor at 0 the grant cannot fire at all and a facet whose
  ask rounds to 0 is dropped from the drawing entirely (`hatchPolygon` places rulings at
  `pMin + i·spacing`, `i = 1 … floor(ext/spacing)`) — the Round-10 "nine visible facets carried NO
  fill" defect, restored, with no way back from a blank facet. 1 already gives the user "one stripe".

---

## 2. Param design

### 2.1 Identity

| field | value |
|---|---|
| param key | **`facetMinRulings`** (style param; sits with the faceted-fill keys, not the `slice*` group) |
| UI label | **`Min rulings`** · aria **`Minimum facet rulings`** |
| unit | **rulings across a facet** (a count, not mm and not pen widths) |
| range | **1 … 8**, **step 1, integer** |
| default | **3** — `FACET_MIN_RULINGS`'s own value; **byte-identical**, prototype-proven (§4.1) |
| semantics | the fewest rulings the carrier family may be granted on a facet whose Density-derived ask falls short. **Lower** ⇒ more ladder contrast, less fill (1 = a single stripe). **Higher** ⇒ more fill, less ladder contrast (≥4 ties or inverts the lightest facet against the darkest). Always bounded above by the facet's own zone ceiling. |
| gate | `soloOrient ? FACET_MIN_RULINGS : <the control>` — **the control is inert on solo-orientation records by construction** (§2.2) |
| mappers | **`hatch` and `crosshatch` only** |

**Naming rationale:** the key names the thing it is (`FACET_MIN_RULINGS`, minus the shouting), it is
not confusable with `sliceCount` / `fillDensity`, and it sorts next to nothing it could be mistaken
for. `min`-prefixed alternatives (`minFacetRulings`) read worse in `styleParams.<key>` at the use site.

### 2.2 Which styles / objects it reaches — MEASURED, not assumed

The brief said "hatch/crosshatch/contour". **Contour is wrong** and must be corrected: contour, spiral
and stipple are `REGION_MAPPERS` (`scene3d.js:1002`) and go to `faceRegionLines`, which never touches
the grant. Measured — box + `contour`, `facetMinRulings` 1 and 8: **byte-identical** (ink 721.077 in
all three runs).

Full inertness roster, every row measured in the export (whole-layer md5 over every emitted path, 9 dp):

| surface | inert? | proof |
|---|---|---|
| **solo-orientation records** (the app-default `plane`; **the ground plane**) | **YES**, by the explicit gate | `plane` at control 1 / 3 / 8 — obj md5 identical, ink 390.845 in all three. **The ground plane's md5 and ink were identical in every one of the ~50 cases measured, including the ones where the object changed.** Decision 3 (~2.5× denser ground, CONFIRMED) is not reopened. |
| **smooth primitives** (sphere, ellipsoid, torus, cone, cylinder, capsule) | **YES** — they never enter `faceHatchLines` | sphere at 1 / 3 / 8 — md5 identical, ink 1204.704 |
| **region mappers** (contour, spiral, stipple) | **YES** | box+contour at 1 / 3 / 8 — md5 identical, ink 721.077 |
| **mono tone laws** handled by `faceMonoLines` | **YES** for the ones it handles | box + `etfKang` at 1 / 8 — md5 identical, ink 5491.959. ⚠ `faceMonoLines` returns `null` above `MONO_MAX_FRONT_FACES = 12` front facets (`:3003`, `:3038-3042`) and then falls through to `faceHatchLines` — so a mono law on a high-poly faceted object **does** respond. Enumerate this in the test, do not assert blanket mono inertness. |
| **non-carrier (crossed) families** | **YES** — `if (i > 0) return;` | box+crosshatch at 1 / 8: `face:+X@128`, `face:+Y@117`, `face:+Z@73` unchanged to 0.1 mm; only the carriers move |
| **high Density** | **YES** at the top of the range | box at d=220: control 1 and 8 both md5-identical (ink 5434.551). solid at d=220: both identical (2579.219). box at d=100: control 1 identical; control 8 moves only the most foreshortened facet (+14.3 mm of 2722) |
| **`toneLaw: 'none'` (Stage 0)** | **NO — it responds** | box, Stage 0: ink 377.845 → 337.921 at 1, → 690.977 at 8. `zone` is undefined there so `zoneCeil = formCeiling(undefined)` aliases `formCeiling('M')` and the grant still fires; only `soloOrient` is gated on `zone`. **Disclose this; it is correct behaviour** (the floor applies to Stage 0 today too) but it means the control is live wherever the descriptor is shown. |
| **x-ray back faces** | **NO — they respond** | `scene3d.js:4002` calls `faceHatchLines` without `record`, so `isSoloOrientation(undefined)` is false and back faces take the graded branch. Byte-identical at the default; assert that, and say so. |
| **`pyramid`** | **YES at every density measured** | control 1 / 2 / 5 / 8 at d = 5, 50, 220: md5 identical every time (ink 266.697 / 932.709 / 4034.133). Its chart-wrapped facets always out-ask the floor, so the grant never fires. **The pyramid is NOT a useful evidence cell — see §6.** |

**The responsive set is therefore: faceted primitives (`box`, `solid`, and imported/converted meshes)
× `hatch` | `crosshatch` × a non-mono tone law (or Stage 0) × Density below roughly 100.**

### 2.3 The four origins (CLAUDE.md § Configuration — read this before writing a line)

There is **no** `ALGO_DEFAULTS.object3d.style.params` entry and **no** factory preset carrying any
faceted-fill key: `src/config/defaults.js` ships `ALGO_DEFAULTS.object3d.style = { penId: null,
mapper: 'hatch', params: {} }` and `styleTable.scene = { …, params: {} }`. Of the three shipped
`user-presets/scene3d/*.vectura`, two are `wireframe` and `studio-shadows.vectura` is `hatch` with no
faceted-fill overrides. So `facetMinRulings` has exactly **three** live origins and **all three must
read 3**:

1. `scene3d.js:2674-2676` — `finite(styleParams.facetMinRulings, FACET_MIN_RULINGS)`, i.e. the
   constant remains the fallback. **`FACET_MIN_RULINGS` itself is not renamed and its value is not
   changed** — it stays 3 and stays the solo-path floor.
2. `params.js` — `case 'facetMinRulings': return clamp(Math.round(finite(value, 3)), 1, 8);`
3. `scene3d-panel.js` — the descriptor's `default: 3`.

⚠ The descriptor default is **live, not documentation**: `mapperDefaults` (`scene3d-panel.js:504-512`)
seeds `out[d.key] = carry(cur, d.key, cloneDefault(d.default))` on **every** mapper switch, so the
value is written into the bag on a `wireframe → hatch` detour. That is harmless here **only because
3 is measured byte-identical to the key being absent** (§4.1) — pin all three in one assertion (§3 T6).
This is the stale-Occlusion-Bias trap; it has caught this repo before.

### 2.4 Serialization / `.vectura` round-trip

`Params.normalizeStyle` (`params.js:837-860`) runs `clampStyleParam` per key with pass-through for
unknown keys. With the `case` added:

- a saved `facetMinRulings` round-trips **clamped and rounded**;
- a document saved by an older build (key absent) resolves to 3 at `generate()` time — today's picture;
- **no `SCENE_MIGRATIONS` step and no `SCENE_VERSION` bump** — nothing structural changed. This is the
  same reasoning the file already records for `toneLaw` and for W-35's `sliceEndOverlap`
  (`params.js:732-735`).
- Undo/redo and the scene / object / face scope writes need no change — the control writes through
  `commitStyle` / `commit()` like every other descriptor.

### 2.5 Preset bundler impact

**None.** No shipped preset names the key, so `npm run user-presets:bundle` has nothing to add or
strip, and `src/config/user-presets.js` must not be hand-edited. `studio-shadows.vectura`
(`mapper: hatch`) must still load byte-identically — assert it (§3 T8). If Jay later wants a demo
preset that ships a non-default floor, that is a separate `.vectura` file plus a re-bundle.

### 2.6 UI placement — four minimal hunks in a five-author file

`src/ui/panels/scene3d-panel.js` is 4931 lines and is edited by several lanes. **Re-read each region
immediately before editing; on "file modified since read", re-read and merge — never overwrite.**

| # | where (line at `426cc5e4`) | edit |
|---|---|---|
| **H1** | beside the `D_*` consts, **`:392-395`** | one const: `const D_FACETFLOOR = { key: 'facetMinRulings', kind: 'slider', label: 'Min rulings', ariaLabel: 'Minimum facet rulings', min: 1, max: 8, step: 1, default: 3, help: '…' };` |
| **H2** | `MAPPER_CONTROLS`, **`:405`** and **`:406-411`** | append `D_FACETFLOOR` to the `hatch` array and to the `crosshatch` array. **Nothing else.** This *is* the Style-tab control and *is* the context-bar control — `renderControl` (`:4147-4180`) renders both surfaces generically from `MAPPER_CONTROLS`. |
| **H3** | the imperative per-leaf block, after the Angle dial at **`:1389-1396`** (inside `if (FILL_MAPPERS.has(style.mapper))`, **`:1367`**) | one `slider(host, 'Min rulings', {...})` wrapped in `if (style.mapper === 'hatch' \|\| style.mapper === 'crosshatch')`, so the Object tab matches the Style tab. Note the third `FILL_MAPPERS` block (**`:1731`**, the Boolean-fuse leaf) delegates to `fillStyleControls` and needs **no** edit. |
| **H4** | `persistentStyleKeys()` base array, **`:489`** | add `'facetMinRulings'` to `['fillDensity','fillAngle','toneLaw']`. Required: without it a `hatch → wireframe → hatch` detour silently resets the user's floor to 3 — the exact bug the function's own comment (`:472-487`) documents. One token; assert it (§3 T9). |

**`src/config/context-bar.js` — NOT touched.** Confirmed: `grep -n 'fillDensity\|facetMin'
src/config/context-bar.js` → 0 hits. That file carries the fill-style roster and reachability rules
only. Say so in the impl report rather than inventing an edit (W-35's implementer hit the same
phantom).

**In-app help.** `src/ui/modals/help-shortcuts.js` still has **no 3D Scene section** (grep for
`3d`/`scene` → 0 hits), so the help sentence lands on the descriptor's `help` field, rendered by
`renderControl` as the row's `title` tooltip (`:4147-4155`) — exactly where W-35 put its sentence.
Opening a "3D Scene" Help Guide tab remains a separate, already-filed follow-up.

---

## 3. RED oracle

New file **`tests/unit/scene3d-facet-min-rulings.test.js`**. **Do not edit any existing scene3d test
file** — all ten guards below pass unchanged with the prototype in place (§4.2), so any edit to one of
them means the default has leaked.

Rig: `engine.addLayer('scene3d')` + `computeAllDisplayGeometry()` — the app's own entry point, as
`scene3d-box-density-bearing.test.js` does. Never `generate(params)` alone: a direct call supplies the
value under test and cannot see three of the four origins (CLAUDE.md).

| # | assertion | state at `426cc5e4` | why it is honest |
|---|---|---|---|
| **T1 — the default is a no-op** | whole-layer md5 (every path, 9 dp, ground included) with the key **absent** == with `facetMinRulings: 3` == the **pre-fix tree** (via `scriptOverrides` on `git show 426cc5e4:src/core/algorithms/scene3d.js`), across `{box, solid, pyramid, plane, sphere} × {hatch, crosshatch} × d ∈ {1, 50, 220} × fillAngle ∈ {20, 45}` | GREEN-side must-not-break (vacuous before the change) | the assertion that makes the control shippable at all |
| **T2 — control 1 lowers the floor** | app-default box, d=50, fillAngle 20: the lit facets `face:+X` and `face:+Y` each draw **≥ 1 and < 3** rulings (measured: **1 and 1**); at fillAngle 45 they draw **2 and 1** | **RED** (3 and 3 today) | the brief's own bar, measured |
| **T3 — monotone in the control** | object ink is **strictly increasing** in the control at 1<2<3<4<5<6<8 on the app-default box (d=50, a20) **and** on `solid` (d=50, a20) | RED (flat — the key does nothing) | the contract stated as the user reads it |
| **T4 — the ceiling still wins** | at control 8 on the app-default box, `face:+Y` draws **5** rulings, not 8 — `ceilCount` clamps it; and the object's `face:+Z` (zone F) carrier is untouched at every control value at d=50 | RED-by-construction for any design that bypasses `ceilCount` | the anti-cheat: the control must not be able to buy its way past a zone's plot-safety ceiling |
| **T5 — inertness roster** | md5-identical at control 1 **and** 8 for: `plane` (solo), the **ground plane's own paths in every scene** (assert separately from the object's), `sphere`, box+`contour`, box+`etfKang`, `pyramid`, box at d=220, solid at d=220 | vacuous today ⇒ GREEN-side guard | §2.2, every row measured |
| **T6 — one default, three origins** | `clampStyleParam('facetMinRulings', undefined) === 3` **and** the `hatch` + `crosshatch` descriptors' `default === 3` **and** a scene with the key deleted md5-matches one with `3` | **RED** (no case, no descriptor) | the stale-default trap (§2.3) |
| **T7 — ladder trade, pinned as a table not as a bar** | pin the §1.3 coverage table (M/L/F at controls 1…8, ±1 %) as a **measurement**, and assert in the same test that at the **default** the F/L step is ≥ 1.25× and the F/M step is ≥ 1.25× — i.e. **O20's bar re-expressed at the default, in a new file.** Do **not** move, widen or re-pin `scene3d-facet-tone.test.js` or `scene3d-projected-pitch.test.js` | RED (table does not exist) | states the cost of the knob in the same currency O20 uses, without touching O20 |
| **T8 — preset round-trip** | `user-presets/scene3d/studio-shadows.vectura` (`mapper: hatch`) loads md5-identically; `normalizeStyle` clamps 0→1, 99→8, `'x'`→3, 4.6→5; a scene saved with `facetMinRulings: 5` and reloaded still renders 5 | RED (no clamp case) | §2.4 / §2.5 |
| **T9 — mapper-detour survival** (integration, `tests/integration/scene3d-panel.test.js`) | switching to `hatch` seeds `facetMinRulings: 3`; the slider mounts as `input.ctrl-slider[aria-label="Minimum facet rulings"]` with `min=1 max=8 step=1 value=3`; a drag writes through to `styleTable.byObject[...]`; and `hatch → wireframe → hatch` **preserves** a user-set 5 | RED (no descriptor, no `persistentStyleKeys` entry) | H2 + H4 |
| **T10 — mutation guard (non-vacuity)** | with the grant's floor expression text-mutated back to the literal `FACET_MIN_RULINGS` via `scriptOverrides`, **T2 and T3 must fail** — T3's ink spread collapses from 367→666 mm (1.81×) to 0 | — | proves T2/T3 are load-bearing, in the shape reviewers have demanded all round |

**Do not** write an oracle on "Density now bears on a graded facet". It does not, and it is not
supposed to (§4.4) — that is `W-15c-E-plan.md`'s closed result and Jay's decision 7 accepts it.

---

## 4. Prototype — built, run, and measured in the export

The patch is 4 lines at `scene3d.js:2674-2676`:

```js
const ceilCount = Math.floor(zoneCeil / f.covOne);
const soloDens  = soloOrient ? Math.round((f.ext / Math.max(1e-6, hatchSpacing(styleParams.fillDensity))) - 0.5) : 0;
const userFloor = soloOrient
  ? FACET_MIN_RULINGS                                    // solo keeps W-15c's floor — ground plane untouched
  : Math.round(Math.min(8, Math.max(1, finite(styleParams.facetMinRulings, FACET_MIN_RULINGS))));
const want      = Math.min(ceilCount, Math.max(userFloor, soloDens));
```

The `soloOrient ? FACET_MIN_RULINGS : …` shape is what keeps the **ground plane byte-identical by
construction**, which decision 3 requires. (A `Math.max(userFloor, soloDens)` without the gate would
also be inert on the ground in the common case — `soloDens` is usually > 3 — but not at the bottom of
the Density range, where `soloDens` falls below 3. Use the gate; do not rely on the coincidence.)

### 4.1 The default is byte-identical — proven, not asserted

Whole-layer md5 over every emitted path (9 dp), patched runtime vs unpatched runtime, same process:

| case | key absent | `= 3` | verdict |
|---|---|---|---|
| box, hatch, d 1 / 5 / 25 / 50 / 100 / 220, fillAngle 20 and 45 | `2f648ba9…` etc. | same | **IDENTICAL** |
| solid, hatch, d 1 / 25 / 50 / 100 / 220 | — | same | **IDENTICAL** |
| pyramid, plane, sphere; crosshatch; contour; `etfKang`; Stage 0 | — | same | **IDENTICAL** |
| **the ground plane's own paths, in all ~50 cases** | — | same | **IDENTICAL** |

### 4.2 Guard table — every named guard, run with the prototype in the tree at its default

| file | result |
|---|---|
| `tests/unit/scene3d-facet-tone.test.js` (O20 / O21 / O22) | **15 / 15 pass** |
| `tests/unit/scene3d-projected-pitch.test.js` (C15 / O20) | **17 / 17 pass** |
| `tests/unit/scene3d-box-density-bearing.test.js` (incl. its byte-identity fingerprints) | **4 / 4 pass** |
| `tests/unit/scene3d-appdefault-facet-fill.test.js` | **7 / 7 pass** |
| `tests/unit/scene3d-subwindow-density.test.js` (the 0.40 ink-coverage control) | **3 pass + 2 skipped** |
| `tests/unit/scene3d-hatch-density-500.test.js` | **14 / 14 pass** |
| `tests/unit/scene3d-faceted-highlight-dispatch.test.js` (O9) | **12 / 12 pass** |
| `tests/unit/scene3d-faceted-tone-law.test.js` | **19 / 19 pass** |
| `tests/unit/scene3d-faceted-density-calibration.test.js` | **7 / 7 pass** |
| `tests/unit/scene3d-hlr-spatial-index-identity.test.js` (byte-identity goldens) | **6 / 6 pass** |
| `tests/unit/scene3d-appdefault-lit-floor.test.js` | **4 pass + 1 skipped** |

**Zero bars moved. Zero fingerprints re-pinned.** This is the whole difference between W-38 and the six
designs F-14 consumed: the knob is off by default, so it costs nothing.

### 4.3 The knob's own numbers

**App-default box, hatch, d=50, fillAngle 20** (`scene3d-box-density-bearing.test.js`'s fixture) —
rulings on `face:+X` / `face:+Y`, object ink in mm:

| control | 1 | 2 | **3** | 4 | 5 | 6 | 8 |
|---|---|---|---|---|---|---|---|
| rulings +X / +Y | 1 / 1 | 2 / 2 | **3 / 3** | 4 / 4 | 5 / 5 | 6 / **5** | 8 / **5** |
| object ink | 361.82 | 418.83 | **478.60** | 532.89 | 591.67 | 615.78 | 666.01 |

Strictly monotone; `face:+Y` plateaus at 5 (its `ceilCount`); `face:+Z` (the dark facet, 9 + 1
rulings, 285.7 mm) is **untouched at every value** — the control never darkens what Density has
already ruled.

**`solid` (faceted sphere, 12 visible facets), hatch, d=50, fillAngle 20** — object ink:

| control | 1 | 2 | **3** | 4 | 5 | 6 | 8 |
|---|---|---|---|---|---|---|---|
| ink | 161.74 | 247.71 | **344.87** | 434.72 | 512.14 | 579.54 | 673.78 |

### 4.4 The one genuinely new finding: lowering the floor restores *some* Density-bearing

`solid`, hatch, fillAngle 45, object ink at Density 1 / 25 / 50:

| control | d=1 | d=25 | d=50 | spread |
|---|---|---|---|---|
| **3 (today)** | **325.736** | **325.736** | **325.736** | **1.00× — F-14, byte-identical, exactly the gallery's `solid__hatch__ladder__low` == `med`** |
| 2 | 230.098 | 230.098 | 232.600 | 1.01× |
| **1** | **125.505** | **127.817** | **166.904** | **1.33×** |

At the default the floor binds on every facet at every low/mid Density, so Density has **zero**
authority — that is F-14's gallery symptom, reproduced here at v1.4.1. Drop the floor to 1 and the
facets fall out from under it, so Density starts bearing again (1.33× between d=1 and d=50).

**This is a real user-visible gain and it must be stated honestly in both directions:** the control
does not make Density bear at the *default*, and raising it makes Density bear *less* (at control 8
the solid renders identically at d=1 and d=50). W-38 gives the user the floor; it does not repeal
`W-15c-E-plan.md` §2.

---

## 5. Files — allowed and forbidden

**ALLOWED (and nothing else):**

| file | edit |
|---|---|
| `src/core/algorithms/scene3d.js` | the carrier grant **only**, `:2674-2676` — 4 lines + a comment block citing this plan. Do **not** change `FACET_MIN_RULINGS`'s value at `:66`; do **not** touch `soloDens`, `ceilCount`, `target`, or the `i > 0` gate |
| `src/core/scene3d/params.js` | **one `case`**, adjacent to the faceted-fill cluster (after `case 'altFillMapper':`, `:722`). Change nothing else in the file; announce the touch to the orchestrator before starting so any lane holding `params.js` can serialise |
| `src/ui/panels/scene3d-panel.js` | the four hunks H1–H4 of §2.6, nothing more. Re-read each region immediately before editing |
| `tests/unit/scene3d-facet-min-rulings.test.js` | **new file** |
| `tests/integration/scene3d-panel.test.js` | **one new test** (T9) |
| docs | `CHANGELOG.md`, `README.md`, `plans.md`, `docs/3d-audit/STILL-OPEN.md`, `docs/3d-audit/lane-reports/LEDGER.md` |

**FORBIDDEN:**

- `src/core/scene3d/surface-fill.js` and `surface-fill-mono.js` — the whole smooth-surface path. The
  control is inert there by construction; if it looks like it needs an edit there, the design is wrong.
- **Slices**: `buildSliceSegments`, `contourSlice`, `refineSliceRing`, `extendFrontChains`,
  `src/core/scene3d/mappers.js`.
- `hlr.js`, `shadows.js`, `regions.js`, `src/config/defaults.js`, `src/config/context-bar.js`.
- **Any existing scene3d test file**, and every baseline JSON. All eleven guards pass unchanged (§4.2).
- `src/config/user-presets.js` and `user-presets/**`.
- **Any change to the value 3**, anywhere. The constant, the clamp fallback and the descriptor default
  must all read 3 and must all stay 3.

---

## 6. Evidence the implementer owes

The gallery capture script hard-codes its style bag — `scripts/audit/scene3d-capture.js:231`
`params: { fillAngle: 45, fillDensity: densityValue, toneLaw: item.style }` — so it cannot sweep the
new key. Two captures, therefore:

**(a) Gallery re-shoot, as proof of the no-op.** The cells exist (confirmed in
`docs/3d-audit/fill-audit/manifest.A.1-1.jsonl`, 576 rows at `appVersion 1.4.1`):
`{box, solid, pyramid, plane} × {hatch, crosshatch} × ladder × {low, med, max} × {a, b}` = 48 rows,
`shots/A/<prim>__<mapper>__ladder__<density>__<cam>.webp` (`DENSITY_VALUES = {low: 1, med: 50,
max: 220}`, `scene3d-capture.js:123`).

```
node scripts/audit/scene3d-capture.js --tier A --root <worktree> --port <port> \
  --only '(box|solid|pyramid|plane)__(hatch|crosshatch)__ladder' \
  --out docs/3d-audit/fill-audit/after/W-38
```
run **from MAIN**, then `after/W-38/report.json`. **Every pair must be byte-identical**, and the
protocol requires that to be explained rather than merely noted.

**(b) The bespoke sweep — the real evidence.** Copy `buildAndMeasure`
(`scene3d-capture.js:194-262`) into `scripts/audit/w38-facet-floor-sweep.js`, adding
`facetMinRulings` to the style bag, and shoot **`box` and `solid`** — **not `pyramid`**, which is
measured inert at every control value and every density (§2.2) — at **control ∈ {1, 2, 3, 5, 8}**,
`fillDensity 50`, `fillAngle 45`, camera `a`, same `FIXED_ZOOM` framing. Then **crop the two lit
facets at native resolution** (PIL/magick → Read) and describe what you see: at 1 a single stripe per
lit facet; at 3 today's picture; at 5 the lit facets visibly matching the dark one; at 8 the box
reading flat. A whole 800 px cell hides this — that is the 2026-09-05 failure mode.

**(c) Live app verification (non-negotiable).** In the running app: add a box, Style tab → the
**Min rulings** row appears under hatch and crosshatch and **not** under contour / spiral / stipple /
wireframe / Slices; drag 1 → 3 → 8 and screenshot each; confirm one undo per gesture; confirm the
Object-tab slider and the Style-tab slider agree; confirm the value survives `hatch → wireframe →
hatch` and a `.vectura` save/open round-trip; confirm the **ground plane does not change** as the
slider moves (this is decision 3's invariant, and it is the one a screenshot can actually show);
confirm a `sphere` is unaffected. The chrome-devtools MCP browser is a shared singleton and is
currently failing to connect — **use Playwright** (`tests/e2e` helpers), do not fight the lock.

---

## 7. Docs contract

| doc | what to write |
|---|---|
| `CHANGELOG.md` | one entry under the new version: *"3D Scene — new **Min rulings** control on hatch and crosshatch fills (1–8, default 3 — no change to existing scenes): the fewest rulings a graded facet may be granted when Density's own answer falls short. Lower for more tone contrast, higher for more fill."* **Re-read the top of the file immediately before editing** — top-collision file |
| `README.md` | one line in the 3D Scene feature panel, same sentence, plus "bounded by each zone's ink ceiling" |
| in-app help | the descriptor's `help` field (there is no 3D Scene Help Guide tab — `src/ui/modals/help-shortcuts.js` has none): *"The fewest rulings a facet may be given when Density asks for less. Lower (1–2) keeps the tone ladder's contrast but leaves facets nearly bare; higher (4–8) fills the lit facets at the cost of that contrast. No effect on smooth shapes, on contour/spiral/stipple fills, or on the ground."* No shortcut is added — say so explicitly in the impl report |
| `plans.md` | mark W-38 done; record that F-14's graded remainder stays closed by-design (`W-15c-E-plan.md` §2) and that this unit ships the *choice*, not a fix |
| `docs/3d-audit/STILL-OPEN.md` + `lane-reports/LEDGER.md` | update the F-14 / decision-7 entries with the landing sha, §4.3's numbers, and §4.4's finding (control 1 restores a 1.33× Density spread on the solid where the default has 1.00×) |
| version | patch bump via the commit hook — a worktree cannot bump; **do not bump by hand** |

**Release-note sentence (decision 7A's alternative, carried verbatim as Jay's decision 7 requires):**

> *On graded objects Density sets the object's ink range while tone allocates within it; this control
> lowers the floor.*

---

## 8. Stop conditions

Stop, write the report, and hand back rather than pressing on if any of these is true:

1. **T1 is not exact.** If the key absent ≠ `= 3` ≠ the pre-fix tree on any of the cells in §3 T1, the
   change has leaked into the default path. Do not explain a 1e-9 difference — restructure so the
   default branch evaluates to the literal `FACET_MIN_RULINGS`.
2. **Any existing bar moves.** All eleven guard files in §4.2 pass unchanged today with the prototype
   in the tree. A single moved fingerprint means the default is not a no-op. **Never re-pin.**
3. **The ground plane changes at any control value.** That reopens decision 3, which Jay has just
   closed. It cannot happen with the `soloOrient` gate; if it does, the gate is wrong.
4. **Anyone proposes touching `surface-fill*.js`**, the slices pass, or `FACET_MIN_RULINGS`'s value.
   All three are out of scope by §5 and the first two belong to other lanes.
5. **Anyone proposes widening the range** past 1…8 — in particular to 0. §1.3 prices both ends;
   0 restores a shipped defect class and >8 spends plot-safety headroom that was measured at 4.6 %.
6. **Anyone proposes making Density bear on graded facets** as part of this unit. That is F-14's
   graded remainder, six designs deep and closed by-design; W-38 is explicitly the *other* answer.
7. **`params.js` or `scene3d-panel.js` is dirty with another lane's work.** Stop and report; do not
   layer edits on top of someone's uncommitted change (CLAUDE.md § Concurrent Development).
8. **The live app shows the control on a surface §2.2 says is inert** (a sphere, a contour fill, the
   Slices mapper) — the descriptor has been attached to the wrong mapper list.

---

## Bars changed

**None.** This is a plan; it moves no threshold. The implementer's expected entry is also **none** —
the prototype was run against all eleven guard files at its default and every one passed at its
existing count (§4.2). If a bar moves, the design has been mis-implemented.

---

## Appendix — how the planner's numbers were produced (reproducible)

Scratch export of `426cc5e4` (`git archive | tar -x`, `node_modules` symlinked), driven through
`tests/helpers/load-vectura-runtime` under vitest in the export, two runtimes per run (unpatched and
`scriptOverrides`-patched) so every comparison is same-process. Scenes built with
`engine.addLayer('scene3d')` + `computeAllDisplayGeometry()` — the Add Layer gesture verbatim, with
the primitive swapped exactly as the shape flyout swaps it (`Params.buildPrimitiveParams`). Metrics:
ruling count and length-weighted ink per `(faceId, rendered bearing)`; whole-layer md5 over every
emitted path at 9 dp; a separate md5 over every path whose `sceneTarget.objectId` is **not** the
object, which is the ground-plane/shadow fingerprint; composed coverage `D = ink × penWidth /
projectedFaceArea` with the projected area taken by shoelace off `face.polygon`, and the carrier plan
(`ext`, `k`, `plane`, `zone`, `ceilCount`, `covOne`, `zoneCeil`) instrumented at the grant. The guard
suites of §4.2 were then run against the patched source in the export, foreground, one file at a time.
The repository was never edited; the scratch directory has been removed.
