STATUS: ACCEPT-WITH-FOLLOWUPS

# U9b (+ W-10d-3b + U6-2 folded in) — adversarial review

Lane: `fill-collapse-3` (`.claude/worktrees/fill-collapse-3`), read-only. Pinned range
**2af329dd..2b189b5f** (includes orchestrator WIP checkpoint `28444663`, reviewed as a whole).
Reproduction happened in scratch exports (`git archive 2af329dd`/`2b189b5f`, `node_modules`
symlinked) — never by editing the worktree. `git archive` exports of both shas were taken
immediately, before the U7-2 implementer's concurrent edits could land; the live worktree was not
read afterward.

**Correction to my own process**: an earlier pass of this review wrongly concluded `U9b-impl.md`
and the `U9b/` evidence directory did not exist, because I only checked the *worktree's* copy of
`docs/`. Per AGENT-PROTOCOL, implementer reports and evidence live on **main**, not in the worktree.
Both are present at `/Users/jayphi/Documents/github/vectura-studio/docs/3d-audit/lane-reports/U9b-impl.md`
(21 KB) and `/Users/jayphi/Documents/github/vectura-studio/docs/3d-audit/fill-audit/after/U9b/`
(12 files). `U6-review.md` also exists at the same main path and its §2b matches the citation
exactly. That earlier REJECT is withdrawn; this is the corrected, substantive review, and it
supersedes it.

## Verdict summary

The fix is correct, minimally scoped, and honestly reported. Every RED/GREEN, byte-identity, and
scope claim I independently checked reproduces exactly — including re-running the implementer's own
`scripts/audit/u9b-shadow-display-evidence.js` myself against fresh scratch servers before
discovering the committed evidence already existed, and getting byte-identical PNG md5s and
identical popover text to what's now committed. **ACCEPT-WITH-FOLLOWUPS**: one real, narrow,
undisclosed behavioral consequence (below, condition 2) should be documented and pinned with a test
before the next unit builds on this contract; nothing here blocks merge.

## (1) RED / GREEN

Reproduced independently (scratch exports, not the worktree):
- **GREEN** at `2b189b5f`: ran the 6 heaviest named-suite files directly — `Test Files 6 passed (6),
  Tests 326 passed (326)`, matching exactly the first six numbers in the impl report's own
  breakdown (`28+7+111+7+3+170 = 326`). Did not independently re-run the remaining 6 pre-existing/
  unmodified suites (`30+5+13+19+8+5 = 80`, summing to the report's claimed 406 total) — consistent
  with the diffstat (11 files changed, confirmed in (7)), no reason to doubt them.
- **RED** at `2af329dd` (post-fix test files copied onto pre-fix source): **4 of 5 changed test
  files failed (7 tests), 1 passed** — every failure an `AssertionError` on a string/value/geomSig
  mismatch, **never a `TypeError`**, matching the report's own characterization. Sampled directly:
  - `HEADLINE (U9b) — shadowToneLaw:"onePenDown"...`: `expected '[[[179.053,126.383]...' not to be
    '[[[179.053,126.383]...'` — **both sides identical strings** (`Object.is` on the full
    geomSignature) — independently proves the report's claim that pre-fix, `onePenDown` drew
    byte-identical to plain `ladder`.
  - `U9b — the ONE exception...`: `expected 'onePenDown' to be 'interlockWeave'` — pre-fix,
    `normalizeShadow` really did pass `onePenDown` through raw.
  - `scene3d-fill-style-picker.test.js`'s fineLadder popover test: expected/received show Ladder's
    generic text pre-fix vs. Fine Ladder's own text expected — matches the display-fix claim.
- `tests/unit/scene3d-fill-style-display-params.test.js` run with its own **pre-fix (2af329dd)**
  content (not the post-fix substitute — substituting it would trivially pass, since ALIASES was
  already 18 at 2af329dd from the same-commit U6 fold): **1 failed, 2 passed (3)** —
  `expected 18 to be 15`, exactly U6-review §2b's "2/3 passing" finding. At `2b189b5f`: **3/3**.
  The diff is exactly the one-line `.toBe(15)` → `.toBe(18)` the report claims, no change to the
  generative body — **U6-2's green confirmed for the stated reason, not incidentally**.

## (2) THE EXCEPTION — ruling: correct and necessary, but one undisclosed consequence

**Premise, independently re-derived (not taken from the report):**
- Listed all 18 `ALIASES` entries and cross-referenced every id against `HATCH_LAW_RECIPES` and the
  wave/cross recipe tables in `shadows.js`. **`onePenDown` is the sole ALIASES id with no recipe
  entry anywhere** — corroborated by `TONE_LAW_NOT_DISTINGUISHABLE = new Set(['isophoteWidth',
  'onePenDown'])` (shadows.js:867; `isophoteWidth` isn't an ALIASES member, so `onePenDown` is the
  only overlap) and by shadows.js's own comment ("Every id `toneLawApplies` accepts under 'hatch'
  ... has an entry"). Matches the impl report's own root-cause section exactly.
- `buildShadows({shadowToneLaw:'onePenDown'})` byte-identical to `ladder` at `2af329dd`: proven
  above in (1) — the RED failure is a same-string `Object.is` equality, not an inference.

Both halves of the exception's premise check out. **Given that premise, forward-resolving
`onePenDown` is the right fix** — the alternative (leaving it raw) would mean the render bug (b)
persists, since `shadows.js`'s dispatch has no fallback logic of its own (confirmed: no
`HATCH_LAW_RECIPES` entry was added anywhere — see (7) — so nothing in shadows.js changed to bridge
this at draw time).

