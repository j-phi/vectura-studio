STATUS: ACCEPT-WITH-FOLLOWUPS

# U6 review — fold `penPitchMatch`/`penFacing`/`penStipple` → `penInterleave` (C-06/W-18a, param `penMode`; `penStipple` class move `'dot'`→`'hatch'`)

- **Lane / worktree under review**: `fill-collapse-3`, `.claude/worktrees/fill-collapse-3` (READ-ONLY — no
  edits, stash, or commits made in the worktree at any point; the U9b implementer is now editing this
  worktree on top of `2af329dd`, so both pinned shas were `git archive`'d immediately at the start of this
  review and the live worktree was never read again afterward).
- **Pinned range**: `426cc5e4` (base, main tip — round-2 wrap-up, v1.4.1) `..` `2af329dd` (final, one commit).
  Confirmed `426cc5e4` **is** current `main`'s HEAD (`git rev-parse HEAD` on the main checkout), so unlike
  U7/U8 (reviewed on unmerged branches with a three-way merge hazard on the collapse test file), this unit's
  merge to main is a plain fast-forward with zero divergence — no other round-3 lane touches this unit's
  files.
- **Method**: `git -C fill-collapse-3 archive 426cc5e4` → scratch `u6-before`; `git archive 2af329dd` →
  scratch `u6-after`; `node_modules` symlinked into both from main. All numbers below are independently
  re-derived from these two exports (plus a real dev-server capture on scratch ports 8701/8702, killed after
  use, and a diff against the committed main gallery) — none trusted from the implementer's worktree,
  `report.json`, or `U6-impl.md` without reproduction. Both scratch exports and all capture output were
  deleted at the end of this review (scratchpad also holds unrelated files from other concurrent sessions,
  left untouched).

## 0. Diff scope — PASS

`git -C fill-collapse-3 diff --stat 426cc5e4..2af329dd -- . ':!graphify-out'`: exactly 10 files —
`docs/tone-laws/laws.json` (+1/-1), `scripts/build-tone-laws.js` (+38), `src/config/context-bar.js` (+13/-1),
`src/config/scene3d-tone-laws.js` (regenerated, +54/-1), `src/core/scene3d/shadows.js` (+21/-1),
`tests/integration/scene3d-fill-style-picker.test.js` (+28/-…), `tests/unit/scene3d-fill-style-effective-law.test.js`
(+59), `tests/unit/scene3d-shadow-tone-law.test.js` (+38), `tests/unit/scene3d-tone-law-collapse.test.js`
(+257), `tests/unit/scene3d-tone-laws-config.test.js` (+17/-…). No touch to `surface-fill.js`,
`surface-fill-mono.js`, `mappers.js`, `hlr.js`, or any UI panel file — matches the claim.

## 1. RED — reproduced, semantic not vacuous

Copied the after-export's 5 changed test files onto the before-export and ran
`scene3d-tone-law-collapse.test.js -t "U6"`: **12 failed / 4 passed (of 16 matched, 95 skipped)** — every
failure a semantic mismatch (`resolved to "penInterleave", not penPitchMatch/penFacing/penStipple` across
all 27 primitive×density×fold combinations, plus the mark-class/caveat assertions), never a `TypeError` or
module-load crash. RED is real and for the right reason.

## 2. GREEN — reproduced file-by-file (foreground only; the machine was heavily loaded by 3+ concurrent
sessions' vitest workers throughout, including the U9b implementer's own run of this same file on the live
worktree — confirmed via `ps aux`, forcing several files to auto-background past the 120s default and one
multi-file batch to hit the documented `onTaskUpdate` RPC truncation-after-first-file bug)

