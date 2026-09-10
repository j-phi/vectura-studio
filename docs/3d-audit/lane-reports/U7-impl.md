STATUS: DONE

# U7 implementer report — fill-collapse-2 (C-07, `ampSpacing`/`nesting`)

- **Lane / worktree**: fill-collapse-2, `.claude/worktrees/fill-collapse-2` (port 8482)
- **Branch**: `3d-scene/fill-collapse-2`
- **Base sha**: `57aa71b2` (v1.3.99, W-30b)
- **Orchestrator checkpoint** (mid-task rate-limit kill, resumed from here): `bfe8fdb4` — "wip(3d-audit): U7
  checkpoint (unverified)" — contained my edits to `scripts/build-tone-laws.js`, `src/config/scene3d-tone-laws.js`,
  `tests/unit/scene3d-tone-law-collapse.test.js`, `tests/unit/scene3d-fill-style-effective-law.test.js`, all
  verified identical to my in-progress work (diffed `57aa71b2..bfe8fdb4`, exactly 4 files, matches what I had
  written before the kill).
- **Final sha**: `90f3411f` — one commit, adding the two guard-count bumps on top of the checkpoint.

## Roster / picker numbers

| | before | after |
|---|---|---|
| `IDS` (48-id engine vocabulary) | 48 | 48 (unchanged forever) |
| `PICKER_IDS` (picker options) | 35 | **34** |
| `ALIASES` | 13 | **14** |
| Picker total offered (`PICKER_IDS` + `'ladder'`) | 36 | **35** |

Survivor `ampSpacing` ← folded `weaveDepth` (param `nesting`: `single` default → `ampSpacing`, `nested` →
`weaveDepth`). Same mechanism U1→U5 ran five times (`48→35`, `18/18` md5-identical — see
`docs/3d-audit/lane-reports/U1-U5-impl.md`).

**U7 landed out of the plan's literal U6-then-U7 order.** U6 (`penStipple` mark-class) is `FROZEN-ON-JAY` (LEDGER.md
row 11 — needs Jay's product decision, not a file collision), so this brief ran U7 next. `EXPECTED_PICKER_IDS_LENGTH`
in `scene3d-tone-laws-config.test.js` moved `35 → 34` (not the plan's literal "U7 → 31" number, which assumed U6 had
already run).

## RGR proof

