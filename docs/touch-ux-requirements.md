# Touch UX — Finger-Only iPad & iPhone Requirements (v1)

Status: implementation-ready. Owner: Vectura UI / shell / render.
Baseline: v1.4.5, `main` @ `e609338c`.
Source evidence: five specialist audits dated 2026-10-02, all under `docs/touch-audit/`:

| Report | IDs | Count | Method |
|---|---|---|---|
| `findings/ipad-11.md` | IPAD-001…027 | 27 | Live finger-only Playwright emulation, iPad Pro 11" + Air 11" |
| `findings/iphone-pro.md` | IPH-001…036 | 36 | Live finger-only Playwright emulation, iPhone Pro |
| `findings/journeys.md` | JRN-001…019 + journey matrix J1–J12 | 19 | 12 core journeys × 2 devices |
| `findings/code-input-audit.md` | CODE-001…040 | 40 | Static code audit with `file:line` root causes |
| `findings/targets-and-layout.md` + `target-audit.json` | LAY-001…013 | 13 | Measured targets, 4 viewports × 26 states |
| **Total** | | **135** | |

Screenshots: `docs/touch-audit/evidence/{ipad,iphone,journeys,layout}/`. Re-runnable measurement: `docs/touch-audit/scripts/target-audit.js`.

Format: the same phase/lane orchestration model as `docs/canvas-masking-ux-requirements.md` and `docs/illustrator-tools-parity-requirements.md`, with each requirement written as **Red–Green–Refactor** plus an explicit **Definition of Done**. Requirement statements use ASD-STE100 style: short, active, one requirement per sentence, "must".

---

## 0. How to work this document (orchestration contract)

1. **Phase 0 comes first.** The touch harness (TUX-057…TUX-062, including WebKit) must land before any other TUX item. Every RED test below uses its Playwright projects and touch helpers.
2. **Phases run in order. Lanes inside a phase run in parallel only on disjoint file sets.** Re-check disjointness in a scout pass before you spawn implementers (`CLAUDE.md` → Concurrent Development). One implementer per isolated worktree. Adversarial review and a judge follow each lane.
3. **Single-owner files per phase.** `src/render/renderer.js`, `index.html`, `src/ui/shell/workspace.js`, `src/ui/shortcuts.js` and `src/config/defaults.js` each have exactly one owning lane per phase (§5). Other lanes call APIs and file interface requests.
4. **CSS funneling.** All CSS goes in `src/ui/skin/` (`CLAUDE.md` hard rule). Lanes append delimited blocks at the end of `components.css` (`/* === TUX-0xx: … === */`). New tokens go in `tokens.css`. Motion goes in `motion.css`. Before you add a rule, grep the selector for older rules that win on specificity or order. Two of the audited defects are exactly this bug (`.mobile-pane-handle` at `components.css:9595` overrides `:8520`; the coarse 16 px input rule at `:8768` loses to skin rules).
5. **RGR is mandatory.** Write the RED test. Run it on current `main`. Record the failing assertion and the measured value. Then fix. Do not commit a red test alone: commit RED + GREEN together, and quote the observed RED failure in the commit body (`RED: expected innerWidth ≤ 402, got 544`).
6. **`[VERIFY-FIRST]`** marks behavior that may already work on WebKit or in part. Probe it first. If it works, convert the RED into a regression test and record that in the lane report.
7. **`[DEVICE]`** marks a clause that neither Chromium nor WebKit simulation can prove. Every such clause is a row in Jay's real-device checklist (§4.2, TUX-062). A requirement with an open row is "done in simulation, pending device" — never plain "done". Anything simulation *can* prove must be a test, not a checklist row.
8. Requirement IDs are stable. Reference them in commit subjects (`fix(touch): TUX-017 gesture arbiter …`).

### 0.1 Standard Definition of Done (applies to every TUX requirement)

Each requirement's DoD = **D1–D9 below** + the requirement-specific items listed under it.

- [ ] **D1 RED observed.** The RED test exists at the named path. It was run on `main` before the fix and failed on the named assertion. The commit body quotes the failure and the measured value.
- [ ] **D2 GREEN.** The RED test passes in every named project in **both engines**: each Chromium touch project and its WebKit twin (§1.2). An assertion may skip WebKit only through the `engineSupports()` guard (§3 conventions).
- [ ] **D3 Suites.** The suites from the `CLAUDE.md` Testing Matrix pass. UI interaction → `test:integration` + `test:e2e`. CSS/layout → also `test:visual`. Renderer/hit-test logic → `test:unit` + `test:integration` + `test:visual`. Each phase merge → full `npm run test:ci`.
- [ ] **D4 Ratchets hold.** The touch target spec (TUX-058), the journey spec (TUX-059) and the static guard (TUX-060) pass. No ratchet count went up. If a count went down, the baseline file is lowered in the same commit. If a journey flipped to PASS, its `expectedFail` entry is removed in the same commit.
- [ ] **D5 Live verification.** The change was observed in the running app at each named viewport with finger input (Playwright touch emulation; chrome-devtools MCP only if no other session owns it). Screenshots are saved to `docs/touch-audit/evidence/after/TUX-###/<viewport>.png`. If you could not verify, the report starts with "NOT visually verified".
- [ ] **D6 Desktop parity.** `desktop-chromium` and `desktop-visual-chromium` pass. A 1600×1000 mouse screenshot of the touched surface shows no change, unless the requirement says otherwise. Each `pointerType`-branched change has a test that proves mouse behavior is unchanged.
- [ ] **D7 Docs.** `CHANGELOG.md` (Unreleased), `plans.md` and the README release notes are updated. User-visible gestures or controls also update `README.md` feature text, the in-app Help guide and the shortcut list (`CLAUDE.md` Documentation Contracts). The patch version is bumped by the commit hook.
- [ ] **D8 Device items.** Every `[DEVICE]` clause of the requirement is listed in `docs/touch-audit/device-checklist.md` (TUX-062) with its status: `pass`, `fail`, or `deferred-by-Jay`.
- [ ] **D9 Simulated device run.** The simulated device run (§4.1) is green: every Chromium and WebKit touch project, the target audit fast subset and the journey spec. Jay's real-device rows (§4.2) are checked only after D9.

---

## 1. Summary

### 1.1 Problem

Vectura Studio is sized and wired for a mouse and a keyboard. On an 11" iPad and an iPhone Pro, a finger-only user cannot finish **2 of 12** core journeys on iPad and **6 of 12** on iPhone (journey matrix, `journeys.md`). The main causes:

- The iPhone menubar is 544 px wide on a 402 px screen. This inflates the layout viewport, hides Insert and Help, and pushes modal buttons off-screen.
- On iPhone portrait, the Generator and Layers panes cannot be opened by finger. On iPad portrait and iPhone landscape, both panes open by default and cover the tools and the canvas. iPhone landscape has a 44 px canvas and a negative zoom.
- Pinch-zoom fails when the first finger starts a marquee or a drag.
- The Type tool never opens the soft keyboard.
- Context menus open only on right-click. "Convert to Scene" and three other commands have no other entry point.
- Hover-only submenus and invisible-but-tappable buttons add or delete layers by accident.
- 86–94 % of interactive targets are below 44 px. Sliders have 2–6 px hit boxes. Inputs use 11 px text, so iOS zooms the page on focus.

### 1.2 Target devices and viewports

| Short name | Chromium project | WebKit project | Device | CSS viewport | DPR | Notes |
|---|---|---|---|---|---|---|
| `iPadP` | `touch-ipad-portrait` | `webkit-ipad-portrait` | iPad Pro 11" (M4) | 834×1210 | 2 | iPad Air 11" (820×1180) behaves the same; spot-check only. Panes start closed (Decision Q3). |
| `iPadL` | `touch-ipad-landscape` | `webkit-ipad-landscape` | iPad Pro 11" | 1210×834 | 2 | Docked panes + full touch sizing (Decision Q1). |
| `iPhP` | `touch-iphone-portrait` | `webkit-iphone-portrait` | iPhone Pro | 402×874 | 3 | |
| `iPhL` | `touch-iphone-landscape` | `webkit-iphone-landscape` | iPhone Pro | 874×402 | 3 | Full editing target (Decision Q8). |
| `iPhP-c` | `touch-iphone-portrait-chrome` | — | iPhone Pro, Safari toolbars shown | 402×750 | 3 | Static stand-in for the small viewport |
| `iPhL-c` | `touch-iphone-landscape-chrome` | — | iPhone Pro, Safari toolbars shown | 874×330 | 3 | |
| `coarseWide` | `touch-coarse-wide` | — | iPad Pro 13" landscape | 1366×1024 | 2 | Proves touch sizing keys on pointer type, not width (Decision Q1) |

**Assumption — "iPhone 18 Pro".** No published logical size existed for this model at audit time. We assume **402×874 CSS px at DPR 3** (the 16 Pro / 17 Pro logical size). If the shipping device differs, change only the viewport constants in `playwright.config.js` and `tests/e2e/touch/viewports.js`; no requirement depends on the exact number.

All projects use `hasTouch: true`, `isMobile: true` and an iOS Safari user agent. Input is finger-only: `page.touchscreen.tap`, plus CDP `Input.dispatchTouchEvent` (Chromium) or synthetic Touch/Pointer events (WebKit) for multi-touch. No mouse events. The four devices run in both engines, so there are **8 primary projects**.

### 1.3 Goals

1. A finger-only user completes all 12 core journeys on iPad and iPhone, in both orientations, in Chromium and WebKit simulation and on Jay's real devices.
2. No action is reachable only through hover, right-click, double-click timing, a hardware keyboard, the mouse wheel, or HTML5 drag-and-drop.
3. The app shell fits the viewport. It never scrolls, pans or page-zooms.
4. Every interactive control meets the touch-target thresholds in §1.5.
5. Permanent harness: the Chromium and WebKit touch projects, the target audit, the journey specs and the static guard run in CI and block merges, so these defects cannot return.
6. Desktop mouse and keyboard behavior does not change.

### 1.4 Non-goals

- Apple Pencil pressure, tilt or hover. (Pencil must not break; see TUX-021.)
- A native app, PWA install flow, or offline mode.
- iPad Split View / Stage Manager widths below 600 px, beyond "uses the phone layout correctly" (falls out of TUX-006).
- New features. Each new control below (undo button, ⋯ menus, Done chip) exists only to replace an input that touch lacks.
- Moving algorithm generation to a Web Worker. Log it as a PRH item (see TUX-056).
- Android. The work should help Android too, but no requirement is measured there.

### 1.5 Success metrics (release gate for "touch-ready")

| Metric | Threshold | Measured by |
|---|---|---|
| Journey matrix | **J1–J12 PASS in all 8 primary projects** (4 devices × Chromium + WebKit = 96 cells), iPhone landscape included. PASS-WITH-FRICTION does not count. | TUX-059 |
| Horizontal overflow | `scrollWidth − viewportWidth = 0` and `innerWidth = viewport width`, every state, every project | TUX-058 |
| Hit area | Wherever `(pointer: coarse)` matches, at any width (`coarseWide` included), every interactive target: ≥ 44×44 CSS px effective hit area. Allowlisted exceptions: ≥ 24×24 and pass WCAG 2.5.8 spacing. Allowlist ≤ 10 entries, each with a reason. | TUX-058 |
| Absolute floor | 0 targets with a hit dimension < 24 px | TUX-058 |
| iOS focus zoom | 0 text-entry controls with computed `font-size` < 16 px | TUX-058 |
| Covered targets | 0 targets covered at their centre in the default state | TUX-058 |
| Canvas share (grid-sampled) | iPad portrait ≥ 70 % (panes closed); iPad landscape ≥ 45 % with both panes docked, ≥ 60 % with one, ≥ 75 % with none; iPhone portrait ≥ 60 %; iPhone landscape ≥ 60 %; chrome variants ≥ 50 % | TUX-058, TUX-008 |
| Renderer scale | `renderer.scale > 0` in every state; 0 page errors | TUX-058 |
| Static guard | 0 new violations (ratchet to 0 by end of Phase 4) | TUX-060 |
| Simulated device run | Green in all Chromium and WebKit touch projects | §4.1, TUX-061 |
| Real-device checklist | Every §4.2 row `pass` or `deferred-by-Jay`, run by Jay | TUX-062 |

Today: overflow +142 px on iPhone portrait; 85–94 % of targets < 44 px; 18–26 inputs < 16 px per viewport; canvas share 22.2 / 40.4 / 44.5 / **0.8** %; iPhone landscape scale −0.074 with `IndexSizeError`.

---

## 2. Root-cause themes and epics

The 135 findings collapse into 56 product requirements (TUX-001…056) in 11 epics, plus 6 harness requirements (TUX-057…062) in a 12th epic.

| Epic | Theme (root cause) | Representative findings | TUX |
|---|---|---|---|
| **E1 Shell & viewport** | Content wider than the viewport (544 px menubar) inflates the layout viewport. The shell can scroll and page-zoom. Height uses `100vh`. Safe-area insets pad the wrong element. Layout classes use only `innerWidth`. Short heights collapse the canvas to 44 px with negative scale. Reset View re-expands panes. | IPH-001, LAY-001, IPH-004, IPAD-010, IPH-024, IPH-015, LAY-009, IPH-005, LAY-002, JRN-002 | 001–009 |
| **E2 Panes & drawers** | Pane toggles are 28 px and covered by the toolbar (z 60 > 55). The real mobile handles are hidden by a late `display:none`. Panes open by default at 640–899 px. Slivers block the canvas. The layers list truncates names to 0 px. | IPH-002, JRN-001, IPAD-003, LAY-003, IPH-013, IPH-028, IPAD-016, JRN-012 | 010–012 |
| **E3 Tool rail** | The rail wraps to 3 rows (204–254 px). Sub-tool menus need press-hold-slide. The All Tools drawer is clipped. Footer buttons are 13 px. | IPAD-017, IPH-014, IPAD-008, IPH-019, JRN-008, IPH-008, IPH-023 | 013–016 |
| **E4 Canvas gestures** | `canStartTouchGesture()` refuses the second finger once the first finger starts an action. `pointercancel` commits. Hold-to-move has no visible cue. No on-screen zoom or undo. Pencil loses to a resting palm. Paint bucket preview needs hover/wheel. | IPH-007, JRN-003, CODE-005, CODE-022, IPAD-006, IPAD-022, CODE-026, CODE-009 | 017–022 |
| **E5 Canvas hit radii** | Screen-space tolerances are mouse-sized and ignore `pointerType` (resize 10, anchor 6, bezier 5, double-tap 8 px). | IPAD-005, IPH-012, JRN-011, CODE-031, CODE-032, IPAD-015, JRN-013 | 023–027 |
| **E6 Keyboard-free editing** | Type tool reads only `window` `keydown`; no editable element gets focus. No text-content field. Pen commit/cancel/back are keys. Escape, nudge, arrange have no touch path. Soft keyboard covers sheets. Panels read raw modifier flags. | IPAD-001, IPH-006, JRN-004, CODE-001, IPAD-009, CODE-003, IPH-025, CODE-004 | 028–033 |
| **E7 Menus without right-click, hover or dblclick** | Context menus bind only `contextmenu`. The Algorithm submenu opens on `mouseenter` and its parent row commits a layer. Actions hidden by `opacity:0` stay tappable. Destructive delete has no undo affordance. `dblclick`-only resets/edits. `title`-only labels. Menus dismiss on `mousedown`. | IPAD-002, CODE-002, IPAD-007, JRN-007, IPAD-004, JRN-009, CODE-011, IPAD-021, CODE-013, CODE-018, CODE-030 | 034–040 |
| **E8 Panel controls** | The skin is sized for a mouse (24–31 px typical). The coarse 16 px input rule loses on specificity. Range hit boxes are 2–6 px and scroll gestures change values. Grips are `mousedown` + `touch-action: manipulation`; mirror rows are HTML5 DnD only. The modifier bar is desktop-shaped and persisted. | IPAD-012, LAY-006, LAY-007, IPH-010, IPH-011, CODE-010, CODE-029, IPAD-023, CODE-008 | 041–045 |
| **E9 Modals & sheets** | Modals size to the inflated viewport and keep close/primary actions off-screen. Export preview and Pattern Designer zoom only on wheel. Toasts sit under the header. Save sheet buttons are 24 px. | IPH-003, LAY-005, CODE-015, IPH-034, LAY-013, JRN-019, IPAD-027 | 046–051 |
| **E10 Touch-aware copy & help** | Help, status bar and tooltips speak mouse/keyboard only; real touch gestures are undocumented. | IPAD-014, IPH-031, IPH-029 | 052 |
| **E11 iOS platform I/O & performance** | `.vectura` has no iOS UTI; blob URLs revoke synchronously; camera-roll images exceed iOS canvas limits; DPR-3 canvas re-allocates on every resize tick. | CODE-036…040 | 053–056 |
| **E12 Regression guardrails** | No touch viewports in CI except a 375 px toolbar smoke and an 834 px smoke; no target, journey or static guard. | (harness) | 057–062 |

Key de-duplications (one defect, many reports):

- **544 px menubar overflow** → IPH-001, LAY-001, JRN-006, JRN-018, IPH-022(part), IPH-030(glyphs never apply), IPH-021(page shift) → TUX-001.
- **Pane toggles unreachable** → IPH-002, JRN-001, LAY-011, IPH-032, JRN-016(part) → TUX-010.
- **Pinch blocked by first-finger tool** → IPH-007, JRN-003, CODE-005, CODE-023 → TUX-017.
- **Type tool keyboard-only** → IPAD-001, IPH-006, JRN-004, CODE-001 → TUX-028 (+ TUX-029 field).
- **Right-click-only menus** → IPAD-002, IPAD-020, IPH-020, CODE-002 → TUX-034.
- **Hover-hidden destructive buttons** → IPAD-004, IPAD-018, JRN-009, CODE-011, CODE-012, CODE-019 → TUX-036 (+ TUX-037 undo).
- **11 px inputs** → IPAD-011, IPH-010, LAY-007, CODE-039, IPH-033(part) → TUX-042.
- **Tiny canvas hit radii** → IPAD-005, IPH-012, JRN-011, CODE-031, CODE-032 → TUX-023, TUX-024.
- **`100vh`** → IPH-024, CODE-016 → TUX-004.
- **iPhone landscape canvas collapse / negative zoom** → IPH-005, LAY-002, IPH-031(−2 % readout) → TUX-007 (+ TUX-006 classifier).
- **Reset View** → JRN-002 → TUX-009.
- **Panes open by default and cover tools** → IPAD-003, LAY-003, JRN-005, JRN-011(part) → TUX-008.

---

## 3. Requirements

Conventions used below:

