STATUS: ACCEPT

# MERGE REVIEW — round 2 (`3d-scene/integrate-r2`, a7d39601..4421d514)

Reviewer: read-only. Worktree under review: `.claude/worktrees/integrate-r2` @ `4421d5146e98427af64495f0ae7e0b6b27d4dcff`
(41 commits ahead of `main` @ `a7d39601`). All verification done in scratch exports
(`git archive` to `/private/tmp/claude-501/scratch-merge-post` and `-main`, plus targeted reads
against the read-only worktree itself for tests that shell out to `git`); scratch dirs deleted at
the end of this review. No file in the worktree or main was edited, stashed, or committed.

## 1 — Content completeness (all five lanes)

`git merge-base --is-ancestor <lane-head> 4421d514` is true for all five lane HEADs (`94cca882`,
`463c447f`, `9aad87b8`, `392696ac`, `79b626d2`, `ed778940`) — every lane commit is reachable from
the merge tip. Spot-checked the five highest-risk shared files by diffing each lane's own hunks
against the final tree:

- `src/config/context-bar.js` — both `effectiveLaw` (U5b) and `displayParams` (W-10d-3) present,
  each exactly once (`grep -c`).
- `src/core/scene3d/params.js` — U9's `clampShadowToneLaw`, W-10d-2's `applyLawWriteBack`, and
  W-35's `case 'sliceEndOverlap'` all present.
- `src/ui/panels/scene3d-panel.js` — all four authors' markers present (U5b's `caveatNote`/
  `effectiveLaw`, W-28b's `importedMeshTotalFaces`, W-10d-3's `displayParams` read, W-35's
  `sliceEndOverlap` descriptor + help field).
- `src/core/scene3d/shadows.js` — `diff 9aad87b8:shadows.js` vs the merged file is **empty**; the
  "third stake" never materialised, confirmed by direct comparison, not just `git diff --stat`.
- `tests/unit/scene3d-tone-law-collapse.test.js` — main's chunked `e429cfc5` sweep (4×12-law
  chunks) intact; all four of U9's rewritten `shadowToneLaw` sites present with the corrected
  `toBe(id)`/`toBe('syntheticFolded')` assertions (zero stale `toBe('ladder')` remnants); U5b-2/3's
  and U7's/U8's describe blocks present.

## 2 — Conflict resolutions (2 textual + 1 semantic)

- **`context-bar.js` add/add** — both functions present, each consumer site (`scene3d-panel.js`,
  `context-bar.js`) calls the merged file unmodified. Confirmed above.
- **`scene3d-curved-density-sparse-end.test.js` md5** — blanked the pin and re-ran
  `torus + contour + ladder at d=50` in isolation: thrown value is
  **`bc212164fdc8e72486dcef4e200eaa8d`**, exactly matching the report's claim, independently
  re-derived rather than trusted. Whole file: **20/20 green**.
- **Semantic conflict, `scene3d-fill-style-display-params.test.js`** — ran the file: **3/3 green**,
  `Object.keys(R.ALIASES).length` independently measured at **15** via a standalone `node -e`
  against `scene3d-tone-laws.js`.

## 3 — The four `## Bars changed` edits

All four re-measured independently, not taken on the report's word:

1. **Conflict 2 hash** — see §2. Matches.
2. **Alias count 13→15** — independently measured `15` from the config file directly; test asserts
   `toBe(15)` at `scene3d-fill-style-display-params.test.js:62`.
3. **`scene3d-mesh-self-occlusion.test.js` spiral bar `<=2` → `===0`** — blanked the bar on BOTH
   the merged tree and an unmodified-`main` scratch export (`git archive a7d39601`) and read the
   thrown value: **0 on both**, confirming this is a genuine tightening measured on both trees, not
   a widening. Whole file **5/5 green** on both trees.
