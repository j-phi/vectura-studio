STATUS: DONE

# U5b-4 — render the caveat on the SHADOW row, both surfaces (LEDGER row 11a) — implementer report

Lane: `fill-collapse-3`. Worktree: `/Users/jayphi/Documents/github/vectura-studio/.claude/worktrees/fill-collapse-3`,
branch `3d-scene/fill-collapse-3`, port **8482**. Base `e10306e9` (this run's own commit 1, U9b-2). New sha
(commit 2): **`eb9707a8`**.

Ran as ONE session covering both U9b-2 (`U9b-2-impl.md`) and U5b-4 (this report), per brief §2. This report
covers commit 2 (`eb9707a8`) only.

## Why (LEDGER row 11a, U7-2's live-verification finding)

U7-2 found, while doing an unrelated copy-only pass, that the shadow row's Fill Style picker rendered **no
standalone caveat paragraph on EITHER surface** — only the docked object Style tab
(`scene3d-panel.js:750` on `2b189b5f`, `caveatLine.className = 'vs3-lawnote is-caveat'`) and the ctxbar Style
flyout (`context-bar.js:1622`, `flyNote(fly, caveatNote.caveat).classList.add('is-caveat')`) did. A user
picking a caveat-bearing law (e.g. `dutyConst`) as a **shadow** tone law could not see its warning without
opening the (i) popover and reading past mechanism/strengths to "Weaknesses:" — the standing ruling "folding
a law must NOT hide its measured caveat" failing on a third surface nobody had checked (U5b fixed two; the
shadow row was never in scope). U7-2 explicitly left this unfixed (out of its copy-only remit) and filed it
as this unit.

## Scope

- Add the caveat paragraph to **BOTH** shadow surfaces: the docked panel's Shadow section (`.vs3-shadow`)
  and the ctxbar Shadow flyout. Half of it is not a fix.
- Use the **same `effectiveLaw` mechanism** the Style row already uses.
- **Mind U9's boundary**: the shadow bag has NO sub-control — this is a caveat paragraph, not a param seed.

