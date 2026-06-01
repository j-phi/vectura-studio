# Changelog

All notable changes to this project should be documented in this file.

The format is intentionally human-curated with an `Unreleased` section that collects work before release.

## Unreleased

### Changed
- **Clearer Micro Tuning help and value-range errors.** The Micro Tuning info modal described it with absolute-frequency examples ("2.001"), which led people to type values like "2" into a control that ranges only about ±0.2 — and the resulting error said merely "outside the allowed range or format." The copy now makes clear Micro Tuning is a small ± offset (example: 0.001, with Frequency for the actual pitch), and the **Invalid Value** modal now names the range it wants, e.g. "Enter a value from −0.200 to 0.200." (Fixed a latent bug found while wiring this: the `showValueError` prototype wrapper dropped its range argument, so the range never reached the modal.)
- **Virtual-plotter playback is now reveal-only, and LFOs are baked into the figure (fixes two reported bugs).** Previously the grey "ghost" figure morphed every frame during playback (the play loop re-evaluated the whole figure against a wall-clock "breathe"), and LFO/motion only affected the plotter preview — never the final canvas/SVG. Both are fixed by one architectural shift: **an LFO is now a function of the figure's own progress `t`**, evaluated per-sample and baked into the geometry by the shared `HarmonographCore.evaluatePath` (extended with an `opts.motion` fast path — compiled edges, no per-sample clones, with the unit conversions degrees→radians for phase and ×2π for paper rotation, and a per-sample `damp` clamp so a bipolar LFO can't blow up `exp`). So the modulated figure is **deterministic and static**: the plotter caches it once and the red line simply traces it 0→100% on a loop (drag-the-scrubber behaviour), while `harmonograph.generate()` now routes its main path through the same evaluator — so the **main canvas and SVG export reflect the LFOs**, matching the preview. A Motion Rack edit regenerates the layer (so the **main canvas + export update live**) and rebuilds the plotter's cached ghost in place, so the change shows immediately everywhere. Unmodulated output is byte-identical (the no-motion path is unchanged and `generate()`'s delegation is verified geometry-identical, keeping harmonograph and the determinism/visual contracts intact). Note: a "free"-rate LFO now bakes deterministically into the single static figure rather than drifting endlessly across loops. (RGR: `harmonograph-core.test.js` — modulated figure is static/deterministic, differs from no-motion, fast-path == per-sample `applyModulation` reference within 1e-9, bipolar-damp bounded; `pendula-algorithm.test.js` — an LFO edge changes the engine output; `harmonograph-plotter-playback.test.js` — rewritten to assert the ghost is INVARIANT while playing and only the reveal advances/wraps, plus a Motion-Rack-edit-rebuilds-the-ghost test.)

