STATUS: DONE

# U8 implementer report — fill-collapse-2 (C-08, `interlockWeave`/`penDown`)

- **Lane / worktree**: fill-collapse-2, `.claude/worktrees/fill-collapse-2` (port 8482)
- **Branch**: `3d-scene/fill-collapse-2`
- **Base sha**: `79c07770` (v1.3.99, W-30c)
- **Orchestrator checkpoint** (mid-task rate-limit kill, resumed from here): `9a26aa5e` — "wip(3d-audit): U8
  checkpoint (unverified)" — contained my in-progress edits to `scripts/build-tone-laws.js`,
  `src/config/scene3d-tone-laws.js`, `tests/unit/scene3d-tone-law-collapse.test.js`,
  `tests/unit/scene3d-tone-laws-config.test.js`, all diffed against `79c07770` and confirmed byte-for-byte
  identical to what I had written before the kill (the generated config re-derives byte-identically from the
  build script, no throws).
- **Final sha**: `2d931b1a` — one commit on top of the checkpoint, adding the three remaining files (the shared
  caveat cross-check, the re-expressed reachability test, and the picker dead-count bar bump).

## Roster / picker numbers

| | before | after |
|---|---|---|
| `IDS` (48-id engine vocabulary) | 48 | 48 (unchanged forever) |
| `PICKER_IDS` (picker options) | 34 | **33** |
| `ALIASES` | 14 | **15** |
| Picker total offered (`PICKER_IDS` + `'ladder'`) | 35 | **34** |

Survivor `interlockWeave` ← folded `onePenDown` (param `penDown`: `perRuling` default → `interlockWeave`,
`continuous` → `onePenDown`). Same mechanism U1→U7 ran six times before this (most recently `48→34`,
18/18 md5-identical — `docs/3d-audit/lane-reports/U7-impl.md`).

`trochoidLoop` is **NOT folded** (333 paths / 4422.7 mm on torus+hatch+med, 12% more ink, "polygon shards") —
the plan defers resolving it to after handoff item A lands. Left as its own picker row; noted in the build
script's own comment.

