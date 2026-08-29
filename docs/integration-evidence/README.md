# Stroke-fill integration — live evidence

Shot in the REAL app by `scripts/stroke-fill-integration-evidence.js` (Playwright, headless
Chromium, deviceScaleFactor 3) against `sf/integration` served on `http://localhost:8410`.
Reference scene: sphere r=46 detail=26, orthographic camera, one directional light (az 90 / el 30),
no ground, `fillDensity` 60, pen width 0.3 mm. Frames are CANVAS pixels, not page screenshots, so
the app's floating tool bar stays out of the evidence.

| File | What it shows |
|---|---|
| `a-taperedEnds-*.png` | The user's original defect scene. Full form, limb crop, stroke-end crop. |
| `b-spiral-*.png` / `b-concentric-*.png` | `strokeFillStyle` = spiral vs concentric. |
| `c-penCross-*.png` | The deliberate three-pen exemption. |
| `d-expand-before-*.png` / `d-expand-after-*.png` | "Expand into group" on the taperedEnds sphere. |
| `stats.json` | Path counts, ink length, weightScale sets, and the expand bbox-growth measurement. |

## What the frames actually say — read this before trusting them

**Stairstepping and round-cap bulges are absent, and expand protrudes by 0.00 px** — the
`d-expand` bbox growth is `{left:0, top:0, right:0, bottom:0}`, and `d-expand-after-full.png` is
byte-identical to `d-expand-before-full.png`. W5's expand work is genuinely correct.

**But the ribbon feature is not doing anything.** Both defects are absent because every ribbon law
currently falls back to a plain single-pen CENTRELINE — there is no stroke width to stairstep and
none to protrude. `a-taperedEnds-full.png` shows uniform hairlines with no width variation at all,
which is not what `taperedEnds` is supposed to draw. `SurfaceFill.lastRibbonStats` confirms it for
all twelve ribbon laws: `outlines: 0, fills: 0, ribbons: 0, degenerate == wide`. See the Known
issues entry in `CHANGELOG.md` and the BLOCKER in `plans.md` for the root cause.

`b-spiral-full.png` and `b-concentric-full.png` are byte-identical for the same reason:
`PenFill.fillRegion` is never invoked, so the control has nothing to act on.

`c-penCross-full.png` is the one frame that shows real width — bucket C bypasses the ribbon path
entirely and keeps its two distinct nibs (`weightScales: [1.733, 3.1]`).
