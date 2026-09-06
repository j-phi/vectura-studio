STATUS: ACCEPT-WITH-FOLLOWUPS

# U0 review — fill-collapse (tone-law collapse foundation)

- **Lane / worktree**: fill-collapse, `.claude/worktrees/fill-collapse` (read-only; no edits/stash/commits made)
- **Pinned range**: `142afe58..a8d84bef` (a U1+ implementer is now layering commits on top of `a8d84bef` in the
  live worktree — ignored per instruction; this review is scoped strictly to the pinned range)
- **Method**: `git archive 142afe58` → `.../scratchpad/u0-before`, `git archive a8d84bef` → `.../scratchpad/u0-after`,
  `node_modules` symlinked into both from main. All RED/GREEN/byte-identity claims below were independently
  re-derived from these two exports, not from the implementer's worktree state.

## 1. Scope — PASS

`git diff --stat 142afe58..a8d84bef`: exactly 8 files (`scripts/build-tone-laws.js`, `src/config/context-bar.js`,
`src/config/scene3d-tone-laws.js`, `src/core/algorithms/scene3d.js`, `src/core/scene3d/params.js`,
`src/ui/panels/scene3d-panel.js`, `src/ui/shell/context-bar.js`, `tests/unit/scene3d-tone-law-collapse.test.js`).
601 insertions / 6 deletions. `surface-fill.js`, `surface-fill-mono.js`, `mappers.js`, `hlr.js`, `shadows.js` —
untouched (confirmed by the stat output naming none of them). `scene3d.js`'s "2 lines" is genuinely 2 substantive
code lines (`toneLaw: Params.resolveToneLaw(sp)`, and the `facetedToneLaw` resolve-before-membership-test), the
rest of the +16 is comment. Both sites are inside the single `generate: (params...) => {...}` closure (starts
line 565) where `const Params = Vectura.Scene3D.Params` (line 566) is already in scope — verified by reading the
surrounding closure, not assumed.

## 2. Byte-identity — PASS, independently reproduced (stronger proof than the implementer's own)

The implementer compared the after-export's captures against main's existing `shots/B/` gallery baseline. I
instead captured the SAME 48 `torus__hatch__<law>__med__a` cells directly from **both** scratch exports on fresh
ports (8503 = before/142afe58, 8504 = after/a8d84bef, both killed after use) and diffed md5s between them —
a true before/after of this exact unit, not a comparison against a possibly-stale gallery.