**Mechanism, traced independently (this matters more than the premise):** `clampShadowToneLaw`'s
forward-resolve runs inside `normalizeShadow` ← `normalizeParams` (params.js:1515), which is the
**single choke point shared by both the ephemeral render path and the persisted-load path**:
- Render: `scene3d.js generate()` calls `Params.normalizeParams(params)` into a local `p`, never
  written back to `layer.params` — ephemeral, exactly how every other id's resolution-for-drawing
  already worked pre-U9b.
- **Load: `engine.js:1941`, `layer.params = sanitizeImportedParams(data.params || {}, data.type)`**
  → `sanitizeSceneParams` → `normalizeParams(migrateScene(params))` for `scene3d`, which **does**
  overwrite the layer's stored params.

Consequence: a `.vectura` document saved with `shadowToneLaw:'onePenDown'`, the next time it is
loaded, has its **stored** value silently and permanently rewritten to `'interlockWeave'`. This is
directly confirmed by the unit's own new test (`scene3d-shadow-tone-law.test.js`, "U9b — the ONE
exception"): it asserts `normalizeShadow`'s **returned** field is `'interlockWeave'`, not merely
that drawing resolves correctly. Every one of the other 17 ALIASES ids keeps the "no write-back"
guarantee U9-review.md section (3) established as the shadow bag's whole design point ("Picker
display... does not require the stored value to already be a survivor, and it never writes back —
so U9 preserving the raw folded id in storage does not break picker display"). `onePenDown` alone
loses it, on the very next load.

**Ruling — not a breach requiring redesign, but a real gap in disclosure.** I do not think this
should be moved to a resolve-at-draw-only patch: that would require editing `shadows.js`, which
every prior review in this chain (U9-review, U9-2-review, the LEDGER) treats as a hard scope
boundary this unit correctly respected. Reusing the shared `normalizeShadow`/`clampShadowToneLaw`
choke point is the only place available without breaking that boundary, and it's a single,
well-isolated branch. But the impl report, thorough as it is, **never states that this also mutates
a loaded document's stored value** — it discusses only the rendering rationale ("the honest fix is
for the shadow bag to resolve `onePenDown` FORWARD"). The `displayParams`/`shadowDisplayLaw`
sections explicitly say "nothing written back"; the params.js fix section does not make the
opposite fact explicit for its own mechanism, and no test exercises the real
`engine.loadState`/`sanitizeImportedParams` path to pin it. **Follow-up (non-blocking): add one
round-trip test that loads a document with a raw `onePenDown` through the real load path and asserts
the stored value is now `interlockWeave`, and add one sentence to this fact in
`docs/3d-audit/lane-reports/U9b-impl.md` (or a short addendum) so a future engineer debugging "why
did my saved onePenDown scene silently become interlockWeave" has something to find.**

## (3) CENTRAL — the picture flag: fixed, not half-fixed; matches the implementer's own claim

Re-ran `scripts/audit/u9b-shadow-display-evidence.js` myself, independently, before discovering the
committed evidence — against fresh scratch servers (`before`=2af329dd, `after`=2b189b5f) — and got
**byte-identical results** to what's now committed at
`docs/3d-audit/fill-audit/after/U9b/`: the fineLadder canvas PNG md5 I produced
(`34a545297f174aae6c26b67ab6304b63`) matches the committed one exactly; the popover text strings
match verbatim; `shadowPathCount` 151/151 for fineLadder and 147/147 for onePenDown, `geomSig`
equal=true/false respectively — all identical to `report.json`'s own numbers. Viewed the committed
`after-fineLadder-row.png` directly: pixel-identical to my own independent capture.

