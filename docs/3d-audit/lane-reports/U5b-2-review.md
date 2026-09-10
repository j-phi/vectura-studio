STATUS: ACCEPT-WITH-FOLLOWUPS

# U5b-2/3 review — plain-language caveat copy + effectiveLaw ≡ resolveToneLaw cross-check

**Reviewer scope:** adversarial review of unit U5b-2/3, lane `fill-collapse-2`
(`.claude/worktrees/fill-collapse-2`, branch `3d-scene/fill-collapse-2`), pinned range
`49475ccd..1e681432` (includes the orchestrator's unverified WIP checkpoint `eea613fd`,
reviewed as part of the range as instructed). Read-only in the worktree throughout — never
edited, stashed, or deleted anything there. All mutation/reproduction work done in scratch
exports (`/private/tmp/claude-501/scratch-U5b2-pre`, `-post`, `-pre-red`), all deleted at
the end of this review. A second implementer (W-30b) is actively working in this shared
worktree (`src/core/algorithms/scene3d.js` modified, three untracked scratch-debug files,
one untracked test file) — none of this is mine; confirmed by `git status` at both the
start and end of this review, and it sits entirely outside my pinned range.

Read first, per instructions: `AGENT-PROTOCOL.md` §Reviewers, `U5b-2-impl.md`,
`U5b-review.md` (the follow-up definitions U5b-2/U5b-3 and the proposed wording),
`.claude/worktrees/fill-collapse-2/docs/3d-audit/lane-reports/U5b-impl.md`, and
`docs/3d-audit/fill-audit/after/U5b-2/*`.

## Verdict summary

Both follow-ups are implemented correctly, minimally, and match the review's own proposed
wording almost verbatim. RED/GREEN is real (proved independently by me, not re-asserted from
the report): the plain-language tests genuinely fail against the pre-existing jargon copy,
and the generative cross-check genuinely fails when I hand-mutated one resolver to disagree
with the other — including on the explicit UNREPRESENTABLE-case test, which is NOT
universally vacuous (see condition 1). No rendering change, no hidden bar changes, VERSION
hash is a pure drift detector nowhere re-pinned as a literal. The file split lost nothing
semantically. One real, non-blocking documentation-accuracy gap keeps this at
ACCEPT-WITH-FOLLOWUPS rather than a clean ACCEPT: the report's own line-count accounting
(and the secretary's STILL-OPEN.md echo of it) understates the actual collapse-file diff by
25 lines.

## Condition-by-condition, with exact numbers I measured

### 1. U5b-3 RED, generative coverage, and the UNREPRESENTABLE case (secretary flags 1 & 2)

Reproduced in scratch exports (`git archive 49475ccd` / `1e681432`, `node_modules`
symlinked from the worktree — never by stashing/editing the worktree).

- **New file exists only post-split**: `tests/unit/scene3d-fill-style-effective-law.test.js`
  is present at `1e681432`, absent at `49475ccd`. Baseline run at post: **2/2 pass**.
- **Generative coverage vs. the U1→U5 fold list**: read `STYLE_PARAMS` directly from the
  built `src/config/scene3d-tone-laws.js` — 5 survivors (`ladder`, `taperedEnds`,
  `weightModulated`, `bundleCount`, `contFieldSigmoid`) whose declared `options[].law`
  values enumerate exactly the 13 folded ids from U1-U5 (`fineLadder`,
  `phaseFineLadder`, `perceptualRamp`, `whiteBand`, `nibAngle`, `weightSmoothstep`,
  `bundleEased`, `bundleDither`, `bundleHandoff`, `contFieldFore`, `contFieldSurface`,
  `contFieldQuant`, `contFieldTouch`) plus the 5 survivors themselves = **18 ids**, matching
  the U5b reviewer's own count. The test's cross-product walks every descriptor's option
  list (which is exactly this set) plus `__garbage__` plus `undefined` — every folded id is
  therefore exercised by construction, not by name-listing. Combo count I hand-derived from
  `STYLE_PARAMS` (1 descriptor × 4-6 values per single-descriptor survivor,
  2 descriptors × 6×4 for `contFieldSigmoid`) = **6+5+4+6+24 = 45**, matching both the
  test's `toBeGreaterThanOrEqual(45)` floor and the U5b reviewer's independently-run manual
  fuzz test.
- **RED by mutation, done by me, not re-derived from the report.** Patched
  `src/core/scene3d/params.js`'s `resolveToneLaw` in the **post**-sha scratch tree, changing
  only the final `return activeCount === 1 ? activeLaw : raw;` to
  `return activeCount >= 1 ? activeLaw : raw;` (a one-rule change, disagreeing with
  `effectiveLaw`'s untouched `activeCount === 1` only in the ≥2-active/UNREPRESENTABLE
  case). Result: **both tests in the new file fail**, on real assertions:
  - Cross-product test: `expected 'contFieldSigmoid' to be 'contFieldTouch'`.
  - **The explicit UNREPRESENTABLE-case test also failed**:
    `expected 'contFieldTouch' to be 'contFieldSigmoid'`.
  Reverted the mutation; diffed back to clean.
- **Secretary flag 1, answered directly**: the implementer's own RGR proof used a stub
  (`effectiveLaw = (survivorId) => survivorId`) under which the UNREPRESENTABLE-case test
  passes vacuously (both resolvers happen to agree the stub is "correct" for that one input
  by coincidence — the *survivor* IS the correct fallback there, and the stub always returns
  the survivor). That specific self-disclosed vacuity is real and honestly reported. But it
  is not a general property of the test: my `activeCount >= 1` mutation — a realistic
  boundary-condition bug in the ≥2-descriptor fallback branch, not an identity stub — makes
  the UNREPRESENTABLE-case test fail on its own terms. So the test is not dead weight; it is
  vacuous only under the one mutation shape the implementer happened to pick for their RED
  proof, and I found and ran a mutation under which it does real work. Functionally the case
  is a subset of the cross-product's own combos (both hit the identical
  `{fieldMetric:'surface', fieldFloor:'touch'}` bag), so the two tests are not
  independent evidence of *different* code paths — but the explicit test is legitimate
  regression-pin value (a future refactor of the cross-product loop's shape, or someone
  narrowing `checked >= 45` reasoning, still leaves this one named and pinned).

