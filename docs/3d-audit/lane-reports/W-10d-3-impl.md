STATUS: DONE

# W-10d-3 — implementation report

**Lane:** fill-audit-2 (`.claude/worktrees/fill-audit-2`, branch `3d-scene/fill-audit-2`, port 8476).
**Base:** `a5812496` (W-28b). **Checkpoint:** `4ca6a507` (orchestrator WIP checkpoint after a
mid-guard-run rate-limit kill — content-identical to the final commit, see below).
**Final commit:** `66d9092d` — empty diff on top of `4ca6a507` (that checkpoint already held the
complete, tested fix; this commit only replaces its `wip(...)/unverified` message with the full
RGR/evidence record the protocol requires — no `git commit --amend`, no rewritten history).
**Plan:** `docs/3d-audit/lane-reports/W-10d-3-plan.md`, Rank 1 (RECOMMENDED).

## What was wrong

The docked Style tab and the ctxbar Style flyout showed the descriptor **default** for a collapse
sub-control (e.g. "Bundle mode", "Rung detail", "Field floor") whenever the layer's stored `toneLaw`
was still a **raw folded id** — the exact shape a `.vectura` saved before the U1→U5 collapse carries,
and the shape any live-composed `object3d`/`booleanGroup3d` leaf carries too (that type is never
migrated at load — `engine.js:422` runs only `migrateScene`, not `normalizeStyle`). The **canvas was
already correct** — `Params.normalizeParams` runs inside `algo.generate` (`scene3d.js:1191`) — only
the UI's displayed value lied, because `normalizeStyle`'s U0 migration shim (`params.js:833`)
reconstructs the sibling collapse key onto a **throw-away compose-time copy** the panel and ctxbar
never see; both surfaces read the live layer bag directly.

## Fix (Rank 1 — UI-only display seed, no write-back)

- `src/config/context-bar.js` — new `SCENE_FILL_STYLES.displayParams(rawValue, paramsBag)`. Seeds
  `ALIASES[rawValue].params` onto a shallow copy of the bag, `=== undefined` precedence only (an
  explicit stored key — including `null` — always wins). Returns the **same object reference** when
  `rawValue` is not a folded id, so every reachable picker state today is a provable no-op, and stays
  one once W-10d-2 (or any future write-back) migrates the bag.
- `src/ui/panels/scene3d-panel.js:694` — `fillStyleControls`'s `styleParamBag` now reads
  `FS.displayParams(o.value, o.paramsBag || {})`. Read-only; every write (`o.write`/
  `o.writeStyleParams`) still targets the untouched live bag.
- `src/ui/shell/context-bar.js:~1607` — `buildStyleBody`'s `styleParams(law).forEach` loop and its
  `mixed:` sceneAgree closure both read `FS.displayParams(...)`; the write source (`params`, used in
  `write({ params: { ...params, ... } })`) is untouched.

No engine, algorithm, or renderer file was touched. `src/core/scene3d/params.js` was **not** needed
(and not edited) — Rank 1 was prototyped without it in the plan and confirmed here.

## RGR proof

**RED** — 9 new integration tests appended to
`tests/integration/scene3d-fill-style-picker.test.js` (measured failing at `4ca6a507`'s pre-fix
equivalent, i.e. base `a5812496` plus only the test additions):

| # | Test | Pre-fix | Post-fix |
|---|---|---|---|
| R1 | docked LEAF, raw `fineLadder`, Rung detail | `'coarse'` (FAIL) | `'fine'` |
| R1g | same, Fill Style row (over-fix guard) | `'ladder'` (pass) | `'ladder'` (unchanged) |
| R2 | docked LEAF, raw `bundleDither`, Bundle mode | `'count'` (FAIL) | `'dither'` |
| R3 | ctxbar flyout, real tree child, raw `contFieldTouch`, Field floor | `'plot'` (FAIL) | `'touch'` |
| R3g | same, Field metric (over-fix guard) | `'screen'` (pass) | `'screen'` (unchanged) |
| R4 | save→open round trip, docked Bundle mode | `'count'` (FAIL) | `'dither'` |
| R5 | canvas-vs-UI anchor, `resolveToneLaw` on the assembled bag | `'bundleDither'` (pass) | `'bundleDither'` (unchanged) |

