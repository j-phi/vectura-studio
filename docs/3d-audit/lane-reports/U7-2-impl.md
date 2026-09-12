STATUS: DONE

# U7-2 implementer report — fill-collapse-3 (plain-language pass over every remaining folded fill-law caveat)

- **Lane / worktree**: fill-collapse-3, `.claude/worktrees/fill-collapse-3` (port 8482)
- **Branch**: `3d-scene/fill-collapse-3`
- **Base sha**: `2b189b5f` (v1.4.1, U9b + U6-2 already folded in)
- **Final sha**: committed at the end of this unit (see commit log; single commit, working
  tree clean before and after).

## What this unit does

U5b-2 rewrote 2 of the roster's caveats to plain language (`bundleDither`, `contFieldTouch`);
U6 rewrote a 3rd (`penStipple`, as part of the mark-class-move fix). U7 and U8's own reports
both flagged that every OTHER caveat their clusters touched (`ampSpacing`/`weaveDepth`,
`interlockWeave`/`onePenDown`, `penInterleave`/`penPitchMatch`/`penFacing`) was still raw
audit-report prose — full of `R2`/`L*` numbers, `mm` measurements, bare cell-name tokens
(`sphere·hatch`), and internal function/file names (`WEIGHT_LAWS`, `isWaveLaw()`,
`splitsAlongLine()`, `surface-fill.js`, `scene3d.js`) — and asked for a "U7-2" follow-up.

This unit is that follow-up, widened per its own brief to **every** caveat in the roster that
reaches a UI surface, not just the fold-cluster members U7/U8 flagged: **17** caveats
rewritten (of the 20 the roster ever had; 3 were already plain before this unit started).

## Every string changed — old -> new

All 17 rewrites are copy-only changes to `docs/tone-laws/laws.json`'s `caveat` field
(regenerated into `src/config/scene3d-tone-laws.js` via `node scripts/build-tone-laws.js`).
No production/UI wiring file was touched.

### `none` ("NO TONE" in laws.json)
- OLD: "It is the Stage 0 reference, not a tone law — it carries no tone at all."
- NEW: "This isn't a tone law at all — it's the plain reference with no shading step applied."

### `deepFillTSP`
- OLD: "This is a CONTROL/REFUTATION on this fixture: its poor overall numbers are a fixture
  artefact because it only acts in the darkest 15% of the tone range, which this scene, at
  this sun angle, barely reaches."
- NEW: "This option only shades the very darkest part of the form. If your scene has little
  deep shadow (a shallow sun angle, a light setup), it can look like it isn't doing anything —
  that's expected, not a bug."

### `bundleSubNib`
- OLD: "The reported darkest L* 4.5 is optimistic: correcting for the 0.55-nib overlap, the
  geometry gives L* about 21.6, not 4.5 — still the deepest black in the set, but not what the
  table prints. It floods 78% of gated samples on sphere·hatch (sub-nib steps laying ink on
  ink)."
- NEW: "On a curved surface this can flood large areas to solid black, because its closely
  stacked passes lay ink on top of ink — try Bundle · Count if that happens. It still reaches
  the deepest black of any Fill Style option, just not quite as deep as its own numbers
  suggest."

### `penInterleave`
- OLD: "Three pens are SIMULATED, not expressible: penId is carried per style group in
  scene3d.js, not per run, so no real plot could name three nibs within one fill — read every
  number with that in mind."
- NEW: "A real plot would need three separate pen passes to reproduce this fill exactly —
  treat any per-nib detail in its numbers as illustrative, not a literal plotting
  instruction." *(Note: `SCENE_FILL_STYLES.SIMULATED_NOTE`, unchanged, auto-prepends "Simulated
  — 3 nib widths on one pen layer." to every threePen-family caveat, so the redundant restatement
  of "simulated" the original carried was dropped here — the prefix already says it.)*

### `penReserve`
- OLD: "It is a crosshatch law, not a hatch law — it composes a second family by construction,
  so its numbers are not directly comparable to the single-direction laws. Three pens are also
  SIMULATED, not expressible: penId is per style group, not per run."
- NEW: "This is a crosshatch fill: it always adds a second crossing pass, so it looks and
  costs differently than the single-direction Fill Style options."