- **Projects:** `iPadP`, `iPadL`, `iPhP`, `iPhL` = the four primary devices. Each short name means **both** its Chromium and its WebKit project, so "all primary projects" or "all 4 primary projects" means 8 projects. `iPhP-c`, `iPhL-c`, `coarseWide` are Chromium-only (§1.2).
- **Engine guard:** WebKit has no trusted multi-touch injection. Multi-touch runs there as synthetic events dispatched in the page, which proves app logic. Assertions about browser default actions (page zoom, native scroll, rubber-band) are wrapped in `engineSupports('trustedMultiTouch')` and run in Chromium only. No other WebKit skip is allowed.
- **Helpers:** `tests/e2e/helpers/touch.js` (TUX-057): `tap`, `longPress(ms)`, `drag({holdMs, steps})`, `pinch({staggerMs})`, `twoFingerPan`, `canvasShare()`, `hitArea(el)`.
- **"Current main fails"** gives the value the audit measured, so the RED failure is predictable.
- Priority: **P0** blocks a core journey; **P1** major; **P2** minor.

### Epic E1 — Shell & viewport

#### TUX-001 — Phone header: ☰ menu plus direct primary actions `P0`
- **Devices:** iPhone portrait and landscape (`phone` layout, TUX-006).
- **Sources:** IPH-001, LAY-001, JRN-006 (menus), JRN-018, IPH-022 (trigger size, with TUX-041), IPH-030 (phone glyphs never apply), IPAD-012 (menu trigger row), IPH-003 (viewport inflation), IPH-021 (page shift).
- **Decision:** Q5 — one ☰ overflow menu; no horizontally scrolling menubar; primary actions stay direct.
- **Story:** As a phone user, I want every menu one tap away and Undo, Redo and Export always visible, so that I never pan the screen to find a command.
- **Requirement:**
  1. `#app-header` must not be wider than the viewport at any width.
  2. In `phone` layout, the File, Edit, Object, View, Insert and Help triggers must collapse into one ☰ button of ≥ 44×44 px.
  3. The header must not scroll horizontally.
  4. The ☰ menu must list the six menus as drill-down rows of ≥ 44 px height, with a Back row on each sub-level.
  5. The ☰ menu and every sub-level must open fully inside the viewport and the safe area.
  6. Undo, Redo and Export must stay as direct header buttons of ≥ 44×44 px in `phone` layout.
  7. The Generator and Layers drawer buttons (TUX-010) must also sit in the phone header.
  8. The theme toggle must move into the ☰ menu in `phone` layout.
  9. No two header controls may overlap.
  10. `body.phone-layout` must apply at 402 px wide and at 402 px tall.
- **RED:** `tests/e2e/touch/shell-fit.spec.js` › "phone header" — projects `iPhP`, `iPhL`, `iPhP-c` (Chromium and WebKit). Assert `window.innerWidth === viewport.width` and `document.documentElement.scrollWidth <= viewport.width`; assert `body.phone-layout`. Assert `#btn-menu-hamburger`, Undo, Redo and Export are visible, each `hitArea ≥ 44`, and no two header control rects intersect. Tap ☰ → Insert → assert Insert items visible inside the viewport; Back; tap Help → assert visible. Tap Export → assert the Export modal opens. Assert `#app-header` computed `overflow-x` is not `auto`/`scroll`. *Current main fails:* `innerWidth` 544, Help trigger at x 484–544, no `phone-layout`, no ☰, theme toggle overlaps View.
- **GREEN:** A phone menu mode in `src/ui/shell/header.js`: ☰ trigger + drill-down list built from the existing `.top-menu-panel` content; direct Undo/Redo/Export buttons bound to the existing commands; `max-width: 100vw; overflow-x: clip` on `#app-header`. Markup in `index.html` (single owner). CSS in a `TUX-001` block. Requires TUX-006.
- **REFACTOR:** One menu model: the ☰ list renders from the same menu definitions as the desktop menubar. Undo/Redo/Export header buttons call the same command registry entries as the menus and shortcuts (shared with TUX-020, TUX-030).
- **DoD:** D1–D9, plus:
  - [ ] Target audit on `iPhP` and `iPhL`: `hOverflowStates` empty for all 26 states, including `menu-help` (+326 px today).
  - [ ] Phone glyph CSS for the modifier bar visibly applies (screenshot).
  - [ ] Real-device checklist §4.2 row 18 (no sideways pan of the shell).

#### TUX-002 — The app shell never scrolls or pans `P0`
- **Devices:** all; worst on iPhone portrait.
- **Sources:** IPH-004, LAY-010, JRN-006 (page pan), IPH-026 (shell scrolled during reorder).
- **Story:** As a touch user, I want the header, toolbar and modifier bar to stay put, so that a swipe never moves the app away.
- **Requirement:**
  1. `html` and `body` must not scroll in either axis.
  2. The app wrapper must be `position: fixed` to the viewport.
  3. `html` and `body` must set `overscroll-behavior: none`.
  4. Every scroll container must set `overscroll-behavior: contain`.
  5. A swipe on any non-canvas chrome must not change `window.scrollX/Y` or `visualViewport.offsetLeft/Top`.
- **RED:** `tests/e2e/touch/shell-fit.spec.js` › "shell does not scroll under swipes" — all 4 primary projects. Swipe up on the toolbar (200,270 → 200,50), sideways on the header, up on the modifier bar, and hold-drag a layer row. After each, assert `scrollX === 0`, `scrollY === 0`, `visualViewport.offsetTop === 0`, `visualViewport.offsetLeft === 0`. Also assert computed `overscroll-behavior-y` is `contain` for `#left-panel-content`, `#export-settings-scroll`, `.modal-card--help`, `#petal-designer-window`. *Current main fails:* `offsetTop` 299→309, `offsetLeft` 142.
- **GREEN:** In `components.css` (`.vectura-skin-app-wrapper`, line 42, and `html, body`), fix the wrapper with `position: fixed; inset: 0`, set `overflow: hidden` and `overscroll-behavior: none` on root, and add `overscroll-behavior: contain` to scroll containers. Depends on TUX-001 (removes the overflow source).
- **REFACTOR:** One `.scroll-region` utility (or token-driven rule) that every scroll container uses, instead of per-selector declarations.
- **DoD:** D1–D9, plus:
  - [ ] Target audit `vOverflow` = 0 for every state.
  - [ ] `[DEVICE]` iOS Safari: no rubber-band of the whole app; pull-to-refresh does not fire from panels.

#### TUX-003 — No page-level pinch zoom outside the canvas `P0`
- **Devices:** all.
- **Sources:** IPAD-010, CODE-027.
- **Story:** As a touch user, I want a pinch on a panel to do nothing harmful, so that the app chrome never zooms to 5× and stays stuck.
- **Requirement:**
  1. A two-finger pinch on panels, toolbar, header or modals must not change `visualViewport.scale`.
  2. The canvas and the designated zoomable surfaces (Petal Designer, export preview, Pattern Designer) must keep their own pinch handling.
  3. The shell must set `touch-action: pan-x pan-y` (or stricter); zoomable surfaces must set `touch-action: none`.
  4. On WebKit, the app must call `preventDefault()` on `gesturestart` and `gesturechange` outside the zoomable surfaces.
- **RED:** `tests/e2e/touch/shell-fit.spec.js` › "pinch on chrome does not page-zoom" — `iPadL`, `iPhP`. Pinch out (CDP, 2 fingers, 80 → 300 px) on `#left-panel-content`, `#tool-bar` and the open Export modal; assert `visualViewport.scale === 1` after each. *Current main fails:* scale 5.
- **GREEN:** `components.css` root `touch-action` rule; a small `gesturestart` guard in `src/ui/ui-touch.js`.
- **REFACTOR:** Zoomable surfaces opt in through one attribute (e.g. `[data-touch-zoom]`) read by both the CSS and the guard. No per-surface special cases.
- **DoD:** D1–D9, plus:
  - [ ] `[DEVICE]` iOS Safari ignores `user-scalable=no`; confirm the `gesturestart` guard blocks page zoom on panels, and that system accessibility zoom still works.

#### TUX-004 — Dynamic viewport height, no `100vh` `P0`
- **Devices:** iPhone (both orientations, Safari toolbars shown); iPad.
- **Sources:** IPH-024, CODE-016.
- **Story:** As an iPhone Safari user, I want the modifier bar and modal footers above the browser toolbar, so that I can tap them.
- **Requirement:**
  1. The app height must use `100dvh` with a `100vh` fallback declared first.
  2. Every `calc(100vh − …)` in `src/ui/skin/` must use `dvh` with a `vh` fallback.
  3. `index.html` must not use `h-screen` on `body`.
  4. The bottom-most chrome (`#touch-modifier-bar`, `#status-bar`, modal footers) must lie inside the viewport in every project.
- **RED:** (a) `tests/unit/touch-static-guard.test.js` › "no bare 100vh" (part of TUX-060): every `100vh` occurrence in `src/ui/skin/*.css` must be followed in the same rule by a `dvh` declaration; `index.html` `<body>` must not carry `h-screen`. *Current main fails:* 7 bare `100vh` (components.css:42, 2777, 6027, 6896, 6946, 7602, 7628) + `h-screen` at `index.html:50`. (b) `tests/e2e/touch/shell-fit.spec.js` › "bottom chrome on screen" — all 6 projects: `#touch-modifier-bar` bottom ≤ `innerHeight`.
- **GREEN:** Edit the listed lines in `components.css`; remove `h-screen` from `index.html:50`.
- **REFACTOR:** Add tokens `--app-vh: 100dvh` (with fallback) in `tokens.css`; every height calc uses the token.
- **DoD:** D1–D9, plus:
  - [ ] `[DEVICE]` iPhone Safari with the bottom tab bar visible and with it minimised: modifier bar and Export footer fully visible and tappable.

#### TUX-005 — Safe-area insets on the right elements `P1`
- **Devices:** iPhone both orientations (home-screen and tab mode); iPad home-screen mode.
- **Sources:** IPH-015, LAY-004, CODE-035.
- **Story:** As a user who runs Vectura from the Home Screen, I want menus and buttons clear of the Dynamic Island and home indicator.
- **Requirement:**
  1. `#app-header` must pad by `env(safe-area-inset-top)`, `-left` and `-right`.
  2. `#tool-bar` must not add the top inset again.
  3. `#status-bar`, open drawers and fixed modals must pad by the bottom, left and right insets.
  4. These rules must apply at all widths, not only inside `@media (max-width: 900px)`.
- **RED:** `tests/e2e/touch/safe-area.spec.js` — `iPhP`, `iPhL`, `iPadL`. Use CDP `Emulation.setSafeAreaInsetsOverride` (the iPhone audit used it; if the installed Chromium lacks it, fall back to a CSSOM assertion that `#app-header`, `#status-bar`, `.modal-card`, `.pane-left`, `.pane-right` each have a matching `env(safe-area-inset-*)` padding rule outside any width media query). With portrait insets (top 62, bottom 34): assert every `#app-header` trigger top ≥ 62 and no gap > 4 px between header bottom and toolbar top. With landscape insets (left/right 62, bottom 21): assert the logo, pane toggles, `#btn-add-layer` and pen rows lie inside `[62, width−62]`. *Current main fails:* header at y 0; 62 px band under the header.
- **GREEN:** Move inset padding from `body.mobile-layout #tool-bar` to `#app-header`; add inset padding to status bar, panes and modals in a `TUX-005` block (`components.css:8533, 8601, 8684` are the current sites).
- **REFACTOR:** Tokens `--safe-top/right/bottom/left` in `tokens.css`; all chrome uses them.
- **DoD:** D1–D9, plus:
  - [ ] Target audit `safeUnprotected` list is empty in every project.
  - [ ] `[DEVICE]` iPhone home-screen standalone, portrait and landscape (Dynamic Island side); iPad landscape standalone.

