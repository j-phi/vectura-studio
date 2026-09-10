STATUS: DONE/FU

# Gallery rebuild — round 2 (orchestrator wrap-up)

Ran on `main` at `9cf09b39` (v1.4.1, clean tree at start), capture server port **8490**, per
`docs/3d-audit/fill-audit-handoff.md` §"Read this first" item 1 and `LEDGER.md`'s MERGE CHECKLIST item 18.
No `src/`, `tests/` or `index.html`(app) edits. No commit made (orchestrator commits).

## 1. Capture-script patch (W-32 Rank 1)

`scripts/audit/scene3d-capture.js` — the object rig now seeds each gallery object from the
**app's real creation defaults**, not the deserialization defaults, matching
`docs/3d-audit/lane-reports/W-32-W-33-plan.md` §A6 Rank 1 exactly:

```js
// buildAndMeasure(), in-page bag build:
const bag = {
  ...(P.PRIMITIVE_PARAM_DEFAULTS[item.primitive] || {}),
  ...(legacyDetail ? {} : (P.PRIMITIVE_CREATE_DEFAULTS[item.primitive] || {})),
};
```

Verified this is the same seed the app itself uses: `engine.setObjectPrimitive` / the panel's Add
shelf / `renderer.js`'s primitive swap all call `Scene3D.Params.buildPrimitiveParams`, which seeds
purely from `PRIMITIVE_CREATE_DEFAULTS` (`params.js:428`, `const base = PRIMITIVE_CREATE_DEFAULTS[primitive]`).
`PRIMITIVE_CREATE_DEFAULTS` carries the identical 12-key set as `PRIMITIVE_PARAM_DEFAULTS` for every
gallery primitive, so the overlay is a full replacement, not a partial patch. New `detail` values now
rendered: sphere 16→**28**, capsule 16→**22**, cone/cylinder 16→**24**, torus/ellipsoid/superellipsoid
16→**24/26/24**, torusKnot 20→**28**, pyramid stays **8** (unchanged — its perimeter wants a multiple of
4). Kept a `--legacy-detail` opt-out (CLI flag → `consts.legacyDetail` → threaded through `page.evaluate`)
for A/B comparison; trivial, ~3 lines. `node -c` syntax-checked; no other capture-script logic touched
(reachability, camera, crop, manifest format all untouched).

**Before deleting anything**, confirmed the capture script's resumability ("skip if `.webp` exists")
would have kept the STALE detail-16 renders under their identical filenames — so `shots/` (373 MB,
gitignored/untracked) and all `manifest.A.*` / `manifest.B.*.jsonl` (tracked) were deleted first to
force a full re-shoot, not a partial one. Also dropped a stray `manifest.A.1-50.jsonl` (a leftover
12-line shard-1/50 test run, superseded by the full run) rather than carrying it forward.

## 2. Full Tier A + Tier B capture

Ran from `--root /Users/jayphi/Documents/github/vectura-studio`, port 8490, into
`docs/3d-audit/fill-audit`, foreground, one shard at a time (Tier A full 1/1, Tier B in 5 shards
matching the prior sharding scheme):

- **Tier A: 576/576 `ok`**, 0 errors/timeouts.
- **Tier B: 2904 `ok` + 1084 `unreachable` = 3988** (primitive×mapper×style triples tested: 4×8×49=1568;
  1568−484 unreachable... i.e. 484 reachable triples × 6 (density×angle) = 2904).
- **Total shots this round: 576 + 2904 = 3480**, all `status:"ok"`, `appVersion` **"1.4.1"** confirmed
  by direct read of every manifest line (`{'1.4.1'}` as the only value set, both tiers).

