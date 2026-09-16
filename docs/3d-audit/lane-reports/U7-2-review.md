STATUS: ACCEPT

# U7-2 adversarial review — plain-language pass over every remaining folded fill-law caveat

- **Lane / worktree under review**: `fill-collapse-3`, `.claude/worktrees/fill-collapse-3` (READ-ONLY —
  no edits, stash, or commits made in the worktree; the U9b-2/U5b-4 implementer was actively editing it
  concurrently throughout this review — confirmed via `git status --short` showing uncommitted changes to
  `src/ui/panels/scene3d-panel.js`, `src/ui/shell/context-bar.js`, and three test files, exactly the files
  their own brief allows. I read the pinned range exclusively via `git show <sha>:<path>` / `git archive`,
  never via the live working-tree files, so the concurrent WIP never leaked into this review).
- **Pinned range**: `2b189b5f` (base) `..` `49a5ef88` (final), branch `3d-scene/fill-collapse-3`.
- **Method**: `git archive 2b189b5f` → scratch `pre`; `git archive 49a5ef88` → scratch `post`;
  `node_modules` symlinked into both from MAIN. Every number below is independently re-derived from the
  `post` export (plus one real dev-server + Playwright capture on scratch port 8492, killed after use) —
  none trusted from the implementer's worktree, `report.json`, or `U7-2-impl.md` without reproduction. Both
  scratch dirs and the dev-server process were removed at the end of the review (see Cleanup).

## 0. Diff scope — PASS

`git -C fill-collapse-3 diff --stat 2b189b5f..49a5ef88 -- . ':!graphify-out'`: exactly 3 files —
`docs/tone-laws/laws.json` (+51/−12 net), `src/config/scene3d-tone-laws.js` (regenerated, +36/−22 net),
`tests/unit/scene3d-tone-law-collapse.test.js` (+136/−2). Confirmed byte-identical across the range (via
`git diff --quiet`, not `--stat`, to catch a no-op-looking-but-touched file): `src/config/context-bar.js`,
`src/ui/panels/scene3d-panel.js`, `src/ui/shell/context-bar.js`. No production/render file
(`surface-fill.js`, `surface-fill-mono.js`, `mappers.js`, `hlr.js`, `shadows.js`, `scene3d.js`) touched.
Confirmed directly (not by grep alone): the only two live `.caveat` readers in the whole `src/` tree are
`src/ui/panels/scene3d-panel.js` and `src/ui/shell/context-bar.js` (both UI display sites, both
byte-identical across the range), plus `src/config/context-bar.js` (defines `FS.note()`, not a render
site). Zero hits inside `src/core/algorithms/` or `src/core/scene3d/`. This structurally proves the "no
rendered pixel can move" claim, on top of the report's own version of the same check.

## 1. Flag 1 — the 17-caveat count against the roster — PASS

Re-derived from `docs/tone-laws/laws.json` in the post export directly (not from the report):
**48 laws total, 20 with a non-empty `caveat`, 17 with a `measured` sibling.** The 3 residue ids match the
prediction exactly: `bundleDither`, `contFieldTouch`, `penStipple`. Read all three verbatim:

- `bundleDither`: *"Dithered bundle mode can make repeating patterns (moire) more visible than the default
  Count mode, not less. If you see new banding, switch back to Integer pass count."*
- `contFieldTouch`: *"On crosshatch fills, this floor setting floods the whole surface to solid black with
  no shading left. If your fill looks like a solid dark blob, try a different Field floor option."*
- `penStipple`: *"Pen Stipple moved from "Dots & stipple" to "Parallel hatching": it has never drawn dots —
  its highlight fade comes from shortening the fine nib's hatch marks, the same ruled-darks mechanism as
  the other Pen options. If you want an actual dot pattern, this option won't give you one."*

None carries an `R2`/`L*` code, an mm figure, a bare cell token (`sphere·hatch`), or a function/file name.
`penStipple`'s mention of "Dots & stipple"/"Parallel hatching" are real UI optgroup labels, not jargon.
**17 + 3 = 20 confirmed; all three residue caveats are genuinely already plain.**