**RED** (verified via `git stash`, not assumed): stashed `scripts/build-tone-laws.js` +
`src/config/scene3d-tone-laws.js` back to their pre-U7 (`57aa71b2`) content and confirmed live: `PICKER_IDS.length`
35, `ALIASES.weaveDepth` `undefined`, `STYLE_PARAMS.ampSpacing` `undefined` — `resolveToneLaw({toneLaw:'ampSpacing',
nesting:'nested'})` would have returned `'ampSpacing'` unchanged (no descriptor), diverging from `weaveDepth`'s own
picture (3925.9 vs 3917.8 mm ink on torus+hatch+med per the plan's §1 table — within 0.2%, a genuinely tight pair).
Restored (`git stash pop`), re-confirmed `PICKER_IDS` 34 / `ALIASES` 14.

**GREEN**: `scripts/build-tone-laws.js` gained one `COLLAPSE` row (`ampSpacing: [{key:'nesting', ...}]`);
`node scripts/build-tone-laws.js` regenerated `src/config/scene3d-tone-laws.js` cleanly (no integrity-throw
failures — `ampSpacing` is a real roster id, unlike U1's `ladder` exception, so no `DEFAULT_LAW` special-case was
needed).

## The two secretary conditions this brief predates (both closed, per `docs/3d-audit/STILL-OPEN.md`)

### (a) The caveat ruling binds U7 — and this cluster is a NEW case the earlier ones never hit

Unlike every earlier survivor in this chain (U1–U5's `ladder`/`taperedEnds`/`weightModulated`/`bundleCount`/
`contFieldSigmoid` all had **no** caveat of their own — only their folded ids did), **both `ampSpacing` (survivor)
AND `weaveDepth` (folded) carry their own real, measured, DISTINCT caveats** (`docs/tone-laws/laws.json`):

- `ampSpacing`: *"Despite belonging to the wave family, it is not single-weight: it is registered in
  surface-fill.js's WEIGHT_LAWS list and splits per sample along the line (splitsAlongLine()), because stroke
  weight takes over wherever the spacing field bottoms out at the plot floor."*
- `weaveDepth`: *"Not single-weight: it appears in isWaveLaw()/WEIGHT_LAWS and splits per sample along the line,
  because stroke weight takes over wherever the spacing field bottoms at the (lowered) plot floor."*

Verified `FS.effectiveLaw`/`Params.resolveToneLaw` surface the RIGHT one of the two at each `nesting` state:
- `nesting:'single'` (default) → `ampSpacing` → **its own** caveat (not empty — a genuinely new UI state this chain
  had never produced before: U4/U5's survivors correctly showed NO caveat at default; U7's correctly shows a REAL
  one).
- `nesting:'nested'` → `weaveDepth` → its **distinct** caveat, not `ampSpacing`'s.

Extended the **shared** U5b-3 cross-check file, `tests/unit/scene3d-fill-style-effective-law.test.js` (not a private
test in the collapse file, per the secretary's explicit instruction — that file is the single pin for all three
`ALIASES`→sibling-key sites: `resolveToneLaw`, `effectiveLaw`, and W-10d-3's not-yet-landed `displayParams`), with a
new test asserting both states, both resolvers agreeing, and the two caveats being non-empty and distinct. Also
added a dedicated "U7 caveat" `describe` block in the collapse file itself for the local, cluster-specific proof.

**Live-verified** (see Evidence below): real running app screenshots show `ampSpacing`'s caveat at the default
`Nesting = Single wave row` state, and `weaveDepth`'s distinct caveat once `Nesting = Nested rows` is picked.

### (b) `ampSpacing` byte-identity, proven specifically (not inherited from the aggregate sweep)

F1-placement's ruled condition 4 (`docs/3d-audit/STILL-OPEN.md`, fill-audit-a2 lane) requires `ampSpacing` and the
rest of the WV6 family to render byte-identical — a live ruling on another lane depends on this exact law. Proved
two independent ways:

1. **In-tree resolver sweep** (real `algo.generate()`-captured opts, the same harness `scene3d-tone-law-dispatch`
   and the U0–U5 chain use, parametrized on primitive AND density — not the single sphere-only, density-60-only
   harness every earlier unit's `captureOpts` used): sphere/torus/cone × low/med/max fillDensity (9 combinations,
   `box`/`plane`/`solid` excluded — confirmed unreachable for `ampSpacing`/`weaveDepth` in
   `docs/3d-audit/fill-audit/manifest.B.unreachable.jsonl`). **9/9 byte-identical**, both for the bare survivor
   no-op (`ampSpacing` alone, unaffected by geometry/density) and for the fold
   (`ampSpacing`+`nesting:'nested'` === legacy `weaveDepth`, directly). Landed as a **permanent regression guard**
   in the collapse test file's new "U7 multi-primitive x multi-density" `describe` block.
2. **Cross-tree, real gallery-capture pipeline** (`scripts/audit/scene3d-capture.js` — a real headless-Chromium
   capture, not the jsdom unit-test harness): a scratch export of the true pre-U7 commit (`57aa71b2`, `git archive`
   + `node_modules` symlink, dev server on port 8483) vs the post-U7 checkpoint (`bfe8fdb4`, dev server on the real
   worktree, port 8482), same 18 cells (sphere/torus/cone × hatch × ampSpacing/weaveDepth × low/med/max, angle a).
   **18/18 md5-identical.**

**A stale-baseline pitfall caught and resolved during this unit**: the same 18 post-U7 cells, compared against the
committed `docs/3d-audit/fill-audit/shots/B/` gallery baseline, show several differences (torus at all 3 densities;
sphere/cone at `low` density only). I verified this is **pre-existing drift unrelated to U7**, not a regression:
running the identical capture against the TRUE pre-U7 commit (`57aa71b2`) also diverges from `shots/B/` on the
identical cells, identically to the post-U7 capture — the gallery baseline is stale relative to this branch's
current tip (v1.3.99, many commits past the v1.3.98 baseline the plan's §1 numbers were measured against), not
something this unit broke. Recorded in `docs/3d-audit/fill-audit/after/U7/report.json`'s
`byte_identity.note_on_stale_gallery_baseline`.

## Byte-identity — every folded id (the standard U1-U8 check)

1 folded id, `weaveDepth`, captured via
`node scripts/audit/scene3d-capture.js --tier B --root .claude/worktrees/fill-collapse-2 --port 8482 --only
'^(torus|sphere|cone)__hatch__(ampSpacing|weaveDepth)__(low|med|max)__a$' --out docs/3d-audit/fill-audit/after/U7`,
run from MAIN — 18 cells total (both survivor and folded id, 3 primitives × 3 densities, since condition (b)
required proving `ampSpacing` specifically beyond the single-cell pattern). All 18 are byte-identical between the
pre-U7 and post-U7 commits (method 2 above). I looked at `torus__hatch__ampSpacing__med__a` and
`torus__hatch__weaveDepth__med__a` directly (Read tool): both are a torus covered in a wavy zigzag/diamond
crosshatch lattice; `weaveDepth`'s rows are visibly denser/tighter than `ampSpacing`'s, matching the plan's own
cluster note ("weaveDepth's rows are ~1.4× denser") — genuinely two different pictures at the pixel level, the same
honesty distinction U1–U5 established for their own clusters (a picker-tier near-duplicate is not a rendering-tier
duplicate).

## Guard-test bumps (mandatory `## Bars changed` disclosure)

1. `tests/unit/scene3d-tone-laws-config.test.js:117` — `EXPECTED_PICKER_IDS_LENGTH` **35 → 34**; `:118-122` —
   `EXPECTED_ALIAS_IDS` gained `'weaveDepth'` (13 → 14 entries). Why: U7 folds one more id out of the picker.
2. `tests/integration/scene3d-fill-style-picker.test.js:398` (box-primitive dead-count bar) — **25 → 24**. Why:
   `weaveDepth` (a wave-family law, dead on a box exactly like its survivor `ampSpacing` — neither has a parametric
   chart on a faceted primitive) is removed from the offered options entirely once folded; `alive` (11, none of the
   9 mono laws or `ladder`/`none`) is unaffected. Re-measured directly, not assumed: ran the test unedited first,
   got `expected 24 to be 25` (real failure, not a `TypeError`), then applied the fix.

No other numeric threshold, tolerance, count bar, or pinned fingerprint changed anywhere in this unit's diff.

## Guards run (foreground, one/few files at a time, per AGENT-PROTOCOL — machine shared with several other live
worktree sessions throughout, confirmed via `ps aux`)

| Suite | Result |
|---|---|
| `tests/unit/scene3d-tone-law-collapse.test.js` (full file, twice — once mid-task before the rate-limit kill, once after resuming) | **73/73** both times |
| `tests/unit/scene3d-fill-style-effective-law.test.js` | **3/3** |
| `tests/unit/scene3d-tone-laws-config.test.js` | **8/8** |
| `tests/integration/scene3d-fill-style-picker.test.js` | **144/144** |
| `tests/unit/scene3d-tone-law-plumbing/params/dispatch/faceted-tone-law/solid-cap-reachability/one-pen-down-reachability` (batch) | **56/56** |
| `tests/integration/stroke-fill-style-control` + `scene3d-panel` + `scene3d-panel-style-live-sync` + `context-bar-scene-flyouts` + `tests/unit/scene3d-shadow-tone-law` + `scene3d-shadow-tone-law-uniqueness` (batch) | **134/134** |

**Total: 418/418 across every named guard, 0 failures.** All runs exit code 0; the usual benign
`[vitest-worker]: Timeout calling "onTaskUpdate"` RPC warning and `[FillBoolean] polygon union failed on degenerate
geometry` stderr noise fired on the heavy runs (matches every prior unit's report — pre-existing, unrelated to this
change).

`scene3d-shadow-tone-law-uniqueness.test.js` stays green here (not the U9-predicted growing-collision red state):
`src/core/scene3d/shadows.js` on this branch does not yet reference `Params.resolveToneLaw` — U9's fix lives on
`handoff-c2`, not merged here — but that test's `offeredLawIds()` only sweeps `PICKER_IDS` **survivors**
(`ampSpacing`, unaffected), never a raw folded id (`weaveDepth` is simply no longer offered), so U7 introduces no
new collision for it to catch. Confirmed by reading the test's own sweep logic, not assumed.

Preset exposure re-verified in this worktree: `grep -rl "toneLaw" user-presets/` → 0 files;
`grep -rlE "ampSpacing|weaveDepth" user-presets/ src/config/user-presets.js` → 0 files. `npm run user-presets:bundle`
not run (nothing to regenerate).

## Live verification (real running app, port 8482, dev server started/killed by me)

`window.Vectura.APP_VERSION` = `1.3.99`, matches this worktree's `package.json` (no bump — worktrees cannot bump per
protocol). `pageErrors: []` throughout. Used Playwright (`chromium.launch()`) per CLAUDE.md's chrome-devtools
singleton-browser guidance.

1. Added a scene3d layer via the real API (`app.engine.addLayer('scene3d')` → `getLayerDescendants` for the
   `object3d` child — the same pattern U1–U5's live verification used), set `style.params.toneLaw = 'ampSpacing'`,
   selected the layer, `app.ui.buildControls()`, clicked the real Style tab.
2. **Baseline** (`Nesting = Single wave row`, the default) —
   `docs/3d-audit/fill-audit/after/U7/ampSpacing-single-crop-native.png`. **LOOKED**: "Fill Style: Amplitude
   Spacing", "Nesting: Single wave row", and — unlike every earlier unit's baseline — a real red caveat paragraph
   IS present: *"Despite belonging to the wave family, it is not single-weight: it is registered in
   surface-fill.js's WEIGHT_LAWS list and splits per sample along the line (splitsAlongLine()), because stroke
   weight takes over wherever the spacing field bottoms out at the plot floor."* — matches `ampSpacing`'s own
   `laws.json` caveat verbatim.
3. **Folded** (`Nesting = Nested rows`) —
   `docs/3d-audit/fill-audit/after/U7/ampSpacing-nested-crop-native.png`. **LOOKED**: "Nesting: Nested rows", caveat
   now reads *"Not single-weight: it appears in isWaveLaw()/WEIGHT_LAWS and splits per sample along the line,
   because stroke weight takes over wherever the spacing field bottoms at the (lowered) plot floor."* —
   `weaveDepth`'s own, distinct caveat.
4. Picker list read directly off the live `<select>`: **35 options**, `ampSpacing` present, `weaveDepth` absent as
   its own row.
5. A saved-`.vectura` round trip (real `_serializeVecturaPayload`/`_applyVecturaPayload`) with `toneLaw:'weaveDepth'`
   was exercised; the resolved render path is already covered by the collapse test file's "a saved .vectura naming
   a folded toneLaw resolves through the real engine (sanitizeSceneParams) unchanged in effect" test (passing). The
   raw-bag **display** default (what the Nesting sub-control literally shows on a freshly-reopened raw-folded
   document, before the user touches the picker once) is the **same class of gap** U1-U5's own live verification
   found and flagged as **W-10d-3** (already planned, `docs/3d-audit/lane-reports/W-10d-3-plan.md`, HELD by this
   lane, "next" after W-30b/W-30c per the ledger) — not fixed here, correctly out of scope (W-10d-3's plan explicitly
   forbids touching `src/core/scene3d/params.js`, and this unit's brief is data-only).

## Files touched

`scripts/build-tone-laws.js` (+27), `src/config/scene3d-tone-laws.js` (regenerated, +26/-1),
`tests/unit/scene3d-tone-law-collapse.test.js` (+200 — U7 cluster block via `describeSingleParamCluster`, a
dedicated "U7 caveat" describe block, and a new "U7 multi-primitive x multi-density" describe block),
`tests/unit/scene3d-fill-style-effective-law.test.js` (+35 — U7 caveat-survival cross-check, appended to the
shared file, not a new private one), `tests/unit/scene3d-tone-laws-config.test.js` (bar bump),
`tests/integration/scene3d-fill-style-picker.test.js` (bar bump). `surface-fill.js`, `surface-fill-mono.js`,
`mappers.js`, `hlr.js`, `shadows.js`, `FILL_STYLE_MARK_OF`, any UI file — **never touched**, confirmed via
`git diff --stat 57aa71b2 HEAD`.

## Evidence

`docs/3d-audit/fill-audit/after/U7/report.json` (byte-identity methodology, both proofs, the stale-baseline
finding, caveat-survival verification, visual inspection notes) + `manifest.B.1-1.jsonl` + 18 `.webp` gallery cells
under `shots/B/` + 4 live-app screenshots (`ampSpacing-single-full.png`, `ampSpacing-single-crop-native.png`,
`ampSpacing-nested-full.png`, `ampSpacing-nested-crop-native.png`) + `raw-capture-results.json` — all written to
MAIN's `docs/3d-audit/fill-audit/after/U7/` per protocol, left uncommitted there (MAIN is shared scratch for
concurrent lanes' gallery output, matching every prior unit's precedent).

## Open items for the orchestrator / next session

1. **Caveat wording** — both `ampSpacing`'s and `weaveDepth`'s caveats are audit-report engineering jargon
   ("WEIGHT_LAWS", "isWaveLaw()", "splitsAlongLine()", "surface-fill.js") exactly like `bundleDither`/
   `contFieldTouch` were before U5b-2's plain-language rewrite. A "U7-2" analog is warranted (rewrite
   `docs/tone-laws/laws.json`'s two caveat fields to plain, ≤2-sentence, UI-control-naming language) but is out of
   scope for this data-only unit — flagged loudly, not fixed.
2. **U6 (`penStipple` mark-class)** remains `FROZEN-ON-JAY` — not attempted here, per LEDGER.md row 11.
3. **U8, U9** remain for future sessions/lanes, per the plan's own ordering.
4. **W-10d-3** (raw-folded-id display-default gap) is unaffected by this unit beyond adding `weaveDepth` to its
   affected-id set — already planned on this same lane, HELD, next after W-30b/W-30c per the ledger.
5. **CHANGELOG.md / plans.md / worklist.json / findings.json** — not edited here (shared-file rule; U8 owns the
   docs contract per the plan's §6, same as it did for U1-U5's C-05 wording correction). Draft CHANGELOG line for
   whoever applies it: *"Fill Style picker: 34 → ... options (roster total, cumulative with U1-U6). `ampSpacing`
   and `weaveDepth` (near-identical nested-wave textures, ink within 0.2%) now live behind one 'Nesting' control
   under Amplitude Spacing. Both render exactly as before — saved documents migrate automatically at load."*
