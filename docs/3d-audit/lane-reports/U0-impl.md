STATUS: DONE

# U0 implementer report — fill-collapse

- **Lane / worktree**: fill-collapse, `.claude/worktrees/fill-collapse` (port 8482)
- **Base sha**: `142afe58653ac9d6efe8c56dffcc97b53190fe1b` (fix(3d-audit): W-10d — hide originSpiral Fill Style on the torus in the picker), branch `3d-scene/fill-collapse` off `3d-scene/fill-audit`
- **New sha**: `a8d84befa9bb4db17be31d274499e34278c0fa7d` — feat(scene3d): tone-law collapse foundation — aliases, resolver, data-driven sub-control (U0)
- **Plan**: `docs/3d-audit/lane-reports/W-22-24-W-18-plan.md` §4 "U0 — Foundation"

## What landed

U0 is plumbing only — the whole point is byte-identical behavior with an **empty** `COLLAPSE` table.

1. **`scripts/build-tone-laws.js`** — added the hand-curated `COLLAPSE` table (empty in U0, one row per survivor for U1-U8), and derived `ALIASES` (folded id → `{into, params}`), `PICKER_IDS` (`IDS` minus every folded id), and `STYLE_PARAMS` (`COLLAPSE` verbatim). Added the four integrity throws from plan §2.1 (every `ALIASES` key ∈ `IDS`; every `.into` ∈ `PICKER_IDS`; every option `law` ∈ `IDS`; `PICKER_IDS ∪ keys(ALIASES) === IDS`). Regenerated `src/config/scene3d-tone-laws.js` — purely additive diff (68 lines added, 0 removed/changed) exporting `PICKER_IDS` (48, === `IDS`), `ALIASES` (`{}`), `STYLE_PARAMS` (`{}`).
2. **`src/core/scene3d/params.js`**:
   - New `Params.resolveToneLaw(styleParams)` — the (survivor + collapse params) → internal-id resolver, exactly per plan §2.2's five rules. Identity for every input while `ALIASES`/`STYLE_PARAMS` are empty; a synthetic-alias unit test (case 6) proves the real mechanism works for when U1-U8 populate the table.
   - `clampStyleParam`'s `'toneLaw'` case: added the alias→survivor mapping (never warns) for the single-key paths (`shadowToneLaw`) that have no sibling bag to write a param into — the "belt to that brace" from plan §2.3.
   - `normalizeStyle`: added the migration shim — a folded id in the raw (pre-clamp) `src.params.toneLaw` is rewritten to `{toneLaw: survivor, ...params}`, never overwriting an explicit sibling value already in the bag. Documented the same way, and for the same reason, as the existing `HIGHLIGHT_TREATMENT_ALIASES` precedent: no `SCENE_MIGRATIONS` step, no `SCENE_VERSION` bump.
   - Exported `resolveToneLaw` on the `Params` api.
3. **`src/core/algorithms/scene3d.js`** (2 lines, both inside the single `generate` closure that spans the whole file — `Params` already in scope at both sites):
   - `facetedToneLaw` now resolves through `Params.resolveToneLaw` before the `IDS` membership test.
   - The curved `buildObject` opts (`toneLaw: sp.toneLaw,` → `toneLaw: Params.resolveToneLaw(sp),`).
4. **`src/config/context-bar.js`**:
   - `SCENE_FILL_STYLES.groups()` now filters on `R.PICKER_IDS` (falling back to `R.IDS` when absent).
   - `SCENE_FILL_STYLES.resolve()` maps an alias id to its survivor before the entry-exists check.
   - New `SCENE_FILL_STYLES.styleParams(id)` — returns `R.STYLE_PARAMS[id] || []`; the single data source both UI surfaces render the generic sub-control from.