### `penCross`
- OLD: "It never uses its fine nib — 0 paths at the 0.87x multiplier on all five cells — so a
  law specified with three nibs emits only two. It is also a crosshatch law, not a hatch law,
  and its three pens are simulated, not expressible (penId is per style group, not per run)."
- NEW: "Despite being described as three nib widths, its finest nib never actually draws —
  only two widths appear. It's also a crosshatch fill: it always adds a second crossing pass,
  rather than drawing in a single direction."

### `penPitchMatch`
- OLD: "Three pens are SIMULATED, not expressible: penId is carried per style group, not per
  run."
- NEW: "Like the other Pen options, this fill's three nib widths are simulated on one pen
  layer — a real plot would need three separate pen passes to reproduce them exactly."

### `penFacing`
- OLD: (byte-identical to `penPitchMatch`'s old text) "Three pens are SIMULATED, not
  expressible: penId is carried per style group, not per run."
- NEW: (byte-identical to `penPitchMatch`'s new text, deliberately — U6's report flagged this
  as a real, harmless measured duplicate, not a defect) "Like the other Pen options, this
  fill's three nib widths are simulated on one pen layer — a real plot would need three
  separate pen passes to reproduce them exactly."

### `ampSpacing`
- OLD: "Despite belonging to the wave family, it is not single-weight: it is registered in
  surface-fill.js's WEIGHT_LAWS list and splits per sample along the line (splitsAlongLine()),
  because stroke weight takes over wherever the spacing field bottoms out at the plot floor."
- NEW: "This line's weight isn't constant along its length — it thickens and thins as it goes.
  That happens because wherever the wave spacing gets too tight to draw cleanly, weight takes
  over to keep carrying the shading."

### `weaveDepth`
- OLD: "Not single-weight: it appears in isWaveLaw()/WEIGHT_LAWS and splits per sample along
  the line, because stroke weight takes over wherever the spacing field bottoms at the
  (lowered) plot floor."
- NEW: "Like Single wave row, this line's weight varies along its length rather than staying
  constant. Choosing Nested rows tightens the spacing further, so weight takes over sooner to
  keep the shading going." *(Kept DISTINCT from `ampSpacing`'s own text and names the two
  actual UI option labels — "Single wave row" / "Nested rows" — per the U7 caveat ruling.)*

### `interlockWeave`
- OLD: "The intuition about phase is backwards here: in-phase nesting (nestedSerpentine)
  narrows the perpendicular clearance to 1.05 mm while this anti-phase weave stays open at
  1.30 mm — the nest minimises open space, the interlock only looks as though it should. It
  is also not single-weight — it appears in isWaveLaw()/WEIGHT_LAWS and splits per sample
  along the line."
- NEW: "Despite its name, this weave doesn't pack lines tightly — it leaves more open space
  between them than you might expect from an interlocking pattern. Its line weight also
  varies along its length rather than staying constant." *(Preserves the "counter-intuitive"
  warning strength of the original — the plain text still says the opposite of what the name
  implies. Deliberately does NOT reference `nestedSerpentine`, which is not a selectable
  picker option — referencing it would have pointed the user at a control that doesn't
  exist.)*

### `trochoidLoop`
- OLD: "Like the rest of the wave family it is width-varying, not single-weight — it appears
  in isWaveLaw()/splitsAlongLine(), so stroke weight still takes over wherever the loop's own
  spacing bottoms at the floor."
- NEW: "Like the other Wavy lines & scribble options, this line's weight varies along its
  length rather than staying constant, thickening wherever the loop's own spacing gets too
  tight to draw cleanly."

### `amplitudeOnly`
- OLD: "A CONTROL/REFUTATION, not a production law: it proves amplitude is not a tone channel
  (R2 0.005), which is why every other Round 6 wave law splits tone onto the spacing field and
  keeps amplitude as a texture only."
- NEW: "This option exists to show that wave amplitude alone can't create visible shading —
  that's why every other Wavy lines & scribble option controls tone through line spacing
  instead, and only uses amplitude for texture. Expect little to no shading effect from this
  one."