### 2. RED taken from 49475ccd, not from the dead implementer's unverified checkpoint (secretary flag 2)

- Copied the **post-sha (1e681432)** test files into a **fresh** `49475ccd` scratch export
  (not the checkpoint) and ran them:
  - `scene3d-fill-style-effective-law.test.js`: **2/2 pass already at 49475ccd** — expected
    and disclosed by the implementer: `effectiveLaw` already existed from U5b, and
    `resolveToneLaw` is untouched by this unit, so there is no production-code RED to find
    between these two shas for U5b-3; the only honest RED is the mutation proof above
    (which I reproduced independently, not the implementer's).
  - `scene3d-tone-law-collapse.test.js -t "U5b-2"`: **2 of 3 new tests genuinely fail** at
    49475ccd: `expected 'A negative result, kept as one: wavin…' not to match /.../` (jargon
    regex) and the same string failing to match `/Dithered|Count mode|Integer pass count/`.
    This is real RED against real pre-existing audit-prose copy, not a TypeError shape.
- **Roster rebuild re-derived independently, not read off the report.** In the fresh post-sha
  export: `git hash-object docs/tone-laws/laws.json` = `1819221f2a80c42be1ede76b2e8cee274d4b392b`,
  exactly the committed `VERSION`. Ran `node scripts/build-tone-laws.js` fresh and diffed its
  output against the committed `src/config/scene3d-tone-laws.js`: **byte-identical**. Also
  hashed `laws.json` at the pre-sha (49475ccd) export: `363e6c556530e8d473563841aec8e06a4ae245c9`
  — confirms the hash genuinely moved because the caveat text changed, not a coincidental
  match.

### 3. VERSION hash — grep beyond `tests/` (secretary flag 3)

`grep -rn "SCENE3D_TONE_LAWS\.VERSION"` across the **entire worktree** (not just `tests/`) —
`src/`, `tests/`, docs, fixtures — returns exactly **one** hit: the definition itself at
`src/config/scene3d-tone-laws.js:1152`. Nothing pins the literal hash value (old or new)
anywhere. Confirmed this is a pure drift detector, not a hidden re-pin.

### 4. File split lost nothing semantically, and rebase-safety (secretary flag 4)

- Diffed the `U5b-3` `describe(...)` block as it existed in the orchestrator's checkpoint
  `eea613fd` (lines 1061-1116 of that commit's collapse file) against the equivalent block
  in the new file `1e681432`: **byte-identical** (`diff` exit 0) — the split moved the test
  logic verbatim, only the surrounding header comment was rewritten/expanded (adding the
  "why a new file" rationale) and a pointer comment was added to the collapse file.
- Test-count accounting the implementer gives (61/61 pre-split → 59/59 + 2/2 post-split)
  reproduces exactly: I independently ran `scene3d-tone-law-collapse.test.js` at post-split
  twice (once directly, once via a stray backgrounded run) — **59/59 both times** — and
  `scene3d-fill-style-effective-law.test.js` — **2/2** — matching 61 total, no loss.
- **Rebase-safety against `e429cfc5` and U9's four sites**: per `STILL-OPEN.md` lines 206 and
  213, `e429cfc5`'s only hunk in this file is lines 127-165 (chunking tests "4."/"5." for CI
  timeout, no behavior change) and U9's four sites survive shifted by exactly `+19` lines
  each. This unit's own addition sits at the **end of the file** (after the U5 
  caveat-visibility-gap block, before nothing) — it does not overlap either of those hunks'
  line ranges, so a 3-way merge of `e429cfc5` + U9's `fc8b0fba` + this unit's tail-appended
  block is a textually disjoint, mechanical merge (append-after-append), not a semantic
  collision. I did not perform the actual 3-way rebase (out of scope for a range review of
  `49475ccd..1e681432` in isolation, and `STILL-OPEN.md` already correctly flags this as
  "the remaining hand-merge, owed at merge time, not at unit-review time") but confirm the
  structural claim ("now a small one") is accurate based on where each hunk lands.