Line numbers in the brief were MAIN's; re-located on the lane before editing (the lane is ahead of main by
U6/U9b/U7-2). Found at `scene3d-panel.js:3251-3287` (`renderShadowControls`'s Fill Style row block) and
`context-bar.js:1893-1927` (the ctxbar Shadow flyout's equivalent block).

## Fix

Both surfaces already compute `shadowInfoLaw` (via `FS.shadowDisplayLaw(rawShadowToneLaw, law)`) for their
existing (i)-popover read — U9b/W-10d-3b's own fix. `FS.note(shadowInfoLaw).caveat` was already computed
there (as part of the popover's text) but discarded before this fix. Added, right after each surface's
existing `buildLawInfoAffordance`/`flyLawInfo` call:

```js
const shadowEffectiveLaw = FS.effectiveLaw ? FS.effectiveLaw(shadowInfoLaw, {}) : shadowInfoLaw;
const shadowCaveatNote = FS.note(shadowEffectiveLaw);
// docked:
if (shadowCaveatNote.caveat) {
  const shadowCaveatLine = document.createElement('p');
  shadowCaveatLine.className = 'vs3-lawnote is-caveat';
  shadowCaveatLine.textContent = shadowCaveatNote.caveat;
  host.appendChild(shadowCaveatLine);
}
// ctxbar:
if (shadowCaveatNote.caveat) flyNote(fly, shadowCaveatNote.caveat).classList.add('is-caveat');
```

This is the **same 3-line pattern** the Style row uses (`const effectiveLaw = FS.effectiveLaw ? ... : law;
const caveatNote = FS.note(effectiveLaw);`), with `shadowInfoLaw` (the shadow row's own already-resolved id)
substituted for the Style row's `law`. `FS.effectiveLaw(survivorId, paramsBag)` returns `survivorId`
immediately whenever `FS.styleParams(survivorId)` has no descriptors that resolve against `paramsBag` — since
the shadow bag has **no sub-control field at all** (U9's reviewer forbids giving it one: "two mechanisms, not
one path"), calling it with an **empty bag** (`{}`) is a provable no-op today: no descriptor's key can ever be
found in `{}`, so it always falls straight through to `shadowInfoLaw` unchanged. Using the real mechanism
(rather than skipping it and reading `FS.note(shadowInfoLaw)` directly) means a future shadow-side
sub-control, should one ever exist, is handled correctly with zero further change to this call site — while
today it is mathematically identical to the simpler read. Nothing is written to `s`/`bag`/the shadow bag —
this is a caveat paragraph, not a param seed, matching U9's boundary exactly.

## Files touched

- `src/ui/panels/scene3d-panel.js` — `renderShadowControls`'s Fill Style row block, +24 lines (comment +
  4-line fix), inserted between the existing `buildLawInfoAffordance` call and the `if (FS.SHADOW_NOTE)`
  block. Appended to `host` (matching the Style row's own `host.appendChild(caveatLine)`, not `lawRow`).
- `src/ui/shell/context-bar.js` — the ctxbar Shadow flyout block, +16 lines, inserted between the existing
  `flyLawInfo` call and `if (C.toneLawNote) flyNote(fly, C.toneLawNote);`.
- `tests/integration/scene3d-fill-style-picker.test.js` — 6 new tests (+63), 3 in each of the existing
  `'Shadow Fill Style — context-bar Shadow flyout'` and `'Shadow Fill Style — docked 3D Scene panel'`
  describe blocks, right after the existing U9b tests.

No `src/core/scene3d/*` file touched (matches the lane's Forbidden list — `surface-fill.js`,
`surface-fill-mono.js`, `mappers.js`, `hlr.js`, `shadows.js`, `scene3d.js` all untouched).

## RED

Reproduced by reading the pre-fix source directly (not a scratch export re-run, since the fix is additive
UI-only and the absence is structural): at `49a5ef88`, only two `.is-caveat` call sites existed in the whole
app (both Style-row), confirmed by U7-2's own live-verification finding and independently re-confirmed here
by grepping `is-caveat` in both files before editing — zero hits in the shadow-row blocks. The new tests, run
against the pre-fix tree, fail as expected:
`expect(fly.querySelector('.ctxbar-fly-note.is-caveat')).toBeTruthy()` → `null` is not truthy (and the
docked twin, same shape).

## GREEN

```
npx vitest run tests/integration/scene3d-fill-style-picker.test.js
```
**176/176** (up from 170 at `e10306e9`/`49a5ef88` — U9b's own +4 fineLadder/onePenDown tests were already
counted in the 170; this commit adds the 6 new U5b-4 tests). 59.09s wall, one benign
`Vectura Scene3D: unknown toneLaw "not-a-real-law"...` console warning from a pre-existing, unrelated test —
not a regression.

Also re-confirmed the generative cross-check stays green (standing ruling 1): `scene3d-fill-style-effective-law.test.js`
(7/7) and `scene3d-fill-style-display-params.test.js` (3/3) — this unit does not touch `FS.effectiveLaw`'s
own logic or the ALIASES/roster resolution, only adds a render call using the existing function, so neither
needed extension. Confirmed by re-running both after this commit's edits (see the shared guard table in
`U9b-2-impl.md`, run in the same continuous session, after both commits' source edits were already in the
tree).

## `## Bars changed`

None. No numeric threshold, tolerance, count bar, or pinned fingerprint changed anywhere in this commit —
purely additive rendering + new tests.

## `## Borrowed green / collateral`

None. No other unit's test flipped red→green or green→red as a side effect of this commit.

## Live verification — MANDATORY, the deliverable for this unit

Dev server: `node scripts/dev-server.js 8482` from the worktree (port pre-verified free). Confirmed
`window.Vectura.APP_VERSION` = `1.4.1`, matching the worktree's `package.json` (no bump in a worktree).

Used **Playwright** (`chromium.launch()`) in a scratch script (`/private/tmp/.../u5b4-evidence.js`, deleted
after this run — never committed, per brief). The chrome-devtools MCP browser was not touched (shared
singleton; not needed here). The script drives the REAL running app, not a synthetic harness:
- **ctxbar surface**: the real `V.UI.ContextBar.restoreState()` + `pill.click()` path (same as the app's own
  click handlers), reading the real DOM the flyout renders.
- **docked surface**: `app.ui.buildControls()` against the page's own `#dynamic-controls` container (the
  actual properties-panel mount point in `index.html`) — not a synthetic `document.createElement('div')`
  mount the way the unit tests do; this is the real running-app render path.

Captured, for `dutyConst` (caveat-bearing; U7-2's own probe case, reproduces the gap) and `ladder` (no
caveat, control), on both surfaces: a full-section/flyout screenshot and a native-resolution crop of just the
Fill Style row + caveat paragraph (Playwright `locator.screenshot()` with `scrollIntoViewIfNeeded()`, not a
manual clip rect — the docked Shadow section sits well below the fold in the properties panel, so a manual
viewport-relative clip failed with "Clipped area is either empty or outside the resulting image" until this
was fixed to use element-relative locators).

Written to `docs/3d-audit/fill-audit/after/U5b-4/`: 8 PNGs (`ctxbar-dutyConst-flyout-full.png`,
`ctxbar-dutyConst-row-native.png`, `ctxbar-ladder-flyout-full.png`, `ctxbar-ladder-row-native.png`,
`docked-dutyConst-section-full.png`, `docked-dutyConst-row-native.png`, `docked-ladder-section-full.png`,
`docked-ladder-row-native.png`), `raw-capture-results.json`, `report.json`. Every path starts `after/U5b-4/`.

**LOOKED at all 8 PNGs directly (Read tool):**

- `docked-dutyConst-row-native.png`: shows "Fill Style: Duty Cycle · Constant" with a red/warning-colour
  standalone paragraph directly beneath it, left-bordered (matching the Style row's existing `.is-caveat`
  visual treatment exactly): "The open paper you see in highlight areas is intentional — marks shrink down
  to dots there, so the gaps between them are the shading effect working as designed, not a defect." — byte
  match to `FS.note('dutyConst').caveat`.
- `ctxbar-dutyConst-row-native.png`: same caveat text, same red left-bordered paragraph, in the narrower
  ctxbar flyout column (text wraps across 5 lines instead of 4 — cosmetic, from the narrower flyout width,
  pre-existing and unrelated to this fix). The select text itself visually truncates to "Duty Cycle ·
  Constar" at this column width — a pre-existing cosmetic truncation of the flyout's narrow select, also
  unrelated to this fix (not touched, out of scope).
- `docked-dutyConst-section-full.png`: confirms PLACEMENT — the caveat sits directly under the Fill Style
  row and directly above the "Flow and web styles aren't offered here..." note, exactly where the Style
  row's own caveat sits relative to its own always-visible note. Mode/Angle/Density/Pen/Line/Layers rows all
  render normally around it — no layout disruption.
- `ctxbar-dutyConst-flyout-full.png`: same placement confirmation on the ctxbar surface — caveat sits between
  the Fill Style row and the "Flow and web styles..." note, above "Shadows land on objects".
- `docked-ladder-row-native.png` and `ctxbar-ladder-row-native.png`: **no caveat paragraph renders** for the
  non-caveat control law — confirms the fix does not emit an empty warning box when the resolved law has no
  caveat (`ladder`'s `caveat` field is `undefined`).

`raw-capture-results.json` confirms `pageErrors: []` on all 4 page loads, and the select value (`dutyConst`/
`ladder`) stays correct on both surfaces throughout (`dutyConst` is a directly-offered roster law, not a
folded id, so no over-fix risk on the `<select>`'s own value — U9b's over-fix guard is orthogonal to this
unit).

Dev server stopped after capture; scratch script deleted.

## Open items / not touched

- The (i) popover text itself is unchanged on both surfaces (still shows mechanism/strengths/weaknesses,
  including the caveat as part of "Weaknesses:") — this unit adds the standalone paragraph ADDITIONALLY, it
  does not remove the caveat from the popover. Matches the Style row's own precedent (both the caveat
  paragraph AND the popover's "Weaknesses:" line carry the caveat text there too).
- CHANGELOG.md / plans.md / worklist.json / findings.json / STILL-OPEN.md — not edited here (shared-file
  rule, same as every prior unit's precedent). Draft line: "Fixed: the shadow row's Fill Style picker (both
  the docked panel's Shadow section and the ctxbar Shadow flyout) now shows a caveat-bearing law's warning as
  a standalone paragraph, matching the Style row — previously only visible inside the (i) popover."

## Commit

`eb9707a8` — `fix(3d-audit): U5b-4 — render the caveat on the SHADOW row, both surfaces (LEDGER row 11a)`,
on top of `e10306e9` (this run's commit 1, U9b-2). Commit body carries the RED/GREEN numbers, live-
verification summary, `## Bars changed` and `## Borrowed green / collateral` sections verbatim. Working
tree clean after commit (`git status --short -- . ':!graphify-out'`). Not pushed.
