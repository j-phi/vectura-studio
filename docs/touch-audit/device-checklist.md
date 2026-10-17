# Real-device checklist and release gate (TUX-062)

This file is the canonical record of the real-device run. Jay runs it. It replaces the earlier per-lane rows from TUX-013, TUX-015, TUX-016 and TUX-036 (folded in as DEV-07, DEV-08, DEV-21, DEV-25 to DEV-33).

## Purpose and rules

1. A row enters this file only if Chromium and WebKit simulation cannot prove it.
2. Simulation proves everything else. Put that in a test, not in this file.
3. A requirement with an open row is "done in simulation, pending device". It is never plain "done".
4. The release that claims "touch-ready" in the README needs every row `pass` or `deferred-by-Jay`. Only that release gate needs this. `tests/unit/touch-device-checklist.test.js` enforces it.
5. A `fail` result needs a Follow-up. The Follow-up is a new TUX id, or the reopened owner TUX id. Add a RED test where simulation can express the failure.

Status values:

| Status | Meaning |
|---|---|
| `open` | Done in simulation. Pending the device run. |
| `pass` | Passed on every required cell. |
| `fail` | Failed on at least one cell. Follow-up is required. |
| `deferred-by-Jay` | Jay chose to skip this row for the release. |

Row status is the worst result in the Results log for that row. Order: `fail`, then `open`, then `deferred-by-Jay`, then `pass`. A row with no log line is `open`.

## How to run

1. Record the build under test: the commit SHA and the version shown in the in-app badge.
2. Serve the build over HTTPS. Use one of these options:
   - A TLS tunnel to `node scripts/dev-server.js <port>` (for example cloudflared or tailscale serve).
   - mkcert and a local TLS proxy.
3. Do not use a plain `http://` LAN URL for DEV-13 or DEV-03. A plain `http://` page is not a secure context. `navigator.share` and `navigator.canShare` are then undefined. DEV-13 would test only the download fallback, and the result is invalid.
4. DEV-13 and DEV-03 need a secure context. DEV-03 needs it for a realistic Home Screen install.
5. Fill the device profile table first. Compare the values with the viewport constants in requirements section 1.2 (iPhone Pro is 402 by 874).
6. Add one line per cell to the Results log. Do not edit the Status column by hand without a matching log line.

Console snippet for the profile values:

```js
JSON.stringify({w: innerWidth, h: innerHeight, dpr: devicePixelRatio, standalone: navigator.standalone, secure: isSecureContext, inset: ['top','right','bottom','left'].map(s => getComputedStyle(document.documentElement).getPropertyValue('--sa-' + s) || getComputedStyle(document.body).getPropertyValue('padding-' + s))})
```

## Device profile

| Device | iOS build | Safari mode | innerWidth x innerHeight (P and L) | devicePixelRatio | Safe-area insets |
|---|---|---|---|---|---|
| iPad Pro 11 in or Air 11 in | | | | | |
| iPhone Pro | | | | | |

## Rows

