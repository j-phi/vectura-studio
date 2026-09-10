STATUS: ACCEPT

# U7 review — fold `weaveDepth` → `ampSpacing` (C-07, param `nesting`)

- **Lane / worktree under review**: `fill-collapse-2`, `.claude/worktrees/fill-collapse-2` (READ-ONLY —
  no edits, stash, or commits made in the worktree at any point; the W-30c implementer is now editing it,
  so the pinned range was archived immediately and the live worktree was never read again after archiving).
- **Pinned range**: `57aa71b2` (base, W-30b) `..` `90f3411f` (final) — includes the Incident-4 orchestrator
  checkpoint `bfe8fdb4` ("U7 checkpoint (unverified)"), reviewed as one range per the brief.
- **Method**: `git -C .claude/worktrees/fill-collapse-2 archive 57aa71b2` → scratch `u7-before`;
  `git archive 90f3411f` → scratch `u7-after`; `node_modules` symlinked into both from main. All numbers
  below are independently re-derived from these two exports (plus two real dev-server captures on scratch
  ports 8583/8584, killed after use) — none trusted from the implementer's worktree, `report.json`, or
  `U7-impl.md` without reproduction. Both scratch dirs, both dev servers, and the two capture output dirs
  were deleted at the end of the review.

## 0. Diff scope — PASS

`git -C fill-collapse-2 diff --stat 57aa71b2..90f3411f -- . ':!graphify-out'`: exactly 6 files —
`scripts/build-tone-laws.js` (+27), `src/config/scene3d-tone-laws.js` (regenerated, +26/−1),
`tests/integration/scene3d-fill-style-picker.test.js` (+10/−4), `tests/unit/scene3d-fill-style-effective-law.test.js`
(+35), `tests/unit/scene3d-tone-law-collapse.test.js` (+200), `tests/unit/scene3d-tone-laws-config.test.js` (+17/−8).
No touch to `surface-fill.js`, `surface-fill-mono.js`, `mappers.js`, `hlr.js`, `shadows.js`, or any UI file. Every
hunk in `scene3d-tone-law-collapse.test.js` is a single append at EOF (`@@ -1040,3 +1040,203 @@`) — it does not
touch the region `e429cfc5` (main, lines 127–165) or the four locations U9 (`fc8b0fba`) rewrote, so the three-way
merge hazard `STILL-OPEN.md` already documents (line 200) is not made worse by this unit.

## 1. RED — reproduced, semantic not vacuous

Copied the after-export's 4 test files onto the before-export (`57aa71b2` source, U7's tests) and ran them there:

- `scene3d-tone-laws-config.test.js`: **1/8 failed** — `expected 35 to be 34` (real count mismatch, not a
  `TypeError`).
- `scene3d-fill-style-effective-law.test.js`: **1/3 failed** — `expected undefined to deeply equal {into:
  'ampSpacing', params:{nesting:'nested'}}` (`ALIASES.weaveDepth` genuinely absent pre-fold).
- `scene3d-tone-law-collapse.test.js` (`-t "U7"` filter, 9 of 73 titles matched): **9/9 failed**, every failure a
  semantic mismatch (`expected 'weaveDepth' to be 'ampSpacing'`, `expected 'ampSpacing' to be 'weaveDepth'`, an
  `offenders` array populated with all 9 primitive×density combinations) — never a `TypeError`/module-load crash.

RED is real and for the right reason at every site.

## 2. GREEN — reproduced