| suite | result | matches claim |
|---|---|---|
| `scene3d-tone-law-collapse.test.js` (full file, singleFork) | **111/111**, 796.8s | yes |
| `scene3d-tone-law-collapse.test.js -t "U6"` | **16/16** | consistent (all 16 U6-tagged tests, listed individually, incl. the `.vectura` round-trip, mark-class move, and all-four-caveat blocks) |
| `scene3d-tone-laws-config.test.js` | **8/8** | yes |
| `scene3d-fill-style-effective-law.test.js` | **5/5** | yes |
| `scene3d-fill-style-picker.test.js` (full file) | **166/166**, 62.9s | yes |
| `scene3d-shadow-tone-law.test.js` | **26/26** | yes |
| `scene3d-shadow-tone-law-uniqueness.test.js` | **3/3** | yes |
| `stroke-fill-style-control` + `scene3d-panel` + `scene3d-panel-style-live-sync` + `context-bar-scene-flyouts` (run together) | **113/113** | yes (= claimed 30 + 83) |
| `scene3d-ribbon-weightscale-invariant` (unit) + `scene3d-ribbon-weightscale` (integration) | **18 + 41 = 59** | yes |
| `scene3d-tone-law-plumbing` + `-params` + `-dispatch` + `faceted-tone-law` + `solid-cap-reachability` + `one-pen-down-reachability` | **5 + 7 + 7 + 19 + 10 + 5 = 53**, each file run individually and several re-confirmed twice | **mismatch — implementer claims 59/59, true sum is 53** |

**True total, independently summed: 111+8+5+166+26+3+113+53+59 = 544, not the report's own "Total: 550/550".**
Every suite I ran is genuinely green (0 real failures found in any of the rows above) — this is a
report-accuracy error, the same class `LEDGER.md` already flags for U0 ("342 vs 335") and U8 ("57 vs 51,
453/447 vs 426"), here a 6-test overcount on one row that propagates to the stated total. **Correct the
`59/59` row to `53/53` and the "Total: 550/550" line to `544/544` before this is copied into
`CHANGELOG.md`/`LEDGER.md`.**

## 2b. A second, more serious gap the implementer's own guard table never surfaces — a genuinely RED test
in the post-U6 tree, never run, never disclosed

`tests/unit/scene3d-fill-style-display-params.test.js` (W-10d-3's generative cross-check for the DISPLAY
seed a raw folded `toneLaw` needs — landed pre-existing on this lane's base, since `426cc5e4` already
carries W-10d-3 from round 2) is **not in the implementer's "Guards run" table anywhere**, and it is a
**direct, mechanical consumer of `R.ALIASES`** — exactly the surface U6 grows from 15 to 18 entries.
Independently run:

- **At `426cc5e4` (before U6): 3/3 passing.**
- **At `2af329dd` (after U6): 2/3 passing, 1 FAILING** — `G1 — every one of the 15 ALIASES entries: …`
  fails with `expected 18 to be 15` at its own hard-coded `expect(aliasIds.length).toBe(15)` (line 62),
  because U6 grows `ALIASES` to 18 and nobody bumped this pre-existing count. This assertion fires **before**
  the test's own generative body (the per-alias `forEach` round-trip check) runs, so **the actual
  property this test exists to prove — that `penPitchMatch`/`penFacing`/`penStipple`'s DISPLAY seed
  round-trips correctly through `resolveToneLaw` — was never mechanically exercised by any test in this
  diff.** (`G2`/`G3`, which don't depend on the count, still pass.)

**This is a real, currently-failing test that ships with `2af329dd`** — not a report-accuracy slip like §2's
row, an actual regression the tree carries today. It is exactly the AGENT-PROTOCOL class of "bar broken by
omission" the mandatory-disclosure rule exists to catch, and it means the task brief's condition (2)
("survives through `effectiveLaw` and `displayParams`") is currently **unproven by any passing test**,
despite being asserted as done in the report.

**Independently verified the underlying mechanism is sound, though, so this is a coverage/discipline gap,
not a functional defect:**
- Wrote a standalone scratch test (not part of the diff, deleted after use) calling
  `FS.displayParams('penPitchMatch'|'penFacing'|'penStipple', {toneLaw: id})` for each of the three new
  aliases and asserting the seeded value round-trips through `Params.resolveToneLaw`/`normalizeStyle`
  back to the same folded id — **1/1 passed**. `SCENE_FILL_STYLES.displayParams` (`context-bar.js:322`) is
  fully generic over `R.ALIASES[raw]` with no per-id code, so mechanically nothing is broken for these
  three ids; only the shared cross-check's own hard-coded population count is stale.
- Mutation-confirmed the cross-check itself is real (not vacuous) once the count is not the first thing
  that fails: temporarily blanked `penStipple`'s caveat in the generated config and reran
  `scene3d-fill-style-effective-law.test.js` — the U6 block's own `expect(0).toBeGreaterThan(0)` tripped
  immediately, confirming the caveat-survival cross-check (a different file, the one U6 **did** touch) does
  trip on removal, as the task brief required. Restored cleanly.

**Recommendation, not itself a blocker to re-verify given the above**: bump
`tests/unit/scene3d-fill-style-display-params.test.js:62`'s `expect(aliasIds.length).toBe(15)` to `18` (or
`toBeGreaterThanOrEqual`, matching this file's own "floor, not ceiling" pattern used elsewhere in the same
file) in the same commit or a 1-line follow-up **before merge**, and re-run the file to confirm 3/3. This is
mechanical and low-risk, but it is a real red test sitting in the tree right now and must not ship silently
green in the ledger.

## 3. Mutation kill — PASS

In the after-export's **generated** `src/config/scene3d-tone-laws.js`, swapped the `law` values for
`pitchMatch`↔`facing` inside `STYLE_PARAMS.penInterleave.options` (mis-map, not deletion) and reran the
collapse file + effective-law file filtered to U6: **5 tests failed** (2 in the collapse file's
byte-identity/multi-density blocks, listing all 18 affected combinations with correctly-diagnostic messages
like `resolved to "penFacing", not penPitchMatch`; the caveat cross-check in the effective-law file also
failed). Restored from a pre-mutation copy, confirmed byte-identical. The sweep is not vacuous.

## 4. Byte-identity — DOUBLE-PROVEN, both proofs independently reproduced, plus a third check against the
committed gallery

**Method 1 (in-tree resolver sweep)**: confirmed via the 111/111 and 16/16 runs above — the "U6
multi-primitive x multi-density" describe block (sphere/torus/cone × low/med/max × 3 folds = 27
combinations, plus the bare survivor) passed, 3.0s / 1.4s wall.

