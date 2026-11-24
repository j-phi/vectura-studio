# Send to Plotter — Design Spec (v1)

Status: approved for implementation by the orchestrator. This is the contract every implementer
works against. Do not change a contract here without telling the orchestrator.

## 0. Goals

- File → **Send to Plotter…** streams the current document straight to a pen plotter from the
  browser (Chrome/Edge on Windows and macOS) using the **Web Serial API**. No local server.
- First plotter: **UUNATEK 3.0 A3** (GRBL/FluidNC firmware, CH340 USB serial, 115200 8N1,
  pen lifted on the **Z axis**). Built on a **plotter profile registry + driver registry** so
  more plotters (A2/A1/A0 UUNATEK, generic GRBL servo, future AxiDraw/EBB driver) plug in
  without touching the UI.
- Full customizability for artistic work (per-pen speed, pressure, dwell, passes, placement,
  pen-change pauses, test swatches) and manual machine tools (jog, pen up/down, set origin,
  frame, calibration wizards, console).
- **Hardware safety is the top priority** (section 2). When in doubt, refuse and explain.

## 1. Facts about the UUNATEK 3.0 (sources: vendor UUNA.app plaintext config, Nib project,
vendor product page)

| Fact | Value | Source |
|---|---|---|
| Transport | USB serial (CH340, VID 0x1a86 PID 0x7523), 115200 baud 8N1, `\n` line ending | Nib, UUNA.app |
| Firmware | GRBL 1.1-compatible (FluidNC on recent units). Status `<Idle|MPos:..|FS:..>`, `ok`, `error:N`, `ALARM:N` | Nib, UUNA.app |
| RX buffer | 127 bytes usable for character counting (GRBL 128) | Nib, GRBL wiki |
| Pen | Z axis, mm. **Up = 0** (UUNA zOff=0; Nib up 0.5). **Down = 3.5** (UUNA zOn=3.5; Nib 5.0). Firmware Z range 0–12 mm, 0 = fully up. Z feed 6000 mm/min. | UUNA.app, Nib |
| Work area A3 | 420 × 297 mm (firmware max). A2 594×420, A1 841×594, A0 1189×841 (untested) | Nib, product page |
| Origin | Machine zero is the **power-on corner**. No homing switches assumed. Users jog to the sheet's top-left and **Set origin** (`G92 X0 Y0`). | Nib, UUNA.app |
| Axes | Nib (tested on this machine) uses no inversion, sheet Y-down = machine +Y. UUNA app stores `axe_reverse_y=true` in its own internal frame. **Unverified → resolved by the Axis Check wizard** (§6.3); default = Nib's mapping. | Nib, UUNA.app |
| Speeds | Nib caps on connect: XY 11000, Z 5000 mm/min; warns travel ≥ 8000 can lose steps. Vendor: XY up to 15000. UUNA defaults: draw 12000 (user had 1500), jog 2500. | Nib, product page |
| Vendor app | Must be **closed** (only one program can own the port). | Nib |

## 2. Safety rules (non-negotiable, enforced in core, unit-tested)

1. **Never write firmware settings.** The sender never sends `$N=…`, `$RST`, `$SLP`, `$I=`, `$N0=`/`$N1=`
   (startup blocks), `G10 L2`/`G10 L20` (EEPROM work offsets), `G28.1`/`G30.1` (EEPROM positions),
   or `$Config/…` writes. Origin uses volatile `G92` only. Read-only queries allowed: `$$`, `$I`,
   `$G`, `$#`, `?`.
   The console (§6.5) goes through the same filter. An "Advanced: allow firmware writes" switch may
   unblock `$N=value` **only** after a typed confirmation, and `$RST` stays blocked always.
2. **Bounds.** Every XY target the sender emits (job, frame, jog, go-to) must lie inside the
   **effective work area** = profile `workArea` ∩ firmware `$130/$131` (if reported, take smaller),
   expressed in machine coordinates relative to the current work origin (use `WCO` / G92 offset to
   convert). A job with any point outside → **refused before the first byte is sent**, with the
   overflow amount shown. Jog targets are **clamped**, never refused silently (UI shows "at limit").
3. **Z range.** Pen heights clamp to profile `pen.zMin..zMax` (UUNATEK 0..10; firmware 12, keep
   2 mm headroom) and to `$132` if reported. Pen-down > zMax is impossible to configure.
4. **Feeds.** All F words clamp to `min(profile.limits.maxFeedXY, $110, $111)` for XY and
   `min(profile.limits.maxFeedZ, $112)` for Z. Defaults are conservative (§3).