4. **`scene3d-curved-crosshatch-controls.test.js` family-B leg, byte-identity → geometric** —
   reproduced the **exact** "3 failed / 15 passed" claim by running the file against a fresh
   `git archive 94cca882` (fill-audit-a2 alone): the same three tests fail
   (`the default crossing family at angle 0 IS the parallels family` on sphere/cylinder/torus).
   18/18 on unmodified `main`. 18/18 on the merged tree. Read the diff of the test file itself:
   family A keeps a full byte-identity pin (`geomKey(cross.slice(0, hatch.length))).toBe(geomKey(hatch))`);
   family B's new assertions are tight (count equal, first point identical to 3dp, point count ≤
   solo run, ink ratio 0.995–1.005, bearing gap <1°) — a disclosed, measured, non-vacuous
   relaxation of exactly the leg the report says, nothing else.
5. **W-26 addendum (`scene3d-plot-safety.test.js` q(0.98)/q(0.5))** — confirmed the bar in the
   *merged* tree is byte-identical to the bar already on unmodified `main` (both trees:
   `q(0.5)` < 0.40 with a 0.308–0.377 band, `q(0.98)` > 0.40). This bar did **not** move in this
   merge — the addendum in `W-26-impl-2.md` is exactly what it claims to be: a missing-disclosure
   fix for a bar that shipped earlier, not a new change. Correctly excluded from the merge's own
   "## Bars changed" table for that reason.

No pin was widened to force a pass; every direction-of-change claim checks out.

## 4 — The ctxbar caveat defect (item 7)

