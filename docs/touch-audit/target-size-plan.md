# TUX-041 target-size plan: close the tap-target gap

Status: plan only. Read-only scout on `touch/integration` @ `f30305c6`. No source changed.
Goal: docs/touch-ux-requirements.md §1.5 "Hit area" and "Absolute floor" rows (TUX-041 / TUX-058).

- Every interactive target where `(pointer: coarse)` matches must have a hit area of at least 44×44 CSS px.
- No target may have a hit dimension under 24 px.
- The allowlist may hold 10 entries or fewer. Each entry must be at least 24 px and pass WCAG 2.5.8 spacing.

---

## 1. Fresh measurement (2026-10-12, f30305c6)

### 1.1 Runs

| Run | Command | Result |
|---|---|---|
| Fast subset, ratchet mode | `PW_PORT=8740 node scripts/run-touch-audit.js --project=touch-ipad-portrait --project=touch-iphone-portrait` | **20/20 green** (equal to baseline). iPadP fast states: 107 under-44, 14 under-24. iPhP: 24 under-44, 5 under-24. |
| Full, one project | `PW_PORT=8740 node scripts/run-touch-audit.js --full --project=touch-ipad-portrait` | **22 passed, 5 failed.** iPadP total: 348 under-44, 33 under-24. See §1.4. |
| Item-level dump (scratch script, not committed) | `core.measurePage` on all 26 states, Chromium, devices iPadP, iPadL, iPhP, iPhL and coarseWide, dev server :8741 | 1,327 under-44 and 132 under-24 over 130 cells. These cells match the committed baseline in 126 of 130 cells. |

The committed baseline (`tests/e2e/touch/target-baseline.json`, `_measuredAt 6775e346`) now sums to **2,263 under-44 and 222 under-24 over 234 cells**. The older figure (3,345 / 248 / 236 cells) is out of date, because the TUX-058 popup-covered and safe-band fixes already lowered it.

Per project (baseline): coarse-wide 410, iPadL 413 (WebKit 411), iPadP 348 (WebKit 361), iPhL 80 (WebKit 80), iPhP 76 (WebKit 84).
**The gap is about 85 % iPad and touch-wide.** The phone layouts (TUX-001 sheet, TUX-013 rail) already pass on most surfaces.

### 1.2 Groups (Chromium, 5 projects; "est. 9" = estimate for the 9 baseline projects, WebKit ≈ Chromium)

