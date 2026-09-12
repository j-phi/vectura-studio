STATUS: ACCEPT-WITH-FOLLOWUPS

# W-38b review — replace T1's vacuous `git show HEAD` leg with a pinned golden fingerprint

Reviewer: adversarial reviewer, read-only. Worktree `.claude/worktrees/fill-audit-3`, pinned range
`575f886d..141ed0b5` (single commit `141ed0b5`). `git status --short -- . ':!graphify-out'` and
`git stash list` checked at the start AND end of this review: worktree clean throughout, no edits,
no stashes made in it. All numbers below were independently reproduced in scratch exports under
`/private/tmp/claude-501/.../scratchpad/w38b-review/` (removed at the end of this review), not
copied from `W-38b-impl.md`.

**Verdict up front:** the fix does what the required follow-up asked — the permanently-vacuous
`git show HEAD` leg is gone, replaced by a pinned golden fingerprint I independently reproduced
byte-for-byte (all 60 of 60), and I independently proved by mutation that the new leg is load-bearing
while the old leg genuinely was not, under the identical mutation, once committed. One factual
inaccuracy in the impl report's own mutation narrative (condition 3 below) and one open brittleness/
scope item (conditions 4 and 6) keep this at ACCEPT-WITH-FOLLOWUPS rather than a clean ACCEPT.

---

## Numbered conditions

**(1) No `src/` change** — CONFIRMED. `git diff --stat 575f886d..141ed0b5 -- . ':!graphify-out'`
shows exactly one file: `tests/unit/scene3d-facet-min-rulings.test.js` (114 insertions, 21 deletions,
193 diff lines total, read in full — no hunk touches any other file, no hidden second file).

**(2) The new leg — pinned md5 per fixture AND absent-key equality; reproduced myself at `141ed0b5`**
— CONFIRMED, both parts:
- Leg 1 (kept, "four-origin no-op"): `md5(key absent) === md5(explicit 3)` — same-run comparison,
  unchanged in spirit from the pre-W-38b file, not itself new but correctly still present.
- Leg 2 (NEW): `pathSignature(absent.paths)` (precision 4, `tests/helpers/path-signature.js`) must
  equal a literal in `EXPECTED_T1`, a 60-entry map. I reproduced this independently rather than
  trusting the committed values: built a scratch export of `141ed0b5` (`git archive` + symlinked
  `node_modules`), blanked `EXPECTED_T1` to `{}`, ran T1, and collected all 60
  `EXPECTED_T1 missing entry — paste this in: '<key>': '<sha256>'` console lines the test itself
  emits on a missing entry. Diffed the 60 regenerated pairs against the 60 committed pairs
  programmatically: **0 mismatches, 0 missing on either side** — every pinned literal is exactly what
  this runtime produces today, not hand-typed or copied from elsewhere.
- Noted, not a defect: `solid|hatch|d1|a20` and `solid|hatch|d50|a20` (and the `a45` pair) pin to the
  *same* hash — a genuine feature of the fixture (solid's hatch output doesn't change between d=1 and
  d=50 at the absent-key floor), not a copy-paste artifact; the d=220 entries for the same primitive/
  mapper/angle are distinct, so the map is not degenerate.
- Full 79/79 reproduced (see condition 5).