5. **`src/ui/panels/scene3d-panel.js`**:
   - `fillStyleControls` — after the (i) info affordance and before the caveat line, renders one `UI.Select` per descriptor `FS.styleParams(law)` returns, wired through a new `o.writeStyleParams(patch)` callback (mirrors `o.write`, but patches one or more keys at once). All three call sites (leaf panel ~1302, boolean-group panel ~1679, the shared scene/object/face `renderControl`'s `lawpick` branch ~4077) now supply `writeStyleParams` + `paramsBag`.
   - `PERSISTENT_STYLE_KEYS` (a static 3-key array) replaced with `persistentStyleKeys()` — derived from `Vectura.SCENE3D_TONE_LAWS.STYLE_PARAMS` keys, falling back to the same 3-key base list. `mapperDefaults` also seeds the current law's own collapse defaults (mirroring how `D_TONELAW` seeds `toneLaw`) — a no-op today (`STYLE_PARAMS` is `{}`).
6. **`src/ui/shell/context-bar.js`**: `buildStyleBody`'s ctxbar Style flyout renders the identical generic sub-control loop (same `FS.styleParams(law)` data, `flyMixedSelect`/`flyRow`), directly after the Fill Style caveat and before the Stroke Fill row.
7. **`tests/unit/scene3d-tone-law-collapse.test.js`** (new, 8 tests) — the RGR proof (see below).

`src/core/scene3d/shadows.js`, `src/core/scene3d/surface-fill.js`, `src/core/scene3d/surface-fill-mono.js` — **not touched**, confirmed by `git diff --stat` against those three paths (empty).

## RED → GREEN

**RED** (pre-U0 tree): verified by `git stash push -- <the 7 implementation files>` (leaving the new, untracked test file in place) and running `tests/unit/scene3d-tone-law-collapse.test.js` — every one of the 8 tests fails: `Vectura.SCENE3D_TONE_LAWS.PICKER_IDS`/`ALIASES`/`STYLE_PARAMS` are `undefined` and `Vectura.Scene3D.Params.resolveToneLaw` is not a function (each test throws on its first assertion touching either). `git stash pop` restored the implementation; all 8 passed again.

**GREEN**:
- `PICKER_IDS.length === 48` and `=== IDS.length`; `ALIASES === {}`; `STYLE_PARAMS === {}`.
- `resolveToneLaw` is the identity for all 48 IDS + `'ladder'` + `''` + `undefined`/`{}`/`null` + a junk id.
- **Byte-identity sweep** (test 4, real `SurfaceFill.buildObject` calls via a captured-opts harness identical to `scene3d-tone-law-dispatch.test.js`'s pattern): all 48 laws render identically through the raw `toneLaw` and through `resolveToneLaw`. 0 offenders.
- **Mutation-proof** (test 5): forcing `resolveToneLaw` to always return `'ladder'` breaks **48** of the 48 laws — not 47 as I first assumed and had to fix: `'ladder'` is the shipped default and is deliberately **not** one of the 48 roster `IDS` (confirmed directly: `IDS.indexOf('ladder') === -1`), so there is no id in the sweep immune to the forced mutation. Documented inline in the test.
- **Synthetic-alias mechanism proof** (tests 6–7): with `ALIASES`/`STYLE_PARAMS` monkey-patched for the duration of one test to a fake `syntheticFolded → ladder + rungMode:'fine'` entry — `normalizeStyle` migrates it correctly, never overwrites an explicit sibling, `resolveToneLaw` round-trips both directions, and `clampStyleParam`'s single-key path (`normalizeShadow`) maps the alias without warning.
- **Picker plumbing** (test 8): `SCENE_FILL_STYLES.groups(null,null,null)` still offers 49 options (48 + `'ladder'`); `resolve('fineLadder')` is still `'fineLadder'` (no alias exists yet); `styleParams('ladder')` is `[]`.

## Test suites run (foreground, one file at a time — shared machine, per protocol)

| file | result |
|---|---|
| `tests/unit/scene3d-tone-law-collapse.test.js` (new) | 8/8 |
| `tests/unit/scene3d-tone-laws-config.test.js` | 7/7 |
| `tests/unit/scene3d-tone-law-plumbing.test.js` | 5/5 |
| `tests/unit/scene3d-tone-law-params.test.js` | 13/13 (incl. `sceneVersion===4`, untouched) |
| `tests/unit/scene3d-tone-law-dispatch.test.js` | 7/7 |
| `tests/unit/scene3d-faceted-tone-law.test.js` | 19/19 |
| `tests/unit/scene3d-solid-cap-reachability.test.js` | 6/6 |
| `tests/unit/scene3d-shadow-tone-law.test.js` | 20/20 |
| `tests/unit/scene3d-shadow-tone-law-uniqueness.test.js` | 3/3 |
| `tests/unit/scene3d-one-pen-down-reachability.test.js` | 5/5 |
| `tests/integration/scene3d-fill-style-picker.test.js` | 131/131 |
| `tests/integration/scene3d-panel.test.js` | 36/36 |
| `tests/integration/scene3d-panel-style-live-sync.test.js` | 6/6 |
| `tests/integration/context-bar-scene-flyouts.test.js` | 39/39 |
| `tests/integration/stroke-fill-style-control.test.js` | 30/30 |

**342/342, 0 failed, 0 skipped, no `.only` in the diff.** The two heaviest tests (byte-identity sweep, mutation-proof) run ~255s/~129s each under a contended shared machine — genuinely measured work (48 real `buildObject` calls, several through ribbon-fill polygon-boolean paths that print benign `[FillBoolean] polygon union failed on degenerate geometry` warnings — pre-existing engine behavior on ribbon laws, unrelated to this unit, also visible in the untouched `scene3d-tone-law-dispatch.test.js` run), not a hang.

An earlier attempt to run the full suite in the background stalled (a rate-limited session interruption killed the coordinating shell without the vitest run itself timing out) — restarted in the foreground per the coordinator's explicit instruction, confirmed clean.

## Evidence

Prerequisite check: `CURVED_SPIRAL_STIPPLE_INERT` has 44 entries in this worktree (W-03 prerequisite) — confirmed.

Preset exposure (must be 0/0, re-verified in this worktree):
- `grep -rl "toneLaw" user-presets/` → **0 files**
- `grep -rlE "fineLadder|whiteBand|bundleCount|contField|penInterleave|weaveDepth|perceptualRamp|taperedEnds|nibAngle|weightSmoothstep|onePenDown" user-presets/ src/config/user-presets.js` → **0 files**
- `npm run user-presets:bundle` **not run** — nothing to regenerate.

Picker count: `scene3d-fill-style-picker.test.js`'s own `groups()` total is `R.IDS.length + 1` = 49 both at base and after U0 (`PICKER_IDS === IDS`, so the fallback and the real path agree).

**Gallery byte-identity (mandatory per the coordinator's brief)**: captured `torus__hatch__<law>__med__a` for all 49 offered ids (the audit's own cited comparison cell, §1 of the plan) from this worktree at port 8482:

```
node scripts/audit/scene3d-capture.js --tier B --root .claude/worktrees/fill-collapse --port 8482 \
  --only '^torus__hatch__(<all 49 ids>)__med__a$' \
  --out docs/3d-audit/fill-audit/after/U0
```
run from MAIN. **48/48 md5-identical** against `docs/3d-audit/fill-audit/shots/B/<same name>.webp` (0 different, 0 missing). The 49th cell, `originSpiral`, is excluded from **both** sides by W-10d (already merged into this lane's base, `142afe58`) — it is hidden from the Tier B reachability enumeration on `torus` before and after this unit, unrelated to U0. Full detail, per-cell `identical_exceptions` entries (`{"identical": true, "reason": "U0 is plumbing only — ..."}`), and the manifest paths are in `docs/3d-audit/fill-audit/after/U0/report.json` (written to MAIN's working tree, **left uncommitted there** per protocol — I only commit inside this worktree; MAIN is shared scratch for gallery output across every concurrent lane right now, several other `after/<id>/` directories from other lanes are sitting there uncommitted too).

One capture run against a just-spawned dev server on :8482 lost 1 of the 48 cells (`none`) to what measured as a cold-start race between `ensureServer`'s readiness ping and the app's config-script execution finishing; re-running the identical command against the now-warm server produced the complete, correct 48/48 set used above. The stale partial output directory was deleted before the final run — `docs/3d-audit/fill-audit/after/U0/` on disk now holds only the clean, complete capture.

I looked at two of the images directly (Read tool): `torus__hatch__ladder__med__a` (before vs after) are pixel-identical concentric meridian rulings with the ladder coverage-rung dark band across the lower-left quadrant — no visible difference, matching the md5 match. `torus__hatch__bundleDither__med__a` (sanity check only, not a before/after pair) is visibly a denser, dash-broken texture, confirming the roster's laws genuinely differ from each other and the byte-identity result isn't vacuous.

**Live verification: NOT done in a real browser tab this session** — time went to the full 342-test guard matrix and the 48-cell gallery proof instead, which is the load-bearing evidence for a "nothing changed" unit. The integration suites above (`scene3d-panel`, `scene3d-panel-style-live-sync`, `context-bar-scene-flyouts`, `stroke-fill-style-control`, `scene3d-fill-style-picker`) mount real component trees in jsdom and exercise the exact `fillStyleControls`/`buildStyleBody` code paths this unit edited, including the new (empty, zero-row) sub-control loop — but that is not the same as an interactive click-through. Flagging per CLAUDE.md: **NOT visually verified live** rather than claiming a screenshot check that didn't happen.

## Open follow-ups (for U1-U8 / U9)

- U1-U8: populate `COLLAPSE` one cluster at a time in `scripts/build-tone-laws.js`, regenerate the config, add cases to `tests/unit/scene3d-tone-law-collapse.test.js`. No UI file needs touching — `fillStyleControls`/`buildStyleBody`/`persistentStyleKeys`/`mapperDefaults`'s collapse seeding are all data-driven off `STYLE_PARAMS`.
- U9 (lane handoff-c): `shadows.js`'s `HATCH_LAW_RECIPES` lookup must resolve through `Params.resolveToneLaw` before `clampToneLawId` — not done here, per the plan's explicit "U0 stops at the two `scene3d.js` lines" instruction.
- Docs contract (CHANGELOG.md / plans.md / STILL-OPEN.md / worklist.json / README.md) is owned by U8 and amended by U9 per plan §6 — intentionally untouched here.