| # | Group (selector family) | <44 (5 proj) | <24 | est. 9 | Typical probed size | Where |
|---|---|---|---|---|---|---|
| 1 | Header menubar triggers `#btn-menu-*` (6) + `#theme-toggle` | 462 | 0 | 770 | 60×26, 26×26 | iPad P/L, coarseWide, every state |
| 2 | Context bar: `.ctxbar-btn`, `--labeled`, `.ctxbar-anchor-verb`, `.ctxbar-text-field` (algo / preset / add-layer / font), `.pen-chip`, `.ctxbar-text-size*` | 236 | 2 | 388 | 49×27, 33×27, 24×25, 18×26 | iPad, iPhL, coarseWide |
| 3 | Menubar dropdown items `.top-menu-item` (File/Edit/Object/View/Insert/Help) | 106 | 0 | 177 | 242×30 | iPad, coarseWide (phone sheet is already 44) |
| 4 | Paint-bucket variant grid `.pb-variant-btn` + `#paint-bucket-expand-btn`, `#paint-bucket-pen` | 65 | 0 | 117 | 41×31, 36×31 | all |
| 5 | Export modal: `.export-info-btn`, `.sw-toggle` (optimization), `#export-legend-gear`, `#export-preview-*`, `.opt-reset`, `.optimization-row select`, `.slider-row .slider-val` | 63 | 33 | 110 | 15×16, 30×17, 22×22, 49×37 | all |
| 6 | Context bar overflow `.ctxbar-overflow` ("More options") | 59 | **59** | 97 | 30×23 | iPad, iPhL, coarseWide |
| 7 | Petal Designer: `.petal-profile-thumb`, `.petal-profile-side-btn`, `.petal-transition-lock .sw-toggle`, `.petal-visualizer-mode select`, `.petal-popout` | 48 | 6 | 85 | 35–43×49, 49×29, 30×16 | all |
| 8 | Help modal: `.help-tab-btn`, `.help-platform-btn` | 45 | 0 | 81 | 45×31, 49×27 | all |
| 9 | Scene3D panel: `.tab-bar .tab-btn`, `section.sect > .sect-hdr`, `.vs3-tree-addbtn`, `.vs3-shelf-btn`, `.vs3-more-caret`, `.vs3-tree-vis`, `.vs3-tree-ground` | 44 | 16 | 76 | 49×34, 49×23, 17×26 | iPad, iPhP, coarseWide |
| 10 | Welcome-pane CTA `#btn-tour-welcome` + `.welcome-tour-btn-wrap` (counted twice) | 48 | 0 | 74 | 49×31 | iPad, iPhP, coarseWide |
| 11 | Generator picker `#gm-module-menu > .lvl-algo-sub-item` | 36 | 4 | 64 | 49×34; 49×13 at the scroll edge | all |
| 12 | Tool rail / modifier bar `.tool-btn`, `#tool-overflow-btn`, `.touch-mod-btn` | 29 | 0 | 51 | 36×44, 30×44 (part-covered by an open menu) | iPad, iPhP |
| 13 | Document Setup `#theme-family-*`, `#orientation-*`, `.ctrl-row .sw-toggle` | 24 | 4 | 43 | 49×30, 30×16 | all |
| 14 | Pens tab headers `#pens-section-header`, `#palette-toggle`, `#btn-add-pen`, `#auto-colorization-header` | 19 | 0 | 34 | 49×30, 45×24 | all |
| 15 | Left-pane leftovers: `#btn-randomize-params`, `.mb-4.grid button.w-full` (Reset), stray `.info-btn` | 16 | 2 | 27 | 49×36 | all |
| 16 | Pane toggles `#btn-pane-toggle-bottom`, `#btn-mobile-pane-left/right` | 11 | 0 | 21 | 28×29, 48×38 | iPadP mainly |
| 17 | Text panel `.vtp-spec-head-btn`, `.vtp-spec-pill-head`, `.vtp-fontpick-trigger`, `.vtp-vselect` | 10 | 1 | 18 | 49×37 | iPad, iPhP |
| 18 | Colour picker `.color-modal-hex` | 4 | 4 | 7 | 49×20 | all |
| 19 | Canvas HUD, layer row (scroll-clipped) | 2 | 1 | 4 | | |

Sum of the "est. 9" column: 2,244 (the baseline holds 2,263).

### 1.3 Two measurement artefacts inside the counts

1. **Part-covered by an open popup (46 under-44).** In the `menu-*` and `modal-document-setup` states, the open `.top-menu-panel` covers part of a `.tool-btn` or `.touch-mod-btn`. The centre test then says `ok` (so the control is still reachable), but the probe shrinks the control (example: 36×44 or 30×44). `hitState: 'popup-covered'` only looks at the centre point. Today these controls are *dismiss-on-outside-tap* territory, as with Q13 for the backdrop.
2. **Scroll-clipped rows (about 7 under-24).** A list row cut by its scroller edge measures 49×2, 49×10, 49×12 or 49×13 (`#layer-list .lvl-touch-row`, `#gm-module-menu .lvl-algo-sub-item`, `.vtp-vselect`, `.noise-control select`). Its size depends on the scroll position, not on the CSS.

Both are harness policy decisions (see §4, D2 and D3). They are not CSS work.

### 1.4 The full-mode baseline is already red on HEAD (pre-existing)

`--full` on iPadP fails 5 cells on f30305c6, with no change from this plan:

- `generator-picker`: under24 1→2, wcag258Fail 1→2 (my item dump also gives 2: the baseline is stale).
- `scene3d-panel`: wcag258Fail 1→7.
- `petal-designer-window`: covered 13→16.
- `bottom-pane-open` canvasPct 60.6→59.4; `pen-path-anchors` canvasPct 80→78.4.

CI runs only the fast subset, so CI did not see this. Batch 0 must fix it first. Otherwise no later batch can show a clean RED→GREEN in the full states.

