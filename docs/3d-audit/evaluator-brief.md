# Fable evaluator brief — 3D Scene fill audit

You are auditing the 3D Scene fill system of Vectura Studio (a pen-plotter line-art generator,
repo /Users/jayphi/Documents/github/vectura-studio). Every screenshot in
`docs/3d-audit/fill-audit/index.html` was rendered by the real app: one primitive (geometry) ×
one Type (mapper: hatch/crosshatch/contour/spiral/stipple/wireframe/contourSlice/none) × one
Fill Style (tone law) × density {low, med, max} × two camera angles. Stats under each image:
path count, points, ink length, generation ms, bareCentrelinesOnly flag.

The descriptions each style claims for itself live in `src/config/context-bar.js`
(`FILL_STYLE_MARK_OF`, mark classes, `DEFAULT_ENTRY`) and `src/config/scene3d-tone-laws.js`
(per-law label/mechanism/strengths/weaknesses/chooseWhen). Read those, then judge every row.

## Judge each (primitive, mapper, style) row on
1. **Correctness vs. its own description** — does the picture do what the mechanism text says?
2. **Plotter integrity** — clean, evenly spaced lines; no hairline doubling, no staircase of
   capsules, no stubs/shreds, no ink outside the silhouette, no back-of-torus lines crossing the
   front edge. Will it expand into paths and still read when drawn with a single 0.3 mm pen?
3. **Tone/density response** — does low→med→max visibly change? does the tone gradient (light
   side → dark side) read? A flat or non-monotone response is a defect.
4. **Angle stability** — do the two angles look like the same style on the same object?
5. **Variation across the roster** — for each mapper, cluster the styles that are visually
   near-identical (be strict: if an artist could not tell them apart at plot scale, they are
   duplicates). For each cluster propose ONE of: (a) collapse into one style with a new
   continuous parameter (a "master" slider that sweeps between the members — the best outcome),
   (b) adjust the member's defaults/ranges so they differ, (c) hide the option on that mapper
   (`isReachableOn`), (d) remove the preset. Say which and why.
6. **Density slider usefulness** — is low/med/max the right span? does max saturate into a blob?
7. **Per-primitive** — any geometry where a style breaks (plane, pyramid, torusKnot, capsule,
   superellipsoid, solid) even though it works on the sphere.

## Output
Write findings INTO the same `index.html`, inside `<section id="findings">`, as:
- an executive summary (≤15 lines),
- a **defects table** (id F-01…, severity P0/P1/P2, primitive/mapper/style/density/angle,
  what is wrong, what "fixed" looks like, links to the offending image files),
- a **variation/duplication table** (cluster id, members, mapper, proposal a/b/c/d, the
  parameter you would add and its range/default if (a)),
- a **prioritized work list** for Sonnet implementers: each item = one coherent code change with
  files to touch (find them: `src/core/scene3d/surface-fill.js`, `surface-fill-mono.js`,
  `params.js`, `src/config/context-bar.js`, `src/config/scene3d-tone-laws.js`,
  `src/ui/panels/*`), the RGR test to write, and the before-image paths to re-shoot after.
Also write the same work list as JSON to `docs/3d-audit/fill-audit/worklist.json`
(`[{id, title, severity, files, primitives, mappers, styles, densities, test, done_when}]`).

Rules: look at the images (use the Read tool on the .webp files; sample every row, and look at
every image of any row you flag). Do not trust stats alone. Do not propose retrying anything the
handoff `docs/stroke-fill-handoff.md` lists as DEAD or SETTLED (read its top section and
"Measured, NOT defects"). Keep your final message to the orchestrator under 30 lines: counts
of defects by severity, number of duplicate clusters, top 5 work items, and the file paths.