- **Line-count discrepancy, found independently (see "Bars/accounting" below): the actual
  measured diff is +69 lines, not +44.** This does not change the semantic-loss verdict
  (nothing is missing) but the size claim itself is off by 25 lines in both the impl report
  and `STILL-OPEN.md`'s echo of it.

### 5. U5b-2 copy — plain language, ≤2 sentences, both surfaces, roster-only

- Read `laws.json` `caveat` fields directly (line 193 `bundleDither`, line 241
  `contFieldTouch`): text matches the crops and `report.json`/`raw-capture-results.json`
  verbatim, no RMS/R²/L*/"sphere·hatch"-as-bare-token/"negative result" jargon, each
  reads as 2 plain sentences naming an actual UI control ("Integer pass count", "Field
  floor").
- **RED reproduced for the copy tests too** (condition 2 above) — 2 of 3 U5b-2 tests
  genuinely fail against the pre-existing jargon text at 49475ccd.
- **Single-source, both surfaces confirmed**: `git diff --stat 49475ccd..1e681432 -- src/`
  is **empty** except for the regenerated `src/config/scene3d-tone-laws.js` (a pure data
  file, +3/-3 lines, the two caveat strings). No UI file (`scene3d-panel.js`,
  `context-bar.js` shell) was touched in this unit at all — both already read
  `FS.note(FS.effectiveLaw(...)).caveat` off the same roster since U5b, so both surfaces get
  the new copy automatically, with zero risk of the two surfaces drifting.
- **`note.text` and the (i) popover unchanged**: guaranteed by the same empty `src/` diff
  above — no code path that reads `.text`/`mechanism`/`strengths`/`weaknesses` was touched.
- **No stray duplicate copies of the old jargon left reachable**: grepped the whole worktree
  for the old strings — every remaining hit is inside `weaknesses`/`strengths`/`refutations`
  fields (a different field the review never asked to be rewritten) or inside code
  *comments* (`context-bar.js:266`, `scene3d-panel.js:702`) documenting the *mechanism*
  historically, never inside a live `caveat` field or displayed string. `docs/tone-laws/README.md`
  untouched.

### 6. No rendering change — `SF.buildObject` md5

Ran the same `captureOpts('hatch')` harness the collapse suite itself uses (sphere,
orthographic camera, `mapper: 'hatch'`), md5 of `JSON.stringify(result)`, pre (49475ccd) vs
post (1e681432), for the same 7 laws the U5b reviewer used:

| law | pre md5 | post md5 | match |
|---|---|---|---|
| ladder | `527afc02b04aebee9121edbb3b955306` | same | yes |
| bundleCount | `104af6489116ca38e06a7280f8a8b5c3` | same | yes |
| bundleDither | `3a5cf8197385b5cbaa74db9ab671a02a` | same | yes |
| contFieldSigmoid | `6bc7e45575f38780ebc418b171da1201` | same | yes |
| contFieldTouch | `0bae0be8a34d727418cd944aa6fb882f` | same | yes |
| taperedEnds | `366281bb0e25e65a0b2e35d91c4d55bf` | same | yes |
| weightModulated | not measured — see note | — | — |

**6/6 measured, byte-identical, 0 differences**, and all 6 hashes match the U5b review's own
published pre/post table exactly (this unit didn't move them either). `weightModulated`'s
run hung under heavy concurrent machine load (many other worktree sessions running vitest
simultaneously, confirmed via `ps aux`) past 20 minutes with no output progress; I killed it
rather than let it run unbounded. Given this unit's `src/` diff is empty except a pure data
file (condition 5), and 6/7 of the same laws the prior reviewer checked are confirmed
byte-identical, I judge the 7th non-measurement a low-risk gap, not a blocker — there is no
code path connecting `laws.json`'s `caveat` string to `buildObject`'s geometry output.

### 7. `## Bars changed` — honest, but the accounting elsewhere is off by 25 lines

- No numeric threshold, tolerance, count bar, or pinned fingerprint changed anywhere in this
  unit's diff — confirmed by inspection of the full `git diff 49475ccd..1e681432`. "Bars
  changed: None" is accurate.
- **The VERSION hash movement is correctly disclosed and correctly characterized** — see
  condition 3.
- **Line-count accounting error, found independently**: the report states "The collapse
  file's remaining diff over `49475ccd` is now `+44` ... instead of `+143`" and
  `STILL-OPEN.md` line 213 independently echoes the same `+44` figure. I measured the actual
  diff directly: `git diff 49475ccd..1e681432 -- tests/unit/scene3d-tone-law-collapse.test.js`
  numstat reports **69 insertions, 0 deletions**; counting raw `+` lines in the unified diff
  (minus the `+++` header) gives the same **69**. The `+44` figure appears to count only the
  three tests' own lines, excluding the ~17-line explanatory header comment above them and
  the ~6-line pointer comment at the file's tail — both of which are real, committed,
  additive lines in this unit's diff. This is a documentation-accuracy gap, not a hidden
  behavior change (I've independently confirmed the full +69 lines are exactly the header
  comment + the byte-identical U5b-2 describe block + the pointer comment, nothing else) —
  non-blocking, but the orchestrator/merge should use **+69**, not +44, when doing the actual
  3-way hand-merge line-accounting `STILL-OPEN.md` still owes.

### 8. PNGs — looked at them myself

Read all 4 non-baseline images and both baselines directly from
`docs/3d-audit/fill-audit/after/U5b-2/` (on MAIN, per this unit's brief — confirmed correct,
since U5b-2/3 deviates from U5b's worktree-only evidence precedent by instruction):

- `bundleCount-baseline-no-caveat.png` / `contFieldSigmoid-baseline-no-caveat.png`: real app,
  Object 3D leaf, Style tab, survivor sub-control at default, "V.1.3.99" badge visible,
  Layers panel correctly shows "1 layers" / the added object — **no** red caveat paragraph in
  either. (Note: this capture harness does NOT reproduce the "0 layers"/"No layers yet"
  cosmetic quirk the U5b reviewer flagged on the earlier evidence — the layer list renders
  correctly here.)
- `bundleDither-crop-native.png`: "Fill Style: Bundle · Count", "Bundle mo…: Dithered", red
  caveat paragraph reads *"Dithered bundle mode can make repeating patterns (moire) more
  visible than the default Count mode, not less. If you see new banding, switch back to
  Integer pass count."* — matches `laws.json` line 193 verbatim, ≤2 sentences, no jargon,
  names real UI values.
- `contFieldTouch-crop-native.png`: "Field metric: Screen metric" (default, unchanged),
  "Field floor: Ink-width floor", red caveat paragraph reads *"On crosshatch fills, this
  floor setting floods the whole surface to solid black with no shading left. If your fill
  looks like a solid dark blob, try a different Field floor option."* — matches `laws.json`
  line 241 verbatim.
- Both full-app screenshots and `raw-capture-results.json`/`report.json` are internally
  consistent with the crops (same strings, `beforeCaveat: false`, `pageErrors: []`,
  `versionMatch: true`).

### 9. CHANGELOG line — accurate, one minor wording nit

Proposed line: *"Improved: the Fill Style picker's caveat for Dithered bundle mode and
Ink-width field floor now explains the effect in plain language (what you'll see, what to do
about it) instead of raw measurement numbers."* Accurate in substance. One small imprecision:
the sub-control's option label is **"Ink-width floor"** (under the descriptor **"Field
floor"**), not "Ink-width field floor" — the line conflates the descriptor name and the
option label into one compound phrase that doesn't exactly match either UI string. Cosmetic;
recommend the orchestrator tighten to "...Dithered bundle mode and the Ink-width floor
option..." at merge time, not blocking.

## Files touched (confirmed via `git diff --stat 49475ccd..1e681432`)

`docs/tone-laws/laws.json` (+2/-2), `src/config/scene3d-tone-laws.js` (+3/-3, regenerated),
`tests/unit/scene3d-fill-style-effective-law.test.js` (**new**, +87), 
`tests/unit/scene3d-tone-law-collapse.test.js` (+69/-0, not +44 — see condition 7), plus 6
PNGs + `report.json` + `raw-capture-results.json` under
`docs/3d-audit/fill-audit/after/U5b-2/` on main. Zero `src/ui/*` or `src/core/*` (other than
the regenerated config data file) touched. Two commits in range: `eea613fd` (unverified
checkpoint, now verified) and `1e681432` (the split + this unit's actual close).

## Open items / required follow-ups (none blocking)

1. **Line-count correction**: the `+44` figure quoted in `U5b-2-impl.md` and echoed in
   `STILL-OPEN.md` line 213 should read **+69** — the difference is the header/pointer
   comments, which are real committed lines. Fix at merge-time bookkeeping, not a code
   change.
2. The one unmeasured `SF.buildObject` md5 (`weightModulated`, hung under machine load,
   killed after 20+ min) should be re-run once the shared machine is less loaded, for
   completeness — low risk given the empty `src/` diff, but worth closing out before the
   final merge sign-off.
3. CHANGELOG wording nit (condition 9) — cosmetic, fix when the orchestrator applies the
   line at merge (CHANGELOG.md is shared-contention, correctly left untouched by this unit).
4. Previously-open items carried from `U5b-review.md`, still not this unit's job: the
   `ROUND2-BRIEFS.md` "Files ALLOWED" correction for `src/ui/shell/context-bar.js`, and
   W-30b (now separately in flight on this same worktree, base `1e681432`, outside this
   review's pinned range).