**Method 2 (real headless-Chromium capture, independently re-run, not read off `report.json`)**: started
fresh dev servers on scratch ports 8701 (`u6-before`, `426cc5e4`) and 8702 (`u6-after`, `2af329dd`) and ran
`node scripts/audit/scene3d-capture.js --tier B --root <export> --port <port> --only
'^(torus|sphere|cone)__hatch__(penInterleave|penPitchMatch|penFacing|penStipple)__(low|med|max)__a$' --out
<scratch>` from MAIN against each, 36 cells both sides. **36/36 md5-identical between the true pre-U6 and
post-U6 trees**, reproduced via Python `hashlib.md5`, not `report.json`.

**Method 3 (own repro of the "vs committed gallery" claim)**: md5-compared the implementer's own
`after/U6/shots/B/` (36 cells) against the committed `docs/3d-audit/fill-audit/shots/B/` gallery, and
separately compared my own independent Method-2 capture against both: **36/36 match all three ways, 0
diffs, 0 missing.** Unlike U7/U8 (which found a stale-baseline divergence on a subset of cells), U6's claim
of "no staleness finding to report here" holds under independent reproduction.

## 5. The caveat condition — traced at the code level and live-verified; one real, disclosed duplicate

Read `SCENE_FILL_STYLES.effectiveLaw` (`context-bar.js:290`, untouched by this diff — fully data-driven off
`STYLE_PARAMS`) directly: a descriptor's default option never increments `activeCount`, so `penMode`
omitted/`'interleave'` returns the bare survivor `'penInterleave'` (never empty), and each of the other
three values returns its own law id. Confirmed independently:

1. **Data**: `docs/tone-laws/laws.json` read directly — all four ids (`penInterleave`, `penPitchMatch`,
   `penFacing`, `penStipple`) carry real, non-empty caveats. `penPitchMatch` and `penFacing` are
   **byte-identical** ("Three pens are SIMULATED... penId is carried per style group, not per run.") — a
   genuine, harmless duplicate, correctly flagged (not hidden) by the implementer; `penInterleave`'s own is
   longer (mentions `scene3d.js`) and `penStipple`'s is the distinct mark-class-move text
   (`docs/tone-laws/laws.json:301`, 2 sentences, plain language, no audit jargon — matches the task's
   condition (3) requirement).
2. **Cross-check trips on removal**: blanked `penStipple`'s caveat in the generated config and reran
   `scene3d-fill-style-effective-law.test.js` — the U6 block failed immediately (`expected 0 to be greater
   than 0`). Restored cleanly. (`displayParams`'s own equivalent check is the §2b gap above — the
   `effectiveLaw`/`resolveToneLaw` pair's own cross-check is real; the third site's is currently broken.)
3. **Live app, both surfaces, LOOKED at directly** (implementer's screenshots, `after/U6/`):
   `penInterleave-interleave-crop-native.png` — docked Style tab, default state, shows `penInterleave`'s own
   caveat verbatim. `penStipple-stipple-crop-native.png` — same docked tab, `Pen mode: Stipple`, shows the
   mark-class-move caveat verbatim. `ctxbar-style-stipple-crop-native.png` — the ctxbar Style flyout
   (a **separate UI surface**) at the same folded state, same caveat text, plus the (i) popover still
   reading the survivor's static "Parallel hatching" blurb (unaffected, matching U7/U8's finding that the
   popover and the caveat are deliberately separate). Both real UI surfaces confirmed showing the right text
   for both the survivor and a folded id, satisfying secretary flag (4).

## 6. The `penMode` sub-control and the class move — PASS, both independently reproduced structurally (not
just from screenshots)

`scripts/build-tone-laws.js` diff adds exactly one `COLLAPSE.penInterleave` row (`key: 'penMode'`, default
`'interleave'`, 4 options) — matches the plan's contract. Regenerated `src/config/scene3d-tone-laws.js` from
the after-export's build script + `laws.json`: byte-identical to the committed file. Build script prints
`PICKER_IDS 30`, `ALIASES 18`, `48 law(s) (37 production / 11 library)`.

**Class move, verified via `FS.groups('sphere', null, 'hatch')` directly (both real UI surfaces build their
picker from this one function — `scene3d-panel.js:668` and `context-bar.js:1578` both call `FS.groups`, so
one structural check covers both surfaces, not just the screenshots)**:
- `"Dots & stipple"` group = `['lozengeStipple', 'mkDotScreen']` — `penStipple` genuinely absent.
- `"Parallel hatching"` group contains `penInterleave`; `penPitchMatch`/`penFacing`/`penStipple` are absent
  as standalone rows anywhere (correctly folded, not offered separately).

This matches the implementer's own live-DOM screenshot claim exactly, independently reproduced without a
browser.

## 7. Secretary flags — addressed individually, all independently reproduced