- Both exports produced **47** of the 48 cells (`originSpiral` absent from both — Tier B reachability on torus
  excludes it before AND after, consistent with W-10d already being in this lane's base `142afe58`).
- **47/47 md5-identical**, 0 differences.
- Picker option count: `SCENE_FILL_STYLES.groups(null,null,null)` totals **49 before and 49 after** (measured
  directly in both exports via a small Node script, not read from a test file).

## 3. The shim (write-back at LOAD + unknown-id fallback) — PASS, independently verified

Ran a script against the after-export's real runtime (`loadVecturaRuntime`), injecting a synthetic
`ALIASES.legacyLaw = { into: 'ladder', params: { rungMode: 'fine' } }` (the same style U1-U8 will use for real
clusters) and calling `Params.normalizeStyle` — the function that runs on document load/normalize:

```
normalizeStyle({ mapper:'hatch', params:{ toneLaw:'legacyLaw' } }).params
  → { toneLaw: 'ladder', rungMode: 'fine' }
```

This is the write-back-at-load behavior the task asked me to confirm, and it matches the shape of the LEDGER's
standing W-10d-2 write-back ruling (rewrite into the params bag so the Style tab agrees with what renders) even
though that ruling was written for a different unreachability case — U0's alias shim is the same pattern applied
to folded ids.

Unknown-law fallback: `normalizeStyle({ params:{ toneLaw:'totallyMadeUpLawXYZ' } })` produces the **identical**
console warning text and `toneLaw:'ladder'` fallback in BOTH the before and after exports — no new throw path,
no message change. `resolveToneLaw` returns the unknown id unchanged (identity), never throws.

## 4. RGR proof (`scene3d-tone-law-collapse.test.js`) — PASS, independently reproduced

Ran the test file (copied unmodified) against the **before** export (true `git archive`, not stash):
**5 failed / 3 passed** — RED confirmed independently (test 1 "IDS.length===48" and edge-identity cases that
don't touch the new exports pass; everything touching `PICKER_IDS`/`ALIASES`/`STYLE_PARAMS`/`resolveToneLaw`
fails, e.g. `FS.styleParams is not a function`, `expected undefined to be 'fine'`).

Ran it against the **after** export: **8/8 pass**, 386s total, including the byte-identity sweep (255s) and the
mutation-proof (130s) — timings match the implementer's report closely, confirming these are real measured work,
not a hang.

Mutation-proof detail: the plan's brief says "confirm 47 failures"; the implementer measured **48** and
justified the deviation ('ladder' is deliberately excluded from the 48-id roster). I verified this directly:
`IDS.indexOf('ladder') === -1` in both exports. The implementer's number is correct; the plan's stated 47 was
wrong, not the implementer's math. Correctly caught and documented, not a fudge.

## 5. Generated-file discipline — PASS

Re-ran `node scripts/build-tone-laws.js` inside the after-export and diffed the regenerated
`src/config/scene3d-tone-laws.js` against the committed one: **byte-identical**. The four integrity throws
(every `ALIASES` key ∈ `IDS`; every `.into` ∈ `PICKER_IDS`; every option `.law` ∈ `IDS`;
`PICKER_IDS ∪ keys(ALIASES) === IDS`) are all present in `scripts/build-tone-laws.js` exactly per plan §2.1.

## 6. Guards — independently re-ran 335 of the 342 claimed tests, all green

Re-ran (foreground, one/few files at a time, in the after-export) 15 of the 15 named files:
`scene3d-tone-law-collapse` 8/8, `scene3d-tone-laws-config` 7/7, `scene3d-tone-law-plumbing` 5/5,
`scene3d-tone-law-params` 13/13, `scene3d-tone-law-dispatch` 7/7, `scene3d-faceted-tone-law` 19/19,
`scene3d-solid-cap-reachability` 6/6, `scene3d-shadow-tone-law` 20/20,
`scene3d-shadow-tone-law-uniqueness` 3/3, `scene3d-one-pen-down-reachability` 5/5,
`scene3d-fill-style-picker` 131/131, `scene3d-panel` 36/36, `scene3d-panel-style-live-sync` 6/6,
`context-bar-scene-flyouts` 39/39, `stroke-fill-style-control` 30/30. All pass, matching the implementer's
per-file counts exactly. The benign `[FillBoolean] polygon union failed on degenerate geometry` warnings and two
`[vitest-worker]: Timeout calling "onTaskUpdate"` RPC errors reproduced on my machine too — pre-existing engine
behavior / shared-machine harness noise, not test failures (0 failed in every run).

**Finding — headline count does not match its own table.** The implementer's per-file table sums to **335**, not
**342** as the report's headline states (8+7+5+13+7+19+6+20+3+5+131+36+6+39+30 = 335). I independently confirmed
all 335 pass; there is no evidence of 7 additional failing or hidden tests — this reads as an arithmetic slip in
the report, not a correctness defect. Non-blocking; fix the number in the record.

## Secretary's six flags — addressed

1. **Sub-control loop DOM footprint when empty.** Read the actual code (`scene3d-panel.js` ~665,
   `shell/context-bar.js` ~1596): `FS.styleParams(law).forEach((d) => { ... o.row(d.label) / flyRow(fly, ...) ... })`
   — the row/host element is created **inside** the forEach callback, not before it. An empty `[]` runs the
   callback zero times, so zero DOM nodes are inserted — not an empty wrapper. Resolved by inspection, not
   inference; the md5-identical canvas proof was never going to catch this, but the code structure itself
   rules out the concern.
2. **`persistentStyleKeys()` dropping a base key.** `const base = ['fillDensity','fillAngle','toneLaw']; ...
   return base.concat(extra);` — `base` is a fixed literal always present first; `extra` only appends. It cannot
   drop or reorder one of the 3 base keys under any `STYLE_PARAMS` content. Resolved by inspection.
3. **Synthetic-alias tests are the only mechanism proof.** Confirmed correct and restored: tests 6/7 monkey-patch
   `R.ALIASES`/`R.STYLE_PARAMS` inside `try/finally`, and test 8 (which asserts `ALIASES === {}`-equivalent
   behavior — `styleParams('ladder')` returns `[]`) ran immediately after in my own full 8/8 run and passed,
   proving no leakage between tests. Agree with the secretary's forward-note: U1 should add real-cluster cases
   alongside (not necessarily instead of) the synthetic ones, since the synthetic proof is still the only thing
   exercising the multi-descriptor/rule-4 branch this unit ships.
4. **RED via `git stash`.** I re-derived RED independently from a true `git archive 142afe58` export (never
   touching the worktree) — 5 failed / 3 passed, confirming the stash-based claim wasn't hiding a discrepancy.
5. **`ensureServer` cold-start race** (one capture run silently lost 1/48 cells). Real infra gap, correctly
   caught and worked around by the implementer (deleted the partial dir, reran warm). Forward as a harness
   hardening item — not a U0 code defect, not blocking.
6. **Base lineage** (142afe58 already carries W-02/W-03/W-15c/W-10d). Confirmed via `git log --oneline
   142afe58..a8d84bef` showing exactly one commit in range; my before/after comparison is between two points that
   both already include those four units, so it does not independently re-confirm them, but nothing in this
   review found any interaction between U0 and any of the four.

## Verdict: ACCEPT-WITH-FOLLOWUPS

U0 is a correct, well-scoped, genuinely-verified no-op foundation. Every load-bearing claim in the impl report
(scope, byte-identity, RED/GREEN, mutation-proof, generated-file reproducibility, guard-suite green) was
independently reproduced from a clean scratch export rather than trusted from the worktree. No fabricated or
vacuous proof found; no widened tolerance; no re-pinned fingerprint.

Follow-ups (non-blocking, for the ledger):
- Correct the impl report's headline "342/342" to **335/335** (its own per-file table's true sum); no missing
  or hidden test evidence, just an arithmetic error in the writeup.
- U1 should pair each real-cluster RGR case with the existing synthetic-alias tests (6/7), not replace them —
  they're still the only coverage of the multi-descriptor "more than one active descriptor falls back to the
  survivor" branch (rule 4) until `contFieldSigmoid` (U5) lands.
- File the `ensureServer` cold-start readiness race (scene3d-capture.js) as a harness hardening ticket — second
  near-miss of this class per the ledger's own incident log.
- **Live verification remains undone** (implementer self-flagged this correctly). Low risk for a data-empty
  no-op unit backed by 4 integration suites mounting real component trees, but still owed before Phase 1 wraps.
