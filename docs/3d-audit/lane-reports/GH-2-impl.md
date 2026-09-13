STATUS: DONE

# GH-2 — `--rig addLayer` for scripts/audit/scene3d-capture.js

## Lane / worktree
MAIN: `/Users/jayphi/Documents/github/vectura-studio` (no worktree — this unit's scope is the audit
tooling, run directly in MAIN per the brief). No commit made — changes left in the working tree per
instructions; the orchestrator commits main docs/scripts.

## What changed
`scripts/audit/scene3d-capture.js` gained a `--rig create|addLayer` CLI option (default `create`,
byte-identical to the pre-existing behaviour):

- **`create`** (default, unchanged): strips the descendant layers `engine.addLayer('scene3d')` builds and
  rebuilds a MONOLITH-shaped inline scene (`group.params.objects/lights/styleTable`) with the object's
  params bag seeded from `Scene3D.Params.PRIMITIVE_PARAM_DEFAULTS` merged with `PRIMITIVE_CREATE_DEFAULTS`
  on top — the "Add primitive" shelf's rig. Exact pre-existing code path, now in an `else` branch.
- **`addLayer`** (new): keeps the WHOLE scene tree `engine.addLayer('scene3d')` builds (group + one seed
  `object3d` leaf [`primitive: 'sphere'`, `ALGO_DEFAULTS.object3d.primitive`] + one `sceneLight3d` "Sun" +
  one `sceneGround3d` child, hidden for a clean crop) and mutates the object3d leaf's `params.primitive`
  field **directly** — never through `engine.setObjectPrimitive` / `Scene3D.Params.buildPrimitiveParams`.
  This is the exact construction `tests/unit/scene3d-ribbon-wall-coverage.test.js` (L47-59, via
  `tests/helpers/scene3d-ring-coverage.js`) and `tests/unit/scene3d-ribbon-f1b-streaks.test.js` (L221-233)
  both use — I diffed the two test files' setup blocks and they construct identically:
  ```js
  const engine = new V.VectorEngine();
  const groupId = engine.addLayer('scene3d');
  const obj = engine.getLayerDescendants(groupId).filter(l => l.type === 'object3d')[0];
  obj.params.primitive = 'torus';
  obj.params.style = obj.params.style || { penId: null, mapper: 'hatch', params: {} };
  obj.params.style.params = { ...(obj.params.style.params || {}), toneLaw };
  ```
  Because the primitive is swapped **without** rebuilding `params.params`, the object3d leaf keeps
  whatever the SEED primitive's own `PRIMITIVE_CREATE_DEFAULTS` bag was (sphere: radius 25, detail 28) —
  this is deliberate: it is the exact mismatch
  `docs/3d-audit/fill-audit/after/F1-erode/report.json`'s `gallery_capture_finding` names as the reason
  the gallery's `create` rig cannot evidence certain runtime fixes at all.

  I additionally overlay `mapper`/`fillAngle`/`fillDensity`/`toneLaw` onto `obj.params.style.params`
  (spreading whatever existing style params ALGO_DEFAULTS.object3d seeded, same spread pattern the tests
  use) so the capture script's density/mapper/style sweep axes still work under this rig — the tests
  themselves never vary density, so this is an intentional, documented extension of the test pattern, not
  a deviation from it.

