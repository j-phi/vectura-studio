STATUS: DONE

# U7-2b + U5b-5 + shadow-writeback comment — implementer report

Lane `fill-collapse-3`, worktree `.claude/worktrees/fill-collapse-3`, branch
`3d-scene/fill-collapse-3`. Base `eb9707a8` (clean, idle) → two new commits:

- `7d1a81ca` — U7-2b + the shadow-writeback comment (shared commit, as permitted)
- `28cc745d` — U5b-5

Both worktree-only, not pushed.

## Item 1 — U7-2b (LEDGER row 11b): tighten the two loose survivor-side caveat regexes

**Scope**: `tests/unit/scene3d-tone-law-collapse.test.js` only (TESTS ONLY, per the
U7-2 reviewer's follow-up in `U7-2-review.md` §3's non-blocking looseness note).

**Problem**: `/weight.*(?:isn't constant|varies)/` (~line 1188, U7/ampSpacing block)
and `/weight.*varies/` (~line 1392, U8/interlockWeave block) let `.*` span the
rest of the string unbounded. The reviewer showed a synthetic decoy sentence
mentioning "weight" and "varies"/"isn't constant" far apart still matched.

**Fix**: bounded the gap to at most one intervening word (enough for real
production text — 0 words in ampSpacing's "weight isn't constant", 1 word,
"also", in interlockWeave's "weight also varies" — but not enough for
unrelated prose):

```js
const SURVIVOR_WEIGHT_CLAIM_U7 = /\bweight\b(?:\s+\S+){0,1}\s+(?:isn't constant|varies)\b/;
const SURVIVOR_WEIGHT_CLAIM_U8 = /\bweight\b(?:\s+\S+){0,1}\s+varies\b/;
```

Both existing survivor assertions now reference the named constant instead of
an inline literal. Added one decoy test per describe block.

**RED** (scratch export of `eb9707a8`, `/private/tmp/claude-501/scratch-U7-2b/pre`):
spliced the two new decoy tests using the OLD inline literals into the pre-fix
tree and ran `-t "RED-PROOF"`:
```
FAIL ... U7-2b RED-PROOF ...: expected 'The weight and overall balance isn't...' not to match /weight.*(?:isn't constant|varies)/
FAIL ... U7-2b RED-PROOF ...: expected 'The weight and shipping cost varies...' not to match /weight.*varies/
2 failed | 119 skipped (121)
```

**GREEN** (this worktree, post-fix): `-t "U7-2b"` → 2 passed | 119 skipped (121).

**Guard runs** (foreground, this worktree):
- `tests/unit/scene3d-tone-law-collapse.test.js -t "U7-2b"` → 2/2.
- Full file, `--pool=forks --poolOptions.forks.singleFork=true`, Bash
  `timeout: 600000`: started foreground exactly as briefed. Per
  `ROUND3-RESUME-BRIEFS.md` §0's documented amendment, this file exceeds the
  Bash tool's 600s hard ceiling and the tool backgrounds it — a tool
  constraint, not a deviation. **Result read from the tool's own completion
  notification: 121/121 passed, exit code 0, 1088.59s wall** (119
  pre-existing + my 2 new decoy tests). One benign
  `[vitest-worker]: Timeout calling "onTaskUpdate"` unhandled-error warning
  on stderr — the pre-existing shared-machine noise documented in
  `ROUND3-RESUME-BRIEFS.md` §0, not a regression (exit code is still 0, all
  121 tests reported passed).

**Also verified**: `tests/integration/scene3d-fill-style-picker.test.js` full
file still 177/177 (see item 2 below) and `tests/integration/
scene3d-shadow-writeback.test.js` full file still 10/10 (see item 3) — neither
touches the collapse file's production surface, so no cross-file interaction
risk from this regex-only change.

## Bars changed
None. The two regexes are TIGHTENED (narrower match space), which is the
opposite of a widened bar; both are re-verified as claim-preserving against
the same production caveats they always matched (ampSpacing/interlockWeave),
plus now correctly REJECT the reviewer-style decoy they used to (incorrectly)
accept.

## Item 2 — U5b-5 (LEDGER row 11c): ctxbar scene-flyout `<select>` label truncation

**Scope**: `src/ui/shell/context-bar.js` / skin CSS, per the row's explicit
permission ("Scope: `src/ui/shell/context-bar.js` (+ the skin, if the fix is
`text-overflow`/width rather than markup)"). The actual fix needed no markup
change (the `<select>` is the shared `UI.Select` component, already correctly
structured) — only CSS, so `src/ui/shell/context-bar.js` was NOT touched;
the fix landed entirely in `src/ui/skin/components.css` per CLAUDE.md's CSS
placement rule.

**Fix**: `src/ui/skin/components.css`, new rule scoped to the ctxbar flyout's
shared per-row control host:

```css
.ctxbar-fly-ctl .ctrl-sel {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

Scoped to `.ctxbar-fly-ctl` (every scene-flyout row's control wrapper, Style
AND Shadow flyouts alike) rather than the global `.ctrl-sel` or a
`dutyConst`-specific hook — this satisfies the ledger's "check the whole
roster, not just dutyConst" instruction generically (every flyout select
gets the fix, not just the one probed cell) while leaving the docked panel's
own `.ctrl-sel` instances (which the U9b-2/U5b-4 reviewer confirmed render
labels in full, untouched — different ancestor classes).

**Test** (`tests/integration/scene3d-fill-style-picker.test.js`, inside the
existing "Shadow Fill Style — context-bar Shadow flyout" describe block,
allowed as one of the "picker" tests): jsdom has no real CSS layout/paint
engine, so — matching the repo's own established pattern for CSS-only
regressions (`tests/unit/css-on-tokens-and-no-transition-all.test.js`) — the
test reads `src/ui/skin/components.css` and asserts the `.ctxbar-fly-ctl
.ctrl-sel {...}` rule literally declares all three properties.

**RED**: in this worktree, temporarily replaced `components.css` with the
`eb9707a8` blob (`git show eb9707a8:... > components.css`), ran `-t
"U5b-5"`: `expected null to be truthy` (rule regex found nothing). Restored
the fixed file from a saved copy afterward (confirmed byte-identical to the
pre-revert state; `git status` clean before/after, no stash used).

**GREEN**: `-t "U5b-5"` → 1 passed | 176 skipped (177). Full file:
`tests/integration/scene3d-fill-style-picker.test.js` → **177/177 passed,
85.64s**.

**Live verification** (dev server, port 8482, killed after use): Playwright
against the real running app — `window.app`, `Vectura.UI.ContextBar.
restoreState()`, `pillByLabel('Shadow').click()` (the same real production
path the U9b-2/U5b-4 reviewer used, not a synthetic mount). `APP_VERSION
1.4.1` (matches worktree `package.json`, correct for a worktree — no bump),
`pageErrors: []`.

- Before (pre-fix CSS, confirmed via the RED-proof revert above; visually the
  same defect the reviewer photographed at `49a5ef88`): select renders "Duty
  Cycle · Constar".
- After: select renders **"Duty Cycle · Const…"** — a real ellipsis, not a
  raw mid-word cut. `getComputedStyle`: `textOverflow: 'ellipsis'`,
  `whiteSpace: 'nowrap'` (`overflow` reads back as `'visible'` — a Chromium
  quirk on native `<select>` computed style; the rule is present in the
  cascade and the rendered ellipsis in the screenshot is real, so this is
  cosmetic to the computed-style readback, not a sign the rule didn't apply).
- I LOOKED at both PNGs (Read tool): `ctxbar-dutyConst-row-native-fixed.png`
  (the Fill Style row alone, native resolution) shows the ellipsis clearly;
  `ctxbar-dutyConst-flyout-full-fixed.png` (whole flyout) shows the rest of
  the Shadow flyout unaffected in layout.
- Evidence saved to MAIN (not this worktree) per protocol:
  `docs/3d-audit/fill-audit/after/U5b-5/` — 2 PNGs + `report.json`. Not a
  named manifest cell (no cell covers a UI control's label rendering); a
  bespoke Playwright capture is disclosed in the report as the AGENT-PROTOCOL
  "no cell covers your unit" fallback. Left uncommitted in MAIN, matching the
  standing convention already used by `after/U5b-4/` and `after/
  F1-placement/`.

## Bars changed
None. New CSS rule (additive, does not change any existing element's size or
position — only adds overflow handling) + one new additive test.

## Item 3 — shadow-writeback comment (U9b-2/U5b-4 reviewer follow-up 2)

**Scope**: `tests/integration/scene3d-shadow-writeback.test.js`, comment
only, no assertion change — committed alongside item 1 per the brief's
explicit permission.

Added a one-line (5-line, non-code) comment above `'no per-pass rewrite
after load: the bag is byte-identical across 3 composes'` naming its sibling
(`'the compose channel structurally cannot write back: ...'`, the
raw/unresolved-value bypass test) as the load-bearing proof for the "never
per compose" claim — the already-resolved-value test the comment sits above
is vacuous against that specific regression in isolation (per the reviewer's
own mutation-testing finding in `U9b-2-U5b-4-review.md` Flag 2).

No RGR needed (comment-only). Verified the file still parses/runs correctly:
full file `tests/integration/scene3d-shadow-writeback.test.js` → **10/10
passed, 27.4s**.

## Bars changed
None.

## Files touched (both commits combined)
- `tests/unit/scene3d-tone-law-collapse.test.js` (U7-2b)
- `tests/integration/scene3d-shadow-writeback.test.js` (comment)
- `src/ui/skin/components.css` (U5b-5)
- `tests/integration/scene3d-fill-style-picker.test.js` (U5b-5 test)

No production render file (`surface-fill.js`, `surface-fill-mono.js`,
`mappers.js`, `hlr.js`, `shadows.js`, `scene3d.js`) touched. `src/config/
context-bar.js`, `src/ui/panels/scene3d-panel.js`, and `src/ui/shell/
context-bar.js` were NOT touched — U5b-5's row permitted `context-bar.js`
but the fix needed only CSS.

## Open items / follow-ups
- None outstanding. The collapse-law file's singleFork full-run confirmed
  **121/121 passed, exit 0, 1088.59s** (read from the Bash tool's completion
  notification after it backgrounded past the documented 600s ceiling — a
  tool constraint, not a deviation, per `ROUND3-RESUME-BRIEFS.md` §0's
  amendment). One benign pre-existing `onTaskUpdate` RPC warning, not a
  regression.
- Worktree is clean at `28cc745d` after both commits. Not pushed, not
  merged. `docs/3d-audit/fill-audit/after/U5b-5/` left uncommitted in MAIN
  per the standing evidence-dir convention (matches `after/U5b-4/`).