Ran in the after-export (`90f3411f` source), foreground, `--pool=forks --poolOptions.forks.singleFork=true`
throughout (shared machine, several other sessions' vitest workers observed via `ps aux` during the run):

| suite | result | matches claim |
|---|---|---|
| `scene3d-tone-law-collapse.test.js` (full file) | **73/73**, 554.65s wall (1 benign `[vitest-worker]: onTaskUpdate` RPC timeout, pre-existing shared-machine noise per U0/U1-U5's own reviews) | yes |
| `scene3d-tone-laws-config.test.js` + `scene3d-fill-style-effective-law.test.js` | **8/8 + 3/3 = 11/11** | yes |
| `tests/integration/scene3d-fill-style-picker.test.js` (full file) | **144/144**, 21.2s | yes |

The remaining named batches (`scene3d-tone-law-plumbing`/`params`/`dispatch`/`faceted-tone-law`/`solid-cap-reachability`/
`one-pen-down-reachability`, claimed 56/56, and the `stroke-fill-style-control`+`scene3d-panel`+`scene3d-panel-style-live-sync`+
`context-bar-scene-flyouts`+shadow-tone-law files, claimed 134/134) were **not independently re-run** — the three suites
above are the ones that actually exercise U7's own diff (collapse mechanism, config bars, picker dead/alive count);
the other two batches are broad regression nets over machinery U7's diff does not touch (confirmed by diff scope in
§0). Not re-running them does not weaken this verdict; flagged for completeness, not as a gap.

## 3. Mutation kill — PASS

In the after-export, swapped the two `law` values inside `STYLE_PARAMS.ampSpacing.options` in the **generated**
`src/config/scene3d-tone-laws.js` (`single`→`weaveDepth`, `nested`→`ampSpacing`, i.e. mis-mapped IDs, not a
deletion) and re-ran `-t "U7"`: **4/4 U7-scoped tests failed** — byte-identity, migration, the caveat cross-check,
and the multi-primitive×density sweep all broke with correctly-diagnostic messages (e.g. `resolved to "ampSpacing",
not weaveDepth` across all 9 combinations). Restored the file from a pre-mutation copy and confirmed `diff` clean
(scratch-only; the worktree was never touched). The sweep is not vacuous.

## 4. Byte-identity — DOUBLE-PROVEN, both proofs independently reproduced

**Method 1 (in-tree resolver sweep, primitive × density, part of the regression suite above)**: confirmed via the
73/73 run — both new U7 describe blocks ("multi-primitive x multi-density: ... byte-identical across every
reachable primitive x density pair" and "... bare survivor ... unaffected by geometry or density") passed,
32.7s / 28.8s wall respectively.

**Method 2 (real headless-Chromium capture, independently re-run)**: started fresh dev servers on scratch ports
8583 (`u7-before`, `57aa71b2`) and 8584 (`u7-after`, `90f3411f`) and ran
`node scripts/audit/scene3d-capture.js --tier B --root <export> --port <port> --only
'^(torus|sphere|cone)__hatch__(ampSpacing|weaveDepth)__(low|med|max)__a$' --out <scratch>` from MAIN against
each, 18 cells both sides. **18/18 md5-identical between the true pre-U7 and post-U7 trees** — reproduced myself,
not read off `report.json`.

**Secretary flag 2 — stale-baseline symmetry, independently re-checked and CONFIRMED SYMMETRIC.** Diffed both the
before-capture and the after-capture against the committed `docs/3d-audit/fill-audit/shots/B/` gallery baseline:
both sides diverge from the gallery on the **identical 8 of 18 cells** — `torus` at all 3 densities (6 cells) and
`sphere`/`cone` at `low` only (2 cells) — and agree with the gallery on the other 10. The divergence set is
byte-for-byte the same set on both sides, so the 18/18 pre-vs-post claim is not being masked or coincidentally
matched by a stale third dataset; it is a genuine pre-tree-vs-post-tree identity, exactly as `report.json` states.

**Secretary flag 4 — is U7's harness stronger than U1–U5's, and should the earlier folds be re-swept?** Confirmed:
U1–U5's per-unit byte-identity tests (verified directly in the collapse file, e.g. "U1 (C-01, ladder/rungMode) >
byte-identity") run on a single sphere-only, density-unparametrized harness — U7 is the first unit in this chain to
parametrize primitive × density. This is real, and `STILL-OPEN.md:297` already records it in the same words. It is
not a defect in U7 — U7 was asked to prove `ampSpacing` specifically to a higher bar than the chain's own precedent
because of the F1-placement dependency, and it did. **Recommendation for the merge checklist (not a REJECT
condition): re-run U1–U5's five survivor/folded pairs through U7's multi-primitive×density harness once at
merge**, since the harness now exists and is cheap to reuse — closes the asymmetry rather than leaving it as a
standing gap between clusters.

## 5. The caveat condition — PASS, traced at the code level, not just test-observed

Read `SCENE_FILL_STYLES.effectiveLaw` (`context-bar.js`) and `Params.resolveToneLaw` (`params.js`, untouched by
this diff) directly. Both are fully data-driven off `STYLE_PARAMS`/`ALIASES` — neither has any U7-specific code,
confirming the "no other file changes" claim structurally, not just via `git diff --stat`.

**Secretary flag 3 — is the non-empty default caveat genuinely `ampSpacing`'s own, or `weaveDepth` leaking
through?** Traced `effectiveLaw('ampSpacing', {})` by hand: `bag.nesting` is `undefined`, the descriptor lookup
falls through to the `default` option (`value:'single'`), and the function's own guard
(`if (!matched || matched.value === d.default) return;`) explicitly **skips** marking that option "active" — so
`activeCount` stays `0` and the function returns the **bare survivor id `'ampSpacing'`**, never `'weaveDepth'`.
`FS.note('ampSpacing').caveat` then reads `BY_ID.ampSpacing`'s own entry. This is confirmed independently three
ways: (1) the code trace above, (2) `docs/tone-laws/laws.json` has two distinct, real caveat strings for the two
ids (confirmed by reading the raw corpus, not the generated config) matching the report's quotes verbatim, and
(3) the live screenshots `after/U7/ampSpacing-single-crop-native.png` / `ampSpacing-nested-crop-native.png` —
**LOOKED at directly** — show the exact matching caveat text at each `Nesting` state, word for word against
`laws.json`. No leakage; the default state genuinely surfaces `ampSpacing`'s own caveat, a real new UI state this
chain had not produced before (U4/U5's survivors had no caveat of their own).

## 6. The Nesting sub-control — PASS

`scripts/build-tone-laws.js` diff adds exactly one `COLLAPSE` row: `ampSpacing: [{key:'nesting', label:'Nesting',
default:'single', options:[{value:'single', law:'ampSpacing'}, {value:'nested', law:'weaveDepth'}]}]` — matches
the plan's contract shape exactly (§2.1). Regenerated `src/config/scene3d-tone-laws.js` from the after-export's
`scripts/build-tone-laws.js` and `docs/tone-laws/laws.json`: **byte-identical to the committed file** (own repro,
not trusted). Build script prints `PICKER_IDS 34, ALIASES 14`, `48 law(s) (37 production / 11 library)` — matches
every unchanged guard (§0's stop-condition-2 checks hold). `.vectura` round-trip both directions is covered by the
passing "migration" test (folded `weaveDepth` bag → survivor + `nesting:'nested'`, byte-identical, never
clobbering an explicit sibling key) plus the trivial pass-through for a bag that already stores `ampSpacing`
(default descriptor path, covered by the byte-identity test). `docs/tone-laws/laws.json` is confirmed **untouched**
(`diff` clean between the two scratch exports' copies) — `SCENE3D_TONE_LAWS.VERSION` (`1819221f…`) is therefore
unchanged, and a repo-wide grep found **no test anywhere pins that VERSION string**, so nothing was silently
re-pinned.

## 7. `## Bars changed` — honest, and the one behavioral claim independently re-verified

Two bars, both disclosed in `U7-impl.md` and both confirmed to be the **only** numeric changes in the diff (grepped
the full test-file diffs; nothing else moved):

1. `tests/unit/scene3d-tone-laws-config.test.js:117` — `EXPECTED_PICKER_IDS_LENGTH` 35 → 34; `ALIASES` gained
   `weaveDepth` (13 → 14). Directly reproduced: `PICKER_IDS.length` 35 at `57aa71b2`, 34 at `90f3411f`.
2. `tests/integration/scene3d-fill-style-picker.test.js:398` — box dead-count 25 → 24.

**Secretary flag 1 — is "weaveDepth dead on a box exactly like ampSpacing" true, or does the bar bump mask a real
loss of an offered option?** Independently re-verified via the real runtime loader (`loadVecturaRuntime`, the same
harness the test itself uses — not a bare `require`, which fails open on the mono-law gate) in the **before**
export: `F.groups('box')` returns `weaveDepth: {label:"Weave Depth — no effect here", disabled:true}` and
`ampSpacing: {label:"Amplitude Spacing — no effect here", disabled:true}` — both genuinely dead pre-fold, both
`isMono()` false, `dead.length` 25 / `alive.length` 11, matching the U5-era baseline exactly. Post-fold,
`weaveDepth` is not offered at all (folded away) and `ampSpacing` is still dead-but-offered, so `dead` correctly
drops by exactly 1 to 24 while `alive` (11, unaffected — neither id is a mono law) stays put. The bar change is an
honest recount, not a masked capability loss — no option that was reachable became unreachable, and no option that
was unreachable became silently hidden without accounting.

## 8. The Nesting sub-control / presets — PASS

`grep -rl "toneLaw" user-presets/` and `grep -rlE "ampSpacing|weaveDepth" user-presets/ src/config/user-presets.js`
both re-run in the after-export: **0 files**, matching the claim and the standing U1→U5 contract (§2.3 of the
plan — zero shipped-preset exposure, bundler correctly not run).

## 9. PNGs — LOOKED at directly

- `after/U7/ampSpacing-single-crop-native.png`: Fill Style "Amplitude Spacing", Nesting "Single wave row", a real
  red caveat paragraph present and matching `laws.json`'s `ampSpacing` entry verbatim.
- `after/U7/ampSpacing-nested-crop-native.png`: Nesting "Nested rows", caveat text swapped to `weaveDepth`'s own,
  distinct wording ("isWaveLaw()/WEIGHT_LAWS", "(lowered) plot floor") — also verbatim against `laws.json`.
- Converted (`sips`) and read `torus__hatch__ampSpacing__med__a.webp` / `…weaveDepth…` from the gallery capture
  directly (not the implementer's own crop): both a torus in a wavy zigzag/diamond crosshatch lattice;
  `weaveDepth`'s rows are visibly denser/tighter than `ampSpacing`'s, matching the "~1.4× denser" note — a real,
  honest picker-tier near-duplicate, not a rendering-tier duplicate.

## 10. Merge notes

- **`e429cfc5` (main) / U9 `fc8b0fba` (handoff-c2) three-way collision on `scene3d-tone-law-collapse.test.js`**
  (`STILL-OPEN.md:200`): U7's own contribution to that file is a clean EOF append (§0) — it does not touch either
  hazard's lines. This does not resolve the pre-existing three-way hazard; it just confirms U7 did not deepen it.
  The rebase-by-hand-and-rerun-whole instruction in `STILL-OPEN.md:200` still stands for whoever integrates all
  three.
- **U5b/U5b-2/3** (`49475ccd`, `1e681432`) land chronologically before U7's base `57aa71b2` on the same lane —
  sequential, not a merge concern for this unit.
- **W-30c** is confirmed queued to start only after U7 closes (`LEDGER.md:211`, `STILL-OPEN.md:270`) — consistent
  with this review's scope ending cleanly at `90f3411f`.
- Recommend (§4 above): re-sweep U1–U5's pairs through U7's multi-primitive×density harness at merge, to remove
  the asymmetry between clusters' byte-identity rigor — not blocking.

## 11. Process notes

- Order deviation (U7 before U6) is correctly explained and matches `LEDGER.md` row 12/197: U6 (`penStipple`) is
  `FROZEN-ON-JAY`, not a file collision, so running U7 next was correct; the config test's own comment documents
  the reason in place.
- Report is thorough and every number in it that was checked reproduced exactly — no report-accuracy discrepancies
  found (unlike U0's "342 vs 335" or U1-U5's "21 vs 18" slips).

## Verdict

**ACCEPT.** RED is real, GREEN reproduces (73/73, 11/11, 144/144, independently run), the mutation kill is clean,
byte-identity is double-proven and the stale-baseline symmetry claim holds under independent re-capture, the caveat
condition is proven both by code trace and by live screenshot against the raw `laws.json` corpus, the two disclosed
bars are the only bars that moved and both are honest (the box dead-count behavioral claim independently
re-verified true), preset exposure is zero, and the diff is provably confined to picker-tier config + tests with no
touch to `surface-fill.js`/`shadows.js`/UI files. One non-blocking merge-checklist recommendation: re-run U1–U5's
byte-identity pairs through U7's stronger (primitive × density) harness once at merge, since U7 is the first unit
in the chain to build that harness and the earlier units' single-cell claims would benefit from the same rigor.