## 2. Flag 2 — `measured` absent from the generated file, verified structural — PASS

- `grep -c '"measured"' src/config/scene3d-tone-laws.js` in the post export (as committed): **0**.
- Regenerated with `node scripts/build-tone-laws.js`: still **0**, and the regenerated file is
  **byte-identical to the committed one** (diffed against `git show 49a5ef88:src/config/scene3d-tone-laws.js`
  directly — clean).
- Ran the regenerate a second time and diffed the two outputs: **byte-identical** — the build is a
  deterministic pure function of `laws.json`, reproduced myself.
- Read `scripts/build-tone-laws.js`'s `BY_ID[id] = {...}` literal (lines 169–181): it is a fixed,
  explicit field list (`id, label, family, singleWeight, mechanism, strengths, weaknesses, chooseWhen,
  caveat, simulated, tier`) that does not mention `measured` — structural, not incidental.
- **Adversarial mutation (the harder question)**: added `measured: (typeof law.measured === 'string' &&
  law.measured) ? law.measured : null,` to that literal, regenerated — confirmed `"measured"` now appears
  48 times in the generated file — and re-ran the pinned test
  (`tests/unit/scene3d-tone-law-collapse.test.js -t "measured"`, foreground, singleFork). **It failed**
  exactly at the assertion `expect(generatedSrc).not.toMatch(/"measured"/)` (1 failed, 12 passed, 104
  skipped). Restored both mutated files from the pre-mutation copies and confirmed byte-identical to the
  committed source afterward. **The test is non-vacuous — this is not W-38's `git show HEAD:` class of
  defect.**

## 3. Flag 3 — the two re-pins are claim-preserving, not widened bars — PASS, with one non-blocking note

Read the two sites directly (`~1176-1177`, U7's ampSpacing/weaveDepth block; `~1380-1381`, U8's
interlockWeave/onePenDown block). Both changed `/single-weight/` to a claim-in-new-words regex.

**Adversarial mutation**: edited `laws.json`'s `ampSpacing.caveat` in the post export to
*"This line uses a spacing field to carry the shading, driven by the wave amplitude control."* (mentions
"weight" nowhere, drops the "isn't constant/varies" claim entirely), regenerated, and re-ran the U7-caveat
test. **It failed** exactly at `expect(survivorCaveat).toMatch(/weight.*(?:isn't constant|varies)/)`,
diagnostic message showing the mutated string. Restored `laws.json`, regenerated, confirmed byte-identical
to the committed generated file again. **The re-pin still fails on a caveat that has lost the claim — it is
a copy re-pin, not a widened bar**, exactly as disclosed.

**Non-blocking looseness note** (not in the report, found by adversarial probing): the two `.*`-bearing
survivor-side regexes (`/weight.*(?:isn't constant|varies)/`, `/weight.*varies/`) are, in the abstract,
loose enough to match unrelated decoy prose that mentions "weight" and "varies" far apart on unrelated
topics (verified: a synthetic decoy sentence about pen weight and room humidity matched `/weight.*(?:isn't
constant|varies)/`). This is looser than the old `/single-weight/` exact-term match. It is not exploitable
today — the assertion only ever runs against these four specific, controlled production caveats, and my
mutation test above shows it correctly fails when THIS text loses the claim — but it is a real, if
theoretical, widening of what the regex *could* match if the caveat text were rewritten again later without
re-tightening the pattern. Flagging as a follow-up note for whoever next touches these two caveats, not a
reason to reject this unit.

## 4. Flag 4 — the 555/555 sum — PASS, reconciliation independently reproduced

Ran every named guard myself, foreground (`timeout: 600000` throughout), one command at a time:

| # | Suite(s) | My count | Matches report |
|---|---|---|---|
| 1 | `scene3d-tone-law-collapse.test.js` (full file, singleFork; auto-backgrounded by the Bash tool past 600s, notification-driven, see §6) | **117/117**, 803.85s wall, exit 0 | yes |
| 2 | same file, `-t "U7-2"` | **6/6** (111 skipped of 117) | yes |
| 3 | same file, `-t "U7 caveat\|U8 caveat\|U6 caveat\|U5b-2"` | **15/15** (102 skipped of 117) | yes |
| — | same file, `-t "U7-2\|U7 caveat\|U8 caveat\|U6 caveat\|U5b-2"` (combined, to test overlap) | **21/21** (96 skipped) — exactly 6+15, confirming rows 2 and 3 are disjoint subsets of row 1 | (not in report; my own check) |
| 4+5 | `scene3d-fill-style-effective-law.test.js` + `scene3d-tone-laws-config.test.js` (run together) | **7/7 + 8/8 = 15/15**, per-file breakdown confirmed in output | yes |
| 6 | `scene3d-fill-style-picker.test.js` (integration, full file) | **170/170**, 61.6s | yes |
| 7 | `scene3d-shadow-tone-law` + `-uniqueness` + `one-pen-down-reachability` | **40/40**, 27.4s (benign `[FillBoolean]` stderr noise, pre-existing) | yes |
| 8 | `stroke-fill-style-control` + `scene3d-panel` + `context-bar-scene-flyouts` | **107/107**, 24.6s | yes |
| 9 | `scene3d-panel-style-live-sync` + `scene3d-faceted-tone-law` + `scene3d-solid-cap-reachability` + `scene3d-tone-law-dispatch` + `scene3d-tone-law-plumbing` | **47/47**, 337s (benign `onTaskUpdate` RPC noise, pre-existing) | yes |
| 10 | `scene3d-ribbon-weightscale-invariant` (unit) + `scene3d-ribbon-weightscale` (integration) | **59/59**, 134.5s (same benign RPC noise) | yes |

**My own reconciliation**: naive sum 117+6+15+7+8+170+40+107+47+59 = **576**. Rows 2 and 3 are targeted `-t`
subsets of row 1's full-file run (confirmed disjoint via the combined-filter check above, 6+15=21 exactly,
no double-matched test). **576 − 21 = 555.** This matches the report's headline exactly, and — unlike the
report, which stated the reconciliation without running the combined-filter disjointness check — I have now
positively shown rows 2/3 do not overlap each other, closing the one gap in the report's own derivation.
**No arithmetic slip found** (this chain has caught four before: U0, U1–U5, U8, U6 — this one is clean).

## 5. Flag 5 — the shadow-row caveat gap is real, pre-existing, and correctly out of scope — PASS

Read `src/ui/panels/scene3d-panel.js` and `src/ui/shell/context-bar.js` at **both** endpoints via
`git show <sha>:<path>` (never the live worktree, which has unrelated concurrent WIP on these exact files):

- At `2b189b5f`: exactly one `.is-caveat` site in each file (`scene3d-panel.js:750`, docked Style tab;
  `context-bar.js:1622`, ctxbar Style flyout). No shadow-row site in either file.
- At `49a5ef88`: identical — same two sites, nothing added or removed. Confirmed the files are
  byte-identical across the whole range (§0), so U7-2 could not have introduced or removed this gap either
  way even in principle.
- **Live-verified myself** (see §7): the shadow row's Fill Style picker (`dutyConst`, "Duty Cycle ·
  Constant") renders an (i) icon and no caveat paragraph, in the same real dev-server capture used for the
  render-path check.

**Confirmed real, confirmed pre-existing at the base commit, confirmed not touched by this unit.** Filing
it as U5b-4 (a separate, already-in-flight run) rather than fixing it here is the correct, honest scope
boundary — adding a caveat render call would be a rendering-behavior change, forbidden by this unit's
disclosed copy-only remit.

## 6. Flag 6 — the collapse-file guard run, re-run myself — PASS (with an unavoidable tooling caveat)

