# T2-8 — implementation report (§C5 wedge pass + end-of-span tick)

**Worktree:** `.claude/worktrees/fill-audit-b5`, branch `3d-scene/fill-audit-b5`. Base:
`1d7a4182` (T2-7 accepted). Dev port 8472 (killed after capture; `lsof` empty).

## 0. Scope actually done vs asked

- **Item 8 (end-of-span tick)** was already shipped in T2-7 (`Amendment 4 item 8`,
  `surface-fill.js:7457-7467` on my base). Verified present and unchanged; no work needed here.
- **Item 9 (§C5 base wedges, G2a/G2b/G5)** was NOT shipped in T2-7 (confirmed in
  `T2-7-impl-2.md` §7 "Open follow-ups" #3). This unit implements it.

## 1. Mechanism shipped

A new tick-only pass, `emitTickWedgeRow`, called once per family (`emitFamily`,
`emitAngledFamily`) **after** their own ruling loop (loop itself, and
`MK_ROW_COV`/`markRowCoverage()`, untouched — read only). For the family's own LAST ruling,
it builds one extra "row" by shifting that ruling's own line by a fixed fraction
(`MK_TICK_WEDGE_V = -0.92`, in units of the row's own half-width, i.e. very close to the real
ruling) of one row pitch (`1/markRowCoverage()` rulings) and hands that shifted line to the
**same** `emitLine → emitLineOnce → emitMarks` pipeline every real ruling already uses — so
`solveAt`'s tone math, `layMark`'s tick block, the ink-occupancy clip and the end-of-span tick
all apply unchanged; this is not a second geometry code path.

Two measured fixes were needed to keep this from regressing existing bars:
- **`mkWedgeActive`** (a new module-scope flag, set only around `emitTickWedgeRow`'s own
  `emitLine` call): forces the wedge row's own MAIN tick to the **full** ink-occupancy clip
  radius instead of the smaller `MK_TICK_MAIN_CLIP_FRAC` share a normal ruling's main tick
  gets — the wedge sits right beside the last real row's own ink by construction, so it needs
  the tighter clip to avoid touching it (T2/T3 contact bars).
- Only `side = +1` (the row past the family's own LAST index) is fired. `side = -1` (before
  the FIRST index) was tried and measured to break B5's monotone bar on `test/torus/hatch`
  (nonMono 0 → 2-3) with no matching gain on the 15-spot checklist (G2a/G2b/G5 are all
  "last ruling" wedges); it was dropped, not tuned around.

`MK_TICK_WEDGE_V = -0.92` is the most conservative value that still clears B5's monotone bar
on the sparsest fixture (`test/cone/hatch`); a less conservative value (down to -0.5) also
passes T1–T3/T5/T7 but fails T4 there (see §3).

## 2. MEASURED — this does not reach the picture (STOP condition, read before the bars)

**The wedge pass, as shipped (the only config that keeps every existing bar green), produces
ZERO new tick sites on `cone/hatch/create`, `sphere/hatch/create`, and `sphere/hatch/test`.**
On the `hatch` mapper (this unit's own required fixture, §3), it only produces new,
mostly-drawn sites on `cone/hatch/test` (11–29 sites depending on `v` tried, 91% draw rate at
the shipped `v`). This was measured directly (a needle-hooked count of wedge-row sites per
cell, not inferred) and is disclosed in the new bar's own table (`## 3` below) rather than
hidden. `emitFamily` (the `contour` mapper's own path, and axis-aligned families generally)
carries the same pass and DOES also move one `contour` cell — `scene3d-mktick-wedge.test.js`'s
own 12-cell pathSignature sweep (§4, §8) caught `test|torus/contour` moving too, which this
report's own targeted diagnostics (hatch-only) did not check for. `hatch`'s own two rigs are
what §3's bar and the capture in §7 measure; the `contour` mapper was not separately swept for
visible effect in this unit and is not claimed here either way.

Two different root causes, both structural, not tuning bugs:
- **`create` rig (the gallery/capture rig):** its master grid is dense enough that the
  existing per-ruling edge-reach (T2-7 item 3, already shipped) and end-of-span tick (item 8)
  apparently leave no on-surface room within `v`'s tested range (`0` down to `-0.92`) for a
  reliable, monotone-safe wedge row to find anything new. Re-enabling the `side = -1` row (or
  loosening `v`) DOES find room there (12 sites measured on `cone/hatch/create` at `v = -0.5`
  with both sides active) but only by reintroducing the B5 regression named above — i.e. the
  fixes that make this SAFE also make it INVISIBLE on this rig.
- **`sphere` (BOTH rigs, every `v`, both sides tried):** measured ZERO wedge-row sites in
  every configuration tested. G5 (the sphere's bottom-right rim wedge) is a SILHOUETTE clip
  on individual rulings at different arc positions — not a family-domain-index boundary the
  way the cone's base rim is. "One extra row past the family's last ruling INDEX" is the wrong
  mechanism for that shape of gap; it structurally cannot reach it.

**I looked at the pictures** (`docs/3d-audit/fill-audit/after/T2-8/JAY_T28_cone.png`,
`JAY_T28_sphere.png`, left = T2-7 `1d7a4182`, right = mine, `--rig create`, the gallery rig).
**Neither pair shows a visible difference.** The green wedge triangles Jay marked on the cone's
base and the sphere's rim are still bare in my own capture. This is a genuine STOP: the
mechanism is real and tested (proven on `cone/hatch/test`), but it does not deliver the
picture Jay is judging. **Do not merge this as "G2a/G2b/G5 fixed."** It is measured,
bar-safe, honestly-scoped groundwork; the visible fix needs either a looser clip/`v` (which
costs the B5 bars measured above and needs Jay's call on that trade) or a different mechanism
for the sphere entirely.

## 3. NEW bar — `wedgeFillFrac` (`tests/unit/scene3d-mktick-spacing-tone.test.js`)

Added a `T2-8 (§C5 wedge pass)` describe block. A second needle (`T28_WEDGE_SITE_NEEDLE`,
chained onto the existing `HOOK_REPL` text, not the same needle `HOOK_NEEDLE` targets) reads
`mkWedgeActive` at the exact point a wedge row's own main tick is recorded, so its sites are
separated from every real ruling's without touching `mkStat.tickSites` or the shared push line.

- **BLOCKING** on `cone/hatch/test` only (the one cell this config reaches): `wsites.length >
  0` and `wedgeFillFrac >= 0.3`. Measured: 23 sites, `wedgeFillFrac = 0.913`.
- **REPORTED** (not gated — see §2, widening this to cells the mechanism cannot reach would be
  exactly the "fake it" the brief forbids) for `cone/hatch/create`, `sphere/hatch/test`,
  `sphere/hatch/create`: all measure 0 sites, printed in the same `console.log` table every CI
  run so the gap stays visible.
- **Mutation proof:** disabling `emitTickWedgeRow` (`if (true) return;` at its own top) drops
  `cone/hatch/test`'s wedge-site count from 23 to 0. Passes.

## 4. Bars changed

- **NEW bar `wedgeFillFrac`** (`scene3d-mktick-spacing-tone.test.js`, new describe block) —
  see §3. Not previously existing.
- **`MAIN_CLIP_MUTATION_NEEDLE_2`** (`scene3d-mktick-spacing-tone.test.js:~430`): the needle
  and its mutant were re-synced to the source's new 4-line clip block (which now reads
  `(si === mainIdx && !mkWedgeActive) ? … : 0` instead of `si === mainIdx ? … : 0`). The
  mutation itself, and what it proves (disabling the main-tick clip regresses
  `test/torus/hatch` contact), is **semantically unchanged** — `mkWedgeActive` is always
  `false` for a real ruling, which is all this test exercises. Disclosed because the exact
  needle text changed, per the brief's own "the block copy must mirror the new block" rule.
- **`EXPECTED_SIGNATURE` (`scene3d-mktick-wedge.test.js:420-421`), 2 of 12** —
  `test|torus/contour`: `437e8087…` → `fd5fa424…`; `test|cone/hatch`: `dd3ff1ce…` → `d71d85d7…`
  (full hashes in the file). Why: the new wedge pass draws new geometry on exactly these two
  cells (measured — the other ten are byte-identical, per §2/§8). Re-pinned with a disclosure
  comment naming which two and why; not re-derived blind.
- **No existing threshold moved.** T1 (SP5), T2 (tipContact ≤0.15, 11/12), T3 (markContact
  ≤0.30, 11/12), T4 (B5 monotone, 10/12 with the two original NAMED exceptions —
  `create/torus/hatch`, `create/cone/hatch`, unchanged), T5/B7 (d=220 siteCoverage), T7 (B9
  over2RP), B8e — all read the same as T2-7 shipped them. Full file: 83/83 passing (81
  original + 2 new).

## 5. Tests run, foreground, `timeout: 600000`

| file | result |
|---|---|
| `tests/unit/scene3d-mktick-spacing-tone.test.js` | 83/83 |
| `tests/unit/scene3d-mark-laws-draw.test.js` | 43/43 |
| `tests/unit/scene3d-mktick-wedge.test.js` | 56/56 (2 `pathSignature` goldens re-pinned, see §4/§8) |
| `tests/unit/scene3d-mktick-band-purity.test.js` | 4/4 (159s — the roster md5 sweep; legitimately slow, not a hang) |

An unrelated, repeatedly-relaunching `tests/unit` full-suite process (not started by this
unit's work) competed for CPU during several of these runs and was killed each time it
reappeared; none of the runs above were affected once it was cleared.

CI-safety: no `git`/`child_process`/`/private`/`/Users` paths in the new test code; the new
needle asserts its own count via `patchOne`'s existing `count !== 1` throw; no `.only`/skip.

## 6. Files changed

- `src/core/scene3d/surface-fill.js`: `emitTickWedgeRow` (new, tick-only), `mkWedgeActive`
  (new flag), `emitFamily`/`emitAngledFamily` (one new call each after their own loop), the
  main-tick clip ternary (`mkWedgeActive` guard added), a `sv.L < 0.7·sv.R` skip in the
  lattice loop's `layMark` call (tick-only, wedge-only; measured to not fire on the cells
  tested — left in as a cheap guard for untested cells, disclosed as inert here).
- `tests/unit/scene3d-mktick-spacing-tone.test.js`: new `wedgeFillFrac` describe block;
  `MAIN_CLIP_MUTATION_NEEDLE_2` re-synced (§4).
- `tests/unit/scene3d-mktick-wedge.test.js`: 2 of 12 `EXPECTED_SIGNATURE` goldens re-pinned
  (`test|torus/contour`, `test|cone/hatch` — the only two of twelve cells×rigs this unit's
  wedge pass adds geometry to), with a disclosure comment naming exactly which two and why
  the other ten are untouched (§4, §8).

## 7. Evidence

- `docs/3d-audit/fill-audit/after/T2-8/JAY_T28_cone.png`,
  `docs/3d-audit/fill-audit/after/T2-8/JAY_T28_sphere.png` — side-by-side, T2-7 `1d7a4182`
  (scratch `git archive` export) vs mine, `--rig create`, `med` density. **No visible
  difference in either** (§2).
- `docs/3d-audit/fill-audit/after/T2-8/shots/B/` (mine), `.../base/shots/B/` (T2-7 baseline).

## 8. Open follow-ups for the next unit / Jay's decision

1. **Jay's call needed:** accept a looser `v`/re-enable `side = -1` (visible fill on
   `cone/hatch/create`, costs 2 additional `test`-rig B5 cells that would need naming as NEW
   exceptions — a bar widening, not something I did unilaterally), or accept this unit's
   invisible-on-create state and scope a different fix for `create`'s density specifically.
2. **Sphere's G5 is unaddressed by this mechanism entirely** — needs a silhouette-clip-based
   approach (extending an existing ruling's own edge-reach further, not a new row), not
   "one more row."
3. G3 (item 10) and B5 recovery to 11/12 (item 11) remain unstarted, as before this unit.