5. **No homing unless the machine has it.** `$H` is only offered when `$22=1` is reported, behind a
   confirm. UUNATEK default: hidden.
6. **Unlock (`$X`) only on explicit user click**, with a warning: "Position may be wrong after an
   alarm. Check the pen is clear of the paper edge before moving."
7. **Stop = safe stop**: feed hold `!` → wait for `Hold:0`/`Idle` (≤3 s) → soft reset `0x18` →
   wait for banner → if `ALARM`, report and **do not auto-unlock** unless the stop came from our own
   Stop button (then `$X`, restore origin with `G92`, raise pen `G1 Z<up>`). Pen is always raised
   before any XY move after a stop.
8. **Pen up before travel, always.** The builder guarantees every travel move is preceded by a
   pen-up and every job ends pen-up. Postamble: pen up, then optional return to origin.
9. **Disconnect / tab close / error mid-job** → send `!` (feed hold) best-effort. Never leave the
   pen down on purpose.
10. **ALARM or unexpected banner mid-job** → abort job, clear queue, show the alarm text, keep a
    resume point.
11. **Dry run first-class**: Simulator transport (§4.4) and "Air plot" (pen held up the whole job).
12. **Single owner**: only one controller instance per tab; refuse to open a second port.
13. Nothing ever moves on connect. Connecting only performs read-only queries.

Unit tests must prove each rule (e.g. builder refuses an out-of-bounds job; command filter blocks
`$110=5000`, `G10 L20 P1 X0`, `$RST=*`; feed clamp; Z clamp).

## 3. Plotter profile registry — `src/config/plotters.js`

`window.Vectura.PLOTTER_PROFILES` (array, ordered) + `window.Vectura.PLOTTER_DEFAULTS`.
Also `module.exports` when available (for unit tests). Profile schema:

```js
{
  id: 'uunatek-3-a3',                // stable, kebab-case
  name: 'UUNATEK 3.0 A3',
  vendor: 'UUNATEK',
  driver: 'grbl',                    // key into PLOTTER_DRIVERS (src/core/plotter/drivers)
  tested: true,                      // false → UI shows "untested profile" badge
  serial: { baudRate: 115200, dataBits: 8, stopBits: 1, parity: 'none',
            filters: [{ usbVendorId: 0x1a86, usbProductId: 0x7523 }],  // CH340; picker also allows "any"
            rxBuffer: 127, lineEnding: '\n' },
  workArea: { width: 420, height: 297 },          // mm, machine travel
  axes: { invertX: false, invertY: false, swapXY: false },  // sheet→machine, default per Nib
  pen: {
    mechanism: 'z',                  // 'z' | 'servo' (M3 S… / M5) | 'custom' (template strings)
    up: 0, down: 3.5, zMin: 0, zMax: 10, zFeed: 5000,
    // servo variant fields (unused for z): servoUp: 'M3 S0', servoDown: 'M3 S1000'
    downDelay: 0.05, upDelay: 0.0,   // seconds → G4 P<s> (GRBL P is seconds)
  },
  motion: { drawFeed: 3000, travelFeed: 6000, jogFeed: 2500 },     // mm/min, conservative
  limits: { maxFeedXY: 11000, maxFeedZ: 5000, maxJogFeed: 6000 },
  gcode: { preamble: ['G21', 'G90'], postamble: [], decimals: 3, compact: false },
  capabilities: { homing: false, statusBufferReport: 'optional' },
}
```

Ship: `uunatek-3-a3` (tested:true), `uunatek-3-a2`, `uunatek-3-a1`, `uunatek-3-a0`
(tested:false, same as A3 but bigger workArea), `generic-grbl-servo` (tested:false,
mechanism 'servo', M3 S30 up / M3 S90 down? → use `M5` up and `M3 S1000` down as editable
templates, workArea 300×200). User-created profiles: duplicated from a built-in, stored in
localStorage via a small store (`vectura_plotter_profiles`, try/catch, model on UserLibraryStore)
and validated by `PlotSafety.validateProfile` (rejects negative/NaN, zMax>12 for z mechanism,
feeds > 20000, workArea > 4000 mm).

## 4. Core modules (pure, `module.exports` + `window.Vectura.*`, no DOM)

All under `src/core/plotter/`. Load in index.html after `optimization-utils.js` / `path-draw.js`,
before `engine.js` is fine (no engine dependency).

### 4.1 `plot-safety.js` → `Vectura.PlotSafety`
- `classifyCommand(line, {allowFirmwareWrites}) → {ok, reason, kind}` kind ∈ motion|query|
  realtime|setting|blocked. Implements rule 1.