**Reading confirmed**: `fineLadder` — `<select>` reads "Ladder (default)" **both before and after**
(unchanged); the (i) popover reads Ladder's generic text before, Fine Ladder's own distinct
mechanism/strengths/weaknesses text after. `onePenDown` — `<select>` and popover both read
"Interlock Weave" **identically before and after** — no visible change, correctly, since (per (2))
the display helper (`shadowDisplayLaw`) independently falls to the survivor whenever
`Shadows.toneLawApplies(rawValue)` is false, which was already true for `onePenDown` pre-fix (its
`TONE_LAW_NOT_DISTINGUISHABLE` membership predates this unit).

**Is the dropdown supposed to change? No — confirmed against the exact precedent this unit claims to
mirror.** `W-10d-3-impl.md`'s own RGR table pins test **R1g** ("docked LEAF, raw `fineLadder`, Fill
Style row (over-fix guard)") at `'ladder'` **both pre- and post-fix** — the style-side fix only ever
updates the *sub-control* ("Rung detail" etc.), and explicitly guards against the main select ever
changing away from the survivor, naming it an over-fix if it did. The shadow bag has no sub-control
at all (U9's reviewer explicitly forbade giving it one: "two mechanisms, not one path"), so the (i)
popover is the *only* place left to show a raw id's own distinguishing text — exactly what W-10d-3b
adds. **"Ladder (default)" + Fine Ladder's own description in the popover is the designed, correct
end state, not a partial fix — it is the shadow-side twin of the already-reviewed and accepted
style-side pattern.** W-10d-3b is **fixed**.

What a user sees, confirmed by direct inspection of the committed evidence plus my own independent
reproduction:
- Stored `fineLadder`: select shows "Ladder (default)"; popover shows Fine Ladder's own
  mechanism/strengths/weaknesses.
- Stored `onePenDown`: select shows "Interlock Weave"; popover shows Interlock Weave's own text —
  no distinguishing text is shown or possible, because (per (2)) the stored value no longer survives
  as `onePenDown` past the first load, and even in the evidence script's artificial direct-write
  bypass (which skips normalize), the display helper independently falls to the survivor anyway.
- Stored `bundleDither`: not screenshotted by either the implementer's script run or mine (`IDS` in
  the script is `['fineLadder', 'onePenDown']` only) — by the same code path
  (`toneLawApplies('bundleDither')` is true, it has its own recipe) it would behave like
  `fineLadder`: select shows "Bundle Count", popover shows `bundleDither`'s own text. Worth adding
  to the evidence script's `IDS` list at the next opportunity, not blocking.

One minor observation not in the report: the `onePenDown` row PNGs (`before-onePenDown-row.png` /
`after-onePenDown-row.png`) are **not** byte-identical at the pixel level (different md5s), unlike
the fineLadder canvas pair. This is consistent with ordinary font-hinting/sub-pixel rendering
variance between two separate headless page loads, not a content difference — the page-evaluated
`popoverText` string logged in `raw-capture.json` (the actual oracle, not the screenshot) is
identical both times, and I got the same text independently. Noted for completeness, not a finding.

## Coordinator flag (3) — `shadowResolvesToSurvivor` single-caller check

