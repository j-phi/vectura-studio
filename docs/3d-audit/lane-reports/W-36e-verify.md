STATUS: VERIFIED

# W-36e — light verifier report

Unit: W-36e (tests-only), lane fill-audit-a4, pinned `e60d102e..a5d8a1be` (one commit,
`tests/unit/scene3d-curved-density-floor.test.js` +118). Worktree
`.claude/worktrees/fill-audit-a4` read-only throughout — never edited, stashed, checked out, or
reset; confirmed clean (`git status --short -- . ':!graphify-out'`) both before and after. All
verification ran against scratch exports (`git archive` into
`/private/tmp/claude-501/scratch-W36e/{post,concentrated,lowerhalf}`, `node_modules` symlinked from
MAIN) or, for the one git-dependent baseline file, foreground in the actual worktree (read-only
execution, no file changes). Every vitest run used the Bash tool with `timeout: 600000`, foreground,
one file at a time — no `run_in_background`, no Monitor, per ROUND3-RESUME-BRIEFS.md §0b.
Scratch dir deleted at the end; no probe files left anywhere.

## (1) GREEN + RED (interior mutation) + lower-half-freeze cross-check — VERIFIED

**What the new sub-bar measures:** `crossFamilyBInk(d, ratio)` sums Euclidean polyline length (mm,
`pathLength`) over every one of crosshatch family B's own drawn rulings (front-facing, `fam ===
bFam`, the same selection `crossFamilyBCount` uses) — an ink/length quantity, not the integer
`lineIndex` ruling count `nB` that the two kept bars use. It asserts three consecutive interior
steps, `r = 0.25 -> 0.8 -> 0.9 -> 1.0`, each must decline by >= 1.02x (2%), at d=10 and d=100.

*(MERGE r4 item 30/R4-2 annotation: harness rule C — `SurfaceFill.buildObject`, object-only,
ground-plane N/A. Fixture: r = 0.25/0.8/0.9/1.0, d = 10 and 100, no camera.)*

**GREEN**, full file against untouched post (`a5d8a1be`) scratch export: **15/15 pass, 5.37s**
(new test alone 1120ms). Matches impl report exactly.

**RED under interior-only mutation**, `crossPairShare`'s role-`'b'` branch frozen over `[0.6,
0.95]` to the real `r=0.8` value (the concentrated-defect mutation from W-36d-review, the
"secretary's own ask," inside the `[0.5, 1.0]` range) — applied only to a scratch copy
(`concentrated/`), never the worktree: **14/15 pass, 1 fails, exactly the new INTERIOR-SHAPE
guard** — `expected 1 to be greater than or equal to 1.02` (the `0.8 -> 0.9` step collapses to
exactly 1.0, a flat middle with a compensating jump back to the real value at the r=1.0 endpoint
outside the frozen range). Both kept bars (W-36c endpoint/monotonicity, W-36d lower-half magnitude)
still PASS under this mutation — reproducing the review's own finding that it evades every bar
except this new one. Independently re-run by me, not copied from the impl report's numbers.

**Lower-half freeze still trips the W-36d bar (and this new one too):** W-36d-review's own
lower-half-freeze mutation (`role==='b' && r<=1` compressed to a 2%-slope near-constant), applied
to a separate scratch copy (`lowerhalf/`): **12/15 pass, 3 fail** — the W-36d lower-half magnitude
sub-bar (`1.1428571428571428 to be greater than or equal to 1.2`, exactly as W-36d-review measured),
the pinned per-family-budget fingerprint (22 -> 20, the disclosed side effect), and the new
INTERIOR-SHAPE guard, which fails more severely — both interior steps invert (`0.9989...`,
`< 1.02` and `< 1`, ink rising as the ratio dial approaches 1.0). Confirms the new bar is not a
weaker restatement of the W-36d bar — it independently catches both the interior-only mutation
(which the W-36d bar misses) and the W-36d bar's own mutation (more severely).

**Quantity and margin vs the drift envelope:** the sub-bar measures family-B ink (mm, summed
Euclidean segment length), asserted at a 1.02x (2%) floor per interior step. The impl report's own
measured real margins on unmutated code are 5.71%-10.88% across the three steps at d=10/d=100 (the
tightest is `0.8->0.9` at d=100, 5.71%) — comfortably above the 2% floor and comfortably above the
mutated values reproduced here (exactly 1.0 under the interior notch/concentrated freeze, or
inverted below 1.0 under the lower-half freeze). I did not re-derive the full real-code band
myself (out of scope for a light pass); the RED-side numbers I independently reproduced (exact
`1.0` collapse, and the inverted `0.9989...`) match the impl report's own RED proof to the same
precision.

## (2) No src/ touched; `## Bars changed` lists ADDED only — VERIFIED

`git diff e60d102e..a5d8a1be -- . ':!graphify-out'` in the worktree: exactly one file changed,
`tests/unit/scene3d-curved-density-floor.test.js`, all additions (one new `test(...)` block plus a
comment block, no lines removed elsewhere in the file). No `src/` file, no other test file, no
helper file. The impl report's `## Bars changed` section states one net-new sub-bar, ADDED, at the
new location, with no prior bar restated or widened — matches the diff.

## (3) Lane baseline at a5d8a1be unchanged — VERIFIED

Spot-checked in scratch export of `a5d8a1be` (git-independent files) and, for the one
git-dependent file, in the actual worktree (read-only run, worktree confirmed clean before and
after):

- `tests/unit/scene3d-ribbon-f1b-streaks.test.js`: **44/44 pass, 32.65s** — matches the brief.
- `tests/unit/scene3d-mkdashramp-single-pass.test.js` (T3b's own unit; requires `git show
  b43fa4e3:...` against real repo history, so run in the worktree itself rather than the
  file-only scratch export): **20/20 pass, 8.85s**.

Neither file was touched by this commit's diff and neither shows any change from what each unit's
own prior report already established.

## Verdict

**VERIFIED.** All three conditions hold: the new ink-based sub-bar is GREEN on post (15/15), goes
RED under the review's own interior-only mutation (14/15, exactly the new bar, flat-1.0 collapse)
while both kept bars stay green, and the review's lower-half freeze still trips the kept W-36d bar
(1.1428... < 1.2) as well as this new one, more severely. Diff is tests-only, one file, additions
only, `## Bars changed` accurate. Lane baseline unchanged at both spot-checked files. No probe
files left; worktree untouched; all scratch directories deleted.