### Added
- **Motion Rack — re-target an assignment in place, and an info `(i)` panel on every control.** Each existing modulation routing now carries a **re-target dropdown**: to move an LFO/macro from one parameter to another (e.g. Paper Rotation → Loop Drift) you just pick the new target from the row's `<select>` instead of deleting the edge and re-assigning — the amount is left untouched so the change is predictable and undoable. And **every element of the rack now has an info badge** — the rack header, **+ LFO**, **+ Macro**, the LFO shape/sync/rate/depth/polarity controls, the drawn-curve editor, the macro value, and each edge's target and amount — so it's clear what each control does. The badges reuse the existing global `.info-btn` delegated handler (hover teaser + click-opens-modal, zero new wiring), and five new `pendula.motion.*` help entries (rack, addLfo, addMacro, macroValue, drawn) were written so no badge is a dead end. (Built by parallel implement → adversarial-review → judge agent teams. RGR: `pendula-studio.test.js` — an existing edge row renders a re-target select whose value tracks `targetParamPath`, a `change` re-points the edge and leaves amount unchanged; the rack emits `pendula.motion.*` info buttons including rack/addLfo/shape/targetParamPath; and a no-dangling-keys test asserts every emitted `data-info` key resolves in `InfoModals.INFO`.)
- **The Virtual Plotter can pop out into a floating, draggable, resizable window over the canvas.** A pop-out button (⧉) in the plotter header detaches it into a floating panel you can drag by its header and resize from the corner; the figure re-renders at full resolution as you grow it (not upscaled). A pop-in button (↩) re-docks it, and a placeholder marks its panel slot while it's out. The popped state survives panel rebuilds (adding a pendulum, dicing, switching presets re-float it at the same spot rather than orphaning it), and playback / the Plot-range and Reveal sliders keep working while floated. (RGR: `harmonograph-plotter-popout.test.js` — pop-out moves the widget into a fixed `#harmonograph-plotter-float` and sets the popped flag; pop-in restores it; the popped state survives a `buildControls()` re-mount with exactly one float and one plotter; header-drag moves it; resizing changes the canvas backing store; no undo history is pushed.)
- **A Phase pad beside the Release pad, and the Motion Rack now sits above the Virtual Plotter.** Each pendulum card now has two side-by-side drag pads: **Release** (the ampX/ampY swing vector, as before) and a new **Phase** pad that sets phaseX (horizontal) and phaseY (vertical) — each axis runs 0°–360° across the pad, so sweeping the handle reshapes the figure (the X/Y phase offset is what turns a line into an ellipse or circle) without changing its size. Both pads share one builder; the Phase pad clamps each axis independently so every phase combination is reachable, while Release stays disk-clamped. For pendula, the **Motion Rack moved above the Virtual Plotter** — you shape the figure with LFOs, then the plotter below previews and plays it. (RGR: `pendula-oscillator-controls.test.js` — two pads per card, the Phase pad sets phaseX/phaseY and leaves amplitude untouched, labelled "Phase" with a `pendula.phasePad` info entry.)
- **Pendula/harmonograph preset gallery — a craft-ladder of grouped cards.** The flat preset dropdown becomes a small **gallery of figure thumbnails grouped by craft stage: Classic → Detuned → Evolving**. Each card renders the preset's actual figure (via the shared `HarmonographCore.evaluatePath`) and applies it on click; the currently-applied preset's card is highlighted, and empty groups are omitted. Card clicks route through one shared apply path (merge `{...defaults, ...preset.params}`, preserve the layer transform, set `layer.params.preset`) with a single undo entry — identical to the old dropdown, just legible and browsable. New component `src/ui/components/harmonograph-preset-gallery.js`; a `group` field added to the eight harmonograph/pendula presets. (RGR: `pendula-preset-gallery.test.js` — grouped Classic→Detuned→Evolving order, a thumbnail card per preset, apply merges distinctive params + preserves transform + highlights the active card + pushes one history entry + leaves no stale pendulums; the harmonograph-presets / pendula-studio suites updated to drive the cards.)
- **Pendula oscillator cards — a "Release" pad + per-parameter dice padlocks.** Each pendulum card now leads with a labelled **Release** pad: a drag-vector control whose handle position *is* the pendulum's swing amplitude on the X (horizontal) and Y (vertical) axes — drag far for a big swing, out along an axis to swing mostly that way, to the center for none. It sets **only amplitude** and deliberately leaves phase alone (phase, the timing offset that gives the figure its 2D shape, stays under Advanced), so a nudge scales or skews the figure but can never collapse it to a line. The numeric ampX/ampY/phaseX/phaseY inputs live in an **Advanced** disclosure on the card (still the editable source of truth; editing them moves the pad handle), while Frequency/Micro/Damping stay visible. Every per-pendulum control gains a **padlock**: locked params (stored in `layer.params.pendulumParamLocks[id][key]`, serialized for free) are skipped by Dice/Mutate. The pad is DPR-scaled and pushes one undo entry per drag, and has its own info modal. (RGR: `pendula-oscillator-controls.test.js` — the pad sets the signed (ampX,ampY) vector and never touches phase, a nudge keeps phaseX≠phaseY so the figure stays 2D, it's labelled "Release" with a `pendula.pluckPad` info entry, the four numerics live in the Advanced disclosure, and a locked freq survives a dice roll.)
- **Motion Rack — macro knobs + draw-your-own LFO shape.** Two new modulator sources. A **Macro** (`+ Macro`) is a static 0–1 knob you patch to many param edges at once (one twist drives them all); it evaluates to a constant so it bakes cleanly into the figure. A **Drawn** LFO shape adds a small per-loop curve editor (double-click to add a point, drag to shape, double-click a point to remove) whose hand-drawn trajectory is interpolated each cycle — choreograph a bespoke evolution over one loop. Both serialize into `layer.params.motion` and flow through the existing per-sample `evaluateSource` baking unchanged. (RGR: `harmonograph-modulation.test.js` — macro is time-independent and depth-scaled and drives multiple edges; drawn interpolates at several phases, handles <2 points, and round-trips JSON; `pendula-studio.test.js` — `+ Macro` adds a value-only card, selecting `drawn` mounts the editor, both serialize.)
- **Pendula/harmonograph virtual plotter — plot-range start/stop, a sharper preview, and longer durations.** A new **Plot** dual-thumb slider above Reveal sets a `[start, end]` window (0–100%) that truncates the figure by arc length — nothing draws before Plot Start or after Plot End. The cut happens at the single shared `HarmonographCore.evaluatePath` seam, so it applies to **both the main canvas and the virtual-plotter ghost** (and the reveal then retraces the visible slice). The default full range is a **byte-identical no-op** (determinism and the `pendula==harmonograph` JSON-equality contract are preserved); pre-existing `.vectura` files without `plotStart`/`plotEnd` default to the full range. Edits commit on release (`change`) with undo history, mirroring the sibling controls, and the two overlapping thumbs stay grabbable via a pointer-proximity z-index. The plotter canvas is now **DPR-scaled** (crisp on Hi-DPI; responsive CSS sizing preserved), and the **Duration** max is raised 120 → 600s. (RGR: `harmonograph-core.test.js` — byte-identical default, arc-length truncation, reversed→empty range; `harmonograph-plotter-playback.test.js` — the plot-range thumbs truncate BOTH surfaces, the thumbs stay ≥1% apart, and a commit is undoable. Verified live in-browser: 10–80% → canvas 4199 pts and ghost 4199 pts, fill band + label correct.)
- **Every Pendula & harmonograph parameter now has a thoughtful, human-friendly info modal.** Filled the missing entries (preset, machine type, the pendulum enable toggle, every Motion Rack LFO control — shape/rate/sync/depth/phase/polarity and the edge target/amount, and the new Plot Start/End) and elevated the terse existing copy to plain-language explanations grounded in the harmonograph craft. Also fixed a latent bug: the Pendula panel rewrites every `harmonograph.*` infoKey to `pendula.*`, so without `pendula.*` mirror entries **every Pendula info button was a silent no-op** — those mirrors are now in place.
- **Export Animated SVG — a "draw-on" animation (Pendula studio, Phase 4).** A new **File → Export Animated SVG…** action emits a self-contained SVG whose strokes draw themselves on a loop (SMIL `stroke-dashoffset`), so you can share the figure *drawing itself*. Each continuous stroke is sequenced by cumulative length over the figure's duration (the active harmonograph/pendula layer's `duration`, clamped to a watchable range) and the whole sequence repeats indefinitely. It is a **separate** action from the canonical Export SVG — the plotter-ready output stays clean and static (no `<animate>` contamination). First slice targets continuous line-mode geometry. (New pure, DOM-free builder `Vectura.AnimatedSvg.buildDrawOn`. RGR: `export-animated-svg.test.js` asserts one animated `<path>` per polyline, `stroke-dasharray` = polyline length, valid SMIL `keyTimes` (start 0 / end 1, monotonic), sequenced multi-path offsets, and looping; `pendula-animated-export.test.js` asserts the action is wired, builds an `<animate>` SVG from real layer geometry, and that the canonical `exportSVG` output contains no `<animate>`.)
- **Pendula studio — Phase 3 (machine types, dice, oscillator polish).** (a) **Machine type** selector: *Lateral* (the damped spiral-in) or *Pintograph* — constant-velocity disks where damping is forced to 0 at the single shared-evaluator chokepoint, so the figure loops perpetually without decaying. Pendula-only; harmonograph is untouched. (b) **Dice/Mutate** now understands the harmonograph family — the Randomize button mutates the pendulum stack into *tasteful* territory (frequencies snapped to small whole-number ratios with the occasional half-step, damping in a low band — or 0 under Pintograph, micro-detune ±0.02, 15°-snapped phases, balanced amplitudes) so a roll lands a legible Lissajous-family figure instead of mud. (c) **Oscillator-stack polish:** each pendulum card now shows a per-pendulum **mini-trace thumbnail** (its solo contribution) and the stack shows a live **frequency-ratio readout** (e.g. `3:2`) as a craft signal; both recompute on edit, not per frame. Also removed the dead, never-loaded `pendulum-list.js` component. (RGR: `harmonograph-core.test.js` envelope test proves Pintograph is non-decaying vs Lateral; `pendula-mutate.test.js` asserts every randomized freq is in the tasteful set and damp in-band / 0 under Pintograph; `pendula-oscillator-cards.test.js` asserts a mini-trace canvas per card and a freq-ratio readout that updates on edit.)
- **New algorithm: Pendula — a kinetic-harmonograph studio.** A second harmonograph-family algorithm built *in parallel* with the existing `harmonograph` (which is left untouched). Pendula reuses harmonograph's static renderer (its `generate` delegates to the harmonograph registry, so the two never drift) but layers on the studio experience: a **Motion Rack** of temporal LFOs (sine/triangle/saw/square/sample-hold/random, free-Hz or synced-to-loop, depth/phase/polarity) that you drag-assign to any parameter — `loopDrift`, `scale`, `paperRotation`, or per-pendulum freq/detune/amp/phase — via the typed edge matrix in `layer.params.motion`, evaluated live every frame by the virtual plotter so the figure *moves as it plays* (lock a circle, then drift it into a snake). Ships its own four-preset gallery — **Breathing Orbit**, **Drift Star**, **Tidal Lissajous** (all with pre-wired LFO patches) and **Pulsing Web** (a dense still). New modules: `src/core/algorithms/harmonograph-modulation.js` (the temporal LFO engine: synced sources repeat exactly each loop, including sample-hold; `applyModulation` is a pure transient overlay that never mutates committed params) and `src/ui/components/harmonograph-motion-rack.js` (the drag-to-assign UI). Pendula is registered everywhere a drawable algorithm appears (dropdown auto-derives from `ALGO_DEFAULTS`; the toolbar/shortcuts/filter pickers got explicit rows) with its own icon and seedless treatment. (RGR: `tests/integration/pendula-algorithm.test.js` + `tests/integration/pendula-studio.test.js` + `tests/unit/harmonograph-modulation.test.js` cover registration, identical-to-harmonograph delegation, the preset gallery, the Motion Rack add/assign/serialize flow, that motion presets actually evolve, and that harmonograph is left without a Motion Rack; verified live in-browser — Breathing Orbit's circle breathes as it plays. The full studio panel renders correctly after fixing a real bug where the Motion Rack component, given the shared panel container, wiped every control rendered before it — it now mounts into a dedicated host.)
- **Harmonograph now ships a starter preset gallery (the first harmonograph presets — there were none).** A **Presets** selector at the top of the harmonograph controls offers a four-rung "craft ladder": **Unison Circle** (the lock-to-a-circle anchor), **Classic 3:2 Star** and **4:3 Star** (the canonical damped Lissajous rosettes, with micro-detune for the layered string-art moiré), and **Evolving Snake** (an epicyclic carrier-plus-loops coil that genuinely morphs as it plays). Wiring reuses the existing rings/terrain preset pattern: data in `presets.js` (`preset_system: 'harmonograph'`), a filtered `PresetLibraries.harmonograph` view, options + a `select` control in the registry, and a `layer.type === 'harmonograph'` apply block that merges `{...defaults, ...preset.params}` while preserving the layer transform. (Each preset was visually QA'd in-browser; RGR: `tests/integration/harmonograph-presets.test.js` asserts the filtered library, that every preset evaluates to a real non-degenerate 2D figure, the rendered selector, and that applying/switching presets merges params with no stale pendulums.)
- **Harmonograph Virtual Plotter now plays as a live, evolving, looping animation (Phase 1 of the hands-on harmonograph studio).** Playback no longer sweeps a precomputed static array — the rAF loop advances a real-time clock and **re-evaluates the figure every frame**, so the drawing visibly evolves while it plays (a gentle `loopDrift` breathe — a stand-in for the assignable LFOs coming in Phase 2 — turns a circle into a snake and back). Introduces `window.Vectura.HarmonographCore.evaluatePath(params, opts)`: a shared, **pipeline-free** params→path evaluator (the "evaluate-only seam") that bypasses `engine.generate()`/`computeAllDisplayGeometry()` so it is cheap enough to call per frame; the virtual-plotter widget delegates to it instead of duplicating the math. Live preview is capped at 1400 vertices for 30–60fps (full resolution stays for idle scrubbing and export), the pen reveal loops continuously, and playback is fully **transient** — it mutates no `layer.params` and pushes **no undo history**. Verified live in-browser (idle 6001 pts → capped 1401 live, reveal advances + wraps, figure fingerprint changes per frame, zero errors). (RGR: `tests/unit/harmonograph-core.test.js` covers the evaluator — determinism, fixed-t stability, `sampleCap` coarsening, cx/cy offset, loopDrift divergence; `tests/integration/harmonograph-plotter-playback.test.js` drives the real widget with a manually-pumped rAF queue asserting per-frame re-eval, capped sample count, looping reveal, evolving geometry, and zero history pushes.)
- **Wallpaper mirror is now a gallery-first creative experience.** The Wallpaper mirror panel opens in a new **Styles** mode: a scrollable grid of cards, each showing a canonical thumbnail icon of that symmetry. Cards cover all 17 groups (labelled in plain language, not crystallographic codes) plus a curated set of named recipes (Op-Art Weave, Courtyard, Switchback, Brick Path, Kasbah Tile, Snowflake Lace, Trefoil, and more). One click applies a look — no exposure to lattice/rotation/mirror internals. The composable chip editor is preserved behind a **Build** mode toggle (persisted as `wallpaperPanelMode`).
- **Surprise me.** A dice button rolls a random *valid* wallpaper group with tasteful tile parameters; Shift-click locks the current lattice family and rerolls only the rest. Every roll is undoable.
- **On-canvas symmetry handles.** Wallpaper mirrors now expose a draggable **center puck** (moves the symmetry center) and a **rotate ring** (spins the whole lattice) directly on the canvas, alongside the existing tile-vector handles. Shift snaps rotation to 15° and the center to canvas center.
- **Live thumbnail previews** are rendered from a shared, cached, lazily-painted substrate (`WallpaperPreview`) that runs the pure wallpaper transform offscreen, so a full gallery of previews stays cheap.

### Changed
- **Plain-language wallpaper controls and clearer feedback (Build mode).** Glossary popovers (rectangular / square / hexagonal families) are wired back in; auto-corrected chips now flash with a transient plain-language note when a selection snaps to a different valid group, and the friendly group name is always shown. Copy was reworded for artists: *Domain scale → Tile scale*, the global rotation dial → *Pattern angle*, and the v1/v2 layout toggle → *Crisp / Airy*. Locked tile sliders explain themselves with touch-safe notes.
- **Wallpaper modifier picker reworked as composable symmetry chips.** The flat 17-cell crystallographic atlas in the Wallpaper mirror panel is replaced by three orthogonal chip rows — **Lattice** (parallelogram / rectangle / rhombus / square / hexagon), **Rotation order** (1 / 2 / 3 / 4 / 6), and **Mirrors** (None / Straight / Glide / …). The group ID is derived from the tuple via a new resolver (`WallpaperGroups.featuresToGroupId` + `nearestValidGroup`) that deterministically snaps invalid combinations to the nearest valid group and escalates rather than relaxes when a mirrored choice would otherwise be dropped (e.g. cycling from `p3m1` to hex rotation 6 lands on `p6m`, not `p6`). The engine still reads `mirror.group` for math; the new `mirror.symmetry` tuple is stored alongside and roundtrips through `.vectura` saves automatically. Crystallographic IDs (p4m, p3m1, …) are hidden by default — toggle **Show crystallographic group names** in Document Setup → History & Preferences to surface them.
- **Keyboard cycling within a lattice family.** ⌘← / ⌘→ (Ctrl on Windows/Linux) walks through every group sharing the selected wallpaper's lattice in canonical order (rotation ascending, then mirror complexity), wrapping at the ends.

### Fixed
- **Wallpaper recipe cards now render identically regardless of which recipe was selected before.** Clicking a recipe (e.g. Harlequin) produced a different pattern depending on the prior selection — Brick Path → Harlequin looked tighter/stretched versus Op-Art Weave → Harlequin — because the recipe-apply handler did `Object.assign(mirror, p.mirror)` and a recipe's `p.mirror` is a *partial* (Harlequin sets only `group`/`symmetry`/`tileWidth`/`tileAngle`), so every field the recipe omits (`tileHeight`, `domainScale`, `rotation`, `variantV1`, `centerX/Y`) leaked in from whatever was applied before. The handler now resets the preset-settable geometry subset to the canonical `createWallpaperMirror()` factory defaults *first*, then merges the partial on top (`Object.assign(mirror, geomDefaults(), p.mirror)`), so a recipe is self-contained and deterministic; the reset is derived from the factory so it can never drift, and identity/UI fields (`id`, `enabled`, `color`, …) are preserved. The **Surprise me** roll routes through the same clean base, so a panned center no longer survives a roll. (Built by parallel implement → adversarial-review → judge agent teams on disjoint files. RGR: `wallpaper-gallery-panel.test.js` — Brick Path→Harlequin, Op-Art→Harlequin, and fresh→Harlequin snapshots of all ten geometry fields are deeply equal; a leaked-field assertion (`domainScale`/`tileHeight` reset to factory, not Brick Path's 0.85/64); identity preserved across a switch; and Surprise resets `centerX/centerY` to 0.)
- **The Virtual Plotter ghost now tracks every parameter edit, not just Motion Rack edits.** Editing a pendulum (frequency/amplitude/etc.) regenerated the main canvas but left the plotter's cached "ghost" figure stale — only Motion Rack edits and full panel rebuilds (add/remove pendulum) refreshed it. The plotter ghost is a view of the layer's figure, so its rebuild is now hooked into `App.regen()` (the single refresh point every edit path runs through — pendulum stack, base params, dice, presets, Motion Rack), keeping the preview in lock-step with the main canvas. (RGR: `harmonograph-plotter-playback.test.js` — editing a pendulum freq / adding a third pendulum then `regen()` changes the cached `harmonographPlotterState.figure`.)
- **The harmonograph "Virtual Plotter" play button now actually animates (and loops).** Pressing Play appeared to do nothing: the preview advanced a single frame and froze. The `requestAnimationFrame` tick accumulates `state.playhead` as a *float*, but `draw()` used it directly as an array index — `data.path[27.34]` is `undefined`, so `toCanvas(undefined)` threw `Cannot read properties of undefined (reading 'x')` *before* the loop's reschedule line, killing the animation after one frame (the first frame survives only because its delta is 0, keeping the index integral). `draw()` now floors the playhead before indexing (`Math.floor(state.playhead)`). While here, playback now **loops** instead of halting at the end (the overshoot wraps via `playhead % maxPlayhead`) so the drawing replays live, matching the intended "watch it draw on repeat" behaviour. (RGR: `tests/integration/harmonograph-plotter-playback.test.js` drives the real panel widget with a manually-pumped rAF queue — pre-fix it throws on the 2nd frame; post-fix the playhead advances smoothly across 40 frames and wraps at the end. Verified live in-browser: playhead climbs 94→774 at 4× with zero console errors.)
- **Masking no longer changes a curve algorithm's shape.** Applying a mask to a curve-rendered layer (Lissajous, spiral, harmonograph, rings, topo — anything with `curves: true`) used to collapse its smooth arcs into straight radial chords inside the mask, instead of simply clipping the curve. These algorithms emit a *sparse* polyline; their on-screen smoothness comes entirely from the renderer's midpoint-quadratic interpolation (`Renderer.tracePath`) — and the masking pipeline was clipping the raw sparse polyline, cutting along its chords and discarding the smoothing. A prior attempt to linearly `resamplePath` before clipping could not help: it only inserted collinear points *on the chords*, so the smoother still drew straight lines. The fix introduces `GeometryUtils.flattenSmoothedPath`, which bakes the exact curve the renderer draws (mirroring `tracePath`'s native-cubic and midpoint-quadratic branches via the adaptive `sampleCubicBezier`) into a dense polyline *before* clipping, gated on the same `params.curves` predicate the renderer uses; clipped fragments are tagged `meta.straight` so they render verbatim and `pathToSvg` exports them without re-smoothing. A masked curve now traces the identical shape it has unmasked, only clipped. Replaces the removed linear-resample workaround. (RGR: `tests/integration/masking-curve-fidelity.test.js` asserts every masked point and edge-midpoint lies on the displayed curve across lissajous/spiral/rose, with a discrimination case proving the raw-clip path fails it; verified visually across the full `curves: true` family with max point deviation `0.0000`.)
- **Wallpaper gallery icons are now crisp and visually consistent.** The thumbnails were rendered into a 72×72 backing store and CSS-upscaled, so they were blurry on Retina; they now render at `size × devicePixelRatio` (clamped to 3×) with the context scaled, and the dataURL memo key includes dpr so a 1× render is never served to a 2× card. Framing is normalized: instead of zooming each group's tiled-output bounding box to fill the card (which made a 4-op and a 12-op group read at wildly different pitches), every icon now fits a **fixed lattice window** (2.5 tiles), so all cards share one on-screen pitch and ink density — differences read as genuine symmetry, not zoom. The reference motif is a single connected chiral polyline (the old L had detached strokes that vanished under dense overlap) placed on each group's **fundamental-domain centroid** so it never clips to nothing, and scaled to a fixed fraction of the tile. Stroke weight is a constant ~1.2px and the competing translucent-green background fill was removed so the card surface shows through cleanly.
- **Wallpaper icons are skin-aware, selectable, and never read as a swastika.** Icon strokes now use the resolved `--mp-type-color` token (passed through and folded into the cache key) instead of a hardcoded green, so they follow re-skins. The selected recipe/group card is now unmistakable — a glow ring, stronger tint, and a corner check badge, with `aria-pressed` reflecting the live config (a recipe lights up only when the mirror still matches it; otherwise the bare group card does). Critically, the reference motif was changed from a bent, straight-legged hook to a **curved spiral comma** — a 4-fold rotation turns a straight hook into a swastika but turns a curved arm into a harmless floral pinwheel.
- **Wallpaper info popovers rewritten for newcomers.** The Lattice / Rotation / Mirrors glossary popovers used to decode crystallographic notation (p/c/1/2/m/g) that is hidden by default, so they explained symbols the user never sees. They now describe, in plain language, what each control does to the artwork (lattice = the repeat grid; rotation order = how many turns match; mirrors = reflected vs slid-over copies), keyed to the chip labels the user actually sees.
- **Wallpaper recipe gallery curated to remove look-alikes.** Because icons are now canonical and scale-normalized, a recipe that was just "group X at default" looked identical to that group's card. Renamed the misleading names — **Herringbone → Switchback** (`pgg`), **Frieze March → Procession** (`pmg`), **Rolling Tide → Brick Path** (`pg`) — and removed recipes that duplicated a bare-group card or each other: Windowpane (≡ p4m), Hex Bloom (≡ p6m), one of the two near-identical `pgg` rectangles, and Pinwheel (the p4 "Quarter-Turn" group card now carries the diagonal pinwheel). Kaleidoscope (`p3m1`) and Star Anise (`p31m`) are tilted off-axis so they read distinctly from their bare Triangle Mirror / Triangle Edge group cards. The **Quarter-Turn (p4) group card** is presented and applied on a 45° diagonal so its icon matches what you get.
- **Tile-angle dial redesigned as a range gauge.** The dial previously reused the pattern-angle dial's full 0–360° compass mapping into a clamped tile-angle range, leaving roughly three-quarters of the dial dead (every drag snapped to an extreme). The tile-angle dial now maps the **top semicircle** onto the angle range: upright = 90° (a square/upright cell) and tilting the pin left/right skews the lattice toward 45°/135°. The whole top half is live; the pattern-angle dial keeps its true compass behaviour.
- **Crisp/Airy variant labels are now accurate per group.** The alternate-domain toggle was universally labelled "Crisp / Airy", but the v1 domain *opens* spacing for the 3-fold groups and p4g while it *overlaps copies into a denser weave* for the 6-fold groups. The 6-fold groups (p6, p6m) now read **Open / Woven** with matching copy; the others keep Crisp / Airy.
- **Wallpaper gallery icons are now canonical and stable (audit 2026-05-21).** The Styles-mode cards previously rendered each thumbnail from the layer's *live* `effectivePaths`, which already had the current wallpaper transform baked in — so applying any recipe recomputed that geometry and repainted **every** card on the next render, making the icons drift and compound with each click (and never reliably depict the named pattern). The cards now render a fixed reference motif under each group's own symmetry, so an icon is a stable, representative identity for its group/recipe regardless of layer state or click history. (`wallpaperSourcePaths` removed; gallery thumbs call `WallpaperPreview.render` with no `sourcePaths`.)
- **Wallpaper group labels are crisp titles, not sentences.** Card labels were derived by splitting the description on the first em-dash/period, which left several groups (p4g, p3m1, p31m) showing a full sentence as their title (e.g. p4g → "Quarter-turn rotations plus glide mirrors instead of straight ones"). An explicit short-label map now gives every group a scannable ≤3-word name (p4g → "Square Glide", p4m → "Square Mirror", p6 → "Snowflake", …); the full description survives as the tooltip and accessible name.
- **Build tile-angle range no longer silently clamps valid patterns.** The Tile angle slider/dial was capped at 60–120°, but recipes (Harlequin 55°, Diamond Trellis 50°) and the randomizer emit values below 60°. Touching the control in Build mode would snap the design up to 60°. The range is now 45–135° so every authored value is reproducible; the tile-angle dial also drops the meaningless 180°/270° tick marks carried over from the 0–360° pattern-angle dial.
- **Wallpaper gallery accessibility.** Style/recipe cards now expose `aria-pressed` state and an accessible name carrying the full description (previously hover-only via `title`, invisible to touch/keyboard/SR users); decorative thumbnails are `aria-hidden`; cards gain a visible `:focus-visible` ring; and the recipe sublabel now names the underlying symmetry (e.g. "Glide Grid") instead of the redundant word "Recipe". Tiny 8–9px sublabels/section headers were bumped for legibility/contrast.
- **Pen tool Alt-drag bezier authoring.** While dragging a newly placed bezier point, pressing and holding `Alt/Option` now freezes the mirrored handle at its current position and lets the active handle move freely with the pointer instead of deleting the mirrored handle.
- **`.vectura` open is now transactional (Bugs-9).** Both the standard open path (`UI.openVecturaFile`) and the Pattern Designer's `_applyVecturaPayload` now snapshot the live engine + SETTINGS state *before* applying any imported payload. If parsing, layer construction, or settings mutation throws partway through (corrupted file, invalid layer geometry, missing payload), the pre-import snapshot is restored via `applyState`, leaving the user on the project they had open instead of a half-loaded mix. History is only cleared *after* the new state installs cleanly, so a failed import no longer wipes the undo stack.
- **Imported numeric params are sanitized on load (Bugs-8).** `VectorEngine.importState` now recursively walks `layer.params` and replaces any value that should be numeric — driven both by the algorithm's declared default types in `ALGO_DEFAULTS` and a hard list of always-numeric globals (`posX`, `posY`, `scaleX`, `scaleY`, `rotation`, `seed`) — with a finite fallback whenever the imported value is `NaN`, `Infinity`, or a non-numeric string. Sanitization recurses into the nested `noises[]` / `imageEffects[]` stacks, mirrors the existing `strokeWidth` clamp pattern, and emits a `[Engine]` `console.warn` per clamp so legitimate-looking but invalid files are visible to developers without erroring out for end users. This stops NaN propagation through `p.scaleX`, `p.density`, `p.amplitude`, etc. into algorithm hot paths.
- **Modal hardening (audit Bugs-4).** The legacy `openModal()` no longer assigns untrusted HTML strings directly to `innerHTML`. String bodies are parsed into an inert `<template>` fragment, walked, and stripped of all `on*` event-handler attributes, `<script>`/`<style>`/`<iframe>`/`<object>`/`<embed>` subtrees, and `javascript:` URLs before insertion — preserving the formatting trusted callers (Help, Info, Color Picker, etc.) rely on while defanging the XSS sink the audit flagged. The modal now also installs an Esc-to-close listener on the document for the lifetime of the open modal (capture phase, won't fight nested overlays), a Tab/Shift+Tab focus trap on the modal card that cycles within its focusable descendants (and falls back to `tabindex="-1"` on the card itself when none are present), and a deterministic focus-restore on close that pins the activeElement back to the trigger that opened the modal. The two file-IO error toasts (`Invalid File` after a bad `.vectura` parse, `No Paths Found` after an SVG with no importable paths) were migrated to build their bodies as DOM nodes so they no longer round-trip through the sanitizer.
- **Pen color and width drags push exactly one undo step on commit (Bugs-3, v1.1.10 audit).** The Pens panel previously bound only `oninput` on the color picker and width slider, so each release left no undo point — drag the slider, let go, and there was nothing to revert. Both inputs now stash their pre-drag value on `pointerdown`/`focus`, update live during the drag (no history mutation), and on `change` (drag release / picker close) push a single history entry that snapshots the pre-drag state — matching the "push-before-change" convention used by the rest of the app and mirroring the transform-commit pattern at `app.js:111`.
- **`App.regen()` accepts an explicit `pushHistory` flag (Bugs-12, v1.1.10 audit).** The previous signature was a bare `regen()` that never touched history. Existing callers (~114 sites in panels/modals) follow the convention of calling `pushHistory()` *before* the param edit that triggers regen, so the default stays `{ pushHistory: false }` and no callers needed to change. User-initiated re-roll flows that *don't* edit params first can now opt in with `app.regen({ pushHistory: true })` to record an undo point for the generation change itself.

## 1.1.10 - 2026-05-20

Closes the Meridian cleanup chain that was tracked since the Meridian Blue migration merge. `_ui-legacy.js` and `styles.css` are both deleted; the `--color-*` → `--ui-*` token migration is complete; the `data-theme` root mirror is gone. All new CSS now lands exclusively in `src/ui/skin/`.

### Added
- **Pen tool — bezier handle editing in the reticule subtool.** Direct-select on a pen-drawn anchor now exposes draggable bezier handles with snap-to-origin (5 px screen-space) and handle collapse-to-anchor behavior. Pairs with the new close-drag snap-to-start gesture.
- **Direct-select — drag-to-merge anchor nodes.** Dragging an anchor on top of another anchor on the same path merges the two into a single anchor (Illustrator-parity). Also fixes a regression where `sourcePaths.meta.anchors` were silently dropped through Undo/Redo and `.vectura` save/load.
- **Topo algorithm icon** replaced with a new brand mark.

### Changed
- **Meridian cleanup chain — closed.** Twenty-plus refactor commits drain `_ui-legacy.js` into satellite modules and `styles.css` into `src/ui/skin/`, then delete both files. Highlights:
  - Units 1.5–1.10: extract wave/noise tables + NOISE_DEFS, pen workflow methods, modal mount primitives, 6 algorithm-specific methods, Document Setup input handlers, the remaining `bindGlobal` handlers, and the constructor body into satellite modules — then `git rm src/ui/_ui-legacy.js` and drop its `<script>` tag.
  - Units 2.1–2.7: drain Align/Pathfinder/Paint-Bucket, right-pane tabs + bottom-pane shell, wave/noise + step-dot + export-modal scaffold + info-popover, export-modal optimization cards, Layers V8 + algo dropdown + touch-tablet variants, Document Setup drawer + layer-bar palette picker, mobile shell + touch ergonomics + Pattern Designer, and the base/root + theme-toggle + chevron + tour + help-guide CSS into the skin layer — then `git rm styles.css` and drop its `<link>` tag.
  - Steps 3.1–3.3a: rewrite every `var(--color-*)` reference under `src/` to `var(--ui-*)`, inline the `classic-*.css` aliases, and delete the `--color-*` defaults from `components.css`.
  - Step 4.1: drop the `data-theme` root mirror attribute and its fallback read path.
- **Scaffolding files** (`AGENTS.md`, `CLAUDE.md`, `docs/skin-authoring.md`, `docs/a11y-audit-phase5.md`, `plans.md`, `README.md`) updated to reflect the deletions; the "new CSS lands in `styles.css`" guidance is replaced with skin-only authoring.

### Fixed
- **Scissor tool on closed pen paths.** Closing a pen path then dragging the scissor across it no longer produces a spurious extra split near the start anchor. Affected paths that had an exact-coincident start/end pair.
- **E2E harness — subagent termination.** Recurring subagent terminations during `npm run test:e2e` runs eliminated; the harness no longer reaps its own worker process under specific timing windows.

### Removed
- **`src/ui/_ui-legacy.js`** — drained and deleted (unit 1.10). The legacy `UI` constructor now lives in `src/ui/ui.js`; all behavior preserved.
- **`styles.css`** — drained and deleted (unit 2.7). All rules now live under `src/ui/skin/{tokens,motion,components,*-skin}.css`.
- **`--color-*` token aliases** removed from `components.css` and the classic skin files; `data-theme` root attribute mirror dropped from the runtime.

## 1.1.0 - 2026-05-19

### Added
- **Wallpaper mirror — universal Domain scale slider.** New 0.30–2.00× control on every wallpaper mirror scales the fundamental-domain clip polygon around its centroid before symmetry ops. Values <1 introduce gaps between symmetric copies (open-tile aesthetic), values >1 introduce overlap (woven aesthetic), 1.00 keeps exact tiling. Works uniformly across all 17 groups and serializes to `.vectura` alongside the other tile params. Double-click to reset.
- **Wallpaper mirror — v1 layout toggle for 5 groups.** p3, p3m1, p4g, p6, and p6m gain a `Tile layout` row in the mirror panel to switch between **v2 (exact tile)** — the new mathematically correct fundamental domain — and **v1 (classic spacing)** — the pre-1.1 layout that produces the canonical "alternating triangles" look of p3, the open spacing of p3m1/p4g, and the dense overlap of p6/p6m. Default is v2; the toggle composes with Domain scale.
- **Pathfinder panel — full Illustrator parity.** Multi-selection sidebar gains a collapsible `Pathfinder` section that exposes all ten Illustrator-style operations on 2+ selected layers: four **Shape Modes** (Unite, Minus Front, Intersect, Exclude) produce non-destructive compound shapes editable via the Shape Modes row plus an Expand button to bake; six **Pathfinders** (Divide, Trim, Merge, Crop, Outline, Minus Back) produce destructive baked output grouped under a new `pathfinder` group container. The mode toggle (Silhouette / Shape-Only) drives input geometry — Silhouette chord-closes open paths, Shape-Only restricts to closed shapes. Outline preserves source `strokeWidth` (Vectura divergence vs Illustrator's 0pt — plotter output needs a real width). Divide is capped at 8 input layers to avoid `2^n` cell explosion. Empty results are no-ops with a transient hint (no spurious history entries). Each op is undoable as a single history step. Section collapse state persists in `SETTINGS.uiSections.multiSelectionPathfinderOpen`.
- **Export Stroke Override toggle.** New switch in the Optimization panel sits above the Stroke (mm) slider and defaults to OFF. With the toggle off, the SVG export honors each pen's configured width as set in the Pens panel. Turn it on to surface the slider and apply a single uniform stroke across the whole document, overriding the per-pen widths. Persisted across sessions and `.vectura` saves.

### Fixed
- **Wallpaper groups — exact tiling restored for 9 of 17 groups.** `pmg`, `pgg`, `cmm`, `p4g`, `p3`, `p3m1`, `p31m`, `p6`, and `p6m` all previously failed to tile the cell correctly: misplaced glide axes routed multiple ops to the same quadrant (pmg, pgg), non-perpendicular mirror angles in cmm generated D₃ instead of D₂, lattice-equivalent duplicate ops in p4g left a 25% gap, and incorrect fundamental-domain sizes/shapes in the hex groups produced partial coverage (p3/p3m1: ~50%), ~3× overlap (p6), or asymmetric overlap (p31m, p6m). Each group now has exact 1.000 coverage with no op-pair overlap, verified by sampling the fund-domain images and checking the reduced-mod-lattice grid union. Old behavior of `p3`/`p3m1`/`p4g`/`p6`/`p6m` is preserved as a per-group v1 toggle for aesthetic continuity.
- **Pathfinder ops now respect panel layer order (panel-top = "front" of the stack).** Previously TRIM, MERGE, CROP, MINUS BACK, DIVIDE, UNITE, INTERSECT, and EXCLUDE treated the *bottom* of the layer panel as the front of the stack, so the layer at the top of the panel was the one getting trimmed / cropped away / having its color discarded — opposite of every Illustrator-style design tool. They now consistently use the Illustrator convention: the panel-top layer is the cookie cutter (Crop), the survivor (Minus Back), the layer that stays whole (Trim/Merge), and the appearance-donor (Divide cells, Unite/Intersect/Exclude compounds). MINUS FRONT is unchanged — it still keeps the bottom-of-panel layer, since "subtract the front" means the *back* survives.
- **Make-clipping-mask drag gesture now uses Shift instead of CMD/Ctrl.** macOS Chrome silently cancels the `drop` event whenever CMD is held throughout an HTML5 drag (the OS treats it as a system alias gesture), so the previous "CMD+drag a mask-capable layer onto another to mask it" UX never worked for real users despite passing all synthetic tests. Switching the modifier to Shift sidesteps the OS-level intercept entirely — Shift has no special drag interpretation on any platform. Updated in-app help and README to document the new gesture.

### Changed
- **Mirror controls extracted to a dedicated panel module.** The 320-line `buildMirrorModifierControls()` method previously embedded in `_ui-legacy.js` is now `src/ui/panels/mirror-panel.js`, registered in `index.html` and called via `window.Vectura.UI.MirrorPanel.build(ctx, layer, container)`. The old call site in `algo-config-panel.js` and the integration test that exercised the legacy entry point have been updated. Behavior is unchanged; the new module is the home for all wallpaper-mirror controls including the new Domain scale and Tile layout switches.
- **Document Setup drawer rebuilt against the Meridian skin component vocabulary.** The slide-out File ▸ Document Setup pane now uses `.sect`/`.sect-hdr`/`.sect-body` (with the 3 px accent rail + chevron disclosure that the rest of the app uses), `.ctrl-sel`, `.num-step` (with ± hit targets), `.seg-ctrl` for orientation/units, `.value-chip` for color pills, and `.ctrl-slider` for line-weight inputs. Settings reorganised into nine collapsible sections — Theme, Paper, Crop & Outside, Margin Outline, Guides & Display, Background & Selection, Plotter Physics, Layer Bar Colors, History & Preferences — all open on first reveal so no controls move out of sight. Every `#set-*` id is preserved verbatim, so the ~30 inline handlers in `_ui-legacy.js` `bindGlobal()` keep wiring without modification.
- **Document Setup close button** is now a circular outlined left-facing chevron in the upper-right of the drawer header (matching the visual register of the side-pane collapse handles), replacing the previous `✕` glyph which was inheriting the legacy `.pane-toggle` absolute-positioning and floating midway up the panel.

## 1.0.0 - 2026-05-08

First stable release. The 0.x series shipped 13+ generative algorithms, the Petalis editor, mirror modifiers, layer nesting + masking, plotter-grade SVG export, and a Noise Rack. The 1.0 line draws a stake around a polished, accessible, themable Studio: six skins across two families, a rebuilt onboarding tour, an extensible UI architecture, and reduced-motion + keyboard-a11y compliance. From here on, breaking changes follow semver.

### Added
- **Welcome screen "take the tour" CTA.** Gradient ghost button on the welcome panel kicks off the onboarding tour from a cold start.
- **Toolbar dock-and-drag restore.** Grabbing a docked toolbar's drag handle now anchors the handle directly under the cursor — no snap-to-default-corner, no jump from float-vs-docked dimension shifts, no clamp at viewport edges. New regression test pins this behavior.

### Fixed
- **Mirror children unlock when their parent is deleted.** Auto-locked children that survive a mirror-modifier deletion are now restored to an editable state instead of remaining locked with no visible parent.
- **Manual version bumps no longer get double-stomped.** The PreToolUse Bash hook that auto-patches the version on commit now skips if `package.json` is already staged or if the commit only touches docs/hooks.
- **Theme toggle no longer leaves canvas on the wrong dark color** after cycling dark → lark → light → dark.
- **GitHub Pages deploy was missing `_ui-legacy.js`** — Jekyll silently strips files prefixed with `_`, so the bare GH Pages serve returned 404 and the script load chain halted, leaving the toolbar collapsed and menus dead. Added `.nojekyll` at the repo root to disable Jekyll processing.
- **Toolbar flicker on initial paint.** The empty `#tool-bar` div briefly rendered as a small rounded shape before JS populated it. Hidden via `.tool-bar:empty { visibility: hidden; }` so it only appears once children are mounted.
- **Left/right pane flicker and snap on page load** eliminated.
- **Toolbar subtool submenus** were getting clipped by an `overflow: hidden` ancestor; now portaled out so they render above the workspace.

### Changed
- **Onboarding tour rebuilt around an extensible step engine.** Visual primitives (highlight, dashed circles, popover positioning), action helpers (open menus, expand sections), and completion factories (`When.layerOfType`, `When.clickMatches`, `When.elementVisible`, …) are now cleanly separated, and steps may declare multiple in-place `phases` so a single visible step can guide the user through a multi-stage interaction. Adding a new step is data-only.
- **Tour content revamped.** Step 1 teaches press-and-hold algorithm selection (Rings) and waits for the user to draw — its final "double-click the canvas" phase anchors the popover above the viewport pointing down. Step 2 introduces the Algorithm-panel dropdown for swapping generators on an existing layer. Step 3 notes that **Randomize Params** lives at the **top** of the Algorithm Configuration pane. Step 4 covers layer nesting + Mask. Step 5 first highlights **+ Add Layer**, then the **Mirror Modifier Group** entry. Step 6 parks the popover over the Modifier panel so the canvas is free for the user to drag/rotate the mirror axis. Step 7 highlights **Save Project** and **Export SVG** within the auto-opened File menu.
- **Tutorial popover is draggable on play-around steps** (`movable: true`). Pull it from the title bar to move it out of the way without dismissing the tour. User-positioned coordinates persist across phases of the same step and reset on the next step.
- **Mirror modifier auto-locks its children on entry.** Layers that are wrapped by a mirror, dropped into a mirror group, or added under a selected mirror are now automatically marked locked so they cannot be nudged off-axis. The lock can still be removed individually from the layer list.
- **Disclosure chevrons unified** on the Lucide `chevron-down` glyph with directional rotation, replacing a mix of triangles and ad-hoc SVGs.
- **Internal `_ui-legacy.js` drained of ~100 delegator stubs** across panels, persistence, shell satellites, pens panel, pane-left, export-svg, modals, shortcuts, and grouping methods (now home in `layers-panel.js`). Continues the Meridian Blue UI architecture refactor toward eventual deletion of `_ui-legacy.js`.

### Inherited from 0.9.10 (rolled forward into 1.0.0 highlights)
- **Meridian Blue skin family** — three new skins (`meridian-dark`, `meridian-lark`, `meridian-light`) with Space Grotesk + JetBrains Mono typography, tighter pane geometry, slider/dial release halos, and family-scoped petal/pattern designer chrome. Plus indeterminate progress bar, empty-state SVG illustrations, the skin-authoring SDK (`npm run skin:new -- <id>`), and the reduced-motion + keyboard-a11y compliance audits.

## 0.9.10 - 2026-05-07

### Added
- **Meridian Blue skin family.** Three new skins (`meridian-dark`, `meridian-lark`, `meridian-light`) sourced from `themes-mockup.html`. Selected via the Modern/Classic toggle in Document Setup → Theme; the existing `dark`/`lark`/`light` cycle stays within the active family. Space Grotesk + JetBrains Mono typography, tighter pane geometry (290/258px panes, 30px row height), slider/dial release halos, family-scoped petal/pattern designer chrome, and indeterminate progress bar wired into save / SVG export / engine generations exceeding ~200 ms.
- **Skin-authoring SDK.** `npm run skin:new -- <id>` scaffolds a new skin from `src/ui/skin/_template.css`. Generator validates id format (lowercase kebab-case), refuses overwrite without `--force`, and prints the manifest snippet ready to paste into `src/config/defaults.js`. Full guide at `docs/skin-authoring.md`. New skins ship with one CSS file + one manifest entry — zero JavaScript edits.
- **Empty-state SVG illustrations** in the layer list and pattern fill panel via `UI.overlays.EmptyState` + `UI.EmptyStates`. Monochrome, sourced from `--ui-muted` so they re-skin automatically.
- **Indeterminate progress bar** primitive (`UI.overlays.ProgressBar`) with a stack model so concurrent jobs share one physical bar. Reduced-motion fallback collapses the animation and renders a static 100% bar at 0.55 opacity.
- **`vectura:skin-change` event.** Dispatched after `applyTheme` swaps the active stylesheet (one rAF later). Renderer cache + dial-wave halos refresh on this event. Payload: `{ id, family, manifest, prevId }`.
- **Reduced-motion compliance pass** scripted in `tests/unit/skin/reduced-motion-compliance.test.js`. Every keyframe in `motion.css` has a paired `prefers-reduced-motion: reduce` fallback; styles.css ships the universal `*, *::before, *::after` guard collapsing animations + transitions to ≤0.01ms.
- **Keyboard a11y audit** scripted in `tests/unit/skin/keyboard-a11y-audit.test.js`. Manual audit results in `docs/a11y-audit-phase5.md` covering 20 surfaces (modals, menus, designers, components). Focus-trapping primitives (Modal, Menu) handle Escape directly; keyboard-capturing components cancel via Escape.

### Changed
- **UI architecture refactor.** The 16,288-line `src/ui/ui.js` split into ~60 satellite modules under `src/ui/{shell,panels,components,overlays,modals,menus,skin}` while keeping the legacy class as a thin orchestrator. The DI-bag `bind(deps)` pattern is the locked extraction contract. `src/ui/_ui-legacy.js` (~8,300 lines) remains on disk during the transition; deletion is the final cleanup task tracked in the Phase 5 closure notes.
- **Renderer's `getThemeToken` cache** now resolves both `--ui-*` and legacy `--color-*` aliases for cross-skin compatibility. Cache is invalidated on `vectura:skin-change`.
- **Skin manifests** (in `window.Vectura.THEMES`) extended with `family`, `paneLeftWidth`, `paneRightWidth`, `bottomPaneHeight`, `rowHeight`, `motion`, `capabilities`, `colorScheme`, `metaThemeColor`, `documentBg`, `pen1Color`, `stylesheet` fields. Backward-compatible — classic skins inherit defaults via `CLASSIC_MANIFEST`.

## 0.9.0 - 2026-05-05

### Added
- **Mirror modifier "Expand to Folder"**: each mirrored output path becomes an individually editable shape layer inside a regular folder, preserving all source styling (pen, color, stroke width).
- **Mirror-axis path joining on expand**: pairs of paths that share an endpoint on the mirror axis are automatically joined into a single continuous path, eliminating pen lifts at axis crossings. Handles the three topologies that arise from `splitPathByAxis` — both-end (most common), end-start, and both-start — using a 0.5-unit proximity tolerance well above floating-point error.
- **Layer grouping and ungrouping** via the layer panel action menu: multiple selected layers group into a new folder; a selected group's children can be promoted back to the parent level.
- **Add Layer ▾ → Mirror Modifier Group now wraps the current selection** by default, matching `Insert > Mirror Modifier`. Both entry points now route through `insertMirrorModifier()`.

### Changed
- **Scissor/cut tool icons** redesigned using Lucide `slice`, `square-scissors`, and `circle-scissors` for clearer subtool distinction.
- **Pattern fill and terrain tool icons** updated for improved visual clarity.
- **Trash and mask-source-active icons** refreshed for design consistency.

## 0.8.27 - 2026-05-05

### Added
- **Custom canvas cursors** for the four primary tools. Selection (V) shows a filled black arrow, Direct Selection (A) an outline-only arrow, and Pen (P) a fountain-pen tip — each via SVG-as-cursor data URLs. Fill (F) hides the system cursor in favor of a DOM overlay (see below).
- **Fill loupe overlay.** When the Fill tool is active, the canvas shows a paint-bucket icon anchored to the cursor with a fill-point dot, plus a 96 px circular magnifier (~4× zoom) of the canvas pixels under the cursor. The magnifier auto-flips between quadrants relative to the cursor so it stays inside the canvas viewport when the cursor is near an edge.
- **Line shape primitive** (`shape-line`, keyboard `U`). Drag two endpoints; Shift snaps the angle to multiples of 45°. Emitted as an open two-anchor path (`closed: false`) and routed through the existing shape draft / commit / direct-select pipeline.
- **Algorithm-submenu hover styling now matches the toolbar's active-tool blue** (`#38bdf8` border + `rgba(56,189,248,0.12)` background), unifying the focus-cue across the two menus.

### Changed
- **Toolbar consolidation.** Rectangle, Oval, Line, and Polygon are now subtools of a single long-press group button (`data-tool="shape"`) that mirrors the Selection group's UX: single-tap activates the most-recently-used variant; long-press (280 ms) opens the variant submenu. The three previously-flat shape buttons are gone. Existing M / L / Y shortcuts still pick rect / oval / polygon; new `U` picks line. The active variant is persisted to `SETTINGS.shapeMode` and reflected as the parent button's icon.

## 0.8.24 - 2026-05-05

### Security
- **Fixed XSS via imported SVG pattern tile.** The Pattern Designer's tile-import path stored raw user SVG into `draftMeta.svg` without sanitizing event handlers; later `innerHTML` use during pattern validation could execute `<image onerror=...>`, `<animate onbegin=...>`, `<script>`, and `javascript:` href payloads. New shared `Vectura.SvgSanitize.sanitize()` strips `<script>`, `<foreignObject>`, all `on*` attributes, and rewrites `javascript:` `href`/`xlink:href`. Wired into both the Pattern Designer import path and the file-open SVG path (replacing the narrower inline `stripEventHandlers` in `ui-file-io.js`). Eight new regression cases in `tests/unit/security_xss.test.js`.
- Replaced two silent `} catch {}` blocks in `pattern.js` (boundary trace, path sampling) with `console.warn('[Pattern] …', err)` so previously-masked failures now surface.

### Fixed
- **`.vectura` save/load now preserves `layer.origin`.** Engine `exportState`/`importState` previously omitted origin; the field is read by transform math in the renderer, so scale and rotation could drift across a save/load cycle. Origin is now serialized (cloned) and restored, with a `{x:0, y:0}` default for back-compat with files saved before this version.
- Fixed precision loss in `worldToSourcePoint` for layers with `|scaleX|` or `|scaleY|` < 1e-6: the inverse-transform fallback no longer collapses to `1` (which broke true inversion); it now uses a sign-preserving `1e-6` clamp so tiny-but-nonzero scales remain orientation-correct.

### Changed
- **Engine layer mutations are now encapsulated.** Added `VectorEngine.reorderLayers()`, `deleteLayersById()`, and `setActiveLayerId()` with input validation and warn-on-invalid behavior. UI callsites that previously assigned directly to `engine.layers` / `engine.activeLayerId` (delete-layer, group/ungroup, mirror modifier insertion) now route through these methods.
- **`topo`, `phylla`, and `terrain` algorithms migrated off legacy noise stacks** to the shared `NoiseRack.defaultConfigFor(algorithmId, params)` helper, completing the AGENTS.md "universal noise" discipline for these algorithms (`flowfield`, `grid`, `rings`, `horizon` still pending). Visual baselines unchanged — defaults are byte-identical to the prior inline `legacyNoise` shapes.
- **Algorithm tuning constants extracted** to a new `src/config/algorithm-tuning.js` registry exposed as `Vectura.AlgorithmTuning`. Rainfall (`noiseScale`, `gustScale`, `spiralFactor`, `paddingMax`) and Wavetable (`defaultZoom`) now read from config instead of inlined literals; rainfall's hex tile ratio is now `Math.sqrt(3)/2` (precision gain, no baseline drift in current coverage).
- **Math utilities deduplicated.** New `src/core/algorithm-utils.js` exposes `Vectura.AlgorithmUtils.{clamp, clamp01, lerp, frac, applyPad}`; ~26 inline duplicates removed across 18 files (engine, renderer, modifiers, noise-rack, several UI mixins, and most algorithms). `applyTile` deliberately left inline per algorithm — its semantics diverge meaningfully across rainfall / wavetable / topo / spiral and a single canonical version would alter rendering.

## 0.8.20 - 2026-05-05

### Changed
- Layer cards now render at roughly 2× scale on touch tablets (iPad portrait and landscape) for finger-friendly interaction. Row heights, icon buttons, color dot, algorithm icon, and layer/group label text all enlarge; eye and lock buttons reach 40×40, action buttons 36×36. Targeted via `(pointer: coarse) and (min-width: 600px)` so phones and desktop are unchanged.
- Consolidated UI inline-SVG icons into a single registry at `src/ui/icons.js` exposing `Vectura.Icons.{layer,tool,misc}`. The 34-icon layer-panel set (previously inlined inside `ui.js`) and the 23-icon Petal Designer toolbar set (previously inlined inside `ui-petal-designer.js`) now live in one dedicated module, plus the formerly stray ring icon used for algorithm param-group headers. Pure refactor — no visual change, no API surface change for callers (`this._LVL_I` and the toolbar `renderIcon()` wrapper still work as before). Static `<svg>` literals in `index.html` (theme toggle, layer-search/filter/plus) were intentionally left alone since they render before JS loads.

## 0.8.0 - 2026-05-04

### Added
- Added **Lark theme**: a dark UI with a white canvas, purpose-built for a plotter-on-paper workflow. Accessible via the global theme toggle introduced in 0.7.0.
- Added **Algorithm Drawing Tool** with a dedicated submenu for quick access to algorithm-specific drawing actions.

### Changed
- Enhanced layer removal and modifier handling to correctly propagate mask state, preventing orphaned mask references when layers or modifiers are deleted.
- Exported wallpaper-groups utilities to the `window.Vectura` namespace for downstream use.
- Algorithm panels (module selector and configuration) are now hidden when a non-modifier group layer is selected, reducing visual clutter.
- Fixed bottom pane collapse/expand toggle icon rotation (was 90°, now 180°).
- Refactored engine and UI code for improved readability and maintainability.

### Fixed
- Fixed XSS vulnerability: user-controlled strings in modal error bodies are now properly escaped.
- Fixed missing `wallpaper-groups.js` module that caused CI failures.

## 0.7.0 - 2026-05-03

### Added
- Added a new **Terrain** algorithm focused on realistic plotter-ready terrain. Heightfield-driven scanlines under a selectable perspective (`Top-down`, `One-point`, `Two-point`, or `Isometric`), with native generators for ridged-multifractal mountains, V/U-profile valleys (sinuous axis, configurable count/depth/width/meander), steepest-descent rivers that carve into the heightfield, and an ocean clamp with optional marching-squares coastline contour. Hidden-line removal via per-column screen envelope. Shipping with six style presets — `Alpine Range`, `Rolling Hills`, `Canyon Mesa`, `Archipelago`, `River Delta`, `Tundra Flats` — and full Noise Rack integration for layering arbitrary additional displacement. Coexists with `Horizon` (which keeps its synthwave specialty).

### Changed
- Horizon out-of-the-box scene now ships with the mountain surface enabled and the Additional Noises rack empty (was opt-in mountain + a phantom rack layer with amplitude 0). New users see the algorithm's signature draped-mountain look immediately, and adding noise is an explicit action with no clutter to remove first.
- Horizon's mountain noise is now perfectly Y-coherent (`MOUNTAIN_Y_COHERENCE = 0`): every horizontal row samples the same mountain X-profile, so adjacent rows stack as vertical-translation copies of one underlying silhouette and visibly drape over the surface as a wireframe — no more loose per-row wobble. Per-row amplitude still tapers toward the horizon via `Skyline Relief`. Rack noise keeps its independent-per-row behavior so users can still add deliberate non-draped variation.
- Horizon (Terrain) parameter surface consolidated for clarity: `Depth Compression` is renamed to `Terrain Depth` and inverted (high = more rows pushed into the foreground; default 30 preserves the prior look). The Terrain Form `centerWidth`/`corridorSoftness`/`shoulderCurve`/`valleyProfile` cluster and the standalone `Center Dampening` group are merged into a single `Center Region` panel with one `Width`, one `Edge Softness`, and one `Compress at Horizon` driving both the heightfield profile and the noise mask. `Symmetry Blend` becomes `Noise Mirror` and lives under Terrain Noise (where it actually belongs). Mountain noise drops `Mountain Zoom`, `Mountain Frequency`, and `Mountain Seed` — the built-in surface is now controlled by `Mountain Amplitude` alone, with seed shared from the global Seed slider. Net: ~26 user-facing knobs collapsed to 15 with no loss of expressive range for typical scenes. Old `.vectura` projects load unchanged via the default-spread; removed fine controls fall back to the unified defaults.

### Fixed
- Horizon no longer draws a perfectly flat line across the canvas at the vanishing-point Y. The previous spacing put the topmost row exactly on the horizon (`t_raw = 0` → `rowY = horizonY`), which made the horizon line itself a visible artifact regardless of terrain settings. Rows are now distributed in the half-open interval `(0, 1]` (nearest row at the ground, farthest a small step in front of the horizon, never on it). Three Horizon visual baselines were regenerated.
- Horizon's `Additional Noises` rack now renders added noise layers in the panel. Previously the shared `ensureWavetableNoises` helper allow-listed only `wavetable`/`rainfall`/`terrain` and silently returned an empty array for `horizon`, so any added rack layer was invisible (and unreachable for editing) even though it was stored on the layer.
- Horizon (Terrain) parameter directions and wiring now match their labels: `Center Depth` carves a valley downward (was inverted into a ridge), `Shoulder Lift` and `Ridge Sharpness` raise terrain upward (were pushing it down), `Skyline Relief` attenuates the full terrain expression toward the horizon so the slider has a visible effect even when noise is off, and the convergence/fan lines now follow the displaced terrain instead of staying perfectly straight when terrain shape is active. `Floor Height` becomes a bidirectional Y offset (range -100..100, default 0) — useful for compensating downward when noise bulges push rows up. Additional Noises in the noise rack now displace the terrain regardless of the `Enable Terrain Noise` master toggle (the master toggle still gates the built-in mountain noise). Visual baselines `horizon-valley.svg`, `horizon-shoulders.svg`, and `horizon-flat-grid.svg` were regenerated to match.

### Changed
- Horizon mountain noise now skins coherently across rows by anchoring the noise depth-axis to the horizon, so adjacent rows sample nearly the same lateral mountain profile. `Mountain Amplitude` can now be pushed well above 5 without rows tangling, and the grid stays evenly draped over the mountain surface. Visual baselines `horizon-valley.svg` and `horizon-shoulders.svg` were regenerated to match.
- Added a `Compress at Horizon` sub-control under `Center Dampening` (range 0–100, default 0). At 100 the dampened band tapers to zero width at the horizon line, forming an upward-pointing triangular mask anchored at the vanishing point; existing softness and falloff still shape the per-row edges.
- Horizon now starts as a clean perspective grid by default. Terrain noise is opt-in via the new `Enable Terrain Noise` toggle, which exposes a built-in mountain noise (amplitude/zoom/seed) plus a `Center Dampening` group that attenuates the mountain toward the vanishing point with width, softness, and falloff sub-controls. The existing per-layer noise rack is retained as `Additional Noises` for layering extra noise on top of the mountain.

### Added
- Added a global dark/light theme toggle in the header, with full-shell CSS-variable theming across panes, menus, modals, tool chrome, helper widgets, and canvas surround.
- Added `Insert > Mirror Modifier`, a new modifier-container layer type that behaves like a group in the Layers panel while applying a sequential mirror-axis stack to its child layers.
- Added mirror-guide canvas overlays with dashed full-canvas axes, reflection-direction triangles, separate rotate handles, and per-axis/stack show-hide, lock, reorder, and delete controls.
- Added unit, integration, and Playwright coverage for mirror modifier geometry, state roundtrip, and the new Insert-menu workflow.
- Added Illustrator-style Rectangle (`M`), Oval (`L`), and Polygon (`Y`) shape tools that create editable `expanded` layers, including polygon side-count changes during draft and shape-aware corner-rounding handles.
- Added export coverage for masked shape geometry with `Remove Hidden Geometry` enabled and disabled, plus focused unit/browser tests for shape creation flows.
- Added Illustrator-style parent-mask coverage so visible mask parents clip their full descendant subtree on canvas and in SVG export.
- Added a `Hide Mask Layer` option on mask parents so the parent can keep clipping descendants while suppressing its own visible artwork on canvas and in export.
- Added a document-level Metric/Imperial unit switch in Document Setup, unit-aware paper/margin/stroke/tolerance controls, an optional blueprint-style document-dimension readout outside the canvas, and a `Clear Saved Preferences` action for cookie-backed UI state.
- Added unit, integration, Playwright, and screenshot coverage for document-unit conversion, clearing saved preferences, Document Setup shortcut toggling, multi-layer Line Sort scoping, and the new outside-canvas dimension labels.
- Added an Illustrator-style Export SVG modal with a large left-side preview, right-side export settings, bottom-right actions, and preview zoom/pan controls.
- Added representative Playwright source-fidelity coverage for fill-built Pattern tiles: the harness now scans the full pattern catalog to pick compound-fill archetypes, keeps `Autumn` seam fidelity as an expected-fail regression, and tracks representative tile-silhouette mismatches for known-bad patterns like `Autumn`, `Bamboo`, and `Bank Note` without breaking the suite.
- Added a runtime custom Pattern registry with local-library plus project-carried custom tiles, `.vectura` round-trip support for saved custom patterns, inline `Import SVG Tile` / `Save Pattern` / `Load Saved` actions in the Pattern Texture Designer, and a live `3x3` seam-validation preview that blocks saving invalid imported tiles.
- Added unit coverage for custom-pattern registry/validation flows and Playwright coverage for invalid-tile save blocking plus custom-pattern project round-tripping.
- Added shared toolbar generation in `ui.js` so the main canvas, Petal Designer, and Texture Designer all render from one configurable tool-definition registry, and expanded the shared tool set with `Fill` and `Erase Fill`.
- Added nested-region Texture Designer fill targeting, drag-pour fill/erase behavior, `Alt/Option` temporary erase while filling, and a `Show Gaps` slider with yellow preview markers plus auto-close actions for closable seam-endpoint gaps.

### Changed
- Corrected polygon Noise Rack zoom semantics so larger values now produce a larger polygon footprint across shared and algorithm-local samplers, and normalized vertical-displacement sign so positive amplitudes lift line stacks upward while negative amplitudes push them downward.
- Fixed Wavetable `Isometric` so `Line Gap` now scales the visible cell spacing from one shared lattice model, `Row Shift` shears the full lattice instead of leaving diagonal families behind, and added deterministic plus SVG-baseline regressions for the corrected behavior.
- Fixed the stale Export SVG smoke test path so CI now forces a real Line Sort off-to-on transition before asserting preview promotion, matching the current default-enabled Line Sort setting instead of relying on a no-op checkbox `check()`.
- Reclassified the remaining Pattern smoke failures as real renderer/import fidelity bugs rather than expected test drift; `Autumn` seam continuity and representative Hero fill-built silhouette mismatches remain open product issues.
- Fixed fill-built Pattern SVG extraction so the renderer now traces the visible filled silhouette instead of outlining every overlapping subpath independently, and tightened seam-chain reconnection so `Autumn`'s standard-grid tile joins stay vertically paired instead of producing irregular cross-seam diagonals. Added unit and Playwright regressions for the fill-boundary and seam-pairing cases.
- Fixed Pattern-layer texture initialization so the inline Texture Designer now renders the effective default texture immediately, including the initial `4 Point Stars` fallback case before any manual reselection.
- Moved the inline Pattern `Texture Designer` directly below the texture selection grid and above the `Scale` control.
- Moved export and optimization controls out of Document Setup into the Export SVG modal, while keeping export behavior dictated strictly by the existing `SETTINGS` and layer optimization state.
- Fixed the Export SVG modal `Line Sort` preview so its overlay mode, legend colors, and line-thickness styling stay local to the modal; the primary canvas no longer picks up export-preview overlay/legend state, and cancel leaves no preview residue behind.
- Tightened Export SVG optimization-card header layout so section-level info icons sit directly to the right of their header titles instead of drifting in the header row.
- Fixed Export SVG section-header info buttons to bind to the actual header label span instead of the drag-grip dot spans, so the `(i)` control now renders beside the header text.
- Adjusted Export SVG section-header info buttons to render as siblings immediately after the title span, matching the exact `Title (i)` order instead of nesting the button inside the title span.
- Fixed Export SVG section-header info panes to open below the full title bar instead of inside the header row, while keeping field-level info panes attached to their own controls.
- Added `Truncate Start` and `Truncate End` sliders to `Lissajous`, both defaulting to `0%`, and changed `Close Lines` to default off so endpoint shortening can be dialed in before any tail-closing pass.
- Changed `Lissajous` `Close Lines` to trim loose endpoint tails back to deterministic self-intersection cutpoints instead of hard-closing the path to its first sample, with focused unit coverage for trimmed and untouched cases.
- Fixed snapshot-based Undo/Redo for document-mutating layer-structure edits so grouping, reparenting, masking, modifier/container edits, and structural selection restore now roundtrip correctly with Redo instead of only restoring the pre-edit state.
- Switching dark/light theme now updates the document background default and flips `Pen 1` between white and black, propagating the pen color to existing `pen-1` layers while keeping theme as a personal cookie-backed preference instead of project state.
- Fixed direct-edited circle mask parents so descendant clipping now follows the edited outline immediately instead of continuing to use stale circle metadata, with runtime and Playwright regressions to keep mask edits in sync.
- Fixed `Export Optimized` so masked exports no longer implicitly remove hidden geometry when `Remove Hidden Geometry` is off; optimized SVG export now preserves full source geometry and applies ancestor clip paths non-destructively.
- Removed the duplicate top-level `Remove Hidden Geometry` checkbox from Document Setup so the Export Settings card is the single UI control for that export-only setting, with regression coverage for its default-on behavior.
- `Cmd/Ctrl + K` now toggles Document Setup open and closed instead of only opening it.
- Fixed `Line Sort` so multi-layer `selected` and `all` optimization scopes keep a shared sort order across preview, stats, overlay rendering, and optimized SVG export instead of silently falling back to per-layer sorting.
- The engine now computes modifier-aware effective geometry before display, masking, optimization, stats, and export so mirrored child layers render and export consistently.
- Mirror-masked closed shapes now stay valid silhouette providers, so masked children under a Mirror Modifier clip against the mirrored closed mask union instead of disappearing when the mask produces multiple disjoint silhouettes.
- Left-panel controls now switch between `Algorithm` and `Modifier` modes, hiding `Transform & Seed` for modifier containers and exposing Mirror Stack configuration instead.
- Mirror Modifier children can now be dragged back out to the root to unparent them, deleting a modifier dissolves only the wrapper and preserves its children, and `+ Add` under a selected modifier creates a normal drawable child instead of a bogus `mirror` layer.
- Mirror Modifier children now stay fully editable when selected, so nested child rows switch the left panel back to normal `Algorithm` controls and can still change algorithm, settings, and transforms while inheriting the mirror effect from their parent modifier.
- Rectangle and Polygon shape-tool layers now start with straight-edge primitive rendering instead of inheriting `Curves` from the previously selected layer, and rotated primitive selections keep their bounds plus corner-rounding handles aligned to the transformed shape geometry.
- Fixed algorithm switching so changing a generator layer type clears stale manual-geometry contamination, regenerates the artboard immediately, and stays covered by integration plus Playwright geometry regressions.
- Mask-parent move/resize/rotate drags now ghost-preview the masked descendant subtree against the transformed silhouette until mouse release.
- Rectangle, Oval, and Polygon creation plus single-shape Selection now use an Illustrator-style reticle cursor while keeping existing handle, drag, and center-out `Alt/Option` behaviors intact.
- Added `Remove Hidden Geometry` to `Document Setup > Export Settings`, defaulting it on so exported SVGs can destructively trim masked and frame-hidden geometry to match the current visible frame while still allowing non-destructive clip-path export when turned off.
- Replaced the old source-layer clipping workflow with Illustrator-style parent masks: mask state now lives on the visible parent, descendant layers are indented beneath it, legacy `sourceIds` masks are cleared on load, and export clip paths are derived from ancestor mask silhouettes instead of arbitrary source lists.
- Fixed `Remove Hidden Geometry` export to correctly clip ancestor-masked layers; the export now uses `displayMaskActive` (matching the canvas renderer) instead of `layer.mask?.enabled`, so child layers clipped by a parent mask are properly trimmed on export.
- Improved accessibility across all UI: theme-aware canvas reticle cursor, `prefers-reduced-motion` support, `aria-live` on notification toasts, modal focus management, `aria-pressed`/`aria-current`/`aria-expanded` on interactive controls, visible focus rings, and a minimum 11 px text-size floor.
- Changed Pattern-layer fill records to store normalized multi-region targets instead of only raw single-loop polygons, which lets the Texture Designer distinguish inner fills from outer-minus-hole rings and preserve those targets through save/load.

## 0.6.80 - 2026-03-01

### Changed
- Relaxed the post-occlusion reconnect rule so verticals can reappear after passing behind a ridge, which fixes missing visible fan lines on the saved broken masking fixture.

## 0.6.79 - 2026-03-01

### Changed

## 0.6.78 - 2026-03-01

### Changed
- Fixed the Layers-panel `Clip` trigger so the clipping-mask popover opens reliably from the layer rows in the saved masking-scene workflow.

## 0.6.77 - 2026-03-01

### Changed
- Tightened the Layers-panel clipping control with a more obvious `Clip` action and kept masking interactions scoped to the layer list workflow.

### Added
- Added a screenshot-based Playwright regression that loads the checked-in `broken-masking.vectura` fixture and snapshots the real saved masking case.

## 0.6.76 - 2026-03-01

### Changed

## 0.6.75 - 2026-03-01

### Changed
- Re-verified the saved broken masking scene against a fresh browser render so clipping masks terminate behind the visible terrain contour instead of bleeding through the landscape shoulders.

### Added

### Changed
- Kept masking workflow in the Layers panel only and tightened the masking popover styling/labels around a more familiar clipping-mask interaction.
- Added `id`/`name` wiring to the masking editor checkboxes so the masking controls no longer contribute anonymous form fields.

## 0.6.74 - 2026-03-01

### Added

### Changed
- Kept masking workflow in the Layers panel only and tightened the masking popover styling/labels around a more familiar clipping-mask interaction.
- Added `id`/`name` wiring to the masking editor checkboxes so the masking controls no longer contribute anonymous form fields.

## 0.6.73 - 2026-03-01

### Added

### Changed
- Added `id`/`name` wiring to the new masking editor checkboxes so the masking controls no longer contribute anonymous form fields.
## 0.6.72 - 2026-03-01

### Added
- Live non-destructive layer masking for silhouette-capable layers, including layer-row `Mask` controls, mirrored left-panel masking controls, and `Convert To Geometry` materialization into expanded lines.
- A new masking/display-geometry stage in the engine with `src/core/masking.js` and `src/core/path-boolean.js`.
- Unit coverage for masking silhouette eligibility, mask subtraction, and engine-level masked display geometry.

### Changed

## 0.6.71 - 2026-03-01

### Changed

## 0.6.70 - 2026-03-01

### Changed

## 0.6.69 - 2026-03-01

### Changed

## 0.6.68 - 2026-03-01

### Added

### Changed
- Full `Vanishing Pull` now behaves more like a true convergence-to-point control, while `Fan Reach` handles bottom/side coverage.

## 0.6.67 - 2026-03-01

### Changed

## 0.6.66 - 2026-03-01

### Changed

## 0.6.65 - 2026-03-01

### Changed
- Clarified the `Noise Angle` and `Line Offset Angle` help text to distinguish field rotation from displacement direction.

## 0.6.64 - 2026-03-01

### Added

### Changed

## 0.6.63 - 2026-03-01

### Added

### Changed

## 0.6.62 - 2026-03-01

### Changed

## 0.6.61 - 2026-03-01

### Added

### Changed

## 0.6.60 - 2026-03-01

### Changed
- Petal Designer overlay picking now selects the visible inactive shape when you click its silhouette, and the `Inner Shape` / `Outer Shape` profile editor cards now act as explicit selection targets.

### Added

## 0.6.59 - 2026-02-28

### Changed
- Replaced the remaining one-off Petalis modifier noise sliders with nested Noise Rack stacks in the main Petalis controls and the Petal Designer modifier cards.
- Kept legacy `scale` values as fallback zoom for older Petalis documents while routing new modifier edits through shared Noise Rack layer controls.

### Added
- Added deterministic unit coverage for Petalis modifier Noise Rack stacks.

## 0.6.58 - 2026-02-28

### Added
- A `Center Diameter` control for `Rings` so the innermost ring can start wider without changing the active Noise Rack stack.

### Changed
- Reworked `Rings` `Concentric` sampling so it behaves like a true ring-path field instead of a nearly static seam break, while keeping circular closure intact.
- Improved the Rings apply-mode help text so `Top Down`, `Concentric`, and `Orbit Field` describe the actual sampling models more clearly.

## 0.6.57 - 2026-02-28

### Changed
- Fixed shared Noise Rack image controls so `Invert Color` is handled as a real checkbox in the stacked-noise UI.
- Corrected image `Noise Width` sampling direction across the affected samplers so larger values widen the field instead of narrowing it.
- Centered polygon noise by default in the remaining top-left-biased samplers, including `wavetable`, so polygon fields start from canvas center.

## 0.6.56 - 2026-02-28

### Added
- A Petalis `Drift Noise Rack` control stack so angular drift now uses the shared Noise Rack model instead of a single legacy scale slider.

### Changed
- Petalis radial-noise, circular-offset, petal-noise, filament, and drift sampling paths now evaluate through Noise Rack-compatible stack samplers while preserving current legacy parameters as fallbacks.
- Local Playwright smoke runs now patch unsupported Unicode regexes, fall back to an installed Chrome when managed Chromium assets are unavailable, and disable local failure-video capture while keeping CI video artifacts enabled.

## 0.6.55 - 2026-02-28

### Added
- Noise Rack stack controls for `flowfield`, `grid`, and `phylla`, including per-layer engine selection, offsets, blend modes, and octave shaping.

### Changed
- `flowfield` now maps stacked Noise Rack fields into angle or curl flow while preserving its particle controls.
- `grid` and `phylla` now derive distortion from stacked Noise Rack fields instead of single ad hoc noise samplers.

## 0.6.54 - 2026-02-28

### Changed
- Refined Rings apply-mode semantics so `Top Down` samples world-space XY noise, `Concentric` samples along each ring path length, and `Orbit Field` preserves the legacy ring-local field.

## 0.6.53 - 2026-02-28

### Changed
- Updated Rings control language to describe the new `Top Down` and `Concentric` semantics ahead of restoring the legacy orbit-local mode as its own option.

## 0.6.52 - 2026-02-28

### Added
- Topo Noise Rack migration with multi-noise height-field layering.

### Changed
- Preserved Topo contour mapping modes while moving meaningful fractal controls into per-noise-layer behavior.

## 0.6.51 - 2026-02-28

### Added
- Rings Noise Rack migration with multi-noise layering and per-noise `Concentric` / `Top Down` projection.

### Changed
- Preserved legacy ring behavior through per-noise drift and sample-radius controls within the new Noise Rack model.

## 0.6.50 - 2026-02-28

### Added
- Canonical app-version plumbing through `src/config/version.js`.
- A version synchronization script at `scripts/sync-version.js`.

### Changed
- The app version shown in the UI now aligns with the package version.
