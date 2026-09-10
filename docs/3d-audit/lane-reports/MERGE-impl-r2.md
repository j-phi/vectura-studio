STATUS: DONE

# MERGE — 3D fill audit round 2 (five `3d-scene/*-2` lanes → `3d-scene/integrate-r2`)

Worktree: `.claude/worktrees/integrate-r2` (new, created off `main` @ `a7d39601`).
Branch: `3d-scene/integrate-r2`. Final HEAD: `4421d5146e98427af64495f0ae7e0b6b27d4dcff` (41 commits
ahead of `main`). **Not pushed. `main` not fast-forwarded** — that is the
orchestrator's step. Every git write used `git -c core.hooksPath=/dev/null`; graphify was never run.
`node_modules` symlinked from main. All test runs foreground.

## Merge order and results

| # | Branch | HEAD merged | Conflicts | Merge commit |
|---|---|---|---|---|
| 1 | `3d-scene/handoff-c2` | `ed778940` | none | `01b3c926` |
| 2 | `3d-scene/fill-collapse-2` | `9aad87b8` | none | `52088ec0` |
| 3 | `3d-scene/fill-audit-2` | `79b626d2` | 1 (`src/config/context-bar.js`) | `0957d380` |
| 4 | `3d-scene/fill-audit-d2` | `392696ac` | none | `70f6d132` |
| 5 | `3d-scene/fill-audit-a2` | **`463c447f`** | 1 (`scene3d-curved-density-sparse-end.test.js`) | `a992ee59` |

### Lane HEAD deviation (checked, benign)

`3d-scene/fill-audit-a2` is at **`463c447f`**, one commit ahead of the `94cca882` the checklist
names. That commit is `docs(3d-audit): T2-revert report` — **docs only**.
`git diff 48ff98dc..463c447f -- src tests` is **empty**, so src/tests are byte-identical to the
pre-T2 state and nothing in `MERGE-plan-r2.md` §1.3/§1.4 changes. Not treated as stop condition 1
(a HEAD that moved by a docs commit is not a lane whose code moved); merged the real HEAD.
All five `git merge-base main <lane>` confirmed `47a5a755` before merging.

The four files the ledger ranked highest-risk **all auto-merged**, as the plan predicted:
`scene3d-tone-law-collapse.test.js` (3 authors), `scene3d-panel.js` (4 authors), `params.js`
(3 authors), `shadows.js`. Checklist item 3's hand-merge was not needed.

## Conflicts and resolutions

### CONFLICT 1 — `src/config/context-bar.js` (merge 3, add/add)

One hunk at the insertion point immediately after `SCENE_FILL_STYLES.styleParams`. HEAD (U5b,
fill-collapse-2) appends `SCENE_FILL_STYLES.effectiveLaw(survivorId, paramsBag)`; theirs (W-10d-3,
fill-audit-2) appends `SCENE_FILL_STYLES.displayParams(rawValue, paramsBag)`. Both end on the same
`};`, which is why git could not separate them.

**Resolved: TOOK BOTH, in order — `effectiveLaw` then `displayParams`** — each keeping its own
comment block and its own closing `};`. They are two lookups on two mechanisms: `effectiveLaw`
answers *which law the collapse sub-controls actually select* (config-tier, reads only
`STYLE_PARAMS`, so a folded law's measured caveat cannot vanish); `displayParams` answers *what the
picker should DISPLAY for a bag whose `toneLaw` is still a raw folded id* (seeds from `ALIASES`,
returns the same object reference otherwise). Neither reads the other; dropping either ships half a
fix. `node --check` clean, both symbols present exactly once, both consumer surfaces
(`scene3d-panel.js`, `src/ui/shell/context-bar.js`) call the merged file unmodified.

### CONFLICT 2 — `tests/unit/scene3d-curved-density-sparse-end.test.js` (merge 5)

The `torus + contour + ladder at d=50` md5 row only. **Neither side was correct.** HEAD carried
main's `c049412aaed515dd6c82c91c53d0bd9f` (from `1193cbe1`, which rewrote this file's own `runMd5`
helper to hash `normalizePaths(...)` at 4dp to kill arm64/x86_64 CI drift); fill-audit-a2 carried
W-33's re-pin `5d5e4e87f98447a282188c182b243cf5`, measured with the OLD raw `JSON.stringify` helper
because the lane branched before `1193cbe1`.