- `effectiveWorkArea(profile, firmwareSettings) → {width,height}`.
- `clampFeedXY(f, profile, fw)`, `clampFeedZ`, `clampZ(z, profile, fw)`.
- `checkJobBounds(job, area) → {ok, overflow:{left,right,top,bottom}, bbox}`.
- `validateProfile(p) → {ok, errors[]}`; `normalizeProfile(p)` fills defaults from PLOTTER_DEFAULTS.

### 4.2 `plot-job.js` → `Vectura.PlotJob` (geometry → job)
Input: `penGroups = [{penId, pen:{id,name,color,width}, polylines:[[{x,y}..]]}]` in **document mm,
origin top-left, y down** (from §4.6) + `settings` (§5) + `profile` + `docSize {width,height}`.
Steps, in order:
1. Filter to `settings.enabledPens` (default all), apply `settings.penOrder`.
2. Optimize per pen (toggleable): simplify (RDP, tol `optimize.simplify`, default 0.02 mm),
   drop paths shorter than `optimize.minLength`, dedupe (incl. reversed), greedy nearest-neighbour
   sort with reversal (`optimize.sort`), merge end→start within `optimize.mergeTol` (0.1 mm).
   Reuse `OptimizationUtils` helpers where they fit; keep algorithms deterministic.
3. Placement: `placement = {mode:'document'|'fit'|'center', offsetX, offsetY, scale, rotate:0|90|180|270}`.
   'document' = doc (0,0) at origin + offset. Rotation is about the doc's center then re-anchored
   to top-left. Then axes transform (invertX/Y relative to workArea, swapXY).
4. Passes: `pens[penId].passes` (1–10) repeats each path (alternate direction optional).
5. Emit `job = { units:'mm', pens:[{penId, pen, settings:{drawFeed,travelFeed,down,up,downDelay,
   upDelay}, paths:[[{x,y}..]] (machine coords) }], bbox, stats }`.
6. `stats = {drawLength, travelLength, penLifts, estSeconds, pathCount}`; estimate =
   lengths/feeds ×1.15 + lifts×(z time + delays).
`toGcode(job, profile, opts) → { lines:[string], penChangeIndices:[lineIndex], pathStartIndices:
[lineIndex] }` — preamble, pen up, per pen: (pause marker between pens is NOT a G-code; the
controller pauses at `penChangeIndices`), per path: pen up (if down), `G0`→ use **`G1 X Y F<travel>`**
for travel (G0 ignores F on GRBL and runs at max rate — unsafe), pen down (`G1 Z<down> F<zFeed>`
+ `G4 P<downDelay>` if >0), first draw seg with F, rest without F; pen up; postamble; optional
return `G1 X0 Y0 F<travel>`. Servo mechanism uses template strings instead of Z lines. Every
emitted line passes `PlotSafety.classifyCommand` (assert in tests). Numbers formatted to
`decimals`, trailing zeros stripped.
Also: `frameJob(bbox, profile)` (pen-up rectangle trace), `testSwatchJob(spec, profile)` (§6.4),
`airPlot(job)` (forces pen-up heights = up).

### 4.3 `grbl-protocol.js` → `Vectura.GrblProtocol` (pure parsers + streamer state machine)
- `parseLine(str) → {type:'ok'|'error'|'alarm'|'status'|'banner'|'setting'|'msg'|'other', ...}`.
  Status: state, subState, mpos, wpos, wco, fs {feed, speed}, bf {planner, rx}, pn. Handles merged
  junk like `ok<Idle|..>`.
- `parseSettings(lines) → {130: 420, 110: 11000, …}` (numbers).
- `class CharCountingStreamer({write, rxBuffer=127, onProgress, onError})`: `enqueue(lines)`,
  `onResponse(parsedOk|Error)`, `pump()`, `pauseAt(index)` boundaries, `cancel()`. Never exceeds
  rxBuffer bytes in flight. Pure: no timers inside except via injected scheduler.
- Realtime bytes constants: STATUS `?`, HOLD `!`, RESUME `~`, RESET `0x18`, JOG_CANCEL `0x85`.

### 4.4 `serial-transport.js` → `Vectura.PlotterTransports`
- `WebSerialTransport({profile})`: `isSupported()`, `requestPort()` (user gesture, with filters +
  fallback "show all ports"), `getGrantedPorts()`, `open()`, `close()`, `writeLine(str)`,
  `writeRealtime(byte)`, `onLine(cb)` (TextDecoder stream, split on `\r?\n`), `onDisconnect(cb)`.
  Handles `navigator.serial` 'disconnect' event and read loop errors.