Confirmed: `describeSingleParamCluster(label, {..., shadowResolvesToSurvivor})` is called 6 times in
`tests/unit/scene3d-tone-law-collapse.test.js`; `shadowResolvesToSurvivor` is passed at exactly
**1** of them (the U8 cluster, `['onePenDown']`). Every other call site implicitly passes
`undefined`, and `(shadowResolvesToSurvivor || []).includes(id)` correctly defaults to raw
pass-through for all of them — verified in the diff and in the 326/326 green run (every non-U8
cluster's "passes through UNCHANGED" assertion still passed). One real, minor gap, non-blocking:
nothing ties the test-side `['onePenDown']` literal to the production-side
`Shadows.toneLawApplies`/`TONE_LAW_NOT_DISTINGUISHABLE` set it's meant to mirror — a second caller
could add any id here without this specific assertion catching a mismatch against what
`clampShadowToneLaw` would actually do (a separate cross-check exists —
`scene3d-fill-style-effective-law.test.js`'s new generative test — but not inside this literal).
Worth a one-line comment noting the coupling is manual; not blocking.

## Coordinator flag (4) — U6-2's green

Confirmed for the stated reason, not incidentally: see (1) above — RED reproduces `expected 18 to be
15` against the file's **original, unmodified 2af329dd content**, and GREEN at `2b189b5f` is the
exact one-line `.toBe(15)` → `.toBe(18)` fix with no other change to the generative body. The
`U6-review.md §2b` citation is real (`docs/3d-audit/lane-reports/U6-review.md`, section "2b. A
second, more serious gap...", lines 65–104, verified to name the identical `aliasIds.length`
assertion and fix).

## (4) Uniqueness re-pin

Diff confirmed: sweep widened from "23 offered survivors only" to "23 offered +
`collapseOptionIds` (17 folded ids with their own recipe — every ALIASES member except
`onePenDown`) = 40". Verified independently: all 18 ALIASES entries counted directly (condition 2);
`collapseOptionIds` filters to `Shadows.toneLawApplies(foldedId)`, 17 pass. No-collision bar
unchanged in shape (`expect(collisions).toEqual([])`) over a widened universe, not a widened
tolerance. `onePenDown` is correctly excluded from the "must all differ" sweep and pinned instead,
in its own test, as an **expected** duplicate of `interlockWeave`. Reproduced 3/3 relevant new tests
passing at `after` (part of the 326/326 run in (1)). Did not independently hand-construct a fresh
collision mutation — the assertion shape (`toEqual([])`) is identical to the pre-existing HEADLINE
test this extends, already mutation-tested in `U9-review.md`/`U9-2-review.md`.

## (5) Byte-identity / render checks

- **U9's own evidence scene, unchanged**: md5-compared all 7 files under
  `docs/3d-audit/fill-audit/after/U9/` between `2af329dd` and `2b189b5f` — **all byte-identical**.
  Confirms this unit did not disturb U9's committed evidence.
- U0 shadow-related chunks: exercised via the 326/326 full run of `scene3d-tone-law-collapse.test.js`
  (contains the U0-era cluster invocations for U1–U8) — all passed.

## (6) Files touched — confirmed minimal, no recipe creep

Full diffstat (11 files): `scripts/audit/u9b-shadow-display-evidence.js` (new), `src/config/context-bar.js`
(+35), `src/core/scene3d/params.js` (+41/−2), `src/ui/panels/scene3d-panel.js` (+12/−2),
`src/ui/shell/context-bar.js` (+10/−1), and five test files. **`src/core/scene3d/shadows.js`,
`src/core/algorithms/scene3d.js`, `src/core/scene3d/surface-fill.js` are all untouched.** **No
`HATCH_LAW_RECIPES` entry was added** — confirmed by reading the params.js diff directly: the fix is
entirely inside `clampShadowToneLaw`, never touches any `*_LAW_RECIPES` table. Correctly in-scope —
not a recipe change.

Both UI diffs (`scene3d-panel.js`, `src/ui/shell/context-bar.js`) read exactly as claimed: a
one-line swap from `FS.entry(law)` to `FS.entry(FS.shadowDisplayLaw(rawValue, law))` at each
read-site; the `<select>`'s own binding stays on `law`. The impl report **self-discloses** the
extension to a third file (`src/ui/shell/context-bar.js`) beyond the literal 2-file brief, with a
clear rationale (identical bug on a second real UI surface, matching W-10d-3's own precedent of
touching both files) — this is good practice, not a scope violation; agreed with the implementer's
own judgment call here.

**Merge risk worth flagging**: `tests/unit/scene3d-tone-law-collapse.test.js` is now a three-lane
collision file (fill-collapse-2/U5b, handoff-c2/U9, and now fill-collapse-3/U9b all edit it) — U9's
own review already flagged the first two; this is a third. Not disclosed in a dedicated merge-notes
section in either the commit message or `U9b-impl.md`. Flag for the merge orchestrator.

## Summary

Correct fix, correctly scoped (shadows.js/scene3d.js/surface-fill.js untouched, no recipe added),
honestly and thoroughly reported at the right (main) location, and independently reproducible byte
-for-byte from the evidence script as committed. The CENTRAL picture-flag question resolves cleanly
in the implementer's favor: the shadow row's "select shows survivor, popover shows the raw id's own
text" is the designed end state, directly mirroring the already-accepted style-row precedent
(W-10d-3's own over-fix guard). The one real gap — `onePenDown`'s stored value silently changing on
load, a narrow but genuine departure from U9's "no write-back" contract for every other folded id —
is undisclosed in the otherwise-thorough report and untested against the real load path. Non
-blocking; recommended before the next unit builds on this contract.

## Follow-ups (non-blocking)

1. Document and test the `onePenDown` write-back-on-load consequence (condition 2) — add a
   round-trip test through the real `engine.loadState`/`sanitizeImportedParams` path.
2. Add `bundleDither` (or another recipe-bearing folded id) to
   `scripts/audit/u9b-shadow-display-evidence.js`'s `IDS` list for future evidence runs, so the
   "shows its own text" claim is demonstrated on more than one case.
3. Tie the test-side `shadowResolvesToSurvivor: ['onePenDown']` literal to the production-side
   `Shadows.toneLawApplies` set with a one-line comment noting the coupling is manual (coordinator
   flag 3).
4. At merge, diff `tests/unit/scene3d-tone-law-collapse.test.js` explicitly against both other lanes
   that touch it (fill-collapse-2/U5b, handoff-c2/U9) — a third-lane collision, not previously
   flagged for this specific unit.