**Resolved:** kept main's `runMd5` mechanism (it auto-merged — W-33 never touched the helper), kept
W-33's reasoning, and **re-measured against the truly-merged source** by blanking the pin and
reading the thrown value: **`bc212164fdc8e72486dcef4e200eaa8d`**. That matches the W-33 reviewer's
reference figure, now independently confirmed rather than taken on faith. The other **19 rows in
the file pass UNEDITED** (20/20 green), which is the proof W-33 is scoped to `mapper === 'contour'`
and disturbs neither the sphere/cone rows nor main's rounding. A `MERGE NOTE` block recording all
three values is inline, per the file's own convention. **Checklist item 10 discharged.**

### SEMANTIC CONFLICT — `tests/unit/scene3d-fill-style-display-params.test.js`

No textual conflict; clean merge; test red only because two lanes had never been in one tree.
`G1 … AssertionError: expected 15 to be 13`. W-10d-3 pinned `Object.keys(R.ALIASES).length === 13`
against the roster its lane could see; **U7 added a 14th alias** (`nesting`, `ampSpacing` ←
`weaveDepth`) and **U8 a 15th** (`penDown`, `interlockWeave` ← `onePenDown`) on fill-collapse-2.
**STALE ASSERTION.** The loop underneath is generative over `Object.keys(R.ALIASES)`, so it covers
15 with no other edit, and the companion `expect(checked).toBeGreaterThanOrEqual(13)` is a
deliberate floor and stays. Fixed to 15 with a `MERGE NOTE / BAR CHANGE` comment naming U7 and U8;
**3/3 green.** This is the first time W-10d-3's display seed has been exercised against U7's and
U8's folds at all, and all 15 aliases round-trip — closing the cross-lane half of checklist item 6
by test rather than by argument.

## THE MERGE'S OWN FINDING — a live product defect, found by checklist item 7, fixed at source

This is round 2's equivalent of round 1's X-ray regression: **the one behaviour no lane could
test**, and it was broken.

**Symptom.** A `.vectura` saved BEFORE the collapse carries a RAW FOLDED `toneLaw` (e.g.
`bundleDither`) and **no sibling collapse key at all**. In the ctxbar Style flyout the folded law's
own measured caveat did **not** render — the survivor's silence — which the standing ruling
*"folding a law must NOT hide its measured caveat"* forbids, and which is **stop condition 4**.