- `SimulatorTransport({profile, speed})`: in-memory GRBL emulator implementing the same interface:
  banner `Grbl 1.1h ['$' for help]`, `$$` with 130=420,131=297,132=12,110=11000,111=11000,
  112=5000,22=0, char-counting with a 127-byte RX buffer, planner simulation of motion time
  (scaled by `speed`), status reports, `!`/`~`/`0x18`/`0x85`, `G92`, alarm on soft-limit violation
  (`$20` simulated on), `error:N` on unknown commands. Used by the UI "Simulator" port, unit tests and
  e2e. Exposes `getTrace()` (pen-down segments drawn) so tests/e2e can assert what would have been
  drawn.

### 4.5 `plotter-controller.js` → `Vectura.PlotterController` + `Vectura.PLOTTER_DRIVERS`
Driver registry: `PLOTTER_DRIVERS.grbl = { createController(profile, transport) }`. Future EBB
drivers register here. `PlotterController` (event emitter: `state`, `status`, `log`, `progress`,
`penChange`, `alarm`, `done`, `error`):
- `connect(transport)`: open, wait banner (1.5 s) else `\r\n` + `$I`; then `$$` (read-only) and
  `$G`; start status polling (`?` every 250 ms idle, 400 ms running). **No motion.**
- `disconnect()` (hold first if running).
- Manual: `jog(dx, dy, feed)` → `$J=G21G91X..Y..F..` clamped to bounds using current WPos;
  `jogCancel()`; `penUp()`, `penDown()`, `setPenHeight(z)` (calibration, clamped); `setOrigin()` →
  `G92 X0 Y0` (keeps `originSet=true` and stores machine offset); `goToOrigin()` (pen up first);
  `goTo(x,y)`; `unlock()`; `home()` only if capability.
- Job: `run(gcodeResult, {startLine=0, penChange:'pause'|'continue'})` → streams via
  CharCountingStreamer; at `penChangeIndices` waits for buffer drain + Idle, raises pen, moves to
  `settings.penChangePosition` (default origin), emits `penChange {pen, index}` and waits for
  `continuePenChange()`; `pause()` (`!`), `resume()` (`~`), `stop()` (§2 rule 7). Resume point =
  last fully acknowledged **path start index** (`pathStartIndices`); `resumeFrom(pathIndex)`
  re-sends preamble + pen up + travel to that path start.
- Refuses `run` if: not connected, `!originSet` (unless user ticks "use machine zero"), job out of
  bounds, state not Idle.

### 4.6 Geometry source — `ExportSvgBuilder.buildPlotPolylines(snapshot, {tolerance=0.05})`
Add to `src/ui/export-svg-builder.js`. From `snapshot.groups` (already optimized, pen-grouped,
margin-clipped): for each item, circles (`meta.kind==='circle'`) → expand to polyline (≥72 steps,
adaptive by radius so chord error ≤ tolerance); everything else → `PathDraw.toPolyline(path,
{useCurves:item.useCurves, sharpEdges:item.sharpEdges}, tolerance)`; closed paths end at their
start. Returns `[{penId, pen, polylines}]` in document mm. UI obtains the snapshot through
`UI.getExportSnapshot()`.

## 5. Plot settings (persisted) — `SETTINGS.plotter` defaults live in `src/config/plotters.js`
(`PLOTTER_DEFAULTS.settings`), merged into `getPreferenceSnapshot()` under key `plotter`
(trimmed from the cookie; localStorage only).
```
{ profileId:'uunatek-3-a3',
  placement:{mode:'document', offsetX:0, offsetY:0, scale:1, rotate:0},
  optimize:{enabled:true, simplify:0.02, minLength:0, dedupe:true, sort:true, merge:true, mergeTol:0.1},
  pens:{ [penId]: {enabled:true, drawFeed:null, down:null, downDelay:null, passes:1} }, // null = profile
  penOrder:null, penChange:'pause', penChangePosition:'origin', returnToOrigin:true,
  airPlot:false, profileOverrides:{} }
```
Pen settings are keyed by Vectura pen id so "brush pen = slow + lighter pressure" survives
sessions. Per-plot overrides never mutate built-in profiles.

## 6. UI — `src/ui/modals/send-to-plotter.js` (+ CSS in `src/ui/skin/components.css`)

Large panel opened from File → **Send to Plotter…** (`#btn-send-to-plotter`, after
`#btn-export-animated`; enabled when document has content; shortcut none for v1). Uses the
existing modal primitive, Mirror visual language (picture toggle cards, category color, dial)
where it explains something, existing components (`tog-grp`, `num-step`, `slider`, `sw-toggle`,
`select`). American English. Sections as tabs (left rail):