**(3) NON-VACUITY by mutation; confirm the OLD leg would NOT have tripped under the same mutation**
— CONFIRMED overall, but the impl report's own account of *which leg* fails is factually wrong, and
I had to do extra isolation work to get a clean proof of the new leg specifically:
- Reproduced the impl's exact mutation (scratch export of `141ed0b5`, `finite(styleParams.facetMinRulings,
  FACET_MIN_RULINGS)` → `finite(styleParams.facetMinRulings, 2)` at that one call site only,
  `FACET_MIN_RULINGS`'s own definition and every other use-site left untouched). Ran T1: **17 failed |
  44 passed | 18 skipped**, not the 16 the impl report claims (16 T1 cases + 1 unrelated T10 side
  effect = 17; the impl report's "79/79" summary elsewhere and this "16" figure are consistent with
  each other but the report never separately flags the T10 side-effect as part of the 16-vs-17 count —
  minor, not misleading once cross-checked).
- ⚠ **The impl report states the 16 failures were "all on the new pinned-fingerprint leg
  (`expected '<mutated-hash>' to be '<pinned-hash>'`)". This is factually incorrect as measured.** All
  16 failing assertion messages I captured are 32-character MD5 strings (`expected '0caa0ac8...' to be
  'cac2404d...'`), i.e. **leg 1** (the pre-existing, unchanged `md5PathsAll(absent) ===
  md5PathsAll(withDefault=3)` four-origin no-op), which fails first and short-circuits the `test()`
  body — **leg 2 is never reached in any of the 16 failing cases as the file is actually structured.**
  This does not mean leg 2 is vacuous — see next bullet — but the report's specific evidentiary claim
  about which leg tripped is wrong, and nobody who only read the report would know leg 2 was never
  actually exercised by the impl's own mutation run.
- To get a clean, isolated proof of leg 2's own non-vacuity (not masked by leg 1), I made a copy of the
  mutated scratch export and commented out leg 1's `expect(...)` line only (leg 2 and everything else
  untouched). Re-ran T1: **same 16 T1 cases fail, now unambiguously on leg 2**
  (`expected 'd3b01f20...' to be '4e9e8d48...'`, 64-char sha256 truncated in vitest's diff output,
  matching the pinned `EXPECTED_T1` values exactly). **This independently confirms leg 2 is genuinely
  load-bearing on its own**, which is the substance of what the impl report was trying to show — the
  report's proof just didn't actually isolate it, and its narrative describing the failures is
  inaccurate for the run it describes.
- **Old leg, same mutation, isolated the same way**: this is the more important half of condition 3,
  and I built a genuinely fresh, from-scratch proof rather than accepting the impl's logical argument.
  Checked out `575f886d`'s tree (the pre-W-38b test file, with the original three-leg T1 and its
  `git show HEAD:...` `preFixV` machinery) into its own scratch `git init` repo, committed it as a
  baseline, then applied the identical mutation to `scene3d.js` and made **a second, real git commit**
  on top — so `HEAD` in this scratch repo now IS the mutated tree, exactly simulating "the regression
  landed as the new HEAD" (confirmed `diff <(git show HEAD:scene3d.js) scene3d.js` empty). Ran the
  original three-leg T1 unmodified: 17 failed (same leg-1 masking as above). Isolated by commenting out
  leg 1 only, leaving legs 2 (`md5(absent)===md5(withDefault=3)`... no — leaving the original file's
  own leg 2, which is `md5(absent) === md5(pre)`, i.e. **the old `git show HEAD` leg**) active. Re-ran:
  **60 passed | 0 failed** (T1 subset) — the old leg does not catch the mutation at all once it is
  genuinely committed as HEAD, in a real git repo, not merely asserted. This is a clean, first-hand
  reproduction of the exact defect Follow-up 1 identified, not a repeat of the impl's prose argument.

**(4) Brittleness — does the pin survive `1193cbe1`-style arm64/x86_64 rounding drift? Is "re-pin only
with proof" present?** — Comment confirmed present (`RE-PIN ONLY WITH PROOF`, doc block above
`EXPECTED_T1`, line 44 of the diff). Precision and pattern confirmed to match the cited precedent
exactly: `pathSignature` (`tests/helpers/path-signature.js`) rounds every coordinate to 4 decimals
before hashing (`Math.round(Number(num) * 1e4) / 1e4`), and `scene3d-hlr-spatial-index-identity.test.js`
(the file the impl report cites as the pattern source) genuinely uses the same helper at the same
default precision — verified by reading both files directly, not taken on the report's word. `1193cbe1`
(read directly: `git show --stat`) is real and fixed exactly this class of arm64-vs-x86_64 last-2-digit
drift for four other files using bit-for-bit MD5/exact-JSON comparisons; switching this new leg to
4-decimal `pathSignature` instead of the file's own 9-decimal `md5PathsAll` is the same fix, applied
proactively rather than reactively. **Residual risk, disclosed here since the brief asked for it
explicitly: 4-decimal rounding absorbs typical last-2-digit float drift but is not an absolute
guarantee against every possible arch-dependent rounding boundary** — a coordinate landing within
~5e-5 of a rounding boundary on one architecture and just past it on another could in principle still
flip a 4th-decimal digit and break a pin that is otherwise a correct fingerprint of unchanged geometry.
This is the same residual risk every other `pathSignature`-based golden guard in this codebase already
carries (not something W-38b introduced or made worse), and the "re-pin only with proof" convention is
the project's accepted mitigation for it, not full elimination — worth stating plainly rather than
letting "confirmed" imply zero risk.

**(5) 79/79 + 42/42 reproduced** — CONFIRMED, both independently re-run from a scratch export of
`141ed0b5` (not the impl's own worktree run):
- `tests/unit/scene3d-facet-min-rulings.test.js`: **79 passed (79)**, one benign
  `[vitest-worker]: Timeout calling "onTaskUpdate"` RPC warning on the run (same benign class other
  lane reports in this audit already log under machine contention; does not affect pass/fail).
- `tests/integration/scene3d-panel.test.js`: **42 passed (42)**.

**`## Bars changed` declares a NEW oracle replacing a vacuous one and nothing else moved** —
CONFIRMED. Read the full 193-line diff directly, twice. The only substantive change is: `EXPECTED_T1`
added (new), the `git show HEAD`/`execFileSync`/`preFixRuntime`/`preFixV` machinery removed, and T1's
body rewritten to use two legs instead of three. No other test file's threshold, tolerance, or
fingerprint is touched (T2's `<3`/`>=1`, T3's monotonicity, T4's ceiling, T7's `1.25x`,
T10's `1e-6` — none appear in this diff at all, confirmed by the diff itself containing no hunks
outside the `EXPECTED_T1` block and the T1 `describe` body).