**Cell count does NOT match the stale "7440" figure quoted in the brief (576 + 6864 previously), and
that discrepancy is real and explained, not a capture bug.** The previously-committed manifests
(the ones just deleted) carry `appVersion: "1.3.98"` — confirmed by reading the pre-rebuild committed
copies via `git show HEAD:...` — i.e. they predate not just round 2 but round 1's own base
(`fs-e1`/W-03's `CURVED_SPIRAL_STIPPLE_INERT` expansion, already in `main` well before round 2, plus
whatever round-2 landed on top). `isReachableOn` reachability does not depend on the primitive's
params bag at all (confirmed by reading `context-bar.js:539` — args are `id, primitiveMode, solidType,
mapper, totalFaces`, no dimensions/detail), so my Rank-1 patch cannot be the cause. Roster size is
unchanged (48 engine-vocabulary tone laws + `ladder`, confirmed live: "fill-style roster 49"). The
drop from 1144 to 484 reachable triples is the accumulated effect of every reachability-narrowing fix
that landed between v1.3.98 and v1.4.1 on the same file this gallery already historically depended on.
This is exactly why the task calls the pre-existing gallery "stale" and orders one final rebuild — the
fresh 3480-cell count is the correct, current figure and should replace 7440 as the reference number
going forward.

## 3. W-28b re-shoot (taller listbox)

`scripts/audit/w28b-face-count-threshold-evidence.js` (already relocated under `scripts/audit/`, per
checklist item 19 — no further move needed) — changed the capture-only listbox size from
`Math.min(el.options.length, 16)` to `el.options.length` (uncapped), so the panel screenshot grows to
the full listbox height instead of clipping at 16 rows. The 9 rows that flip between case A (12-face
import, fast path) and case B (80-face import, cap-limited) are scattered at indices 12, 15–17, 27,
32–35 of the (now) 34-option roster — a size-16 cap only ever showed `End Shorten` (index 12); the
other 8 sit below the fold. Ran the script (own dev server, port 8476, self-managed): both PNGs now
1394px (collapsed) / **2362px (expanded, up from a shorter capped height)**, all 34 rows visible with
no scroll. **Looked at both expanded PNGs directly**: `End Shorten`, `Mezzotint Region`, `ETF Direction
Field (Kang)`, `Defect Split`, `Duty Cycle Constant` all read white/enabled in case A and
greyed/"no effect here" in case B — the flip is now fully visible in the evidence, not just one row.
Re-running against the live v1.4.1 app also picked up the option-count shift **36 → 34** (the U7/U8
roster-fold side effect STILL-OPEN.md already flags) — `report.json`'s `optionCount`/`disabledCount`
fields updated accordingly (case A: 36→34 options, 25→23 disabled; case B likewise), `enabledCount`
unchanged at 11/2.

**Scope note on "the two known-stale evidence dirs":** `LEDGER.md`'s own MERGE CHECKLIST item 18 names
exactly two re-shoots folding into this rebuild — W-32's creation-defaults re-shoot (item 1/2 above)
and W-28b's taller-listbox re-shoot (this section) — and both are done. Mid-session, `STILL-OPEN.md`
and `fill-audit-handoff.md` were edited concurrently (by the orchestrator, not by me — see §6) to add a
**third**, differently-scoped note: "**W-30c's two torus 'after' frames** — W-30d landed after them on
the same lane and re-opens the ring's hole" are also stale. I did **not** re-shoot these: `after/W-30c/`
is a bespoke shadow/ground-plane evidence bundle (`footprintShapes`/`areaPenumbra`/`multilight` stats,
no `before`/`after` arrays) captured by its own dedicated script, not by `scene3d-capture.js` or the
gallery's before/after pairing mechanism (confirmed: its `report.json` has no `id`/`before`/`after`
fields, so it renders as an empty untitled card in the Before/After tab and contributes 0 pairs — it
never touches the 27-WARN list below). It is unrelated to the Gallery/Findings/Before-After pipeline
this task's 6 numbered steps cover, I was given no script reference for it, and it wasn't named in
either `LEDGER.md`'s gallery item or my brief's numbered steps — **left open, flagged for the
orchestrator**, not silently done or silently skipped.

## 4. Three-script assemble pipeline

Ran in order, all idempotent (re-ran `scene3d-before-after.js` twice to confirm reproducibility):
1. `scene3d-assemble.js` → wrote `index.html`.
2. `scene3d-audit-findings.js` → injected 22 defects, 13 clusters, 24 work items (unchanged from the
   historical findings.json — its "7440 shots"/"v1.3.98" text is frozen prose from the original
   evaluator run and is a separate, out-of-scope correction owed elsewhere per `LEDGER.md` item 17b).