- **Manifest rows and filenames carry the rig, never colliding with the default rig or GH-1's
  before/after pairing**: shot filenames get an `__addlayer` suffix
  (`torus__hatch__interlockWeave__med__a__addlayer.webp` vs the default rig's unsuffixed name), the
  per-shard manifest file gets a `.addlayer.jsonl` suffix instead of `.jsonl`, and every manifest row
  carries a `rig` field (`"rig":"create"` or `"rig":"addLayer"`). The default `create` rig's filenames and
  manifest paths are completely unchanged (verified below), so GH-1's before/after pairing, which always
  ran under the default rig, is unaffected.

## Files touched
- `scripts/audit/scene3d-capture.js` (only tracked file changed)
- `docs/3d-audit/fill-audit-handoff.md` — one paragraph added to "Read this first" item 1, under the
  existing "Re-shoot any subset" recipe, documenting `--rig addLayer`.
- `docs/3d-audit/fill-audit/after/GH-2/` (new evidence dir — `report.json`, `shots/*.webp`, `crops/*.png`,
  `manifest-addlayer-before-after.jsonl`, `manifest-create-control-before-after.jsonl`)

No other tracked file was touched. `git status --short -- . ':!graphify-out'` before and after this unit
shows the same pre-existing WIP from other lanes (STILL-OPEN.md, LEDGER.md, SESSION-SUMMARY.md,
F1-placement/report.json, and various untracked `after/*` dirs / lane-reports) — none of it mine, none of
it modified by me.

## (1) Byte-identical proof for the default rig
Ran 2 cells with the pre-edit script (`git show HEAD:scripts/audit/scene3d-capture.js`, temporarily copied
into `scripts/audit/` for node module resolution, deleted immediately after) and with the edited script
(both with no `--rig` flag, and with explicit `--rig create`), against the same MAIN dev server
(port 8930, v1.4.1, killed after use):

| cell | pre-edit md5 | post-edit (default) md5 | post-edit (`--rig create`) md5 | identical |
|---|---|---|---|---|
| `torus__hatch__interlockWeave__med__a` (Tier B) | `86f08b57b17a0812a442e58f24810569` | `86f08b57b17a0812a442e58f24810569` | `86f08b57b17a0812a442e58f24810569` | yes |
| `sphere__hatch__ladder__low__a` (Tier A) | `396a0a13e7c4c8db8c517d603c855c1c` | `396a0a13e7c4c8db8c517d603c855c1c` | — | yes |

Manifest rows are identical except the new `rig` field appended to the record (pathCount, totalPoints,
inkMm, wallRings, wide, appVersion, genMs are all unchanged).

## (2) `--rig addLayer` proves the runtime fix moves; `--rig create` does not
Worktree `.claude/worktrees/fill-audit-a3` was clean (`git status --short` empty). Exported both SHAs with
`git -C .claude/worktrees/fill-audit-a3 archive <sha> | tar -x -C /private/tmp/claude-501/scratch-GH2/<sha>`,
symlinked `node_modules` from MAIN into each export, and let the capture script auto-start dev servers via
`--root <export> --port <free>` (8931 for `7f805654`, 8932 for `e2c3ca85`; both killed after capture).

Commands run from MAIN:
```
node scripts/audit/scene3d-capture.js --tier B --root /private/tmp/claude-501/scratch-GH2/7f805654 \
  --port 8931 --rig addLayer --only '^torus__hatch__interlockWeave__med__a$' \
  --out /private/tmp/claude-501/scratch-GH2/before-7f805654
node scripts/audit/scene3d-capture.js --tier B --root /private/tmp/claude-501/scratch-GH2/e2c3ca85 \
  --port 8932 --rig addLayer --only '^torus__hatch__interlockWeave__med__a$' \
  --out /private/tmp/claude-501/scratch-GH2/after-e2c3ca85
```
(and the same pair again with `--rig create` as a control.)

| rig | sha 7f805654 (pre-fix) md5 | sha e2c3ca85 (F1-erode fix) md5 | identical |
|---|---|---|---|
| `addLayer` | `a8bc839e6a557c39060182cca16ee13b` | `83607149689c54e5088140560001729d` | **NO — differs** |
| `create` (control) | `b9860c2f2fbdb5b6c499f58b8adbd4d5` | `b9860c2f2fbdb5b6c499f58b8adbd4d5` | yes (matches the original F1-erode finding) |

`addLayer` manifest numbers move: `pathCount` 174→175, `totalPoints` 17713→19044, `inkMm` 3836.7→4056.0
(`wallRings`/`wide`/`ribbonLaw` unchanged: 37/40/true both sides). This is the exact proof GH-2 exists to
produce: the gallery's default rig cannot see this fix at all (byte-identical, reproducing F1-erode's own
finding); `--rig addLayer` shows it move.

Evidence copied into `docs/3d-audit/fill-audit/after/GH-2/`:
- `shots/torus__hatch__interlockWeave__med__a__addlayer__at-{7f805654,e2c3ca85}.webp` (the two differing
  addLayer-rig shots)
- `shots/torus__hatch__interlockWeave__med__a__create__at-{7f805654,e2c3ca85}.webp` (the byte-identical
  create-rig control pair)
- `manifest-addlayer-before-after.jsonl`, `manifest-create-control-before-after.jsonl`
- `crops/interlockWeave-defect-crop-at-{7f805654,e2c3ca85}.png` (native-resolution crop, see below)
- `report.json` (full method + numbers, machine-readable)

### What I saw (native-resolution crop)
Converted both full 800×400 addLayer-rig webp shots to PNG, ran a per-pixel luminance diff (threshold 30)
to locate the busiest changed region (grid search over 40×40px cells), then cropped box (420,30)-(620,130)
at native pixel resolution (only upsampled 4× with nearest-neighbour for legibility — no smoothing or
re-render) into `crops/interlockWeave-defect-crop-at-<sha>.png`.

**BEFORE (7f805654):** a thin, bare, UNFILLED zigzag stroke — just the up/down outline of the zigzag path,
black (no ink) in its interior — crosses the crop diagonally, clearly starved of fill compared to the bold
solid diamond-filled zigzag rows immediately above and below it in the same band.

**AFTER (e2c3ca85):** that exact same zigzag stretch is now filled bold and solid — the interior of every
up/down zigzag tooth is inked white, matching the diamond-fill pattern of its neighbouring rows — with no
visible bare-centreline interruption.

This is the same class of defect (a swallowed `insetMultiPolygon` failure erroneously treated as "erode to
empty") the F1-erode unit's own bespoke Playwright re-render showed under the `create` rig's fixture;
`--rig addLayer` reproduces it directly through the gallery capture script itself, closing the gap the
`gallery_capture_finding` identified.

## Bars changed
None. No numeric threshold, tolerance, count bar, or pinned fingerprint in any existing test was touched —
this unit only adds a CLI option to an audit tool.

## Tests
No test files were touched (out of scope — this unit is capture-tooling only, not a `src/` fix). No RGR
applicable; verification is the md5/manifest proof above, run against real dev servers with the real app.

## Open follow-ups
- The `addLayer` rig's `unreachable` manifest (Tier B) is intentionally shared/unsuffixed between rigs
  (`manifest.<tier>.unreachable.jsonl`) since `Vectura.SCENE_FILL_STYLES.isReachableOn` reachability is
  geometry-rig-independent; noted here in case a future rig ever changes that assumption.
- `--legacy-detail` is a no-op under `--rig addLayer` (logged, not silently ignored) — it only applies to
  the `create` rig's PRIMITIVE_CREATE_DEFAULTS overlay.