Ran `tests/unit/scene3d-tone-law-collapse.test.js`, full file, foreground, `--pool=forks
--poolOptions.forks.singleFork=true`, Bash `timeout: 600000` from the start (not as a retry after a
default-pool failure — started with singleFork per the brief's explicit instruction). **It still exceeded
the tool's 600s hard ceiling and the Bash tool itself moved it to the background** (I did not pass
`run_in_background`, arm a Monitor, or end my turn to poll it — I continued other verification work and
received the tool's own completion notification, the same "one-shot wait until done" pattern the tool
documents for exactly this situation). **My own measured result: 117/117, 803.85 seconds wall, exit code
0** — squarely inside the documented 390–840s historical range for this file, and matching the
implementer's own 117/117 claim exactly. I did not treat this as license to skip the reproduction, restate
the report's number, or arm an idle Monitor — I generated the number myself, in the foreground as
instructed, and the 600s ceiling is a hard tool constraint neither the implementer nor I can engineer
around for a file whose own historical worst case (840s) already exceeds it.

## 7. Flag 7 — `penPitchMatch`/`penFacing` byte-identical caveat — PASS, correctly not a violation

Traced the roster structure in the regenerated `src/config/scene3d-tone-laws.js`: `ALIASES.penPitchMatch.into
=== 'penInterleave'` and `ALIASES.penFacing.into === 'penInterleave'` — **both are folded siblings of the
same survivor**, not a survivor/folded pair. Confirmed the caveat text is byte-identical in `laws.json`:
*"Like the other Pen options, this fill's three nib widths are simulated on one pen layer — a real plot
would need three separate pen passes to reproduce them exactly."*

The standing "survivor and folded id each carry their own DISTINCT caveat" rule (U7/U8) exists because a
**survivor's default state** could otherwise show the wrong one of two possible caveats — a real
misinformation risk. That risk does not apply to two **folded siblings of the same survivor**: neither is
ever shown as a "default" that could mask the other; `effectiveLaw` always resolves explicitly to whichever
one is picked. Read `docs/3d-audit/lane-reports/U6-impl.md` (the line that first established this): U6 found
the identical duplicate as a "real finding, not a bug," and explicitly scoped the distinctness rule to
survivor-vs-folded pairs only. **U7-2's continuation of the byte-identical pair is correct, matches
established precedent, and is honestly disclosed** ("confirmed deliberate, matching U6's finding").

## 8. Also checked, as a matter of course