3. `scene3d-before-after.js` → 62 items (2 malformed: `T2-pre`, `U1-U5` — both directories with no
   `report.json` at all, pre-existing, not touched this round), 251 image pairs, 33 byte-identical
   pairs, **27 WARN (unexplained byte-identical)**.

### WARN list — every one, with root cause

| # | card | cell | explained in report.json? |
|---|---|---|---|
| 1–3 | **A3** | torus·contour·ladder·max/med·a, torus·hatch·ladder·max·a | **No formal exception**, but the card's own `notes` prose explains it directly: this unit is test-only (no `src/` change), so byte-identical renders are the *intended* result — the 4 re-shot cells are all `ladder` (mapper-style) renders with `ribbonLaw:false` for every one (never reach the ribbon pipeline this unit's oracle measures). Explained in prose, not via the `identical_exceptions` mechanism — the tool correctly can't see prose. |
| 4–5 | **W-15** | box·hatch·ladder·max/med·a | Not explained — no `identical_exceptions` block in this report at all. |
| 6–11 | **W-15b** | box/solid·hatch·ladder·low/med/max·a (6 cells) | Not explained — same, no exceptions block. |
| 12–17 | **W-21** | box/solid·contour·ladder·low/med/max·a (6 cells) | Not explained — same. |
| 18–24 | **W-26b** | capsule·contour·ladder·low/med/max·a, cone·contour·{amplitudeOnly,ampSpacing,ladder}·med·a, cylinder·contour·ladder·med·a | Not explained — same. |
| 25 | **W-27** | box·contourSlice·ladder·med·a | Not explained — same. |
| 26–27 | **W-27c-0a** (label) | solid·contourSlice·ladder·max/med·a | **Real mislabeling bug found and disclosed, not fixed**: `after/W-27c-0a-4/report.json` has `"id": "W-27c-0a"` (copy-paste error — should read `W-27c-0a-4`), so its WARNs are printed under the wrong card name. The genuine `after/W-27c-0a/report.json` *does* declare `identical_exceptions` for these exact two basenames (plus `sphere__max`/`torus__max`, which aren't currently byte-identical so don't need it) and is correctly recognized — 0 WARNs from the real card. `after/W-27c-0a-4/report.json` reuses the identical cell basenames, is also byte-identical there, but has **no** `identical_exceptions` block of its own. Confirmed by instrumenting a scratch copy of the script (not committed) to print `pr.base`/exception-key membership per pair — two DEBUG hits per basename, one `hasExc:true` (the real W-27c-0a) and one `hasExc:false,excKeys:[]` (the mislabeled W-27c-0a-4), both surfacing under the WARN header "card W-27c-0a" because the WARN is keyed by the report's `id` field, not its directory name. |

No WARN was silenced, suppressed, or worked around. All 27 stand in the rebuilt `index.html`
exactly as the script reports them.

## 5. Live verification (localhost:8460)

