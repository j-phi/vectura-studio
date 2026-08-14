# Shadow-anatomy measurement harness

Offline instruments for the shadow-anatomy workstream. **Not part of `npm test`** —
these render views, rasterise them and print criterion numbers. The criteria they
measure are in `docs/shadow-anatomy/criteria.md`; the assertions that gate CI are in
`tests/unit/scene3d-*.test.js`.

They live in the repository because the previous home was a `/private/tmp`
scratchpad, which is pruned between sessions. That is how the design spec and the
Round 2–5 scorecards were lost.

## The one rule

**A harness reads its fixture from `tests/fixtures/scene3d-shadow-anatomy.js` and
never restates one.** Every camera, sun, object, tone table and named view is
defined there, once. This rule has been broken five times and each breach produced a
silent scoring corruption — a hardcoded camera, a `[BALL]` measurement taken against
a rendered `[BALL, POST]`, a ball's radius baked into a cube instrument, a restated
A-view in the only test protecting the cast shadow, and a restated sphere in the
ladder test.

**A probe's output may not be quoted until the probe has been shown able to say
NO.** Feed it a known-bad input and confirm it reports the failure.
`r8audit-protected.js` carries such a check and refuses to print if it fails.

## Requires

Node 20 (`~/.nvm/versions/node/v20.20.2/bin`). `r8lad.js` and `r8crop.js` also drive
Playwright's chromium to rasterise.

## Scripts

| script | what it does |
|---|---|
| `render.js [outDir]` | renders **all 120 views** to SVG + `metrics.json`. The only writer of the view set. |
| `r8lad.js <outDir> [views…]` | fast inner loop: renders + rasterises the given views (default: the four ladder fixtures), writes `density.json` and PNGs, prints the four-fixture ladder and the **O17 screen crossing angle** read off the drawing. |
| `facets.js <viewDir> [views…]` | per-**facet** D on a faceted object: zone, N·L, projected area, window count, D. Prints O20 / O21 / O22 / O23. Needs a `density.json` from `r8lad.js`. |
| `r9pitch.js [views…]` | **projected pitch**: per facet, the SCREEN pitch of each hatch family, read off the drawing, against the 1.2 × pen plot floor — plus geometric projected coverage. This is the instrument that located the `+X` flood. |
| `r9zone.js [views…]` | intercepts `Regions.formZone` on the live call path and prints the zone the **renderer** gave each facet. Nothing to reconstruct. |
| `r8audit-protected.js` | the protected list at HEAD, with a mutation check. |
| `r8probe-o17.js` / `r8probe-limb.js` / `r8probe-max.js` | O17 histogram, limb classification by camera-space `nz`, per-window max. `r8probe-max.js`'s **ink column is only valid against a directory rendered at the current source** — it reads a stored `density.json` while rebuilding paths. |
| `r8crop.js` | crops a rendered view at N× so a criterion can be judged by eye. |

## Typical loop

```sh
export PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH"
cd scripts/shadow-anatomy

node r8lad.js ./out                      # the four-fixture ladder + O17
node r8lad.js ./out R2-cube-bands4 …     # any views you need a density.json for
node facets.js ./out R2-cube-bands4      # per-facet D, O20/O21/O22/O23
node r9pitch.js R2-cube-bands4           # the pitch that actually lands on paper
node r8audit-protected.js                # the protected list
node render.js ./all                     # all 120 views, before any merge
```
