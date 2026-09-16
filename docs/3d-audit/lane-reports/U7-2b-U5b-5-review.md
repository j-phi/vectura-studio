STATUS: ACCEPT-WITH-FOLLOWUPS

# U7-2b + U5b-5 — adversarial reviewer report

Lane `fill-collapse-3`, worktree `.claude/worktrees/fill-collapse-3` (READ-ONLY — never edited,
stashed, checked out, or reset). Pinned range `eb9707a8..28cc745d` (two commits: `7d1a81ca` U7-2b +
shadow-writeback comment, `28cc745d` U5b-5). Reproduced everything below in scratch exports under
`/private/tmp/claude-501/scratch-U5b5/{pre,mid,post}` (archives of `eb9707a8`/`7d1a81ca`/`28cc745d`,
`node_modules` symlinked from MAIN). Worktree confirmed clean at `28cc745d`
(`git status --short -- . ':!graphify-out'` empty; only graphify stash noise in `git stash list`, all
pre-dating this run). No probe files left in the worktree — all scratch work lived in
`/private/tmp/claude-501/scratch-U5b5/` (deleted the two throwaway HTML/mjs ablation probes when done).

## Overall verdict

**ACCEPT-WITH-FOLLOWUPS** on both units. Every numbered condition below is independently reproduced
with my own measured numbers, not the implementer's restated ones. Two non-blocking follow-ups (both
disclosed, neither blocking): the U5b-5 jsdom test is CSS-source-only and could theoretically pass
vacuously against a class-rename regression (mitigated here by my own live-browser reproduction, which
the merge should keep as evidence); and the U7-2b regex bound has zero slack against a future copy edit
that adds one more word to either caveat.

---

## Condition 1 — U7-2b RED/GREEN + no widened bar

**RED** (independent, not the implementer's report): wrote a standalone regex-only script (no vitest
runtime needed — this is a pure string-matching claim) and ran it with plain `node`:

```
OLD_U7 = /weight.*(?:isn't constant|varies)/     matches decoy "The weight and overall balance isn't constant across models." → true (THE BUG)
NEW_U7 = /\bweight\b(?:\s+\S+){0,1}\s+(?:isn't constant|varies)\b/  matches same decoy → false (FIXED)
NEW_U7 matches ampSpacing's real shipped caveat ("This line's weight isn't constant along its length…") → true

OLD_U8 = /weight.*varies/                        matches decoy "The weight and shipping cost varies by region." → true (THE BUG)
NEW_U8 = /\bweight\b(?:\s+\S+){0,1}\s+varies\b/  matches same decoy → false (FIXED)
NEW_U8 matches interlockWeave's real shipped caveat ("…Its line weight also varies along its length…") → true
```

Cross-checked both shipped caveats directly against `src/config/scene3d-tone-laws.js` in the worktree
(lines 569 `ampSpacing` and 595 `interlockWeave`) — the test's `FS.note('ampSpacing').caveat` /
`FS.note('interlockWeave').caveat` reads these exact production strings through the real runtime, not a
copy pasted into the test.

**GREEN**, reproduced against the `post` scratch export:
`npx vitest run tests/unit/scene3d-tone-law-collapse.test.js -t "U7-2b"` → **2 passed | 119 skipped
(121)**, matches the report exactly.

**Full-file run — measured myself, not inferred.** The implementer's report left this "pending the
completion notification" and never stated a number; the orchestrator's flag-1 was right to ask for it.
I ran it: `cd <post scratch> && npx vitest run tests/unit/scene3d-tone-law-collapse.test.js
--pool=forks --poolOptions.forks.singleFork=true` in the foreground. It exceeded the tool's timeout on
the first attempt (I omitted `timeout: 600000` on that call, my own error, not the documented Tier-1
tool-ceiling case) and was backgrounded; I read the result from the completion notification rather than
polling or re-running:

```
Test Files  1 passed (1)
     Tests  121 passed (121)
    Errors  1 error   ← the pre-existing, documented benign `[vitest-worker]: Timeout calling
                          "onTaskUpdate"` RPC warning (ROUND3-RESUME-BRIEFS.md §0), not a test failure
   Duration 1045.63s
[exited with code 0]
```