#### TUX-006 — Layout classifier; touch sizing keys on pointer type, not width `P0`
- **Devices:** all; decides iPad landscape and iPhone landscape behavior.
- **Sources:** LAY-009, CODE-034, IPH-005 (part), LAY-002 (part).
- **Decision:** Q1 — iPad landscape keeps docked side panes with full touch sizing; all size and target thresholds follow `(pointer: coarse)`, at any width.
- **Story:** As a touch user, I want touch-sized controls on every iPad and iPhone in every orientation, and a layout that fits my screen.
- **Requirement:**
  1. One pure function must classify the layout from `{width, height, coarsePointer}`.
  2. It must return one of `desktop`, `touch-wide`, `tablet`, `phone`.
  3. `phone` must apply when width < 600, or when height < 500 on a coarse pointer.
  4. `tablet` must apply on a coarse pointer when 600 ≤ width < 900 and height ≥ 500.
  5. `touch-wide` must apply on a coarse pointer when width ≥ 900 and height ≥ 500 (iPad landscape, iPad Pro 13").
  6. `desktop` must apply on a fine pointer when width ≥ 900; a fine pointer below 900 keeps today's `mobile-layout` behavior.
  7. The body must carry `touch-ui` whenever `(pointer: coarse)` matches, in every layout.
  8. Every touch size rule (targets, tool buttons, inputs, sliders, hit radii) must key on `touch-ui` or `(pointer: coarse)`, never on viewport width.
  9. Layout-structure rules (drawers vs. docked panes, rail shape) may key on the layout class.
  10. CSS and JS must agree at exactly 900 px.
  11. A resize or rotation must re-run the classifier.
- **RED:** (a) `tests/unit/touch-layout-classifier.test.js`: table test — 834×1210 coarse → `tablet`; 1210×834 coarse → `touch-wide`; 1366×1024 coarse → `touch-wide`; 402×874 → `phone`; 874×402 coarse → `phone`; 874×330 → `phone`; 1600×1000 fine → `desktop`; 900×700 fine → `desktop`; 899×700 fine → mobile. Fails today: module absent. (b) `tests/e2e/touch/shell-fit.spec.js` › "layout class per project": `iPhL` has `phone-layout`; `iPadL` and `coarseWide` have `touch-ui` and `touch-wide`, and every `.tool-btn` is ≥ 44×44. (c) `desktop-chromium` (1600×1000, fine): no `touch-ui`, tool buttons unchanged. *Current main fails:* `iPhL` gets `mobile-layout` only; `iPadL` tool buttons 34×34; no `touch-ui` class exists.
- **GREEN:** New `src/ui/shell/layout-classifier.js` (IIFE on `window.Vectura`), called from `applyAutoCollapse` in `src/ui/shell/workspace.js:71-84`. Thresholds in `src/config/defaults.js` under a new `TOUCH_LAYOUT` key.
- **REFACTOR:** Remove the three hard-coded `innerWidth` comparisons in `workspace.js`. Every JS reader of layout mode calls the classifier. Replace `@media (max-width: 900px)` gates that mean "touch" with `body.touch-ui` (sizes) or `body.phone-layout` / `body.tablet-layout` (structure).
- **DoD:** D1–D9, plus:
  - [ ] Rotation test: `iPadL` → `iPadP` → `iPadL` via `page.setViewportSize` yields the right classes each time.
  - [ ] Real-device checklist §4.2 row 16 (Split View, Stage Manager).

#### TUX-007 — iPhone landscape keeps a usable canvas; scale stays positive `P0`
- **Devices:** iPhone landscape (874×402, 874×330).
- **Sources:** IPH-005, LAY-002, IPH-031 (negative "−2 %" readout), CODE-025 (shared scale constants).
- **Story:** As an iPhone user in landscape, I want most of the screen to be canvas, so that I can draw and edit.
- **Requirement:**
  1. In `phone` layout with height < 500, the tool rail must be a single vertical side rail or a single horizontal row ≤ 52 px.
  2. Both panes must start closed.
  3. The bottom formula pane must start collapsed with no reserved height.
  4. The modifier bar must not stack below the toolbar rows; it may be a side column.
  5. Canvas share must be ≥ 60 % at 874×402 and ≥ 50 % at 874×330.
  6. `renderer.scale` must stay > 0 for every container size, including 0.
  7. Drawing a text layer or pen path at any container size must not throw.
  8. The zoom readout must never show a negative value.
- **RED:** `tests/e2e/touch/canvas-share.spec.js` — `iPhL`, `iPhL-c`. Load default; assert `canvasShare() ≥ 0.60` (resp. 0.50) and `app.renderer.scale > 0`. Add a Text layer and a 3-anchor pen path; assert no `pageerror`. Plus `tests/unit/renderer-fit-clamp.test.js`: fit to a 874×0 and 0×0 container returns scale ≥ the configured minimum. *Current main fails:* canvas 874×44 (0.8 %), scale −0.074, `IndexSizeError: arc radius (−67.5)`.
- **GREEN:** Phone-compact CSS in a `TUX-007` block; clamp in the renderer fit/center path (`src/render/renderer.js`, `center()` and resize handler); guard the arc radius. Requires TUX-006.
- **REFACTOR:** One `MIN_SCALE` / `MAX_SCALE` pair in config, shared with TUX-020 (CODE-025).
- **DoD:** D1–D9, plus:
  - [ ] Screenshot at 874×402 and 874×330 with a layer selected and handles visible.
  - [ ] `[DEVICE]` iPhone landscape, Safari chrome shown and hidden, both Dynamic Island sides.

#### TUX-008 — Pane defaults: closed on iPad portrait and phones, docked on iPad landscape `P0`
- **Devices:** iPad portrait, iPhone both orientations, iPad landscape.
- **Sources:** IPAD-003, LAY-003, JRN-005, JRN-011 (handles under the Layers pane), IPH-005 (panes open by default).
- **Decision:** Q3 — iPad portrait starts with both panes closed. Q1 — iPad landscape docks both panes.
- **Story:** As an iPad or iPhone user, I want the canvas and every tool visible on first load, and on iPad landscape I want my panels docked and easy to hide.
- **Requirement:**
  1. In `tablet` and `phone` layouts, both side panes must start closed.
  2. In `tablet` and `phone` layouts, an open pane must be a drawer above a backdrop, and at most one drawer may be open.
  3. In `touch-wide` layout, both side panes must start docked (not overlaid).
  4. In `touch-wide` layout, each docked pane must collapse and expand by one finger tap on a control of ≥ 44×44 px (TUX-010).
  5. No pane, docked or drawer, may cover any `#tool-bar` button or the context bar.
  6. Canvas share must be ≥ 70 % on `iPadP` (panes closed), ≥ 60 % on phones, ≥ 45 % on `iPadL` with both panes docked, ≥ 60 % with one pane docked and ≥ 75 % with both collapsed.
  7. A rotation into `tablet` or `phone` must close open panes once.
  8. A rotation into `touch-wide` must restore the docked state the user last chose there.
- **RED:** `tests/e2e/touch/canvas-share.spec.js` › "pane defaults" — `iPadP`, `iPadL`, `iPhP`, `iPhL`, `coarseWide`. Assert the pane states above on load and the matching `canvasShare()` threshold. For every `#tool-bar .tool-btn` and `.ctxbar` button, assert `elementFromPoint(centre)` is the button or its child. On `iPadL`, collapse the left pane by tap, then the right; assert canvas share ≥ 60 % and ≥ 75 %. Rotate `iPadL` → `iPadP` → assert both closed; rotate back → assert the previous docked state. *Current main fails:* `iPadP` 22.2 % with Selection/Direct covered by `#left-welcome-intro` and Fill covered by `#layer-search-input`; `iPadL` 40.4 %.
- **GREEN:** `src/ui/shell/workspace.js` default-collapse logic (today `shouldAuto = width < 640`, lines 73–76) keyed on the classifier; backdrop for `tablet`; docked widths on `touch-wide` sized so that the 45 % floor holds (the coarse layer-card rules must not widen panes past it — TUX-012 moves overflow into ⋯ instead). Requires TUX-006.
- **REFACTOR:** One pane-state controller for the drawer and docked paths (`isPaneOpen` and `closeAllPanes` branch on both today — collapse to one model that stores per-layout state).
- **DoD:** D1–D9, plus:
  - [ ] The welcome intro is still reachable from the left pane.

#### TUX-009 — Reset View fits the content and never changes the layout `P0`
- **Devices:** all touch layouts.
- **Sources:** JRN-002.
- **Story:** As a touch user, I want "Reset View" to fit my art to the canvas, so that I recover from a bad zoom without losing the canvas.
- **Requirement:**
  1. Whenever `touch-ui` applies (any width), Reset View must not open, close or resize any pane.
  2. Reset View must compute the fit after layout settles (next animation frame or `ResizeObserver`).
  3. Reset View must result in `scale > 0` and all visible layer bounds inside the canvas.
  4. Reset View must not open the bottom pane or change toolbar orientation.
  5. Reset View with a fine pointer must keep today's desktop behavior.
- **RED:** `tests/e2e/touch/reset-view.spec.js` — `iPadP`, `iPadL`, `iPhP`, `iPhL`. Add a layer, zoom to 5× (HUD Zoom In or pinch), open View › Reset View by taps (☰ on phones). Assert: pane states unchanged; `#viewport-container` width unchanged (±1 px); `renderer.scale > 0`; every layer's screen bbox inside the canvas rect; `#tool-bar` orientation class unchanged. *Current main fails:* iPhone canvas 0 px wide, scale −0.22; iPad canvas 164 px, left pane 335 px.
- **GREEN:** `src/ui/shell/header.js:160-164` — skip `expandPanes()` under `touch-ui`; call the fit after layout.
- **REFACTOR:** One `fitToView()` renderer method used by Reset View and the HUD Fit button (TUX-020).
- **DoD:** D1–D9.

### Epic E2 — Panes & drawers

#### TUX-010 — Panes open and close by finger on every device `P0`
- **Devices:** all; iPhone portrait is the blocker.
- **Sources:** IPH-002, JRN-001, LAY-011 (toggles covered), IPH-032, JRN-016 (pane toggles), IPAD-012 (chevrons row), IPAD-003 (only exit is 28 px chevrons).
- **Story:** As a touch user, I want labelled pane controls I can always reach, so that I can open the Generator, Layers, Pens, Text and Modifier panels.
- **Requirement:**
  1. In `phone` layout, the header must hold a "Generator" and a "Layers" drawer button, each ≥ 44×44 px with an icon and an `aria-label` that names the pane.
  2. In `tablet` layout, each screen edge must show a labelled drawer handle of ≥ 44×44 px above the toolbar.
  3. In `touch-wide` layout, each docked pane must have a collapse control of ≥ 44×44 px in its header, and a collapsed pane must leave an expand handle of ≥ 44×44 px.
  4. No other element may cover any of these controls (`elementFromPoint` at the centre returns the control).
  5. The toolbar drag handle must not overlap any pane control.
  6. Add Layer and Document Setup must be reachable within two taps from a fresh load on every device.
  7. The unconditional `.mobile-pane-handle { display:none }` (`components.css:9595`) must not override the touch rule (`:8520`).
- **RED:** `tests/e2e/touch/drawers.spec.js` — `iPadP`, `iPadL`, `iPhP`, `iPhL`. Tap the left control; assert `#left-pane` visible and its first `.left-panel-section-header` tappable; close it; repeat for right. Assert every pane control `hitArea ≥ 44` and uncovered. From a fresh load, reach Add Layer and Document Setup in ≤ 2 taps. *Current main fails:* `iPhP` toggles covered by `.toolbar-drag-handle`; `#btn-mobile-pane-left/right` `display:none`; pane width stays 40; chevrons 28×28.
- **GREEN:** Fix the CSS order bug; phone header buttons (with TUX-001); tablet edge handles above the toolbar; touch-wide header collapse controls. Files: `components.css` (TUX-010 block), `index.html:607-617`, `src/ui/shell/workspace.js`.
- **REFACTOR:** One z-index scale in `tokens.css` (`--z-canvas`, `--z-pane`, `--z-backdrop`, `--z-toolbar`, `--z-drawer-handle`, `--z-modal`) replaces the ad-hoc 60 / 55 / 54 order. All of E2 uses it.
- **DoD:** D1–D9, plus:
  - [ ] J1, J2, J6, J9, J11 on `iPhP` and `iPhL` advance past the "open pane" step (journey spec).
  - [ ] Real-device checklist §4.2 row 17 (back-swipe vs. left drawer).

#### TUX-011 — Drawer dismissal and no canvas-blocking slivers `P1`
- **Devices:** iPhone portrait; tablet drawers.
- **Sources:** IPH-013, IPH-028, LAY-011 (290 px drawer, 28 px close).
- **Story:** As a phone user, I want to close a drawer by tapping anywhere outside it, and I want no dead strips over the canvas.
- **Requirement:**
  1. A closed pane must not take pointer events over the canvas.
  2. A closed pane must not reduce the canvas width on phones.
  3. The drawer backdrop must sit above the closed slivers and the toolbar.
  4. A tap anywhere on the backdrop must close the drawer.
  5. An open drawer must have a close control of ≥ 44×44 px.
- **RED:** `tests/e2e/touch/drawers.spec.js` › "dismiss and slivers" — `iPhP`, `iPadP`. With panes closed: `elementFromPoint` on 10 points along x = 2…38 and x = width−38…width−2 (mid-height) returns `#main-canvas`. Open left drawer; tap (width−20, 600); assert drawer closed. *Current main fails:* slivers 40×780 at z 55; tap at (380,600) hit the right sliver.
- **GREEN:** `components.css` collapsed-pane rules; backdrop z via the TUX-010 scale; close button size.
- **REFACTOR:** Backdrop belongs to the pane-state controller from TUX-008.
- **DoD:** D1–D9.

#### TUX-012 — Layers panel stays legible and inside the pane on touch `P1`
- **Devices:** iPad both orientations; iPhone portrait.
- **Sources:** IPAD-016, JRN-012, JRN-009 (Delete clipped past x 834).
- **Story:** As a touch user, I want to read layer, group and modifier names, so that I can find and rename them.
- **Requirement:**
  1. Every layer, group, mirror-modifier and Scene 3D name must show ≥ 96 px of text width.
  2. No row action may extend past the pane's right edge or the viewport edge.
  3. When a row cannot fit its actions at touch size, the secondary actions must move into the row's ⋯ menu (TUX-034).
  4. Hide and Lock may stay inline.
  5. Each row must show a reorder grip with a ≥ 44 px hit area in the leading indent. Reorder starts from the grip at once; a long-press on the card opens its menu and never drags (Decision Q2, TUX-034).
- **RED:** `tests/e2e/touch/layers-panel.spec.js` › "names and actions fit" — `iPadL`, `iPadP`, `iPhP`. Fixture: a doc with Spiral, Flowfield, Text, Petalis, a group, a mirror modifier with a child, and a Scene 3D group (`tests/fixtures/touch/layers-mixed.vectura`, new). Open Layers; assert each `.lvl-name, .lvl-grp-name` `clientWidth ≥ 96`, and each button inside the row lies inside `#right-pane` and the viewport. *Current main fails:* names 3–6 chars; `.lvl-grp-name` 0 px; Delete at x 829–865.
- **GREEN:** `src/ui/panels/layers-panel.js` row template + container-query CSS (prefer container queries per `CLAUDE.md`). Coarse rules at `components.css:7862-7883`.
- **REFACTOR:** Row actions render from one action list that both the inline strip and the ⋯ menu consume.
- **DoD:** D1–D9, plus:
  - [ ] Grip reorder (TUX-044) and long-press menu (TUX-034) both work after the template change.

### Epic E3 — Tool rail

#### TUX-013 — Compact one-row tool rail on tablet portrait and phones `P1`
- **Devices:** iPad portrait, iPhone portrait (landscape in TUX-007).
- **Sources:** IPAD-017, IPH-014, JRN-005 (rail space).
- **Story:** As a touch user, I want the tools in one strip, so that the canvas gets the height.
- **Requirement:**
  1. The rail must be one row of ≤ 64 px height (including safe-area padding).
  2. Overflowing tools must scroll horizontally inside the rail or move into All Tools.
  3. The rail must have no full-width divider lines.
  4. The footer buttons (pin, home, rotate) must be hidden under `touch-ui`. Fit lives in the HUD (TUX-020); TUX-007 removes the need for rotate.
- **RED:** `tests/e2e/touch/toolbar.spec.js` › "one row" — `iPadP`, `iPhP`, `iPhP-c`. Assert `#tool-bar` height ≤ 64; all visible `.tool-btn` share one `top` (±2 px); each is ≥ 44×44. *Current main fails:* 834×204 (iPad), 402×254 (iPhone).
- **GREEN:** `src/ui/shell/toolbar.js` + `TUX-013` CSS block. Update `tests/e2e/iphone-mini.spec.js` if its contract changes (stale vs regression — decide deliberately).
- **REFACTOR:** The rail's primary/overflow split comes from one config list (`src/config/`), not from CSS wrapping.
- **DoD:** D1–D9, plus:
  - [ ] README "bottom-docked tool rail" text matches what ships (IPH-014 note).

#### TUX-014 — Tool sub-menus open by tap and stay open `P0`
- **Devices:** all.
- **Sources:** IPAD-008, IPH-019, JRN-008.
- **Story:** As a touch user, I want to tap a tool's variant arrow and then tap Line, Rectangle or Polygon, so that I can pick a shape without a press-hold-slide.
- **Requirement:**
  1. A tap on a tool's sub-menu indicator must open its sub-menu.
  2. A long-press (≥ 280 ms) followed by release in place must leave the sub-menu open.
  3. The open sub-menu must show labelled rows of ≥ 44 px height.
  4. The sub-menu must open offset from the finger and fully inside the viewport.
  5. A tap on a row must select that tool and close the sub-menu.
  6. A tap outside must close it with no tool change.
  7. Desktop press-drag-release selection must keep working.
- **RED:** `tests/e2e/touch/toolbar.spec.js` › "sub-tool by tap" — all 4 primary projects. `longPress(shapeTool, 500)` then release; assert `.tool-submenu` visible and inside the viewport; tap "Line"; assert the active tool id is the line-shape tool (`app.renderer.tool` / `[aria-pressed=true]`). Repeat with a plain tap on the indicator. *Current main fails:* release closes the menu; tool stays `select`.
- **GREEN:** `src/ui/shell/toolbar.js:308-361, 496-572` — on touch, do not close on `pointerup` over the parent; add tap-to-open on the indicator; enlarge rows in CSS.
- **REFACTOR:** One popover primitive shared by tool sub-menus, the All Tools drawer (TUX-015) and the long-press context menus (TUX-034).
- **DoD:** D1–D9, plus:
  - [ ] `[DEVICE]` iOS long-press on a tool button shows no system callout or loupe.

#### TUX-015 — All Tools drawer fits and sits on top `P1`
- **Devices:** iPhone portrait (clipped); all.
- **Sources:** IPH-008.
- **Story:** As a phone user, I want to see every tool in All Tools, so that I can reach Anchor Point, Polygon and the scissor variants.
- **Requirement:**
  1. The All Tools drawer must lie fully inside the viewport.
  2. It must stack above panes and slivers.
  3. Every item, including the list/grid view toggles, must be ≥ 44×44 px.
  4. In list view, items must show text labels.
- **RED:** `tests/e2e/touch/toolbar.spec.js` › "all tools drawer" — `iPhP`, `iPhL`, `iPadP`. Tap `#tool-overflow-btn`; for every item assert rect inside the viewport and `elementFromPoint(centre)` is the item; `hitArea ≥ 44`. *Current main fails:* 7+ items at x ≥ 397; view toggles 24×22 at x 472/498.
- **GREEN:** `src/ui/shell/tool-drawer.js` (or toolbar.js) positioning; CSS block.
- **REFACTOR:** Uses the popover primitive from TUX-014 (viewport-clamped placement in one place).
- **DoD:** D1–D9.

#### TUX-016 — Toolbar footer and drag handles are touch-safe `P1`
- **Devices:** all.
- **Sources:** IPH-023, JRN-016 (13 px buttons), CODE-020, IPAD-012 (`.toolbar-pin-btn`, drag handle, `.ctxbar-handle` rows).
- **Story:** As a touch user, I want no unhittable 13 px buttons, and I want a drag on a bar handle to move the bar, not the page.
- **Requirement:**
  1. Under `touch-ui`, the toolbar footer buttons (pin, home, rotate) must not render (TUX-013).
  2. Their functions must stay reachable: Fit through the HUD (TUX-020); rotate is not needed once TUX-007 lands.
  3. `.toolbar-drag-handle` and `.ctxbar-handle` must set `touch-action: none` and have a hit area of ≥ 44 px along the drag axis.
  4. A one-finger drag on either handle must move its bar.
- **RED:** `tests/e2e/touch/toolbar.spec.js` › "footer and handles" — `iPadL`, `iPhP`. Assert `.toolbar-pin-btn`, `.toolbar-home-btn`, `.toolbar-rotate-btn` are not visible. `drag(handle, +80, +40)`; assert the bar's rect moved ≥ 60 px and `scrollY === 0`. *Current main fails:* 13×13 px buttons visible; the toolbar does not move on grip drag (JRN-001).
- **GREEN:** `components.css:573, 11888` + footer visibility rule.
- **REFACTOR:** Use the shared touch-target token (TUX-041).
- **DoD:** D1–D9.

### Epic E4 — Canvas gestures

#### TUX-017 — Gesture arbiter: two fingers always pan and zoom `P0`
- **Devices:** all.
- **Sources:** IPH-007, JRN-003, CODE-005, CODE-023.
- **Decisions:** Q4 — two fingers always pan or zoom. Q11 (delegated default) — after the arbitration window, the first action commits.
- **Story:** As a touch user, I want pinch and two-finger pan to work wherever my fingers land, with any tool.
- **Requirement:**
  1. A second touch on the canvas must always start a pinch/pan, with every tool.
  2. When the second touch lands within 250 ms of the first, or before the first has moved 10 px, the renderer must cancel the first finger's action and roll it back completely: no selection change, no move or resize, no pen anchor, no lasso or scissor result, no 3D scene drag.
  3. A roll-back must not add a history entry.
  4. When the second touch lands after that window, the renderer must commit the first action at its current state as one history entry, then start the pinch/pan.
  5. During a pinch/pan, no one-finger action may start until all fingers lift.
  6. The rule must cover Select, Direct Selection, Pen, Lasso, Scissor, Shape, Fill, Hand and the 3D scene drags (`_sceneObjectGizmoDrag`, ground, light, face-pull, orbit).
  7. The window (250 ms, 10 px) must come from config.
- **RED:** (a) `tests/unit/touch-gesture-arbiter.test.js`: pure state machine — `down(p1) → move(3px) → down(p2, +60ms)` → `{rollback: true, start: 'pinch'}`; `down(p1) → move(40px, 400ms) → down(p2)` → `{commitFirst: true, start: 'pinch'}`; `down(p1 on selection) → move(8px, 80ms) → down(p2)` → `{rollback: true}`. Fails: module absent. (b) `tests/e2e/touch/gestures.spec.js` › "pinch anywhere" — all primary projects. For each case — empty canvas with Select; on a selected object (which now moves at once, TUX-019); Pen on empty canvas; Direct Selection; Scene 3D selected — run 8 staggered pinches (`staggerMs: 60`, 100 → 260 px). Assert each changes `renderer.scale` by ≥ 1.5×; selection ids unchanged; every layer transform unchanged; `history.length` unchanged; pen draft has 0 anchors. (c) › "late second finger commits": drag a selected object 40 px over 400 ms, then add a second finger and pinch; assert the object stays moved by 40 px, `history.length` +1, and scale changed. *Current main fails:* scale stays 1.226; `flags:["isSelecting"]`; selection cleared; object x2 437 → 505.
- **GREEN:** Replace the refusal in `renderer.js:1883-1895` (`canStartTouchGesture`) with roll-back/commit-and-start via `cancelActiveInteractionsForTouchGesture` (`:1940-1975`), extended with snapshots and the scene drag flags.
- **REFACTOR:** Extract `src/render/touch-gesture-arbiter.js` (pure, unit-tested); it owns the touch pointer map and the decisions; the renderer only executes. One list of interaction flags feeds both cancel and arbitration, so a new drag type cannot be missed.
- **DoD:** D1–D9, plus:
  - [ ] J3 and J4 PASS in all primary projects.
  - [ ] `test:visual` + `test:perf` (renderer path).
  - [ ] Real-device checklist §4.2 row 10 (10/10 real pinches from empty canvas and from a selected object).

#### TUX-018 — `pointercancel` aborts, never commits `P1`
- **Devices:** all.
- **Sources:** CODE-021, CODE-022.
- **Story:** As a touch user, I want a system gesture (Control Center, notification, palm) to undo the half-done edit, so that my art is not left half-moved.
- **Requirement:**
  1. A `pointercancel` on the canvas must abort the active interaction and restore its pre-gesture state.
  2. A `pointercancel` must not add a history entry.
  3. Every element that handles `pointerdown` + `pointerup` must also handle `pointercancel` through the same end/abort path.
  4. Drag handlers must call `setPointerCapture` on down.
- **RED:** (a) `tests/integration/touch-pointercancel.test.js`: on the runtime renderer, dispatch touch `pointerdown` on a selected layer, hold 400 ms, `pointermove` 50 px, then `pointercancel`; assert the layer transform equals the start and history length unchanged. Repeat for marquee (selection unchanged) and pen (anchor count unchanged). Fails today: `renderer.js:781` routes cancel to `this.up`. (b) Static guard rule "pointerup without pointercancel" (TUX-060) lists `color-picker.js`, `ui-pattern-designer.js`, `algorithm-panel.js`, `pen-picker-popover.js`, `shortcuts.js:771-780`, `harmonograph-motion-rack.js:387-421` today.
- **GREEN:** Abort path in `renderer.js`; add `pointercancel` + capture in the listed files.
- **REFACTOR:** A shared `bindPointerDrag(el, {down, move, end, abort})` helper in `src/ui/` that always binds capture + cancel. New drag code must use it (guard enforces).
- **DoD:** D1–D9, plus:
  - [ ] `[DEVICE]` swipe down Control Center mid-drag on iPhone: object returns to start.

#### TUX-019 — One-finger drag moves objects at once `P1`
- **Devices:** all.
- **Sources:** IPAD-006, IPH-027, CODE-024, IPH-026 (only feedback is `navigator.vibrate`).
- **Decision:** Q4 — a quick one-finger drag on a selected object moves it immediately; no 350 ms hold.
- **Story:** As a touch user, I want to drag an object the way I drag it with a mouse, so that moving art is direct and the view never pans by surprise.
- **Requirement:**
  1. With Select or Direct Selection, a one-finger drag that starts on the selected object must move it once the finger travels 6 px, with no hold time.
  2. A one-finger drag that starts on an unselected object must select it and move it, as a mouse drag does.
  3. A one-finger drag on empty canvas must draw a marquee, as today.
  4. A one-finger drag must never pan the view with Select or Direct Selection; panning is two fingers (TUX-017), the Hand tool or the Pan modifier.
  5. The 350 ms hold-to-lift path and its `navigator.vibrate` call must be removed for touch.
  6. During a move, the selection must show the drag-state style used for mouse drags.
  7. A touch-down and lift with < 6 px travel must count as a tap (select), not a move.
  8. A second finger must hand over to TUX-017 (roll back or commit per its window).
  9. One move must add one history entry.
- **RED:** `tests/e2e/touch/gestures.spec.js` › "direct drag" — all primary projects. Select a layer; `drag` from its centre by (+60, +30) in 150 ms with no hold; assert its position changed by (60, 30) ±2 px, `renderer.offset` unchanged, `history.length` +1. Drag an unselected layer; assert it is selected and moved. Drag on empty canvas; assert marquee selection and offset unchanged. *Current main fails:* the view panned (+64, +32) and the layer did not move (`renderer.js:7208-7230, 7356-7362`).
- **GREEN:** `renderer.js:7209-7231, 7356-7366` — start the move after the 6 px slop for touch; remove the hold timer and the 12 px pan conversion for selection tools.
- **REFACTOR:** One move path for mouse and touch; the only touch-specific values are the slop and the hit radius (from `hitTolerance()`, TUX-023).
- **DoD:** D1–D9, plus:
  - [ ] Help and status hints describe "drag to move, two fingers to pan" (TUX-052).
  - [ ] J3 PASS in all primary projects.

#### TUX-020 — On-screen undo/redo, zoom controls and undo gestures `P1`
- **Devices:** all.
- **Sources:** IPAD-022, JRN-017, IPH-025 (undo, +/- zoom), CODE-005 (no zoom buttons), CODE-025 (pinch max 20× vs wheel 1000×).
- **Decisions:** Q5 — Undo/Redo stay directly reachable. Q9 (delegated default) — on-screen buttons plus two-finger tap = undo, three-finger tap = redo.
- **Story:** As a touch user, I want one-tap undo and zoom, so that I recover from mistakes and zoom without menus.
- **Requirement:**
  1. Undo and Redo buttons of ≥ 44×44 px must be on screen at all times under `touch-ui` (phone: header, TUX-001; tablet and touch-wide: canvas HUD).
  2. Undo/Redo buttons must show availability (disabled when the stack is empty).
  3. Under `touch-ui`, the canvas HUD must show Zoom In, Zoom Out and Fit controls of ≥ 44×44 px.
  4. A two-finger tap (both fingers down and up within 250 ms, each moving < 10 px) on the canvas must undo once.
  5. A three-finger tap on the canvas must redo once.
  6. A tap gesture must not change zoom, selection or geometry.
  7. Pinch zoom and wheel zoom must share one max-scale constant.
- **RED:** `tests/e2e/touch/undo-zoom.spec.js` — all primary projects. Delete a layer via its row; tap the on-screen Undo; assert the layer count is restored; tap Redo; assert it is removed again. Tap Zoom In; assert scale × ≥ 1.2. Two-finger tap on the canvas; assert one undo and unchanged scale. Three-finger tap; assert one redo. `tests/unit/zoom-limits.test.js`: the pinch clamp and the wheel clamp read the same constant (fails: `renderer.js:1928` 20× vs `:6435` 1000×). *Current main fails:* no buttons; two-finger tap does nothing.
- **GREEN:** HUD + phone header buttons wired to the history API and `fitToView()` (TUX-009); tap recognition in the arbiter (TUX-017).
- **REFACTOR:** `MIN_SCALE/MAX_SCALE` shared with TUX-007; undo/redo through the command registry.
- **DoD:** D1–D9, plus:
  - [ ] Shortcut list and Help show the buttons and both tap gestures.
  - [ ] Real-device checklist §4.2 row 10 (two- and three-finger taps).

#### TUX-021 — Apple Pencil wins over a resting palm `P2`
- **Devices:** iPad.
- **Sources:** CODE-026; iPad "could not test" item 7.
- **Story:** As an iPad user with a Pencil, I want my stroke to work even if my palm touched first.
- **Requirement:**
  1. When a `pen` pointer goes down while a `touch` pointer is active, the renderer must cancel the touch interaction (TUX-018 abort path) and give the pen priority.
  2. One-shot and locked touch modifiers (TUX-045) must apply to `pen` pointers too, so that Pencil users can constrain and duplicate.
- **RED:** `tests/integration/touch-pencil-priority.test.js`: touch `pointerdown` on empty canvas (starts marquee), then `pen` `pointerdown` elsewhere; assert marquee cancelled and pen interaction active. Fails: `renderer.js:6457` ignores the pen.
- **GREEN:** `renderer.js:1849-1871, 6457`.
- **REFACTOR:** Pointer-type policy lives in the arbiter (TUX-017).
- **DoD:** D1–D9, plus:
  - [ ] `[DEVICE]` iPad + Pencil, palm resting first.

#### TUX-022 — Paint bucket preview and scope by touch `P1`
- **Devices:** all.
- **Sources:** CODE-009, CODE-017.
- **Story:** As a touch user, I want to see the region before I pour, and widen it, so that fills land where I mean.
- **Requirement:**
  1. With the Fill tool, a touch press-and-hold must show the region preview (and a loupe if feasible) without pouring.
  2. Release must pour into the previewed region.
  3. A move off the canvas or a cancel must pour nothing.
  4. The fill context bar must show Scope ▲ and Scope ▼ chips of ≥ 44 px that change the preview scope.
  5. A quick tap may still pour at once.
  6. Hover-only feedback (hover chips, labels, 3D hover hint) must also show during a touch press-and-hold before commit.
  7. With the Fill tool, press-and-hold means preview, not context menu (TUX-034 req. 11).
- **RED:** `tests/integration/touch-paint-bucket.test.js`: touch `pointerdown` with the Fill tool on a Rings region; after 300 ms assert `_paintBucketHover` set and no fill added; `pointerup`; assert one fill added. Assert scope chips exist in the fill context bar. Fails: `renderer.js:6662-6665` pours at once; scope only on `wheel` (`:6387-6413`).
- **GREEN:** `renderer.js` fill branch; `context-bar-modes.js` chips.
- **REFACTOR:** Hold logic via `TouchHold` (TUX-034).
- **DoD:** D1–D9.

### Epic E5 — Canvas hit radii

#### TUX-023 — Touch-sized transform handles with a visible rotate affordance `P1`
- **Devices:** all.
- **Sources:** IPAD-005, IPH-012 (resize), JRN-011, CODE-032, IPH-013 (handle under sliver; layout fix in TUX-011).
- **Story:** As a touch user, I want to grab a corner with a normal fingertip, and to see where rotation starts, so that resize and rotate do what I expect.
- **Requirement:**
  1. For `pointerType === 'touch'`, the resize hit radius must be ≥ 22 CSS px.
  2. The drawn handles must grow to match on touch layouts (≥ 12 px squares).
  3. The rotate zone must start outside the enlarged resize zone, so that the two never overlap.
  4. Touch layouts must show a visible rotate affordance (a rotate handle or ring segment).
  5. On small selections (< 3× the hit radius per side), handles must nudge outward so that they do not overlap.
  6. Mouse radii must stay at 10 / 28 px.
- **RED:** (a) `tests/integration/touch-hit-handles.test.js`: call `renderer.hitHandle` with `pointerType:'touch'` at 18 px diagonal outside the SE corner → resize key; at 40 px → rotate; with `pointerType:'mouse'` at 18 px → rotate (unchanged). Fails: `RESIZE_R = 10` at `renderer.js:15051`. (b) `tests/e2e/touch/canvas-handles.spec.js` — `iPadL`, `iPhP`: `drag` from 14 px off the SE corner by +40,+40; assert width grew and rotation unchanged. *Current main fails:* rotated −0.98°, no resize.
- **GREEN:** `renderer.js:15050-15075` (hit test) and `:14280` (drawing).
- **REFACTOR:** Radii come from one `hitTolerance(kind, pointerType)` function in config (shared with TUX-024/025/026). No literal radii left in `hitHandle`.
- **DoD:** D1–D9, plus:
  - [ ] J3 PASS in all primary projects.
  - [ ] `test:unit` + `test:integration` + `test:visual` (handle drawing).

#### TUX-024 — Touch-sized anchor, bezier, corner, pen-close and double-tap tolerances `P1`
- **Devices:** all.
- **Sources:** CODE-031, IPH-018, IPAD-009 (double-tap 8 px), IPH-012 (anchor 6 / bezier 5 px).
- **Story:** As a touch user, I want to close a path, grab an anchor and double-tap to finish with a normal fingertip.
- **Requirement:**
  1. For touch, anchor, bezier-handle, corner-widget and light hit tolerances must be ≥ 22 px.
  2. For touch, the pen close-path radius must be ≥ 22 px.
  3. For touch, the double-tap distance must be ≥ 24 px and the interval ≤ 400 ms, using `event.timeStamp`.
  4. When several anchors are inside the radius, the nearest must win.
  5. Pencil and mouse must keep today's values.
- **RED:** `tests/unit/touch-hit-tolerance.test.js` (table: kind × pointerType → px). `tests/e2e/touch/pen.spec.js` › "close by near tap" — `iPadL`, `iPhP`: 3 anchors, then tap 10 px from the first anchor; assert path closed and anchor count 3. › "double-tap with 12 px drift finishes". *Current main fails:* 5 and 10 px offsets add a 4th anchor; 12 px drift does not finish.
- **GREEN:** `renderer.js:4282, 4295, 2472, 3077, 1211, 2080, 2087-2089, 7047` read `hitTolerance()`.
- **REFACTOR:** As TUX-023 — one tolerance source.
- **DoD:** D1–D9, plus:
  - [ ] J5 PASS on all 4 projects.

#### TUX-025 — Touch-sized 3D gizmo targets `P2`
- **Devices:** all.
- **Sources:** IPAD-024, IPH-012 (orbit centre 5 px, markers 9 px).
- **Story:** As a touch user, I want to grab yaw, pitch and roll markers separately.
- **Requirement:**
  1. For touch, the orbit centre and each yaw/pitch/roll marker must have a hit radius ≥ 22 px.
  2. Markers must sit far enough apart that their touch zones do not overlap, or a tap in an overlap must pick the nearest marker.
- **RED:** `tests/integration/touch-gizmo-hit.test.js`: for a Scene 3D selection, sample the gizmo hit test at 18 px from each marker with `pointerType:'touch'`; assert the right marker id.
- **GREEN:** Scene gizmo hit test in `renderer.js` / `src/core/scene3d/*` hit helpers.
- **REFACTOR:** Uses `hitTolerance()`.
- **DoD:** D1–D9, plus `test:visual` for gizmo drawing.

#### TUX-026 — Petal Designer is usable by finger `P1`
- **Devices:** all.
- **Sources:** IPAD-015, LAY-008.
- **Story:** As a touch user, I want to pick one profile anchor and to see the whole designer window.
- **Requirement:**
  1. For touch, the designer must pick the nearest anchor within 22 px.
  2. The designer canvas must support pinch zoom (it has a pinch state machine; reuse it for the inline editor).
  3. Mode buttons, pop-out, pop-in and close must be ≥ 44×44 px.
  4. The pop-out window must fit inside the viewport in every touch project.
  5. On phones, the pop-out must open as a full-screen sheet.
- **RED:** `tests/e2e/touch/petal-designer.spec.js` — `iPadP`, `iPadL`, `iPhP`. Open the window; assert its rect is inside the viewport. Inline: tap 15 px from a known anchor; assert that anchor is selected. *Current main fails:* window bottom 864 > 834 (`iPadL`); 720×1178 at y 266 (`iPadP`).
- **GREEN:** `src/ui/ui-petal-designer.js` (hit test, window placement) + CSS block.
- **REFACTOR:** Window placement uses the shared viewport-clamped sheet from TUX-046.
- **DoD:** D1–D9.

#### TUX-027 — Mirror angle has fine control by touch `P2`
- **Devices:** iPad; iPhone.
- **Sources:** JRN-013.
- **Story:** As a touch user, I want to set a mirror angle within 1°.
- **Requirement:**
  1. The mirror Angle control must change by ≤ 1° per 2 px of finger travel, or offer a numeric field that opens on one tap.
  2. Mirror Disable, Lock and Delete buttons must meet TUX-041.
- **RED:** `tests/e2e/touch/mirror.spec.js` — `iPadL`: drag the angle control 40 px; assert |Δangle| ≤ 20°; tap the value; assert a focused `inputmode="decimal"` input. *Current main fails:* 40 px → 124°.
- **GREEN:** `src/ui/panels/mirror-panel.js` angle control; may reuse `components/angle-dial.js`.
- **REFACTOR:** Use the shared slider/angle component; no mirror-only control.
- **DoD:** D1–D9.

### Epic E6 — Keyboard-free editing

#### TUX-028 — Type tool opens the soft keyboard `P0`
- **Devices:** all (blocker on all).
- **Sources:** IPAD-001, IPH-006, JRN-004, CODE-001.
- **Story:** As a touch user without a keyboard, I want to tap with the Type tool and type, so that I can add text.
- **Requirement:**
  1. A tap with the Type tool must focus a real editable element (a visually hidden `<textarea>`) inside the same user gesture.
  2. A double-tap on an existing text layer in edit mode must do the same.
  3. The editable element must have `font-size ≥ 16px`, `autocapitalize="off"`, `autocorrect="off"`, and `inputmode="text"`.
  4. The controller must take text from `beforeinput`, `input` and composition events, not only `keydown`.
  5. Backspace, Enter (new line) and IME composition must work through the soft keyboard.
  6. The caret must stay above the soft keyboard (`visualViewport` resize → pan the canvas).
  7. Leaving edit mode must blur the element and close the keyboard.
  8. Hardware-keyboard editing on desktop must keep working.
- **RED:** `tests/e2e/touch/type-tool.spec.js` — all 4 primary projects. Tap the Type tool; tap the canvas; assert `document.activeElement` matches `textarea, [contenteditable]` and its computed font-size ≥ 16. Then `page.keyboard.insertText('Hi')` (dispatches `input` without `keydown`); assert the new text layer's text is `"Hi"`. *Current main fails:* `activeElement` is `BUTTON.tool-btn`; `insertText` adds nothing (controller reads only `window` `keydown`, `text-edit-controller.js:762-773`).
- **GREEN:** `src/ui/text-edit-controller.js`: create/focus a hidden textarea proxy at the caret; route `input`/`beforeinput`/`compositionend` into the controller's existing insert/delete operations.
- **REFACTOR:** One input path: `keydown` on desktop and `input` on touch both call the same controller operations. No duplicate editing logic.
- **DoD:** D1–D9, plus:
  - [ ] J7 PASS on all 4 projects.
  - [ ] `[DEVICE]` iPad and iPhone: keyboard opens on tap; emoji, autocorrect suggestion bar and dictation insert correctly; caret visible above keyboard.

#### TUX-029 — Text panel has a text-content field `P0`
- **Devices:** all.
- **Sources:** IPAD-001 (alternative), JRN-004 (no field), IPH-006 (panel route).
- **Story:** As a touch user, I want to edit the words of a text layer in the panel, so that I have a second way to type.
- **Requirement:**
  1. The Text panel must show a multi-line "Text" field bound to the selected text layer.
  2. Editing the field must update the layer live.
  3. One editing session (focus to blur) must add one history entry.
  4. The field must have `font-size ≥ 16px`.
- **RED:** `tests/integration/text-panel-content-field.test.js`: select a text layer; assert the panel contains `textarea[data-text-content]` whose value equals the layer text; set value + dispatch `input`; assert layer text updated; blur; assert history length +1. Fails: field absent.
- **GREEN:** `src/ui/ui-text-panel.js`.
- **REFACTOR:** Field and the canvas proxy (TUX-028) share the controller's set-text operation.
- **DoD:** D1–D9, plus README + Help mention the field.

#### TUX-030 — Pen tool has Done, Cancel and Remove-last controls; tool switch commits `P1`
- **Devices:** all.
- **Sources:** IPAD-009, IPH-018, CODE-003, IPH-025 (Enter/Escape/Backspace).
- **Story:** As a touch user, I want to finish an open path, drop the last anchor or cancel, without a keyboard.
- **Requirement:**
  1. While a pen draft is active, the context bar must show Done, Remove Last Anchor and Cancel, each ≥ 44×44 px.
  2. Done must commit the open path.
  3. Remove Last Anchor must remove one anchor.
  4. Cancel must discard the draft.
  5. A tool change with an active draft of ≥ 2 anchors must commit the draft, not discard it.
- **RED:** `tests/e2e/touch/pen.spec.js` › "done / remove / cancel / switch" — all 4 primary projects. 3 anchors → tap Done → layers +1. 3 anchors → Remove Last → draft 2 anchors. 2 anchors → tap Selection tool → layers +1. *Current main fails:* no chips; tool switch sets `penDraft → null`.
- **GREEN:** `src/ui/shell/context-bar-modes.js` (pen mode chips) calling the existing Enter/Backspace/Escape handlers in `shortcuts.js:364-377`; `renderer.js` tool-change path.
- **REFACTOR:** Shortcut handlers and chips call the same named commands (a command registry entry each), not duplicated code.
- **DoD:** D1–D9, plus shortcut list + Help updated.

#### TUX-031 — Touch equivalents for Escape and in-gesture keys `P1`
- **Devices:** all.
- **Sources:** IPH-025, CODE-007.
- **Story:** As a touch user, I want to cancel drafts, leave group edit, arrange and nudge without keys.
- **Requirement:**
  1. Every draft mode (scissor, fill, algorithm-draw, shape, lasso) must show a Cancel chip in the context bar.
  2. Group-edit mode must show an Exit control of ≥ 44 px.
  3. The Object menu must include Bring Forward, Send Backward, Bring to Front and Send to Back.
  4. Polygon side count and corner type must be adjustable by chips during the draft.
  5. The transform panel must offer nudge by a step for X and Y (or the existing fields must accept one-tap entry).
- **RED:** `tests/integration/touch-escape-equivalents.test.js`: enter each draft mode; assert `[data-action="cancel-draft"]` exists and cancels; enter group edit; assert `[data-action="exit-group-edit"]`; assert Object menu has 4 arrange items. Fails: none exist.
- **GREEN:** `context-bar-modes.js`, `index.html` Object menu (single owner), breadcrumb bar if present.
- **REFACTOR:** Commands registry shared with TUX-030.
- **DoD:** D1–D9, plus shortcut list + Help.

#### TUX-032 — Soft-keyboard-aware fields `P1`
- **Devices:** all; iPad landscape and iPhone most affected.
- **Sources:** JRN-015, JRN-004 (size field appends), CODE-016 (no `visualViewport` use); iPad "could not test" item 1; iPhone "needs device" item 8, JRN-014 (sheet under keyboard).
- **Story:** As a touch user, I want a focused field to stay visible above the keyboard, and I want number fields to replace their value.
- **Requirement:**
  1. A focused text field must scroll into the visual viewport when the keyboard opens.
  2. Bottom sheets must lift by the keyboard inset (`visualViewport` height delta) while it is open.
  3. Search fields in pickers (font picker) must not auto-focus on touch.
  4. Numeric fields must select their whole value on focus.
- **RED:** `tests/integration/keyboard-inset.test.js` (mock `visualViewport` with a 400 px shrink): the shared `KeyboardInset` helper sets `--kb-inset: 400px` on `:root` and calls `scrollIntoView` on the focused field. `tests/e2e/touch/text-panel.spec.js` — `iPadL`: open the font picker; assert `activeElement` is not the search input; tap the size field; assert `selectionStart === 0 && selectionEnd === value.length`. *Current main fails:* search auto-focuses; "40"+"72" appends.
- **GREEN:** New `src/ui/keyboard-inset.js`; font picker; numeric field focus handler.
- **REFACTOR:** All sheets use `--kb-inset`.
- **DoD:** D1–D9, plus:
  - [ ] `[DEVICE]` iPad landscape (keyboard ≈ 400 of 834 px): lower-panel value chips, layer search, Text field and Save Preset stay visible.

#### TUX-033 — Panels and renderer honour touch modifiers `P2`
- **Devices:** all.
- **Sources:** CODE-004, CODE-006.
- **Story:** As a touch user, I want the Shift/Cmd/Alt buttons to work in the layer list and for fill features, so that I can multi-select and use modifier features.
- **Requirement:**
  1. Layer-list click handlers must read modifiers through one shared helper that merges real keys and `SETTINGS.touchModifiers`.
  2. Fill sample, Shift drag-pour and include-occluded must read modifiers through `renderer.getModifierState(e)`.
  3. Panel code must not read `e.metaKey`, `e.ctrlKey`, `e.shiftKey` or `e.altKey` directly.
- **RED:** `tests/integration/touch-modifiers-panels.test.js`: set `SETTINGS.touchModifiers.shift = true`; click row 1 then row 3; assert 3 rows selected (range). Fails: `layers-panel.js:973-1004` reads raw flags. Static guard rule "raw modifier flags outside the helper" (TUX-060).
- **GREEN:** `layers-panel.js`, `renderer.js:6651, 7322, 8216`.
- **REFACTOR:** Move `getModifierState` to a shared `src/ui/input-modifiers.js` used by renderer and panels.
- **DoD:** D1–D9.

### Epic E7 — Menus without right-click, hover or double-click

#### TUX-034 — Long-press opens the context menu; ⋯ is the visible twin `P0`
- **Devices:** all.
- **Sources:** IPAD-002, IPAD-020, IPH-020, CODE-002.
- **Decision:** Q2 — long-press opens the context menu and never also starts a drag.
- **Story:** As a touch user, I want to hold a layer or an object to get its menu, so that I can reach Convert to Scene, Create Boolean Group, Drop to Ground and Select All Faces.
- **Requirement:**
  1. A long-press must be a touch held for **500 ms** with **< 10 px** total movement.
  2. Movement of ≥ 10 px before 500 ms must cancel the long-press; the gesture then continues as a scroll, marquee or move.
  3. At **150 ms**, a progress ring must appear around the touch point and fill until 500 ms.
  4. At 500 ms, the target must give a "pop" (scale to 1.03 and back over 120 ms), and the app must call `navigator.vibrate(10)` where the API exists.
  5. The feedback must be complete without vibration, because iOS Safari has no `navigator.vibrate`.
  6. At 500 ms, the menu must open while the finger is still down, anchored to the target and fully inside the viewport.
  7. After the menu opens, finger movement must not drag, reorder, move, pan or select anything; lifting the finger must leave the menu open; a tap on an item runs it.
  8. A long-press must never start a drag. Layer reorder uses the row grip (TUX-012, TUX-044); canvas moves use a direct drag (TUX-019).
  9. Long-press on a layer card must open the layer context menu.
  10. With Select, Direct Selection or Hand, a long-press on an object must select it and open the canvas context menu; on empty canvas it must open the canvas menu with document-level items (Paste, Select All).
  11. With drawing and fill tools, press-and-hold keeps the tool's own meaning (pen handle drag, fill preview, TUX-022); the ⋯ in the context bar opens the menu there.
  12. Each layer card must show a ⋯ button of ≥ 44×44 px that opens the same menu.
  13. The context bar must offer a ⋯ entry that opens the canvas context menu for the selection.
  14. Every command in `layer-context-menu.js` and `canvas-context-menu.js` must be reachable by touch.
  15. Menu rows must be ≥ 44 px tall.
  16. Long-press must suppress the iOS callout, loupe and text selection on these targets.
- **RED:** `tests/e2e/touch/context-menus.spec.js` — all primary projects. Fixture with a Polyhedron layer. (a) Hold a card: at 250 ms assert `[data-touch-hold-progress]` visible; at 520 ms (finger still down) assert the layer menu is visible and contains "Convert to Scene". Move the finger 80 px, then lift; assert layer order unchanged, no drag ghost, menu still open. (b) Hold 300 ms, move 15 px, lift; assert no menu. (c) Tap the card's ⋯; assert the same menu. (d) With Select, long-press a selected object; assert the canvas menu opens and the object position is unchanged; long-press empty canvas; assert a canvas menu with Select All. (e) Tap "Convert to Scene"; assert a Scene 3D layer exists. *Current main fails:* the card hold starts hold-to-reorder; the canvas hold starts hold-to-move; no menu; "Convert to Scene" unreachable.
- **GREEN:** Expose `openAt()` of `src/ui/menus/layer-context-menu.js:397` and `src/ui/shell/canvas-context-menu.js:467` to a shared `TouchHold` trigger; remove the hold-to-reorder start from `layers-panel.js:317` (reorder moves to the grip); canvas hold hook in `renderer.js` (interface request to the Phase 2 renderer lane); ⋯ on cards and in the context bar; ring/pop styles in `motion.css`, tokens in `tokens.css`.
- **REFACTOR:** `TouchHold` (timer + slop + progress ring + pop + vibrate-if-available) is the single hold implementation, with duration and slop from config; TUX-022 and TUX-039 reuse it. Menus use the popover primitive (TUX-014). Static guard (TUX-060): any `contextmenu` listener must register a `TouchHold` trigger in the same module.
- **DoD:** D1–D9, plus:
  - [ ] J11 PASS in all primary projects.
  - [ ] Help documents long-press and ⋯ (TUX-052).
  - [ ] Real-device checklist §4.2 rows 7 and 19 (no callout; hold is discoverable without haptics).

#### TUX-035 — Add Layer › Algorithm Layer drills down on tap and adds nothing `P0`
- **Devices:** all.
- **Sources:** IPAD-007, IPH-009, JRN-007.
- **Story:** As a touch user, I want to tap "Algorithm Layer" and then pick Flowfield, so that I get exactly one Flowfield layer.
- **Requirement:**
  1. On touch, a tap on the "Algorithm Layer" row must open its submenu in place (drill-down) and must not add a layer.
  2. The submenu must fit the viewport, including the 3D entries; it may scroll inside itself.
  3. The submenu must open toward the thumb side or full-width on phones.
  4. Picking an algorithm must add exactly one layer of that type.
  5. A Back row must return to the parent menu.
  6. Desktop hover-open and click-to-add-default may stay for mouse only.
- **RED:** `tests/e2e/touch/add-layer.spec.js` — all 4 primary projects. Tap Add Layer; tap Algorithm Layer; assert layer count unchanged and submenu rect inside viewport; tap Flowfield; assert count +1 and the new layer type `flowfield`. *Current main fails:* "Added attractor layer" on the first tap; submenu bottom 976 > 874 on `iPhP`.
- **GREEN:** `src/ui/shortcuts.js:607-610` and the `algo-parent` click; reuse the context-bar drill-down at `context-bar.js:2597-2615`.
- **REFACTOR:** One menu component for Add Layer in the panel and the context bar (two implementations today).
- **DoD:** D1–D9, plus:
  - [ ] J1 and J11 no longer leave a stray layer (journey spec asserts layer count).
  - [ ] `[DEVICE]` Safari mouseover heuristic does not swallow the first tap.

#### TUX-036 — No hidden-but-tappable actions; no hover-only reveals `P0`
- **Devices:** all.
- **Sources:** IPAD-004, IPAD-018, JRN-009, CODE-011, CODE-012, CODE-019, IPH-017 (Delete next to Duplicate).
- **Story:** As a touch user, I want to see every button I can hit, so that I never delete or duplicate a layer I cannot see.
- **Requirement:**
  1. Under `(hover: none)`, an element with `opacity < 0.5` or `visibility: hidden` must not receive pointer events.
  2. Under `(hover: none)`, layer and group row actions must be visible on the active row and absent from hit-testing on other rows (or visible on all rows — per TUX-012 layout).
  3. Preset gallery Delete, Revert and Set-Default must be reachable on touch (always visible or in the row's ⋯).
  4. Hover styles must be wrapped in `@media (hover: hover)`, starting with toggles and `.touch-mod-btn`.
  5. Delete must not sit directly next to Duplicate with < 8 px gap.
- **RED:** `tests/e2e/touch/hidden-actions.spec.js` — `iPadL`, `iPhP`. With 3 layers, for every button in a non-active row compute `{opacity, pointerEvents}`; assert none has `opacity < 0.5 && pointerEvents !== 'none'`. Tap where the hidden Delete sits on an inactive card; assert layer count unchanged. With a user preset fixture, open the gallery; assert Delete reachable by tap. Static guard: `.lvl-acts`, `.lvl-grp-acts`, `.hg-preset-delete`, `.hg-preset-set-default`, `.touch-mod-btn` hover rules are inside `@media (hover: hover)`. *Current main fails:* tap deleted "Spiral" (3 → 2); `components.css:7708-7709, 7757, 3916-3922, 3946-3952, 1272-1276`.
- **GREEN:** CSS block `TUX-036`; gallery row ⋯ if needed (`harmonograph-preset-gallery.js`).
- **REFACTOR:** One `reveal-on-hover` utility class whose touch fallback is defined once.
- **DoD:** D1–D9, plus:
  - [ ] `[DEVICE]` iOS sticky-hover on modifier buttons is gone.

#### TUX-037 — Destructive actions are undoable from the spot `P0`
- **Devices:** all.
- **Sources:** IPAD-004 (no confirmation), IPH-017, JRN-009, IPAD-022 (undo two taps deep).
- **Story:** As a touch user, I want an Undo right after a delete, so that an accidental tap costs one tap.
- **Requirement:**
  1. Deleting a layer, group or pen from a panel must show a toast with an Undo button of ≥ 44 px.
  2. The toast must stay ≥ 5 s, or until dismissed.
  3. Undo in the toast must restore the item with its position, mask and modifier membership.
  4. The toast must sit inside the safe area and above the modifier bar (TUX-048).
- **RED:** `tests/integration/delete-undo-toast.test.js`: delete a layer via the row action; assert a toast with `[data-action="undo"]`; activate it; assert the layer is restored at the same index. Fails: no toast.
- **GREEN:** Shared toast module + layer/pen delete handlers.
- **REFACTOR:** One `notifyUndoable(label)` used by all destructive commands.
- **DoD:** D1–D9, plus J12 PASS on all 4 projects.

#### TUX-038 — Every double-tap action has a single-tap or long-press path `P1`
- **Devices:** all.
- **Sources:** IPAD-021, IPH-029, CODE-013, CODE-014, JRN-010.
- **Story:** As a touch user, I want to reset sliders, edit exact values, rename objects and edit curve points without fragile double-taps.
- **Requirement:**
  1. Every value chip must open a numeric input on one tap (`inputmode="decimal"`).
  2. Reset-to-default must be available from a long-press on the control or from its row ⋯ menu.
  3. 3D object rename must have a Rename button or menu item.
  4. Motion-curve points must be addable and removable by long-press or explicit buttons.
  5. Layer rename by double-tap must measure the interval with `event.timeStamp`, not handler time.
  6. Help must not promise "double-click the canvas to generate a new layer" on touch unless double-tap does that.
- **RED:** (a) `tests/integration/layer-rename-timestamp.test.js`: dispatch two taps with `timeStamp` 120 ms apart while the handler is delayed 400 ms (fake timers); assert rename input opens. Fails: `layers-panel.js:971` uses `Date.now()`. (b) `tests/e2e/touch/value-entry.spec.js` — `iPadL`, `iPhP`: tap a legacy value span (`attachValueEditor`); assert a focused `inputmode=decimal` input; long-press a slider; assert a Reset action appears and resets the value. Static guard: `dblclick` listeners without a sibling touch path.
- **GREEN:** `algo-config-panel.js:308-311, 986, 1031`, `components/slider.js:215-220`, `angle-dial.js:284`, `ui-text-panel.js` (6 sites), `noise-rack-panel.js:1648, 1779`, `mirror-panel.js:1863`, `scene3d-panel.js:2692`, `harmonograph-motion-rack.js:~424`, `layers-panel.js:971`.
- **REFACTOR:** All value chips use `components/slider.js:72-77` tap-editable chip; remove `attachValueEditor` legacy spans.
- **DoD:** D1–D9, plus:
  - [ ] `[DEVICE]` `dblclick` delivery in panels vs. inside `touch-action:none` surfaces on iOS 26.

#### TUX-039 — Icon buttons name themselves on touch `P1`
- **Devices:** all.
- **Sources:** CODE-018, IPAD-014 (tool names only in `title`).
- **Story:** As a touch user, I want to learn what an icon does without hover.
- **Requirement:**
  1. Every icon-only button must have an `aria-label`.
  2. A long-press (≥ 500 ms) on an icon-only button must show its name in a visible tooltip, and release must not trigger the button.
  3. On a tool with variants, a long-press must open the variant menu (TUX-014), which shows the names; on every other icon button, a long-press must show the tooltip.
  4. The tooltip must use the `TouchHold` timing and feedback of TUX-034.
- **RED:** `tests/e2e/touch/tooltips.spec.js` — `iPadL`, `iPhP`: `longPress(tool-btn Rectangle, 600)`; assert a visible `[role=tooltip]` containing the tool name and the active tool unchanged. Static guard: icon-only `<button>` without `aria-label` (ratchet; 53 `title=` in `index.html` today).
- **GREEN:** Shared `info-badge`/tooltip component bound to `[aria-label]` via `TouchHold`.
- **REFACTOR:** Remove `title` where `aria-label` + tooltip exist, so screen readers do not double-announce.
- **DoD:** D1–D9.

#### TUX-040 — Menus dismiss on any outside tap `P2`
- **Devices:** all.
- **Sources:** CODE-030.
- **Story:** As a touch user, I want a menu to close when I tap the canvas or empty panel space.
- **Requirement:**
  1. Menus built on `src/ui/overlays/menu.js` must dismiss on a `pointerdown` (capture phase) outside the menu.
- **RED:** `tests/integration/menu-outside-dismiss.test.js`: open a menu; dispatch only `pointerdown` (no `mousedown`) on the canvas; assert closed. Fails: `menu.js:168` listens to `mousedown`.
- **GREEN:** `menu.js:168` → `pointerdown` capture (pattern at `context-bar-modes.js:399`).
- **REFACTOR:** One `onOutsidePointer(el, cb)` helper used by all popovers.
- **DoD:** D1–D9, plus `[DEVICE]` confirm on iOS.

### Epic E8 — Panel controls

#### TUX-041 — One touch-target token: every control ≥ 44 px on coarse pointers `P0`
- **Devices:** all.
- **Sources:** IPAD-012, IPH-022, IPH-032, IPH-033, IPH-035, IPH-036, IPAD-025, IPAD-026, IPH-021 (16 px info button), IPH-017 (row actions), JRN-016, LAY-012, CODE-033, CODE-034, IPAD-019 (14×20 grip), LAY-009 (iPad landscape sizes).
- **Story:** As a touch user, I want every button, row and field big enough for a fingertip, so that I hit what I aim at.
- **Requirement:**
  1. `tokens.css` must define `--touch-target-min: 44px` and `--touch-target-floor: 24px`.
  2. Under `(pointer: coarse)` (or `body.touch-ui`), every interactive control must have an effective hit area of ≥ `--touch-target-min` in both axes.
  3. Where the visual must stay small, the hit area must grow with padding or a `::before` extension, not with a larger visual.
  4. Adjacent targets must not overlap their hit areas.
  5. Exceptions must be listed in `tests/e2e/touch/target-allowlist.json` with a reason; each must be ≥ 24 px and pass WCAG 2.5.8 spacing; the list must hold ≤ 10 entries.
  6. The layer-card scale-up must not need `min-width: 600px` (`components.css:7862`).
  7. Every size rule must key on `(pointer: coarse)` / `body.touch-ui`, never on viewport width (Decision Q1); this includes `touch-wide` and `coarseWide`.
- **RED:** The target spec from TUX-058, switched to strict thresholds for this requirement's surfaces: menus (triggers + items), pane toggles, toolbar, ctxbar, modifier bar, layer rows and header, pens rows, section headers, selects/preset triggers, noise rack controls, info buttons, modal close, Help tabs, Text panel scrub controls, Export nav and secondary controls, Document Setup close + headers. Assert count of targets with `hitArea < 44` (not allowlisted) = 0 per project, including `coarseWide`. *Current main fails:* 206 / 204 / 141 / 131 targets < 44.
- **GREEN:** A `TUX-041` coarse block in `components.css` that consumes the token; per-component fixes where the block cannot reach. Land in slices by surface (menus; panels; modals) to keep diffs reviewable, each slice lowering the ratchet.
- **REFACTOR:** Delete the ad-hoc coarse sizes (`components.css:3983, 4025, 7862, 8758, 9402`) that the token now covers. Skins must not override the token (skin files palette-only, per `AGENTS.md`).
- **DoD:** D1–D9, plus:
  - [ ] Target ratchet for `< 44` reaches the allowlist-only state in all 4 projects.
  - [ ] Desktop screenshots unchanged (token applies only to coarse pointers).
  - [ ] `test:visual` + e2e after CSS change (`CLAUDE.md` CSS rule).

#### TUX-042 — Text-entry controls use ≥ 16 px text on coarse pointers `P0`
- **Devices:** all.
- **Sources:** IPAD-011, IPH-010, LAY-007, CODE-039, IPH-033 (Text panel 11 px input).
- **Story:** As an iOS user, I want to tap a field without the page zooming in and staying zoomed.
- **Requirement:**
  1. Under `(pointer: coarse)`, every `input` (any text-like type, including no `type`), `select` and `textarea` must compute `font-size ≥ 16px`.
  2. The rule must win over every skin rule (scope it under `[data-ui-skin]` or equal specificity, placed after skin rules).
  3. `pens-panel.js:246-249` input must declare `type="text"`.
- **RED:** Target spec (TUX-058) `iosZoom` count = 0 in all 26 states × 4 projects. Plus `tests/e2e/touch/inputs.spec.js` › "focus does not zoom" — `iPhP`: tap `#layer-search-input` and a slider value chip; assert `visualViewport.scale === 1`. *Current main fails:* 26 / 21 / 18 / 6 inputs at 11 px.
- **GREEN:** Fix the losing rule at `components.css:8768-8777`; `pens-panel.js`.
- **REFACTOR:** Font-size token `--input-font-touch: 16px`.
- **DoD:** D1–D9, plus `[DEVICE]` no focus zoom on iPhone and iPad.

#### TUX-043 — Sliders: finger-sized, and scrolling never changes a value `P0`
- **Devices:** all; iPhone worst.
- **Sources:** IPAD-013, IPH-011, LAY-006, CODE-033 (thumbs 11–14 px).
- **Story:** As a touch user, I want to drag a slider easily, and to scroll a panel full of sliders without changing my parameters.
- **Requirement:**
  1. Every range control must have a hit band ≥ 44 px tall on coarse pointers.
  2. The thumb must be ≥ 28 px.
  3. A gesture that starts on a slider and moves mostly vertically (|dy| > |dx| within the first 8 px) must scroll the panel and leave the value unchanged.
  4. A gesture that moves mostly horizontally must change the value.
  5. On touch, a tap on the track must not change the value; a drag from the thumb or a horizontal drag on the band must work; exact entry uses the one-tap value chip (TUX-038). *Decision Q7 (delegated default — Jay may override): a stray tap while scrolling must never change art.*
  6. This applies to `.ctrl-slider`, `.pen-width`, `#draw-order-input`, the export precision slider and the paint-bucket controls.
- **RED:** `tests/e2e/touch/sliders.spec.js` — `iPhP`, `iPadL`. Open Generator; on a `.ctrl-slider`: vertical swipe 0 → −260 px starting on the thumb; assert value unchanged and panel `scrollTop` changed. Horizontal drag 60 px; assert value changed. Tap the track 40 px from the thumb; assert value unchanged. Assert the slider's `hitArea().height ≥ 44`. *Current main fails:* value 1 → −0.3 on scroll; track tap 1 → 3.6; hit box 4 px.
- **GREEN:** `components/slider.js` (shared slider) + CSS (`components.css:412-452, 982-991, 11316`): wrap range in a 44 px band, `touch-action: pan-y` on the band, direction lock in the handler.
- **REFACTOR:** All range inputs go through the shared slider component; static guard flags bare `<input type="range">` outside it.
- **DoD:** D1–D9, plus J1 slider steps PASS.

#### TUX-044 — Reorder by touch everywhere (grips, mirror rows, layer list) `P1`
- **Devices:** all.
- **Sources:** CODE-010, IPH-016, IPAD-019, CODE-028, CODE-029, IPH-026, CODE-020 (handle `touch-action`).
- **Story:** As a touch user, I want to reorder noise layers, effects, pens, mirror rows and layers by dragging.
- **Requirement:**
  1. Every reorder grip and the angle dial must set `touch-action: none`, with higher specificity than the coarse `button { touch-action: manipulation }` rule (`components.css:9419`).
  2. Grips must use native pointer handlers with `setPointerCapture` (migrated off the touch→mouse bridge).
  3. Grips must have a ≥ 44 px hit area.
  4. Mirror-row reorder must work without HTML5 drag-and-drop.
  5. Lists must auto-scroll when a dragged item nears the top or bottom edge.
  6. The shell must not scroll during a reorder (TUX-002).
  7. Layer-list reorder must start from the row grip (TUX-012) without a hold; a long-press on the card opens the menu instead (Decision Q2).
- **RED:** `tests/e2e/touch/reorder.spec.js` — `iPhP`, `iPadL`. Noise rack with 2 entries: drag grip 2 above grip 1; assert order swapped. Mirror modifier with 2 rows: same. Layer list on `iPhP` and `iPhL`: drag row 1's grip below row 3 with no hold; assert order. Long list: drag to the bottom edge; assert the list scrolled. *Current main fails:* order unchanged (noise, layers on iPhone); mirror uses `draggable` only (`mirror-panel.js:1463-1495`).
- **GREEN:** `ui-touch.js:69, 88-98` (bridge), `noise-rack-panel.js:2062, 2186`, `algo-config-panel.js:1045, 3188, 3414, 3726`, `pens-panel.js:472`, `mirror-panel.js`, `layers-panel.js:317-431`.
- **REFACTOR:** One `PointerReorder` helper (based on `_bindCardTouchDrag` in layers) used by all lists; delete the touch→mouse bridge entries it replaces.
- **DoD:** D1–D9, plus:
  - [ ] J2 reorder step PASS on all 4 projects.
  - [ ] `[DEVICE]` iOS: no `pointercancel` mid-drag; HTML5 `draggable` pen→layer drag has a touch path (armed-pen tap, `pens-panel.js:444-449`).

#### TUX-045 — Touch modifier bar speaks touch `P1`
- **Devices:** all.
- **Sources:** IPAD-023, IPH-030, CODE-008, CODE-019 (sticky hover on modifier buttons).
- **Decision:** Q6 (delegated default) — task labels; one-shot latch; double-tap to lock; no CMD/CTRL keys on touch. *Rationale:* touch users think in tasks, not keys, and a one-shot latch removes the "stuck modifier" failure.
- **Story:** As a touch user, I want modifier buttons that say what they do and that do not stay on by surprise.
- **Requirement:**
  1. The bar must show four task buttons: "Multi-select", "Constrain", "Duplicate" and "Pan".
  2. "Multi-select" must map to the Shift/Cmd selection behaviors, "Constrain" to Shift constraints, "Duplicate" to Alt/Option drag and erase-alternate behaviors, and "Pan" to Space-pan.
  3. CMD and CTRL buttons must not show on touch; every feature that read them must map to a task button above.
  4. A single tap must latch a button for the next gesture only; it must release on that gesture's `pointerup`.
  5. A double-tap must lock a button until it is tapped again.
  6. A locked button must show a lock glyph, and the canvas must show a small badge naming the locked modifier.
  7. Modifier state must not persist across reloads.
  8. Latches must apply to the next gesture of any pointer type, including Apple Pencil.
  9. Hover styles on the bar must apply only under `(hover: hover)`.
  10. The bar must not cover panel controls; on `iPhL` it must sit in a side column or collapse to one "Modifiers" button.
- **RED:** `tests/integration/touch-modifiers-latch.test.js`: tap Constrain once; run one pointer gesture; assert the latch is released after `pointerup`. Double-tap; run two gestures; assert still on. Save and reload prefs; assert not persisted (`app.js:473, 655-660`). `tests/e2e/touch/modifier-bar.spec.js` — all primary projects: the bar shows the four labels and no CMD/CTRL; on `iPhL` no target is covered by `.touch-mod-btn`. *Current main fails:* labels SHIFT/ALT/CMD/CTRL/PAN; latches persist; `#paint-bucket-pen` and the Petal lock toggle covered on `iPhL`.
- **GREEN:** `src/ui/ui-touch.js:15-63`, `src/app/app.js`, mapping in `getModifierState` (TUX-033), CSS.
- **REFACTOR:** Task-to-modifier mapping in `src/config/`; labels in config descriptions.
- **DoD:** D1–D9, plus Help and README updated.

### Epic E9 — Modals & sheets

#### TUX-046 — Modals fit the screen with reachable close and primary actions `P0`
- **Devices:** iPhone both orientations (blocker); iPad.
- **Sources:** IPH-003, LAY-005, IPH-021 (512 px info dialog), IPAD-025 (Help close 24 px), LAY-012 (`#btn-close-settings` 24 px), JRN-006 (Export buttons off-screen), IPH-036 (Export nav tabs), IPAD-026 (info dialog).
- **Story:** As a phone user, I want to see Close and Export in the Export dialog, so that I can finish or leave it.
- **Requirement:**
  1. On `phone` layout, every modal must open as a full-screen sheet inside the safe area.
  2. On `tablet`/`touch-wide`, every modal must fit inside the viewport.
  3. The header (title + close) must stay pinned at the top of the sheet.
  4. The footer (primary + secondary actions) must stay pinned at the bottom.
  5. The body between them must scroll.
  6. The close control must be ≥ 44×44 px.
  7. A tap on the backdrop must close non-destructive modals (Help, info, color picker).
  8. No modal header may sit under the app header.
  9. This applies to Export, Help, info, color picker, Document Setup and the preset save sheet.
- **RED:** `tests/e2e/touch/modals.spec.js` — all 6 projects. Open Export by taps (File › Export SVG). Assert `.modal-close` and the Export button each lie inside the viewport and `elementFromPoint(centre)` returns them; tap Export; assert a `download` event. Repeat open/close for Help, an info dialog (tap a `.info-btn`), color picker and Document Setup. *Current main fails:* Export button at (346, 964); close at x 414; Help close at x 487; `iPhL` export header under `.header-main`; color-picker close out of viewport.
- **GREEN:** `components.css` modal rules (bottom-sheet at `:4025` is a base), `src/ui/modals/export-svg.js`, Help and info modal markup. Depends on TUX-001 (viewport inflation).
- **REFACTOR:** One `Sheet` layout (header/body/footer slots, viewport clamp, safe-area tokens) for every modal and the Petal Designer window (TUX-026).
- **DoD:** D1–D9, plus:
  - [ ] J10 PASS on all 4 projects.
  - [ ] `[DEVICE]` Export sheet with Safari toolbar shown and with the keyboard open on the filename field.

#### TUX-047 — Export preview and Pattern Designer zoom by pinch `P1`
- **Devices:** all.
- **Sources:** CODE-015.
- **Story:** As a touch user, I want to pinch the export preview and the Pattern Designer, so that I can inspect detail.
- **Requirement:**
  1. A pinch on the export preview must zoom the preview and not the page.
  2. A pinch on the Pattern Designer canvas must zoom it.
  3. Both surfaces must set `touch-action: none` and opt in through `[data-touch-zoom]` (TUX-003).
- **RED:** `tests/e2e/touch/modals.spec.js` › "export preview pinch" — `iPadL`, `iPhP`: pinch the preview; assert preview scale changed and `visualViewport.scale === 1`. Same for Pattern Designer.
- **GREEN:** `export-svg.js:1188-1189`, `ui-pattern-designer.js:1521`; reuse `ui-petal-designer.js:3023-3150` pinch state.
- **REFACTOR:** Extract the Petal Designer pinch into a shared `PinchZoom` helper used by all three surfaces.
- **DoD:** D1–D9.

#### TUX-048 — Toasts sit inside the safe area and on screen `P2`
- **Devices:** iPhone; all.
- **Sources:** IPH-034.
- **Story:** As a phone user, I want to read toasts.
- **Requirement:**
  1. Toasts must appear bottom-centre above the modifier bar on touch layouts.
  2. Toasts must lie fully inside the viewport and the safe area.
- **RED:** `tests/e2e/touch/toasts.spec.js` — `iPhP`, `iPhL`: trigger "Added … layer"; assert the toast rect inside `[safe-left, width−safe-right] × [safe-top, height−safe-bottom]` and not intersecting `#app-header`.
- **GREEN:** Toast CSS block.
- **REFACTOR:** Toast uses the safe-area tokens (TUX-005).
- **DoD:** D1–D9.

#### TUX-049 — Save Preset sheet is touch-sized and keyboard-safe `P2`
- **Devices:** iPad; iPhone.
- **Sources:** LAY-013, JRN-014.
- **Story:** As a touch user, I want to name and save a preset with the keyboard open.
- **Requirement:**
  1. Save and Cancel must be ≥ 44 px and sit in the sheet footer.
  2. While the keyboard is open, the name field and Save must stay visible (TUX-032 inset).
- **RED:** `tests/e2e/touch/preset-save.spec.js` — `iPadP`, `iPhP`: open the sheet; assert Save/Cancel `hitArea ≥ 44` and Save below the name field. Integration: with a mocked 400 px keyboard inset, the sheet bottom ≥ inset. *Current main fails:* Save 38.7×24, Cancel 54.7×26 at the sheet top.
- **GREEN:** Preset save sheet markup + CSS.
- **REFACTOR:** Uses the `Sheet` layout (TUX-046).
- **DoD:** D1–D9, plus J9 PASS; `[DEVICE]` iPad soft keyboard.

#### TUX-050 — A tap on a select opens it on the first tap `P2`
- **Devices:** iPad.
- **Sources:** JRN-019.
- **Story:** As a touch user, I want the Paper size picker to open on my first tap.
- **Requirement:**
  1. A collapsed Document Setup section must expand from its header only.
  2. A tap on a control inside a section must act on that control.
  3. Sections that hold the primary control (Paper) must start expanded on touch.
- **RED:** `tests/e2e/touch/document-setup.spec.js` — `iPadP`: open Document Setup; tap the Paper size select; assert the select is focused (or the picker opened) and the section state unchanged.
- **GREEN:** `src/ui/modals/document-setup.js` header hit area vs. content.
- **REFACTOR:** Section headers use the shared collapsible component's header-only toggle.
- **DoD:** D1–D9.

#### TUX-051 — Bottom formula pane does not open by stray taps `P2`
- **Devices:** iPad landscape; all.
- **Sources:** IPAD-027.
- **Story:** As a touch user, I want a tap near the bottom of the canvas to act on the canvas.
- **Requirement:**
  1. On touch layouts, only the bottom pane's toggle (≥ 44×44 px) may expand it; the full-width header must not.
  2. The toggle must sit ≥ 8 px from the canvas edge or outside the canvas rect.
- **RED:** `tests/e2e/touch/bottom-pane.spec.js` — `iPadL`: tap 6 px above and 6 px below the canvas bottom edge away from the toggle; assert the bottom pane stays collapsed.
- **GREEN:** Bottom pane header handler + CSS.
- **REFACTOR:** Uses the pane-state controller (TUX-008).
- **DoD:** D1–D9.

### Epic E10 — Touch-aware copy & help

#### TUX-052 — Help, status hints and labels speak touch `P1`
- **Devices:** all.
- **Sources:** IPAD-014, IPH-031, IPH-029 (Help promises a double-click that fails), IPAD-006 (gesture undocumented).
- **Story:** As a touch user, I want instructions that use taps and gestures, so that I can learn the app.
- **Requirement:**
  1. When the last pointer input was touch, the status bar must use touch words ("Tap", "Hold", "Two-finger").
  2. The status bar must not show "Click", "Shift+Click" or "Option+Drag" after touch input.
  3. The Help platform toggle must offer "Touch" next to Mac and Windows.
  4. The Help guide must default to "Touch" on touch-capable devices.
  5. The Touch page must document: tap to select, drag to move (TUX-019), drag a grip to reorder (TUX-044), long-press / ⋯ menus (TUX-034), pinch and two-finger pan (TUX-017), undo/zoom buttons and two-/three-finger taps (TUX-020), pen Done (TUX-030), and the modifier bar (TUX-045).
  6. Help must not describe a gesture that the touch harness does not prove.
- **RED:** `tests/integration/touch-copy.test.js`: set last input to touch; assert status text has no `/Click|Shift\+Click|Option\+Drag/`; open Help; assert a `[data-platform="touch"]` button and a Touch page listing each gesture name.
- **GREEN:** Help guide content, status hint generator, platform toggle.
- **REFACTOR:** Hints come from one string table keyed by input type in `src/config/`.
- **DoD:** D1–D9, plus README "Mobile" feature group updated.

### Epic E11 — iOS platform I/O & performance

#### TUX-053 — Open `.vectura` files from the iOS Files app `P1`
- **Devices:** iPad, iPhone.
- **Sources:** CODE-036.
- **Story:** As an iOS user, I want to reopen my saved project.
- **Requirement:**
  1. On iOS, the open-file inputs must accept files that the picker can select (omit `accept`, or add `application/octet-stream` and `text/plain`).
  2. After the pick, the app must check the content and show an error toast for a wrong file.
- **RED:** `tests/integration/ios-file-accept.test.js`: with an iOS user agent, the open inputs (`index.html:282`, `harmonograph-preset-gallery.js:748`) have no `accept` or an accept list that includes a generic type; a non-Vectura JSON produces the error toast.
- **GREEN:** `ui-file-io.js` sets `accept` per platform.
- **REFACTOR:** One `pickFile({kind})` helper.
- **DoD:** D1–D9, plus `[DEVICE]` open a `.vectura` from Files on iPhone and iPad.

#### TUX-054 — Downloads and export save on iOS `P1`
- **Devices:** iPad, iPhone.
- **Sources:** CODE-037; iPad "could not test" item 9.
- **Story:** As an iOS user, I want Export SVG and Save to give me a file.
- **Requirement:**
  1. Blob URLs must be revoked no sooner than 30 s after `click()`.
  2. When `navigator.canShare({files})` is true on touch devices, export and save must offer the share sheet ("Save to Files").
  3. The download fallback must stay for other platforms.
- **RED:** `tests/integration/download-revoke.test.js` (fake timers): after `downloadBlob()`, `URL.revokeObjectURL` is not called synchronously; it is called after 30 s. Fails: sync revoke at `ui-file-io.js:89-97, 873-880, 947-954`, `preset-bundle.js:71`, `ui-pattern-designer.js:979, 2063`, `ui-petal-designer.js:604`.
- **GREEN:** One `downloadBlob()` helper used by all sites.
- **REFACTOR:** Remove the seven inline copies.
- **DoD:** D1–D9, plus `[DEVICE]` SVG and `.vectura` save on iPhone and iPad.

#### TUX-055 — Camera-roll images import safely `P1`
- **Devices:** iPad, iPhone.
- **Sources:** CODE-038.
- **Story:** As an iPhone user, I want to use a photo as an image source without a silent failure or a crash.
- **Requirement:**
  1. Image import must downscale to ≤ 4096 px on the long side before drawing.
  2. A null canvas context must show an error toast.
- **RED:** `tests/integration/image-asset-downscale.test.js`: a mocked 8000×6000 image yields a canvas ≤ 4096 long side; a null context shows the toast. Fails: `image-asset.js:80-87`.
- **GREEN:** `src/ui/modals/image-asset.js`.
- **REFACTOR:** Max-dimension constant in config.
- **DoD:** D1–D9, plus `[DEVICE]` 48 MP photo import on iPhone Pro.

#### TUX-056 — Canvas does not re-allocate needlessly; DPR capped on touch `P2`
- **Devices:** iPhone (DPR 3); iPad.
- **Sources:** CODE-040.
- **Story:** As a mobile user, I want smooth pinch and no flicker when Safari's toolbar moves.
- **Requirement:**
  1. The renderer must skip canvas re-allocation when the backing size does not change.
  2. On touch devices, the main canvas backing DPR must be capped at 2.
  3. Moving generation to a Worker is out of scope; log it as a new `PRH-###` in `docs/pre-release-hardening-log.md`.
- **RED:** `tests/unit/renderer-resize-alloc.test.js`: two `ResizeObserver` ticks with the same size cause one allocation; with DPR 3 and coarse pointer the backing scale is 2. Fails: `renderer.js:4877-4885`.
- **GREEN:** `renderer.js` resize path.
- **REFACTOR:** DPR cap in config.
- **DoD:** D1–D9, plus `test:perf`; `[DEVICE]` pinch smoothness with a heavy Flowfield.

---

## 4. Regression guardrails (permanent harness)

These six requirements form **Phase 0**. They land first, in ratchet mode, so that every later RED test has a home and every later fix lowers a counted number.

#### TUX-057 — Touch Playwright projects and helpers `P0`
- **Sources:** all live audits (harness). Existing `tablet-touch-chromium` (834×1194, smoke only) and `phone-iphone-mini-chromium` (375×812) stay.
- **Requirement:**
  1. `playwright.config.js` must define every project in §1.2 (7 Chromium, 4 WebKit — the WebKit ones per TUX-061) with `hasTouch: true`, `isMobile: true`, the device DPR and an iOS Safari user agent, matching `testMatch: /touch\/.*\.spec\.js$/`.
  2. Viewport constants must live in one file, `tests/e2e/touch/viewports.js`.
  3. `tests/e2e/helpers/touch.js` must provide `tap`, `longPress`, `drag`, `pinch`, `twoFingerPan` (CDP `Input.dispatchTouchEvent`), `canvasShare` (48×48 `elementFromPoint` grid), and `hitArea` (probe grid around the centre; the area where `elementFromPoint` resolves to the target or its descendants).
  4. Helpers must not emit mouse events. Multi-touch helpers must use CDP in Chromium and synthetic in-page Touch/Pointer events in WebKit, and must expose `engineSupports(capability)`.
  5. `npm run test:e2e` enumerates spec files explicitly today; it must add `playwright test tests/e2e/touch --reporter=line`, or CI will never run these specs.
  6. Fixtures for touch specs live in `tests/fixtures/touch/`.
  7. `npm run test:e2e:touch` must run all Chromium and WebKit touch projects; `test:e2e` and `test:ci` must call it.
- **RED:** `tests/e2e/touch/harness.spec.js`: in each project, `matchMedia('(pointer: coarse)').matches === true`, `(hover: none)` true, `navigator.maxTouchPoints > 0`, viewport equals the constant, and `tap()` on a button fires `pointerdown` with `pointerType === 'touch'` and no `mousedown` before `pointerup`. Fails: projects absent.
- **GREEN:** Config + helpers (port the CDP code from `docs/touch-audit/scripts/target-audit.js`).
- **REFACTOR:** Existing `iphone-mini.spec.js` and the touch part of `smoke.spec.js` use the helpers.
- **DoD:** D1–D3, D7; CI run green on the new projects; `docs/testing.md` and `docs/agentic-harness-strategy.md` describe the projects (workflow doc contract).

#### TUX-058 — Target and layout audit as a CI spec `P0`
- **Sources:** LAY-001…013 (measurement), `target-audit.js`.
- **Requirement:**
  1. `tests/e2e/touch/target-audit.spec.js` must run the audit logic of `docs/touch-audit/scripts/target-audit.js` (moved into `tests/e2e/helpers/target-audit-core.js`) in the eight primary projects and `coarseWide`.
  2. CI must run a fast subset of states on every PR: `default`, `left-pane-open`, `right-pane-layers`, `menu-file`, `layer-add-menu`, `modal-export`, `modal-help`, `text-panel`, `layer-selected-handles`. The full 26 states must run nightly.
  3. Per project and state it must assert, against `tests/e2e/touch/target-baseline.json`: `hOverflow`, `vOverflow`, count `hitArea < 44` (not allowlisted), count `< 24`, WCAG 2.5.8 fails, `iosZoom` count, `covered` count, `safeUnprotected` count, `canvasPct`, and `renderer.scale > 0` with 0 page errors.
  4. **Ratchet mode:** a count above the baseline fails. A count below the baseline fails with "ratchet down: update target-baseline.json", so that gains are locked in the same commit.
  5. **Final mode** (end of Phase 4): the baseline equals the §1.5 thresholds, and the baseline file can no longer be raised without a `TUX-WAIVER:` line in the commit body.
  6. The spec must measure hit area by probing, so that `::before` extensions count.
- **RED:** The spec with §1.5 absolute thresholds fails on current main (overflow +142 px, 206 targets < 44 on `iPadP`, canvas 0.8 % on `iPhL`). Commit it in ratchet mode with today's measured baseline (green), then each requirement lowers the numbers.
- **GREEN/REFACTOR:** `docs/touch-audit/scripts/target-audit.js` becomes a thin CLI over the shared core, so the manual tool and CI never drift.
- **DoD:** D1–D3, D7; nightly workflow job added; `docs/testing.md` documents the ratchet.

#### TUX-059 — Finger-only journey specs J1–J12 `P0`
- **Sources:** `journeys.md` matrix (J1–J12 × 2 devices), JRN-001…019.
- **Requirement:**
  1. `tests/e2e/touch/journeys.spec.js` must script J1–J12 exactly as defined in `journeys.md`, finger-only, in the eight primary projects (4 devices × Chromium + WebKit = 96 cells). iPhone landscape is a full editing target (Decision Q8).
  2. A journey PASSES only if every step succeeds by tap/drag/pinch/long-press, with no JS `.click()`, no `selectOption` without a prior tap, no `page.keyboard.type` (use `insertText` for soft-keyboard text), and no stray side effects (layer count, selection and history are asserted after each step).
  3. A ledger `tests/e2e/touch/journey-status.json` must list each currently failing cell. The spec must mark those cells `test.fail()` (expected failure). A cell that starts to pass then fails the run ("unexpectedly passed"), so the ledger entry must be removed in the fixing commit.
  4. `.skip` and `.only` are forbidden in this spec.
- **RED:** Today's matrix: on iPad, J4 and J7 FAIL and 9 cells are PASS-WITH-FRICTION; on iPhone, J1, J2, J4, J6, J7, J9, J11 fail or need JS. Strict PASS criteria make every friction cell fail too. The ledger starts with every failing cell.
- **GREEN:** Each TUX requirement removes ledger entries (see the journey coverage table in §6.2).
- **REFACTOR:** Journey steps reuse page-object helpers (`openLayers()`, `addAlgorithmLayer(type)`, `selectTool(id)`), shared with the focused TUX specs.
- **DoD:** D1–D3, D7; ledger empty = success metric 1.

#### TUX-060 — Static touch guard (lint by test) `P1`
- **Sources:** CODE-002, 010, 011, 012, 013, 014, 016, 018, 019, 021, 029, 030 (pattern classes).
- **Requirement:**
  1. `tests/unit/touch-static-guard.test.js` must scan `src/` and `index.html` and count these patterns per file:
     - `addEventListener('contextmenu'` / `oncontextmenu` without a touch trigger registered through the shared long-press helper in the same module;
     - `mouseenter`/`mouseover`-only open logic (a `mouseenter` handler that opens UI with no `click`/`pointerup` path);
     - `onmousedown` / `addEventListener('mousedown'` without a matching `pointerdown`;
     - `pointerup` without `pointercancel` in the same module;
     - `dblclick` without a single-tap or long-press alternative marker;
     - HTML5 DnD (`draggable=`, `dragstart`, `dataTransfer`) without a pointer-reorder path;
     - bare `100vh` without a `dvh` declaration in the same rule; `h-screen` on `body`;
     - CSS `:hover` rules that change `opacity`, `display` or `visibility` outside `@media (hover: hover)`;
     - icon-only `<button>` without `aria-label`;
     - direct `e.metaKey|ctrlKey|shiftKey|altKey` reads outside the modifier helper;
     - `<input type="range">` outside the shared slider component.
  2. Counts must be compared to `tests/unit/touch-static-guard-baseline.json` with the same ratchet rule as TUX-058.
  3. A line may opt out with `// touch-ok: <reason>` (CSS: `/* touch-ok: <reason> */`); opt-outs are counted and capped.
- **RED:** With an all-zero baseline the test fails on main (e.g. `contextmenu` in `layer-context-menu.js:397` and `canvas-context-menu.js:467`, 7 bare `100vh`, `.lvl-acts:hover` opacity). Commit with today's counts as the baseline.
- **GREEN/REFACTOR:** Each epic lowers its counts. Target: all zero (or opt-outs only) at the end of Phase 4.
- **DoD:** D1–D3, D7; runs inside `test:unit` (pre-push `test:fast`).

#### TUX-061 — WebKit touch projects (mandatory) `P0`
- **Sources:** all `[DEVICE]` notes; Playwright WebKit is **not installed** today (only Chromium caches exist).
- **Decision:** Q10 — Jay runs real-device checks; Phase 0 makes simulated checks real and mandatory.
- **Requirement:**
  1. Phase 0 must install Playwright WebKit locally and in CI (`npx playwright install --with-deps webkit`).
  2. `playwright.config.js` must define `webkit-ipad-portrait`, `webkit-ipad-landscape`, `webkit-iphone-portrait` and `webkit-iphone-landscape` with the viewports, DPR, `hasTouch: true`, `isMobile: true` and iOS user agents of §1.2.
  3. The WebKit projects must run every spec under `tests/e2e/touch/`, including the journeys and the target audit fast subset.
  4. The WebKit projects must block merges from the day they land, like the Chromium touch projects.
  5. An assertion may skip WebKit only through the `engineSupports()` guard (§3 conventions), never through `.skip`.
  6. `docs/testing.md` must state what WebKit simulation does not prove: iOS dynamic toolbar and `100dvh`, the soft keyboard, the Files picker and downloads, system callouts, `contextmenu`/`dblclick` synthesis, trusted multi-touch, and real performance. Those items belong to §4.2.
- **RED:** `tests/e2e/touch/harness.spec.js` in the WebKit projects fails today (WebKit absent; projects undefined).
- **GREEN:** Config, CI install step, helper engine paths (TUX-057).
- **REFACTOR:** One viewport constants file feeds both engines.
- **DoD:** D1–D3, D7, D9; CI job green; `docs/testing.md` and `docs/agentic-harness-strategy.md` updated.

#### TUX-062 — Real-device checklist for Jay and release gate `P1`
- **Sources:** iPad "could not test" 1–10, iPhone "needs real iOS Safari" 1–10, CODE §5, every `[DEVICE]` clause above.
- **Decision:** Q10 — Jay runs the real-device checks.
- **Requirement:**
  1. `docs/touch-audit/device-checklist.md` must hold the §4.2 table, with device model, iOS version, browser mode (tab / Home Screen), result and date per row.
  2. A row may enter the checklist only if Chromium and WebKit simulation cannot prove it.
  3. A requirement with an open checklist row is "done in simulation, pending device", never plain "done".
  4. The release that claims "touch-ready" in README must have every row `pass` or `deferred-by-Jay`.
  5. A `fail` row must open a new TUX requirement or reopen the owning one, with a RED test where simulation can express it.
- **DoD:** Checklist committed and linked from `docs/testing.md`; first full pass by Jay recorded before the touch-ready release.

### 4.1 Simulated device run

Run this before any TUX commit that touches UI, and before handing anything to Jay (DoD D9).

```bash
# one-time per machine (CI does this in the e2e job)
npx playwright install chromium webkit

# 1. All touch projects, both engines (Chromium touch ×7, WebKit touch ×4)
npm run test:e2e:touch

# 2. One device / engine while iterating
npx playwright test tests/e2e/touch --project=webkit-iphone-landscape
npx playwright test tests/e2e/touch/journeys.spec.js --project=touch-ipad-portrait

# 3. Full 26-state target audit (nightly in CI; run locally before a phase merge)
node scripts/dev-server.js 8414 &
node docs/touch-audit/scripts/target-audit.js --port 8414 --engine chromium
node docs/touch-audit/scripts/target-audit.js --port 8414 --engine webkit
node docs/touch-audit/scripts/target-audit-summarize.js

# 4. Phase merge: everything
npm run test:ci
```

Artifacts produced:

| Artifact | Path | Use |
|---|---|---|
| HTML report | `playwright-report/index.html` | Per-project pass/fail |
| Traces + failure screenshots | `test-results/<spec>-<project>/trace.zip`, `*.png` | Debug a failure (`npx playwright show-trace`) |
| Target audit data | `docs/touch-audit/findings/target-audit.json` (+ `--engine webkit` writes `target-audit-webkit.json`) | Compare with `tests/e2e/touch/target-baseline.json` |
| Journey ledger diff | `tests/e2e/touch/journey-status.json` | Cells that flipped to PASS must leave the ledger in the same commit |
| Live-verification shots | `docs/touch-audit/evidence/after/TUX-###/<project>.png` | DoD D5 evidence |

The run is green only when every project passes, no ratchet rose, and the ledger matches.

### 4.2 Real-device checklist for Jay

Only items that Chromium and WebKit simulation cannot prove. Devices: iPad Pro 11" (or Air 11") and iPhone Pro, latest iOS, Safari tab mode unless noted. Record results in `docs/touch-audit/device-checklist.md` (TUX-062).

| # | Check | TUX | Where | Pass when |
|---|---|---|---|---|
| 1 | Pinch on panels, toolbar, header, modals | 003 | both devices | Page never zooms; iOS accessibility zoom still works |
| 2 | Safari toolbars shown and minimised | 004, 007, 046 | iPhone P + L | Modifier bar, Export footer and canvas fully visible and tappable |
| 3 | Home Screen (standalone) mode | 005 | iPhone P + L (both Dynamic Island sides), iPad L | Nothing under the status bar, Dynamic Island or home indicator |
| 4 | Type tool with the soft keyboard | 028 | both | Keyboard opens on tap; emoji, autocorrect bar and dictation insert; caret stays above keyboard |
| 5 | Keyboard occlusion | 032, 049 | iPad L, iPhone P | Lower-panel value chips, layer search, Text field and Save Preset stay visible |
| 6 | Focus zoom | 042 | both | No page zoom when any field gets focus |
| 7 | Long-press targets | 014, 034, 039 | both | Menu opens at ~0.5 s; no system callout, loupe or text selection |
| 8 | First tap after a hover-style change | 035, 036 | both | Add Layer › Algorithm Layer and row actions work on the first tap |
| 9 | Double-tap paths | 038 | both | Layer rename by double-tap works; every reset/edit also works by tap or long-press |
| 10 | Real multi-touch | 017, 020 | both | 10/10 pinches from empty canvas and from a selected object; two-finger tap undoes; three-finger tap redoes |
| 11 | System interruption mid-drag | 018 | iPhone | Control Center / notification during a move returns the object to its start |
| 12 | Apple Pencil with a resting palm | 021 | iPad | The Pencil stroke wins |
| 13 | Files app and share sheet | 053, 054 | both | Open a `.vectura` from Files; Export SVG and Save reach Files |
| 14 | Camera-roll photo | 055 | iPhone Pro | A 48 MP photo imports, or shows a clear error; no tab crash |
| 15 | Heavy layer performance | 056 | both | Pinch on a heavy Flowfield feels smooth; no flicker when Safari's toolbar moves |
| 16 | Split View ½ and Stage Manager resize | 006 | iPad | Layout switches class cleanly; no overflow |
| 17 | System edge gestures | 002, 010 | both | Back-swipe does not fight the left drawer; home-indicator swipe does not hit the modifier bar; no pull-to-refresh |
| 18 | Shell stability | 001, 002 | iPhone P | No sideways or vertical pan of the app after swipes |
| 19 | Long-press discoverability without haptics | 034 | both | Progress ring and pop make the hold obvious |
| 20 | Grip drags | 044 | both | No mid-drag cancel on noise, mirror, pen and layer grips |
| 21 | Sticky hover | 036, 045 | both | Modifier and toggle buttons do not look "on" after release |
| 22 | Outside-tap dismissal | 040 | both | Menus close on a tap on canvas or empty panel space |


---

## 5. Sequencing

### 5.1 Phases

| Phase | Goal | Requirements | Why this order |
|---|---|---|---|
| **0 — Harness** | Chromium + WebKit projects, helpers, ratchets, journeys, guard, Jay's checklist | TUX-057, 061, 058, 059, 060, 062 | Every RED test needs the projects and helpers. Ratchets must exist before fixes so that each gain is locked. |
| **1 — Shell (P0)** | The app fits and stays put | TUX-006 → 001 → 002, 003, 004 → 007, 008, 009 → 010, 011 | **TUX-001 must land before any iPhone-portrait target or modal measurement is trusted**: the 544 px overflow inflates every iPhone number (modals, `phone-layout`, overlays). TUX-006 (classifier) gates 007, 008, 013, 041. TUX-010 unblocks every iPhone journey that needs a pane. |
| **2 — Interaction P0** | Core journeys pass | TUX-017 → 019 (renderer, serial), 028, 029, 034, 035, 036, 037, 014, 041, 042, 043, 046 | These remove the remaining FAIL cells (J4, J7, J1, J2, J6, J9, J10, J11) and the accidental add/delete paths. TUX-041/042/043 assume the Phase 1 layout classes. TUX-046 assumes TUX-001. |
| **3 — Major (P1)** | Friction to PASS | TUX-005, 012, 013, 015, 016, 018, 020, 022, 023, 024, 026, 030, 031, 032, 038, 039, 044, 045, 047, 052, 053, 054, 055, 060 (guard to zero), 062 (Jay's first device run) | Converts PASS-WITH-FRICTION cells to strict PASS. |
| **4 — Minor (P2) + final mode** | Polish and lock | TUX-021, 025, 027, 033, 040, 048, 049, 050, 051, 056; switch TUX-058/059/060 to final mode | Ratchets reach §1.5 thresholds; device checklist complete. |

### 5.2 Lanes and file ownership

Lanes inside a phase run in parallel only where files are disjoint. `components.css` is shared by funneling (append-only `TUX-0xx` blocks; the integrator orders them on merge).

| Phase | Lane | Requirements | Owned files |
|---|---|---|---|
| 0 | H — Harness | 057, 061, 058, 059 | `.github/workflows/test.yml` (WebKit install), `playwright.config.js`, `package.json` (scripts), `tests/e2e/touch/**`, `tests/e2e/helpers/touch.js`, `tests/e2e/helpers/target-audit-core.js`, `docs/touch-audit/scripts/*` |
| 0 | G — Guard + checklist | 060, 062 | `tests/unit/touch-static-guard*.{js,json}`, `docs/touch-audit/device-checklist.md` |
| 1 | S1 — Layout core (serial: 006 → 008 → 007 → 009 → 010 → 011) | 006, 007, 008, 009, 010, 011 | `src/ui/shell/workspace.js`, new `src/ui/shell/layout-classifier.js`, `src/ui/shell/header.js` (Reset View only), `src/render/renderer.js` (scale clamp only), `index.html` (pane handles), `src/config/defaults.js` |
| 1 | S2 — Header & root CSS | 001, 002, 003, 004 | `src/ui/shell/header.js` (menu mode — **serialize with S1 on header.js**, or S1 hands Reset View to S2), `src/ui/ui-touch.js`, root/`html`/`body`/wrapper CSS blocks, `tokens.css` |
| 2 | G2 — Renderer (serial) | 017 → 019 | `src/render/renderer.js`, new `src/render/touch-gesture-arbiter.js` |
| 2 | T — Text | 028, 029 | `src/ui/text-edit-controller.js`, `src/ui/ui-text-panel.js` |
| 2 | M — Menus | 034, 035, 036, 037 | `src/ui/menus/layer-context-menu.js`, `src/ui/shell/canvas-context-menu.js`, `src/ui/panels/layers-panel.js`, `src/ui/shortcuts.js`, toast module. (034's canvas long-press needs a renderer hook: file an interface request to G2.) |
| 2 | B — Toolbar | 014 | `src/ui/shell/toolbar.js`, `src/ui/shell/tool-drawer.js` |
| 2 | C — Controls CSS | 041, 042, 043 | `components.css` TUX-041/042/043 blocks, `tokens.css`, `src/ui/components/slider.js`, `src/ui/panels/pens-panel.js` |
| 2 | X — Modals | 046 | `src/ui/modals/export-svg.js`, help/info modal markup (`index.html` owned by this lane in Phase 2), modal CSS block |
| 3 | serial on `renderer.js`: 022 → 023 → 024 → 018 (renderer part); in parallel: 030/031 (context-bar-modes.js, shortcuts.js), 012 (layers-panel.js), 013/015/016 (toolbar), 038 (panels), 044 (panels; disjoint from 038 file set must be re-checked — both touch `algo-config-panel.js`, `noise-rack-panel.js`, `mirror-panel.js`: **serialize 038 and 044**), 045 (ui-touch.js, app.js), 047/026 (designers, export-svg.js), 052 (help), 053/054/055 (file I/O, image-asset.js), 005 (CSS), 020 (HUD + renderer constant: after the renderer chain), 032 (new keyboard-inset.js + font picker), 039 (tooltip component) | per requirement |
| 4 | small items; 021/025/056 serialize on `renderer.js` | per requirement |

### 5.3 Dependency edges (must-precede)

- 057 → every RED test. 058/059/060 → every DoD D4.
- 006 → 001 (phone class), 007, 008, 013, 041 (token keys on `touch-ui`), 046 (sheet on `phone`).
- 001 → 002 (overflow source), 046 (modals sized to inflated viewport), trusted iPhone-portrait numbers in 058.
- 008 → 010/011 (pane-state controller), 051.
- 010 → iPhone journeys J1, J2, J6, J9, J11 (TUX-059 ledger).
- 014 → 015, 034 (popover primitive), 039 (shared hold).
- 017 → 021 (arbiter owns pointer policy), 020 (scale constants shared with 007).
- 034 → 022, 039 (`TouchHold`). 017 → 019 (the arbiter must roll back an immediate move).
- 012 → 044 (row grip), 034 (long-press no longer reorders).
- 061 → every DoD D2/D9 (WebKit twins).
- 018 → 044 (shared `bindPointerDrag`).
- 028 → 029 (shared set-text operation), 032.
- 046 → 026, 049 (`Sheet`).

---

## 6. Traceability

### 6.1 Finding → requirement matrix

Every finding ID from the five reports appears exactly once in the left column. "Primary" is the requirement that closes the finding; "Also" lists requirements that close part of it. No finding is "won't fix".

| Finding | Primary | Also | Note |
|---|---|---|---|
| IPAD-001 | TUX-028 | TUX-029 | |
| IPAD-002 | TUX-034 | | |
| IPAD-003 | TUX-008 | TUX-010 | |
| IPAD-004 | TUX-036 | TUX-037 | |
| IPAD-005 | TUX-023 | | |
| IPAD-006 | TUX-019 | TUX-052 | |
| IPAD-007 | TUX-035 | | |
| IPAD-008 | TUX-014 | | |
| IPAD-009 | TUX-030 | TUX-024 | |
| IPAD-010 | TUX-003 | | |
| IPAD-011 | TUX-042 | | |
| IPAD-012 | TUX-041 | TUX-001, TUX-010, TUX-016 | menu triggers, chevrons, toolbar footer rows |
| IPAD-013 | TUX-043 | | |
| IPAD-014 | TUX-052 | TUX-039 | |
| IPAD-015 | TUX-026 | | |
| IPAD-016 | TUX-012 | | |
| IPAD-017 | TUX-013 | | |
| IPAD-018 | TUX-036 | | |
| IPAD-019 | TUX-044 | TUX-041 | |
| IPAD-020 | TUX-034 | | duplicate of IPAD-002 (canvas half) |
| IPAD-021 | TUX-038 | | |
| IPAD-022 | TUX-020 | TUX-037 | |
| IPAD-023 | TUX-045 | | |
| IPAD-024 | TUX-025 | | |
| IPAD-025 | TUX-046 | TUX-041 | |
| IPAD-026 | TUX-041 | TUX-046 | |
| IPAD-027 | TUX-051 | | |
| IPH-001 | TUX-001 | | |
| IPH-002 | TUX-010 | | |
| IPH-003 | TUX-046 | TUX-001 | |
| IPH-004 | TUX-002 | | |
| IPH-005 | TUX-007 | TUX-006, TUX-008 | |
| IPH-006 | TUX-028 | TUX-029 | |
| IPH-007 | TUX-017 | | |
| IPH-008 | TUX-015 | | |
| IPH-009 | TUX-035 | | |
| IPH-010 | TUX-042 | | |
| IPH-011 | TUX-043 | | |
| IPH-012 | TUX-023 | TUX-024, TUX-025 | |
| IPH-013 | TUX-011 | TUX-023 | |
| IPH-014 | TUX-013 | | |
| IPH-015 | TUX-005 | | |
| IPH-016 | TUX-044 | | |
| IPH-017 | TUX-041 | TUX-036, TUX-037 | |
| IPH-018 | TUX-030 | TUX-024 | |
| IPH-019 | TUX-014 | | |
| IPH-020 | TUX-034 | | duplicate of IPAD-002 on iPhone |
| IPH-021 | TUX-046 | TUX-041, TUX-001 | |
| IPH-022 | TUX-041 | TUX-001 | |
| IPH-023 | TUX-016 | | |
| IPH-024 | TUX-004 | | |
| IPH-025 | TUX-031 | TUX-020, TUX-030 | |
| IPH-026 | TUX-044 | TUX-002, TUX-019 | |
| IPH-027 | TUX-019 | | duplicate of IPAD-006 on iPhone |
| IPH-028 | TUX-011 | | |
| IPH-029 | TUX-038 | TUX-052 | |
| IPH-030 | TUX-045 | TUX-001 | |
| IPH-031 | TUX-052 | TUX-007 | |
| IPH-032 | TUX-010 | TUX-041 | |
| IPH-033 | TUX-041 | TUX-042 | |
| IPH-034 | TUX-048 | | |
| IPH-035 | TUX-041 | | |
| IPH-036 | TUX-041 | TUX-046 | |
| JRN-001 | TUX-010 | | duplicate of IPH-002 |
| JRN-002 | TUX-009 | | |
| JRN-003 | TUX-017 | | duplicate of IPH-007 |
| JRN-004 | TUX-028 | TUX-029, TUX-032 | |
| JRN-005 | TUX-008 | TUX-013 | |
| JRN-006 | TUX-001 | TUX-002, TUX-046 | |
| JRN-007 | TUX-035 | | duplicate of IPAD-007 |
| JRN-008 | TUX-014 | | duplicate of IPAD-008 |
| JRN-009 | TUX-036 | TUX-037, TUX-012 | |
| JRN-010 | TUX-038 | | |
| JRN-011 | TUX-023 | TUX-008 | |
| JRN-012 | TUX-012 | | |
| JRN-013 | TUX-027 | | |
| JRN-014 | TUX-049 | TUX-032 | |
| JRN-015 | TUX-032 | | |
| JRN-016 | TUX-041 | TUX-010, TUX-016 | |
| JRN-017 | TUX-020 | | |
| JRN-018 | TUX-001 | | |
| JRN-019 | TUX-050 | | |
| CODE-001 | TUX-028 | | |
| CODE-002 | TUX-034 | | |
| CODE-003 | TUX-030 | | |
| CODE-004 | TUX-033 | | |
| CODE-005 | TUX-017 | TUX-020 | |
| CODE-006 | TUX-033 | | |
| CODE-007 | TUX-031 | | |
| CODE-008 | TUX-045 | | |
| CODE-009 | TUX-022 | | |
| CODE-010 | TUX-044 | | |
| CODE-011 | TUX-036 | | |
| CODE-012 | TUX-036 | | |
| CODE-013 | TUX-038 | | |
| CODE-014 | TUX-038 | | |
| CODE-015 | TUX-047 | | |
| CODE-016 | TUX-004 | TUX-032 | |
| CODE-017 | TUX-022 | | |
| CODE-018 | TUX-039 | | |
| CODE-019 | TUX-036 | TUX-045 | |
| CODE-020 | TUX-016 | TUX-044 | |
| CODE-021 | TUX-018 | | |
| CODE-022 | TUX-018 | | |
| CODE-023 | TUX-017 | | |
| CODE-024 | TUX-019 | | |
| CODE-025 | TUX-020 | TUX-007 | |
| CODE-026 | TUX-021 | | |
| CODE-027 | TUX-003 | | |
| CODE-028 | TUX-044 | | |
| CODE-029 | TUX-044 | | |
| CODE-030 | TUX-040 | | |
| CODE-031 | TUX-024 | | |
| CODE-032 | TUX-023 | | |
| CODE-033 | TUX-041 | TUX-043 | |
| CODE-034 | TUX-006 | TUX-041 | |
| CODE-035 | TUX-005 | | |
| CODE-036 | TUX-053 | | |
| CODE-037 | TUX-054 | | |
| CODE-038 | TUX-055 | | |
| CODE-039 | TUX-042 | | |
| CODE-040 | TUX-056 | | Worker part → new PRH entry (out of scope) |
| LAY-001 | TUX-001 | | duplicate of IPH-001 (measured) |
| LAY-002 | TUX-007 | TUX-006 | |
| LAY-003 | TUX-008 | | duplicate of IPAD-003 (measured) |
| LAY-004 | TUX-005 | | |
| LAY-005 | TUX-046 | | |
| LAY-006 | TUX-043 | | |
| LAY-007 | TUX-042 | | |
| LAY-008 | TUX-026 | | |
| LAY-009 | TUX-006 | TUX-041 | |
| LAY-010 | TUX-002 | | |
| LAY-011 | TUX-011 | TUX-010 | |
| LAY-012 | TUX-041 | TUX-046 | |
| LAY-013 | TUX-049 | | |

**Mechanical check (run at authoring time).** All IDs were extracted from the five findings files with `grep -ohE '\b(IPAD|IPH|JRN|CODE|LAY)-[0-9]{3}\b' docs/touch-audit/findings/*.md | sort -u` → **135 IDs**. Each was checked for presence in this document's matrix rows. Result: **135 mapped, 0 unmapped.** Re-run:

```bash
comm -23 \
  <(grep -ohE '\b(IPAD|IPH|JRN|CODE|LAY)-[0-9]{3}\b' docs/touch-audit/findings/*.md | sort -u) \
  <(grep -oE '^\| (IPAD|IPH|JRN|CODE|LAY)-[0-9]{3} ' docs/touch-ux-requirements.md | grep -oE '(IPAD|IPH|JRN|CODE|LAY)-[0-9]{3}' | sort -u)
# expected output: empty
```

### 6.2 Journey coverage (J1–J12 → requirements needed for strict PASS)

| # | Journey | Today iPad / iPhone | Requirements that must land for PASS in all 8 primary projects (both orientations, both engines) |
|---|---|---|---|
| J1 | Pick algorithm → 3 sliders → preset | friction / FAIL | 001, 006, 008, 010, 035, 041, 042, 043 |
| J2 | Add, rename, reorder, hide/show, delete layer | friction / FAIL | 002, 010, 012, 034, 036, 037, 038, 041, 044 |
| J3 | Select, move, scale, rotate | friction / friction | 008, 017, 019, 023 |
| J4 | Pan, pinch, fit to view, undo/redo | FAIL / FAIL | 009, 017, 020 |
| J5 | Draw path, edit anchor, close | friction / friction | 008, 014, 024, 030 |
| J6 | Mirror modifier + angle; mask | friction / FAIL | 001, 010, 012, 027, 036 |
| J7 | Add text, type, change font/size | FAIL / FAIL | 028, 029, 032, 042 |
| J8 | Paint bucket fill | friction / PASS | 008, 022 |
| J9 | Save preset; Document Setup paper size | friction / FAIL | 010, 032, 049, 050 |
| J10 | Export SVG; save .vectura | PASS / friction | 001 (direct Export), 046, 054 |
| J11 | 3D scene: insert, orbit | friction / FAIL | 010, 025, 034, 035 |
| J12 | Recover from a mistake | friction / friction | 001 (direct Undo), 009, 020, 036, 037 |

---

## 7. Decisions (resolved 2026-10-02)

All open questions are closed. "Jay" = Jay's own answer. "Jay-delegated" = Jay asked for the best-UX choice and the Product Lead chose. "Delegated default — Jay may override" = Jay did not answer; the Product Lead chose the best-UX default.

| Q | Decision | Source | Rationale | Requirements |
|---|---|---|---|---|
| Q1 iPad landscape layout | Keep docked side panes at 1210 px (`touch-wide`). Apply full touch sizing whenever `(pointer: coarse)` matches, at any width. Panes collapse by finger. Canvas share ≥ 45 % with both panes docked. | Jay-delegated ("whichever gives the best UX") | 1210 px has room, and pro iPad creative apps dock panels; sizing by pointer type avoids mouse-sized targets on large iPads. | TUX-006, 008, 009, 010, 041; §1.2 `coarseWide`; §1.5 |
| Q2 Long-press | Long-press opens the context menu: 500 ms hold, < 10 px movement (≥ 10 px cancels), progress ring from 150 ms, "pop" + `navigator.vibrate(10)` where available at 500 ms. A long-press never starts a drag; layer reorder moves to a row grip. | Jay | — | TUX-034, 012, 044, 022, 039 |
| Q3 iPad portrait panes | Both panes start closed. | Jay | — | TUX-008 |
| Q4 Quick drag on a selected object | Moves it immediately (6 px slop, no hold). Two fingers always pan or zoom. | Jay | — | TUX-019, 017 |
| Q5 Phone menubar | One ☰ overflow menu with all top-level menus; no horizontally scrolling bar. Undo, Redo and Export stay direct header buttons. | Jay-delegated | One target, no hidden scroll affordance, and the most frequent commands stay one tap away. | TUX-001, 020 |
| Q6 Modifier bar | Task labels (Multi-select, Constrain, Duplicate, Pan); no CMD/CTRL on touch; one-shot latch, double-tap to lock, canvas badge; not persisted; applies to Pencil too. | Delegated default — Jay may override | Touch users think in tasks, and a one-shot latch removes the stuck-modifier failure. | TUX-045, 021 |
| Q7 Slider track tap | On touch, a track tap does not change the value; drag the thumb/band or tap the value chip. | Delegated default — Jay may override | A stray tap while scrolling must never change the art. | TUX-043 |
| Q8 iPhone landscape | Full editing target. All 12 journeys must PASS there, in both engines. | Jay | — | TUX-007, 059, §1.2, §1.5, §6.2 |
| Q9 Undo gestures | On-screen Undo/Redo buttons plus two-finger tap = undo, three-finger tap = redo. | Delegated default — Jay may override | Buttons keep undo discoverable; the taps match the Procreate/Affinity habit of iPad artists. | TUX-020 |
| Q10 Device verification | Jay runs the real-device checks (§4.2). Phase 0 installs Playwright WebKit and adds WebKit iPad/iPhone projects in both orientations; every DoD requires the simulated device run (D2, D9). | Jay | — | TUX-057, 061, 062; §0.1; §4.1, §4.2 |
| Q11 Late second finger | Within 250 ms / 10 px, the second finger rolls back the first action; after that window, the first action commits as one history entry and the pinch/pan starts. | Delegated default — Jay may override | A deliberate drag is never lost, and undo stays available. | TUX-017 |
