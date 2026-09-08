# 16 — USER report 2026-09-06 18:31 EDT: Crosshatch sphere shows ONE line family

The screenshot could not be copied to disk (image-cache path missing); this is the orchestrator's
verbatim description of what Jay's screenshot shows.

**Scene / panel (Style tab of the object override):** Type = **Crosshatch**, Fill Style = **Ladder (default)**,
Rung detail = **Fine rungs**, Stroke Fill = Spiral (greyed), Pen = Layer pen, Angle = **45°**, Density = **50**,
Border = Off. Dark theme.

**What the picture shows:** a sphere (~330 px across at the app zoom) drawn with ONE family of ~22 evenly spaced
lines that read as tilted latitude rings (contour-like bands, tilt ≈ 45°) — there is NO second family crossing
them anywhere on the sphere. Below-left, a flat receiver (ground/shadow band) is drawn with dense, single-family
45° straight hatching; also one family. Nothing on the sphere reads as a crosshatch grid.

**Jay's rule (verbatim):** "make crosshatch have the same number of crosshatch lines as it has hatch lines
unless there's a special algorithm that mandates this is not the case or variation is needed for
highlight/shadow. This seems off."

**Working id:** W-36 (secretary to confirm numbering). Related: W-31 (crosshatch cell shape — both families
evenly spaced except where tone demands), W-26b (`crossDensityRatio` 1.12× → 2.3×, `CROSS_SHARE_BASE`).

## Orchestrator evidence (2026-09-06 19:12 EDT) — the defect is on the merged tree, not only in Jay's scene

`16b-w36-orchestrator-montage-T1sphere-W26b-cyl-ellipsoid.png` = after/T1 sphere__crosshatch__ladder__med__a (left),
after/W-26b cylinder__crosshatch__ladder__med__a (middle), after/W-26b ellipsoid__crosshatch__ladder__med__a (right).
Counted by eye: cylinder ≈ 30 primary rulings vs ≈ 5 crossing lines; ellipsoid ≈ 25 vs ≈ 4; T1 sphere ≈ 24 vs ≈ 8.
The pre-audit gallery cell `shots/A/sphere__crosshatch__ladder__med__a.webp` (v1.3.98) shows a real grid (≈ 22 vs ≈ 20).
So the crossing family lost most of its lines somewhere between v1.3.98 and the merge — W-26b's cross-share change
(`crossDensityRatio` 1.12× → 2.3×, `CROSS_SHARE_BASE`) is the prime suspect; Jay's Fine-rungs sphere is the extreme case
(zero crossing lines).
