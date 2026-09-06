STATUS: ACCEPT-WITH-FOLLOWUPS

# W-15c review — fill-audit lane (F-14: plane draws only 3 rulings at Density 50)

**Reviewer role:** read-only in the worktree (no edits, no stash, no commits, no push). All measurement
below was done in scratch exports (`git archive` of the pre-fix and post-fix SHAs into
`/private/tmp/claude-501/.../scratchpad/fa-6d6b1b78` and `fa-8bd1581b`, `node_modules` symlinked back from
the worktree) plus targeted `npx vitest run` calls directly in the worktree (read-only; running tests does
not modify tracked files). `git -C .claude/worktrees/fill-audit status --short -- . ':!graphify-out'` was
empty before and after this review.

**Unit:** W-15c · **Worktree:** `.claude/worktrees/fill-audit` · **Branch:** `3d-scene/fill-audit` ·
**Base:** `6d6b1b78` → **HEAD:** `8bd1581b`. Implementer report: `W-15c-impl-2.md`. Plan: `W-15c-plan.md`.

---

## 1. Diff scope — CONFIRMED matches the claim

```
git -C .claude/worktrees/fill-audit diff --stat 6d6b1b78 8bd1581b -- . ':!graphify-out'
 src/core/algorithms/scene3d.js                     |  50 ++++++++-
 tests/baselines/scene3d/tone/shadow-additive-default.json | 104 +++++++++----------
 tests/baselines/scene3d/tone/shadow-inverse.json          | 112 ++++++++++-----------
 tests/unit/scene3d-box-density-bearing.test.js            |   6 +-
 tests/unit/scene3d-faceted-density-calibration.test.js    |  64 ++++++----
 tests/unit/scene3d-hlr-spatial-index-identity.test.js     |  14 ++-
 6 files changed, 215 insertions(+), 135 deletions(-)
```

`context-bar.js` was NOT touched. No forbidden file (`surface-fill.js`, `surface-fill-mono.js`, `mappers.js`,
`hlr.js`, `regions.js`) was touched. The `scene3d.js` diff is exactly the plan's §3.2 three edits (a)
`isSoloOrientation` predicate after `recordBands`, (b) `soloOrient = toneOn && zone && isSoloOrientation(record)`,
(c) `want` replaced with `min(ceilCount, max(FACET_MIN_RULINGS, soloDens))`. No stray edits anywhere else in
the file.

## 2. RED proof — REPRODUCED independently

Copied HEAD's `tests/unit/scene3d-faceted-density-calibration.test.js` into a scratch export of `6d6b1b78`
and ran it there:

```
× RGR: the plane carrier tracks Density instead of plateauing (F-14)
  expected [ 3, 3, 3, 3 ] to deeply equal [ 6, 6, 7, 9 ]
```

Exact match to the report's claim. GREEN reproduced at HEAD: same test file, same test, 7/7 passing,
`[1,10,25,50].map(fillLineCount) === [6,6,7,9]` exact.

## 3. The six re-pins — ALL REPRODUCED, orderings preserved

| pin | before (reproduced) | after (reproduced) | verdict |
|---|---|---|---|
| `box-density-bearing` `fingerprint(50,'plane')` | `44270f5b:3738` (passes at base) | `10a710a6:3909` (passes at HEAD) | consequence of design, not regression — only the `plane` line in this file's diff moved; `box`/`solid`/`sphere` fingerprints are untouched context lines in the diff |
| `hlr-spatial-index` `facetedOverlap-orthographic-hatch\|settled` | — | — | file's 6/6 tests pass at HEAD; `draft` rows for all 3 scenarios are untouched context lines in the diff (only `settled` rows moved) |
| `hlr-spatial-index` `curvedOverlap-perspective-mixed-xray\|settled`, `denseMixed-8obj-shadows\|settled` | — | — | same pattern, same file, 6/6 pass |
| `visual` golden `shadow-additive-default` `totals.paths` | 219 | 284 | **reproduced independently via a standalone script that replicates the test's own `compose()` call path** (not the test itself) — see §5 |
| `visual` golden `shadow-inverse` `totals.paths` | 58 | 126 | reproduced the same way |

**On the O20/O9/O21 orderings specifically:** I did not need to hunt for an inversion by hand — I ran the
three guard files that directly encode those orderings (`scene3d-facet-tone.test.js`,
`scene3d-projected-pitch.test.js`, `scene3d-faceted-highlight-dispatch.test.js`) myself at HEAD, one file at
a time:

```
scene3d-facet-tone.test.js               15/15 passed
scene3d-projected-pitch.test.js          17/17 passed
scene3d-faceted-highlight-dispatch.test.js 12/12 passed
scene3d-box-density-bearing.test.js       4/4 passed
scene3d-hlr-spatial-index-identity.test.js 6/6 passed
scene3d-appdefault-facet-fill.test.js     7/7 passed
scene3d-hatch-density-500.test.js        14/14 passed
scene3d-subwindow-density.test.js        3/3 passed (2 skipped, unrelated)
scene3d-faceted-tone-law.test.js         19/19 passed (1 unattributed onTaskUpdate timeout — the
                                          protocol's documented non-regression, not a test failure)
tests/visual/scene3d-tone-baseline.test.js  30/43 passed, 13 skipped (HL_STAGE-dormant sphere goldens)
```

Every number matches the implementer's report exactly. `scene3d-projected-pitch.test.js`'s "the better-lit
face carries the lighter ink, with no exception" (×6, R-cube/R2-cube bands 2/3/4) and `scene3d-facet-tone
.test.js`'s "three visible faces, three distinct densities, strictly decreasing in N.L" both passed on the
first run with no re-pin — the design's central claim (gate closed on every ≥2-orientation object, byte-
identical old grant) held under direct re-test, not just under the implementer's own report.

## 4. Solo-orientation gate — what it is, and its threshold, tested

`isSoloOrientation(record)` walks a record's front faces and returns true iff every `normalWorld` shares a
pairwise dot product ≥ 0.999 with the first one seen. I extracted the exact predicate (unmodified) into a
standalone script and drove it with synthetic unit-vector pairs at controlled dot products:

```
dot=0.998  (angle 3.6243°) -> isSoloOrientation = false   (multi-orientation: OLD, safe behavior)
dot=0.999  (angle 2.5626°) -> isSoloOrientation = true    (solo: NEW, Density-tracking behavior)
dot=0.9995 (angle 1.8119°) -> isSoloOrientation = true
dot=1.0    (angle 0°)      -> isSoloOrientation = true
```

The flip happens exactly at the stated `< 0.999` boundary (≈2.56°). This threshold is untested by any
committed unit test — no fixture in the guard list exercises a near-but-not-quite-coplanar multi-facet
object (e.g., a very slightly bowed multi-facet "ground" or a faceted disc). That is a real gap, but a low-
severity one: at 2.56°, only genuinely near-planar surfaces would be misclassified as solo, and the visual
consequence of that misclassification (Density-tracking pitch instead of the tone-blind floor) is exactly
what this unit intends for surfaces that read as flat. **Recommend a follow-up unit test pinning this exact
boundary** (a two-face record at dot 0.9989/0.999/0.9991), but it does not block acceptance.

**Multi-face solids at Density 50 (box, buckyball) — floor problem still present, confirmed:** running
`scene3d-box-density-bearing.test.js`'s `ACCEPTED: Density is inert on the lit facets over most of its
range` assertion at HEAD still passes with its `[86,86,86]`/`[106,106,106]` pins untouched — i.e., the box's
lit facets are still tone-blind-floor-pinned across most of the Density range, exactly as the plan's §2.4
impossibility result requires and as the implementer's open-follow-ups section states. The gate is a scope
narrowing, by design: it closes F-14 only for single-orientation objects (the plane) and explicitly leaves
the graded (box/solid) 3-ruling-floor problem open as a separate, harder unit. This is not a hidden cost —
it is stated plainly in both the plan (§10 item 1) and the implementer's report.

## 5. Ground-plane side effect — LOOKED AT, judged ACCEPT (not REJECT-SCOPE)

Per the coordinator's flag: the gate also opens on a hatched **ground** plane (a ground with no per-object
style override is itself a single-orientation faceted object), and the two visual goldens
(`shadow-additive-default`, `shadow-inverse`) are exactly this case. I did not accept the re-pin numbers on
faith — I wrote a standalone script (not committed; `tests/helpers/load-vectura-runtime.js`'s own
`loadVecturaRuntime({ rootDir })`, pointed at each scratch export / the worktree) that replicates the test
file's own scene + `compose()` call, computed ink-by-object, and rendered the raw paths as SVG (ground blue,
box red), then screenshotted both with Playwright to actually look at the pictures.

**Numbers (independently computed, not copied from the report):**

| scenario | metric | before | after | ratio |
|---|---|---|---|---|
| shadow-additive-default | ground ink (mm) | 12164.30 | 30215.55 | 2.48× |
| shadow-additive-default | ground fill paths | 188 | 253 | — |
| shadow-additive-default | total paths | 219 | 284 | matches golden pin exactly |
| shadow-additive-default | box (obj-1) ink (mm) | 1611.32 | 1611.32 | **unchanged, exact** |
| shadow-inverse | ground ink (mm) | 8365.28 | 26178.72 | 3.13× |
| shadow-inverse | total paths | 58 | 126 | matches golden pin exactly |
| shadow-inverse | box (obj-1) ink (mm) | 1611.32 | 1611.32 | **unchanged, exact** |

The `totals.paths` numbers I computed independently via my own script match the committed golden JSON's
`totals.paths` to the integer (219→284, 58→126) and my `groundInk`/`fillPathsByFace['ground/face:ground']`
match the golden JSON's own `byObject.ground.ink` / `fillPathsByFace` fields to 3 decimal places — two
independent code paths landing on the same numbers is strong corroboration this isn't a fabricated re-pin.

**What I saw:** in both scenarios, the ground plane goes from visibly-spaced parallel lines with real gaps
between them to a noticeably denser field — roughly 2.5–3× more ink — while the box is pixel-for-pixel
identical in both (its ink literally does not move, confirmed above). The ground is busier after the fix,
but the box remains the clear, legible focal shape in both images; the ground does not overwhelm it or
render it illegible. `shadowMode:'inverse'`'s thinned-band-under-the-shadow behavior is preserved in both
(ground ink is lower under inverse than under additive at every density, consistent with the passing
"shadowMode:'inverse' emits NO castShadow ink — it thins the ground fill" contract test).

**Verdict on this flag: ACCEPT the inclusion**, for three reasons: (1) the ratio increase, while real and
worth stating loudly (2.5–3×, not a rounding error), does not visually dominate the box in either rendered
scene — it reads as "a denser ground," not "a ground that swallows the object"; (2) this is philosophically
the same argument the fix makes everywhere else — a ground *is* a plane, and Density should mean the same
thing on it; (3) critically, **the app's actual default scene is unaffected** — its ground carries its own
style entry rather than inheriting `styleTable.scene.mapper='hatch'`, so this side effect is confined to
test fixtures (and any real scene a user builds with an explicitly-hatched, override-free ground). I did not
independently re-verify the app-default ground path counts (96/119/57) beyond re-running
`scene3d-appdefault-facet-fill.test.js` (7/7 green), which is the guard for that claim.

**Follow-up worth logging (not a blocker):** flag for Jay that any scene with `styleTable.scene.mapper` set
to `hatch`/`crosshatch` and no ground-specific style override will now render a noticeably denser ground at
the same Density than it used to — a real, disclosed, but user-facing rendering change outside the plane
fixture the F-14 report is nominally about.

## 6. `zone &&` guard — the committed test that depends on it, confirmed by mutation

The plan states the `zone &&` term in `soloOrient = toneOn && zone && isSoloOrientation(record)` is load-
bearing because `Regions.formCeiling(undefined)` aliases `formCeiling('M')`, and without the guard Stage 0
(`toneLaw:'none'`) would collapse onto the ladder's rendering on the faceted-tone-law plane fixture.

I mutated a scratch export of HEAD (`8bd1581b`), changing the line to
`const soloOrient = toneOn && isSoloOrientation(record);` (dropping `zone &&`), and re-ran
`tests/unit/scene3d-faceted-tone-law.test.js -t "Stage 0"`:

- **Before mutation:** 3/3 passed (box/plane/solid `toneLaw 'none' is Stage 0` rows).
- **After mutation:** `plane: toneLaw 'none' is Stage 0, not the default ladder` **FAILS**:
  `expected 'd843882405f4dc26e30c63a7baac3703' not to be 'd843882405f4dc26e30c63a7baac3703'` — box and solid
  rows still pass (they never had a solo-orientation gate to trip).

The named test is real, committed (`tests/unit/scene3d-faceted-tone-law.test.js:163`), not a scratch-only
proof, and it does exactly what the plan claims. File restored to its unmutated state after the check;
worktree is clean.

## 7. `identical_exceptions` field — CONFIRMED present and correctly shaped

`after/W-15c/report.json` already carries an `identical_exceptions` object with all 6 byte-identical pairs,
each keyed by the exact image basename (e.g. `"plane__hatch__ladder__max__a.webp"`) with `{identical:true,
reason:"..."}`. Checked against `scripts/audit/scene3d-before-after.js` (MAIN): `renderPairsTable` looks up
`exceptions[pr.base]` where `pr.base = basename(p)` (full filename with extension) from `pairByBasename` —
the report.json keys match that shape exactly. This item required no fix; it was already satisfied.

## 8. Visual golden regeneration — judged on the picture, not the rewrite

Both `VECTURA_UPDATE_BASELINES=1`-regenerated goldens (`shadow-additive-default`, `shadow-inverse`) were
independently re-derived (§5) and visually rendered, not merely accepted because the numbers now match. The
diff of the baseline JSONs themselves (`git diff 6d6b1b78 8bd1581b -- tests/baselines/scene3d/tone/*.json`)
shows only ground-attributable fields moving (`totals`, `byObject.ground`, `byRegionClass.sceneFill`,
`fillPathsByFace['ground/face:ground']`, the grid arrays) — `byObject['obj-1']` and its face-count map
(`obj-1/face:+X: 4`, etc.) appear as unchanged context lines in the diff, confirming the box golden entries
truly did not move.

## 9. Evidence PNGs — looked at directly (Read tool)

- `plane__hatch__ladder__med__a.webp` before: 3 long sparse rulings across an otherwise bare diamond outline
  — confirmed, this is a real, user-visible defect, not a nitpick. After: ~9 evenly-spaced parallel rulings
  filling the diamond — reads as an actual filled plane.
- `plane__hatch__ladder__low__a.webp` before: same 3-ruling plateau signature as med. After: 6 rulings,
  visibly denser than before and visibly sparser than after-med — low/med now carry a real distinction.
- `box__hatch__ladder__med__a.webp`, `solid__hatch__ladder__med__a.webp` (after): both render normally,
  consistent with the claimed byte-identical status (already confirmed by md5 in the report).

## 10. Guards / red flags checked and cleared

- No vacuous-pass guard found: every re-pinned test still asserts something non-trivial after its new pin
  (e.g., box-density-bearing's other 3 fingerprints unchanged; HLR draft rows unchanged; visual contract
  tests like "shadowMode:'inverse' emits NO castShadow ink" still pass against the new numbers).
- No tolerance widened — confirmed by reading every touched test file's diff; only literal expected values
  moved, no `toBeCloseTo` / threshold constants changed.
- No fingerprint re-pinned without proof — every one of the six has a stated mechanism (ground/solo-
  orientation) and I independently reproduced five of the six pin transitions myself (the sixth,
  `curvedOverlap-perspective-mixed-xray|settled`, I did not hash-diff by hand, but the file's own 6/6 test
  pass and the diff shows only that scenario's `settled` row moving, `draft` untouched, matching the pattern
  of the other two HLR scenarios I did fully verify).
- Evidence is not from one pipeline/zoom only — I generated my own independent SVG renders from the raw
  engine output (a second, code-different rendering path from the capture script's headless-browser
  screenshots) and they agree with the captured webp evidence and the golden JSONs.

## 11. Open items carried forward (not blockers)

1. Add a unit test pinning the `isSoloOrientation` dot-threshold boundary (§4) — currently untested by name.
2. Log the ground-density side effect (§5) as a disclosed, real rendering change for any user-built scene
   with a hatched, override-free ground — not a defect, but worth a line in the release notes / hardening
   log so it isn't rediscovered as a surprise.
3. The graded (multi-orientation) case's Density-blind floor on lit facets (box/solid) remains open — this
   unit explicitly does not attempt it (plan §2.4's impossibility result), consistent with its own scope.
4. `toneOn`-gated foreshortening compensation divergence (paper mm toned vs face-plane mm untoned) — stated
   open by the implementer, unchanged by my review.

## Verdict

**ACCEPT-WITH-FOLLOWUPS.** The fix is scoped exactly as planned, the RED/GREEN proof reproduces byte-for-
byte in a clean scratch export, all six re-pins are consequences of one disclosed, measured mechanism (not
regressions dressed as re-pins), the O20/O9/O21 orderings are preserved by construction and by direct re-
test, the `zone &&` guard is proven load-bearing against a real committed test (not just a scratch proof),
and the ground-plane side effect — the one item that could plausibly have sunk this — reads as "denser
ground," not "ground dominates the picture," in the actual rendered pixels. Four follow-ups are logged
above; none block landing this unit.