**(6) Does the pinned range also touch W-35's `scene3d-slice-end-overlap.test.js`?** — Confirmed **it
should not, and it does not**: `git diff --stat 575f886d..141ed0b5 -- tests/unit/scene3d-slice-end-overlap.test.js`
is empty. That file **still carries the identical `git show HEAD:...`/`execFileSync` idiom** (confirmed
by grep + direct read: `const { execFileSync } = require('child_process');` and
`execFileSync('git', ['show', 'HEAD:${SCENE3D_REL}'...` are still present, unmodified) — this is
exactly LEDGER.md merge-checklist item 23's open item, correctly left untouched here as W-38b's brief
scoped it to W-38's own T1 only. Flagging again, as the ledger already does, that this sweep is still
required before W-35's own test file can be trusted as a standing regression guard.

---

## Follow-ups

1. **Non-blocking, correct the record**: `W-38b-impl.md`'s mutation-proof section states the 16 T1
   failures were "all on the new pinned-fingerprint leg." As measured, they were all on **leg 1** (the
   pre-existing four-origin no-op), which short-circuits before leg 2 is ever evaluated. The
   *conclusion* (leg 2 is non-vacuous) is still correct — I independently proved it by isolating leg 1
   out of the assertion chain — but the report's own evidence for it, as written, is not what it claims
   to be. Future reports making a "which leg failed" claim should quote the actual failing assertion's
   hash length/format (32 hex = md5/leg 1, 64 hex = sha256/leg 2) rather than asserting it.
2. **Not blocking, disclose plainly**: 4-decimal `pathSignature` rounding reduces but does not
   eliminate arch-dependent rounding-boundary risk to the 60 pinned literals (see condition 4). This is
   inherent to the technique this whole test family already uses post-`1193cbe1`, not a new defect —
   noted so a future CI failure on a different architecture is triaged as "maybe a boundary case,
   re-verify before re-pinning" rather than assumed to be a real regression or dismissed as never
   possible.
3. **Required, not new**: the LEDGER.md item-23 sweep for the same `git show HEAD` idiom in
   `scene3d-slice-end-overlap.test.js` (W-35) remains open. Correctly out of scope for W-38b itself
   (confirmed disjoint per condition 6), but unaddressed by this unit and still needed before that
   file's own pre-fix leg can be trusted.

No regression to the shipped `facetMinRulings` feature was found or implied by this unit — it is
tests-only, and the product's own byte-identity was already independently confirmed in the W-38
review through three non-vacuous channels unaffected by this follow-up. Recommend landing W-38b with
the record-correction and item-23 sweep tracked as follow-ups, not blockers.