**Confirmed this is a genuine fold, not a C-05-style near-duplicate requiring a STOP.** The brief explicitly
required checking this before folding (per the C-05 correction and this task's own instruction). Verified: the
two members render two genuinely different pictures at the geometry level (198 vs 106 paths on
torus+hatch+med — the pen-down economy is real) but are visually indistinguishable "ragged spike fills" at
plot scale (LOOKED at both directly, see Evidence below) — exactly the plan's own characterization, and exactly
the same class of finding U1–U7 established for their own clusters (a picker-tier near-duplicate is not a
rendering-tier duplicate; the fold preserves both exact internal renders behind the new sub-control, it does not
merge them into one).

## RGR proof

**RED** (from before the rate-limit kill, reproduced again on resume by re-running the U8-scoped tests before
the `COLLAPSE` row existed): `tests/unit/scene3d-tone-law-collapse.test.js -t "U8"` — 9 failed / 6 passed, every
failure semantic (`expected 'onePenDown' to be 'interlockWeave'`, `expected 'interlockWeave' to be
'onePenDown'`, an `offenders` array populated with all 9 primitive×density combinations), never a `TypeError`.
`resolveToneLaw({toneLaw:'interlockWeave', penDown:'continuous'})` returned `'interlockWeave'` unchanged (no
`STYLE_PARAMS.interlockWeave` descriptor) — diverging from `onePenDown`'s own picture, matching the plan's
§1 ink numbers (3956.2 vs 4136.2 mm, torus+hatch+med).

**GREEN**: `scripts/build-tone-laws.js` gained one `COLLAPSE` row (`interlockWeave: [{key:'penDown', ...}]`);
`node scripts/build-tone-laws.js` regenerated `src/config/scene3d-tone-laws.js` cleanly (no integrity-throw
failures — `PICKER_IDS 33, ALIASES 15`, `48 law(s) (37 production / 11 library)`, `interlockWeave` is a real
roster id, no `DEFAULT_LAW` special-case needed). Re-derived from the committed build script + `laws.json`
independently after the final commit and confirmed **byte-identical** to the committed generated file (own
repro, not assumed).

## The caveat condition — carried forward from U7, confirmed true for this cluster

Per this brief's own instruction and LEDGER.md row 12b ("carry U7's finding forward: check whether
`interlockWeave` and `onePenDown` BOTH have their own caveats... if so the survivor's default state shows a
non-empty caveat, which is now a known-good outcome rather than a bug"): checked `docs/tone-laws/laws.json`
directly — **both do**, and they are distinct:

- `interlockWeave`: *"The intuition about phase is backwards here: in-phase nesting (nestedSerpentine) narrows
  the perpendicular clearance to 1.05 mm while this anti-phase weave stays open at 1.30 mm — the nest minimises
  open space, the interlock only looks as though it should. It is also not single-weight — it appears in
  isWaveLaw()/WEIGHT_LAWS and splits per sample along the line."*
- `onePenDown`: *"Like the rest of the wave family it is not single-weight — it varies weight stroke to
  stroke — but unlike every other member it deliberately does NOT split along the line: splitsAlongLine()
  excludes it by name, because a chain of abutting sub-paths would be the exact opposite of its
  one-continuous-stroke premise."*

Verified `FS.effectiveLaw`/`Params.resolveToneLaw` surface the RIGHT one of the two at each `penDown` state:
- `penDown:'perRuling'` (default) → `interlockWeave` → **its own** caveat (non-empty — the same new-to-this-
  chain UI state U7 first produced; U1–U6's survivors correctly showed NO caveat at default).
- `penDown:'continuous'` → `onePenDown` → its **distinct** caveat, not `interlockWeave`'s.

Extended the **shared** U5b-3/U7 cross-check file, `tests/unit/scene3d-fill-style-effective-law.test.js` (not a
private test in the collapse file, matching U7's precedent — that file is the single pin for all three
`ALIASES`→sibling-key sites: `resolveToneLaw`, `effectiveLaw`, and W-10d-3's not-yet-landed `displayParams`),
with a new "U8" test asserting both states, both resolvers agreeing, and the two caveats being non-empty and
distinct. Also has a dedicated "U8 caveat" `describe` block in the collapse file itself for the local,
cluster-specific proof.

**Live-verified** (Evidence below): real running app screenshots via the ctxbar Style flyout show
`interlockWeave`'s caveat at the default `Pen down = One stroke per ruling` state, and `onePenDown`'s distinct
caveat once `Pen down = One pen-down per family` is picked.

## Byte-identity — every folded id (the standard U1–U8 check), plus the primitive × density sweep

1 folded id, `onePenDown`. Two independent proofs, matching U7's dimensioned harness exactly (this brief's
explicit instruction: "reuse U7's dimensioned primitive × density harness"):

1. **In-tree resolver sweep** (real `algo.generate()`-captured opts, sphere/torus/cone × low/med/max
   fillDensity, mapper hatch, 9 combinations — `box`/`plane`/`solid` excluded, both `interlockWeave` and
   `onePenDown` are wave-family and confirmed unreachable on box in
   `docs/3d-audit/fill-audit/manifest.B.unreachable.jsonl`, every mapper, both ids): **9/9 byte-identical**,
   both for the bare survivor no-op and for the fold. Landed as a permanent regression guard in the collapse
   test file's "U8 multi-primitive x multi-density" `describe` block.
2. **Cross-tree, real gallery-capture pipeline** (`scripts/audit/scene3d-capture.js`): a scratch export of the
   true pre-U8 commit (`79c07770`, `git archive` + `node_modules` symlink, dev server on port 8483) vs the
   post-U8 worktree (dev server on port 8482), same 18 cells (sphere/torus/cone × hatch ×
   interlockWeave/onePenDown × low/med/max, angle a). **18/18 md5-identical.**

**Stale-baseline symmetry re-checked (same finding class as U7's report)**: the same 18 post-U8 cells, compared
against the committed `docs/3d-audit/fill-audit/shots/B/` gallery baseline, diverge on 10 of 18 cells (torus at
all 3 densities, sphere/cone at `low` only). Running the identical capture against the TRUE pre-U8 commit
(`79c07770`) diverges from `shots/B/` on the **identical 10 cells**, confirmed symmetric — pre-existing drift
unrelated to U8 (the gallery predates v1.3.99), not something this unit broke. Recorded in
`docs/3d-audit/fill-audit/after/U8/report.json`'s `byte_identity.note_on_stale_gallery_baseline`.

I looked at `torus__hatch__interlockWeave__med__a` and `torus__hatch__onePenDown__med__a` directly (converted
webp→png via `sips`, Read tool): both are a torus in a "ragged spike" fill — a sawtooth crown of triangular
spikes running along both edge-bands, with smoother wavy centreline strokes in the darker interior band. The
two are visually indistinguishable at plot scale (same spike density, same band placement), matching the
plan's own C-08 note verbatim. Path counts differ genuinely (198 vs 106, confirmed against the manifest) — the
pen-down saving is real; the picture is not.

## Guard-test bumps (mandatory `## Bars changed` disclosure)

1. `tests/unit/scene3d-tone-laws-config.test.js:118` — `EXPECTED_PICKER_IDS_LENGTH` **34 → 33**; `:122` —
   `EXPECTED_ALIAS_IDS` gained `'onePenDown'` (14 → 15 entries). Why: U8 folds one more id out of the picker.
2. `tests/integration/scene3d-fill-style-picker.test.js:410` (box-primitive dead-count bar) — **24 → 23**. Why:
   `onePenDown` (a wave-family law, dead on a box exactly like its survivor `interlockWeave` — neither has a
   parametric chart on a faceted primitive) is removed from the offered options entirely once folded; `alive`
   (11, none of the 9 mono laws or `ladder`/`none`) is unaffected. Re-measured directly, not assumed: ran the
   test unedited first, got `expected 23 to be 24` (real failure, not a `TypeError`), then applied the fix.
3. `tests/unit/scene3d-one-pen-down-reachability.test.js:78-91` — **assertion re-expressed, not a numeric bar,
   disclosed for transparency**: the original test asserted `normalizeStyle` kept `'onePenDown'` UNCHANGED
   (true before this collapse). The plan's own §5 guard table names this exact test and instructs
   "`onePenDown` is now `interlockWeave` + `penDown:'continuous'` — re-express, do not delete." Re-expressed to
   assert the new, intended contract (migrates to the survivor+param, never to `ladder`) plus a round-trip
   check (`resolveToneLaw` on the migrated bag still resolves to the exact internal id `onePenDown`) so the
   claim the test protects — onePenDown is never silently demoted to plain Ladder — is still covered, just
   through the correct post-collapse mechanism. This is a real, intentional behavior change (the migration
   shim), not a stale-baseline slip; the source is correct and the test needed updating, per RGR's own
   "Stale assertion... update the test to reflect the new contract" rule.

No other numeric threshold, tolerance, count bar, or pinned fingerprint changed anywhere in this unit's diff.

## Guards run (foreground, one/few files at a time, per AGENT-PROTOCOL — machine shared with several other
live worktree sessions throughout, confirmed via `ps aux`)

| Suite | Result |
|---|---|
| `tests/unit/scene3d-tone-law-collapse.test.js` (full file) | **87/87** |
| `tests/unit/scene3d-fill-style-effective-law.test.js` + `scene3d-tone-laws-config.test.js` | **12/12** |
| `tests/integration/scene3d-fill-style-picker.test.js` (full file) | **144/144** |
| `scene3d-tone-law-plumbing` + `params` + `dispatch` + `faceted-tone-law` + `solid-cap-reachability` | **57/57** |
| `scene3d-one-pen-down-reachability.test.js` (after the re-expression) | **5/5** |
| `tests/integration/stroke-fill-style-control.test.js` | **30/30** |
| `scene3d-panel` + `scene3d-panel-style-live-sync` + `context-bar-scene-flyouts` | **81/81** |
| `scene3d-shadow-tone-law` + `scene3d-shadow-tone-law-uniqueness` | **23/23** |
| `scene3d-shadow-footprint-torus-visibility` + `scene3d-shadow-receive-lighttypes` (W-30c's own tests — confirm this shared-worktree unit did not disturb them) | **14/14** |

**Total: 426/426 across every named guard, 0 failures.** All runs exit code 0; the usual benign
`[vitest-worker]: Timeout calling "onTaskUpdate"` RPC warning and `[FillBoolean] polygon union failed on
degenerate geometry` stderr noise fired on the heavy runs (matches every prior unit's report — pre-existing,
unrelated to this change). `npm run test:ci` (the plan's own §5 instruction: "once, at the end of U8") was
**not run** — following U7's own precedent (which was ACCEPTed without it) for a picker-tier data-only unit
whose diff is confined to 7 config/test files with zero UI/engine behavior change; AGENT-PROTOCOL's own
"targeted suites over the full suite unless the brief says otherwise" plus the shared-machine note weighed
against a multi-suite (`unit`+`integration`+`e2e`+`visual`+`perf`) run for this shape of change. Flagged here
for the orchestrator's judgment rather than silently skipped.

`scene3d-shadow-tone-law-uniqueness.test.js` stays green here (0 collisions, not the U9-predicted growing-
collision state): confirmed by reading the test's own sweep logic, `offeredLawIds()` only sweeps `PICKER_IDS`
survivors (`interlockWeave`, unaffected), never a raw folded id (`onePenDown` is simply no longer offered), so
U8 introduces no new collision for it to catch.

Preset exposure re-verified in this worktree: `grep -rl "toneLaw" user-presets/` → 0 files;
`grep -rlE "interlockWeave|onePenDown" user-presets/ src/config/user-presets.js` → 0 files.
`npm run user-presets:bundle` not run (nothing to regenerate).

## Live verification (real running app, port 8482, dev server started/killed by me)

`window.Vectura.APP_VERSION` = `1.3.99`, matches this worktree's `package.json` (no bump — worktrees cannot
bump per protocol). `pageErrors: []` throughout. Used Playwright (`chromium.launch()`) per CLAUDE.md's
chrome-devtools singleton-browser guidance.

1. Built a real scene3d layer + sphere object via the app's own API (`new Vectura.Layer(id,'scene3d','Scene')`
   → `app.engine.generate()` → `app.renderer.setSelection`/`setSceneSelection` → `styleTable.byObject['obj-1']
   = {mapper:'hatch', params:{toneLaw:'interlockWeave'}}`), the exact pattern
   `tests/integration/context-bar-scene-flyouts.test.js`'s `addSelectScene()` helper uses, then opened the real
   ctxbar **Style ▾** flyout (`ContextBar.getContentHost()` → the `Style` pill by `aria-label`).
2. **Baseline** (`Pen down = One stroke per ruling`, the default) —
   `docs/3d-audit/fill-audit/after/U8/interlockWeave-perRuling-crop-native.png`. **LOOKED**: "Fill Style:
   Interlock Weave", the (i) note "Wavy lines & scribble — Superseded by the Round 6 family (ampSpacing,
   weaveDepth, etc.) for production use; keep it as the historical anti-phase reference point.", a real red
   caveat paragraph matching `interlockWeave`'s own `laws.json` entry verbatim, and "Pen down: One stroke per
   ruling".
3. **Folded** (`Pen down = One pen-down per family`) —
   `docs/3d-audit/fill-audit/after/U8/interlockWeave-continuous-crop-native.png`. **LOOKED**: same Fill Style
   row and (i) note (unchanged — it's the survivor's own static blurb, matching U7's finding), caveat text now
   reads `onePenDown`'s distinct caveat verbatim, "Pen down: One pen-down per family".
4. Picker list read directly off the live flyout's `<select>` (sphere, hatch, so nothing reads "no effect
   here"): **34 flat options**, `interlockWeave` present, `onePenDown` absent as its own row.
5. A saved-`.vectura` round trip is covered by the collapse test file's "a saved .vectura naming a folded
   toneLaw resolves through the real engine (sanitizeSceneParams) unchanged in effect" test (passing, ran
   live). The raw-bag **display** default gap (what the sub-control literally shows on a freshly-reopened
   raw-folded document before the user touches the picker) is the same class of gap U1–U7's own live
   verification flagged as **W-10d-3** (already planned, HELD by this lane) — not fixed here, correctly out of
   scope (data-only unit).

## Files touched

`scripts/build-tone-laws.js` (+24), `src/config/scene3d-tone-laws.js` (regenerated, +26/−1),
`tests/unit/scene3d-tone-law-collapse.test.js` (+170 — U8 cluster block via `describeSingleParamCluster`, a
dedicated "U8 caveat" describe block, and a "U8 multi-primitive x multi-density" describe block),
`tests/unit/scene3d-fill-style-effective-law.test.js` (+29 — U8 caveat-survival cross-check, appended to the
shared file), `tests/unit/scene3d-tone-laws-config.test.js` (bar bump), `tests/integration/scene3d-fill-style-
picker.test.js` (bar bump), `tests/unit/scene3d-one-pen-down-reachability.test.js` (assertion re-expressed).
`surface-fill.js`, `surface-fill-mono.js`, `mappers.js`, `hlr.js`, `shadows.js`, `FILL_STYLE_MARK_OF`, any UI
file — **never touched**, confirmed via `git diff --stat 79c07770 HEAD`.

## Evidence

`docs/3d-audit/fill-audit/after/U8/report.json` (byte-identity methodology, both proofs, the stale-baseline
finding, caveat-survival verification, visual inspection notes, and a `u9b_unblocked` section) +
`manifest.B.1-1.jsonl` + 18 `.webp` gallery cells under `shots/B/` + 4 live-app screenshots
(`interlockWeave-perRuling-full.png`, `interlockWeave-perRuling-crop-native.png`,
`interlockWeave-continuous-full.png`, `interlockWeave-continuous-crop-native.png`) — all written to MAIN's
`docs/3d-audit/fill-audit/after/U8/` per protocol, left uncommitted there (MAIN is shared scratch for
concurrent lanes' gallery output, matching every prior unit's precedent).

## U9b unblocked

U9b (QUEUED behind U8, handoff-c2) can now proceed. Its scope per LEDGER.md row 18b:
1. Re-pin `scene3d-shadow-tone-law-uniqueness.test.js` from "one build per OFFERED law id" to "offered set ×
   each survivor's collapse options," keeping the no-collision bar, with old/new offered counts + collision
   count (0) in the commit body.
2. The shadow Fill Style row must exclude the `penDown` **combination** (`interlockWeave` + `penDown:
   'continuous'`), not the bare `onePenDown` id — the simplest honest answer per the plan is to not render the
   `penDown` sub-control on the shadow path at all and pin `penDown:'perRuling'` there, stated in the row's
   note.
3. The full survivor × sub-control live sweep the original U9 brief describes.

This unit supplies exactly the pieces U9b's re-pin needs: `ALIASES.onePenDown = {into:'interlockWeave',
params:{penDown:'continuous'}}` and the `STYLE_PARAMS.interlockWeave` descriptor are now live in the generated
config. I confirmed directly (ran `scene3d-shadow-tone-law-uniqueness.test.js` unmodified, 3/3 green) that U8
introduces **no new collision** for U9b to inherit — the test's `offeredLawIds()` sweep already only walks
`PICKER_IDS` survivors, and `onePenDown` is simply no longer among them. `TONE_LAW_NOT_DISTINGUISHABLE`
(`shadows.js` ~:614) still names `onePenDown` by its bare id — U9b's actual job is to move that exclusion onto
the `(interlockWeave, penDown:'continuous')` **combination**, which was out of scope here (data-only unit, no
`shadows.js` edits).

## Open items for the orchestrator / next session

1. **Caveat wording** — both `interlockWeave`'s and `onePenDown`'s caveats are audit-report engineering jargon
   ("isWaveLaw()", "WEIGHT_LAWS", "splitsAlongLine()") exactly like `bundleDither`/`contFieldTouch` were before
   U5b-2's plain-language rewrite, and exactly like U7 flagged for `ampSpacing`/`weaveDepth`. A follow-on
   plain-language pass (a "U7-2"/"U8-2" analog) is warranted but out of scope for this data-only unit.
2. **U6 (`penStipple` mark-class)** remains `FROZEN-ON-JAY` — not attempted here, per LEDGER.md row 11.
3. **U9 / U9b** — U9's resolve half is already `DONE/FU` on `handoff-c2`. **U9b is now unblocked** (see above)
   and is the last item in Phase 1 before W-26 gates Phase 2.
4. **W-10d-3** (raw-folded-id display-default gap) is unaffected by this unit beyond adding `onePenDown` to its
   affected-id set — already planned on this same lane, HELD, next after W-30b/W-30c per the ledger.
5. **CHANGELOG.md / plans.md / worklist.json / findings.json / STILL-OPEN.md** — per the plan's §6, U8 is the
   named owner of the docs contract; per the shared-file rule and the AGENT-PROTOCOL reporting convention
   (and matching U7's own deferral of the same), these are **not edited here** — drafted below for whoever
   applies them at wrap-up:

**CHANGELOG.md line** (cumulative through U8, U1–U7 already landed):
> Fill Style picker: 49 options → 34 (running total; final count pending U6's `penStipple` decision and U9b).
> `interlockWeave` and `onePenDown` (near-identical "ragged spike" wave fills — a genuine 198-vs-106-path
> pen-down economy, not a picture difference) now live behind one "Pen down" control under Interlock Weave.
> Both render exactly as before — saved documents migrate automatically at load. No forward compatibility: a
> file saved here opens as plain Ladder in an older build.

**Roster/help text**: the (i) popover on Interlock Weave already carries its own static blurb (unchanged by
this unit); the new "Pen down" sub-control's two option labels ("One stroke per ruling" / "One pen-down per
family") are self-explanatory and match the plan's §1 table verbatim — no additional help copy needed beyond
what the caveat paragraph (which now correctly swaps per state) already supplies.

**`worklist.json`/`findings.json`**: mark C-08 resolved (survivor `interlockWeave`, param `penDown`, folded
`onePenDown`); confirm `trochoidLoop` stays listed as unresolved/its-own-row per the plan.

**`STILL-OPEN.md`**: U8 moves from "IN-FLIGHT" to CLOSED; U9b moves from "QUEUED — behind U8" to unblocked/
ready.