**121/121, real number, exit code 0.** This confirms the file's own historical baseline (117 + U9b-2's
2 coupling tests = 119, +2 of U7-2b's own decoy tests = 121) is unperturbed.

**No bar widened.** Both regexes are strictly narrower matches than the old `.*`-spanning ones (fewer
strings match), and the two guard bar-line — `expect(survivorCaveat).toMatch(...)` — assertions were not
loosened, only re-pointed at the tighter named constants. `## Bars changed: None` in the report is
accurate.

**The shadow-writeback comment names the correct sibling.** Confirmed by listing every `test(...)` in
`tests/integration/scene3d-shadow-writeback.test.js`: the comment (above line 97's "no per-pass rewrite
after load: the bag is byte-identical across 3 composes") names "the compose channel structurally cannot
write back: …" as the load-bearing proof — that is exactly the test at line 112
(`'the compose channel structurally cannot write back: a LIVE bag holding raw "onePenDown" (never
loaded through sanitizeImportedParams) survives 3 composes untouched'`). Correct sibling, correctly
named. Full-file run (my own): **10/10 passed, 23.35s**.

**Condition 1 verdict: ACCEPT.**

---

## Condition 2 — U5b-5 RED/GREEN, what it measures, vacuous-pass risk

**What it measures**: CSS SOURCE TEXT, not rendering. The test
(`tests/integration/scene3d-fill-style-picker.test.js`, "U5b-5 — every ctxbar scene-flyout `<select>`
(.ctxbar-fly-ctl .ctrl-sel) declares text-overflow: ellipsis, not a raw clip") reads
`src/ui/skin/components.css` as a string and regex-matches for a `.ctxbar-fly-ctl .ctrl-sel { … }` block
containing all three of `overflow: hidden`, `text-overflow: ellipsis`, `white-space: nowrap`. It does
**not** touch the DOM, does **not** check that `context-bar.js` still emits a `.ctxbar-fly-ctl` wrapper
around the select, and does **not** verify no later, higher-specificity rule overrides the declaration.
The report is honest about this (cites the repo's own established jsdom-can't-do-CSS-layout pattern,
`tests/unit/css-on-tokens-and-no-transition-all.test.js`), but the coordinator's flag-2 concern is real:
**it can pass vacuously** if a future refactor renames `.ctxbar-fly-ctl` in `context-bar.js` without
updating this test — the string would still exist in `components.css`, matching an orphaned selector.

**RED, re-derived from a proper `git archive` export** (the implementer's own RED was self-disclosed as
an in-worktree CSS overwrite, restored afterward — honest but not the protocol's scratch-export method).
I took the `post` scratch export (which has the new test), overlaid `eb9707a8`'s `components.css` via
`git -C <worktree> show eb9707a8:src/ui/skin/components.css > post/src/ui/skin/components.css`, and ran:

```
npx vitest run tests/integration/scene3d-fill-style-picker.test.js -t "U5b-5"
FAIL … AssertionError: expected null to be truthy   (rule regex matched null)
1 failed | 176 skipped (177)
```

Restored the fixed CSS, re-ran: **1 passed | 176 skipped (177)**. Full file: **177 passed (177),
87.83s** (my own run; close to the report's 85.64s — normal load variance). Also independently confirmed
the picker file was **176/176 at `eb9707a8`** (pre-fix, one fewer test, as expected) by archiving
`eb9707a8` separately and running the full file there.

**Mitigation beyond the test's own limits — I independently proved the REAL rendering effect**, not just
the CSS source text (see condition 4). The vacuous-pass risk is real in the abstract but not live today:
my own Playwright ablation (isolated HTML page, not the repo) showed `getComputedStyle` reads
`textOverflow: 'clip'` with the rule removed and `'ellipsis'` with it present, and the rendered pixels
differ accordingly (screenshots below).

**Condition 2 verdict: ACCEPT-WITH-FOLLOWUP** (non-blocking) — recommend a future pass add a real
browser-level assertion (Playwright/e2e) tying the fix to actual rendered truncation, not just CSS source
text, so a `.ctxbar-fly-ctl` rename can't silently orphan this coverage. Not a reason to reject this unit;
the fix itself is correct and independently verified below.

---

## Condition 3 — CSS specificity audit

Grepped every rule mentioning `.ctrl-sel` or `.ctxbar-fly-ctl` across **all** `src/ui/skin/*.css` files
(`_template.css`, `classic-{dark,lark,light}.css`, `components.css`, `meridian-{dark,lark,light}.css`,
`motion.css`, `tokens.css`): **only `components.css` contains either selector.** No per-skin override
file touches `.ctrl-sel` or `.ctxbar-fly-ctl` at all.

Within `components.css`:

| selector | specificity | properties | relevant? |
|---|---|---|---|
| `.ctrl-sel, .ctrl-inp` (line 241) | (0,1,0) | background/border/color/font/height/etc. — no overflow/text-overflow/white-space | no conflict |
| `.ctrl-sel-wrap .ctrl-sel` (line 255) | (0,2,0) | `width: 100%` only | no conflict |
| **`.ctxbar-fly-ctl .ctrl-sel`** (line 12099, the new rule) | **(0,2,0)** | `overflow: hidden; text-overflow: ellipsis; white-space: nowrap` | the fix |
| `.ctxbar-fly-ctl.ctxbar-fly-mixed .ctrl-sel` (line 12107, appears AFTER the fix, and is MORE specific: (0,3,0)) | (0,3,0) | `color`, `font-style` only | no property overlap — cannot override overflow/text-overflow/white-space even though it wins the cascade on the properties it does set |
| `[data-ui-skin] select, …` (line 1306) | (0,1,1) | `font-family` only | no conflict, lower specificity anyway |

No rule anywhere in the skin tree sets `overflow`, `text-overflow`, or `white-space` on `.ctrl-sel` other
than the new one. **The new rule is the only one that can win on those three properties for a
`.ctxbar-fly-ctl .ctrl-sel`, and nothing later or more specific contests them.**

**Scoping to only the ctxbar scene flyout, verified by call-site grep**: `.ctxbar-fly-ctl` is emitted from
exactly one place in the whole codebase — `src/ui/shell/context-bar.js:1385`,
`const host = el('span', 'ctxbar-fly-ctl');` inside the shared `flyRow(...)` helper used by every scene
flyout row builder (Style, Shadow, Highlight, X-ray — confirmed via the four `pill('scene…', build…Body,
…)` registrations at lines 2151-2158). It is **never** applied to the docked panel's own `.ctrl-sel`
instances, and (see condition 4) I confirmed live that a non-flyout `<select>` for a plain 2D layer
(flowfield) has **zero** native `<select>` elements in the ctxbar at all — the fix's blast radius is
provably limited to the four scene-flyout pill dropdowns.

**Condition 3 verdict: ACCEPT.** Selector `.ctxbar-fly-ctl .ctrl-sel`, specificity (0,2,0), correctly
scoped, uncontested in the cascade.

---

## Condition 4 — Live verification

Server: post-fix scratch export on port 8500, pre-fix (`eb9707a8`) scratch export on port 8501 (both
free ports ≥ 8495 as instructed), both killed after use. `APP_VERSION` 1.4.1 on both (matches
`package.json`), zero `pageErrors` on every page load.

**1. ctxbar Shadow flyout, Fill Style row, `dutyConst`** (native-resolution row crop):
  - **pre**: `getComputedStyle` → `textOverflow: 'clip'`. Rendered: **"Duty Cycle · Constar"** — raw
    mid-word clip, no ellipsis character.
  - **post**: `getComputedStyle` → `textOverflow: 'ellipsis'`, `whiteSpace: 'nowrap'`. Rendered:
    **"Duty Cycle · Const…"** — a real ellipsis character.
  - Full-flyout crops (Cast/Mode/Fill Style/caveat/Shadows-land-on-objects/Follow
    light/Angle/Style/Pen/Density/Layers rows) are **pixel-identical in position** pre vs post
    (`getBoundingClientRect` on the flyout: `{x:583.08, y:72.95, w:232, h:570}` both runs) — the fix is
    additive-only, no layout shift, no sibling row disturbed.

**2. Docked panel Style tab select** (`.vs3-page[data-page="style"]`, object's own Fill Style row):
  clicked the real `tab-btn[data-value="style"]` (the actual UI.Tabs component, not a synthetic mount).
  Rendered **"Duty Cycle · Constant"** in full, **identically, pre AND post** — confirms the docked
  panel's own (wider) `.ctrl-sel` is untouched by the scoped fix, exactly as the commit claims.
  Also captured the **Style flyout** (not just Shadow) for the same `dutyConst` case: **it had the
  identical pre-existing defect** ("Duty Cycle · Constar" pre → "Duty Cycle · Const…" post) — confirms
  the fix reaches "every scene flyout row, Style and Shadow alike" as the commit states, not just the
  probed Shadow row. All other rows in that flyout (Type: Hatch, Stroke Fill: Spiral, Pen: Layer pen,
  Density: 40) render identically pre/post — no unwanted wrapping regression from the added
  `white-space: nowrap`.

**3. One non-scene select elsewhere in the ctxbar**: added a plain `flowfield` layer, selected it, and
  queried `V.UI.ContextBar.getContentHost().querySelectorAll('select')` → **0 native `<select>` elements**
  in the ctxbar for a non-scene3d layer (it uses custom `ctxbar-algo-field`/`ctxbar-text-field` span
  dropdowns instead of native selects). This is itself the answer to the scoping question: **there is no
  other native `<select>` in the ctxbar to regress** — the only native selects the ctxbar ever renders
  live inside `.ctxbar-fly-ctl` wrappers, all of which are scene3d flyout rows. The claim "does not touch
  any other `<select>` in the app" is therefore vacuously true for the ctxbar specifically, and
  non-vacuously true for the docked panel (item 2, directly observed unaffected).

**Ellipsis provenance (flag 3), confirmed by ablation**, not accepted on argument: built an isolated
HTML page (outside the repo, in scratch) with two copies of the same markup/CSS shape, one with the
`.ctxbar-fly-ctl .ctrl-sel` rule and one without, viewed in the same Playwright/Chromium. Without the
rule: `getComputedStyle` → `textOverflow: 'clip'`, rendered text visibly un-ellipsized. With the rule:
`textOverflow: 'ellipsis'`, rendered text shows a real `…`. **The ellipsis is caused by this rule, not by
a native `<select>` default** (native default computes to `'clip'`, confirmed). Separately reproduced the
implementer's own "Chromium quirk" claim: `overflow` computes back as `'visible'` on the live native
`<select>` even with the rule applied and the ellipsis visibly rendering — this is a genuine
computed-style readback quirk on native `<select>`, not evidence the rule isn't applied (the other two
properties, which are the two that actually drive truncation behavior, compute correctly).

**Condition 4 verdict: ACCEPT.** All three capture targets confirmed with my own screenshots and
computed-style reads; no layout shift; ellipsis provenance independently proven, not merely asserted.

---

## Condition 5 — e2e/visual per CLAUDE.md

No e2e spec or visual baseline in this repo is dedicated to the context bar or the scene3d panel
specifically (`tests/e2e/` has `smoke.spec.js`, `stroke-options.spec.js`, `tool-drawer.spec.js`,
`import-3d.spec.js`, `iphone-mini.spec.js`, `mask-shift-drag.spec.js`, `visual.spec.js`; only
`smoke.spec.js` (ctxbar visibility assertion, line 1751) and `import-3d.spec.js` (scene3d groups, no
ctxbar/select interaction) even mention "ctxbar"/"scene3d"). `tests/visual/scene3d-tone-baseline.test.js`
is the one scene3d visual baseline and covers render-tone-law pixels, not UI control labels — no
ctxbar/flyout content in it. Ran the relevant one:

`npx playwright test tests/e2e/smoke.spec.js --reporter=line` against the `post` scratch export.
**First attempt was lost to my own process-management error** (I omitted the Bash tool's `timeout: 600000`
parameter on the initial foreground call, it silently backgrounded at the tool's 120s default, sat for
~24 minutes accumulating almost no CPU — genuinely stalled, not merely slow — and I killed it; that kill
also took down its child `webServer` on port 4173). Re-ran cleanly with `--workers=1`:

```
Running 28 tests using 1 worker
27 passed (1.1m)
1 skipped
```

**27/28 passed, 1 skipped, 1.1 minutes.** No failures attributable to the CSS change (or to anything
else). This is disclosed as my own procedural hiccup, not a defect in the unit under review.

**Condition 5 verdict: ACCEPT** (e2e green; no dedicated ctxbar visual baseline exists to run).

---

## Condition 6 — Files touched, worktree clean

`git -C <worktree> show --stat` on both commits:

- `7d1a81ca`: `tests/integration/scene3d-shadow-writeback.test.js` (+7), `tests/unit/scene3d-tone-law-collapse.test.js` (+35/-2). Tests only.
- `28cc745d`: `src/ui/skin/components.css` (+12), `tests/integration/scene3d-fill-style-picker.test.js` (+25).

No `surface-fill.js`, `surface-fill-mono.js`, `mappers.js`, `hlr.js`, `shadows.js`, `scene3d.js`, or any
slices-pass file touched — matches the allow-list and the forbidden-list in
`ROUND3-RESUME-BRIEFS.md` §2 exactly (CSS-only change went to `src/ui/skin/components.css` per
CLAUDE.md's CSS placement rule, not `context-bar.js`, since the fix needed no markup change).

`git -C <worktree> status --short -- . ':!graphify-out'` → **empty** at `28cc745d`. `git stash list` shows
only pre-existing graphify-noise and other-lane entries, none from this run.

**Condition 6 verdict: ACCEPT.**

---

## Condition 7 — Regex correctness and brittleness

Both regexes match their real production caveats and reject the reviewer's original decoys (see
condition 1's numbers — reconfirmed independently, not restated).

**Brittleness — real, flagged as intended**: the `{0,1}` bound has **zero slack today**. ampSpacing's
caveat is `"weight isn't constant"` — a 0-word gap, using the `{0}` branch of the alternation with no
margin. interlockWeave's is `"weight also varies"` — a 1-word gap, using the full `{1}` allowance with
no margin either. **A future copy edit that inserts even one more word between "weight" and the claim
phrase in either caveat (e.g. "weight isn't perfectly constant", "weight, in practice, also varies")
would fail this regex even though the underlying claim is completely unchanged** — a false RED with no
real regression. This is a legitimate canary/brittleness trade-off: tighter bound catches more decoys
but also more innocent rewordings. Given the caveats have already gone through one plain-language pass
(U7-2) and could plausibly be rewritten again, I'd rate this a real, non-hypothetical risk, not a
theoretical one — but it is the same trade-off implicit in "bound the gap to at most one intervening
word" that the U7-2 reviewer's original follow-up asked for, and the implementer's report discloses the
exact word counts driving the choice, so nothing here is hidden.

**Condition 7 verdict: ACCEPT-WITH-FOLLOWUP** (non-blocking) — recommend whoever next edits either
caveat's wording re-verify (or loosen) this bound in the same commit; note this obligation is already
called out in the LEDGER row 11b text ("Whoever next rewrites either caveat owns this whether or not
U7-2b has run").

---

## Summary verdicts

| # | Condition | Verdict |
|---|---|---|
| 1 | U7-2b RED/GREEN, no widened bar, correct sibling comment | **ACCEPT** — 121/121 measured myself (1045.63s, singleFork, exit 0) |
| 2 | U5b-5 RED/GREEN, what it measures, vacuous-pass risk | **ACCEPT-WITH-FOLLOWUP** — CSS-source-only test could pass vacuously on a class rename; mitigated by my own live-browser proof |
| 3 | CSS specificity audit | **ACCEPT** — `.ctxbar-fly-ctl .ctrl-sel` (0,2,0), only rule on those 3 properties, uncontested |
| 4 | Live verification (3 targets) | **ACCEPT** — ellipsis confirmed real via ablation, docked panel + non-scene ctxbar confirmed unaffected |
| 5 | e2e/visual per CLAUDE.md | **ACCEPT** — smoke.spec.js 27/28 pass, 1 skipped, 1.1m (after my own re-run) |
| 6 | Files touched / worktree clean | **ACCEPT** — matches allow-list exactly, clean at `28cc745d` |
| 7 | Regex correctness / brittleness | **ACCEPT-WITH-FOLLOWUP** — correct today, zero slack for future copy edits |

**Overall: ACCEPT-WITH-FOLLOWUPS.** Both units are honest, correctly scoped, and independently
reproduced. Two non-blocking follow-ups logged above (CSS-source-only test coverage gap; zero-slack
regex bound) — neither is a defect in the shipped fix, both are pre-disclosed trade-offs worth a note
for whoever touches this surface next.
