STATUS: DONE

# U5b-2/3 — plain-language caveat rewrite + generative effectiveLaw ↔ resolveToneLaw cross-check

**Lane:** fill-collapse-2 (worktree `.claude/worktrees/fill-collapse-2`, branch
`3d-scene/fill-collapse-2`, port 8482). Fresh implementer taking over an in-flight unit
whose previous implementer was killed by a rate limit (2026-09-06 20:02 EDT, per
`docs/3d-audit/STILL-OPEN.md` Incident 3).

**Base:** `47a5a755` (main, v1.3.99) → `49475ccd` (U5b fix) → `eea613fd` (orchestrator
WIP checkpoint, unverified) → **`1e681432`** (this unit's commit, verified + split).

## What this unit does

Two follow-ups from `docs/3d-audit/lane-reports/U5b-review.md` (flags 2 and 4), ruled to
run as one combined unit "U5b-2/3" on this lane before W-30b:

- **U5b-2**: rewrite the two folded-law caveat strings (`bundleDither`, `contFieldTouch`)
  from audit-report prose (raw RMS/R² numbers, "sphere·hatch" as a bare cell-name token,
  "negative result, kept as one") into plain end-user language, ≤2 sentences, naming the
  UI control the user can act on.
- **U5b-3**: a generative cross-check test proving `SCENE_FILL_STYLES.effectiveLaw`
  (config-file duplicate) and `Scene3D.Params.resolveToneLaw` (engine original) agree on
  every survivor × every descriptor-value combination (including missing/garbage values
  and the UNREPRESENTABLE ≥2-descriptor case), so the two hand-maintained implementations
  of the same rules 3/4 cannot silently drift — closing the gap the U5b reviewer had to
  verify by hand (45 combinations, fuzz-tested manually, not mechanically).

## State found at handoff, and what I verified

The checkpoint commit `eea613fd` (orchestrator WIP, marked "unverified... tests may be
red") already contained a complete, correct implementation:

- `docs/tone-laws/laws.json` — both `bundleDither.caveat` and `contFieldTouch.caveat`
  rewritten to plain language (matches the review's own proposed wording almost verbatim).
- `src/config/scene3d-tone-laws.js` — regenerated from `laws.json` (same two caveat
  fields, plus the `VERSION` content hash bumped to `1819221f2a80c42be1ede76b2e8cee274d4b392b`).
- `tests/unit/scene3d-tone-law-collapse.test.js` — +143 lines: a `U5b-2` describe block
  (jargon-absence regex, ≤2-sentence check, effectiveLaw round-trip) and a `U5b-3` describe
  block (the generative cross-product test + an explicit UNREPRESENTABLE-case test).

I verified, before touching anything:

1. **VERSION hash integrity.** `git hash-object docs/tone-laws/laws.json` =
   `1819221f2a80c42be1ede76b2e8cee274d4b392b`, exactly the committed `VERSION` string.
   Reran `node scripts/build-tone-laws.js` fresh and diffed the output against the
   committed `src/config/scene3d-tone-laws.js`: **byte-identical**, so the generated file
   has zero drift from its source.
2. **No duplicate copies of the old jargon left anywhere reachable.** Grepped the whole
   worktree for the old strings ("pass-count boundary made long-wave", "hatch-only law:
   on sphere"): the only remaining hits are inside `weaknesses`/`source` fields (a
   different, still-audit-facing field the review never asked to be rewritten) and in
   test/report *comments* describing the bug's history — never inside a `caveat` field,
   never inside displayed UI copy. `docs/tone-laws/README.md` (where the review said the
   measured numbers "already live") is untouched, confirmed via `git diff --stat`.
3. **Single-source design confirmed.** `SCENE_FILL_STYLES.note(id)` (`src/config/context-bar.js:354`)
   reads `entry(id).caveat` directly off the roster — no UI file hardcodes or duplicates
   caveat text. Both call sites (`src/ui/panels/scene3d-panel.js` docked panel,
   `src/ui/shell/context-bar.js` ctxbar flyout) route through `FS.note(FS.effectiveLaw(...))`
   exactly as U5b wired them — this unit changed no wiring, only roster data + tests.

## Orchestrator direction mid-task: split the U5b-3 test out of the collapse file

Mid-verification, the orchestrator flagged that `tests/unit/scene3d-tone-law-collapse.test.js`
is a documented three-way merge hazard (`docs/3d-audit/STILL-OPEN.md` line 199): main's
`e429cfc5` (chunked U0 rewrite, +49/-30), U9's `fc8b0fba` on `handoff-c2` (six assertions
rewritten at four locations), and this checkpoint's own +143 lines all touch the same file
concurrently. Direction: move the U5b-3 cross-check into a **new** file so it can be lifted
cleanly at rebase, and say which was done and why.

**Done.** Extracted the `U5b-3` describe block (lines 1038-1116 of the checkpoint's file)
into a new file, **`tests/unit/scene3d-fill-style-effective-law.test.js`** — it depends on
nothing else in the collapse file (only the shared `loadVecturaRuntime` helper, already
required at the top of both files), so the extraction is a pure cut-and-paste plus one
`require` line. Left `U5b-2` (the plain-language jargon/sentence-count tests) in the
collapse file: the orchestrator's direction named U5b-3 specifically, and U5b-2's tests are
small (3 tests, ~44 lines) and read naturally alongside the U4/U5 caveat-visibility-gap
blocks they're a direct follow-up to. The collapse file's remaining diff over `49475ccd` is
now `+44` (U5b-2 only, plus a 5-line pointer comment to the new file) instead of `+143`.

## RGR proof

**RED** (reproduced independently, not re-asserted from the previous implementer's claim):
ran the post-split `tests/unit/scene3d-fill-style-effective-law.test.js` against a stub
`SCENE_FILL_STYLES.effectiveLaw = (survivorId) => survivorId` (the exact "present but
wrong" shape the U5b reviewer used for their own mutation test) — the cross-product test
failed immediately on the very first survivor/combo checked:
`expected 'ladder' to be 'fineLadder'`. The narrower UNREPRESENTABLE-case test still passed
under the stub (its expected value happens to equal the bare survivor either way), but the
file as a whole is not vacuous — the cross-product test is the one doing the real work and
it fails hard under mutation. Reverted the stub; diffed `src/config/context-bar.js` against
its pre-mutation backup — byte-identical, confirmed clean.

**GREEN** (real worktree files, each guard file run individually in the foreground, no
`--pool` changes, no background/Monitor use for the test runs themselves — two of the long
files were auto-moved to background by the tool's own 120s command timeout, which I let run
to completion and read back rather than treating as an intentional background test run):

| File | Result |
|---|---|
| `tests/unit/scene3d-tone-law-collapse.test.js` | **59/59** (post-split; was 61/61 pre-split against the raw checkpoint, confirming the split moved exactly 2 tests and lost nothing) |
| `tests/unit/scene3d-fill-style-effective-law.test.js` (new file) | **2/2** |
| `tests/integration/scene3d-fill-style-picker.test.js` | **144/144** (unchanged count from U5b — confirms the `/moire/` and `/floods/` regex assertions on the two ctxbar-flyout U5b tests still match the new plain-language wording) |
| `tests/unit/scene3d-tone-laws-config.test.js` | **8/8** |
| `tests/unit/scene3d-faceted-tone-law.test.js` | **19/19** |
| `tests/unit/scene3d-tone-law-plumbing.test.js` | **5/5** |
| `tests/integration/stroke-fill-style-control.test.js` | **30/30** |

All runs exit code 0. Both long collapse-file runs (61/61 pre-split, 59/59 post-split) hit
the same benign `[vitest-worker]: Timeout calling "onTaskUpdate"` RPC warning the U5b
reviewer already documented as a machine-load artifact, not a real failure (exit code 0,
clean pass counts both times); machine was shared with several other live worktree
sessions throughout (confirmed via `ps aux` — other `fill-audit-a2`/`fill-audit-d2`/
`handoff-c2` vitest processes running concurrently), consistent with AGENT-PROTOCOL's
"machine is shared" note.

## Evidence — real running app, port 8482

Wrote a Playwright script (`chromium.launch()` → drive real UI → `browser.close()` +
`server.kill()`, single foreground run, no background/Monitor use) that:

1. Starts `node scripts/dev-server.js 8482` from this worktree.
2. Loads `http://127.0.0.1:8482/index.html`, waits for `window.Vectura`/`window.app.engine`.
3. For each of the two rewritten laws: calls `window.app.engine.addLayer('object3d')` (the
   same call the scene-tree "Add shape" action invokes — a fresh object3d leaf ships mapper
   `hatch`, toneLaw `ladder` by default per `ALGO_DEFAULTS.object3d` in
   `src/config/defaults.js`), `window.app.renderer.selectLayer(layer)`, and
   `window.app.ui.buildControls()` — the real selection + render path.
4. Clicks the real `.tab-btn[data-value="style"]` Style tab.
5. Sets the real "Fill Style" `<select>`'s `.value` to the survivor id (`bundleCount` /
   `contFieldSigmoid`) and dispatches a real `change` event — screenshots the baseline
   (sub-control still at default, no caveat expected).
6. Sets the real "Bundle mode" / "Field floor" sub-control `<select>`'s `.value` to the
   folded option (`dither` / `touch`) and dispatches a real `change` event — screenshots
   the full app plus a native-resolution crop of the caveat region.
7. Removes the layer, repeats for the second case.

`window.Vectura.APP_VERSION` reported `1.3.99`, matching this worktree's `package.json`
(no version bump — correct, worktrees cannot bump per protocol). `pageErrors: []` both
cases.

Evidence saved to **MAIN's** `docs/3d-audit/fill-audit/after/U5b-2/` (per this unit's
brief, not the worktree — deviates from U5b's own worktree-only precedent by instruction):

- `bundleCount-baseline-no-caveat.png` — full app, real sphere, docked Style tab, "Fill
  Style: Bundle · Count", "Bundle mode: Integer pass count" (default), no caveat paragraph.
  **LOOKED**: confirmed clean, no red caveat text anywhere in the panel.
- `bundleDither-full.png` + `bundleDither-crop-native.png` — same object, "Bundle mode:
  Dithered". **LOOKED** (native crop): reads exactly *"Dithered bundle mode can make
  repeating patterns (moiré) more visible than the default Count mode, not less. If you see
  new banding, switch back to Integer pass count."* — matches `BY_ID.bundleDither.caveat`
  verbatim, no RMS/R²/cell-name jargon, ≤2 sentences, names the actual UI values ("Count
  mode", "Integer pass count").
- `contFieldSigmoid-baseline-no-caveat.png` — same pattern for the second case, no caveat.
- `contFieldTouch-full.png` + `contFieldTouch-crop-native.png` — "Field floor: Ink-width
  floor". **LOOKED** (native crop): reads exactly *"On crosshatch fills, this floor setting
  floods the whole surface to solid black with no shading left. If your fill looks like a
  solid dark blob, try a different Field floor option."* — matches
  `BY_ID.contFieldTouch.caveat` verbatim, no jargon, ≤2 sentences, names "Field floor".
- `raw-capture-results.json` — script-emitted `textContent` + `getBoundingClientRect()` for
  both cases, `pageErrors: []`, version match confirmed.
- `report.json` — structured summary cross-referenced against the two cases.

Both crops show the real running app (real dark theme panel chrome, real select dropdowns,
real red warning-colour caveat paragraph directly under the sub-control row) — not a
synthetic DOM fixture.

## Files touched

Committed in the worktree at `1e681432` (on top of the checkpoint `eea613fd`, which already
carried the production + roster changes and is included in this unit's total diff since it
was unverified WIP, not a prior unit's finished commit):

- `docs/tone-laws/laws.json` — 2 `caveat` fields rewritten (from `eea613fd`, verified not
  re-touched).
- `src/config/scene3d-tone-laws.js` — regenerated (from `eea613fd`, verified byte-identical
  to a fresh rebuild).
- `tests/unit/scene3d-tone-law-collapse.test.js` — net `+44/-79` over `49475ccd` after this
  unit's split (U5b-2 tests kept, U5b-3 tests removed and a 5-line pointer comment added).
- `tests/unit/scene3d-fill-style-effective-law.test.js` — **new file**, the U5b-3 cross-check
  (87 lines, 2 tests).
- `docs/3d-audit/fill-audit/after/U5b-2/` — evidence (6 PNGs, `report.json`,
  `raw-capture-results.json`), written to **main** per this unit's brief.

No production/UI wiring files touched by me — `src/config/context-bar.js`,
`src/ui/panels/scene3d-panel.js`, `src/ui/shell/context-bar.js` are unchanged since U5b's
own `49475ccd` (verified via `git diff --stat 49475ccd..1e681432 -- src/`: empty).

## CHANGELOG line (not applied — orchestrator/merge owns CHANGELOG.md per shared-file rules)

> Improved: the Fill Style picker's caveat for Dithered bundle mode and Ink-width field
> floor now explains the effect in plain language (what you'll see, what to do about it)
> instead of raw measurement numbers.

## Bars changed

None. No numeric threshold, tolerance, count bar, or pinned fingerprint changed anywhere in
this unit's diff. The `SCENE3D_TONE_LAWS.VERSION` content hash changed (expected — it is a
drift detector keyed to `laws.json`'s git blob sha, not a test-pinned fingerprint; confirmed
no test anywhere asserts a literal `VERSION` value via
`grep -rn "SCENE3D_TONE_LAWS\.VERSION" tests/`).

## Open items / not done here

- **W-30b** stays QUEUED behind this unit on this lane, per `docs/3d-audit/STILL-OPEN.md`
  line 167/194 — not started, out of scope for U5b-2/3.
- The `ROUND2-BRIEFS.md` housekeeping correction (U5b's "Files ALLOWED" line should list
  `src/ui/shell/context-bar.js`) is still owed from the U5b review and was not this unit's
  job to apply.
- CHANGELOG.md itself was intentionally not edited (shared-file rule; line drafted above for
  the orchestrator/merge to apply).