New file `tests/unit/scene3d-fill-style-display-params.test.js` (3 tests):
- **G1** — all 13 `ALIASES` entries: the seeded display value, read back through its descriptor's
  `options[].law`, agrees with the **independent oracle** `Params.resolveToneLaw(Params.normalizeStyle(...).params)`
  — pre-fix: `TypeError: FS.displayParams is not a function` (symbol didn't exist yet, expected for a
  brand-new function under TDD, not a value mismatch — this is the initial RED, distinct from the
  mutation-test RED below). Post-fix: 13/13 agree.
- **G2** — `ALIASES`/`STYLE_PARAMS` structural integrity (every alias key is a declared descriptor,
  every seeded value a real option). Passed pre-fix (pure config, no code needed) — kept as a guard.
- **G3** — no-op identity: every `PICKER_IDS` survivor, plus `undefined`/`''`/`'__garbage__'`, returns
  the **same object reference**.

Written so it can be **folded into fill-collapse-2's U5b-3 cross-check file**
(`tests/unit/scene3d-fill-style-effective-law.test.js`, commit `1e681432`, unmerged at the time this
unit landed) at integration — same independent-oracle shape, same reason for living in its own file
(`tests/unit/scene3d-tone-law-collapse.test.js` is a documented three-way merge hazard). This is the
secretary's condition on this unit; noted, not merged, by this implementer.

**GREEN**
- `tests/integration/scene3d-fill-style-picker.test.js`: **149/149** (140 baseline + 9 new).
- `tests/unit/scene3d-fill-style-display-params.test.js`: **3/3**.
- Combined single run: **152/152**.

**Mutation check (plan §3.3)** — stubbed `SCENE_FILL_STYLES.displayParams = (raw, bag) => bag`
(present-but-inert, the exact "same shape, wrong content" bug class the cross-check hunts for).
Result: **R1, R2, R3, R4, G1 all re-failed on real value assertions**
(`expected 'plot' to be 'touch'`, `expected undefined to be truthy` for G1's option lookup — never a
`TypeError`/`is not a function`). **R3g, R5, G2, G3 correctly stayed green** — G3's identity check
passes trivially under this stub (`(raw, bag) => bag` *is* the identity function), which is exactly
why G1's independent-oracle check exists and is documented as such in the test file's own comment.
Reverted: `git diff` **0 lines** back to the fix.

## Guards (foreground, one file at a time, per AGENT-PROTOCOL.md)

