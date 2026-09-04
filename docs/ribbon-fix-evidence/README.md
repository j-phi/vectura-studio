# Ribbon fix — live evidence

Shot in the REAL app by `scripts/stroke-fill-integration-evidence.js` (Playwright, headless
Chromium, deviceScaleFactor 3) against `sf/integration` served on `http://localhost:8410`, AFTER
the inert-ribbon fix. Same reference scene as the pre-fix set: sphere r=46 detail=26, orthographic
camera, one directional light (az 90 / el 30), no ground, `fillDensity` 60, pen width 0.3 mm.
Frames are CANVAS pixels, not page screenshots.

The pre-fix set is kept at `docs/integration-evidence/` — compare `a-taperedEnds-full.png` in the
two folders. That is the whole story in one pair of images.

| File | What it shows |
|---|---|
| `a-taperedEnds-*.png` | The original defect scene. Full form, limb crop, stroke-end crop. |
| `b-spiral-*.png` / `b-concentric-*.png` | `strokeFillStyle` = spiral vs concentric. |
| `c-penCross-*.png` | The deliberate three-pen exemption. |
| `d-expand-before-*.png` / `d-expand-after-*.png` | "Expand into group" on the taperedEnds sphere. |
| `stats.json` | Path counts, ink length, weightScale sets, expand bbox growth. |

## What the frames say

**Variable width renders.** `a-taperedEnds-full.png` shows rulings that swell at the equator and
taper continuously to hairlines at the poles. The pre-fix frame is uniform hairlines with zero
width variation. Ink went 2425.8 mm -> 19294.0 mm on the same scene.

**No stairstepping.** `a-taperedEnds-crop-end.png` is a stroke end at 4x: the width changes
smoothly along the ruling. There are no abutting constant-width capsules and no round-cap bulge at
a piece boundary, because there are no pieces — one continuous ribbon outline per stretch.

**No protrusion.** `a-taperedEnds-crop-limb.png` straddles the left silhouette. Every band stops
exactly on it; the outermost is a clean sliver, not a blob crossing the edge. The expand
measurement is the numeric half of the same claim: bbox growth `{left:0, top:0, right:0, bottom:0}`.

**`strokeFillStyle` is observable.** `b-spiral-full.png` and `b-concentric-full.png` are no longer
byte-identical (md5 `4d09c119…` vs `5cb1e7c3…`), and their ink differs — 19294.0 mm spiral against
11568.4 mm concentric, from 113 vs 299 paths. At full-form zoom both read as filled bands; the
pattern difference lives at pen scale inside a ~0.9 mm ribbon.

**Bucket C is untouched.** `c-penCross-*.png` still carries two genuinely different nibs
(`weightScales: [1.733, 3.1]`) and still shows its per-piece width steps — that exemption is
deliberate and this work must not flatten it.

## Read this before drawing a conclusion about TONE

The ribbon laws are now much heavier than the pre-fix frames, because the width profile finally
draws. Whether that weight is correctly calibrated against `ladder` is a tone question and nothing
in this fix changed a width profile. See the `plans.md` entry for the open items.