1. **Connect** — browser support check (if no `navigator.serial`: "Use Chrome or Edge on Windows
   or macOS" + Simulator still works), profile picker (cards: name, work area, tested badge),
   Connect (USB) / Simulator buttons, firmware info (`$I`, key `$$` values read-only), state pill
   (Idle/Run/Hold/Alarm), "Close the UUNA app first" hint, Disconnect.
2. **Setup** — preview canvas: work area rectangle, sheet/document rectangle at placement,
   pen-colored paths, travel moves dashed (toggle), out-of-bounds in red with message; placement
   controls (mode, offset X/Y, scale, rotation as 0/90/180/270 picture toggles); per-pen table
   (enabled, color swatch, order drag/arrows, draw speed, pen-down height, dwell, passes); optimize
   toggles; stats (draw length, travel, lifts, estimated time).
3. **Machine** (manual + calibration) — jog pad (±X ±Y, diagonals, step 0.1/1/10/50 mm,
   jog speed), keyboard arrows when focused (Shift = ×10), pen up/down buttons + live Z
   height slider (calibration, clamped), **Set origin here**, Go to origin, **Frame** (trace bbox
   pen-up), Unlock (alarm only), live position readout (WPos/MPos), current feed.
   Calibration wizards:
   - **Axis check**: jog +X 10 mm → "Did the pen move right?" → +Y 10 mm → "Did it move toward
     you (down the page)?" → sets invertX/invertY in the profile override. Swap if X moved
     vertically.
   - **Pen height**: start at up height, step down by 0.25 mm with "Touching paper?" — record
     touch Z, suggest down = touch + 0.5 mm (spring-loaded holder) and up = 0; clamps apply.
   - **Origin & paper**: jog to sheet top-left, set origin, then Frame to verify.
   - **Scale check**: draw a 100 × 100 mm square + 50 mm cross (test job) to measure with a ruler;
     optional steps/mm note (read-only display of $100/$101; never written).
4. **Plot** — Start (Air plot toggle, Return to origin toggle), Pause/Resume, **Stop** (big,
   always visible while running, also Esc), progress bar + current pen + path n/N + elapsed/ETA,
   live pen position drawn on the preview, pen-change prompt card (pen name + color swatch +
   "Continue"), resume-from-path field after a stop, test swatch generator (§6.4).
5. **Console** — log of sent/received (filterable), input line for G-code/queries through
   `PlotSafety.classifyCommand` (blocked commands shown with reason), Advanced switch (§2.1).

### 6.4 Test swatch (artistic development)
`testSwatchJob({rows: speeds[], cols: downHeights[], size: 15mm, gap: 5mm, pattern:'hatch'|
'zigzag'|'circle'})` — grid of small patches across a speed × pressure matrix with labels-free
layout, placed at a chosen offset, so artists can pick per-pen settings. Uses the same safety path.

## 7. Tests (RGR; queue-wrapped commands only)
- Unit: `tests/unit/plotter/plot-safety.test.js`, `plot-job.test.js`, `grbl-protocol.test.js`,
  `simulator-transport.test.js`, `plotter-controller.test.js` (controller ↔ simulator: connect
  sends no motion; jog clamps; run streams whole job and simulator trace matches job paths; pause/
  resume; stop raises pen; pen-change pause; out-of-bounds refused; firmware-write blocked),
  `plotters-config.test.js`, `build-plot-polylines.test.js`.
- Integration: `tests/integration/modals/send-to-plotter.test.js` (open modal from menu, simulator
  connect, preview stats, settings persisted).
- E2E: `tests/e2e/send-to-plotter.spec.js` — load app, add a layer, open File → Send to Plotter,
  Simulator connect, set origin, Air plot / plot to completion, assert progress 100 % and trace
  path count; screenshots via evidence helper.
- Check `architecture-contract.test.js`, `runtime-loader-contract.test.js`, runtime profiles and
  `docs-command-drift` for registration requirements when adding files.

## 8. Docs
README (feature group + help), in-app help guide entry, CHANGELOG Unreleased, plans.md,
`docs/plotter-send.md` (user guide: browser support, closing UUNA app, first-run calibration,
safety behaviors, adding a profile/driver).

## 9. Out of scope v1
EBB/AxiDraw driver (registry slot only), WiFi/Bluetooth UUNA modes, firmware config writes,
G-code file export (cheap follow-up: `toGcode` → download; may add if trivial).