| Suite | Result |
|---|---|
| `tests/integration/stroke-fill-style-control.test.js` | 30/30 |
| `tests/unit/scene3d-tone-laws-config.test.js` | 8/8 |
| `tests/unit/scene3d-faceted-tone-law.test.js` | 19/19 (1 vitest-worker RPC timeout warning, transient/machine-load, all 19 assertions passed — not a test failure) |
| `tests/unit/scene3d-tone-law-plumbing.test.js` | 5/5 |
| `tests/unit/scene3d-tone-law-collapse.test.js` | **54/54** (not edited; ~458 s wall, allowed per the plan's own measured runtime note. It reports 54, not the plan's stated "56" — the file's own test count today, not a bar this unit moved) |

## Bars changed

**None.** No tolerance, count bar, or pinned fingerprint touched.

## Byte-identity (UI-only unit — proved, not asserted)

1. **Tier-A gallery cell** `box__hatch__ladder__low__a` (confirmed present in
   `docs/3d-audit/fill-audit/manifest.A.1-1.jsonl` / `shots/A/` before naming it) — re-shot from this
   lane worktree (port 8476, post-fix): md5 `35369c77553170a1ee2969569ef63980`, **identical** to
   main's existing gallery shot. General smoke test unrelated to `bundleDither`/`contFieldTouch`
   specifically — proves the 3-file config/UI patch didn't disturb the shared render path at all.
2. **Bespoke §5 scene canvas crop** (sphere/hatch/`bundleDither`, built via
   `engine.addLayer('scene3d')` → `exportState` → `importState`, so the shot is of a **reopened
   document**): captured **before** (scratch `git archive` export of `a5812496`, port 18476) and
   **after** (this lane, port 8476) — md5 `a1b3470e382f42b319440f14c154ba26` on both. **Identical, and
   expected**: this unit touches no engine/algorithm/renderer file, and the render already resolved
   `bundleDither` correctly pre-fix (R5 pins it).

Note on process: an incidental `node scripts/audit/scene3d-capture.js --help` (checking usage before
building the byte-identity re-shoot command) silently ran the tool's default full Tier-A job instead
of printing help — the same known trap the ledger already recorded for two prior lanes. No harm:
every shot came back `skip (exists)`, nothing was written or modified (`git status` on `docs/3d-audit`
showed no new/changed shot or manifest files from this run), and it self-terminated (~576 pre-existing
cells, all skip). Flagging for the same script-ergonomics follow-up the ledger already tracks
(unrecognized flags should exit non-zero, not run the default job).

## Evidence (real running app, port 8476, own Playwright server start/kill)

Written to `docs/3d-audit/fill-audit/after/W-10d-3/` (this MAIN checkout): `report.json` plus
before/after PNGs for the docked Style tab, the ctxbar Style flyout, the `contFieldTouch` over-fix
guard, and the canvas — all built through the plan's exact §5 scene/reopen recipe.

**What was seen, looking at the crops directly:**
- **Docked Style tab** (`before-docked-crop.png` / `after-docked-crop.png`): before — "Fill Style:
  Bundle · Count", "Bundle mo...: Integer pass count" (wrong). After — Fill Style unchanged, "Bundle
  mo...: Dithered" (correct — matches the canvas).
- **ctxbar Style flyout** (`before-ctxbar-crop.png` / `after-ctxbar-crop.png`): identical transition,
  same row layout/copy as the docked panel, confirming both surfaces now read the same seeded bag.
  Caveat row absent in both before and after (U5b's `effectiveLaw` is unmerged on this lane — expected,
  not a regression; see plan §2 vs U5b and stop condition 6, which does not fire here).
- **contField over-fix guard** (`before-contfield-crop.png` / `after-contfield-crop.png`): "Field
  metric" stays "Screen metric" in both; "Field floor" moves "Plot floor" → "Ink-width floor". Visual
  confirmation that only the alias's own descriptor moved.
- **Canvas** (`before-canvas.png` / `after-canvas.png`): sphere with the dithered-bundle hatch banding
  visible, selection gizmo overlaid (object selected for the panel shot). Pixel/byte-identical
  before/after (md5 match, above).

## Open follow-ups (recorded, not fixed here — per plan §2 stop boundaries)

- **W-10d-3b** (filed by the plan, not this implementer): the shadow tone-law row is a separate,
  structurally out-of-reach bag (U9's "two mechanisms, not one path" boundary) — it shows `Ladder` for
  a stored `fineLadder` while `shadows.js:2713` renders `fineLadder`'s own recipe. One-key display
  question on a one-key bag; **not touched here**, and no shadow surface file was edited.
- The caveat-loss flag from the U1→U5 chain (`bundleDither`/`contFieldTouch` render correctly but no
  caveat shows anywhere) is **U5b's** job, not this unit's — this fix composes with it for free once
  merged (plan §2, "vs. U5b's effectiveLaw shim"), verified structurally here (the seeded
  `styleParamBag` is exactly what `FS.effectiveLaw(law, styleParamBag)` would need) but not
  independently re-simulated in this run since U5b is not on this lane's branch.

## CHANGELOG line (for the docs-contract owner — not applied to CHANGELOG.md by this implementer)

> Fixed: the Style tab and context-bar Style flyout now show the correct value for a fill-style
> sub-control (e.g. Bundle mode, Rung detail, Field floor) when the stored fill law predates the
> tone-law roster collapse — the canvas always rendered correctly; only the picker's own display was
> stale.

## Files touched

- `src/config/context-bar.js` — `+28` (`SCENE_FILL_STYLES.displayParams`)
- `src/ui/panels/scene3d-panel.js` — `~7` (one read-site line + comment)
- `src/ui/shell/context-bar.js` — `~13` (loop + mixed closure read-site + comment)
- `tests/integration/scene3d-fill-style-picker.test.js` — `+110` (R1/R1g/R2/R4/R5, R3/R3g)
- `tests/unit/scene3d-fill-style-display-params.test.js` — new file, `+113` (G1/G2/G3)
- `docs/3d-audit/fill-audit/after/W-10d-3/` — evidence (this MAIN checkout, uncommitted per protocol
  until wrap-up)
