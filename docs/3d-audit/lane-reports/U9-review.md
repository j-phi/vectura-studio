STATUS: ACCEPT-WITH-FOLLOWUPS

# U9 (resolve half) — adversarial review

Lane: handoff-c2 (`3d-scene/handoff-c2`, port 8470), read-only. Pinned range **47a5a755..fc8b0fba**.
Reviewer worked read-only in the worktree; all reproduction happened in scratch exports
(`/private/tmp/claude-501/scratch-U9-pre` @ 47a5a755, `/private/tmp/claude-501/scratch-U9-post` @
fc8b0fba — both pre-existing from a killed prior reviewer, HEAD content re-verified against the
worktree's own git history before use). A previous reviewer was killed by a rate limit before writing
a report; this is a fresh pass, not a continuation.

## Scope reminder

Per LEDGER.md's standing ruling (2026-09-06 19:20), U9 covers only the shadow-side ALIASES
resolve bug. The uniqueness re-pin and `onePenDown`/`TONE_LAW_NOT_DISTINGUISHABLE` handling are
**U9b, QUEUED behind U8**, and are correctly NOT touched here (verified below, condition 7).

## (1) RED — verified

Copied `tests/unit/scene3d-shadow-tone-law.test.js` (post-fix version) into the untouched
`scratch-U9-pre` (47a5a755) export and ran it against the real pre-fix source:

```
npx vitest run tests/unit/scene3d-shadow-tone-law.test.js
```

Result: **20/22 passing, 2 failing** — exactly the two new U9 cases, for the right reason:

- `HEADLINE (U9) — shadowToneLaw:"fineLadder" ... still renders its OWN recipe` — failed with
  `expected '[[[179.053,126.383],...' not to be '[[[179.053,126.383],...'` (Object.is on the full
  geomSignature) — i.e. `buildShadows({shadowToneLaw:'fineLadder'})` and `buildShadows({shadowToneLaw:
  'ladder'})` produced **byte-identical vector geometry** on genuine pre-fix source. This is a real
  data-loss bug, not a missing API — the API (`Params.normalizeShadow`, `Shadows.build`) exists and
  runs cleanly both before and after; only its output differs.
- `Scene3D.Params — shadowToneLaw whitelist > U9 — a FOLDED id ... survives normalization unchanged`
  — failed with `expected 'ladder' to be 'fineLadder'`, i.e. `normalizeShadow` really did collapse
  the folded id pre-fix. Also not a missing-API failure.

Both failures are semantic (wrong recipe / wrong collapse), never a `TypeError` or `is not a
function` — RED is for the claimed reason.

## (2) Mutation testing — verified

In `scratch-U9-post` (fc8b0fba, the fix applied), reverted only the `normalizeShadow` call site
(`clampShadowToneLaw(src.shadowToneLaw)` → `clampStyleParam('toneLaw', src.shadowToneLaw)`, i.e. the
exact one-line inverse of the fix's diff) and re-ran the same test file:

```
sed -i.bak "s/shadowToneLaw: clampShadowToneLaw(src.shadowToneLaw),/shadowToneLaw: clampStyleParam('toneLaw', src.shadowToneLaw),/" src/core/scene3d/params.js
npx vitest run tests/unit/scene3d-shadow-tone-law.test.js   # 20/22, same 2 failures as pre-fix
```

Re-fails the identical 2 tests with the identical failure messages, then restored. This is a tight
mutation kill — the fix and only the fix flips these tests.

## (3) CENTRAL — the six rewritten assertions: STALE, not regression

Diffed `tests/unit/scene3d-tone-law-collapse.test.js` at 47a5a755→fc8b0fba: 4 edit sites (test "7."
at ~L207/226, the U1 cluster at ~L385/404, the shared `describeSingleParamCluster` helper at
~L563/582 used by U2/U3/U4, and the U5 cluster at ~L874/893), each changing
`expect(shadow.shadowToneLaw).toBe(survivor)` → `.toBe(id)` (pass-through), with "never warns" kept
unchanged. All 4 sites carry inline `STALE ASSERTION UPDATE (U9, resolve half)` comment blocks
following the file's own pre-existing convention (search "STALE ASSERTION UPDATE (U1)" at the same
file, pre-existing from a different unit).

**Proof the old contract was wrong, not merely inconsistent with the new one** (not taken on faith):
the RED proof in (1) is exactly this — at 47a5a755, with the OLD assertion in force
(`shadow.shadowToneLaw` collapsing `'fineLadder'`→`'ladder'`), the actual rendered shadow geometry for
a scene saved with `shadowToneLaw:'fineLadder'` was **byte-identical** to plain `'ladder'` hatch, even
though `HATCH_LAW_RECIPES.fineLadder` (shadows.js:1014, `hatchOffset(rings, angleDeg, spacing, 0,
0.97)`) exists specifically to draw something different, and `HATCH_LAW_RECIPES` deliberately has **no**
entry for `'ladder'` (shadows.js's own comment: "it must always take the fallback… never a recipe").
The old test was pinning a real rendering defect as a feature — read literally, "clampStyleParam
belt-and-brace: shadowToneLaw carrying a folded id maps to the survivor, never warns" describes
exactly the silent-wrong-texture bug, not a deliberate design choice. Read the U0-era test 6
("migration shim") alongside it: that test documents *why* the style path's collapse is safe — a
sibling `normalizeStyle` shim independently re-reads the raw value and writes `rungMode` back onto
the same bag, so `resolveToneLaw` can reconstruct `'fineLadder'` from `{toneLaw:'ladder',
rungMode:'fine'}`. Test 7 (the one U9 rewrote) reused the *same* clamp for the shadow bag on the
apparent assumption that consistency = correctness, without the corresponding shim — the shadow bag
has "one flat `shadowToneLaw` string, nothing else" (DEFAULT_SHADOW), so there is no sibling field to
carry the lost information back. That gap is confirmed by reading `shadows.js:2713`
(`clampToneLawId(shadowBag.shadowToneLaw)`) → `shadows.js:2351` → `HATCH_LAW_RECIPES[lawId]`: the
shadow dispatch is a **direct id→recipe lookup**, never routed through `resolveToneLaw`, so passing
the folded id straight through (U9's fix) is sufficient and correct — no sibling field was ever
needed on this path, unlike the style path.

**Downstream consumers checked — none rely on the shadow bag holding a survivor id:**
- Picker display (`SCENE_FILL_STYLES.resolve`, `src/config/context-bar.js:240`; called from
  `context-bar.js:1872` and `scene3d-panel.js:3193`): computes the survivor **on demand** from
  whatever raw id is stored (`R.ALIASES[value]`), purely to decide which row to highlight. It does not
  require the stored value to already be a survivor, and it never writes back — so U9 preserving the
  raw folded id in storage does not break picker display.
- `.vectura` save/load and `_composeSceneGroup`/`normalizeParams` (`params.js:1449`,
  `sanitizeSceneParams`): confirmed `normalizeShadow` (and therefore `clampShadowToneLaw`) is the
  single choke point these paths call; no other consumer re-derives `shadowToneLaw`.
- W-10d-2/-3's write-back contract operates on `style.params.toneLaw` (the STYLE bag,
  `normalizeStyle`'s migration shim territory) — a structurally different mechanism from the shadow
  bag's direct-lookup dispatch. U9 never touches `clampStyleParam` or `normalizeStyle`, confirmed by
  diff (see (5)); W-10d-2/-3 is unaffected.
- Nothing else in `src/` reads `shadowToneLaw` besides `shadows.js` and `params.js` (grepped).

**Divergence (shadow keeps folded ids, style collapses them) is intentional and correctly
justified, not an oversight:** the style path needs `resolveToneLaw` to reconstruct an internal id
from `{survivor, sub-control}` because the UI only stores the survivor + a picker sub-control; the
shadow path has no sub-control UI at all and dispatches on the raw id directly, so passing it through
is both sufficient and simpler. The `params.js` diff's own comment block states this reasoning
explicitly and cross-references `resolveToneLaw`'s rule 2 verbatim — a future engineer trying to
"simplify" by unifying the two clamps will read why not to, which mitigates recurrence risk.

**Verdict: STALE, correctly updated. Not a masked regression.**

## (4) Numbers

- `0.97x` spacing multiplier: confirmed directly in source,
  `shadows.js:1014`: `fineLadder: (rings, angleDeg, spacing) => hatchOffset(rings, angleDeg, spacing,
  0, 0.97)`.
- Predicted density increase: `1/0.97 - 1 = 3.09%`. Report's measured `147 → 151` = `+2.72%` on the
  bespoke sphere+ground scene — plausible, in the right direction and right order of magnitude
  (discrete path-count rounding on a finite footprint explains the gap from the continuous
  prediction).
- **Independently reproduced** with a different bespoke scene (single box object, not the
  implementer's sphere, own script in scratch, not `scripts/u9-shadow-resolve-evidence.js`): `ladder`
  → 116 paths, `fineLadder` → 120 paths, **+3.45%**, same direction, same order of magnitude as both
  the implementer's number and the 3.09% prediction. This corroborates the effect is real and not an
  artifact of the implementer's specific scene choice.
- **This delta has no bar or band** — correctly flagged by the task brief as non-discriminating
  evidence on its own (a ±10% swing in a shadow build from unrelated causes would look similar). The
  unit's real oracle is the exact-coordinate `geomSignature` inequality in the vitest tests (RED→GREEN,
  independently reproduced above in (1)/(2)), not the percentage. **Follow-up proposed**: adopt the
  W-26b-3 floor+±10%-band shape (precedent: `0930cb2d`, LEDGER.md "C3 floor+band shape adopted as
  prescribed") for `shadowPathCount` deltas of this kind in a future unit, so a regression that
  quietly erases the effect (e.g. reverting the recipe to the plain fallback) fails a real bar instead
  of only a hand-run script. Non-blocking — U9's actual regression coverage is the vitest geomSignature
  check, which does have a hard bar (inequality).
- **"Before" stand-in — independently re-derived from genuine pre-fix source, not taken on the
  suite's own word.** The report defends `before-full.png`/`before-crop.png` (`shadowToneLaw:'ladder'`)
  as a stand-in for what `'fineLadder'` rendered pre-fix, citing the unit test's own geomSignature
  equality. I did not accept that circularly: I ran `buildShadows({shadowToneLaw:'ladder'})` and
  `buildShadows({shadowToneLaw:'fineLadder'})` directly against the **real, unpatched 47a5a755 source**
  in `scratch-U9-pre` (via the identical pipeline the test and the evidence script both use —
  `Params.normalizeParams` → `Scene3D.Scene.assembleScene` → `Shadows.build`) and got the same result
  the report claims: `expected [...] not to be [...]` with **the identical string on both sides**
  (see (1)). That is the real geometry the pre-fix tree would draw for either id — a full 68KB+
  exact-coordinate polyline signature, not a screenshot, which is a stronger form of proof than a
  rendered PNG (a PNG could hide a sub-pixel difference; the coordinate signature cannot). The
  screenshot stand-in is therefore justified, just via a proof that predates this review.

## (5) Byte-identity (non-shadow/style path)

`src/core/scene3d/params.js`'s `clampStyleParam` function (the `'toneLaw'` case, ~L741-770) is
**character-for-character unchanged** between 47a5a755 and fc8b0fba — confirmed by diff (the only
hunk touching `params.js` is purely additive: a new `clampShadowToneLaw` function plus the one-line
`normalizeShadow` call-site swap; zero lines of the shared style-path function were touched).
`src/core/scene3d/shadows.js` is **untouched entirely** (empty diff). This is a stronger guarantee
than an md5 comparison: the source text for the style/non-shadow path is provably identical, so its
output cannot have changed. Corroborating: `tests/unit/scene3d-tone-law-dispatch.test.js` and
`scene3d-tone-law-params.test.js` (both exercise `SF.buildObject`/style-path dispatch extensively) are
untouched by the diff (confirmed via `git diff` — empty), and the implementer's report states both
pass unmodified (46-law dispatch matrix; 13/13 params). I was unable to re-run the dispatch file
myself before this report was due (vitest runs on this shared machine repeatedly hit the harness's
120s foreground timeout during this review — consistent with AGENT-PROTOCOL's noted heavy concurrent
load); the source-identity argument above does not depend on that re-run.

## (6) `## Bars changed`

The implementer's disclosure is complete and accurate: 4 file:line entries in
`tests/unit/scene3d-tone-law-collapse.test.js` (lines 214/402/585/901 in the pre-fix numbering,
verified those are the four sites — see (3)), each a `.toBe(survivor)` → `.toBe(id)` change, correctly
labeled as a consequence of the bug fix rather than a widened tolerance. No numeric threshold,
tolerance, count bar, or fingerprint was changed — confirmed: the diff to this test file touches only
these 6 test-execution sites (4 source edits, one shared by 3 executions via
`describeSingleParamCluster`), nothing else.

## (7) Scope — confirmed resolve-half only

- `params.js` diff confined to the shadow bag: new `clampShadowToneLaw` (unused outside
  `normalizeShadow`) plus the `normalizeShadow` call-site swap. No edit to `clampStyleParam`,
  `resolveToneLaw`, `normalizeStyle`, or any style-path code.
- `git diff 47a5a755 fc8b0fba` (whole repo) contains **zero** occurrences of `onePenDown`,
  `TONE_LAW_NOT_DISTINGUISHABLE`, or `PICKER_IDS` outside of prose/comments — confirmed by grep. U9b's
  territory is untouched.
- `tests/unit/scene3d-shadow-tone-law-uniqueness.test.js`: diff is empty (not in the changed-files
  list at all). Re-ran it myself at fc8b0fba in the worktree: **3/3 passing**, unmodified.
- Full changed-file list (`git diff --stat`) is exactly: 5 new PNGs + `report.json` + `stats.json`
  under `docs/3d-audit/fill-audit/after/U9/`, the new `scripts/u9-shadow-resolve-evidence.js`,
  `src/core/scene3d/params.js`, `tests/unit/scene3d-shadow-tone-law.test.js`, and
  `tests/unit/scene3d-tone-law-collapse.test.js`. Nothing outside this list.

## (8) Hygiene — flagged, non-blocking

`scripts/u9-shadow-resolve-evidence.js` is committed at the `scripts/` repo root, alongside the
project's permanent audit tooling (`scene3d-assemble.js`, `scene3d-capture.js`, etc.), rather than
under `scripts/audit/` (which exists and holds comparable one-off/lane tooling) or a scratch
directory. This is cosmetic — the script is a legitimate, documented, one-shot evidence generator, not
a stray probe file — but it should be moved under `scripts/audit/` (or dropped, since the capture it
produced is the artefact that actually matters, not the script) at merge time, per LEDGER.md's own
"Hygiene only" characterization of this same item.

## (9) Merge notes

**U5b (fill-collapse-2, 49475ccd)** also edits `tests/unit/scene3d-tone-law-collapse.test.js`.
Textual conflict is likely at merge (both lanes touch the same file), but I did not have U5b's diff
available to review in this pass — flagging for the merge orchestrator to diff explicitly.
Semantically, U5b's `effectiveLaw` mechanism (per the implementer's own U9-impl.md framing) assumes
folded ids can persist in params and need runtime resolution; U9 is exactly what makes that assumption
true **on the shadow bag** (it was previously false — a folded `shadowToneLaw` never survived
`normalizeShadow`). On the **style** bag, folded ids already persisted pre-U9 in the sense that
`style.params.toneLaw` + `rungMode` sibling reconstruction was already live via the U0 migration shim
— U9 does not change that path at all. So U5b's assumption is `true` on both bags post-U9, but for two
different reasons/mechanisms (shim-reconstruction on style, raw-pass-through on shadow) — worth
U5b/U8 confirming their `effectiveLaw` reads the correct one per bag rather than assuming a single
resolution path covers both.

**Coordinator-supplied correction to this section**: the real merge hazard on `main` is **`e429cfc5`**
("chunk the U0 48-law byte-identity/mutation sweeps to fix CI timeout"), which also rewrites
`tests/unit/scene3d-tone-law-collapse.test.js` (+49/−30 lines, one hunk). I diffed the pre-fix
(47a5a755) and `e429cfc5` versions of this file directly
(`git -C /Users/jayphi/Documents/github/vectura-studio show e429cfc5:tests/unit/scene3d-tone-law-collapse.test.js`):
**the only hunk touches lines 127–165 (tests "4." and "5.", the byte-identity/mutation sweeps), which
`e429cfc5` splits into 4 chunked tests apiece for CI timeout reasons — same assertions, same law
coverage, no behavior change.** Nothing else in the file differs: a line-by-line diff of the two full
files (excluding that one hunk) is empty. Consequence for U9's four rewritten sites: they still exist
in `e429cfc5` in **exactly the same form** as at 47a5a755, merely shifted down by a constant +19 lines
each (test "7." at line 207→226, the U1 cluster at 385→404, `describeSingleParamCluster` at 563→582,
the U5 cluster at 874→893 — all four shifts confirmed exactly +19). **The rebase resolution is
therefore mechanical**: U9's four hunks apply cleanly at their shifted line numbers with no content
conflict against `e429cfc5`; a text-level 3-way merge should resolve automatically (git's diff3 does
not require identical starting line numbers, only identical surrounding context, which is preserved).
`1193cbe1` (rounding for byte-identity/golden comparisons, mentioned in the original brief) touches no
file in this round's lane set, confirmed by the coordinator and not independently re-checked by me
(no reason to doubt it given `e429cfc5` is the file that actually matters here).

## (10) PNGs — looked at directly

Read all three named images (`before-crop.png`, `after-crop.png`, `control-penCross-full.png`) plus
`before-full.png`. Confirmed: the before/after crops show the sphere's own meridian hatch, the ground
plane's sparse parallel hatch, and the shadow footprint's own hatch overlapping to produce a
fine-crosshatch-looking texture at this zoom; the ladder-vs-fineLadder spacing difference is
genuinely subtle to the eye, exactly as the report's own "honesty_note" states — I would not have
flagged this as a visually obvious defect fix from the crops alone, which matches the ledger's
"visually near-identical, honest but weak" characterization. `control-penCross-full.png` shows an
unambiguous crosshatch texture on the shadow footprint, visually distinct from the before/after pair,
confirming the general shadow-dispatch mechanism (not just this one folded id) still works.

## Summary verdict

The fix is correct, minimally scoped, and honestly reported. RED is real (semantic, not API-shaped),
the mutation test kills cleanly, and — most importantly for this file's history — the six rewritten
assertions in `scene3d-tone-law-collapse.test.js` were pinning an actual pre-existing rendering defect
as a feature; U9 corrects that with full disclosure and a documented, sound justification for why the
shadow and style paths now diverge in behavior. No scope creep into U9b. The only real weaknesses are
non-blocking: the live-verification numeric delta (+2.72%) has no bar of its own (the real oracle is
the vitest geomSignature check, which does), and a script left at the wrong path.

## Follow-ups (non-blocking)

1. Move (or drop) `scripts/u9-shadow-resolve-evidence.js` out of the `scripts/` root at merge.
2. Consider a floor+±10%-band guard on `shadowPathCount` deltas for folded-id recipes, following the
   W-26b-3 precedent (`0930cb2d`), so a future regression that silently re-collapses a recipe to the
   plain fallback fails a committed bar and not just a hand-run script.
3. At merge, diff U9's four `tests/unit/scene3d-tone-law-collapse.test.js` sites explicitly against
   both `e429cfc5` (mechanical, +19-line-shifted, no content conflict expected) and U5b's
   `49475ccd` version (not diffed in this review — flag to the merge orchestrator).
4. U8/U5b should confirm their `effectiveLaw` resolution reads the shadow bag's raw-pass-through and
   the style bag's shim-reconstruction as two distinct mechanisms, not one shared code path, now that
   U9 makes "folded ids persist in params" true on both bags for different reasons.
