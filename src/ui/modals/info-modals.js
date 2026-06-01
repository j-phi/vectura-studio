/**
 * Vectura info-modals (Phase 3 step 3 — second modal).
 *
 * Exposes window.Vectura.UI.Modals.InfoModals — a coherent micro-system of
 * small modal helpers used throughout the UI:
 *
 *   - showInfo(key)               - opens an info modal keyed off the INFO
 *                                    dictionary, optionally rendering a
 *                                    preview-pair illustration.
 *   - showDuplicateNameError(name) - "Name Unavailable" modal for layer-rename
 *                                    collisions.
 *   - showValueError(value)       - "Invalid Value" modal for out-of-range
 *                                    numeric input.
 *   - attachInfoButton(labelEl, key) - appends an `<button class="info-btn">`
 *                                    to `labelEl` if not already present.
 *   - attachStaticInfoButtons()   - decorates ~22 known input ids with their
 *                                    info-button (called from initLeftPanelSections
 *                                    and the panel renderers).
 *   - bindInfoButtons()           - installs a single document-level click
 *                                    listener that routes `.info-btn` clicks
 *                                    into showInfo (with a special-case for
 *                                    `global.algorithm` which toggles the
 *                                    About pane via this.setAboutVisible).
 *
 * UI.prototype delegates to this module via `installOn(UI.prototype)`.
 *
 * DI bag: { buildPreviewPair, escapeHtml, getEl, SETTINGS }
 *   - buildPreviewPair is an IIFE-local in src/ui/ui.js.
 *   - INFO lives here as an IIFE-local and is also exposed as
 *     window.Vectura.UI.Modals.InfoModals.INFO for any downstream consumer
 *     that wants to read the table.
 *   - showInfo passes `this` (the UI instance) into buildPreviewPair so its
 *     downstream chain (resolvePreviewConfig → buildVariantsFromDef →
 *     renderPreviewSvg, all IIFE-locals) keeps working unchanged.
 *
 * The module composes the `this.openModal` primitive provided by
 * src/ui/overlays/modal.js.
 *
 * Compile gate at tests/unit/modals/info-modals-compile.test.js.
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};
  const UI = Vectura.UI = Vectura.UI || {};
  const Modals = UI.Modals = UI.Modals || {};

  let DEPS = null;

  // ---------------------------------------------------------------------------
  // INFO — tooltip/modal copy for every info-button across the UI. The
  // info-button satellite owns its copy table directly. Exposed on
  // window.Vectura.UI.Modals.InfoModals.INFO so sibling satellites can read
  // it back if ever needed.
  // ---------------------------------------------------------------------------
  const INFO = {
    'global.algorithm': {
      title: 'Algorithm',
      description: 'Switches the generator for the active layer. Changing this resets that layer parameters to defaults.',
    },
    'global.seed': {
      title: 'Seed',
      description: 'Controls the random sequence used to generate the layer. Same seed equals the same output.',
    },
    'global.posX': {
      title: 'Pos X',
      description: 'Shifts the layer horizontally in millimeters.',
    },
    'global.posY': {
      title: 'Pos Y',
      description: 'Shifts the layer vertically in millimeters.',
    },
    'global.scaleX': {
      title: 'Scale X',
      description: 'Scales the layer horizontally around the center.',
    },
    'global.scaleY': {
      title: 'Scale Y',
      description: 'Scales the layer vertically around the center.',
    },
    'global.rotation': {
      title: 'Rotation',
      description: 'Rotates the active layer around its center in degrees.',
    },
    'global.paperSize': {
      title: 'Paper Size',
      description: 'Sets the paper dimensions used for bounds, centering, and export.',
    },
    'global.margin': {
      title: 'Margin',
      description: 'Keeps a safety border around the drawing area in millimeters.',
    },
    'global.truncate': {
      title: 'Crop Art to Margins',
      description: 'Clips strokes to stay inside the margin boundary.',
    },
    'global.cropExports': {
      title: 'Crop Exports to Margin',
      description: 'Physically clips paths at the margin boundary during SVG export (recommended for plotters).',
    },
    'global.removeHiddenGeometry': {
      title: 'Remove Hidden Geometry',
      description: 'Exports only the visible geometry by trimming masked or frame-hidden segments instead of preserving hidden source paths.',
    },
    'global.outsideOpacity': {
      title: 'Outside Opacity',
      description: 'Opacity for strokes drawn outside the margin when truncation is disabled.',
    },
    'global.marginLineVisible': {
      title: 'Margin Outline',
      description: 'Shows a non-exported margin boundary on the canvas.',
    },
    'global.marginLineWeight': {
      title: 'Margin Line Weight',
      description: 'Line weight for the on-canvas margin guide (mm).',
    },
    'global.marginLineColor': {
      title: 'Margin Line Color',
      description: 'Stroke color for the on-canvas margin guide.',
    },
    'global.marginLineDotting': {
      title: 'Margin Line Dotting',
      description: 'Dash length for the margin guide. Set to 0 for a solid line.',
    },
    'global.selectionOutline': {
      title: 'Selection Outline',
      description: 'Toggles the selection silhouette around chosen lines.',
    },
    'global.selectionOutlineColor': {
      title: 'Selection Outline Color',
      description: 'Sets the color used for the selection silhouette.',
    },
    'global.selectionOutlineWidth': {
      title: 'Selection Outline Width',
      description: 'Controls the thickness of the selection silhouette.',
    },
    'global.cookiePreferences': {
      title: 'Cookie Preferences',
      description: 'Stores UI preferences in a browser cookie so they persist between visits.',
    },
    'global.speedDown': {
      title: 'Draw Speed',
      description: 'Used for time estimation when the pen is down.',
    },
    'global.speedUp': {
      title: 'Travel Speed',
      description: 'Used for time estimation when the pen is up.',
    },
    'global.precision': {
      title: 'Export Precision',
      description: 'Decimal precision for SVG coordinates. Higher values increase file size.',
    },
    'global.stroke': {
      title: 'Default Stroke',
      description: 'Sets the base line width for all layers in millimeters.',
    },
    'global.plotterOptimize': {
      title: 'Plotter Optimization',
      description: 'Enable overlap removal and set a tolerance in millimeters for deduplicating same-pen paths.',
    },
    'mirror.type': {
      title: 'Mirror Type',
      body: `
        <p class="modal-text">
          Mirrors copy and transform your layer's paths in real time. Choose a type that matches the kind of
          symmetry you want — you can stack multiple mirrors together for compound effects.
        </p>
        <div class="modal-section">
          <div class="modal-ill-label">Line</div>
          <p class="modal-text">
            Reflects your artwork across a straight line — like folding a piece of paper. You control the angle
            of the fold and how far the axis is shifted from center. The result is one mirrored copy alongside
            the original. Great for bilateral symmetry (left/right or top/bottom).
          </p>
        </div>
        <div class="modal-section">
          <div class="modal-ill-label">Radial</div>
          <p class="modal-text">
            Spins copies of your artwork around a center point. Three modes are available:
            <br><br>
            <strong>Dihedral (kaleidoscope)</strong> — combines rotation with reflection, like a true kaleidoscope.
            N copies are arranged in a circle, alternating between original and mirrored.
            <br><br>
            <strong>Rotation only</strong> — repeats the original N times around the center with no mirroring.
            Think of a spinning pinwheel or fan blade.
            <br><br>
            <strong>Edge reflections</strong> — reflects along each slice boundary instead of the midpoint,
            producing a different symmetry feel with hard mirror edges between segments.
          </p>
        </div>
        <div class="modal-section">
          <div class="modal-ill-label">Arc</div>
          <p class="modal-text">
            Reflects geometry through a curved boundary — imagine looking at your art in a curved fun-house
            mirror. Points inside the circle get flipped to the outside (or vice versa), creating an inversion
            effect that stretches and compresses shapes in interesting ways. Use Strength to blend between
            the original and reflected position, and Falloff to fade the effect at the arc's edges.
          </p>
        </div>
        <div class="modal-section">
          <div class="modal-ill-label">Wallpaper</div>
          <p class="modal-text">
            Treats your artwork as a small tile and stamps it across the entire canvas — like bathroom
            floor tiles, gift wrap, or a repeating fabric. The <strong>Tile Width</strong> and
            <strong>Tile Height</strong> controls set the size of each repeat unit.
            <br><br>
            The difference from just tiling a copy is <em>symmetry</em>: each group specifies how
            copies are rotated, reflected, or shifted relative to one another, giving the repeat a
            distinctive visual character. There are exactly 17 mathematically distinct ways to do
            this — called wallpaper groups — ranging from a plain copy-paste grid (p1) to a full
            kaleidoscope with 6-fold rotation and 6 mirror axes (p6m).
            <br><br>
            Tap the <strong>(i)</strong> button next to the Group selector for plain-English
            descriptions of all 17 groups.
          </p>
        </div>
      `,
      hidePreview: true,
    },
    'mirror.wallpaperGroup': {
      title: 'Wallpaper Group',
      body: `
        <p class="modal-text">
          Mathematicians have proven there are exactly 17 ways to tile a flat surface with repeating symmetry.
          Each "wallpaper group" is a recipe that says which combination of moves — sliding, rotating,
          and reflecting — are used to fill the canvas. Your drawing is placed in one small tile, and the
          group determines how that tile is copied to cover the whole surface.
        </p>
        <p class="modal-text">
          The groups are organized by their grid shape: <strong>Oblique</strong> (any angle, most flexible),
          <strong>Rectangular</strong> (right-angle grid), <strong>Square</strong> (equal sides, 90° grid),
          and <strong>Hexagonal</strong> (60° grid, triangular or honeycomb base).
        </p>
        <div class="modal-section">
          <div class="modal-ill-label">Oblique grid — no mirrors, free angle</div>
          <p class="modal-text">
            <strong>p1 — Translation only.</strong> The simplest repeat: your tile is copied side-by-side and
            top-to-bottom with no flipping or turning. Like basic gift wrap or plain wallpaper. Every copy
            looks exactly the same and points the same way.
            <br><br>
            <strong>p2 — 180° Rotation.</strong> Each tile is also copied upside down. Think of a fabric
            where the motif alternates between right-side-up and flipped 180°. Still no mirrors — just
            a half-turn.
          </p>
        </div>
        <div class="modal-section">
          <div class="modal-ill-label">Rectangular grid — mirrors and glides</div>
          <p class="modal-text">
            <strong>pm — One mirror stripe.</strong> The tile is reflected left-right across a vertical (or
            horizontal) line, then the pair is tiled. Like a fence where every other plank is a mirror
            image. Creates clean bilateral symmetry in stripes.
            <br><br>
            <strong>pg — Glide reflection.</strong> Like pm, but the reflected copy is also shifted half
            a step before tiling. Think of alternating left and right footprints, or a brick stagger.
            There are no straight mirror lines — only the slide-then-flip combo.
            <br><br>
            <strong>cm — Diagonal mirror on a centered grid.</strong> Combines a mirror with a centered
            (offset-row) rectangular lattice. Creates patterns where diagonal stripes of mirrored pairs
            alternate across the surface.
            <br><br>
            <strong>pmm — Two perpendicular mirrors.</strong> Mirrors run both horizontally and vertically.
            Every tile is reflected in both directions, creating strong four-way symmetry. Like cross-stitch
            or classic quilt blocks — anything placed anywhere gets mirrored to all four quadrants.
            <br><br>
            <strong>pmg — One mirror plus one glide.</strong> One axis has a true mirror, the other has a
            glide reflection. More variety than pmm: some edges are reflected cleanly, others are reflected
            and shifted. Produces patterns with a lively but organized feel.
            <br><br>
            <strong>pgg — Two glide reflections.</strong> Two glide axes at right angles, but no straight
            mirrors at all. The result is an energetic, slightly pinwheel-like rectangular pattern. Commonly
            seen in woven fabric designs.
            <br><br>
            <strong>cmm — Two mirrors on a centered grid.</strong> Two perpendicular mirrors on a rhombic
            (centered) lattice. Rich rectangular symmetry — similar to pmm but the tile grid itself is
            diagonally centered, producing a different visual rhythm.
          </p>
        </div>
        <div class="modal-section">
          <div class="modal-ill-label">Square grid — fourfold rotation</div>
          <p class="modal-text">
            <strong>p4 — Fourfold spin only.</strong> Your tile is rotated at 0°, 90°, 180°, and 270°
            around each grid corner. Like a spinning pinwheel or propeller. No mirrors — just four
            quarter-turns. Works perfectly on a square grid.
            <br><br>
            <strong>p4m — Fourfold rotation plus all mirrors.</strong> The richest square pattern: four
            rotations and four mirror axes (both straight and diagonal). Every possible square symmetry
            is present. Think Islamic geometric tiles, bathroom floor patterns, or detailed mandalas.
            This is one of the most visually striking groups.
            <br><br>
            <strong>p4g — Fourfold rotation plus glide mirrors.</strong> Four rotations with glide
            reflections rather than straight mirrors. Similar to p4m but the mirror edges are offset,
            creating a subtly different "pinwheeling" square pattern. The tile sits at a 45° diagonal
            relative to p4m.
          </p>
        </div>
        <div class="modal-section">
          <div class="modal-ill-label">Hexagonal grid — threefold and sixfold rotation</div>
          <p class="modal-text">
            <strong>p3 — Threefold spin only.</strong> Three 120° rotations on a triangular grid. Your
            tile spins like a three-bladed fan or propeller. No mirrors — pure rotation. Honeycombs and
            triangular tessellations use this underlying structure.
            <br><br>
            <strong>p3m1 — Threefold rotation plus mirrors through the center.</strong> Adds three
            mirror axes that all pass through the rotation center. Creates highly symmetrical hexagonal
            patterns — think detailed snowflake-like designs or Celtic knotwork.
            <br><br>
            <strong>p31m — Threefold rotation plus mirrors through the edges.</strong> Similar to p3m1
            but the mirror axes run through tile edges instead of the rotation center. Slightly less
            symmetric feel — the mirrors don't all converge at one point, giving a different visual rhythm.
            <br><br>
            <strong>p6 — Sixfold spin only.</strong> Six copies at 60° intervals around each vertex —
            like a snowflake or a clock face. No mirrors, just pure 6-fold rotation. Creates elegant
            pinwheel hexagonal patterns.
            <br><br>
            <strong>p6m — Sixfold rotation plus all mirrors.</strong> The most symmetric group of all 17.
            Six rotations plus six mirror axes. Every possible hexagonal symmetry is present — like a
            full kaleidoscope on a hex grid. Think detailed snowflakes, stained glass rosettes, or
            intricate mandala patterns.
          </p>
        </div>
      `,
      hidePreview: true,
    },
    'mirror.replacedSide': {
      title: 'Replaced Side',
      description: 'The side that gets replaced by the reflection. For Line: positive or negative relative to the axis normal. For Arc: outer (beyond radius) or inner (within radius).',
    },
    'mirror.radius': {
      title: 'Arc Radius',
      description: 'Radius of the circular mirror in canvas units. Geometry drawn inside or outside this circle is reflected through it.',
    },
    'mirror.arcStart': {
      title: 'Arc Start',
      description: 'Starting angle (degrees) of the arc guide. Together with Arc End, this defines the visible portion of the mirror circle.',
    },
    'mirror.arcEnd': {
      title: 'Arc End',
      description: 'Ending angle (degrees) of the arc guide. The arc span from Start to End marks where the reflective boundary is drawn.',
    },
    'mirror.strength': {
      title: 'Strength',
      description: 'Blends the reflected copy between its source position (0%) and the full inversion (100%). At 50% the reflection is halfway across the arc.',
    },
    'mirror.falloff': {
      title: 'Falloff',
      description: 'Fades strength toward zero at the arc endpoints, leaving the reflection fullest at the arc midpoint. Higher values create a more pronounced edge fade.',
    },
    'mirror.clipToArc': {
      title: 'Clip to Arc Span',
      description: 'When on, only geometry whose midpoint falls within the Arc Start–End angular window gets reflected. Geometry outside the window is kept but not inverted.',
    },
    'mirror.rotationOffset': {
      title: 'Rotation Offset',
      description: 'Rotates each reflected copy by this many degrees around the inversion circle center after reflecting. Creates pinwheel or spiral-bloom effects.',
    },
    'mirror.copies': {
      title: 'Copies',
      description: 'Fans out N evenly-spaced rotational copies of the reflected geometry around the full circle. Combine with inner→outer for mandala-style inversions.',
    },
    'common.smoothing': {
      title: 'Smoothing',
      description: 'Softens sharp angles by averaging each point with its neighbors. 0 keeps raw lines.',
    },
    'common.curves': {
      title: 'Curves',
      description: 'Renders smooth quadratic curves between points instead of straight segments.',
    },
    'common.simplify': {
      title: 'Simplify',
      description: 'Reduces point density while keeping the overall form. Higher values simplify more.',
    },
    'flowfield.noiseScale': {
      title: 'Noise Scale',
      description: 'Controls the scale of this Noise Rack layer inside the flow field. For polygon noise, larger values produce a larger polygon footprint.',
    },
    'flowfield.noiseOffsetX': {
      title: 'Noise Offset X',
      description: 'Shifts a flow-field noise layer on the X axis before sampling.',
    },
    'flowfield.noiseOffsetY': {
      title: 'Noise Offset Y',
      description: 'Shifts a flow-field noise layer on the Y axis before sampling.',
    },
    'flowfield.flowMode': {
      title: 'Flow Mode',
      description: 'Angle mode maps the stacked Noise Rack field directly to direction. Curl mode derives flow direction from the field gradient.',
    },
    'flowfield.fieldWeight': {
      title: 'Field Weight',
      description: 'Controls how strongly this noise layer contributes to the combined flow field.',
    },
    'flowfield.noiseType': {
      title: 'Noise Type',
      description: 'Chooses the engine used by a Noise Rack layer in the flow field.',
    },
    'flowfield.lacunarity': {
      title: 'Lacunarity',
      description: 'Controls how quickly layer frequency increases across stacked octaves.',
    },
    'flowfield.gain': {
      title: 'Gain',
      description: 'Controls how much each octave contributes to the layer field.',
    },
    'flowfield.density': {
      title: 'Density',
      description: 'Number of particles seeded. Higher density adds more paths.',
    },
    'flowfield.stepLen': {
      title: 'Step Length',
      description: 'Distance a particle moves per step. Larger steps create more angular paths.',
    },
    'flowfield.maxSteps': {
      title: 'Max Steps',
      description: 'Caps how long each particle travels before stopping.',
    },
    'flowfield.force': {
      title: 'Flow Force',
      description: 'Amplifies the influence of the noise field on direction.',
    },
    'flowfield.angleOffset': {
      title: 'Angle Offset',
      description: 'Rotates the entire flow field direction.',
    },
    'flowfield.chaos': {
      title: 'Chaos',
      description: 'Adds random angular jitter on top of the flow field.',
    },
    'flowfield.octaves': {
      title: 'Octaves',
      description: 'Number of octave samples inside this Noise Rack layer. More octaves add structure.',
    },
    'flowfield.minSteps': {
      title: 'Minimum Steps',
      description: 'Removes very short paths by requiring a minimum number of steps.',
    },
    'flowfield.minLength': {
      title: 'Minimum Length',
      description: 'Removes short fragments by requiring a minimum path length.',
    },
    'lissajous.freqX': {
      title: 'Freq X',
      description: 'Oscillation rate along the X axis.',
    },
    'lissajous.freqY': {
      title: 'Freq Y',
      description: 'Oscillation rate along the Y axis.',
    },
    'lissajous.damping': {
      title: 'Damping',
      description: 'How quickly the curve decays over time. Higher values shorten the trail.',
    },
    'lissajous.phase': {
      title: 'Phase',
      description: 'Shifts the X wave relative to Y, changing the knot shape.',
    },
    'lissajous.resolution': {
      title: 'Resolution',
      description: 'Number of samples along the curve. Higher values create smoother lines.',
    },
    'lissajous.scale': {
      title: 'Scale',
      description: 'Overall size of the Lissajous curve.',
    },
    'lissajous.truncateStart': {
      title: 'Truncate Start',
      description: 'Removes 0-100% of the curve length from the starting endpoint before any close-line trimming runs.',
    },
    'lissajous.truncateEnd': {
      title: 'Truncate End',
      description: 'Removes 0-100% of the curve length from the ending endpoint before any close-line trimming runs.',
    },
    'lissajous.closeLines': {
      title: 'Close Lines',
      description: 'Trims loose tail ends back to self-intersection cutpoints instead of forcing the curve to loop closed.',
    },
    'harmonograph.preset': {
      title: 'Preset',
      description: 'Loads a complete harmonograph recipe — every pendulum, frequency ratio, and damping value at once — as a starting point. Pick one that is close to what you want, then tune from there; classic ratios like 3:2 and 4:3 are where the most pleasing figures live.',
    },
    'harmonograph.renderMode': {
      title: 'Render Mode',
      description: 'Decides how the traced path is drawn: a continuous Line, broken Dashes, a Point Field of dots, or short Segments. The same underlying figure can read as a crisp line drawing or a soft stippled field depending on which you choose.',
    },
    'harmonograph.samples': {
      title: 'Samples',
      description: 'How many points are computed along the pen path. More samples render the curve smoothly and capture fine detail in fast-moving sections; fewer samples draw faster and can leave tight loops looking faceted.',
    },
    'harmonograph.duration': {
      title: 'Duration',
      description: 'How long the simulated pendulums are left to swing, in seconds. Because the swing decays over time, a longer duration lets the figure spiral further inward and lay down more overlapping loops before it settles to the center.',
    },
    'harmonograph.scale': {
      title: 'Scale',
      description: 'Sizes the whole figure up or down on the page without changing its shape. Use it to fit the drawing comfortably inside your margins.',
    },
    'harmonograph.paperRotation': {
      title: 'Paper Rotation',
      description: 'Slowly turns the paper under the pen as it draws, in revolutions per second — exactly like a real harmonograph turntable. Even a gentle rate twists clean Lissajous loops into the dense, rosette-like spirals that make the machine special; small whole-number ratios against the pendulum frequencies give the cleanest results.',
    },
    'harmonograph.dashLength': {
      title: 'Dash Length',
      description: 'Length of each inked dash when drawing in Dashed mode (mm). Longer dashes feel like a solid line with breathing room; shorter ones read as a fine stitched trail.',
    },
    'harmonograph.dashGap': {
      title: 'Dash Gap',
      description: 'The blank space between dashes (mm). Widen it for an airy, dotted-line feel; tighten it toward zero for an almost-continuous stroke.',
    },
    'harmonograph.pointStride': {
      title: 'Point Stride',
      description: 'In Point Field mode, plots only every Nth sample as a dot. Raise it to thin the stipple into sparse constellations; lower it to pack the dots into a dense, tonal field.',
    },
    'harmonograph.pointSize': {
      title: 'Point Size',
      description: 'Radius of each plotted dot in the Point Field (mm). Small points keep the figure delicate; larger ones build weight and read almost like a brushed tone.',
    },
    'harmonograph.segmentStride': {
      title: 'Segment Stride',
      description: 'Spacing between the short tick-marks drawn in Segments mode. Larger strides scatter the segments sparsely along the path; smaller strides line them up into a near-continuous dashed feel.',
    },
    'harmonograph.segmentLength': {
      title: 'Segment Length',
      description: 'How long each individual tick-mark is in Segments mode (mm). Short segments read as crisp tally marks following the curve; longer ones start to merge back into a flowing line.',
    },
    'harmonograph.gapSize': {
      title: 'Gap Size',
      description: 'Adds extra breathing room between elements in Dashed, Point, or Segment modes (mm). A quick way to loosen up a pattern that feels too dense without touching its underlying spacing.',
    },
    'harmonograph.gapOffset': {
      title: 'Gap Offset',
      description: 'Slides the whole dash/point/segment pattern forward along the path. Useful for nudging marks off an awkward alignment so they fall where you want them.',
    },
    'harmonograph.gapRandomness': {
      title: 'Spacing Randomness',
      description: 'Loosens the perfectly even spacing between marks (0 = mechanical and regular, 1 = freely scattered). A touch of randomness gives the broken-line modes a more hand-made, organic rhythm.',
    },
    'harmonograph.widthMultiplier': {
      title: 'Line Thickness',
      description: 'Builds a heavier line by stacking several parallel passes of the pen — the way a plotter fakes a thick stroke from a thin nib. Higher values give bolder, more present lines at the cost of extra plot time.',
    },
    'harmonograph.thickeningMode': {
      title: 'Thickening Mode',
      description: 'Arranges the stacked thickness passes. Parallel keeps them an even distance apart for a clean uniform weight; Sinusoidal lets the spacing swell and pinch along the path for a calligraphic, ribbon-like line.',
    },
    'harmonograph.loopDrift': {
      title: 'Anti-Loop Drift',
      description: 'Adds a slow, continuous frequency drift so the figure never quite retraces the same loop twice. With it the overlapping passes fan out into a richer web instead of stacking exactly on top of one another.',
    },
    'harmonograph.settleThreshold': {
      title: 'Settle Cutoff',
      description: 'Stops drawing once the decaying swing shrinks below this distance from the center (mm), trimming the long fade into a tiny knot at the middle. Set it to 0 to let the figure spiral all the way down.',
    },
    'harmonograph.showPendulumGuides': {
      title: 'Pendulum Guides',
      description: 'Overlays a helper trace for each pendulum so you can see how the individual swings combine into the final figure — a teaching aid for reading the machine, not part of the export.',
    },
    'harmonograph.pendulumGuideColor': {
      title: 'Guide Color',
      description: 'Color of the pendulum helper overlay. Pick something that contrasts with your line so the guides stay easy to read against the figure.',
    },
    'harmonograph.pendulumGuideWidth': {
      title: 'Guide Thickness',
      description: 'Line weight of the pendulum helper overlay (mm). Keep it thin so the guides inform without crowding the artwork.',
    },
    'harmonograph.pluckPad': {
      title: 'Release',
      description: 'Drag to "release" this pendulum: the handle is its swing amplitude on the X (horizontal) and Y (vertical) axes at once. Far from the center is a big swing; out along one axis swings mostly that way; the center is no swing at all. It only sets the swing size — the phase (timing) that gives the figure its shape stays under Advanced, and the exact X/Y numbers live there too.',
    },
    'harmonograph.phasePad': {
      title: 'Phase',
      description: 'The companion to the Release pad: the handle sets this pendulum\'s phase (the point in its swing where it starts) on both axes at once — horizontal is Phase X, vertical is Phase Y, each running 0° to 360° across the pad (centre = 180°). The offset between the two is what turns a flat line into an ellipse or a circle, so sweeping the handle reshapes the figure without changing its size. The exact degrees live under Advanced.',
    },
    'harmonograph.ampX': {
      title: 'Amplitude X',
      description: 'How far this pendulum swings the pen left-to-right — the size of its release. Larger amplitudes throw the figure wider across the page on the horizontal axis; a value of 0 takes this pendulum out of the X motion entirely.',
    },
    'harmonograph.ampY': {
      title: 'Amplitude Y',
      description: 'How far this pendulum swings the pen up-and-down — its vertical release size. Pairing a large X amplitude with a small Y (or vice versa) is what stretches a circle into an ellipse or a flat ribbon.',
    },
    'harmonograph.phaseX': {
      title: 'Phase X',
      description: 'Where in its swing the X oscillator starts, in degrees — the direction the pendulum was released. Shifting it slides the figure between open and pinched forms; a 90° offset between X and Y is the classic way to turn a line into a circle.',
    },
    'harmonograph.phaseY': {
      title: 'Phase Y',
      description: 'The starting point of the Y swing, in degrees. On a real harmonograph the relative phase of the pendulums changes every time you release them — sweep it to find the "eye"-shaped figures that live between the clean poses.',
    },
    'harmonograph.freq': {
      title: 'Frequency',
      description: 'How fast this pendulum swings — on a real machine, set by the length of the rod (shorter swings faster). The ratios between pendulum frequencies define the figure: simple ones like 2:1, 3:2, and 4:3 produce the recognizable star and petal shapes, while off-ratios drift toward chaos.',
    },
    'harmonograph.micro': {
      title: 'Micro Tuning',
      description: 'A tiny detune added on top of this pendulum\'s Frequency — a small ± nudge, not an absolute frequency (it ranges only about −0.2 to +0.2). It is the secret to lush figures: with the frequencies sitting on a clean ratio the loops close into a static shape, but a Micro Tuning of just 0.001 makes them slowly precess and bloom. To change the actual pitch, use Frequency instead.',
    },
    'harmonograph.damp': {
      title: 'Damping',
      description: 'How quickly this pendulum loses energy and its swing shrinks toward the center — the source of the harmonograph\'s signature inward spiral. Low damping spreads the figure into many wide overlapping loops; high damping pulls it tight and quickly to rest. Different damping per pendulum gives the figure its organic, lopsided decay.',
    },
    'harmonograph.enabled': {
      title: 'Pendulum On/Off',
      description: 'Mutes or activates this pendulum without deleting it. Switch one off to hear what it was contributing, or to stage a build-up — turn pendulums on one at a time to watch a simple loop grow into a complex figure.',
    },
    'harmonograph.plotStart': {
      title: 'Plot Start',
      description: 'Trims the start of the drawn line: nothing is inked before this point along the figure\'s path (as a percent of total length). Leave it at 0% to draw from the very beginning, or raise it to skip past the wide opening loops and start mid-figure. It affects both the main canvas and the virtual plotter.',
    },
    'harmonograph.plotEnd': {
      title: 'Plot End',
      description: 'Trims the end of the drawn line: nothing is inked after this point along the figure\'s path (as a percent of total length). Leave it at 100% to draw the whole figure, or pull it in to stop before the long fade into the center. Together with Plot Start it acts as a window onto any slice of the path — and applies to both the main canvas and the virtual plotter.',
    },

    // -----------------------------------------------------------------------
    // Pendula — the kinetic-harmonograph studio. Its panel is derived from the
    // harmonograph panel with every infoKey rewritten harmonograph.* -> pendula.*
    // (see controls-registry.js), so each shared control needs a pendula mirror
    // here or its (i) button would no-op. The mirrors share copy with their
    // harmonograph twins; the pendula-only controls (machine type, Motion Rack
    // LFOs, the drag-assigned modulation edge) are written fresh below.
    // -----------------------------------------------------------------------
    'pendula.preset': {
      title: 'Preset',
      description: 'Loads a full Pendula recipe — pendulums, frequency ratios, damping, and any Motion Rack modulation — as a launch pad. Start near the figure you want, then pluck, dice, and modulate from there; every preset is a fork point, not a final answer.',
    },
    'pendula.machineType': {
      title: 'Machine',
      description: 'Chooses the kind of harmonograph you are building. Lateral is the classic damped machine — the swing decays, so the figure spirals inward to a still center. Pintograph models constant-velocity rotating disks instead: damping is forced to zero, so the loops never decay and the figure draws forever, ideal for continuous looping playback and evolving snake-like shapes.',
    },
    'pendula.renderMode': {
      title: 'Render Mode',
      description: 'Decides how the traced path is drawn: a continuous Line, broken Dashes, a Point Field of dots, or short Segments. The same underlying figure can read as a crisp line drawing or a soft stippled field depending on which you choose.',
    },
    'pendula.samples': {
      title: 'Samples',
      description: 'How many points are computed along the pen path. More samples render the curve smoothly and capture fine detail in fast-moving sections; fewer samples draw faster and can leave tight loops looking faceted.',
    },
    'pendula.duration': {
      title: 'Duration',
      description: 'How long the simulated pendulums are left to swing, in seconds. Because the Lateral machine\'s swing decays over time, a longer duration lets the figure spiral further inward and lay down more overlapping loops before it settles.',
    },
    'pendula.scale': {
      title: 'Scale',
      description: 'Sizes the whole figure up or down on the page without changing its shape. Use it to fit the drawing comfortably inside your margins.',
    },
    'pendula.paperRotation': {
      title: 'Paper Rotation',
      description: 'Slowly turns the paper under the pen as it draws, in revolutions per second — exactly like a real harmonograph turntable. Even a gentle rate twists clean Lissajous loops into dense rosette spirals; small whole-number ratios against the pendulum frequencies give the cleanest results.',
    },
    'pendula.dashLength': {
      title: 'Dash Length',
      description: 'Length of each inked dash when drawing in Dashed mode (mm). Longer dashes feel like a solid line with breathing room; shorter ones read as a fine stitched trail.',
    },
    'pendula.dashGap': {
      title: 'Dash Gap',
      description: 'The blank space between dashes (mm). Widen it for an airy, dotted-line feel; tighten it toward zero for an almost-continuous stroke.',
    },
    'pendula.pointStride': {
      title: 'Point Stride',
      description: 'In Point Field mode, plots only every Nth sample as a dot. Raise it to thin the stipple into sparse constellations; lower it to pack the dots into a dense, tonal field.',
    },
    'pendula.pointSize': {
      title: 'Point Size',
      description: 'Radius of each plotted dot in the Point Field (mm). Small points keep the figure delicate; larger ones build weight and read almost like a brushed tone.',
    },
    'pendula.segmentStride': {
      title: 'Segment Stride',
      description: 'Spacing between the short tick-marks drawn in Segments mode. Larger strides scatter the segments sparsely along the path; smaller strides line them up into a near-continuous dashed feel.',
    },
    'pendula.segmentLength': {
      title: 'Segment Length',
      description: 'How long each individual tick-mark is in Segments mode (mm). Short segments read as crisp tally marks following the curve; longer ones start to merge back into a flowing line.',
    },
    'pendula.gapSize': {
      title: 'Gap Size',
      description: 'Adds extra breathing room between elements in Dashed, Point, or Segment modes (mm). A quick way to loosen a pattern that feels too dense without touching its underlying spacing.',
    },
    'pendula.gapOffset': {
      title: 'Gap Offset',
      description: 'Slides the whole dash/point/segment pattern forward along the path. Useful for nudging marks off an awkward alignment so they fall where you want them.',
    },
    'pendula.gapRandomness': {
      title: 'Spacing Randomness',
      description: 'Loosens the perfectly even spacing between marks (0 = mechanical and regular, 1 = freely scattered). A touch of randomness gives the broken-line modes a more hand-made rhythm.',
    },
    'pendula.widthMultiplier': {
      title: 'Line Thickness',
      description: 'Builds a heavier line by stacking several parallel passes of the pen — the way a plotter fakes a thick stroke from a thin nib. Higher values give bolder lines at the cost of extra plot time.',
    },
    'pendula.thickeningMode': {
      title: 'Thickening Mode',
      description: 'Arranges the stacked thickness passes. Parallel keeps them an even distance apart for a clean uniform weight; Sinusoidal lets the spacing swell and pinch along the path for a calligraphic, ribbon-like line.',
    },
    'pendula.loopDrift': {
      title: 'Anti-Loop Drift',
      description: 'Adds a slow, continuous frequency drift so the figure never quite retraces the same loop twice. With it the overlapping passes fan out into a richer web instead of stacking exactly on top of one another.',
    },
    'pendula.settleThreshold': {
      title: 'Settle Cutoff',
      description: 'Stops drawing once the decaying swing shrinks below this distance from the center (mm), trimming the long fade into a tiny knot. Set it to 0 to let the figure spiral all the way down. (Has no effect on the non-decaying Pintograph machine.)',
    },
    'pendula.showPendulumGuides': {
      title: 'Pendulum Guides',
      description: 'Overlays a helper trace for each pendulum so you can see how the individual swings combine into the final figure — a teaching aid for reading the machine, not part of the export.',
    },
    'pendula.pendulumGuideColor': {
      title: 'Guide Color',
      description: 'Color of the pendulum helper overlay. Pick something that contrasts with your line so the guides stay easy to read against the figure.',
    },
    'pendula.pendulumGuideWidth': {
      title: 'Guide Thickness',
      description: 'Line weight of the pendulum helper overlay (mm). Keep it thin so the guides inform without crowding the artwork.',
    },
    'pendula.pluckPad': {
      title: 'Release',
      description: 'Drag to "release" this pendulum: the handle is its swing amplitude on the X (horizontal) and Y (vertical) axes at once. Far from the center is a big swing; out along one axis swings mostly that way; the center is no swing at all. It only sets the swing size — the phase (timing) that gives the figure its shape stays under Advanced, and the exact X/Y numbers live there too.',
    },
    'pendula.phasePad': {
      title: 'Phase',
      description: 'The companion to the Release pad: the handle sets this pendulum\'s phase (the point in its swing where it starts) on both axes at once — horizontal is Phase X, vertical is Phase Y, each running 0° to 360° across the pad (centre = 180°). The offset between the two is what turns a flat line into an ellipse or a circle, so sweeping the handle reshapes the figure without changing its size. The exact degrees live under Advanced.',
    },
    'pendula.ampX': {
      title: 'Amplitude X',
      description: 'How far this pendulum swings the pen left-to-right — the size of its release. Larger amplitudes throw the figure wider across the horizontal axis; a value of 0 takes this pendulum out of the X motion entirely.',
    },
    'pendula.ampY': {
      title: 'Amplitude Y',
      description: 'How far this pendulum swings the pen up-and-down — its vertical release size. Pairing a large X amplitude with a small Y (or vice versa) is what stretches a circle into an ellipse or a flat ribbon.',
    },
    'pendula.phaseX': {
      title: 'Phase X',
      description: 'Where in its swing the X oscillator starts, in degrees — the direction the pendulum was released. Shifting it slides the figure between open and pinched forms; a 90° offset between X and Y is the classic way to turn a line into a circle.',
    },
    'pendula.phaseY': {
      title: 'Phase Y',
      description: 'The starting point of the Y swing, in degrees. On a real machine the relative phase changes every time you release the pendulums — sweep it to find the "eye"-shaped figures that live between the clean poses.',
    },
    'pendula.freq': {
      title: 'Frequency',
      description: 'How fast this pendulum swings — on a real machine, set by the length of the rod (shorter swings faster). The ratios between pendulum frequencies define the figure: simple ones like 2:1, 3:2, and 4:3 produce recognizable star and petal shapes, while off-ratios drift toward chaos.',
    },
    'pendula.micro': {
      title: 'Micro Tuning',
      description: 'A tiny detune added on top of this pendulum\'s Frequency — a small ± nudge, not an absolute frequency (it ranges only about −0.2 to +0.2). This is the heart of the "lock then drift" craft: a perfectly locked ratio gives a static shape, but a Micro Tuning of just 0.001 makes the loops slowly precess — and a slow Motion Rack LFO on this knob is what evolves a circle into a snake. To change the actual pitch, use Frequency instead.',
    },
    'pendula.damp': {
      title: 'Damping',
      description: 'How quickly this pendulum loses energy and its swing shrinks toward the center — the source of the inward spiral. Low damping spreads the figure into many wide overlapping loops; high damping pulls it tight and quickly to rest. (On the Pintograph machine, damping is forced to zero so the figure never decays.)',
    },
    'pendula.enabled': {
      title: 'Pendulum On/Off',
      description: 'Mutes or activates this pendulum without deleting it. Switch one off to see what it was contributing, or to stage a build-up — turn pendulums on one at a time to watch a simple loop grow into a complex figure.',
    },
    'pendula.plotStart': {
      title: 'Plot Start',
      description: 'Trims the start of the drawn line: nothing is inked before this point along the figure\'s path (as a percent of total length). Leave it at 0% to draw from the very beginning, or raise it to skip the wide opening loops and start mid-figure. It affects both the main canvas and the virtual plotter.',
    },
    'pendula.plotEnd': {
      title: 'Plot End',
      description: 'Trims the end of the drawn line: nothing is inked after this point along the figure\'s path (as a percent of total length). Leave it at 100% to draw the whole figure, or pull it in to stop before the long fade. With Plot Start it acts as a window onto any slice of the path, on both the main canvas and the virtual plotter.',
    },

    // Motion Rack — the pendula-only LFO layer. Each modulator (source) is a slow
    // oscillator whose output is routed onto a parameter via a signed edge. This
    // is what turns the still figure into a temporal performance.
    'pendula.motion.rack': {
      title: 'Motion Rack',
      description: 'A patch bay of modulators — LFOs and macros — wired onto the figure\'s parameters to animate it as the virtual plotter loops. Every edit here is playback-only: it never regenerates the static figure, it just makes the live performance breathe, drift, and evolve. Patch a slow source onto a detune or amplitude and watch a locked shape come alive.',
    },
    'pendula.motion.addLfo': {
      title: 'Add LFO',
      description: 'Drops a new oscillator source into the rack — a time-varying signal you can shape (sine, saw, square, sample-and-hold, or a hand-drawn curve) and route onto any parameter. The LFO does nothing until you assign it to a target; once patched, it sweeps that parameter every cycle to give the figure continuous motion.',
    },
    'pendula.motion.addMacro': {
      title: 'Add Macro',
      description: 'Drops in a Macro source — a single static knob (0–1) rather than an oscillator. Patch one macro onto many parameters at once and a single slider becomes a master control that reshapes the whole figure in one move. Use it for poses and instant variations rather than continuous animation.',
    },
    'pendula.motion.macroValue': {
      title: 'Macro Value',
      description: 'The macro\'s current position from 0 to 1. Every parameter this macro is patched to follows it through its signed Amount, so sweeping this one slider drives all of those targets together. It is a static value — it holds where you leave it rather than oscillating.',
    },
    'pendula.motion.drawn': {
      title: 'Drawn Curve',
      description: 'A hand-drawn modulator shape: the editor traces an arbitrary waveform the LFO plays back instead of a stock sine or saw. Double-click empty space to add a point, drag a point to shape the curve (height is the output, left-to-right is one cycle), and double-click a point to remove it. The endpoints stay pinned so the curve loops cleanly.',
    },
    'pendula.motion.shape': {
      title: 'LFO Shape',
      description: 'The waveform this modulator sweeps through each cycle. Sine and Triangle glide smoothly for organic drift and breathing figures; Saw ramps in one direction then snaps back; Square jumps between two states to toggle the figure between poses; Sample & Hold and Random freeze a fresh value each cycle for stair-stepped, ever-reconfiguring motion.',
    },
    'pendula.motion.syncMode': {
      title: 'Sync',
      description: 'Sets the modulator\'s time base. Synced ties its rate to the figure\'s loop length, so it repeats exactly with the drawing — a clean, shareable, perfectly looping animation. Free runs in real Hz, independent of the loop, so the figure never quite repeats and drifts continuously into new territory.',
    },
    'pendula.motion.rate': {
      title: 'Rate',
      description: 'How fast the modulator oscillates. In Synced mode it counts cycles per figure loop (so 1 = one full sweep per drawing); in Free mode it is a frequency in Hz. Slow rates give a gentle evolving drift; fast rates add visible shimmer and texture to the figure.',
    },
    'pendula.motion.depth': {
      title: 'Depth',
      description: 'An attenuator on the modulator\'s output — how much of its full swing reaches the routings, from 0 (silent) to 1 (full strength). Pull it back to keep modulation subtle; the per-routing Amount then scales it further for each target.',
    },
    'pendula.motion.phase': {
      title: 'Phase',
      description: 'Shifts where in its cycle the modulator begins (0–1 of a full turn). Offsetting the phase of two modulators lets them push and pull against each other rather than moving in lockstep — useful for keeping a multi-LFO figure lively.',
    },
    'pendula.motion.polarity': {
      title: 'Polarity',
      description: 'Sets which way the modulation pushes from the parameter\'s base value. Bipolar swings both above and below the base (the base sits at center) — ideal for wobbling a locked circle symmetrically both ways. Unipolar only pushes in one direction, so the parameter is nudged away from its base and back, never past it.',
    },
    'pendula.motion.targetParamPath': {
      title: 'Modulation Target',
      description: 'The parameter this routing drives — assigned by dragging the modulator onto a control. One modulator can fan out to many targets at once, so a single slow sweep can detune a frequency, breathe an amplitude, and turn the paper together for a coordinated evolution.',
    },
    'pendula.motion.amount': {
      title: 'Amount',
      description: 'The signed strength of this one routing — how far, and in which direction, the modulator moves its target. Positive and negative values flip the direction of the effect, and a small amount on a frequency or micro-detune is exactly the recipe for slowly drifting a locked figure into a snake-like evolving shape.',
    },

    'wavetable.lines': {
      title: 'Lines',
      description: 'Number of lines used by the selected wavetable line structure.',
    },
    'wavetable.lineStructure': {
      title: 'Line Structure',
      description:
        'Sets the base line layout before noise displacement: horizontal rows, vertical stacks, grid combos, isometric sets, or lattice diagonals.',
    },
    'wavetable.noiseType': {
      title: 'Noise Type',
      body: (ui) => {
        const base = ui?.getWavetableNoiseTemplates?.('wavetable')?.base || {};
        const baseParams = {
          ...(ALGO_DEFAULTS?.wavetable ? clone(ALGO_DEFAULTS.wavetable) : {}),
          lines: 40,
          gap: 1.2,
          tilt: 0,
          lineOffset: 0,
          noises: [],
        };
        const items = WAVE_NOISE_OPTIONS.map((opt) => {
          const desc = WAVE_NOISE_DESCRIPTIONS[opt.value] || '';
          const params = {
            ...baseParams,
            noises: [
              {
                ...clone(base),
                type: opt.value,
                amplitude: 6,
                zoom: 0.03,
                freq: 1,
                enabled: true,
              },
            ],
          };
          const svg = renderPreviewSvg('wavetable', params, { strokeWidth: 0.8 });
          return `
            <div class="modal-illustration">
              <div class="modal-ill-label">${opt.label}</div>
              ${desc ? `<div class="modal-ill-desc">${desc}</div>` : ''}
              ${svg}
            </div>
          `;
        }).join('');
        return `
          <p class="modal-text">
            Each noise type shapes line displacement differently. Image modes use uploaded luminance as the base signal.
          </p>
          <div class="modal-illustrations scrollable">
            ${items}
          </div>
        `;
      },
      hidePreview: true,
    },
    'wavetable.noiseBlend': {
      title: 'Blend Mode',
      description:
        'Controls how this noise layer combines with the noises above it. Hatching Density modes bias displacement based on light/dark tone to simulate shading.',
    },
    'wavetable.noiseApplyMode': {
      title: 'Apply Mode',
      description: 'Top Down samples noise in global canvas space. Linear maps noise along the spiral path.',
    },
    'wavetable.imageNoiseStyle': {
      title: 'Noise Style',
      description: 'Shapes how dark vs. light image values influence the displacement.',
    },
    'wavetable.imageNoiseThreshold': {
      title: 'Noise Threshold',
      description: 'Controls how dark a pixel must be before it contributes full noise impact.',
    },
    'wavetable.imageWidth': {
      title: 'Noise Width',
      description: 'Scales image sampling horizontally. 1 keeps native aspect; higher widens, lower narrows.',
    },
    'wavetable.imageHeight': {
      title: 'Noise Height',
      description: 'Scales image sampling vertically.',
    },
    'wavetable.imageMicroFreq': {
      title: 'Micro Frequency',
      description: 'Adds micro-scale wave modulation based on image darkness.',
    },
    'wavetable.imageInvertColor': {
      title: 'Invert Color',
      description: 'Flips the luminance values of the image before effects are applied.',
    },
    'wavetable.imageInvertOpacity': {
      title: 'Invert Opacity',
      description: 'Inverts the image alpha contribution so transparent areas become active.',
    },
    'wavetable.noiseTileMode': {
      title: 'Tile Mode',
      description: 'Repeats the noise in patterned tiles (grid, brick, hex, etc.). Off keeps a single centered field.',
    },
    'wavetable.noiseTilePadding': {
      title: 'Tile Padding',
      description: 'Adds breathing room between tiles by shrinking the active tile area.',
    },
    'wavetable.noiseImage': {
      title: 'Noise Image',
      description: 'Uses an uploaded image as the noise source. Brightness values become wave displacement.',
    },
    'wavetable.imageAlgo': {
      title: 'Image Effect Mode',
      description: 'Determines how each image effect transforms luminance before displacement.',
    },
    'wavetable.imageBrightness': {
      title: 'Image Brightness',
      description: 'Offsets the sampled luminance brighter or darker.',
    },
    'wavetable.imageLevelsLow': {
      title: 'Levels Low',
      description: 'Clips darker tones before remapping the image levels.',
    },
    'wavetable.imageLevelsHigh': {
      title: 'Levels High',
      description: 'Clips lighter tones before remapping the image levels.',
    },
    'wavetable.imageEmbossStrength': {
      title: 'Emboss Strength',
      description: 'Emphasizes directional relief like an embossed surface.',
    },
    'wavetable.imageSharpenAmount': {
      title: 'Sharpen Amount',
      description: 'Boosts local contrast to emphasize edges.',
    },
    'wavetable.imageSharpenRadius': {
      title: 'Sharpen Radius',
      description: 'Neighborhood size used for sharpening.',
    },
    'wavetable.imageMedianRadius': {
      title: 'Median Radius',
      description: 'Neighborhood size used for median filtering.',
    },
    'wavetable.imageGamma': {
      title: 'Image Gamma',
      description: 'Adjusts midtone weighting before sampling the image.',
    },
    'wavetable.imageContrast': {
      title: 'Image Contrast',
      description: 'Boosts or reduces contrast prior to sampling.',
    },
    'wavetable.imageBlurRadius': {
      title: 'Blur Radius',
      description: 'Radius for blur sampling when Blur mode is active.',
    },
    'wavetable.imageBlurStrength': {
      title: 'Blur Strength',
      description: 'Blend amount between sharp and blurred luminance.',
    },
    'wavetable.imageSolarize': {
      title: 'Solarize Threshold',
      description: 'Inverts tones above the threshold for a photographic solarize effect.',
    },
    'wavetable.imagePixelate': {
      title: 'Pixelate',
      description: 'Samples the image in larger blocks for a chunky pixel effect.',
    },
    'wavetable.imageDither': {
      title: 'Dither Amount',
      description: 'Applies a patterned threshold to create a stippled tone map.',
    },
    'wavetable.imageHighpassRadius': {
      title: 'High Pass Radius',
      description: 'Kernel size for extracting high-frequency detail.',
    },
    'wavetable.imageHighpassStrength': {
      title: 'High Pass Strength',
      description: 'Boosts edge contrast from the high-pass filter.',
    },
    'wavetable.imageLowpassRadius': {
      title: 'Low Pass Radius',
      description: 'Kernel size for smoothing the image.',
    },
    'wavetable.imageLowpassStrength': {
      title: 'Low Pass Strength',
      description: 'Blends the low-pass filter into the luminance.',
    },
    'wavetable.imageVignetteStrength': {
      title: 'Vignette Strength',
      description: 'Darkens edges to emphasize the center.',
    },
    'wavetable.imageVignetteRadius': {
      title: 'Vignette Radius',
      description: 'Controls how far the vignette reaches into the image.',
    },
    'wavetable.imageCurveStrength': {
      title: 'Tone Curve Strength',
      description: 'Applies an S-curve to emphasize midtones.',
    },
    'wavetable.imageBandCenter': {
      title: 'Band Center',
      description: 'Target luminance for the bandpass mask.',
    },
    'wavetable.imageBandWidth': {
      title: 'Band Width',
      description: 'Range of luminance values preserved by bandpass.',
    },
    'wavetable.imageThreshold': {
      title: 'Image Threshold',
      description: 'Threshold used to binarize the image before sampling.',
    },
    'wavetable.imagePosterize': {
      title: 'Posterize Levels',
      description: 'Reduces the image to a fixed number of tonal steps.',
    },
    'wavetable.imageBlur': {
      title: 'Edge Blur Radius',
      description: 'Radius used for edge detection smoothing.',
    },
    'wavetable.amplitude': {
      title: 'Noise Amplitude',
      description: 'Amount of vertical displacement added by this noise layer. Positive values lift lines upward; negative values push them downward.',
    },
    'wavetable.zoom': {
      title: 'Noise Zoom',
      description: 'Scale of this noise field along the wavetable. For polygon noise, larger values produce a larger polygon footprint.',
    },
    'wavetable.noiseShiftX': {
      title: 'Noise X-Shift',
      description: 'Offsets the noise field horizontally. 0 keeps it centered.',
    },
    'wavetable.noiseShiftY': {
      title: 'Noise Y-Shift',
      description: 'Offsets the noise field vertically. 0 keeps it centered.',
    },
    'wavetable.noisePatternScale': {
      title: 'Pattern Scale',
      description: 'Adjusts the spacing of pattern-driven noises like stripes or moire.',
    },
    'wavetable.noiseWarpStrength': {
      title: 'Warp Strength',
      description: 'Controls how aggressively the noise field is warped.',
    },
    'wavetable.noiseCellScale': {
      title: 'Cell Scale',
      description: 'Sets the size of cells for cellular/voronoi noise types.',
    },
    'wavetable.noiseCellJitter': {
      title: 'Cell Jitter',
      description: 'Randomizes cell positions to soften or sharpen cell boundaries.',
    },
    'wavetable.noiseSteps': {
      title: 'Step Count',
      description: 'Number of discrete steps for stepped or faceted noise.',
    },
    'wavetable.noiseSeed': {
      title: 'Noise Seed',
      description: 'Offsets the noise pattern for seeded modes like Steps or Value.',
    },
    'wavetable.noisePolygonRadius': {
      title: 'Polygon Radius',
      description: 'Controls the overall size of the polygon noise shape.',
    },
    'wavetable.noisePolygonSides': {
      title: 'Polygon Sides',
      description: 'Sets the number of sides in the polygon.',
    },
    'wavetable.noisePolygonRotation': {
      title: 'Polygon Rotation',
      description: 'Rotates the polygon around its center.',
    },
    'wavetable.noisePolygonOutline': {
      title: 'Polygon Outline Width',
      description: 'Defines the outline thickness when using polygon noise.',
    },
    'wavetable.noisePolygonEdge': {
      title: 'Polygon Edge Radius',
      description: 'Softens polygon edges for a rounded profile.',
    },
    'wavetable.tilt': {
      title: 'Row Shift',
      description: 'Offsets each row horizontally to shear the stack. In Isometric mode, the full lattice shears together so the cells stay coherent.',
    },
    'wavetable.gap': {
      title: 'Line Gap',
      description: 'Spacing multiplier between rows. In Isometric mode, this sets the visible interior spacing of the cells before row shift shears the lattice.',
    },
    'wavetable.freq': {
      title: 'Frequency',
      description: 'Noise frequency along the X axis for this layer.',
    },
    'wavetable.noiseAngle': {
      title: 'Noise Angle',
      description: 'Rotates the sampled noise field itself. Use `Line Offset Angle` to set the direction the sampled noise pushes the lines.',
    },
    'wavetable.lineOffset': {
      title: 'Line Offset Angle',
      description: 'Direction for noise displacement (0° = north, 180° = south).',
    },
    'wavetable.continuity': {
      title: 'Continuity',
      description: 'Connects adjacent wavetable rows on one side (single) or both sides (double).',
    },
    'wavetable.edgeFadeMode': {
      title: 'Edge Noise Dampening Mode',
      description: 'Choose whether noise dampening affects the left, right, or both sides.',
    },
    'wavetable.edgeFade': {
      title: 'Edge Noise Dampening Amount',
      description: 'How strongly noise is dampened near the left/right edges (0-100).',
    },
    'wavetable.edgeFadeThreshold': {
      title: 'Edge Noise Dampening Threshold',
      description: 'Distance from the left/right edges where dampening applies (0-100). At 100, the full width is dampened.',
    },
    'wavetable.edgeFadeFeather': {
      title: 'Edge Noise Dampening Feather',
      description: 'Softens the dampening boundary over a 0-100 span (0 = hard edge).',
    },
    'wavetable.verticalFade': {
      title: 'Vertical Noise Dampening Amount',
      description: 'How strongly noise is dampened toward the top/bottom (0-100).',
    },
    'wavetable.verticalFadeThreshold': {
      title: 'Vertical Noise Dampening Threshold',
      description: 'Distance from the top/bottom edges where dampening applies (0-100). At 100, the full height is dampened.',
    },
    'wavetable.verticalFadeFeather': {
      title: 'Vertical Noise Dampening Feather',
      description: 'Softens the dampening boundary over a 0-100 span (0 = hard edge).',
    },
    'wavetable.verticalFadeMode': {
      title: 'Vertical Noise Dampening Mode',
      description: 'Choose whether noise dampening affects the top, bottom, or both.',
    },
    'wavetable.dampenExtremes': {
      title: 'Dampen Extremes',
      description: 'Scales back displacement near the top and bottom margins.',
    },
    'wavetable.overlapPadding': {
      title: 'Overlap Padding',
      description: 'Total vertical buffer (in mm) between adjacent rows. 0 allows overlap.',
    },
    'wavetable.flatCaps': {
      title: 'Flat Top/Bottom',
      description: 'Adds flat lines at the top and bottom of the wavetable stack.',
    },
    'rings.preset': {
      title: 'Style Preset',
      description: 'Load a tree-ring style preset. Applies all parameters at once. Switch to Custom to adjust parameters manually.',
    },
    'rings.rings': {
      title: 'Rings',
      description: 'Number of concentric rings to generate.',
    },
    'rings.centerDiameter': {
      title: 'Center Diameter',
      description: 'Inner opening diameter in canvas units (mm). Cannot exceed Outer Diameter — clamped automatically. 0 = no center hole.',
    },
    'rings.outerDiameter': {
      title: 'Outer Diameter',
      description: 'Sets the outer boundary diameter in canvas units (mm). The outermost bark ring always anchors exactly here. 0 = no rings drawn. New layers default to the canvas short-edge diameter.',
    },
    'rings.noiseProjection': {
      title: 'Noise Projection',
      body: `
        <p class="modal-text"><strong>Top Down</strong> treats the noise as one global XY plane under the full artwork, so every ring passes through the same field.</p>
        <p class="modal-text"><strong>Concentric</strong> unwraps each ring into path space, runs noise from one end of the loop to the other, then seam-corrects the result so the ring still closes cleanly.</p>
        <p class="modal-text"><strong>Orbit Field</strong> preserves the legacy ring-local sampler, orbiting noise around each ring instead of reading from a shared world field.</p>
      `,
    },
    'rings.noiseType': {
      title: 'Noise Type',
      description: 'Chooses the noise field used to perturb ring radii.',
    },
    'rings.amplitude': {
      title: 'Noise Amplitude',
      description: 'Strength of the ring displacement from the base radius.',
    },
    'rings.noiseScale': {
      title: 'Noise Scale',
      description: 'Controls the frequency of the selected Rings noise field. For polygon noise, larger values produce a larger polygon footprint.',
    },
    'rings.noiseOffsetX': {
      title: 'Noise Offset X',
      description: 'Shifts the Rings noise field on the X axis before sampling.',
    },
    'rings.noiseOffsetY': {
      title: 'Noise Offset Y',
      description: 'Shifts the Rings noise field on the Y axis before sampling.',
    },
    'rings.noiseLayer': {
      title: 'Ring Drift',
      description:
        'Offsets each ring to a different slice of the current Rings sampler. In Concentric it moves stacked rings onto neighboring path bands; in Orbit Field it shifts the legacy ring-local orbit.',
    },
    'rings.noisePathSpan': {
      title: 'Path Span',
      description:
        'Controls how much path-space is traversed over one full revolution in Concentric mode. Larger values reveal more of the noise field around each ring; smaller values stretch the same field across the loop.',
    },
    'rings.noiseOrbitRadius': {
      title: 'Orbit Radius',
      description: 'Sets the radius of the orbital sampling path used by Orbit Field mode.',
    },
    'rings.gap': {
      title: 'Ring Gap',
      description: 'Base spacing multiplier between rings. Combined with the inner/outer gap curve for variable spacing.',
    },
    'rings.gapCurveStart': {
      title: 'Inner Gap',
      description: 'Gap multiplier at the innermost ring. Values above 1 make inner rings wider than the base gap, simulating fast early growth.',
    },
    'rings.gapCurveEnd': {
      title: 'Outer Gap',
      description: 'Gap multiplier at the outermost non-bark ring. Values below 1 compress outer rings, simulating slower late growth.',
    },
    'rings.spacingVariance': {
      title: 'Spacing Variance',
      description: 'Adds per-ring noise perturbation to gap width, simulating boom and stress growth years. 0 = uniform spacing.',
    },
    'rings.barkRings': {
      title: 'Bark Rings',
      description: 'Number of outermost rings treated as bark and compressed to the Bark Gap fraction. 0 disables the bark zone.',
    },
    'rings.barkGap': {
      title: 'Bark Gap',
      description: 'Absolute spacing between bark rings in canvas units (mm). Independent of wood ring count, gap, or noise — only barkGap controls bark-ring spacing.',
    },
    'rings.barkType': {
      title: 'Bark Style',
      description: 'Surface texture applied to bark rings. Smooth = plain concentric circles (default). Each style has its own parameter set that appears below the selector.',
    },
    'rings.barkRoughness': {
      title: 'Roughness',
      description: 'Amplitude of high-frequency bumps added to each bark ring. Higher values create more jagged, irregular bark edges.',
    },
    'rings.barkRoughnessConfinement': {
      title: 'Confinement',
      description: 'Scales roughness displacement relative to full amplitude. Lower values tighten the bark lines closer to their nominal radius, preventing excessive spreading between rings.',
    },
    'rings.barkFreq': {
      title: 'Frequency',
      description: 'Number of bump cycles around each bark ring. Low values produce large rolling waves; high values produce fine jagged serrations.',
    },
    'rings.barkFurrowCount': {
      title: 'Furrow Count',
      description: 'Number of radial grooves running around the bark zone. Grooves are placed at random angles and shared across all bark rings.',
    },
    'rings.barkFurrowDepth': {
      title: 'Furrow Depth',
      description: 'How deeply each groove cuts into the bark ring radius.',
    },
    'rings.barkFurrowWidth': {
      title: 'Furrow Width',
      description: 'Angular half-width of each groove as a fraction of π. Larger values make wide, shallow trenches; smaller values make narrow, knife-cut slots.',
    },
    'rings.barkPlateCount': {
      title: 'Plate Count',
      description: 'Number of bark plates around the circumference. Each plate is a raised arc segment separated from its neighbors by narrow troughs.',
    },
    'rings.barkPlateRelief': {
      title: 'Plate Relief',
      description: 'Height of each plate above the base bark radius. Higher values produce more pronounced raised plateaus.',
    },
    'rings.barkPlateVariance': {
      title: 'Plate Variance',
      description: 'Per-ring randomization of plate height and angular offset, so successive bark rings do not align perfectly.',
    },
    'rings.barkPaperStrips': {
      title: 'Strip Count',
      description: 'Number of peeling strip sections per ring. Each strip lifts away from the base radius as a smooth arc, like curling paper bark.',
    },
    'rings.barkPaperPeel': {
      title: 'Peel Lift',
      description: 'How far each strip peels outward from the base bark ring. Zero = flat; high values = pronounced curling arcs.',
    },
    'rings.barkPaperJitter': {
      title: 'Strip Jitter',
      description: 'Random angular offset applied to each strip boundary per ring, so strips on adjacent rings do not align.',
    },
    'rings.barkFiberCount': {
      title: 'Fiber Count',
      description: 'Number of longitudinal fiber strands modulating each bark ring. High counts produce a fine, closely-packed fibrous texture.',
    },
    'rings.barkFiberAmplitude': {
      title: 'Fiber Amplitude',
      description: 'Radial oscillation strength of each fiber strand. Higher values make each ring visibly corrugated.',
    },
    'rings.barkFiberPhaseShift': {
      title: 'Phase Shift',
      description: 'How much the fiber pattern rotates between successive bark rings. Values near 0.5 create a woven interlocking appearance across rings.',
    },
    'rings.barkScaleColumns': {
      title: 'Scale Count',
      description: 'Number of scales around the circumference. Each scale is a one-sided raised arc, like overlapping fish scales.',
    },
    'rings.barkScaleRelief': {
      title: 'Scale Relief',
      description: 'Height of each scale arc above the base ring radius.',
    },
    'rings.barkScaleTaper': {
      title: 'Scale Taper',
      description: 'Controls the sharpness of the scale shape. Lower values produce flatter, broader scales; higher values produce more pointed tips.',
    },
    'rings.barkCrackDensity': {
      title: 'Crack Count',
      description: 'Number of V-notch cracks cut into the bark ring circumference. Cracks appear at random angles and span all bark rings.',
    },
    'rings.barkCrackDepth': {
      title: 'Crack Depth',
      description: 'How deeply each crack cuts inward from the base bark ring radius.',
    },
    'rings.barkCrackWidth': {
      title: 'Crack Width',
      description: 'Angular half-width of each crack as a fraction of π. Narrow values produce sharp fissures; wider values produce broad valleys.',
    },
    'rings.barkLenticleCount': {
      title: 'Lenticle Count',
      description: 'Number of lens-shaped pore depressions per ring. Lenticels are evenly spaced with a small per-ring angular stagger.',
    },
    'rings.barkLenticleDepth': {
      title: 'Lenticle Depth',
      description: 'How deeply each lenticle presses inward from the ring surface.',
    },
    'rings.barkLenticleWidth': {
      title: 'Lenticle Width',
      description: 'Angular width of each lenticle opening. Smaller values produce narrow slots; larger values produce wide oval indentations.',
    },
    'rings.barkWeaveFreq': {
      title: 'Weave Frequency',
      description: 'Number of oscillation cycles projected along the weave axis. Higher values tighten the weave grid.',
    },
    'rings.barkWeaveAmplitude': {
      title: 'Weave Amplitude',
      description: 'Radial oscillation strength of each ring in the woven pattern. Alternating rings go in opposite phase, producing an interlocking herringbone.',
    },
    'rings.barkWeaveAngle': {
      title: 'Weave Angle',
      description: 'Direction of the weave axis (0–180°). Rotating this changes the orientation of the diagonal pattern.',
    },
    'rings.breakCount': {
      title: 'Break Count',
      description: 'Number of radial breaks — narrow gaps cut through all rings at random angles, like axe splits in a cross-section. 0 = no breaks.',
    },
    'rings.breakRadius': {
      title: 'Break Radius',
      description: 'Radial range (as % of total radius) within which breaks can appear. Drag the min and max handles to restrict breaks to a ring zone.',
    },
    'rings.breakLengthVariance': {
      title: 'Radius Variance',
      description: 'Randomly varies how far each break extends across the radius range. 0 = all breaks span the full range; 1 = high length variation.',
    },
    'rings.breakNoiseSeed': {
      title: 'Break Seed',
      description: 'Seed for break placement, independent of the global seed. Change this to reposition breaks without affecting rings, rays, or knots.',
    },
    'rings.breakWidth': {
      title: 'Break Width',
      description: 'Angular width of each break gap in degrees. Drag min/max handles to set the range — each break draws a random width from that range.',
    },
    'rings.breakWidthVariance': {
      title: 'Width Variance',
      description: 'Randomly varies the angular width of each break within the Break Width range. 0 = all breaks are the same width.',
    },
    'rings.centerDrift': {
      title: 'Center Drift',
      description: 'Maximum pixels of random walk applied to each successive ring center, simulating eccentric off-center growth.',
    },
    'rings.biasStrength': {
      title: 'Bias Strength',
      description: 'Elliptical deformation strength (0–1). One side of the ring grows wider, like a tree on a slope or in prevailing wind.',
    },
    'rings.biasAngle': {
      title: 'Bias Direction',
      description: 'Compass direction (degrees) of the wider side of the elliptical bias.',
    },
    'rings.rayCount': {
      title: 'Medullary Rays',
      description: 'Number of short radial grain segments scattered across the cross-section, simulating medullary ray cells visible in wood.',
    },
    'rings.rayLength': {
      title: 'Ray Length',
      description: 'Length of each medullary ray expressed in ring-gap units. 2.5 means each ray spans roughly 2.5 inter-ring spacings.',
    },
    'rings.rayInnerFraction': {
      title: 'Ray Start',
      description: 'Radial fraction (0–0.7) where rays begin. 0 starts rays at the center; 0.15 starts them 15% of the way from center to edge.',
    },
    'rings.raySeed': {
      title: 'Ray Seed',
      description: 'Seed for medullary ray placement, independent of the global seed. Changing this repositions rays without affecting rings or knots.',
    },
    'rings.rayLengthVariance': {
      title: 'Length Variance',
      description: 'Random variation in individual ray lengths (0 = uniform, 1 = high variation around the base Ray Length).',
    },
    'rings.knotCount': {
      title: 'Knot Count',
      description: 'Number of knot distortions, placed randomly by seed. Knots warp rings inward or outward where a branch once attached.',
    },
    'rings.knotSeed': {
      title: 'Knot Seed',
      description: 'Seed for knot placement, independent of the global seed. Change this to reposition knots without affecting rings, rays, or breaks.',
    },
    'rings.knotIntensity': {
      title: 'Knot Strength',
      description: 'Maximum radial warp of a knot, in multiples of the average ring gap. Higher values create more dramatic bulges.',
    },
    'rings.knotStrengthVariance': {
      title: 'Knot Strength Variance',
      description: 'Random variation in strength across individual knots (0 = all equal, 1 = high variation).',
    },
    'rings.knotDirection': {
      title: 'Knot Direction',
      description: 'Outer: rings bulge outward. Inner: rings indent inward. Both: each knot randomly picks a direction.',
    },
    'rings.knotSpread': {
      title: 'Knot Size',
      description: 'Angular width (degrees) of each knot\'s influence zone. Larger values create wider, softer distortions.',
    },
    'rings.knotSizeVariance': {
      title: 'Knot Size Variance',
      description: 'Random variation in angular size across individual knots (0 = all equal, 1 = high variation).',
    },
    'rings.knotSize': {
      title: 'Knot Ring Reach',
      description: 'How many ring-gap widths each knot\'s warp extends radially. Higher values spread the distortion across more rings.',
    },
    'rings.vMarkCount': {
      title: 'V-Mark Count',
      description: 'Number of V-marking distortions. V-marks create sharp inward chevron dips where bark inclusions compressed the growth rings.',
    },
    'rings.vMarkDepth': {
      title: 'V-Mark Depth',
      description: 'Maximum inward displacement at the tip of each V-mark, in canvas units. Higher values make the V more pronounced.',
    },
    'rings.vMarkSpread': {
      title: 'V-Mark Spread',
      description: 'Angular half-width of each V-mark in degrees. Smaller values produce a sharper, more pointed V; larger values widen it.',
    },
    'rings.vMarkSize': {
      title: 'V-Mark Ring Reach',
      description: 'Radial extent of each V-mark across ring layers. Higher values spread the V across more rings.',
    },
    'rings.vMarkSeed': {
      title: 'V-Mark Seed',
      description: 'Seed for V-mark placement, independent of the global seed. Change this to reposition V-marks without affecting other features.',
    },
    'rings.scarCount': {
      title: 'Scar Count',
      description: 'Number of healed wound scars. Scars create inward depressions that narrow and shallow toward outer rings as the tree heals over time.',
    },
    'rings.scarDepth': {
      title: 'Scar Depth',
      description: 'Maximum inward depth of the scar at the wound ring, in canvas units. Depth decreases toward outer rings as healing progresses.',
    },
    'rings.scarWidth': {
      title: 'Scar Width',
      description: 'Angular width of the scar at the wound ring, in degrees. Narrows progressively toward outer rings as the tree closes over the wound.',
    },
    'rings.scarSize': {
      title: 'Healing Rate',
      description: 'Number of rings over which the scar fully heals. Lower values produce rapid closure; higher values leave a long trailing scar.',
    },
    'rings.scarSeed': {
      title: 'Scar Seed',
      description: 'Seed for scar placement, independent of the global seed. Change this to reposition scars without affecting other features.',
    },
    'rings.thickRingCount': {
      title: 'Cluster Count',
      description: 'Number of thick-ring clusters — zones where rings grow tightly together, simulating drought or stress years visible as dense banding.',
    },
    'rings.thickRingDensity': {
      title: 'Compression',
      description: 'How tightly rings are compressed within each cluster (0 = no compression, 1 = rings nearly touching). Other rings spread to compensate.',
    },
    'rings.thickRingWidth': {
      title: 'Cluster Width',
      description: 'Number of rings on each side of the cluster center that are compressed. Higher values create wider, more gradual compression bands.',
    },
    'rings.thickRingSeed': {
      title: 'Cluster Seed',
      description: 'Seed for thick-ring cluster placement, independent of the global seed. Change this to redistribute clusters without affecting other features.',
    },
    'rings.crackCount': {
      title: 'Crack Count',
      description: 'Number of radial cracks radiating inward from the outer bark — called radial shakes or heart checks in lumber science.',
    },
    'rings.crackDepth': {
      title: 'Crack Depth',
      description: 'How far each crack penetrates inward as a fraction of the outer radius (0 = surface only, 1 = nearly to center).',
    },
    'rings.crackSpread': {
      title: 'Crack Width',
      description: 'Angular width of each crack opening at the outer edge, in degrees. The crack tapers to a point as it goes inward.',
    },
    'rings.crackNoise': {
      title: 'Crack Roughness',
      description: 'Amount of lateral wobble along each crack arm, for an organic hand-split appearance. 0 = straight geometric lines.',
    },
    'rings.crackSeed': {
      title: 'Crack Seed',
      description: 'Seed for crack placement, independent of the global seed. Change this to reposition cracks without affecting other features.',
    },
    'rings.crackOutline': {
      title: 'Crack Outline',
      description: 'When enabled, draws each crack as a single closed outline path instead of two separate arm strokes.',
    },
    'rings.offsetX': {
      title: 'Ring Offset X',
      description: 'Moves the ring stack horizontally before transforms.',
    },
    'rings.offsetY': {
      title: 'Ring Offset Y',
      description: 'Moves the ring stack vertically before transforms.',
    },
    'topo.resolution': {
      title: 'Resolution',
      description: 'Grid resolution used for sampling the scalar field.',
    },
    'topo.levels': {
      title: 'Contour Levels',
      description: 'Number of contour bands extracted from the scalar field.',
    },
    'topo.fieldWeight': {
      title: 'Field Weight',
      description: 'Controls how strongly this noise layer contributes to the combined height field.',
    },
    'topo.noiseType': {
      title: 'Noise Type',
      description: 'Selects the base noise used to create the height field.',
    },
    'topo.noiseScale': {
      title: 'Noise Scale',
      description: 'Controls how quickly noise values change across the field. For polygon noise, larger values produce a larger polygon footprint.',
    },
    'topo.noiseOffsetX': {
      title: 'Noise Offset X',
      description: 'Shifts the noise field sampling in X.',
    },
    'topo.noiseOffsetY': {
      title: 'Noise Offset Y',
      description: 'Shifts the noise field sampling in Y.',
    },
    'topo.octaves': {
      title: 'Octaves',
      description: 'Number of noise layers blended into the height field.',
    },
    'topo.lacunarity': {
      title: 'Lacunarity',
      description: 'Controls how quickly noise frequency increases per octave.',
    },
    'topo.gain': {
      title: 'Gain',
      description: 'Controls how much each octave contributes to the height field.',
    },
    'topo.sensitivity': {
      title: 'Sensitivity',
      description: 'Adjusts contrast in the field before extracting contours.',
    },
    'topo.thresholdOffset': {
      title: 'Threshold Offset',
      description: 'Shifts all contour thresholds up or down.',
    },
    'topo.mappingMode': {
      title: 'Mapping Mode',
      description: 'Selects how contours are traced and smoothed.',
    },
    'rainfall.count': {
      title: 'Drop Count',
      description: 'Number of rain traces generated across the canvas.',
    },
    'rainfall.traceLength': {
      title: 'Trace Length',
      description: 'Length of each rain streak in millimeters.',
    },
    'rainfall.lengthJitter': {
      title: 'Length Jitter',
      description: 'Adds randomized variation to the streak length.',
    },
    'rainfall.traceStep': {
      title: 'Trace Step',
      description: 'Distance between points along each trace.',
    },
    'rainfall.stepJitter': {
      title: 'Step Jitter',
      description: 'Randomizes spacing between points along each trace.',
    },
    'rainfall.turbulence': {
      title: 'Turbulence',
      description: 'Adds jitter to rain direction over time.',
    },
    'rainfall.gustStrength': {
      title: 'Gust Strength',
      description: 'Adds slower, broader directional gusts to the rain.',
    },
    'rainfall.rainfallAngle': {
      title: 'Rainfall Angle',
      description: 'Sets the direction the droplet head faces (0° = north, 180° = south).',
    },
    'rainfall.angleJitter': {
      title: 'Angle Jitter',
      description: 'Random variation applied to each drop’s direction.',
    },
    'rainfall.windAngle': {
      title: 'Wind Angle',
      description: 'Direction of wind influence on the rain (0° = north, 180° = south).',
    },
    'rainfall.windStrength': {
      title: 'Wind Strength',
      description: 'Scales the wind’s influence on the rain direction.',
    },
    'rainfall.dropRotate': {
      title: 'Drop Head Rotate',
      description: 'Rotates the droplet head relative to the rain direction.',
    },
    'rainfall.dropSize': {
      title: 'Droplet Size',
      description: 'Size of the droplet marker at the end of each trace.',
    },
    'rainfall.dropSizeJitter': {
      title: 'Drop Size Jitter',
      description: 'Adds size variation to droplets for more organic rain.',
    },
    'rainfall.dropShape': {
      title: 'Droplet Shape',
      description: 'Selects the marker shape for droplets.',
    },
    'rainfall.dropFill': {
      title: 'Droplet Fill',
      description: 'Adds a fill-style texture inside droplets.',
    },
    'fill.type': {
      title: 'Fill Type',
      description: 'The pattern style used to fill enclosed shapes (hatch, wave, stipple, contour, etc.).',
    },
    'fill.density': {
      title: 'Fill Density',
      description: 'Controls how tightly fill strokes or dots are packed inside the shape.',
    },
    'fill.angle': {
      title: 'Fill Angle',
      description: 'Rotates the fill pattern. For hatch fills: rotates line direction. For spiral/radial: sets the start angle.',
    },
    'fill.amplitude': {
      title: 'Fill Amplitude',
      description: 'Wave height or zigzag height as a multiplier (1.0 = default). Only shown for wave-based fills.',
    },
    'fill.dotSize': {
      title: 'Dot Size',
      description: 'Dot radius as a multiplier (1.0 = default). Only shown for stipple and grid fills.',
    },
    'fill.padding': {
      title: 'Fill Padding (mm)',
      description: 'Insets the fill from the shape boundary by this many mm, leaving a visible margin.',
    },
    'fill.shiftX': {
      title: 'Shift X',
      description: 'Shifts the fill pattern origin horizontally, creating a phase offset.',
    },
    'fill.shiftY': {
      title: 'Shift Y',
      description: 'Shifts the fill pattern origin vertically, creating a phase offset.',
    },
    'rainfall.widthMultiplier': {
      title: 'Rain Width',
      description: 'Duplicates traces to simulate thicker rainfall.',
    },
    'rainfall.thickeningMode': {
      title: 'Thickening Mode',
      description: 'How duplicate traces are built (parallel, snake, sinusoidal).',
    },
    'rainfall.trailBreaks': {
      title: 'Trail Breaks',
      description: 'Adds controlled breaks and gaps to the rain streaks.',
    },
    'rainfall.breakRandomness': {
      title: 'Break Randomness',
      description: 'Adds randomness to break timing across all trail modes.',
    },
    'rainfall.breakSpacing': {
      title: 'Break Spacing',
      description: 'Average spacing between breaks along the trail.',
    },
    'rainfall.breakLengthJitter': {
      title: 'Length Randomization',
      description: 'Randomizes the length of each trail segment.',
    },
    'rainfall.breakWidthJitter': {
      title: 'Width Randomization',
      description: 'Randomizes the gap width between trail segments.',
    },
    'rainfall.silhouette': {
      title: 'Silhouette Image',
      description: 'Drops are generated inside the opaque area of the image.',
    },
    'rainfall.silhouetteWidth': {
      title: 'Silhouette Width',
      description: 'Width of each silhouette tile in millimeters.',
    },
    'rainfall.silhouetteHeight': {
      title: 'Silhouette Height',
      description: 'Height of each silhouette tile in millimeters.',
    },
    'rainfall.silhouetteTilesX': {
      title: 'Tiling X',
      description: 'Number of silhouette tiles across the canvas.',
    },
    'rainfall.silhouetteTilesY': {
      title: 'Tiling Y',
      description: 'Number of silhouette tiles down the canvas.',
    },
    'rainfall.silhouetteSpacing': {
      title: 'Tile Spacing',
      description: 'Spacing between silhouette tiles in millimeters.',
    },
    'rainfall.silhouetteOffsetX': {
      title: 'Offset X',
      description: 'Horizontal offset applied to the silhouette tile grid.',
    },
    'rainfall.silhouetteOffsetY': {
      title: 'Offset Y',
      description: 'Vertical offset applied to the silhouette tile grid.',
    },
    'rainfall.silhouetteInvert': {
      title: 'Invert Silhouette',
      description: 'Swaps filled and transparent regions of the silhouette.',
    },
    'rainfall.noiseApply': {
      title: 'Noise Target',
      description: 'Choose whether the noise stack affects trails, droplets, or both.',
    },
    'spiral.loops': {
      title: 'Loops',
      description: 'Number of revolutions in the spiral.',
    },
    'spiral.res': {
      title: 'Resolution',
      description: 'Points per quadrant. Higher values create smoother spirals.',
    },
    'spiral.startR': {
      title: 'Inner Radius',
      description: 'Starting radius of the spiral.',
    },
    'spiral.noiseAmp': {
      title: 'Noise Amp',
      description: 'Amount of radial jitter applied to the spiral.',
    },
    'spiral.noiseFreq': {
      title: 'Noise Freq',
      description: 'How quickly the noise changes around the spiral.',
    },
    'spiral.pulseAmp': {
      title: 'Pulse Amp',
      description: 'Adds a rhythmic bulge to the spiral radius for a breathing effect.',
    },
    'spiral.pulseFreq': {
      title: 'Pulse Freq',
      description: 'Controls how many pulses appear per revolution.',
    },
    'spiral.angleOffset': {
      title: 'Angle Offset',
      description: 'Rotates the spiral start angle in degrees.',
    },
    'spiral.axisSnap': {
      title: 'Axis Snap',
      description: 'Aligns spiral points to the X/Y axes at every quadrant.',
    },
    'spiral.close': {
      title: 'Close Spiral',
      description: 'Connects the outer end back into the spiral with a smooth closing curve.',
    },
    'spiral.closeFeather': {
      title: 'Close Feather',
      description: 'Controls how softly the closing curve arcs into the next loop.',
    },
    'grid.rows': {
      title: 'Rows',
      description: 'Number of horizontal grid lines.',
    },
    'grid.cols': {
      title: 'Cols',
      description: 'Number of vertical grid lines.',
    },
    'grid.distortion': {
      title: 'Distortion',
      description: 'Strength of the grid displacement.',
    },
    'grid.noiseScale': {
      title: 'Noise Scale',
      description: 'Controls the scale of this Noise Rack layer inside the grid field. For polygon noise, larger values produce a larger polygon footprint.',
    },
    'grid.noiseOffsetX': {
      title: 'Noise Offset X',
      description: 'Shifts a grid noise layer on the X axis before sampling.',
    },
    'grid.noiseOffsetY': {
      title: 'Noise Offset Y',
      description: 'Shifts a grid noise layer on the Y axis before sampling.',
    },
    'grid.fieldWeight': {
      title: 'Field Weight',
      description: 'Controls how strongly this noise layer contributes to the combined grid field.',
    },
    'grid.octaves': {
      title: 'Octaves',
      description: 'Number of octave samples inside this grid noise layer.',
    },
    'grid.lacunarity': {
      title: 'Lacunarity',
      description: 'Controls how quickly frequency increases across grid-layer octaves.',
    },
    'grid.gain': {
      title: 'Gain',
      description: 'Controls how much each octave contributes to the grid-layer field.',
    },
    'grid.chaos': {
      title: 'Chaos',
      description: 'Random jitter added after distortion.',
    },
    'grid.type': {
      title: 'Mode',
      description: 'Warp bends both axes; Shift offsets rows vertically using noise.',
    },
    'phylla.shapeType': {
      title: 'Shape',
      description: 'Switch between true circles or polygonal markers.',
    },
    'phylla.count': {
      title: 'Count',
      description: 'Number of points in the phyllotaxis spiral.',
    },
    'phylla.spacing': {
      title: 'Spacing',
      description: 'Distance between successive points.',
    },
    'phylla.angleStr': {
      title: 'Angle',
      description: 'Divergence angle in degrees; near 137.5 yields sunflower-like spacing.',
    },
    'phylla.divergence': {
      title: 'Divergence',
      description: 'Scales radial growth rate.',
    },
    'phylla.noiseInf': {
      title: 'Noise Influence',
      description: 'Adds organic wobble to point positions.',
    },
    'phylla.noiseScale': {
      title: 'Noise Scale',
      description: 'Controls the scale of this Noise Rack layer inside the phyllotaxis field. For polygon noise, larger values produce a larger polygon footprint.',
    },
    'phylla.noiseOffsetX': {
      title: 'Noise Offset X',
      description: 'Shifts a phyllotaxis noise layer on the X axis before sampling.',
    },
    'phylla.noiseOffsetY': {
      title: 'Noise Offset Y',
      description: 'Shifts a phyllotaxis noise layer on the Y axis before sampling.',
    },
    'phylla.fieldWeight': {
      title: 'Field Weight',
      description: 'Controls how strongly this noise layer contributes to the combined phyllotaxis field.',
    },
    'phylla.octaves': {
      title: 'Octaves',
      description: 'Number of octave samples inside this phyllotaxis noise layer.',
    },
    'phylla.lacunarity': {
      title: 'Lacunarity',
      description: 'Controls how quickly frequency increases across phyllotaxis-layer octaves.',
    },
    'phylla.gain': {
      title: 'Gain',
      description: 'Controls how much each octave contributes to the phyllotaxis-layer field.',
    },
    'phylla.dotSize': {
      title: 'Dot Size',
      description: 'Radius of each dot marker.',
    },
    'phylla.sides': {
      title: 'Sides',
      description: 'Number of sides for polygon markers.',
    },
    'phylla.sideJitter': {
      title: 'Side Jitter',
      description: 'Random variation applied to polygon side count.',
    },
    'boids.count': {
      title: 'Agents',
      description: 'Number of flocking agents.',
    },
    'boids.steps': {
      title: 'Duration',
      description: 'Number of simulation steps; controls trail length.',
    },
    'boids.speed': {
      title: 'Speed',
      description: 'Maximum speed of each agent.',
    },
    'boids.sepDist': {
      title: 'Separation',
      description: 'Radius where agents repel each other.',
    },
    'boids.alignDist': {
      title: 'Alignment',
      description: 'Radius where agents align velocities.',
    },
    'boids.cohDist': {
      title: 'Cohesion',
      description: 'Radius where agents steer toward the group center.',
    },
    'boids.force': {
      title: 'Steer Force',
      description: 'Strength of steering corrections.',
    },
    'boids.sepWeight': {
      title: 'Separation Weight',
      description: 'Balances how strongly agents avoid neighbors.',
    },
    'boids.alignWeight': {
      title: 'Alignment Weight',
      description: 'Balances how strongly agents match velocity.',
    },
    'boids.cohWeight': {
      title: 'Cohesion Weight',
      description: 'Balances how strongly agents steer toward the group center.',
    },
    'boids.mode': {
      title: 'Mode',
      description: 'Switches between bird-like flocking and fish-like schooling.',
    },
    'attractor.type': {
      title: 'Attractor Type',
      description: 'Selects the chaotic system used to generate the path.',
    },
    'attractor.scale': {
      title: 'Scale',
      description: 'Overall size of the attractor.',
    },
    'attractor.iter': {
      title: 'Iterations',
      description: 'Number of steps plotted in the attractor.',
    },
    'attractor.sigma': {
      title: 'Sigma',
      description: 'Lorenz system parameter controlling X/Y coupling.',
    },
    'attractor.rho': {
      title: 'Rho',
      description: 'Lorenz system parameter influencing chaotic spread.',
    },
    'attractor.beta': {
      title: 'Beta',
      description: 'Lorenz system parameter affecting Z damping.',
    },
    'attractor.dt': {
      title: 'Time Step',
      description: 'Integration step size; smaller values are smoother but slower.',
    },
    'hyphae.sources': {
      title: 'Sources',
      description: 'Number of starting growth points.',
    },
    'hyphae.steps': {
      title: 'Growth Steps',
      description: 'Number of growth iterations.',
    },
    'hyphae.branchProb': {
      title: 'Branch Probability',
      description: 'Chance of branching at each segment.',
    },
    'hyphae.angleVar': {
      title: 'Wiggle',
      description: 'Randomness in branch direction.',
    },
    'hyphae.segLen': {
      title: 'Segment Length',
      description: 'Length of each growth segment.',
    },
    'hyphae.maxBranches': {
      title: 'Max Branches',
      description: 'Hard cap to prevent runaway growth.',
    },
    'shapePack.shape': {
      title: 'Shape',
      description: 'Circle outputs true SVG circles; Polygon uses segments.',
    },
    'shapePack.count': {
      title: 'Max Count',
      description: 'Maximum number of shapes to place.',
    },
    'shapePack.radiusRange': {
      title: 'Radius Range',
      description: 'Minimum and maximum radius for each packed shape (in millimeters).',
    },
    'shapePack.padding': {
      title: 'Padding',
      description: 'Extra spacing between shapes.',
    },
    'shapePack.attempts': {
      title: 'Attempts',
      description: 'Placement iterations before stopping.',
    },
    'shapePack.segments': {
      title: 'Segments',
      description: 'Polygon sides (min 3). Ignored when Shape = Circle.',
    },
    'shapePack.rotationStep': {
      title: 'Rotation Step',
      description: 'Adds rotation per shape index (function-based offset).',
    },
    'shapePack.perspectiveType': {
      title: 'Perspective Type',
      description: 'Perspective warp applied to polygons (none, vertical, horizontal, radial).',
    },
    'shapePack.perspective': {
      title: 'Perspective Amount',
      description: 'Strength of the perspective warp. Negative values invert the effect.',
    },
    'shapePack.perspectiveX': {
      title: 'Perspective X',
      description: 'Horizontal offset for the perspective origin (mm).',
    },
    'shapePack.perspectiveY': {
      title: 'Perspective Y',
      description: 'Vertical offset for the perspective origin (mm).',
    },
    'petalis.preset': {
      title: 'Preset',
      description: 'Loads a curated Petalis recipe. Presets overwrite petal, distribution, center, and shading parameters.',
    },
    'petalis.petalProfile': {
      title: 'Petal Profile',
      description: 'Selects the base silhouette used to build each petal (oval, teardrop, lanceolate, etc.).',
    },
    'petalis.petalScale': {
      title: 'Petal Scale',
      description: 'Controls the overall petal size in millimeters before ring scaling or morphing is applied.',
    },
    'petalis.petalWidthRatio': {
      title: 'Width/Length Ratio',
      description: 'Sets how wide the petal is relative to its length. Lower values create thinner petals.',
    },
    'petalis.petalLengthRatio': {
      title: 'Length Ratio',
      description: 'Multiplies the petal length without changing the width ratio.',
    },
    'petalis.petalSizeRatio': {
      title: 'Size Ratio',
      description: 'Scales both width and length uniformly for the petal silhouette.',
    },
    'petalis.leafSidePos': {
      title: 'Side Position',
      description: 'Moves the widest point of the petal up or down along its length.',
    },
    'petalis.leafSideWidth': {
      title: 'Side Width',
      description: 'Scales the maximum width defined by the side control point.',
    },
    'petalis.petalSteps': {
      title: 'Petal Resolution',
      description: 'Number of points used to draw each petal. Higher values create smoother curves.',
    },
    'petalis.layering': {
      title: 'Layering',
      description: 'When enabled, inner petals visually occlude outer petals by clipping overlapping outlines.',
    },
    'petalis.anchorToCenter': {
      title: 'Anchor to Center Ring',
      description: 'Anchors petals to the central ring (central only, all petals, or off for free radial placement).',
    },
    'petalis.anchorRadiusRatio': {
      title: 'Anchor Radius Ratio',
      description: 'Scales the anchor radius used for petal attachment to the center ring.',
    },
    'petalis.tipSharpness': {
      title: 'Tip Sharpness',
      description: 'Controls how pointy the petal tip is while keeping the base rounded. At 0 the tip is fully rounded.',
    },
    'petalis.tipTwist': {
      title: 'Tip Rotate',
      description: 'Rotates the tip shape to create subtle spiraling at the petal tip.',
    },
    'petalis.centerCurlBoost': {
      title: 'Center Tip Rotate Boost',
      description: 'Boosts tip rotation for petals closer to the center to emphasize a curled core.',
    },
    'petalis.tipCurl': {
      title: 'Tip Rounding',
      description: 'Rounds the outer petal tip. 0 keeps a sharp edge, 1 approaches a semicircular tip.',
    },
    'petalis.baseFlare': {
      title: 'Base Flare',
      description: 'Flares the petal base outward, widening where it attaches to the center.',
    },
    'petalis.basePinch': {
      title: 'Base Pinch',
      description: 'Narrows the petal base for a tighter, tapered attachment.',
    },
    'petalis.edgeWaveAmp': {
      title: 'Edge Wave Amplitude',
      description: 'Adds waviness along petal edges. Higher values create deeper scallops.',
    },
    'petalis.edgeWaveFreq': {
      title: 'Edge Wave Frequency',
      description: 'Controls the number of wave cycles along each petal edge.',
    },
    'petalis.centerWaveBoost': {
      title: 'Center Wave Boost',
      description: 'Boosts edge waviness for petals nearer the center.',
    },
    'petalis.count': {
      title: 'Petal Count',
      description: 'Total number of petals when using a single ring layout.',
    },
    'petalis.ringMode': {
      title: 'Ring Mode',
      description: 'Chooses between a single ring or dual inner/outer rings.',
    },
    'petalis.innerCount': {
      title: 'Inner Petal Count',
      description: 'Number of petals in the inner ring when dual mode is enabled.',
    },
    'petalis.outerCount': {
      title: 'Outer Petal Count',
      description: 'Number of petals in the outer ring when dual mode is enabled.',
    },
    'petalis.ringSplit': {
      title: 'Ring Split',
      description: 'Controls how the radius range is divided between inner and outer rings.',
    },
    'petalis.innerOuterLock': {
      title: 'Inner = Outer',
      description: 'Locks the outer profile to mirror the inner profile while editing.',
    },
    'petalis.profileTransitionPosition': {
      title: 'Profile Transition Position',
      description: 'Sets the radial position where petals transition from inner profile to outer profile.',
    },
    'petalis.profileTransitionFeather': {
      title: 'Profile Transition Feather',
      description: 'Controls the blend width for transitioning from inner to outer profile.',
    },
    'petalis.ringOffset': {
      title: 'Ring Offset',
      description: 'Rotates the outer ring relative to the inner ring.',
    },
    'petalis.spiralMode': {
      title: 'Phyllotaxis Mode',
      description: 'Uses the golden angle or a custom angle to distribute petals radially.',
    },
    'petalis.customAngle': {
      title: 'Custom Angle',
      description: 'Custom phyllotaxis angle in degrees when Phyllotaxis Mode is set to Custom.',
    },
    'petalis.spiralTightness': {
      title: 'Spiral Tightness',
      description: 'Controls how quickly petals spiral out from the center.',
    },
    'petalis.radialGrowth': {
      title: 'Radial Growth',
      description: 'Scales the radial distance of petals from the center.',
    },
    'petalis.spiralStart': {
      title: 'Spiral Start',
      description: 'Sets where the spiral begins along the radial range (0 = center, 1 = edge).',
    },
    'petalis.spiralEnd': {
      title: 'Spiral End',
      description: 'Sets where the spiral ends along the radial range (lower values keep outer petals tighter).',
    },
    'petalis.centerSizeMorph': {
      title: 'Size Morph',
      description: 'Scales petals near the center up or down based on distance to the core.',
    },
    'petalis.centerSizeCurve': {
      title: 'Size Morph Curve',
      description: 'Controls how quickly size morphing ramps from center to outer ring.',
    },
    'petalis.centerShapeMorph': {
      title: 'Shape Morph',
      description: 'Blends between the petal profile and the center profile near the core.',
    },
    'petalis.centerProfile': {
      title: 'Center Profile',
      description: 'Profile used for petals near the center when shape morphing is active.',
    },
    'petalis.budMode': {
      title: 'Bud Mode',
      description: 'Shrinks and tightens petals near the center to create a closed bud.',
    },
    'petalis.budRadius': {
      title: 'Bud Radius',
      description: 'Controls how far from the center the bud effect spreads.',
    },
    'petalis.budTightness': {
      title: 'Bud Tightness',
      description: 'Strength of the bud squeeze; higher values pull petals tighter.',
    },
    'petalis.centerType': {
      title: 'Center Type',
      description: 'Selects the central element style (disk, dome, starburst, dot field, filament cluster).',
    },
    'petalis.centerRadius': {
      title: 'Center Radius',
      description: 'Sets the radius of the central element in millimeters.',
    },
    'petalis.centerDensity': {
      title: 'Center Density',
      description: 'Controls how many central elements are drawn (dots, rays, filaments).',
    },
    'petalis.centerFalloff': {
      title: 'Center Falloff',
      description: 'Reduces central element density toward the outer edge of the center.',
    },
    'petalis.centerRing': {
      title: 'Secondary Ring',
      description: 'Adds a ring of small dots around the center.',
    },
    'petalis.centerRingRadius': {
      title: 'Ring Radius',
      description: 'Radius of the secondary dot ring.',
    },
    'petalis.centerRingDensity': {
      title: 'Ring Density',
      description: 'Number of dots in the secondary ring.',
    },
    'petalis.centerConnectors': {
      title: 'Connect to Petals',
      description: 'Draws connector strokes between the center and nearby petals.',
    },
    'petalis.connectorCount': {
      title: 'Connector Count',
      description: 'How many connector strokes to generate.',
    },
    'petalis.connectorLength': {
      title: 'Connector Length',
      description: 'Length of each connector stroke in millimeters.',
    },
    'petalis.connectorJitter': {
      title: 'Connector Jitter',
      description: 'Random angular variance for connector placement.',
    },
    'petalis.countJitter': {
      title: 'Count Jitter',
      description: 'Randomizes petal counts per ring for more organic variability.',
    },
    'petalis.sizeJitter': {
      title: 'Size Jitter',
      description: 'Adds per-petal size variance for natural irregularity.',
    },
    'petalis.rotationJitter': {
      title: 'Rotation Jitter',
      description: 'Random rotation offset applied to each petal.',
    },
    'petalis.angularDrift': {
      title: 'Angular Drift',
      description: 'Adds a smooth angular drift across the petal sequence.',
    },
    'petalis.driftStrength': {
      title: 'Drift Strength',
      description: 'Controls how strongly drift affects petal rotation.',
    },
    'petalis.driftNoise': {
      title: 'Drift Noise',
      description: 'Controls each Noise Rack layer used to modulate Petalis angular drift.',
    },
    'petalis.radiusScale': {
      title: 'Radius Scale',
      description: 'Scales petal radius outward or inward across the ring.',
    },
    'petalis.radiusScaleCurve': {
      title: 'Radius Scale Curve',
      description: 'Controls how quickly the radius scale changes from center to edge.',
    },
    'petalis.centerModRippleAmount': {
      title: 'Center Ripple Amount',
      description: 'Amplitude of radial ripples applied to the center elements.',
    },
    'petalis.centerModType': {
      title: 'Center Modifier Type',
      description: 'Selects which modifier is applied to the center elements (ripple, twist, noise, etc.).',
    },
    'petalis.centerModRippleFrequency': {
      title: 'Center Ripple Frequency',
      description: 'Number of ripple cycles around the center.',
    },
    'petalis.centerModTwist': {
      title: 'Center Twist',
      description: 'Rotational twist applied across the center elements.',
    },
    'petalis.centerModNoiseAmount': {
      title: 'Center Noise Amount',
      description: 'Master strength applied to the center modifier Noise Rack output.',
    },
    'petalis.centerModNoiseScale': {
      title: 'Center Noise Scale',
      description: 'Legacy fallback scale for older documents. New work should use the nested Noise Rack layer scale controls.',
    },
    'petalis.centerModNoiseSeed': {
      title: 'Center Noise Seed',
      description: 'Seed used when initializing the center modifier Noise Rack.',
    },
    'petalis.centerModFalloff': {
      title: 'Center Falloff Strength',
      description: 'Compresses center elements toward the core based on radius.',
    },
    'petalis.centerModOffsetX': {
      title: 'Center Offset X',
      description: 'Offsets center elements horizontally in millimeters.',
    },
    'petalis.centerModOffsetY': {
      title: 'Center Offset Y',
      description: 'Offsets center elements vertically in millimeters.',
    },
    'petalis.centerModClip': {
      title: 'Center Clip Radius',
      description: 'Clips center elements to a maximum radius.',
    },
    'petalis.centerModCircularAmount': {
      title: 'Circular Offset Amount',
      description: 'Magnitude of circular offsets applied to ring elements.',
    },
    'petalis.centerModCircularRandomness': {
      title: 'Circular Offset Randomness',
      description: 'Controls how much random variation is applied to circular offsets.',
    },
    'petalis.centerModCircularDirection': {
      title: 'Circular Offset Bias',
      description: 'Biases the circular offset inward, outward, or both.',
    },
    'petalis.centerModCircularSeed': {
      title: 'Circular Offset Seed',
      description: 'Seed for the circular offset noise pattern.',
    },
    'petalis.petalModRippleAmount': {
      title: 'Petal Ripple Amount',
      description: 'Amplitude of ripples along the petal length.',
    },
    'petalis.petalModType': {
      title: 'Petal Modifier Type',
      description: 'Selects which modifier is applied to petals (ripple, twist, noise, shear, taper, offset).',
    },
    'petalis.petalModRippleFrequency': {
      title: 'Petal Ripple Frequency',
      description: 'Number of ripple cycles along each petal.',
    },
    'petalis.petalModTwist': {
      title: 'Petal Twist',
      description: 'Twists petals along their length for a corkscrew effect.',
    },
    'petalis.petalModNoiseAmount': {
      title: 'Petal Noise Amount',
      description: 'Master strength applied to the petal modifier Noise Rack output.',
    },
    'petalis.petalModNoiseScale': {
      title: 'Petal Noise Scale',
      description: 'Legacy fallback scale for older documents. New work should use the nested Noise Rack layer scale controls.',
    },
    'petalis.petalModNoiseSeed': {
      title: 'Petal Noise Seed',
      description: 'Seed used when initializing the petal modifier Noise Rack.',
    },
    'petalis.petalModShear': {
      title: 'Petal Shear',
      description: 'Shears petals diagonally to bias the silhouette.',
    },
    'petalis.petalModTaper': {
      title: 'Petal Taper',
      description: 'Tapers petals toward the tip or base depending on the sign.',
    },
    'petalis.petalModOffsetX': {
      title: 'Petal Offset X',
      description: 'Offsets petal geometry horizontally in millimeters.',
    },
    'petalis.petalModOffsetY': {
      title: 'Petal Offset Y',
      description: 'Offsets petal geometry vertically in millimeters.',
    },
    'petalis.shadingType': {
      title: 'Shading Type',
      description: 'Selects the shading style applied inside or along the petal.',
    },
    'petalis.shadingLineType': {
      title: 'Shading Line Type',
      description: 'Chooses solid, dashed, dotted, or stitch rendering for the shading strokes.',
    },
    'petalis.shadingLineSpacing': {
      title: 'Line Spacing',
      description: 'Distance between shading strokes in millimeters.',
    },
    'petalis.shadingDensity': {
      title: 'Line Density',
      description: 'Multiplies the number of shading strokes without changing the base spacing.',
    },
    'petalis.shadingJitter': {
      title: 'Line Jitter',
      description: 'Adds controlled randomness to the spacing of shading strokes.',
    },
    'petalis.shadingLengthJitter': {
      title: 'Length Jitter',
      description: 'Randomizes how far shading strokes extend along the petal.',
    },
    'petalis.shadingAngle': {
      title: 'Hatch Angle',
      description: 'Rotation of the shading strokes relative to the petal axis, without shifting the shading band position.',
    },
    'petalis.shadingWidthX': {
      title: 'Width X',
      description: 'Horizontal coverage of shading along the petal length (percentage).',
    },
    'petalis.shadingPosX': {
      title: 'Position X',
      description: 'Horizontal center position of the shading band (percentage).',
    },
    'petalis.shadingGapX': {
      title: 'Gap Width X',
      description: 'Horizontal gap carved out of the shading band (percentage).',
    },
    'petalis.shadingGapPosX': {
      title: 'Gap Position X',
      description: 'Horizontal location of the shading gap (percentage).',
    },
    'petalis.shadingWidthY': {
      title: 'Width Y',
      description: 'Vertical coverage of shading across the petal width (percentage).',
    },
    'petalis.shadingPosY': {
      title: 'Position Y',
      description: 'Vertical center position of the shading band (percentage).',
    },
    'petalis.shadingGapY': {
      title: 'Gap Width Y',
      description: 'Vertical gap carved out of the shading band (percentage).',
    },
    'petalis.shadingGapPosY': {
      title: 'Gap Position Y',
      description: 'Vertical location of the shading gap (percentage).',
    },
    'petalis.lightSource': {
      title: 'Set Light Source',
      description: 'Places a draggable light source marker on the canvas to preview lighting direction (in development).',
    },
    'terrain.preset': {
      title: 'Style Preset',
      description: 'Loads a curated set of terrain parameters (alpine, hills, canyon, archipelago, river delta, tundra) into all groups below. Switch back to Custom to keep your tweaks.',
    },
    'terrain.perspectiveMode': {
      title: 'Perspective Mode',
      description: 'Top-down draws scanlines without convergence. One-point projects rows toward a single vanishing point. One-point with Landscape Horizon adds an explicit horizontal line at the horizon to anchor the scene. Two-point converges to two distinct vanishing points along the horizon for an off-axis terrain look. Isometric uses parallel-oblique projection — no convergence but with a tilted depth axis.',
    },
    'terrain.horizonHeight': {
      title: 'Horizon Height',
      description: 'Vertical position of the horizon line where distant terrain converges (pinhole modes only).',
    },
    'terrain.vanishingPointX': {
      title: 'Vanishing Point X',
      description: 'Horizontal location of the single vanishing point on the horizon line.',
    },
    'terrain.vpLeftX': {
      title: 'Left Vanishing Point X',
      description: 'X position of the left-side vanishing point in two-point mode.',
    },
    'terrain.vpRightX': {
      title: 'Right Vanishing Point X',
      description: 'X position of the right-side vanishing point in two-point mode.',
    },
    'terrain.isoAngle': {
      title: 'Isometric Angle',
      description: 'Tilt of the depth axis in isometric mode (30° is the classic isometric look).',
    },
    'terrain.depthCompression': {
      title: 'Depth Compression',
      description: 'Strength of the perspective power-law that pulls distant rows toward the horizon. Higher values cluster scanlines at the back.',
    },
    'terrain.depthScale': {
      title: 'Depth Scale',
      description: 'Top-down only: spacing of scanlines down the canvas in pixel units.',
    },
    'terrain.depthSlices': {
      title: 'Depth Slices',
      description: 'Number of scanlines from horizon to viewer. More slices = denser linework but slower.',
    },
    'terrain.xResolution': {
      title: 'X Resolution',
      description: 'Sample points per scanline. Higher values pick up finer mountain detail.',
    },
    'terrain.occlusion': {
      title: 'Hidden-Line Removal',
      description: 'Clips occluded segments where closer terrain blocks the view of more distant rows. Disable for see-through wireframe.',
    },
    'terrain.mountainAmplitude': {
      title: 'Mountain Amplitude',
      description: 'Overall vertical scale of the mountain heightfield. 0 produces a flat plane.',
    },
    'terrain.mountainFrequency': {
      title: 'Mountain Frequency',
      description: 'Spatial frequency of the ridged base noise. Higher values make smaller, denser ridges.',
    },
    'terrain.mountainOctaves': {
      title: 'Mountain Octaves',
      description: 'Number of fractal noise octaves stacked. More octaves = rougher, more detailed terrain.',
    },
    'terrain.mountainLacunarity': {
      title: 'Mountain Lacunarity',
      description: 'Frequency multiplier between octaves. Standard fractal noise uses 2.0.',
    },
    'terrain.mountainGain': {
      title: 'Mountain Gain',
      description: 'Amplitude falloff per octave. Lower values produce smoother, less spiky terrain.',
    },
    'terrain.peakSharpness': {
      title: 'Peak Sharpness',
      description: 'Power applied to ridged noise to sharpen peaks. Low values give rounded hills, high values give jagged knife-edge ridges.',
    },
    'terrain.valleyCount': {
      title: 'Valley Count',
      description: 'Number of carved valleys layered onto the heightfield. 0 disables valleys.',
    },
    'terrain.valleyDepth': {
      title: 'Valley Depth',
      description: 'How deep each valley carves into the heightfield.',
    },
    'terrain.valleyWidth': {
      title: 'Valley Width',
      description: 'Cross-sectional width of each valley in pixel units.',
    },
    'terrain.valleyShape': {
      title: 'Valley Shape (V → U)',
      description: '0 = sharp V-shaped riverine valley. 1 = wide U-shaped glacial valley.',
    },
    'terrain.valleyMeander': {
      title: 'Valley Meander',
      description: 'Sinuosity of the valley axis. Higher values produce more curved, snaking valleys.',
    },
    'terrain.riversEnabled': {
      title: 'Enable Rivers',
      description: 'Traces steepest-descent flow from high points down to the canvas edge or water level. Each trace also carves into the heightfield.',
    },
    'terrain.riverCount': {
      title: 'River Count',
      description: 'Number of river traces to draw.',
    },
    'terrain.riverWidth': {
      title: 'River Width',
      description: 'Carving radius of each river in pixel units.',
    },
    'terrain.riverDepth': {
      title: 'River Depth',
      description: 'How much each river carves the underlying heightfield.',
    },
    'terrain.riverMeander': {
      title: 'River Meander',
      description: 'Side-to-side wiggle applied to the steepest-descent path.',
    },
    'terrain.oceansEnabled': {
      title: 'Enable Oceans',
      description: 'Clamps heights below the water level to a flat sea plane.',
    },
    'terrain.waterLevel': {
      title: 'Water Level',
      description: 'Sea-level height threshold. Anything below becomes flat water.',
    },
    'terrain.drawCoastline': {
      title: 'Draw Coastline',
      description: 'Renders the iso-contour where land meets water as an additional path.',
    },
  };


  const requireDeps = (name) => {
    if (!DEPS) {
      throw new Error(
        `InfoModals.${name} invoked before InfoModals.bind(deps) — load order broken`,
      );
    }
    return DEPS;
  };

  function showDuplicateNameError(name) {
    const { escapeHtml } = requireDeps('showDuplicateNameError');
    this.openModal({
      title: 'Name Unavailable',
      body: `<p class="modal-text">"${escapeHtml(name)}" is already in use. Layer names must be unique.</p>`,
    });
  }

  function showValueError(value, range) {
    const { escapeHtml } = requireDeps('showValueError');
    let detail = 'is outside the allowed range or format.';
    if (range && Number.isFinite(range.min) && Number.isFinite(range.max)) {
      const unit = range.unit ? `${range.unit}` : '';
      const fmt = (n) => {
        const p = Number.isFinite(range.precision) ? range.precision : undefined;
        const s = p !== undefined ? n.toFixed(p) : `${n}`;
        return `${s}${unit}`;
      };
      detail = `is outside the allowed range. Enter a value from ${fmt(range.min)} to ${fmt(range.max)}.`;
    }
    this.openModal({
      title: 'Invalid Value',
      body: `<p class="modal-text">"${escapeHtml(value)}" ${detail}</p>`,
    });
  }

  function showInfo(key) {
    const { buildPreviewPair } = requireDeps('showInfo');
    const info = INFO[key];
    if (!info) return;
    const illustration = info.hidePreview ? '' : buildPreviewPair(key, this);
    const bodyContent = info.body
      ? typeof info.body === 'function'
        ? info.body(this)
        : info.body
      : `<p class="modal-text">${info.description}</p>`;
    const body = `
      ${bodyContent}
      ${illustration}
    `;
    this.openModal({ title: info.title, body });
  }

  function attachInfoButton(labelEl, key) {
    requireDeps('attachInfoButton');
    if (!labelEl || labelEl.querySelector('.info-btn')) return;
    const doc = labelEl.ownerDocument || (typeof document !== 'undefined' ? document : null);
    if (!doc) return;
    const btn = doc.createElement('button');
    btn.type = 'button';
    btn.className = 'info-btn';
    btn.dataset.info = key;
    btn.setAttribute('aria-label', `Info about ${labelEl.textContent}`);
    btn.textContent = 'i';
    labelEl.appendChild(btn);
  }

  function attachStaticInfoButtons() {
    const { getEl } = requireDeps('attachStaticInfoButtons');
    const entries = [
      { inputId: 'generator-module', infoKey: 'global.algorithm' },
      { inputId: 'inp-seed', infoKey: 'global.seed' },
      { inputId: 'inp-pos-x', infoKey: 'global.posX' },
      { inputId: 'inp-pos-y', infoKey: 'global.posY' },
      { inputId: 'inp-scale-x', infoKey: 'global.scaleX' },
      { inputId: 'inp-scale-y', infoKey: 'global.scaleY' },
      { inputId: 'inp-rotation', infoKey: 'global.rotation' },
      { inputId: 'machine-profile', infoKey: 'global.paperSize' },
      { inputId: 'set-margin', infoKey: 'global.margin' },
      { inputId: 'set-truncate', infoKey: 'global.truncate' },
      { inputId: 'set-crop-exports', infoKey: 'global.cropExports' },
      { inputId: 'set-outside-opacity', infoKey: 'global.outsideOpacity' },
      { inputId: 'set-margin-line', infoKey: 'global.marginLineVisible' },
      { inputId: 'set-margin-line-weight', infoKey: 'global.marginLineWeight' },
      { inputId: 'set-margin-line-color-pill', infoKey: 'global.marginLineColor' },
      { inputId: 'set-margin-line-dotting', infoKey: 'global.marginLineDotting' },
      { inputId: 'set-selection-outline', infoKey: 'global.selectionOutline' },
      { inputId: 'set-selection-outline-color-pill', infoKey: 'global.selectionOutlineColor' },
      { inputId: 'set-selection-outline-width', infoKey: 'global.selectionOutlineWidth' },
      { inputId: 'set-cookie-preferences', infoKey: 'global.cookiePreferences' },
      { inputId: 'set-speed-down', infoKey: 'global.speedDown' },
      { inputId: 'set-speed-up', infoKey: 'global.speedUp' },
    ];

    entries.forEach(({ inputId, infoKey }) => {
      const input = getEl(inputId);
      if (!input) return;
      const label =
        input.parentElement?.querySelector('label') ||
        input.parentElement?.parentElement?.querySelector('label') ||
        input.closest('.control-group')?.querySelector('.control-label');
      attachInfoButton.call(this, label, infoKey);
    });
  }

  function bindInfoButtons() {
    const { SETTINGS } = requireDeps('bindInfoButtons');
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.info-btn');
      if (!btn) return;
      const key = btn.dataset.info;
      if (key === 'global.algorithm') {
        e.preventDefault();
        this.setAboutVisible(!(SETTINGS.aboutVisible !== false));
        return;
      }
      this.showInfo(key);
    });

    // Phase 3 closure: hover-tooltip on .info-btn elements via UI.overlays.Tooltip.
    // The click → modal behavior above is unchanged; the tooltip layer adds a
    // short teaser on hover with a "Read more" hint pointing at the modal.
    const Tooltip = window.Vectura?.UI?.overlays?.Tooltip;
    if (Tooltip) {
      let _sharedTip = null;
      const ensureTip = () => {
        if (_sharedTip) return _sharedTip;
        _sharedTip = Tooltip(document.body, { placement: 'top', maxWidth: 260 });
        return _sharedTip;
      };
      document.addEventListener('pointerenter', (e) => {
        const btn = e.target && e.target.closest && e.target.closest('.info-btn');
        if (!btn) return;
        const key = btn.dataset.info;
        const info = INFO && INFO[key];
        if (!info) return;
        const teaser = info.description ? `${info.title}: ${info.description}` : info.title;
        const text = teaser.length > 140 ? `${teaser.slice(0, 137).trimEnd()}…  (Click for details)` : teaser;
        ensureTip().show(btn, { text });
      }, true);
      document.addEventListener('pointerleave', (e) => {
        const btn = e.target && e.target.closest && e.target.closest('.info-btn');
        if (!btn) return;
        if (_sharedTip) _sharedTip.hide();
      }, true);
      // Also hide on click — the modal takes over.
      document.addEventListener('click', (e) => {
        if (!_sharedTip) return;
        const btn = e.target && e.target.closest && e.target.closest('.info-btn');
        if (btn) _sharedTip.hide({ delay: 0 });
      }, true);
    }
  }

  Modals.InfoModals = {
    /**
     * The relocated INFO table (Meridian Unit 1.3). Exposed publicly so
     * legacy callers / other satellites can read the same dictionary that
     * powers showInfo. Treat as read-only.
     */
    INFO,
    /**
     * Inject closure-captured legacy ui.js IIFE locals.
     * @param {object} deps - { buildPreviewPair, escapeHtml, getEl, SETTINGS }
     */
    bind(deps) {
      DEPS = deps || {};
    },
    showInfo,
    showDuplicateNameError,
    showValueError,
    attachInfoButton,
    attachStaticInfoButtons,
    bindInfoButtons,
    installOn(proto) {
      proto.showInfo = function(key) { return showInfo.call(this, key); };
      proto.showDuplicateNameError = function(name) { return showDuplicateNameError.call(this, name); };
      proto.showValueError = function(value, range) { return showValueError.call(this, value, range); };
      proto.attachInfoButton = function(labelEl, key) { return attachInfoButton.call(this, labelEl, key); };
      proto.attachStaticInfoButtons = function() { return attachStaticInfoButtons.call(this); };
      proto.bindInfoButtons = function() { return bindInfoButtons.call(this); };
    },
  };
})();