**(1) `HATCH_LAW_RECIPES.penStipple` — is it genuinely distinguishable from every offered law's shadow, and
is `hatchEndTrim(…, 0.24)` measured rather than a plausible constant?**
The uniqueness HEADLINE test (`scene3d-shadow-tone-law-uniqueness.test.js`) sweeps `['ladder'].concat(
PICKER_IDS)` — since `penStipple` left `PICKER_IDS` in this same diff, the HEADLINE no longer directly
exercises it, exactly as its own file's standing comment already documents for every prior fold
(`fineLadder` etc.) — **necessary but not sufficient, as the secretary flagged.** Wrote a standalone scratch
test building the real shadow for every currently-offered id **plus** `penStipple`/`penPitchMatch`/
`penFacing` on a real box+ground+directional-light scene and fingerprinting all of them together:
**0 collisions**, and `penStipple` specifically confirmed distinct from `ladder`, `penInterleave`,
`endShorten` (its nearest sibling by mechanism — both use `hatchEndTrim(hatchRingsEvenOdd(...))`),
`penPitchMatch`, and `penFacing`. Also confirmed structurally (not just by the passing test) that
`DOT_LAW_RECIPES.penStipple` is unreachable: `shadowMarkLines`'s dispatch `switch` keys on `markClass`
alone, and `toneLawMarkClass` delegates to `SCENE_FILL_STYLES.markClass(lawId)` (now `'hatch'` for
`penStipple`), so the `case 'dot':` branch is structurally never reached for this id — confirmed by reading
both functions, not assumed. **On the constant**: `hatchEndTrim(lines, trimFrac)` trims `trimFrac` off
*each* end, so `0.24` removes `2×0.24 = 48%` of each ruling's length, leaving ≈52% — this closely tracks the
now-dead `DOT_LAW_RECIPES.penStipple`'s own `flickLenMult: 0.5` (50% length), i.e. `trimFrac ≈ (1 −
flickLenMult)/2 = 0.25`, essentially the value used. This is a genuine, traceable translation of the
measured pre-move mechanism, not an arbitrary pick.

**(2) `DOT_LAW_RECIPES.penStipple` dead code — genuinely unreachable, not live in a third place?**
Confirmed above via the dispatch-switch trace: the only two call sites of `toneLawMarkClass`/`markClass`
both resolve through `SCENE_FILL_STYLES.markClass`, the single roster→mark-class source of truth
`context-bar.js` owns (per the file's own comment, "never duplicated"). No other file computes or caches a
mark class for `penStipple` independently. Genuinely dead.

**(3) Three bars — behavioural, not just numeric.**
`picker 33→30` and `aliases 15→18`: reproduced via `scene3d-tone-laws-config.test.js` (8/8) and the build
script's own printed counts. `box dead-count 23→20`: reproduced via the real `F.groups('box')` runtime
inside the passing `scene3d-fill-style-picker.test.js` (166/166, includes this exact assertion at its own
line), **and** independently cross-checked against `docs/3d-audit/fill-audit/manifest.B.unreachable.jsonl`
— all **four** members of the cluster (`penInterleave`, `penPitchMatch`, `penFacing`, `penStipple`) have a
`box`+`hatch` `"status":"unreachable"` row, confirming the three newly-dead ids are dead for the same
structural reason as their already-dead survivor, not coincidentally.

**(4) The caveat — user-facing copy Jay named — renders on both surfaces for the folded id and the
survivor.** See §5.3 and §6 above: both the docked Style tab and the ctxbar flyout are confirmed (by
screenshot for the exact states captured, and structurally for the shared code path underneath) to show the
right caveat for both `penInterleave` (survivor, default) and `penStipple` (the folded id whose text
changed).

## 8. `.vectura` round-trip and preset exposure — PASS

The shared `describeSingleParamCluster` helper's own tests (all 16 in §2's `-t "U6"` run, including "a saved
.vectura naming a folded toneLaw resolves through the real engine (`sanitizeSceneParams`) unchanged in
effect", "picker round-trip: resolve()/entry() still answer for a folded id", and the `Params.normalizeShadow`
U9-precedent pass-through test) confirm the round trip for all three folded ids through the real engine, not
a hand-rolled mock. `user-presets/` exposure re-verified: `grep -rl "toneLaw" user-presets/` → 0 files;
`grep -rlE "penInterleave|penPitchMatch|penFacing|penStipple" user-presets/ src/config/user-presets.js` →
0 files (both re-run in the after-export).

## 9. PNGs — LOOKED at directly, both mine and the implementer's

- Converted (`sips`) and read `torus__hatch__penInterleave__med__a`, `…penStipple…`, `…penPitchMatch…`,
  `…penFacing…` from the gallery capture directly: all four the same white capsule-stepped ruling family on
  a black torus, visually indistinguishable at plot scale between `penInterleave`/`penStipple`/
  `penPitchMatch`; `penFacing` shows visibly longer/larger capsule segments (a genuine, minor picker-tier
  difference, matching both the plan's and the implementer's own note) — not a rendering-tier collision.
- `after/U6/penInterleave-interleave-crop-native.png`, `penStipple-stipple-crop-native.png`,
  `ctxbar-style-stipple-crop-native.png` — LOOKED at directly, all three word-for-word match `laws.json`'s
  caveats and the class-move claim (see §5, §6).

## 10. Merge notes

- **`426cc5e4` is current `main`'s exact HEAD** (verified via `git rev-parse HEAD` on the main checkout) —
  this unit's merge is a plain fast-forward, not a three-way hand-merge like U7/U8's `scene3d-tone-law-collapse.test.js`
  hazard (this unit's own hunk in that file is a clean EOF-region append per the diff-stat, and there is no
  divergent main history to reconcile against).
- **U9b (with W-10d-3b folded in) is IN-FLIGHT on this same lane, stacked directly on `2af329dd`** — per
  `LEDGER.md` row 10 and `STILL-OPEN.md`, this is "the first tree ever to hold U9, U8 and now U6 together."
  This review's archive-immediately-and-never-reread-the-live-worktree discipline was necessary and correctly
  followed (confirmed via `ps aux`: a live process was running this same test file against the live
  worktree path during this review).
- **`docs/tone-laws/laws.json` confirmed untouched** relative to its measured-corpus role — only
  `penStipple.caveat` changed (a deliberate, disclosed edit, not a re-measurement), and
  `SCENE3D_TONE_LAWS.VERSION` truth was not independently re-derived in this review (not required — no test
  anywhere pins that hash per U7/U8's own prior sweep, and this unit's own diff doesn't touch the corpus's
  measured fields).
- **Before landing**: apply §2b's one-line fix to `scene3d-fill-style-display-params.test.js:62` and
  reconfirm 3/3, and correct §2's `59→53`/`550→544` numbers in the report before they propagate to
  `CHANGELOG.md`/`LEDGER.md`. Neither requires touching production code.

## Verdict

**ACCEPT-WITH-FOLLOWUPS.** RED is real and semantic, GREEN reproduces suite-by-suite (each file
independently re-run, not batch-trusted, under real shared-machine contention including a live concurrent
run of the same file by the U9b implementer), the mutation kill is clean and diagnostic, byte-identity is
triple-confirmed (in-tree sweep, independent real-capture, and a match against both the implementer's own
evidence and the committed gallery baseline), the caveat condition is proven by code trace, a real mutation
trip, and live screenshots on both UI surfaces, the class move is proven structurally (not just from
screenshots) to affect both surfaces via one shared `FS.groups()` function, all four secretary flags are
independently addressed and hold up, the three disclosed bars are honest and the box dead-count is
behaviourally reconfirmed for all three folded ids via the unreachable manifest, `.vectura` round-trip and
preset exposure are clean, and the merge is a plain fast-forward with no hazard.

**Two follow-ups, one of them a real (if trivial and low-risk) regression, required before this is copied
into `CHANGELOG.md`/`LEDGER.md` or merged:**
1. **`tests/unit/scene3d-fill-style-display-params.test.js` is currently RED at `2af329dd`** (`G1: expected
   18 to be 15`) — a pre-existing shared cross-check this diff never touched, ran, or disclosed, broken by
   `ALIASES` growing from 15 to 18. The underlying `displayParams` mechanism is independently proven correct
   for all three new folds (scratch test, 1/1), so this is a coverage/discipline gap rather than a
   functional defect, but it is a genuine failing test in the tree today and must be fixed (bump the count
   to 18) and reconfirmed before merge.
2. The "Guards run" table's `plumbing+params+dispatch+faceted-tone-law+solid-cap-reachability+
   one-pen-down-reachability` row is `53/53`, not the claimed `59/59` (each file independently re-run,
   several twice); the report's own "Total: 550/550" should read `544/544`. No test anywhere in this row or
   any other is actually failing — this is a pure report-accuracy slip, the same class as U0's and U8's
   priors — but it should not propagate uncorrected.