Dev server on 8460 was already running (main's, per the brief) and served the fresh `index.html`
(HTTP 200). No `chrome-devtools` MCP available this session (connection failure, not absence — used
Playwright per `CLAUDE.md`'s documented fallback). Screenshots in
`docs/3d-audit/fill-audit/after/GALLERY-r2/`:
- `1-gallery.png` — loads clean, 0 console errors. Header reads **"Total shots recorded 3480 · OK 3480
  · Timeouts 0 · Errors 0 · Empty canvas 0 · Bare-centrelines failures 18 · Unreachable pairs (not shot)
  1084"**. Spot-checked `shots/A/sphere__hatch__ladder__max__a.webp` directly: the sphere's silhouette
  is now a smooth circle with no facet chording at the boundary — visual confirmation of the
  detail-28 creation default landing (previously detail 16 would show visible polygon facets at this
  zoom).
- `2-findings.png` — loads clean; P0 2 / P1 8 / P2 12, 13 clusters, 24 work items — matches the
  injection log. The header text ("v1.3.98 ... 7440 shots") is the frozen historical prose noted above,
  not live-generated from this rebuild's counts.
- `3-before-after.png` — loads clean; summary line reads **"62 items · 251 image pairs · 33
  byte-identical pairs · 2 malformed reports · 27 UNEXPLAINED byte-identical pairs"**, matching the
  console output exactly. Visually confirmed the A3 card's torus·contour·max cell carries a red
  "byte-identical — UNEXPLAINED" badge, consistent with the WARN table above.

A 4th, full-page before/after screenshot was taken to check the tail of the WARN-flagged cards, then
**deleted** (18.6 MB, not requested, redundant with the viewport shot + the WARN table already listing
every flagged cell by name).

## 6. `git status` — what changed for the orchestrator to commit

```
git status --short -- docs/3d-audit scripts/audit ':!*/shots/*'
```

Mine, this session:
```
 M docs/3d-audit/fill-audit/after/W-28b/report.json      (re-shoot data: optionCount/disabledCount 36/25 -> 34/23)
 M docs/3d-audit/fill-audit/index.html                    (full rebuild)
 M docs/3d-audit/fill-audit/manifest.A.1-1.jsonl           (576 fresh cells)
 D docs/3d-audit/fill-audit/manifest.A.1-50.jsonl          (stray stale shard file, removed)
 M docs/3d-audit/fill-audit/manifest.B.1-5.jsonl           (fresh shard 1/5)
 M docs/3d-audit/fill-audit/manifest.B.2-5.jsonl           (fresh shard 2/5)
 M docs/3d-audit/fill-audit/manifest.B.3-5.jsonl           (fresh shard 3/5)
 M docs/3d-audit/fill-audit/manifest.B.4-5.jsonl           (fresh shard 4/5)
 M docs/3d-audit/fill-audit/manifest.B.5-5.jsonl           (fresh shard 5/5)
 M docs/3d-audit/fill-audit/manifest.B.unreachable.jsonl   (fresh, 1084 lines)
 M scripts/audit/scene3d-capture.js                        (W-32 Rank 1 patch + --legacy-detail)
 M scripts/audit/w28b-face-count-threshold-evidence.js     (uncapped listbox size)
?? docs/3d-audit/fill-audit/after/GALLERY-r2/              (3 tab screenshots, this report's evidence)
```

Also showing modified, **not mine** — concurrent orchestrator documentation edits made to the same
files during this session (visible via `git diff`, all additive prose about the round-2 merge landing
at `9cf09b39` and the gallery rebuild being underway):
```
 M docs/3d-audit/STILL-OPEN.md
 M docs/3d-audit/fill-audit-handoff.md
 M docs/3d-audit/lane-reports/SESSION-SUMMARY.md
```
`shots/` (untracked, gitignored, fully regenerated — 3480 files) intentionally excluded from the
listing above per the pathspec, as instructed.

## Open items for the orchestrator

1. **W-30c's stale torus "after" frames — not re-shot.** Newly flagged mid-session in `STILL-OPEN.md`/
   `fill-audit-handoff.md` (concurrent edits, not part of my numbered brief or `LEDGER.md`'s gallery
   item). Bespoke shadow evidence, own script, no `before`/`after` schema — needs its own re-shoot pass,
   not folded into this one.
2. **`after/W-27c-0a-4/report.json`'s `id` field is mislabeled** `"W-27c-0a"` (should be `"W-27c-0a-4"`).
   Causes its 2 genuinely-unexplained byte-identical WARNs to print under the wrong card name in the
   console output; the real `W-27c-0a` card is correctly exempted. A one-line content fix, not made here
   (report.json content edits are lane-report territory, not this rebuild's).
3. **20 of the 27 WARNs (W-15, W-15b, W-21, W-26b, W-27, and W-27c-0a-4's 2) have no
   `identical_exceptions` block at all** — these are pre-existing implementer reports that predate the
   exemption mechanism or never adopted it; each needs either a declared exception with a reason or a
   fresh look to confirm the byte-identity is still expected post-merge. A3's is explained in prose only.
4. Cell-count reference should be updated from the stale "7440" to **3480** wherever it's quoted
   going forward (e.g. `fill-audit-handoff.md`'s "Read this first" §1) — the drop is real and explained
   (§2 above), not a defect in this rebuild.