### `onePenDown`
- OLD: "Like the rest of the wave family it is not single-weight — it varies weight stroke to
  stroke — but unlike every other member it deliberately does NOT split along the line:
  splitsAlongLine() excludes it by name, because a chain of abutting sub-paths would be the
  exact opposite of its one-continuous-stroke premise."
- NEW: "Like One stroke per ruling, this line's weight varies — but stroke to stroke, not
  gradually along each line. Unlike that option, it deliberately keeps every line as one
  unbroken stroke, since breaking it up would defeat the point of drawing it in a single
  pen-down." *(Kept DISTINCT from `interlockWeave`'s own text, names the sibling UI option
  label "One stroke per ruling" verbatim, per the U8 caveat ruling.)*

### `mezzoRegion`
- OLD: "One 3.2 mm bare spot survives on superellipsoid, where a region boundary lands on the
  chart seam. It is the only mezzoRegion cell over 2.3 mm and it is not the white-gap defect
  the monoline fix closed — superellipsoid's unreachable area is 0.00%."
- NEW: "On a Superellipsoid shape, a small blank spot can appear where a region boundary lines
  up with a seam in the form. It's a rare, minor gap — not the larger white-gap issue that's
  already been fixed elsewhere." *("Superellipsoid" is a real, selectable primitive shape
  label in this app's own UI — kept as legitimate vocabulary, not audit jargon.)*

### `dutyConst`
- OLD: "Its widest bare gaps — 4.5 mm on sphere, 3.9 mm on capsule, 2.6 mm on ellipsoid — are
  the highlight dots, not holes. At low duty the mark shortens until it is a pen-down dot, so
  open paper between dots in the light is the duty cycle doing its job. Read the widest-bare-
  gap row for this law as mark spacing."
- NEW: "The open paper you see in highlight areas is intentional — marks shrink down to dots
  there, so the gaps between them are the shading effect working as designed, not a defect."
  *(Dropped "Read the widest-bare-gap row..." — that sentence addresses an auditor reading a
  measurement report, not a user of the picker; no user-facing meaning was lost.)*

### `endShorten`
- OLD: "Its 21.6-30.7% bare interior area, and bare gaps up to 19.2 mm, are the mechanism and
  not a defect: the law shades by pulling each ruling's ends back from the silhouette, so bare
  paper at the ends is exactly what it is for. It is also the one mono law that produces real,
  deliberate free ends. Do not read either figure as the white gap the monoline fix closed."
- NEW: "The open paper you see near the edges of the form is intentional — this option shades
  by pulling each line's ends back from the outline, so blank space there is the effect
  working as designed, not a defect."

## Rule (2) — the `measured` field (evidence preserved, never rendered)

Every one of the 17 rewritten `laws.json` entries gained a new sibling field,
`"measured": "<the exact original caveat text>"`, added immediately after `"caveat"`.
`scripts/build-tone-laws.js`'s `BY_ID[id] = {...}` object literal (the only place that reads
`laws.json` into the generated, UI-facing `src/config/scene3d-tone-laws.js`) does **not** list
`measured` among the fields it copies — verified directly: `grep -c '"measured"'
src/config/scene3d-tone-laws.js` returns `0` after a fresh regenerate, and a new test
(`tests/unit/scene3d-tone-law-collapse.test.js`, "U7-2" describe block) pins both facts (the
field exists and holds the original text in the source, and the generated file never contains
the string `"measured"` at all).

## RGR proof

**RED** (verified via `git stash` before implementing, reproduced against the pre-unit tree):
stashed the three changed files back to `2b189b5f` and confirmed live —
`FS.note('ampSpacing').caveat` still read the `surface-fill.js`/`WEIGHT_LAWS`/
`splitsAlongLine()` jargon text, `FS.note('bundleSubNib').caveat` still carried the raw `L*
4.5`/`78%`/`sphere·hatch` numbers, and the same for all 15 others. The new "U7-2 (plain-
language pass over every remaining caveat)" describe block's jargon-absence test failed
against this stashed tree (every rewritten id matched the jargon regex). Restored (`git stash
pop`), re-confirmed clean.

**GREEN**: `docs/tone-laws/laws.json`'s 17 `caveat` fields rewritten (+ 17 new `measured`
fields); `node scripts/build-tone-laws.js` regenerated `src/config/scene3d-tone-laws.js`
cleanly (deterministic — re-ran a second time and diffed against the first regeneration:
byte-identical, confirming the build script is still a pure function of `laws.json`).