| ID | Check | TUX | Cells required | Pass when | Status |
|---|---|---|---|---|---|
| DEV-01 | Pinch on panels, toolbar, header, modals | TUX-003 | iPhone P tab, iPad L tab | Page never zooms. iOS accessibility zoom still works. | open |
| DEV-02 | Safari toolbars shown and minimised. Include both Dynamic Island sides in tab mode with chrome shown and hidden. Include the Export sheet with the keyboard open on the filename field. | TUX-004, TUX-007, TUX-046 | iPhone P tab, iPhone L tab (DI left, DI right; chrome shown, chrome hidden) | Modifier bar, Export footer and canvas are fully visible and tappable. The Export sheet stays reachable with the keyboard open. | open |
| DEV-03 | Home Screen (standalone) mode | TUX-005 | iPhone P standalone, iPhone L standalone (DI left, DI right), iPad L standalone | Nothing sits under the status bar, the Dynamic Island or the home indicator. Needs HTTPS for a realistic install. | open |
| DEV-04 | Type tool with the soft keyboard | TUX-028 | iPhone P tab, iPad L tab | Keyboard opens on tap. Emoji, autocorrect bar and dictation insert. Caret stays above the keyboard. | open |
| DEV-05 | Keyboard occlusion. Include the Export filename field and the Document Setup number field (IPH #8). | TUX-032, TUX-049, TUX-046 | iPad L tab, iPhone P tab | Lower-panel value chips, layer search, Text field, Save Preset, the Export filename field and the Document Setup number field stay visible. | open |
| DEV-06 | Focus zoom | TUX-042 | iPhone P tab, iPad P tab | No page zoom when any field gets focus. | open |
| DEV-07 | Long-press targets. Include a long-press on a tool rail button. | TUX-013, TUX-014, TUX-034, TUX-039 | iPhone P tab, iPad P tab | Menu opens at about 0.5 s. No system callout, loupe or text selection. | open |
| DEV-08 | First tap after a hover-style change. Include the Pendula preset gallery Delete and Set-default actions (CODE-012). | TUX-035, TUX-036 | iPhone P tab, iPad P tab | Add Layer, Algorithm Layer and row actions work on the first tap. Preset gallery Delete and Set-default work on the first tap. | open |
| DEV-09 | Real dblclick delivery in panels and inside touch-action:none canvas surfaces (pen double-tap finish). The tap and long-press alternative logic is proven by the TUX-038 RED test. | TUX-038 | iPhone P tab, iPad P tab | dblclick arrives in panels and in canvas surfaces. Layer rename by double-tap works. The pen double-tap finishes the path. | open |
| DEV-10 | Trusted multi-touch reliability. The 2-finger and 3-finger tap logic is proven by the TUX-020 RED test. | TUX-017, TUX-020 | iPhone P tab, iPad L tab | 10 of 10 pinches succeed from empty canvas and from a selected object. Two-finger tap and three-finger tap are delivered. | open |
| DEV-11 | System interruption mid-drag | TUX-018 | iPhone P tab | Control Center or a notification during a move returns the object to its start. | open |
| DEV-12 | Apple Pencil with a resting palm | TUX-021 | iPad L tab | The Pencil stroke wins. | open |
| DEV-13 | Files app and share sheet. Needs HTTPS. | TUX-053, TUX-054 | iPhone P tab, iPad L tab | Open a .vectura from Files. Export SVG and Save reach Files. The share sheet opens. | open |
| DEV-14 | Camera-roll photo | TUX-055 | iPhone P tab | A 48 MP photo imports, or shows a clear error. No tab crash. | open |
| DEV-15 | Heavy layer performance | TUX-056 | iPhone P tab, iPad L tab | Pinch on a heavy Flowfield feels smooth. No flicker when the Safari toolbar moves. | open |
| DEV-16 | Split View half and Stage Manager resize | TUX-006 | iPad L tab | Layout switches class cleanly. No overflow. | open |
| DEV-17 | System edge gestures | TUX-002, TUX-010 | iPhone P tab, iPad L tab | Back-swipe does not fight the left drawer. Home-indicator swipe does not hit the modifier bar. No pull-to-refresh. | open |
| DEV-18 | Shell stability | TUX-001, TUX-002 | iPhone P tab | No sideways or vertical pan of the app after swipes. | open |
| DEV-19 | Long-press discoverability without haptics | TUX-034 | iPhone P tab, iPad P tab | The progress ring and the pop make the hold obvious. | open |
| DEV-20 | Grip drags. Include the HTML5 draggable pen to layer drag (armed-pen tap path), the mirror rows, and the iPadOS long-press drag session against the custom handlers (CODE-029). | TUX-044 | iPhone P tab, iPad L tab | No mid-drag cancel on noise, mirror, pen and layer grips. The pen to layer drag works, or the armed-pen tap path works. The iPadOS drag session does not fight the custom handlers. | open |
| DEV-21 | Sticky hover | TUX-036, TUX-045 | iPhone P tab, iPad P tab | Modifier and toggle buttons do not look "on" after release. | open |
| DEV-22 | Real compatibility-event timing (CODE-030). The dismissal logic is proven by the TUX-040 RED test. | TUX-040 | iPhone P tab, iPad P tab | Menus close on a tap on the canvas or on empty panel space. No ghost click re-opens them. | open |
| DEV-23 | One-finger native default actions. Reason: WebKit simulation sets nativeDefaultActions to false. | TUX-041, TUX-043 | iPhone P tab, iPad P tab | A tap fires click on buttons, rows and chips. A vertical swipe in Generator scrolls and never changes a slider. A thumb drag changes the value. | open |
| DEV-24 | Native pickers (no owner TUX; source: iPad could-not-test #5). On fail, the Follow-up names a new TUX id. | — | iPhone P tab, iPad P tab | input type=color and select open, commit a value, and leave the shell unzoomed and unpanned. | open |
| DEV-25 | Tool rail in the standalone app (from TUX-013) | TUX-013 | iPhone P standalone | The tool rail is 52 px or less, directly under the header, and clear of the Dynamic Island. | open |
| DEV-26 | Tool rail overflow drawer on iPad (from TUX-013) | TUX-013 | iPad P standalone | The tool rail is one row. Tap the overflow button and pick a tool from the drawer. | open |
| DEV-27 | All Tools drawer stays in the visible area (from TUX-015) | TUX-015 | iPhone P tab, iPhone L tab (chrome shown, chrome hidden) | The drawer stays inside the visible area. It clears the notch and the home indicator. | open |
| DEV-28 | All Tools drawer scroll (from TUX-015) | TUX-015 | iPhone P tab, iPad P tab | A drag inside the drawer body scrolls with momentum. The page behind does not scroll. | open |
| DEV-29 | All Tools drawer placement on iPad portrait (from TUX-015) | TUX-015 | iPad P tab | The drawer opens below the horizontal rail. Every tool is fully tappable. | open |
| DEV-30 | Floating toolbar and ctxbar grip drags (from TUX-016) | TUX-016 | iPad L tab | Drag each grip 10 times. Each bar follows the finger. No page bounce, edge-swipe or back gesture. No later touch moves a bar. | open |
| DEV-31 | Gallery row first tap (from TUX-036) | TUX-036 | iPhone P tab, iPad P tab | A gallery row selects on the first tap. No hover-only first tap. | open |
| DEV-32 | iPad trackpad and finger tap on an inactive layer row (from TUX-036) | TUX-036 | iPad L tab with trackpad | A finger tap on an inactive layer row never fires a hidden action. | open |
| DEV-33 | Apple Pencil hover reveal (from TUX-036) | TUX-036 | iPad L tab with Apple Pencil | Pencil hover reveal leaves no visible-but-inert buttons. | open |
| DEV-34 | Export preview and Pattern Designer pinch (from TUX-047) | TUX-047 | iPhone P tab, iPad L tab | A pinch zooms only the surface. The page stays at 1x. A pinch with the fill tool active adds no fill. A two-finger drag pans. | open |
| DEV-35 | Petal Designer sheet/window fits with Safari toolbar shown and collapsed (from TUX-026) | TUX-026 | iPhone P tab, iPhone L tab, iPad P tab, iPad L tab | The window or sheet stays inside the visible area with the toolbar shown and collapsed. It clears the notch and the home indicator. | open |
| DEV-36 | Pinch on inline and pop-out designer canvas zooms only the canvas, never the page (from TUX-026) | TUX-026 | iPhone P tab, iPad L tab | A pinch zooms the designer canvas. The page stays at 1x. | open |
| DEV-37 | Focus a designer field in the phone sheet: no page zoom, field stays visible above keyboard (from TUX-026) | TUX-026 | iPhone P tab | No page zoom. The field stays visible above the keyboard. | open |
| DEV-38 | Document Setup Paper > Size native picker (from TUX-050) | TUX-050 | iPhone P tab, iPad P tab | The first tap on Paper > Size opens the native iOS picker. The drawer or modal does not jump. | open |
| DEV-39 | Mirror dial fine rotate (from TUX-027). Real touch drag on the line, radial, arc and tile-angle dials. | TUX-027 | iPhone P tab, iPad L tab | A sideways drag across a dial turns it at about 0.5 degrees per px. No page scroll steals the drag. No pointercancel. A tap on the dial changes nothing. | open |
| DEV-40 | Mirror angle chip commit (from TUX-027) | TUX-027 | iPhone P tab, iPad L tab | Tap the Angle value. The decimal keypad opens. The value commits through the keypad Done key or by a tap elsewhere (blur). | open |
| DEV-41 | Signed Shift X/Y chips on the iPhone decimal keypad (cross-reference TUX-038; from TUX-027) | TUX-027, TUX-038 | iPhone P tab | The decimal keypad has no minus key. Record whether a negative Shift X or Shift Y value can be entered. If not, the Follow-up names a new TUX id. | open |
| DEV-42 | Canvas transform handles by finger. Grab each of the 4 corners and the rotate affordance first try, 10/10, on a 20 mm and a 100 mm object. A small object moves when dragged from its centre. Apple Pencil shows mouse-sized handles. | TUX-023 | iPad L tab, iPhone P tab | 10 of 10 first-try grabs per corner and for the rotate handle. Small object moves from its centre. Pencil handles are 6 px. Status is pending the device run. | open |
| DEV-43 | Pen by finger. Five finger taps make a straight polygon with no handles. A tap near the start point closes it. A finger double-tap finishes an open path with no extra anchor. | TUX-024 | iPhone P tab, iPad L tab | Five taps give five straight corners with no handles. A tap about 20 px from the start closes the path. A double-tap finishes with exactly the tapped anchors. Status is pending the device run. | open |
| DEV-44 | Direct tool by finger. Tap a shape vertex. | TUX-024 | iPad L tab, iPhone P tab | The tap picks the anchor, not the corner-radius widget. In the Select tool, a finger 15 px from a corner widget grabs the widget, and a finger on the resize handle still resizes. A drag from 15 px beside an anchor moves that anchor. Status is pending the device run. | open |
| DEV-45 | Apple Pencil precision is unchanged for the pen and Direct tools. | TUX-024 | iPad L tab | Pencil targets keep the mouse sizes: anchor 6 px, handle 5 px, pen close 5 px. A Pencil tap 10 px from the start point does not close the path. Status is pending the device run. | open |
| DEV-46 | iOS keyboard for `inputmode="text"` value chips shows a minus key (from TUX-038). Enter a negative single value (Rings Center Offset X) and a dual range (Rings Ray Length) on a phone. | TUX-038 | iPhone P tab | The Center Offset X chip opens the full keyboard with a minus key. `-2` commits. The Ray Length chip opens two inputs with the decimal keypad. Typing a min and a max commits both when focus leaves. | open |
| DEV-47 | Layer double-tap rename under main-thread load (event.timeStamp semantics on iOS WebKit; from TUX-038). | TUX-038 | iPhone P tab, iPad P tab | Add a heavy layer and double-tap a layer name while it regenerates. The rename field opens. `pointerdown` event.timeStamp is on the same clock for both taps. | open |
| DEV-48 | No text-selection loupe or callout on a label long-press (from TUX-038). | TUX-038 | iPhone P tab, iPad L tab | Hold a control label for 0.5 s. The "Reset to default" menu opens. No loupe, no selection handles, no callout. Lifting the finger resets nothing. | open |
| DEV-49 | Reset hold, then pick the menu item with the finger (from TUX-038). | TUX-038 | iPhone P tab, iPad L tab | Hold a label, lift, tap "Reset to default". The value returns to its default exactly once. The tap within 0.8 s of the lift is not swallowed. | open |
| DEV-50 | [DEVICE] 3D rotation gizmo: a fingertip grabs yaw, pitch and roll on the first try with no value jump (from TUX-025). | TUX-025 | iPad P/L tab, iPhone P/L tab | Add a 3D Scene. Grab each marker with a fingertip, 15 px off the centre of the marker. The value does not jump on first move. The pitch slider sits outside the ring. | open |
| DEV-51 | [DEVICE] The gizmo marker stays visible beside the finger while dragging (from TUX-025). | TUX-025 | iPad P/L tab, iPhone P/L tab | Drag yaw, pitch and roll. The marker and the ring stay inside the canvas and are not hidden by the modifier bar. | open |
| DEV-52 | [DEVICE] Apple Pencil keeps the mouse-precision radii on the 3D gizmo (from TUX-025). | TUX-025 | iPad L tab | A Pencil tap 14 px from a marker does not grab it. A tap on the marker does. | open |
| DEV-53 | Bottom pane stray tap and divider drag (from TUX-051). | TUX-051 | iPad L tab | Tap 2, 8 and 16 px below the canvas bottom edge, 10 times each. The pane never expands. The chevron expands it on the first tap. A vertical divider drag resizes. | open |
| DEV-54 | Toast safe area and stacking (from TUX-048). Show a toast in iPhone home-screen standalone mode and in Safari with the toolbar shown and minimised. | TUX-048 | iPhone P standalone, iPhone L standalone, iPhone P tab, iPhone L tab | The toast clears the home indicator and the Dynamic Island side. In Safari it sits above the modifier bar. Status is pending the device run. | open |

## Clause index

Each `[DEVICE]` clause in `docs/touch-ux-requirements.md` maps to at least one row. The clause id is the TUX id plus the clause number inside that section.

| Clause | Requirement text (short) | Rows |
|---|---|---|
| TUX-002#1 | No rubber-band of the whole app. No pull-to-refresh from panels. | DEV-17, DEV-18 |
| TUX-003#1 | gesturestart guard blocks page zoom. Accessibility zoom still works. | DEV-01 |
| TUX-004#1 | Modifier bar and Export footer visible with the tab bar shown and minimised. | DEV-02 |
| TUX-005#1 | Home Screen standalone, safe-area insets, both orientations. | DEV-03 |
| TUX-007#1 | iPhone landscape, chrome shown and hidden, both Dynamic Island sides. | DEV-02 |
| TUX-014#1 | Long-press on a tool button shows no callout or loupe. | DEV-07 |
| TUX-018#1 | Control Center mid-drag returns the object to its start. | DEV-11 |
| TUX-021#1 | iPad Pencil with a resting palm. | DEV-12 |
| TUX-028#1 | Keyboard opens on tap. Emoji, autocorrect and dictation insert. | DEV-04 |
| TUX-032#1 | iPad landscape keyboard: chips, search, Text field, Save Preset stay visible. | DEV-05 |
| TUX-035#1 | Safari mouseover heuristic does not swallow the first tap. | DEV-08 |
| TUX-036#1 | iOS sticky-hover on modifier buttons is gone. | DEV-21, DEV-08, DEV-31, DEV-32, DEV-33 |
| TUX-038#1 | dblclick delivery in panels and in touch-action:none surfaces. | DEV-09 |
| TUX-040#1 | Menu dismissal confirmed on iOS. | DEV-22 |
| TUX-042#1 | No focus zoom on iPhone and iPad. | DEV-06 |
| TUX-044#1 | No pointercancel mid-drag. Pen to layer drag has a touch path. | DEV-20 |
| TUX-046#1 | Export sheet with the toolbar shown and the keyboard open. | DEV-02, DEV-05 |
| TUX-049#1 | Save Preset sheet with the iPad soft keyboard. | DEV-05 |
| TUX-053#1 | Open a .vectura from Files on iPhone and iPad. | DEV-13 |
| TUX-054#1 | SVG and .vectura save on iPhone and iPad. | DEV-13 |
| TUX-055#1 | 48 MP photo import on iPhone Pro. | DEV-14 |
| TUX-056#1 | Pinch smoothness with a heavy Flowfield. | DEV-15 |

## Results log

One line per cell. Add lines only after a real device run. Do not enter results from simulation.

| Row | Device | iOS | Mode | Orientation | Result | Date | Build | Note | Follow-up |
|---|---|---|---|---|---|---|---|---|---|

## TUX-054 device rows (downloads and share sheet)

| Row | Check |
|---|---|
| TUX-054#1 | Save .vectura, then Save to Files. The name stays `vectura-YYYY-MM-DD.vectura`, not `.json`. Reopen it (TUX-053 round trip). |
| TUX-054#2 | Export SVG opens as a vector file in Files. |
| TUX-054#3 | Cancel the share sheet. No file and no toast appear. A second attempt works. |
| TUX-054#4 | Animated SVG, preset bundle and one designer export each work. |
| TUX-054#5 | A heavy export (dense scene, build time over 1 s) still opens the share sheet or falls back to a download. This checks the activation lifetime. |
| TUX-054#6 | Record whether a synchronous revoke failed before the fix. This tests the audit's unverified claim. |
| TUX-051#1 | iPad landscape Safari: stray taps below the canvas never expand the bottom pane; chevron and divider drag work. | DEV-53 |
| TUX-048#1 | iPhone home-screen standalone, portrait + landscape: toast clear of the home indicator and the Dynamic Island side. iPhone Safari with the toolbar shown or minimised: toast above the modifier bar. | DEV-54 |

## TUX-033 device rows (panels and renderer read touch modifier tasks)

| Row | Check |
|---|---|
| TUX-033#1 | iPad Safari and iPhone Pro Safari, portrait and landscape: latch Multi-select, tap two layer rows. Both rows are selected. Double-tap the button, then tap a selected row. It leaves the selection. |
| TUX-033#2 | Fill tool, Multi-select latched, tap an existing fill. The fill is sampled. Constrain latched, drag a finger across 3 regions. 3 fills pour. |
| TUX-033#3 | Apple Pencil: repeat TUX-033#1 with the Pencil. |
| TUX-033#4 | Mac with a mouse: Cmd-click and Shift-click in the layer list are unchanged. Touch laptop with a task latched: a mouse click is unchanged. |

## WebKit finger scroll (TUX-059 review)

| ID | Check | TUX | Cells required | Pass when | Status |
|---|---|---|---|---|---|
| DEV-55 | WebKit finger scroll. Scroll the Layers list, the Generator pane and the algorithm drill list with one finger. Playwright WebKit cannot run a trusted touch scroll, so the WebKit journey cells that use the programmatic scroll are labelled "WebKit finger-scroll unproven" in `tests/e2e/touch/journey-status.json` (`unproven`). | TUX-059 | iPad P/L tab, iPhone P/L tab | Each list scrolls smoothly with one finger and stops at the end. No tap fires during the scroll. | open |
| DEV-56 | Stamped double-tap. The pen double-tap finish (`Renderer._isDoubleTap`, 24 px, 400 ms) and the layer rename double-tap both time the taps with `event.timeStamp`. Check both on iOS WebKit while a heavy layer regenerates, so a slow main thread cannot split one double-tap into two single taps. | TUX-024, TUX-038 | iPhone P tab, iPad L tab | A quick finger double-tap finishes an open pen path with no extra anchor and opens the layer rename field, also under load. Two slow taps (over 400 ms apart) do neither. | open |
| DEV-57 | Canvas long-press (from TUX-034 batch G). Press and hold the canvas for 0.5 s with Select, Direct Selection and Hand, on an object and on empty canvas. | TUX-034 | iPhone P tab, iPad L tab | The canvas menu opens at about 0.5 s (Select All on empty canvas). No system callout, loupe or text selection. Lifting the finger runs nothing. The hold never starts with a drawing or fill tool. | open |