- **Vacuous-guard check on the jargon-absence regex.** Cross-referenced every jargon token actually present
  in the 17 *old* caveats (from `U7-2-impl.md`'s old→new table) against the regex's alternation list
  (`RMS|R2|R²|L\*|·hatch|·crosshatch|·contour|CONTROL/REFUTATION|WEIGHT_LAWS|isWaveLaw|splitsAlongLine|penId|
  scene3d\.js|surface-fill\.js|single-weight|mm|\d+%|gated samples|Stage 0`): every jargon term that
  actually appeared in the pre-rewrite corpus is covered. It is a regression guard against reintroducing
  *this specific* jargon, not a general jargon detector — that scope match is appropriate and matches
  U5b-2's own precedent for the same test class. It would not catch a *new* kind of jargon introduced later,
  but that is out of scope for a copy-only unit reviewing its own diff.
- **Preset exposure**: re-ran `grep -rl "toneLaw" user-presets/` in the post export myself: **0 files**.
- **Render-path byte-identity, live-verified.** Started a fresh dev server from the **post** export on port
  8492 (verified free first; killed after use), drove it with a scratch Playwright script (deleted
  afterward): added a scene3d layer, clicked the real Torus shelf button, clicked the real Style tab, set
  the Fill Style `<select>` to `ampSpacing` via a real `change` event, and screenshotted the resulting
  `.is-caveat` element at native resolution. **Text rendered exactly**: *"This line's weight isn't constant
  along its length — it thickens and thins as it goes. That happens because wherever the wave spacing gets
  too tight to draw cleanly, weight takes over to keep carrying the shading."* — matches `laws.json`
  verbatim, matches the implementer's own crop verbatim. `pageErrors: []` throughout. `APP_VERSION` =
  `1.4.1`, matches the worktree's `package.json` (no bump, correct for a worktree).
- **Evidence crops — LOOKED at all five directly with the Read tool**, cross-checked word-for-word against
  the post-export `laws.json`:
  - `ampSpacing-docked-crop-native.png` — matches verbatim, no jargon.
  - `weaveDepth-docked-crop-native.png` — distinct from `ampSpacing`'s, names "Single wave row"/"Nested
    rows" — both confirmed as real, exact `STYLE_PARAMS.ampSpacing` option labels in
    `scripts/build-tone-laws.js:324-325`, not invented UI copy.
  - `interlockWeave-ctxbar-crop-native.png` — matches verbatim, preserves the counter-intuitive warning.
  - `penPitchMatch-ctxbar-crop-native.png` — `SIMULATED_NOTE` prefix + the byte-identical body, matches
    verbatim.
  - `shadow-row-docked-crop-native.png` — shows the "Duty Cycle · Constant" Fill Style row with an (i) icon
    and **no caveat paragraph** beneath it before the Shadows/Follow-light/Angle/Density controls resume —
    directly confirms Flag 5's finding by eye, independent of the implementer's own DOM-probe claim.
  - Also spot-checked `bundleSubNib.caveat` names "Bundle · Count" — confirmed against
    `scripts/build-tone-laws.js:72` (`bundleCount: 'Bundle · Count'`) — a real UI label.
- **`npm run test:ci` not run — my view.** The diff is confined to 2 config/data files + 1 test file, zero
  production render files, zero UI files (independently confirmed in §0). Every guard row the brief and the
  report name has now been independently reproduced by me with matching counts, and the byte-identity /
  mutation-kill checks above close the residual risk that a targeted-suite run could miss something a full
  suite would catch. Consistent with U7/U8's own precedent (both ACCEPTed on a comparably-scoped diff
  without `test:ci`), I consider the omission reasonable for this unit's shape. The orchestrator's call to
  make, per protocol — not mine to override.

## Verdict — per flag

| Flag | Verdict |
|---|---|
| 1 — 17-caveat count / 3 residue ids genuinely plain | **ACCEPT** |
| 2 — `measured` absence structural, non-vacuous test | **ACCEPT** |
| 3 — re-pins are claim-preserving copy re-pins | **ACCEPT** (non-blocking looseness note, not a defect) |
| 4 — 555/555 sum reconciled | **ACCEPT** (I closed the one gap in the report's own derivation: disjointness of rows 2/3 now positively shown, not just asserted) |
| 5 — shadow-row gap real, pre-existing, correctly out of scope | **ACCEPT** |
| 6 — collapse-file count re-run in the foreground myself | **ACCEPT** (117/117, 803.85s, matches; the >600s tool ceiling is a hard constraint, not a protocol deviation on either agent's part) |
| 7 — `penPitchMatch`/`penFacing` duplicate is correct, not a violation | **ACCEPT** |

**Overall: ACCEPT.** Every one of the seven review conditions holds under independent, adversarial
reproduction — including two deliberate mutation-kill probes (the `measured`-field leak and the
claim-dropped caveat) that both correctly turned the relevant guard red, and a from-scratch Playwright
capture against a freshly started dev server that reproduced the caveat text and the shadow-row gap without
relying on the implementer's own script or screenshots. No bar was hidden, no test was vacuous, no jargon
survived in the three untouched residue caveats, and the diff is provably confined to copy-only
config/data + test-file changes with zero rendered-pixel risk. One non-blocking follow-up: the two `.*`
survivor-side regexes at ~1176 and ~1380 are looser in the abstract than the old `/single-weight/` term
match (would match unrelated decoy prose containing "weight" and "varies"/"isn't constant" far apart) —
harmless today, worth tightening if these two caveats are rewritten again.

## Cleanup

`/private/tmp/claude-501/scratch-U7-2/` (both `pre`/`post` archives, `probe.mjs`, and the two capture PNGs)
removed. Dev server on port 8492 killed. No file inside `.claude/worktrees/fill-collapse-3` was created,
edited, stashed, or deleted at any point in this review.