## Bars changed (mandatory disclosure)

1. `tests/unit/scene3d-tone-law-collapse.test.js` ~1173-1174 (the U7 "ampSpacing and
   weaveDepth each carry their own non-empty, DISTINCT caveat" test) — the pinned
   `expect(...).toMatch(/single-weight/)` assertions on both `survivorCaveat` and
   `foldedCaveat` re-pinned to `/weight.*(?:isn't constant|varies)/` and
   `/weight (?:varies|isn't constant)/` respectively. **Why**: the internal term
   "single-weight" was deliberately removed from both caveats by this unit's plain-language
   rewrite; the re-pinned regex checks the same underlying claim (the line's weight is not
   constant) in the new wording. This is a **copy re-pin**, not a bar change — the test still
   proves the same fact (both caveats say the weight varies) against the new text.
2. `tests/unit/scene3d-tone-law-collapse.test.js` ~1374-1375 (the U8 "interlockWeave and
   onePenDown each carry their own non-empty, DISTINCT caveat" test) — same re-pin, same
   reason: `/single-weight/` -> `/weight.*varies/` (survivor) and `/weight varies/` (folded).

No numeric threshold, tolerance, count bar, or pinned fingerprint changed anywhere in this
unit's diff. No other test asserted a substring inside any of the 17 rewritten caveats beyond
non-emptiness/distinctness (checked via `grep -rn "toMatch(/.*\/)" tests/ | grep -i caveat`
across the whole `tests/` tree before starting).

## Guards run (foreground; `tests/unit/scene3d-tone-law-collapse.test.js` needed
`--pool=forks --poolOptions.forks.singleFork=true` after the default pool exceeded the tool's
foreground timeout — the same shape every prior unit in this chain hit; let it run to
completion in the background and read the result back rather than treating it as an
intentional background test run, per U5b-2/U6's own precedent)

| Suite | Result |
|---|---|
| `tests/unit/scene3d-tone-law-collapse.test.js` (full file, singleFork) | **117/117** |
| `tests/unit/scene3d-tone-law-collapse.test.js -t "U7-2"` (new block, targeted) | **6/6** |
| `tests/unit/scene3d-tone-law-collapse.test.js -t "U7 caveat\|U8 caveat\|U6 caveat\|U5b-2"` (re-pinned + sibling caveat blocks) | **15/15** |
| `tests/unit/scene3d-fill-style-effective-law.test.js` | **7/7** |
| `tests/unit/scene3d-tone-laws-config.test.js` | **8/8** |
| `tests/integration/scene3d-fill-style-picker.test.js` (full file) | **170/170** |
| `scene3d-shadow-tone-law` + `scene3d-shadow-tone-law-uniqueness` + `scene3d-one-pen-down-reachability` | **40/40** |
| `stroke-fill-style-control` + `scene3d-panel` + `context-bar-scene-flyouts` | **107/107** |
| `scene3d-panel-style-live-sync` + `scene3d-faceted-tone-law` + `scene3d-solid-cap-reachability` + `scene3d-tone-law-dispatch` + `scene3d-tone-law-plumbing` | **47/47** |
| `scene3d-ribbon-weightscale-invariant` (unit) + `scene3d-ribbon-weightscale` (integration) | **59/59** |

**Total: 555/555 across every named guard, 0 failures.** All runs exit code 0; the usual
benign `[vitest-worker]: Timeout calling "onTaskUpdate"` RPC warning and `[FillBoolean]
polygon union failed on degenerate geometry` stderr noise fired on the heavy runs (matches
every prior unit's report — pre-existing, unrelated to this change).

`npm run test:ci` was **not** run, following U7/U8's own precedent (both ACCEPTed without it)
for a copy-only unit whose diff is confined to 2 config/data files + 1 test file with zero
UI/engine behavior change — AGENT-PROTOCOL's "targeted suites over the full suite unless the
brief says otherwise" weighed against a multi-suite run for this shape of change. Flagged here
for the orchestrator's judgment rather than silently skipped.

Preset exposure re-checked in this worktree: `grep -rl "toneLaw" user-presets/` -> 0 files.

## Byte-identity (rule 3 — `SF.buildObject` output, copy only)

No production/render file was touched: `git status --short -- . ':!graphify-out'` shows only
`docs/tone-laws/laws.json`, `src/config/scene3d-tone-laws.js`, and
`tests/unit/scene3d-tone-law-collapse.test.js`. Confirmed directly that `caveat` text is never
read by any rendering code: `grep -rn "\.caveat\b"` across `src/core/algorithms/`,
`src/core/scene3d/` finds zero hits inside geometry-producing functions (the only two live
`.caveat` readers in the whole app are the two UI display call sites,
`src/ui/panels/scene3d-panel.js:747` and `src/ui/shell/context-bar.js:1621`, both of which
render the value as text and never feed it back into `SF.buildObject`/`algo.generate`). The
existing U0-U8 byte-identity guard blocks inside `scene3d-tone-law-collapse.test.js` (which
directly compare `SF.buildObject` output across every survivor/fold pair, multiple primitives
and densities) all stayed green in the full-file 117/117 run above — a structural proof that
this unit's diff cannot have moved a single rendered pixel, on top of the direct code-read
proof.

## Live verification (real running app, port 8482, dev server started/killed by me)

`window.Vectura.APP_VERSION` = `1.4.1`, matches this worktree's `package.json` (no bump —
worktrees cannot bump per protocol). `pageErrors: []` throughout. Used Playwright
(`chromium.launch()`) per CLAUDE.md's chrome-devtools singleton-browser guidance (a scratch
script, run and then deleted — not part of this unit's diff).

Five representative caveats, across three surfaces, each with a native-resolution element
crop (`locator.screenshot()`) saved to **MAIN's**
`docs/3d-audit/fill-audit/after/U7-2/` (report.json alongside):

1. **`ampSpacing`, docked Style tab** (`ampSpacing-docked-crop-native.png`) — object3d LEAF
   selected via `app.engine.addLayer('scene3d')` -> child, `style.params.toneLaw =
   'ampSpacing'`, Style tab clicked. **LOOKED**: real red warning-colour paragraph, exact text
   "This line's weight isn't constant along its length — it thickens and thins as it goes.
   That happens because wherever the wave spacing gets too tight to draw cleanly, weight
   takes over to keep carrying the shading." — matches `laws.json` verbatim, no jargon.
2. **`weaveDepth`, docked Style tab** (`weaveDepth-docked-crop-native.png`) — same leaf, `style
   .params.nesting = 'nested'`. **LOOKED**: distinct text from `ampSpacing`'s, names "Single
   wave row"/"Nested rows" — matches verbatim.
3. **`interlockWeave`, ctxbar Style flyout** (`interlockWeave-ctxbar-crop-native.png`) —
   monolith scene3d form (matching `context-bar-scene-flyouts.test.js`'s `addSelectScene()`
   pattern), real ctxbar Style pill clicked. **LOOKED**: "Despite its name, this weave doesn't
   pack lines tightly..." — matches verbatim, preserves the counter-intuitive warning.
4. **`penPitchMatch`, ctxbar Style flyout** (`penPitchMatch-ctxbar-crop-native.png`) — same
   monolith form, `penMode: 'pitchMatch'`. **LOOKED**: `SIMULATED_NOTE` prefix + the new plain
   text, byte-identical to `penFacing`'s own (confirmed deliberate, matching U6's finding).
5. **`dutyConst`, shadow row** (`shadow-row-docked-crop-native.png`) — GROUP layer selected,
   `shadow.shadowToneLaw = 'dutyConst'`, the docked panel's "Shadow" section (`.vs3-shadow`).
   **LOOKED and FOUND A REAL, PRE-EXISTING GAP**: the shadow row's own Fill Style picker
   (showing "Duty Cycle · Constant") renders an (i) info icon but **no standalone caveat
   paragraph at all** — confirmed both by a live DOM probe (`hasStandaloneCaveatElement:
   false`) and by a direct source read: only two call sites in the entire app render
   `.is-caveat` (the docked object Style tab, `scene3d-panel.js:750`, and the ctxbar Style
   flyout, `context-bar.js:1622`) — the shadow row (both the docked "Shadow" section and the
   ctxbar Shadow flyout) has never had one. This means a user picking `dutyConst` (or any
   other caveat-bearing law) as a **shadow** tone law today cannot see its warning without
   opening the (i) popover and reading past the mechanism/strengths text to "Weaknesses:" — a
   real caveat-visibility gap, structurally identical in spirit to the one U5b fixed for the
   Style row's sub-controls, but on a different surface. **Not fixed here** — adding a caveat
   render call to the shadow row would be a rendering/behavior change, explicitly forbidden by
   this unit's copy-only scope. Flagged loudly as an open item below.

## Files touched

`docs/tone-laws/laws.json` (+34/-17 — 17 `caveat` fields rewritten, 17 new `measured` fields
added), `src/config/scene3d-tone-laws.js` (regenerated, +18/-18), `tests/unit/scene3d-tone-
law-collapse.test.js` (+136/-2 — 2 re-pinned assertions inside the existing U7/U8 caveat
blocks, plus a new "U7-2" describe block with 6 tests: jargon-absence, sentence-count,
`measured`-field archival + never-renders, cross-cluster distinctness survival, UI-label
references, and BY_ID-vs-`FS.note()` agreement). No production/UI wiring file touched —
`src/config/context-bar.js`, `src/ui/panels/scene3d-panel.js`, `src/ui/shell/context-bar.js`
are byte-identical to `2b189b5f` (confirmed via `git diff --stat 2b189b5f HEAD -- src/ui
src/config/context-bar.js`: empty).

## Evidence

`docs/3d-audit/fill-audit/after/U7-2/report.json` (byte-identity methodology, the `measured`
field proof, all 5 live-verification findings including the shadow-row gap) + 5 full-page PNGs
+ 5 native-resolution element-crop PNGs + `raw-capture-results.json` — all written to **MAIN's**
`docs/3d-audit/fill-audit/after/U7-2/` per protocol, left uncommitted there (MAIN is shared
scratch for concurrent lanes' gallery output, matching every prior unit's precedent). No
`shots/B/` gallery cells captured — this unit changes no rendered geometry, so the
`scene3d-capture.js` byte-identity pipeline (used by U1-U8 for their fold-cluster proofs) does
not apply; the direct code-read + existing byte-identity guard blocks are this unit's
equivalent proof (see "Byte-identity" above).

## Docs contract (not edited here — shared-file rule, matching every prior unit's precedent)

**CHANGELOG.md line** (drafted for whoever applies it):

> Fill Style picker: rewrote every remaining audit-report caveat (`ampSpacing`, `weaveDepth`,
> `interlockWeave`, `onePenDown`, `penInterleave`, `penReserve`, `penCross`, `penPitchMatch`,
> `penFacing`, `deepFillTSP`, `bundleSubNib`, `trochoidLoop`, `amplitudeOnly`, `mezzoRegion`,
> `dutyConst`, `endShorten`, No Tone) into plain language — what you'll see and what to do
> about it, no metric names, no numbers, no function/file names. The original measured text is
> preserved in `docs/tone-laws/laws.json`'s new `measured` field for audit reference; it never
> renders.

## Open items for the orchestrator / next session

1. **Shadow row caveat-visibility gap** (found during this unit's live verification, item 5
   above) — the shadow row's Fill Style picker (both the docked panel's "Shadow" section and
   the ctxbar Shadow flyout) has never rendered a standalone caveat paragraph, only the (i)
   popover. A follow-on unit adding `caveatLine`/`flyNote(...).classList.add('is-caveat')` to
   the shadow row's render path (mirroring the existing Style-row code exactly, reading
   `FS.note(shadowInfoLaw).caveat` which is already computed there but discarded) would close
   it. Out of scope here (rendering change, forbidden by this unit's copy-only remit).
2. **`mechanism`/`strengths`/`weaknesses`** ((i) popover text) remain raw audit prose for all
   48 laws — established out of scope by four consecutive ACCEPTed units now (U5b-2, U7, U8,
   U6, and this one); a further plain-language pass on those would be a materially larger,
   separately-scoped effort (144 fields vs. this unit's 17).
3. **CHANGELOG.md / plans.md / worklist.json / findings.json / STILL-OPEN.md** — not edited
   here (shared-file rule); draft line above.