---

## 2. Technique per group

Key rules for every group:

- Gate on `body.touch-ui` or `@media (pointer: coarse)`. These are the same signal (`src/ui/shell/layout-classifier.js:72`). Never gate on width (TUX-041 req. 7).
- Use `var(--touch-target-min)` and `var(--touch-target-floor)`. Never write a literal 44.
- The probe (`hitAreaInPage`) counts a pseudo-element as owned, because `elementFromPoint` returns the host element. So a `::before` extension is measured correctly.
- The probe is a cross centred on the *element's* clipped rect, with ±22 px. Two consequences follow:
  - **An extension can only help if there are 22 owned px each side of the element's centre.** A 26 px trigger in a 38 px header at `top: 0` (coarseWide, no safe top) can never pass: its centre is at y=19, and y=−3 is off-screen.
  - **Overlapping extensions are self-detecting.** The later sibling's `::before` paints on top and takes the pixels, so the earlier sibling's probe shrinks. Fix overlap with spacing (centre-to-centre ≥ 44 px) or a real box. Do not use `z-index` games. A hidden priority makes the hit ambiguous for the user too.

| # | Group | Technique | Files / selectors | Traps (winners to beat) |
|---|---|---|---|---|
| 1 | Header triggers + theme toggle | **Layout change**: the tablet and touch-wide header grows 38 → 44 px. Then each trigger keeps its 26 px visual pill and gets a centred `::before` 44 px tall (the trigger is 60 px wide already). `#theme-toggle` keeps its 26 px circle and gets a 44×44 `::before`. The gap to `.mobile-pane-handle-right` is 12 px, so the extension ends 3 px clear of the handle (measured: handle right edge 782, extension 785–829). | components.css: new `body.touch-ui:not(.phone-layout) #app-header` (height `calc(var(--touch-target-min) + var(--safe-top))`), `… #app-header .header-main`, `… #top-menubar .top-menu-trigger::before`, `… .theme-toggle::before`. Update the two literal `height: 38px` pane-handle rules (lines 14991, 15130) and their `::after inset: 0 0 -7px` (15141) to the new band. | `[data-ui-skin] #app-header {height:38px}` (1656) and `[data-ui-skin] #app-header {height:calc(38px + var(--safe-top))}` (14552, specificity 1-1-0). `[data-ui-skin] #app-header .header-main {height/min-height:38px}` (1662). `.top-menu-trigger::after` is already the accent underline (8111–8145), so use `::before`. Use `body.touch-ui:not(.phone-layout) #…` (1-2-1 or more). Leave the phone rules (13902–13945, 14602) alone. |
| 2 | Context bar buttons, fields, chips | **Grow the box.** `.ctxbar-content` min-height 44. `.ctxbar-btn` height 44 and min-width 44. `.ctxbar-text-field` min-height 44. `.pen-chip` is a 44×44 box with the 24 px swatch drawn inside. Neighbours sit 2 px apart, so `::before` cannot help the width. Measured worst case: 14 items, 434 px → about 700 px, which fits iPadP (834) and iPhL. On iPhP the bar is hidden. | components.css: a new `@media (pointer: coarse)` ctxbar slice next to the TUX-016 block (14082). It covers `.ctxbar .ctxbar-content`, `.ctxbar .ctxbar-btn`, `.ctxbar .ctxbar-text-field`, `.ctxbar .pen-chip`, `.ctxbar .ctxbar-text-size-caret`. JS: `src/ui/shell/context-bar.js` `GRIP_EXTENDER_PX` (the handle's 12 px extender, 14131–14138) is no longer needed when the bar is 44 tall: set it to 0 on touch, or delete the extender. | Base `.ctxbar-btn {height:26px}` (11881) is 0-1-0, so any `.ctxbar .ctxbar-btn` wins. Check `.ctxbar-algo-menu-wrap .ctxbar-text-field {max-width:150px}` (12018), 12193–12251, and `.pen-chip` (11699). The canvas HUD clear rules key on the ctxbar (15325, 15645): re-check the HUD gap. `computeAnchor` reads `barSize()`, so the TUX-023 handle clearance adapts on its own. |
| 3 | Menubar dropdown items | **Grow the box**: `.top-menu-item` min-height 44 on tablet and touch-wide, and the panel gets `max-height: calc(var(--app-vh) - header - safe) ; overflow-y:auto`. The Object menu grows from 527 px to about 740 px, which is close to the iPadL height of 834. | components.css: `body.touch-ui:not(.phone-layout) #top-menubar .top-menu-item`, `… .top-menu-panel`. | `[data-ui-skin] .top-menu-item {min-height: var(--row-height)}` (1739) and `.top-menu-item` (8174). Max-width 640 block: `.top-menu-item {padding:7px}` (8768). |
| 4 | Paint-bucket variant grid | **Layout change**: on coarse, `grid-template-columns: repeat(auto-fill, minmax(var(--touch-target-min), 1fr))` and `height: var(--touch-target-min)`. The grid wraps to more rows. `#paint-bucket-expand-btn` and `#paint-bucket-pen` get min-height 44. | components.css 4490–4516 (base), TUX-022 block (14479). | The base `repeat(6, …)` is 0-1-0. Check the iPhL pane width: at 211 px it fits 4 columns. |
| 5 | Export modal | Use `::before` for `.export-info-btn` (15×16) and `#export-legend-gear` (22×22; gaps of 85 px or more, so it is safe). The row that holds an info button becomes `:has(> .export-info-btn)` min-height 44 (copy the left-pane pattern at 13789). For `.sw-toggle`, use `::before` and set `margin-inline` so that the centre distance to the info button is ≥ 44 (measured gaps are 6.5–13 px, so overlap is certain without spacing). `#export-preview-*`, `.opt-reset`, `.optimization-row select` and `.slider-row .slider-val` get min-height 44. | components.css TUX-046 block (14306–14478) plus base rules 6384–6868, 9158. **Generalise** `.info-btn` / `.sw-toggle` `::before` from `#left-pane` to a component-level `body.touch-ui` rule. Then groups 7, 13 and 15 also benefit. | The C1 rules are scoped to `[data-ui-skin] #left-pane …` (13780–13810). That is why the same components fail in modals. **Classic skins** set `.sw-toggle {display:inline; width/height:auto}` and show the native checkbox (`:root[data-ui-skin^="classic"]`, 341–344). An absolute `::before` on an inline box still works, but test one Classic skin. |
| 6 | Context bar overflow | The same box growth as group 2: `.ctxbar-overflow` min-width 44 and height 44. Today it measures 30×23 because `.ctxbar-overflow-wrap {align-items:center}` (11919) shrinks it. Use `align-self: stretch` or an explicit height. | components.css 11919–11920, in the ctxbar slice. | |
| 7 | Petal Designer | **Layout change** for `.petal-profile-thumbs`: 5 columns become `auto-fill, minmax(44px,1fr)` on coarse, which gives 2 rows. Box growth for `.petal-profile-side-btn` and `.petal-visualizer-mode select`. `::before` for `.petal-transition-lock .sw-toggle` (from the group 5 generalisation). `.petal-popout` gets min-height 44. | components.css TUX-026 block (14788–14832); base 1064–1184, 7038–7291. | The TUX-026 phone sheet already sizes some controls: extend that block, do not add a second one. |
| 8 | Help modal | **Grow the box**: `.help-tab-btn` and `.help-platform-btn` min-height 44 and min-width 44. The tab strip may wrap: allow `flex-wrap` (or `overflow-x:auto` on iPhP). | components.css 10362–10397, inside the TUX-046 block. | Base rules are 0-1-0. |
| 9 | Scene3D panel | Box growth for `.tab-bar .tab-btn`, `.sect-hdr`, `.vs3-shelf-btn` and `.vs3-tree-addbtn` (48×23, with dashed pills 6 px apart, so a real height is needed). `.vs3-more-caret` (17 px) and `.vs3-tree-vis` (20 px): **merge** the caret into its split button, or give it a 44 px column (layout). | components.css 12943–13267 (vs3 block), `.tab-bar` 871, `.sect-hdr` 187–282. | `.sect-hdr` is shared with the settings panel (13839). Scope to `#scene3d-panel` or to the vs3 root so that the C1 settings sizing is not duplicated. |
| 10 | Welcome CTA | **Grow the box**: `.welcome-tour-btn` min-height 44 (the 1 px gradient wrapper follows it). Also put `cursor:auto` on the wrap: the wrap and the button are counted as two targets because the wrap carries `cursor:pointer`. | components.css 2737–2767. | |
| 11 | Generator picker sub-items | **Grow the box**: `#gm-module-menu .lvl-algo-sub-item` min-height 44 (TUX-035 already does this for `#layer-add-menu`, 14071). Add `scroll-padding` so rows snap whole. | components.css near 14071. | Keep the TUX-035 scope comment: `.lvl-algo-sub-item` is shared with ctxbar fly-outs. |
| 12 | Tool rail / modifier bar | No CSS fix is needed. These controls are 44 px but part-covered by an open menu. This is harness decision D2. If D2 is "no", the menu panel must not overlap the rail, and that is a layout decision. | none | |
| 13 | Document Setup | Box growth for `#theme-family-*` and `#orientation-*` (segmented buttons). `.ctrl-row .sw-toggle` gets the group 5 generalisation. | components.css 2038–2057, 8413–8418, C1 settings rules (13833–13845). | `#theme-family-*` is an id plus a class: use `body.touch-ui .settings-panel …`. |
| 14 | Pens tab headers | Box growth (min-height 44) for `#pens-section-header`, `#auto-colorization-header`, `#palette-toggle` and `#btn-add-pen`. | components.css: add to the C1 block, `[data-ui-skin] #right-pane …` (13736 pattern). | |
| 15 | Left-pane leftovers | Box growth: `#left-pane .grid > button.w-full` (Reset / Randomize, 36 px). C1 lists only `button.w-full`, but the measured size is 36, so check for a later winner such as `.text-xs` or a `height` rule. | C1 block. | Grep `#btn-randomize-params` and `.mb-4.grid` for a fixed `height` that beats `min-height`. |
| 16 | Pane toggles | `#btn-pane-toggle-bottom` (28×29) gets `::before` or a box (TUX-051 block, 15543). `#btn-mobile-pane-left/right` (48×38 in the drawer-open states): the header band grows (group 1), so they become 44 tall. | components.css 15543–15569; 14980–15010, 15120–15142. | |
| 17 | Text panel | Box growth for `.vtp-spec-head-btn`, `.vtp-spec-pill-head` and `.vtp-fontpick-trigger` (37 and 31 px). | components.css: TUX-058 batch 3 block (15706) and `.vtp-*` rules (11094). | The TUX-032 pinned popover keeps a compact head when the keyboard is open (2e9c86aa). Do not grow that head. |
| 18 | Colour picker hex | Box growth: `.color-modal-hex` min-height 44 (it is a text input, so TUX-042 16 px also applies). | components.css 5681, TUX-046 colour rules. | |

---

## 3. Batches

### Collision rule (read first)

`src/ui/skin/components.css` is the only CSS surface (CLAUDE.md). So file-disjoint batches are impossible. Region-disjoint batches are possible:

- **Batch 0 adds empty sentinel blocks** at the end of components.css, one per batch: `/* === TUX-041 slice B1: header === */ … /* === END … === */`. Each batch writes only inside its own sentinel, plus the base-rule line ranges listed for it. Parallel worktrees then merge without end-of-file hunk conflicts.
- `tests/e2e/touch/target-baseline.json` is shared. Each batch lowers only its cells with `TOUCH_BASELINE=update`. Serialise the baseline commits, or regenerate after each merge (the file has `withLock` but no git merge driver).
- Each batch's RED test is a **new strict spec file** that the batch owns: `tests/e2e/touch/targets-<surface>.spec.js`. It uses the same `hitArea` and allowlist as `targets-controls.spec.js`. `targets-controls.spec.js` stays lane C's file.

Desktop parity for every batch:

- Every rule sits under `body.touch-ui` or `@media (pointer: coarse)`.
- Proof: `test:visual` (desktop-chromium, 1600×1000) byte-identical, plus the desktop-only specs in the `desktop-chromium` project.
- `coarseWide` is coarse, so it gets the rules. That is correct per TUX-041 req. 7.

| Batch | Scope (groups) | Files (regions) | Expected drop, 9 projects (under-44 / under-24) | RED (fails before the batch) | Desktop risk |
|---|---|---|---|---|---|
| **B0 Harness + reseed** | §1.3, §1.4, sentinels | `tests/e2e/helpers/target-audit-core.js`, `target-audit-states.js`, `target-baseline.json`, components.css sentinels only | D2 "yes" gives −46 / 0. D3 "yes" gives about −10 / −7. Reseed: no change in counts; the 5 red full cells become green. | `tests/unit/touch-target-ratchet.test.js`: a probe sample that lands on `.top-menu-panel.open` counts as "inert" (unit, fixture DOM). The full-mode run must be green on HEAD after the reseed. | None (tests only). |
| **B1 Header + menubar** | 1, 3, 16 (pane handles) | components.css: sentinel B1; lines 1656–1760, 14552, 14980–15010, 15120–15142 | about −950 / 0 (770 + 177 + handles). **The largest single drop: about 42 % of the gap.** | `targets-header.spec.js` on iPadP, iPadL, coarseWide (Chromium + WebKit): every `#top-menubar .top-menu-trigger`, `#theme-toggle`, `.mobile-pane-handle-*`, and every `.top-menu-item` of each open menu has a hit area ≥ 44. canvasPct must not fall by more than 1.0 pp. Today it fails at 26 px. | Low. The header is 38 px on desktop and must stay so. Check that `body.touch-ui` is never set on a mouse-only desktop. |
| **B2 Context bar** | 2, 6 | components.css: sentinel B2 and 11828–11920, 12018, 12193–12251, 11699, 14131–14138; `src/ui/shell/context-bar.js` (GRIP_EXTENDER_PX) | about −485 / −99 | `targets-ctxbar.spec.js`: in the states default, layer-selected-handles, pen-path-anchors and text-panel, every `.ctxbar.is-visible` button, field and chip ≥ 44, and `.ctxbar-overflow` ≥ 44. Also: the bar fits inside the host (no `scrollWidth` excess), and the bar never covers a selection handle (re-use the TUX-023 check). | Medium. The ctxbar JS is shared with desktop. The JS change must branch on `touch-ui`. Desktop ctxbar e2e: `context-menus-pointer-parity`, `toolbar-handles-desktop`. |
| **B3 Modals** | 5, 8, 13, 18, and the generic `.info-btn` / `.sw-toggle` `::before` | components.css: sentinel B3 and 14306–14478 (TUX-046), 6384–6868, 9158, 10362–10397, 2038–2057, 5681 | about −240 / −45 | `targets-modals.spec.js`: in modal-export, modal-help, modal-document-setup and color-picker, all controls ≥ 44. **No-overlap assertion:** for each pair of neighbouring targets, the probe of A never lands on B. | Low. All `body.touch-ui`. Check a Classic skin `.sw-toggle` on touch. |
| **B4 Panels: fill, picker, pens, left leftovers, welcome, text** | 4, 10, 11, 14, 15, 17 | components.css: sentinel B4 and 4490–4516, 14479–14509, 2737–2767, near 14071, C1 block additions, 15706+ | about −330 / −5 | `targets-panels.spec.js`: in fill-controls, generator-picker, right-pane-pens, default (welcome) and text-panel. Also extend `targets-controls.spec.js` SURFACES only after lane C agrees. | Low. |
| **B5 Scene3D + Petal Designer** | 7, 9 | components.css: sentinel B5 and 12943–13267, 871, 1064–1184, 7038–7291, 14788–14832 | about −160 / −22 | `targets-scene3d-petal.spec.js`: in scene3d-panel, petal-designer-inline and petal-designer-window. It also re-asserts `wcag258Fail` = 0 in those cells (now 7 on scene3d). | Low to medium. The petal thumb grid reflows; check the TUX-026 phone sheet height. |

Order and parallelism:

1. B0 first (it unblocks clean RED/GREEN).
2. B1 and B2 next, in parallel. Their regions are disjoint, but their geometry interacts: if the header grows, the ctxbar anchor moves. So run the B2 GREEN audit after B1 merges.
3. B3, B4 and B5 in parallel after that (region-disjoint).
4. Each batch merge lowers the ratchet (`TOUCH_BASELINE=update`, never `update-any`).

Running total, 9 projects: 2,263 → B0 ≈ 2,207 → B1 ≈ 1,257 → B2 ≈ 772 → B3 ≈ 532 → B4 ≈ 202 → B5 ≈ about 40.
Under-24: 222 → about 50 after B5.

---

## 4. Final state and open decisions

### What can reach §1.5

- **CSS alone (B1–B5) closes about 98 % of under-44** and about 75 % of under-24.
- The rest is the long tail. It is also the target of the "remainder sweep" after B5: run `TOUCH_TARGET_MODE=final`, take the remaining selectors, and fix each one.
- Expected leftovers:
  - split-button carets (`.ctxbar-text-size-caret`, `.vs3-more-caret`)
  - scroll-clipped rows (D3)
  - controls part-covered by a popup (D2)
- After the sweep, switch the spec to **final mode**: the baseline equals the §1.5 thresholds, with `TUX-WAIVER:` gating (requirements §TUX-058 item 5).

### Decisions for Jay

| ID | Decision | Recommendation |
|---|---|---|
| D1 | **The tablet and touch-wide header grows 38 → 44 px** on coarse pointers. This costs about 0.5 pp of canvas share on iPadP. The canvasPct cells must be re-seeded. There is no alternative: on coarseWide (no safe-top band) a 26 px trigger in a 38 px band cannot reach 44. | Yes. |
| D2 | **Part-covered by an open popup is inert.** In the harness, a probe sample that lands on `.top-menu-panel.open` / `.menu-dropdown.open` counts as "outside the state", the same way as the Q13 backdrop rule. This removes 46 false under-44 (tool rail and modifier bar in menu states). | Yes. Otherwise the menus must never overlap the rail, which is a layout redesign. |
| D3 | **A row that its own scroller clips is measured at its unclipped size** (with `scroll-snap` / `scroll-padding` required so that a row never rests half-cut). This removes about 7 under-24 that depend on scroll position. | Yes, with the snap requirement. |
| D4 | **The context bar becomes a 52 px tall bar** (from 34 px) on touch, and wider (worst case about 700 px). It covers more canvas around the selection. | Yes (the alternative is fewer items and more overflow). |
| D5 | **Allowlist proposals (≤ 10; each selector must match one element, so a family cannot be allowlisted).** Proposed: (1) `#mobile-pane-backdrop` (existing). (2) `.ctxbar .ctxbar-text-size-caret`: the 24×44 caret next to the 44 px size field, only if Jay keeps the split control. (3) `.vs3-more .vs3-more-caret`: 24×44 caret, same reason. Each must grow to ≥ 24 wide and pass 2.5.8 spacing. All others: fix. | Prefer to merge both carets into their fields (combobox), which leaves 1 entry. |
| D6 | **Visual of the menubar triggers:** keep the 26 px pill with a hidden 44 px extension (the plan's default), or let the hover/open background fill the full 44 px. | Keep the pill. |
| D7 | **Paint-bucket variants and petal thumbs reflow** to more rows on touch (taller panels). | Yes. |

### Notes for implementers

- `tokens.css` defines `--touch-target-min` twice (line 136 in the TUX-034 block, line 164 in the TUX-041 block). The values are equal. Delete the TUX-034 copy in the TUX-041 REFACTOR step.
- The requirement's REFACTOR line asks to delete ad-hoc coarse sizes at `components.css:3983, 4025, 7862, 8758, 9402`. Those line numbers are from older main. Find the rules again by content before you delete them.
- Hit sizes are capped at 49 in the dump (`radius: 24`), so "49×30" means "width ≥ 49, height 30".
- Re-measure with `node docs/touch-audit/scripts/target-audit.js --port <p> --only ipad-portrait,…`. **It writes to `docs/touch-audit/findings/target-audit.json` in the repo**, so do not commit that output by accident.
