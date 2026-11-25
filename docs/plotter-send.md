# Send to Plotter

`File > Send to Plotter...` streams the current document straight from the browser to a pen plotter over USB. There is no local server and no G-code file to juggle. The first supported machine is the **UUNATEK 3.0** (GRBL / DrawCore firmware). The feature is built on a plotter profile registry and a driver registry, so other machines can be added without touching the UI (see [Adding another plotter](#adding-another-plotter)).

Design contract: [plotter-send-spec.md](plotter-send-spec.md). This page is the user guide.

## Browser support

| Browser | Status |
|---|---|
| Chrome or Edge on Windows or macOS | Supported (Web Serial API) |
| Safari, Firefox | Not supported (no Web Serial). The Simulator still works. |

The page must be served from `http://localhost` or over `https`. It does not work from a `file://` page, so run `python -m http.server` and open `http://localhost:8000`, or use the hosted site.

## Before you start

- **Close the UUNA app** (and any other program that talks to the plotter). Only one program can own the serial port at a time.
- If no port appears in the picker, install the **CH340 USB driver** for your operating system and reconnect the cable.
- Use the Simulator (Connect tab) to rehearse a job with no hardware attached.

## First-run checklist

Do these once per plotter profile. The wizards are on the Machine tab.

1. **Connect.** Pick your profile, click Connect (USB), and choose the port. Connecting only reads information; nothing moves.
2. **Expect a restart.** Opening the port resets the board. Position goes back to zero and any origin you set is forgotten. Set the origin after every connect.
3. **Axis check.** Jogs X then Y by 10 mm and asks which way the pen moved, then stores the axis inversion for the profile.
4. **Pen height.** Lowers the pen in 0.25 mm steps until it touches the paper, then suggests a pen-down height slightly past the touch point (for spring-loaded holders). Heights are clamped to the profile limits.
5. **Origin and paper.** Jog the pen to the top-left corner of the sheet, click Set origin, then Frame to trace the artwork bounds with the pen up and confirm it fits.
6. **Scale check (optional).** Plots a 100 x 100 mm square with a cross so you can measure it with a ruler. Steps per mm are displayed read-only and are never written.

## Plotting

**Setup tab.** A preview shows the work area, the sheet at its placement, pen-colored paths, optional dashed travel moves, and any out-of-bounds geometry in red with the overflow amount.

- **Placement:** document position, fit, or center; offset X and Y; scale; rotation (0, 90, 180, 270).
- **Optimization:** simplify, minimum length, dedupe, sort, and merge, with live stats (draw length, travel, pen lifts, estimated time).
- **Per-pen settings** (saved by pen, so a brush pen stays slow and light across sessions): enabled, speed, pen-down height, dwell, and passes (1 to 10). Blank values use the profile default.
- **Pen type presets:** each pen has a "Pen type (starting point)" list (fineliner 4000, gel 2500, ballpoint 4000, fountain 3000, brush 2000 with a 0.15 s dwell, paint marker 2500 with 0.15 s, technical 2500, pencil 4500, metallic gel 2000 with 0.1 s). A preset fills the draw speed and down dwell; editing either by hand switches the pen to Custom. The values are community-derived starting points, and the choice is saved per pen.
- **Speed range:** on UUNATEK 3.0 plotters, XY feeds cap at 15000 mm/min (the vendor Standard mode) and Z at 8000, always clamped to your firmware's `$110`/`$111` and `$112`. Jogging stays at 6000. The new defaults are draw 4000 and travel 10000. Each pen's speed field shows the effective value and what caps it (profile limit, your firmware, or High-speed mode). Soft tips (never blocking) appear above 6000 mm/min drawing (fine lines may thin or skip) and above 12000 mm/min travel (watch registration).
- **High-speed mode (opt-in):** Setup, Speed section. After a confirmation (noise, lower precision, possible step loss and stalling), the XY limit rises to 20000 mm/min, but only when the connected firmware reports `$110` and `$111` at or above the feed you ask for; with a lower firmware limit nothing changes, and with an unknown firmware it stays at 15000. A "High-speed" badge shows in the header while it is on. Vectura never changes firmware speed or acceleration settings. The Specs panel lists the four vendor speed modes and highlights the one closest to your firmware's `$110`-`$122`.
- **Path order:** optimized (default), document, reverse, or random (seeded, useful for even ink coverage).
- **Brush re-dip:** every N mm of pen-down travel the plotter lifts, goes to a dip position, dips the brush, and returns. Off by default; the dip position must be inside the work area.
- **Registration marks:** a 10 mm cross at the top-left of the job drawn by every pen so you can check color alignment. Off by default.
- **Air plot:** runs the whole job with the pen held up, to check motion and timing.
- **Test swatches:** a grid of small patches across a speed by pen-down height matrix, to choose per-pen settings.

**Plot tab.** Start, Pause, Resume, and a large Stop button (also the Escape key). It shows progress, the current pen, path n of N, elapsed and remaining time, and the live pen position on the preview. "Return to origin" is optional.

## Pen changes

When a job uses more than one pen, the plotter finishes the current pen, raises the pen, moves to the pen-change position (origin by default), and shows a card with the next pen's name and color. Swap the pen, optionally re-check the pen height, then click Continue.

## Pause, stop, and resume

- **Pause** holds the motion; **Resume** continues from the same spot.
- **Stop** (button or Escape) does a safe stop: feed hold, then a soft reset. Because the reset clears the controller's position, Vectura then unlocks, restores your origin, and raises the pen. The pen is always raised before any further XY move.
- After a stop, the Plot tab offers **Resume from path N**, based on the last fully acknowledged path. Resuming re-sends the preamble, lifts the pen, and travels to that path.

## After an alarm

An alarm aborts the job, clears the queue, and shows the alarm text with a resume point. Use Unlock on the Machine tab only after checking that the pen is clear of the paper edge; position may be wrong. If the position was lost (for example the board reset mid-job), resume is disabled: **power-cycle the plotter, reconnect, set the origin again**, and restart or resume from a path number. A mid-session reset banner is treated as a reset and aborts the job.

## Safety behaviors

- Firmware settings are **never written** by default. `$N=`, `$RST`, `$SLP`, startup blocks, EEPROM work offsets, and stored positions are blocked. The origin uses volatile `G92` only.
- The Console tab's **Advanced** switch can allow `$N=value` writes, but only after you type `ALLOW`. `$RST` is **always** blocked, and the switch resets when you reconnect.
- **Bounds:** every target (job, frame, jog, go-to) must be inside the profile work area, further limited by the firmware `$130/$131` values. A job with any point outside is refused before the first byte is sent. Jogs clamp at the limit.
- **Clamps:** feeds clamp to the profile and firmware maximums; pen height clamps to the profile Z range (and `$132`). Console moves that exceed a limit are refused, not clamped.
- **No G0:** travel uses `G1` with an explicit feed, because `G0` ignores the feed on GRBL.
- **No homing** unless the firmware reports homing switches (`$22=1`), and then only behind a confirmation.
- Pen is lifted before every travel and at the end of every job. Disconnecting or closing the tab sends a feed hold.
- Only one plotter connection per tab.
- Motors are left energized at the end (the vendor `$SLP` is blocked), which keeps registration between pens.

## Simulator

Choose **Simulator** on the Connect tab for an in-memory GRBL emulator with the same behavior as the hardware path: banner, `$$` settings, a 127-byte receive buffer, status reports, hold/resume/reset, and soft-limit alarms. It is useful for rehearsing a job, for demos, and for automated tests.

## Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| No Send to Plotter or Connect (USB) option | Browser has no Web Serial. Use Chrome or Edge, and serve over `http://localhost` or `https`. |
| Port list is empty | Install the CH340 driver, try another cable or USB port, or choose "show all ports". |
| "Failed to open" or access denied | Another program owns the port. Close the UUNA app and other serial tools. |
| Origin is gone after connecting | Expected. The board resets when the port opens. Set the origin again. |
| Plot is mirrored or sideways | Run the Axis check wizard. |
| Pen does not touch, or digs in | Run the Pen height wizard; adjust the pen-down height per pen. |
| Job refused as out of bounds | Reduce scale, change placement, or move the origin. The overflow amount is shown. |
| Alarm during a job | Check for a stalled carriage or a bad origin, unlock, and resume from the reported path. |
| Size is off | Run the Scale check and compare with a ruler. Do not change firmware steps/mm here. |

## Adding another plotter

### As a user

Built-in profiles are read-only. On the Connect tab choose **Duplicate profile** to make an editable copy (speeds, limits, pen heights, work area, G-code). User profiles and per-profile calibration are stored in this browser's localStorage and validated before use (no negative or NaN values, Z range, feed ceiling, work-area size).

### As a developer

1. Add a profile object to `PLOTTER_PROFILES` in `src/config/plotters.js`, usually with `merge(BASE_PROFILE, {...})`. Set `id`, `name`, `vendor`, `driver`, `tested`, `workArea`, `pen`, `motion`, `limits`, and `serial`. Mark it `tested: false` until verified on hardware; the UI shows an "untested profile" badge. Profiles are deep-frozen.
2. Pick a driver. Existing profiles use `driver: 'grbl'`. For a different protocol (for example an EBB / AxiDraw driver), register it in `PLOTTER_DRIVERS` in `src/core/plotter/plotter-controller.js`:

```js
PLOTTER_DRIVERS.ebb = { createController: (profile, transport, opts) => new EbbController(profile, transport, opts) };
```

   A driver controller must expose the same events and methods the UI uses (connect, disconnect, jog, pen up/down, set origin, run, pause, resume, stop, and the state, status, progress, penChange, alarm, done, and error events).
3. Add unit tests under `tests/unit/plotter/`, including the safety rules the new profile or driver touches.
4. Update this guide, the README, and the changelog.