**Root cause.** `src/ui/shell/context-bar.js` computed `effectiveLaw(law, params)` off the
**un-seeded** bag. With no `bundleMode` key present, every descriptor looks default, so
`effectiveLaw` returns the bare survivor. Its seeded bag (`dispParams`, W-10d-3's `displayParams`)
was computed **afterwards**, and used only for the sub-control `<select>`s. The docked panel already
did it right — `scene3d-panel.js:716` seeds `styleParamBag` FIRST and feeds that to `effectiveLaw`.
A one-site ordering drift between two surfaces whose stated contract is that they must not drift.

Headless confirmation of the mechanism, all five raw folded ids (before the fix):

| raw id | picker row | `effectiveLaw(raw bag)` | caveat shown | `effectiveLaw(seeded bag)` | own caveat exists |
|---|---|---|---|---|---|
| `bundleDither` | bundleCount | bundleCount | **no** | bundleDither | yes |
| `contFieldTouch` | contFieldSigmoid | contFieldSigmoid | **no** | contFieldTouch | yes |
| `weaveDepth` | ampSpacing | ampSpacing | yes (survivor has one) | weaveDepth | yes |
| `onePenDown` | interlockWeave | interlockWeave | yes (survivor has one) | onePenDown | yes |
| `fineLadder` | ladder | ladder | n/a | fineLadder | no |

**RED→GREEN.** Two new tests in `tests/integration/scene3d-fill-style-picker.test.js`
(`MERGE r2 item 7 — a RAW folded toneLaw (bundleDither…)` and the `contFieldTouch` twin) fail at
the merge point (`expected null to be truthy`, both) and pass after the fix. **Fix:** hoist
`dispParams` above the caveat and pass it to `effectiveLaw` — one moved line plus its comment, no
behaviour change for any bag that already carries its sibling key. File: **166/166** (164 baseline
+ 2 new).

**Not merge-created.** The defect also existed on fill-collapse-2 alone (where `displayParams` does
not exist at all). The merge is simply the first tree where it is both *observable* and *fixable*,
which is exactly why the checklist deferred item 7 to here.

**LIVE VERIFICATION IN THE REAL APP** (not just the harness), per the brief:
`scripts/audit/merge-r2-ctxbar-caveat-evidence.js` (new, in `scripts/audit/` per item 19's
precedent) starts a dev server on a free port, builds a scene whose `object3d` bag carries each raw
folded id, opens the ctxbar Style flyout and screenshots it. Output:
`docs/3d-audit/fill-audit/after/MERGE-r2/` (5 flyout crops + 5 full frames + `report.json`).
Served version confirmed `1.4.0` against the worktree's `package.json` at capture time.

**What I SAW** in `ctxbar-raw-bundleDither-flyout.png` (native-resolution crop of the flyout):
Type = Hatch; Fill Style = **"Bundle · Count"** (the survivor, correct); the plain-language survivor
blurb ("Parallel hatching — Choose it as the family's default…", U5b-2's copy, no audit jargon);
then, in red, the **folded law's own caveat** — *"Dithered bundle mode can make repeating patterns
(moire) more visible than the default Count mode, not less. If you see new banding, switch back to
Integer pass count."*; then **Bundle mode = "Dithered"** (W-10d-3's display seed). All three of
U5b's, U5b-2's and W-10d-3's contributions are visibly correct in one frame, which is the first time
they have co-existed anywhere. Verdicts: `bundleDither` PASS, `contFieldTouch` PASS, `weaveDepth`
PASS, `onePenDown` PASS, `fineLadder` n/a (no caveat of its own).

## Second finding — `scene3d-curved-crosshatch-controls.test.js` was RED on the lane, not "pre-existing"

`MERGE-plan-r2.md` §5.2 flagged W-36b's report claim of *"3 pre-existing unrelated failures,
ownership undecided"* and required a decision. **The claim was wrong on both counts.** Measured:

| tree | result |
|---|---|
| unmodified `main` (`git archive` scratch export) | **18/18 GREEN** |
| `3d-scene/fill-audit-a2` alone (`git archive` scratch export) | **3 failed / 15 passed** |
| the merged integration tree | **3 failed / 15 passed** (identical three) |

So they are **not pre-existing** (main is green) and **not unrelated** (the lane's own src change
causes them) — but they are also **not merge-created**, so §5.2's stop condition does not fire.

**Diagnosis (measured, not argued).** The failing test is a byte-identity pin,
`cross === hatch|contour`. Family A is still **byte-identical** to a solo hatch run and is still the
prefix. Family B differs from a solo contour run only in **polyline resolution**:

| primitive | famB paths | contour paths | first point identical | ink ratio | mean-bearing gap | max point ratio |
|---|---|---|---|---|---|---|
| sphere | 22 | 22 | yes, every ruling | 0.999409 | 0.0015° | 1.000 |
| cylinder | 21 | 21 | yes, every ruling | 0.999507 | 0.0000° | 1.000 |
| torus | 26 | 26 | yes, every ruling | 0.999411 | 0.0046° | 0.688 |

Same rulings, same start points, ink under 0.06% apart, and family B never carries MORE points than
the solo run — the signature of **W-33/W-34's device-space ring refinement (`refineFillRunTurns`)
splitting its refinement budget across the crosshatch's two families**, not of the crossing family
changing.

**Verdict: STALE ASSERTION** — the pin was a stricter oracle than the claim it names. Re-expressed
(see `## Bars changed`) so family A keeps its full byte-identity pin and family B is asserted as the
parallels *ruling-for-ruling*: equal path count, identical first point on every ruling, point count
never exceeding the solo run, ink ratio inside 0.995–1.005, mean-bearing gap under 1°. A crossing
family that stopped being the parallels fails the count, the ink and the bearing legs at once.
**18/18 green.** No tolerance was widened to force a pass; the byte-identity half was retained.

## Third finding — Unit F's "intentionally RED" test measures 0, on main too

Checklist item 17(a) said `tests/unit/scene3d-mesh-self-occlusion.test.js:29` is "still RED on
`spiral`". It is not, and the residual it pins is gone. Measured by blanking the bar and reading
the thrown value on **both** trees:

| tree | spiral survivors |
|---|---|
| round-2 integration | **0** |
| unmodified `main` (`git archive` scratch export) | **0** |

No round-2 lane touches this file, `mappers.js` or `hlr.js` (five empty `git diff --stat`s), so the
sub-0.05 mm adjacent-face seam W-25 left behind closed during the **round-1** integration and
nobody re-measured. Comment and bar fixed together: the header now carries a CURRENT verdict
retiring both the disproven polygon-union root cause and the "intentionally RED" label, and the bar
is tightened `<= 2` → `=== 0`, matching the file's own hatch/contour branches. **5/5 green.**

## Bars changed (mandatory disclosure)

1. `tests/unit/scene3d-curved-density-sparse-end.test.js` — `torus + contour + ladder @ d=50` md5
   `c049412aaed515dd6c82c91c53d0bd9f` (HEAD) / `5d5e4e87f98447a282188c182b243cf5` (W-33) →
   **`bc212164fdc8e72486dcef4e200eaa8d`**. Cause: conflict 2 above; re-measured on the merged
   source through the file's own helper. 19 other rows unedited.
2. `tests/unit/scene3d-fill-style-display-params.test.js` — `expect(aliasIds.length).toBe(13)` →
   **`toBe(15)`** (plus the test title). Cause: U7's 14th and U8's 15th alias. Stale assertion; the
   loop is generative, the companion floor is untouched.
3. `tests/unit/scene3d-mesh-self-occlusion.test.js` — spiral survivors
   `toBeLessThanOrEqual(2)` → **`toBe(0)`**. A **TIGHTENING**, measured 0 on both the integration
   tree and unmodified main.
4. `tests/unit/scene3d-curved-crosshatch-controls.test.js` — the default-crossing-family leg moves
   from a byte-identity pin (`cross === hatch|contour`) to a geometric identity for family B
   (count equal · first point identical per ruling · point count ≤ solo run · ink ratio
   0.995–1.005 · bearing gap < 1°). Family A's byte-identity pin is **retained**. Numbers measured
   above. Direction: family A unchanged (strict), family B from byte-exact to geometric — disclosed
   because it is the one leg of this merge that becomes less strict, and it is less strict only
   about polyline resolution, which is what W-33/W-34 legitimately changed.
5. `docs/3d-audit/lane-reports/W-26-impl-2.md` — no test bar moved, but the **missing** `## Bars
   changed` entry for `tests/unit/scene3d-plot-safety.test.js:262`'s `q(0.98)` bar (0.35 → 0.40,
   with the sibling `q(0.5)` ceiling 0.35 → 0.40 and a separate ±10% band 0.308–0.377) is now
   written, at source, as an addendum. Checklist item 17(d).

No other pin, threshold or fingerprint moved anywhere in this merge.

## The 23 MERGE CHECKLIST items — every one, with its result

| # | item | result |
|---|---|---|
| 1 | rebase every lane onto main | **OVERRULED → merged** (`--no-ff`, per `MERGE-plan-r2.md` §1.1). Intent met: all five lanes are integrated against v1.4.0, not `47a5a755`. 40 commits ahead of main, 5 merge commits. |
| 2 | bump FROM 1.4.0 | **DONE** — `1.4.0` → `1.4.1`, `npm run version:sync`. Diff is exactly the 3 expected files: `package.json` (1 line), `src/config/version.js`, `index.html` **446 changed lines / 222 `?v=1.4.1` cache-busters / zero `v=1.4.0` left**. Matches the plan's predicted signature; stop condition 5 did not fire. |
| 3 | hand-merge the collapse test FIRST | **NOT NEEDED** — auto-merged. Ran whole, foreground: **95/95 passed** in 12 m 43 s (93 baseline + the 2 added for item 8). Exit 0. One benign `onTaskUpdate` RPC timeout, the documented `run-vitest.js` retry pattern. |
| 4 | re-verify every byte-identity/md5/fingerprint claim | **DONE** — only ONE pin moved in the whole merge (item 10 / conflict 2). Completed by `test:ci` (below). |
| 5 | relocate U5b/U9 reports+evidence; delete T1b's probe | **CONFIRMED PRE-DISCHARGED** — `after/U5b`, `after/U9`, `U5b-impl.md` all landed at the right repo-relative paths via the merge; `tests/unit/zzz-t1b-perf.test.js` absent. Nothing re-copied. |
| 6 | `effectiveLaw` reads two distinct mechanisms | **DISCHARGED BY TEST** — `scene3d-fill-style-effective-law.test.js` 4/4 + `scene3d-fill-style-display-params.test.js` 3/3, all 15 aliases round-tripping through both the display seed and `normalizeStyle`/`resolveToneLaw`. **And by the live app**, which is stronger — see the item-7 finding. |
| 7 | ctxbar caveat for RAW folded ids | **DONE, LIVE — AND IT WAS BROKEN.** Full write-up above. Defect found, RED test written, fixed at source, GREEN, screenshotted in the real app into `docs/3d-audit/fill-audit/after/MERGE-r2/`. |
| 8 | re-run U1–U5 through U7's dimensioned harness | **DONE.** New describe block at the end of `scene3d-tone-law-collapse.test.js` sweeping the five clusters' survivor/folded pairs over sphere/torus/cone × low/med/max — the same 9 pairs, the same harness shape, `optsCache` so it costs 9 `generate()` calls not 90. **Per cluster, all 9 pairs, GREEN:** ladder (3 folds), taperedEnds (2), weightModulated (1), bundleCount (3), contFieldSigmoid (4) — 13 folds asserted to resolve to their own legacy id AND render identically to it, and all five bare survivors (sub-control at default and key absent) resolve to themselves and render identically. The block states its own honest scope: in-process the fold leg proves resolution + determinism (as U7's and U8's own fold legs do); the leg carrying geometric weight is the bare-survivor one. The asymmetry the checklist names is closed — U1–U5 are now proven to the same bar as U7/U8. |
| 9 | `shadows.js` third stake | **NEVER MATERIALISED** — only W-30d edits it; clean merge, `node --check` OK. |
| 10 | regenerate W-33's torus+contour+ladder hash | **DONE, MEASURED** — `bc212164fdc8e72486dcef4e200eaa8d`, blanked-pin method, on the merged tree. 20/20. |
| 11 | contourSlice x-ray hunt on an idle machine | **DONE — the four-day-old unknown is CLOSED, green.** Confirmation run, load avg 4.14: `scene-xray-needs-fill` **17/17**, `scene3d-panel` **38/38**, `scene3d-contour-slice` **67/67** (122/122 together), plus `tests/unit --testNamePattern=xray` **9 passed / 5234 skipped, 0 failed**. Both specs that "never finished" now finish. There is no failure to hunt. |
| 12 | `910` → `5851` correction | **DONE** — recorded in `0957d380`'s merge-commit body (a merge cannot rewrite a lane commit body without a rebase), and in a new `docs/3d-audit/fill-audit/after/W-10d-2/README.md` which also carries the "`leaf-scene/*-exported-state.json` is not a single-key diff — session-random ids and seeds differ too" note. |
| 13 | land W-35's docs contract | **DONE** — CHANGELOG `### Added` block, README feature line + 1.4.1 release note, in-app help (see 14/§help below), `plans.md`. |
| 14 | W-35's four review follow-ups | (a) **recorded, not written** — the tripwire shape is filed in `plans.md` → Now, with the reason it cannot be an honest oracle today (crowd-cull confound). (b) **DONE** — `W-35-impl.md` corrected: `plane` is inert WITHOUT the gate too, only box and pyramid demonstrate the claim. (c) **PRE-DISCHARGED** — the four-author panel file auto-merged; 38/38. (d) **HEEDED** — `build-user-presets.js` was never run. |
| 15 | run U9b + W-10d-3b on the integrated tree | **POST-MERGE UNIT, scheduled first in `plans.md` → Now.** Confirmed non-blocking here: `scene3d-shadow-tone-law-uniqueness.test.js` + `scene3d-shadow-tone-law.test.js` pass on the merged tree at `PICKER_IDS` 33, so U9b is a bar-strengthening, not a repair. |
| 16 | U5b-2/3 CHANGELOG line + ROUND2-BRIEFS housekeeping | **DONE** — the line is in the CHANGELOG `### Changed` block; `src/ui/shell/context-bar.js` added to U5b's "Files ALLOWED" in `ROUND2-BRIEFS.md` with a dated note saying why. |
| 17 | the orchestrator's wrap-up set | **ALL FOUR DONE.** (a) Unit F reconciled — see the third finding; measured 0 on both trees, comment + bar fixed together, 5/5. (b) `findings.json` C-05 evidence rewritten: the "byte-identical … visually identical" claim replaced with **"near-duplicate; ink 1459–2202 mm on torus/hatch/med"**, recording **five distinct `SF.buildObject` outputs** and **`contFieldTouch` 3879.9 mm vs `contFieldSigmoid` 1459.0 mm (2.7×)**; the matching note added to `worklist.json`'s W-24 entry. Both files re-validated as JSON. (c) `after/W-25/report.json:14` corrected — "engaging only for small/thin regions" now states **102/288 `trueSpiral` calls still floored at aspect 0.177**, i.e. about a third of calls, not a rare tail. (d) W-26 hygiene: `W-26-impl-2.md:424`'s "still measures higher" corrected — the hatch **ramp fell 1.369 → 1.229 (−10.2%)** and merely still clears its unchanged 1.2 bar; and the missing `## Bars changed` disclosure for `plot-safety`'s `q(0.98)` bar is written as an addendum. |
| 18 | rebuild the gallery LAST | **NOT DONE — deliberately, orchestrator-owned.** Two extra reasons to rebuild recorded below. |
| 19 | relocate bespoke evidence scripts to `scripts/audit/` | **DONE — four, re-run, byte-compared.** See the table below. |
| 20 | numbers not to copy forward | **HONOURED** — `grep` confirms no "426", no "only ever fires on the torus", no "the fix" for W-30d anywhere in `CHANGELOG.md` or the README 1.4.1 entry. U8's row is not quoted at all; W-27c-0a-6's line says "a degenerate near-zero-length ring" without the false single-ring claim; W-30d is a **"Documented limitation"**. |
| 21 | two documented limitations in CHANGELOG | **DONE** — W-30d's ~465:1 thin-torus ceiling (UI-unreachable at `sx` ≤ 200, reachable via hand-edited/imported `.vectura` or compounded `transform.scale`) and W-35's byte-identical default of 0. Both also in the README 1.4.1 entry. |
| 22 | guards resting on argument, not a re-run | **DONE, both halves.** HLR: `scene3d-hlr-spatial-index-identity.test.js` **6/6 UNEDITED** post-merge (no re-pin, unlike round 1's three). Unit D's own guard suite: `tests/unit/scene3d-shadow-receive.test.js` **17/17** on the merged tree, run by name. The U0 48-law byte-identity sweep lives inside `scene3d-tone-law-collapse.test.js` and passed there — **95/95, stated explicitly** so the ledger can stop carrying it as argued. |
| 23 | sweep BOTH cameras in the slices pass | **HONOURED BY NOT RE-PINNING.** No slices fingerprint was re-pinned in this merge, so no single-camera measurement was relied on. `scene3d-contour-slice.test.js` passes 67/67 unedited. The rule stands for U9b and the gallery rebuild. |

### Item 19 — the four relocations, with the U9-2 byte-identity precedent honoured

`git mv scripts/{w28b-face-count-threshold,w30b-footprint-wiring,w30c-shadows,w30d-shadows}-evidence.js scripts/audit/`,
then each one's root resolution corrected `path.resolve(__dirname, '..')` →
`path.resolve(__dirname, '..', '..')` (w28b:44, w30b:32, w30c:32, w30d:41) — exactly the one-`'..'`
correction U9-2 made — and each usage line in the header rewritten to `node scripts/audit/…`.
`node --check` clean on all four. `w30-footprint-direction-evidence.js` and the other `scripts/`-root
evidence scripts are **round-1 or older and already on `main`**; they are out of round 2's scope and
were left alone (verified with `git cat-file -e main:scripts/<f>`).

Each was then **re-run from its new location** and its output byte-compared with the committed
evidence. Their hardcoded ports (8482/8483) collided with a live lane dev server owned by another
session, so each was run through a same-directory temporary copy with the two port constants changed
(ports cannot affect rendered output) and the copy deleted — `__dirname` stays in `scripts/audit/`,
so the relocation *is* what was exercised. Pre-fix scratch exports were recreated with
`git archive` at the shas each script names.

| script | result |
|---|---|
| `w30d-shadows-evidence.js` | **14/14 PNGs byte-identical**; `report.json` identical except session-random `layerId`s and `generatedAt` — the exact caveat item 12's README note describes. |
| `w30b-footprint-wiring-evidence.js` | **12/12 PNGs byte-identical**; `report.json` differs only by `layerId`s, `generatedAt`, the hand-added `looked`/`note`/`pngMd5` annotations, and `ver` 1.3.99 → 1.4.0 (the worktree's version at capture time). |
| `w30c-shadows-evidence.js` | **14/16 PNGs byte-identical. The 2 that differ are a CORRECT, EXPLAINED IMPROVEMENT**, not a regression — `footprint-torus-point-after.png` and `footprint-torus-directional-after.png`. W-30c's evidence was shot at `79c07770`, *before* W-30d landed on the same lane. I cropped the diff bbox at native resolution and looked at both: the OLD frame shows the torus receive-shadow as a **solid dense patch filling the ring's hole**; the NEW frame shows the same patch with **the hole re-opened as unshadowed** — W-30d F2a working, visible inside W-30c's own rig. Footprint counts move with it: torus-point 241/124 → 252/135, torus-directional 244/117 → 260/133; `sphere-point` is unchanged at 173/93, confirming the change is torus-scoped. |
| `w28b-face-count-threshold-evidence.js` | **3/4 PNGs byte-identical.** The differing one (`A-small-12face-collapsed.png`) and the `report.json` deltas are **the U7/U8 fold arriving**: `optionCount` 36 → 34 and `disabledCount` 25 → 23, with `weaveDepth` and `onePenDown` gone from the listbox. This independently confirms the shipped roster (`PICKER_IDS` 33, picker offers 34) and is a second reason W-28b's evidence must be re-shot at the gallery rebuild. |

## Docs contract

- **`CHANGELOG.md`** — the plan's drafted block inserted **verbatim** under `## Unreleased`
  (`### Added` W-35 · `### Changed` U7/U8, U5b/U5b-2, W-36, W-28b · `### Fixed` W-30b, W-30c ×2,
  W-30c/W-30d, U9, W-33/W-34, W-27c-0a-4/-6, W-10d-3, W-10d-2, T1b), carrying both documented
  limitations and none of the three forbidden numbers.
- **`README.md`** — new `### 1.4.1` release-note entry at the top of Release Notes (three-most-recent
  inline convention preserved); the 3D Scene feature line gains W-35's **End overlap** sentence
  verbatim from its contract. The **counting convention is stated once, explicitly**
  (`PICKER_IDS` 33 · picker offers 34 · `IDS` 48 forever) with the post-1.4.1 figures **48 → 33,
  15 aliases across 7 clusters**; 1.4.0's own "48 → 35" sentence is **left as shipped** rather than
  silently rewritten, and the 1.4.1 entry says so.
- **In-app help — `MERGE-plan-r2.md` §3.3 option (a), and it turned into a small real change.**
  `help-shortcuts.js` has no 3D Scene section, so W-35's help copy lands on the control. The
  hand-written slices block at `scene3d-panel.js:1411` turned out **not to be the path the app
  actually renders** (verified by instrumenting it: it never fires); the live path is the
  `MAPPER_CONTROLS` descriptor table at `:448` driven by `renderControl`. So the copy went into the
  descriptor as a new generic **`help`** field, and `renderControl` now applies any descriptor's
  `help` as the row's own tooltip — one small reusable addition to the descriptor contract rather
  than a one-off. RGR: a new test in `tests/integration/scene3d-panel.test.js` asserts the End
  overlap row carries the trade-off sentence, the byte-identical default and the faceted-inertness
  note; it fails before the change and passes after. **38/38.** Opening a real "3D Scene" Help Guide
  tab is filed as a follow-up (option (b)), not done here. No keyboard shortcut is added, so the
  shortcut list is untouched.
- **`plans.md`** — one `## Done` entry for the merge (units, both conflicts, the semantic conflict,
  "not pushed"); a new `## Now` block carrying the post-merge queue (U9b+W-10d-3b first, then the
  gallery rebuild LAST, then lane work, then the two filed follow-ups); the `## Blocked on Jay`
  section now names **all nine** frozen decisions in one place.

### Deliberately NOT touched — and why

`docs/3d-audit/lane-reports/LEDGER.md`, `SESSION-SUMMARY.md` and `docs/3d-audit/STILL-OPEN.md`
(plan §3.5) are **modified in `main`'s working tree right now** by the secretary. Editing them on
the integration branch would put an uncommitted-vs-incoming collision on exactly the three
highest-contention files in this effort and **block the fast-forward**. Round 1 set the precedent:
its ledger/summary/STILL-OPEN updates landed in a separate commit on `main` (`47a5a755`) *after*
the merge commit. Left to the orchestrator, with the facts it needs recorded here. Verified: the
integration branch's changed files and `main`'s dirty tracked files have **zero overlap**, and no
merged file collides with any of `main`'s untracked evidence dirs — the fast-forward is clean.

## Version

`package.json` **1.4.0 → 1.4.1**, `npm run version:sync`. Diff is exactly the three expected files:
`package.json` (1 line), `src/config/version.js` (`APP_VERSION = '1.4.1'`), `index.html`
**446 changed lines / 222 `?v=1.4.1` cache-busters / zero `v=1.4.0` remaining** — the same
sed-style substitution round 1 saw, not unrelated churn. **Stop condition 5 did not fire.**
`node scripts/build-tone-laws.js` reproduces `src/config/scene3d-tone-laws.js` **byte-identical**
from `docs/tone-laws/laws.json` on the merged tree (U5b-2's claim re-confirmed post-merge; the
regenerated file left the tree unmodified). Roster on the merged tree: **`IDS` 48 · `PICKER_IDS` 33
· `ALIASES` 15**, and the live picker offers **34** — independently corroborated by w28b's re-run,
whose `optionCount` moved 36 → 34.

## Test suite results — `npm run test:ci`, on the integrated tree, foreground, one suite at a time

| Suite | Files | Tests | Result |
|---|---|---|---|
| unit | 464 passed, 1 skipped (465) | **5199 passed, 44 skipped (5243)** | 0 failed, exit 0 |
| integration | 235 passed (235) | **1973 passed (1973)** | 0 failed, exit 0 |
| e2e | 5 spec files | **62 passed, 7 skipped** | 0 failed (`--workers=1`) |
| visual | 6 passed (6) | **99 passed, 13 skipped (112)** | 0 failed |
| perf | 5 passed (5) | **10 passed (10)** | 0 failed |

**ZERO failures. Nothing silenced, nothing skipped to pass, no `.only` left anywhere.** The four
files this merge edited for cause are each disclosed under `## Bars changed` with the measurement
that justified it.

Comparison with round 1's v1.3.99 baseline: unit **4947 → 5199** (+252), integration
**1945 → 1973** (+28), e2e 62/7 unchanged, visual 99/13 unchanged, perf 10 unchanged. Both suites
rose, which is the expected direction; the plan warned a DROP would be a signal.

Both vitest suites logged the documented benign `[vitest-worker]: Timeout calling "onTaskUpdate"`
RPC timeout and `scripts/run-vitest.js`'s own retry passed with every test still passing — its
documented contract ("a real failure still fails the build"). Unit took 797 s per pass; the single
slowest file, `scene3d-tone-law-collapse.test.js`, is 763 s of that on its own.

**e2e:** run serialized with `--workers=1`, per round 1's diagnosis. Playwright's own `webServer`
managed the dev server; no pre-start was needed and **round 1's parallel-worker hang did not
recur** — so stop condition 7 did not fire. Machine load average was 4.0–4.2 throughout (other
sessions live), which is why every long run was taken one at a time.

## Stop conditions — status

| # | condition | fired? |
|---|---|---|
| 1 | a conflict in a file the plan says merges clean | **no** — the two conflicts are exactly the two predicted; the only surprise was a docs-only lane HEAD, checked and benign |
| 2 | a re-pin beyond §1.3's hash and §1.4's count | **partially, and handled honestly** — two further pins moved (`mesh-self-occlusion`, `curved-crosshatch-controls`). Neither was widened to pass a merge: one is a **tightening** to a measured 0, the other a re-expression of an over-strict oracle with the full measurement table above. Both are pre-existing lane/round-1 debts the merge exposed, not merge interactions, and both are proven so by measuring `main` and the lane separately |
| 3 | a `test:ci` failure absent on unmodified `main` | **no** — final `test:ci` is fully green |
| 4 | ctxbar shows the survivor's silence | **YES — and it is fixed, at source, with RED→GREEN and a live screenshot.** See the merge's own finding. It did not block the commit because it was repaired, not argued away |
| 5 | `version:sync` produces anything but the 3-file / 222-cache-buster diff | **no** |
| 6 | a frozen decision starts looking like work | **no** — all nine left alone and now listed together in `plans.md` |
| 7 | the e2e hang recurs with `--workers=1` | **no** |

## Worktree state

Clean — `git status --short -- . ':!graphify-out'` empty after the commit; `graphify-out` untouched
(hooks disabled on every git command, graphify never run). Final integration HEAD:
**`4421d5146e98427af64495f0ae7e0b6b27d4dcff`**, **41 commits ahead of `main`**, and `main` is an
ancestor of it — **the fast-forward is clean and available.**

`main` is still at `a7d39601`, unmoved, with its own docs WIP intact. **Do NOT push.** The
fast-forward, and the LEDGER / SESSION-SUMMARY / STILL-OPEN entries recording it, are the
orchestrator's step.

## For the orchestrator — what the merge surfaced that outlives it

1. **The ctxbar defect (item 7) was real.** It is fixed, but it says something about the audit's
   shape: two surfaces with a written "must not drift" contract drifted, and the only reason it was
   caught is that a checklist item insisted on a LIVE check the harness could not do. Worth keeping
   that habit for U9b, whose subject is a third surface reading the same roster.
2. **W-36b's "3 pre-existing unrelated failures, ownership undecided" was wrong on both counts.**
   `main` is green; the lane is red. A reviewer accepted a red guard as somebody else's. The failure
   turned out to be a stale over-strict pin rather than a defect, but the classification was made
   without measuring `main`, and that is the cheap step that would have settled it.
3. **Unit F's bar had been stale since round 1** — measured 0 on main, pinned at ≤ 2, and carried
   forward through a whole round as "intentionally RED". Bars that describe a defect should be
   re-measured when the defect's owner lands, not just when the file is edited.
4. **Two evidence dirs are now known-stale and the gallery rebuild must re-shoot them:** W-30c's
   two torus "after" frames (W-30d landed after them on the same lane and re-opens the ring's hole)
   and W-28b's listbox (option count 36 → 34 after the U7/U8 fold, on top of the 9-rows-visible
   reason already on the checklist).
5. **The four relocated evidence scripts hardcode ports 8482/8483** and refuse to reuse a server
   they did not start, so any session running one collides with a live lane dev server. A `PORT=`
   env override would cost one line each and is worth doing next time one is touched.
6. **`plans.md` now carries the two filed follow-ups** — the in-app Help Guide's missing 3D Scene
   tab, and W-35 review item (a)'s tripwire, with the reason it cannot be written honestly today.