Reproduced RED at the pre-fix integration state (`a992ee59`, the last lane-merge commit before the
squashed fix) by taking that commit's scratch export, applying **only** the new test file hunks
(not the `context-bar.js` fix), and running: both new tests fail with
`expected null to be truthy` — an exact match to the report. Reproduced GREEN on `4421d514`: both
tests pass, whole file **166/166** (164 baseline + 2 new). `git diff a992ee59 4421d514 -- src` shows
exactly three files: `context-bar.js` (the fix), `scene3d-panel.js` (a separate, disclosed
in-app-help addition for item 13, not scope creep on the fix), and `version.js` (the bump). The fix
itself is an 8-line hoist with no logic change beyond read-ordering. Live evidence
(`docs/3d-audit/fill-audit/after/MERGE-r2/*.png` + `report.json`) visually confirmed for 3 of the 5
cases (bundleDither, weaveDepth, onePenDown): Fill Style row shows the survivor, the caveat text
shown is verbatim the FOLDED law's own caveat, matching `report.json` exactly. The `weaveDepth`
caveat is confirmed still written in audit-prose register ("isWaveLaw()/WEIGHT_LAWS") rather than
plain language — correctly scoped by the merge as a pre-existing follow-up (U5b/U5b-2's territory),
not a merge defect.

## 5 — `npm run test:ci`, reproduced suite-by-suite, foreground, idle-unfriendly machine (load 4.0–6.0)

Ran every suite myself (unit chunked into 6 pieces — 5 file-glob chunks plus the giant
`scene3d-tone-law-collapse.test.js` run alone — to fit tool timeouts; integration in 4 chunks;
e2e/visual/perf whole). Four unit files that shell out to `git show`/`execFileSync('git', …)`
fail in a `git archive` scratch export (no `.git`) with a `fatal: not a git repository` error —
this is a scratch-export artifact, not a merge defect; re-ran those 4 files directly against the
real (git-backed) worktree, read-only, and they pass cleanly. Summed results:

| Suite | My result | Report's claim | Match |
|---|---|---|---|
| unit | 465 files (464 passed, 1 skipped), **5199 passed, 44 skipped (5243)** | same | **exact** |
| integration | 235 files passed, **1973 passed (1973)** | same | **exact** |
| e2e | **62 passed, 7 skipped** (5 specs, `--workers=1`) | same | **exact** |
| visual | 6 files, **99 passed, 13 skipped (112)** | same | **exact** |
| perf | 5 files, **10 passed (10)** | same | **exact** |

Every number above was independently summed from my own chunked runs (not copied from the report).
Benign `[vitest-worker]: Timeout calling "onTaskUpdate"` RPC retries observed on the giant collapse
file and on two other chunks, exactly the documented pattern — no test failed because of it.

**`.only`/`.skip`/`.todo`:** `git diff a7d39601..4421d514 -- tests | grep -E '^\+' | grep -E '\.(only|skip|todo)\('` — **zero matches.**

## 6 — Version

`package.json` **1.4.1**, `src/config/version.js` `APP_VERSION = '1.4.1'`, `index.html` **222**
`?v=1.4.1` cache-busters, **0** `v=1.4.0` remaining. Ran `npm run version:sync` on the scratch
export: `package.json`, `version.js`, `index.html` all byte-identical before/after — a true no-op.

## 7 — Docs contract

- **CHANGELOG.md** — `## Unreleased` block present with the W-30d ~465:1 limitation and W-35's
  byte-identical-default note. `grep -n "426" CHANGELOG.md` — no match.
- **README.md** — 3D Scene feature line carries the End overlap sentence verbatim. `### 1.4.1`
  release-note entry present (3 most recent inline: 1.4.1, 1.4.0, 1.3.x). The 1.4.0 entry's own
  "48 → 35" sentence is left as shipped (not silently rewritten); the 1.4.1 entry states the
  counting convention once (`PICKER_IDS` 33, picker offers 34, `IDS` 48) and gives the corrected
  post-1.4.1 figures. `grep -n "426" README.md` — no match.
- **In-app help** — `scene3d-panel.js`'s `sliceEndOverlap` descriptor carries a `help` field;
  `renderControl` applies it as the row's `title` attribute; a new integration test in
  `scene3d-panel.test.js` (part of the 38/38) covers it. Confirmed by reading the diff between
  `a992ee59` and `4421d514`.
- **plans.md** — `## Done` entry for the round-2 merge present and accurate (both conflicts, the
  semantic conflict, "NOT pushed"/"NOT fast-forwarded" stated). `## Now` carries the post-merge
  queue (U9b+W-10d-3b first, gallery rebuild last, filed follow-ups). `## Blocked on Jay` lists all
  nine frozen decisions together, cross-referencing `MERGE-plan-r2.md` §7 and `LEDGER.md`.

## 8 — Checklist spot-checks (5 of 23, as directed)

- **U1–U5 on U7's harness** — the new `describe('… U1..U5 multi-primitive x multi-density (MERGE CHECKLIST item 8)')`
  block exists, asserts `folds.length === 13`, sweeps sphere/torus/cone × low/med/max, and states
  its own honest scope (fold leg proves resolution+determinism; bare-survivor leg carries the real
  geometric weight) — matches the report's description exactly.
- **C-05 findings.json/worklist.json** — `findings.json:236` carries the exact corrected wording
  ("near-duplicate; ink 1459-2202 mm … `contFieldTouch` at 3879.9 mm against `contFieldSigmoid`'s
  1459.0 mm (2.7x)"); `worklist.json`'s W-24/C-05 entry carries the matching note. Both files parse
  as valid JSON.
- **Scripts relocated to `scripts/audit/`** — all four (`w28b-face-count-threshold`,
  `w30b-footprint-wiring`, `w30c-shadows`, `w30d-shadows`) present there, each with the corrected
  two-level `path.resolve(__dirname, '..', '..')` root.
- **In-worktree reports relocated** — `docs/3d-audit/fill-audit/after/U5b`, `after/U9`,
  `lane-reports/U5b-impl.md` present at the merged repo-relative paths; `tests/unit/zzz-t1b-perf.test.js`
  absent.
- **X-ray hunt** — reproduced independently: `scene-xray-needs-fill.test.js` 17/17,
  `scene3d-panel.test.js` 38/38, `scene3d-contour-slice.test.js` 67/67,
  `tests/unit/ --testNamePattern=xray` → **9 passed / 5234 skipped, 0 failed** (exact match).

One correction to my own first pass: I initially could not find
`docs/3d-audit/fill-audit/after/W-10d-2/README.md` inside the git-tracked worktree (checklist item
12's second half) and treated it as a discrepancy. On broader search it exists — as an **untracked
file in main's live checkout** (`docs/3d-audit/fill-audit/after/W-10d-2/README.md`, header:
"Added at integration round 2 … per MERGE CHECKLIST item 12"), carrying both the `leaf-scene/*`
single-key-diff caveat and the 910→5851 commit-body correction verbatim. Evidence directories and
lane reports are written to the shared main checkout rather than committed to lane branches — this
is the audit's established pattern (matches every other `after/<unit>/` dir), not a gap. Item 12 is
**fully discharged**, both halves.

## 9 — Gallery PNGs

Read 3 of 5 `ctxbar-raw-*-flyout.png` crops (`bundleDither`, `weaveDepth`, `onePenDown`) against
`report.json`. All three match exactly: survivor shown in the Fill Style row, plain-language
survivor blurb, and the FOLDED law's own caveat text verbatim in red. `weaveDepth`'s caveat reads
in audit-register prose ("isWaveLaw()/WEIGHT_LAWS", "splits per sample") rather than the
plain-language rewrite U5b/U5b-2 gave `bundleDither` — correctly flagged by the merge as a
follow-up for U5b/U5b-2's territory, not a defect introduced or left by this merge.

## 10 — Main's untracked docs additions (for the orchestrator to commit)

`git status --short -- . ':!graphify-out'` in the **main** checkout (not the worktree) shows:

**Modified (5, pre-existing secretary WIP — NOT part of this merge's own output, per
`MERGE-impl-r2.md`'s "Deliberately NOT touched" section):**
`docs/3d-audit/STILL-OPEN.md`, `docs/3d-audit/fill-audit-handoff.md`,
`docs/3d-audit/fill-audit/after/T1b/report.json`, `docs/3d-audit/lane-reports/LEDGER.md`,
`docs/3d-audit/lane-reports/SESSION-SUMMARY.md`.

**Untracked additions (78 entries — the merge's own output plus lane reports/evidence that were
never committed to any lane branch, per the audit's established out-of-band reporting pattern):**
`docs/3d-audit/fill-audit/after/{MERGE-r2,T2,U5b-2,U7,U8,W-10d-2,W-10d-3,W-27c-0a-4b,W-27c-0a-6,W-28b,W-30b,W-30c,W-30d,W-31,W-33,W-34,W-35,W-36}/`,
one user-report PNG, `MERGE-impl-r2.md`, `MERGE-plan-r2.md`, and ~50 `lane-reports/*.md` files
(T1b/T2/U5b-2/U7/U8/U9-2/U9/W-10d-2/W-10d-3/W-15c/W-27c-0a-*/W-28b/W-30b/W-30c/W-30d/W-31/
W-32-W-33/W-33/W-34/W-34b/W-35/W-36/W-36b plans/impls/reviews) plus `W-35-plan-evidence/`.
The orchestrator should commit exactly this untracked set (and separately decide the 5 modified
files, which are the secretary's own concern per the merge report, not this merge's output).

## Verdict

Every claim I set out to independently re-derive — content completeness, both textual conflicts,
the semantic conflict, all four disclosed bar changes plus the one correctly-excluded non-change,
the ctxbar defect's RED→GREEN and its scope, all five `test:ci` suite counts, the version-sync
no-op, the docs contract, five checklist spot-checks, and the gallery evidence — reproduced exactly
as reported, with independently-measured numbers matching the report's numbers digit-for-digit
(most strikingly the unit suite's 5199/44/5243 and integration's 1973/235, both summed from
scratch by me across six and four chunks respectively). No vacuous pass, no widened tolerance, no
un-proven re-pin, no single-pipeline/single-zoom evidence found. My one initial "discrepancy" (item
12's evidence README) was my own search-scope error, corrected above — the file exists exactly as
claimed.

**Safe to fast-forward main: YES.** `a7d39601` (current `main`) is an ancestor of `4421d514`
(`git merge-base --is-ancestor` confirmed), 41 commits ahead, working tree of the integration
branch clean. The five modified secretary-WIP files and the untracked doc additions in main's own
checkout (§10) are outside the merge and are the orchestrator's separate step, exactly as
`MERGE-impl-r2.md` describes.
