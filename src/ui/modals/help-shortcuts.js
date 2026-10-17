/**
 * Vectura help-shortcuts modal (Phase 3 extraction).
 *
 * Exposes window.Vectura.UI.Modals.HelpShortcuts — the multi-tab Help Guide
 * modal triggered by the View > Help button, the F1 shortcut, and the `?`
 * shortcut.
 *
 * Methods installed onto UI.prototype:
 *   - buildHelpContent
 *   - _applyHelpPlatform
 *   - openHelp
 *
 * DI bag: {} (no IIFE-local dependencies — body is fully static markup).
 *
 * The modal composes the `this.openModal` / `this.closeModal` primitives
 * provided by `src/ui/overlays/modal.js`.
 *
 * Compile gate at tests/unit/modals/help-shortcuts-compile.test.js.
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};
  const UI = Vectura.UI = Vectura.UI || {};
  const Modals = UI.Modals = UI.Modals || {};

  let DEPS = null;

  const requireDeps = (name) => {
    if (!DEPS) {
      throw new Error(
        `HelpShortcuts.${name} invoked before HelpShortcuts.bind(deps) — load order broken`,
      );
    }
    return DEPS;
  };

  function buildHelpContent() {
    requireDeps('buildHelpContent');
    const k = (...labels) => labels.map(l => `<kbd>${l}</kbd>`).join('<span style="opacity:.4;padding:0 2px">+</span>');
    const CMD  = `<kbd data-mac="⌘" data-win="Ctrl">⌘</kbd>`;
    const OPT  = `<kbd data-mac="⌥" data-win="Alt">⌥</kbd>`;
    const SHF  = `<kbd data-mac="⇧" data-win="Shift">⇧</kbd>`;
    const mouse = txt => `<span class="help-mouse">${txt}</span>`;
    const sep = `<span class="help-plus" aria-hidden="true">+</span>`;

    const row = (keys, desc, note = '') =>
      `<tr class="help-row">
        <td class="help-row-keys">${keys}</td>
        <td class="help-row-desc">${desc}</td>
        ${note ? `<td class="help-row-note">${note}</td>` : '<td></td>'}
      </tr>`;

    const section = (label, rows) =>
      `<tr class="help-section-row"><td colspan="3" class="help-section-hdr">${label}</td></tr>${rows}`;

    const callout = (html, type = 'info') =>
      `<div class="help-callout help-callout--${type}">${html}</div>`;

    const accordion = (label, body, open = false) =>
      `<details class="help-accordion"${open ? ' open' : ''}>
        <summary class="help-accordion-summary">${label}</summary>
        <div class="help-accordion-body">${body}</div>
      </details>`;

    const algoRow = (name, cat, desc) =>
      `<tr>
        <td class="help-algo-name">${name}</td>
        <td><span class="help-badge help-badge--${cat}">${cat}</span></td>
        <td class="help-algo-desc">${desc}</td>
      </tr>`;

    /* -- Quick Start -- */
    const quickStart = `
      <div class="help-qs-grid">
        <div class="help-qs-card">
          <div class="help-qs-keys">${CMD}${k('Z')}</div>
          <div><div class="help-qs-label">Undo</div></div>
        </div>
        <div class="help-qs-card">
          <div class="help-qs-keys">${mouse('double-click')}</div>
          <div><div class="help-qs-label">Generate layer</div><div class="help-qs-sublabel">on the canvas</div></div>
        </div>
        <div class="help-qs-card">
          <div class="help-qs-keys">${k('Space')}</div>
          <div><div class="help-qs-label">Pan canvas</div><div class="help-qs-sublabel">hold for hand tool</div></div>
        </div>
        <div class="help-qs-card">
          <div class="help-qs-keys">${CMD}${k('0')}</div>
          <div><div class="help-qs-label">Reset view</div></div>
        </div>
        <div class="help-qs-card">
          <div class="help-qs-keys">${k('Delete')}</div>
          <div><div class="help-qs-label">Remove layer</div></div>
        </div>
        <div class="help-qs-card">
          <div class="help-qs-keys">${CMD}${SHF}${k('E')}</div>
          <div><div class="help-qs-label">Export SVG</div></div>
        </div>
        <div class="help-qs-card">
          <div class="help-qs-keys">${k('?')}</div>
          <div><div class="help-qs-label">Shortcuts</div></div>
        </div>
        <div class="help-qs-card">
          <div class="help-qs-keys">${CMD}${k('S')}</div>
          <div><div class="help-qs-label">Save project</div></div>
        </div>
      </div>
      <div class="help-steps-label">Your first design</div>
      <ol class="help-steps">
        <li class="help-step"><span class="help-step-body"><strong>Pick an algorithm</strong> — use the toolbar dropdown or press a shortcut key to switch types.</span></li>
        <li class="help-step"><span class="help-step-body"><strong>Double-click the canvas</strong> to generate a new layer at that point. Each click adds a layer.</span></li>
        <li class="help-step"><span class="help-step-body"><strong>Tune parameters</strong> in the right panel. Scrub sliders or double-click a value to type it in directly.</span></li>
        <li class="help-step"><span class="help-step-body"><strong>Add modifiers</strong> — drag a layer into a Mirror Modifier to reflect it symmetrically, or enable Mask on a parent to clip children.</span></li>
        <li class="help-step"><span class="help-step-body"><strong>Export</strong> with ${CMD}${SHF}${k('E')} — choose optimize, crop, and sort options for clean, plotter-ready SVG output.</span></li>
      </ol>
      ${callout('Press and hold (mouse or touch) any toolbar button marked <b>▸</b> to reveal extra algorithm and tool options. Double-click a parameter value to edit it inline; double-click a control to reset it to its default (on touch: tap the value chip, or hold the label).')}`;

    /* -- 3D Scene (an accordion inside the Algorithms tab) -- */
    const scene3dBody = `
      <div class="help-prose" id="help-scene3d" data-help-section="scene3d">
        <p>A <strong>3D Scene</strong> layer holds objects (box, sphere, torus, solid, imported mesh), lights and
        a camera. Each object has its own <strong>Style</strong> tab. The scene Style editor sets the defaults for
        objects that have no style of their own.</p>
        <p><strong>Type</strong> sets what the fill is made of: Hatch, Crosshatch, Contour, Spiral, Stipple or
        Wireframe. <strong>Fill Style</strong> sets the law that spaces the marks by tone. The styles come in
        families, and each family keeps its variants as sub-controls:</p>
        <ul class="help-callout-list">
          <li><strong>Ladder</strong> &mdash; rungs of fixed spacing that step with the tone, or a continuous field.</li>
          <li><strong>Width Ribbon</strong> &mdash; strokes that change width: by tone, by calligraphic nib angle, or along isophotes.</li>
          <li><strong>Bundle</strong> and <strong>Wave</strong> &mdash; groups of parallel passes, and wavy rulings with a set wavelength and crest phase.</li>
          <li><strong>Pattern laws</strong> &mdash; Turing Stripe, Maze Fill and Voronoi Web draw their own marks and have no ruling angle.</li>
          <li><strong>Three-pen styles</strong> &mdash; draw the fine, medium and broad tone tiers as separate passes.</li>
        </ul>
        <p>A control that does nothing for the current shape or Fill Style stays visible but greyed. Hover the
        <strong>(i)</strong> badge to see why.</p>
        <p><strong>Seed</strong> (Transform section) and <strong>RANDOMIZE</strong> change every random choice in the
        fill: jitter, dither, stripe phase. A fill with no random choice does not change. A document saved before
        the Seed was wired keeps its old look until you edit the Seed.</p>
        <p><strong>Shadow look</strong> is the Fill Style row in the Shadow section. It picks the texture drawn inside cast
        shadows. It offers the sub-controls of each family that look different on a flat footprint.</p>
        <p><strong>Artistic controls</strong> are all off until you move them:</p>
        <ul class="help-callout-list">
          <li><strong>Tone shaping</strong> &mdash; Gamma and Contrast bend the tone before any Fill Style reads it. <strong>Fade by depth</strong> lightens far surfaces.</li>
          <li><strong>Wave</strong> &mdash; Wavelength, Crest phase. <strong>Width Ribbon</strong> &mdash; Nib angle and contrast, Taper length, Tip width, Softness. <strong>Turing Stripe</strong> &mdash; Stripe align, Maturity, Stripe scale.</li>
          <li><strong>Chain walls / Chain edges</strong> &mdash; join Maze walls or Voronoi edges into long polylines. The picture stays the same and the pen lifts far less.</li>
          <li><strong>Alt angle</strong> &mdash; angle of the Alt fill lines in a highlight. A second layer crosses at the Cross angle.</li>
        </ul>
        <p><strong>Pen routing.</strong> An object draws with one pen by default. <strong>Tone bands</strong> (2 to 4)
        split any Fill Style by the tone under each mark, light to dark. Band 1 to N draw with the pens you pick in
        the <em>Band pen</em> rows. The rows start on pens 1 to N of the palette. The three-pen styles do the same
        with <strong>Tier pens</strong>. Each pen exports as its own pen group in the SVG, so the plotter changes
        pens between bands. <strong>Layers &rarr; Assign pen</strong> sets the single pen of an object.</p>
        <p><strong>Hidden edges.</strong> Dashed occluded edges of a wireframe come from <em>Object &rarr; Edge Styles
        &rarr; Hidden &rarr; Occluded</em>. The old <em>Show hidden</em> switch was folded into it.</p>
      </div>`;

    /* -- Algorithms -- */
    const algorithms = `
      <table class="help-algo-table">
        <thead>
          <tr><th>Algorithm</th><th>Category</th><th>Description</th></tr>
        </thead>
        <tbody>
          ${algoRow('Flowfield',    'particle',    'Particles traverse a Noise Rack vector field — stacked noise layers drive angle or curl for organic, fluid-like textures.')}
          ${algoRow('Boids',        'particle',    'Flocking simulation using Separation, Alignment, and Cohesion rules — complex emergent movement trails.')}
          ${algoRow('Lissajous',    'math',        'Parametric curves from two sinusoidal waves — elegant looping harmonic figures used in signal physics.')}
          ${algoRow('Harmonograph', 'math',        'Damped multi-pendulum curves combining decaying sine waves on the X and Y axes. The Virtual Plotter is reveal-only — the figure is static, and Play traces the pen over it 0→100% on a loop.')}
          ${algoRow('Pendula',      'math',        'A kinetic-harmonograph studio: a Motion Rack of drag-assigned temporal LFOs (sine/triangle/saw/square/sample-hold/random) baked into the figure, plus Lateral (damped) and Pintograph (non-decaying loop) machine types and animated SVG export.')}
          ${algoRow('Attractor',    'math',        'Strange Attractors (Lorenz, Aizawa) — chaotic systems where trajectories orbit a fractal state set.')}
          ${algoRow('Spiral',       'math',        'Archimedean spiral distorted by noise — vinyl-like grooves or organic coil patterns.')}
          ${algoRow('Wavetable',    'field',       'Terrain-like elevations by modulating line structures with one or more stacked noise sources.')}
          ${algoRow('Topo',         'field',       'Contour lines extracted from a Noise Rack height field — multiple stacked layers drive the mapping modes.')}
          ${algoRow('Grid',         'field',       'Rectilinear mesh deformed by a Noise Rack field — warp vertices or displace rows/cols for glitch effects.')}
          ${algoRow('Rainfall',     'field',       'Falling rain traces with droplet shapes, wind influence, and silhouette masking.')}
          ${algoRow('Terrain',      'field',       'Heightfield rendered as scanlines under orthographic, isometric, or perspective projection with ridges, valleys, and coastlines.')}
          ${algoRow('Phylla',       'botanical',   'Points arranged by the golden angle in a spiral, with Noise Rack fields adding controlled organic drift.')}
          ${algoRow('Rings',        'botanical',   'Concentric tree rings with organic variation — uneven spacing, drift, bark texture, knots, scars, and rays.')}
          ${algoRow('Petalis',      'botanical',   'Layered radial petals with an embedded Petal Designer for direct profile drawing, live shading, and per-modifier Noise Rack stacks.')}
          ${algoRow('Hyphae',       'botanical',   'Organic branching growth (like fungi or roots) — sources grow segments and fork based on probability.')}
          ${algoRow('ShapePack',    'structural',  'Non-overlapping circles or polygons — supports perspective warping for angular composition.')}
          ${algoRow('SVG Distort',  'structural',  'Imports external SVG, converts fills to hatch/waveline/contour fills, then applies Noise Rack point displacement.')}
        </tbody>
      </table>
      ${callout('<strong>Noise Rack</strong> — many algorithms share a universal noise stacking system. Open the Noise Rack panel to layer multiple algorithms (Perlin, Simplex, Voronoi, Curl…) and control exactly how they modulate the generation.')}
      ${accordion('3D Scene', scene3dBody)}`;

    /* -- Tools -- */
    const tools = `
      <table class="help-kbd-table">
        <tbody>
          ${section('Selection &amp; Drawing',
            row(k('V'),       'Selection tool') +
            row(k('A'),       'Direct Select') +
            row(k('Q'),       'Lasso') +
            row(k('P'),       'Pen tool',             'press again to cycle subtools') +
            row(k('F'),       'Fill') +
            row(SHF + k('F'), 'Erase Fill') +
            row(k('C'),       'Scissor',              'press again to cycle modes')
          )}
          ${section('Shapes',
            row(k('M'),       'Rectangle',            'Shift = square · Alt = from center') +
            row(k('L'),       'Oval',                 'Shift = circle · Alt = from center') +
            row(k('Y'),       'Polygon',              '↑ ↓ changes sides while dragging')
          )}
          ${section('Anchors',
            row(k('+'),       'Add anchor point') +
            row(k('−'),  'Delete anchor point') +
            row(SHF + k('C'), 'Anchor point tool')
          )}
          ${section('View',
            row(k('Space'),   'Hand tool',            'hold for temporary pan')
          )}
        </tbody>
      </table>`;

    /* -- Canvas -- */
    const navRows = `
      <table class="help-kbd-table">
        <tbody>
          ${row(mouse('Scroll wheel'),              'Zoom in / out')}
          ${row(SHF + sep + mouse('drag'),          'Pan canvas')}
          ${row(CMD + k('0'),                       'Reset view')}
          ${row(CMD + k('='),                       'Zoom in')}
          ${row(CMD + k('−'),                  'Zoom out')}
        </tbody>
      </table>`;
    const selRows = `
      <table class="help-kbd-table">
        <tbody>
          ${row(mouse('drag on canvas'),            'Marquee multi-select')}
          ${row(mouse('drag corner handle'),        'Resize selection')}
          ${row(mouse('drag edge handle'),          'Resize one axis',      'Shift keeps proportions')}
          ${row(mouse('top-right handle'),          'Rotate',               'Shift snaps to 45°')}
          ${row(OPT + sep + mouse('drag'),          'Duplicate selection',  'Esc cancels the copy')}
          ${row(mouse('corner widget'),             'Round corners',        'Direct Select = one corner')}
          ${row(OPT + sep + mouse('click widget'),  'Cycle corner style',   'Round → Inverted Round → Chamfer')}
          ${row(k('↑ / ↓'),                         'Corner style while dragging a widget')}
          ${row(mouse('double-click widget'),       'Corners dialog',       'Style + radius')}
          ${row(mouse('drag near an object'),       'Snap to smart guides', 'Magenta guides + dX/dY chips')}
          ${row(mouse('right-click canvas'),        'Context menu',         'Duplicate · Group · Simplify · Flip · Transform')}
          ${row(k('↑↓←→'),     'Nudge position',       'Shift = 10 ×')}
        </tbody>
      </table>`;
    const touchRows = `
      <table class="help-kbd-table">
        <tbody>
          ${row(mouse('1 finger'),   'Tap selects; drag moves a selected object', 'See the Touch tab')}
          ${row(mouse('2 fingers'),  'Pan / pinch-zoom')}
          ${row(mouse('2-finger tap'),  'Undo')}
          ${row(mouse('3-finger tap'),  'Redo')}
          ${row(mouse('hold canvas'),   'Select the object and open the canvas menu', 'Select, Direct Selection and Hand tools')}
        </tbody>
      </table>`;
    const contextBarBody = `
      <div class="help-prose" id="help-context-bar" data-help-section="context-bar">
        <p>When you select an object, a small <strong>Contextual Task Bar</strong> floats
        just below it with the actions that make sense right now &mdash; edit the path,
        change the pen, adjust stroke weight, group or align a multi-selection, isolate a
        group, or edit text. With nothing
        selected, the bar shows an <strong>Add Layer</strong> dropdown (matching the sidebar
        menu) alongside Draw.</p>
        <p>Some actions open an inline <em>sub-mode</em> inside the bar: <strong>Stroke
        weight</strong> (slider + document-unit field, with &ldquo;Open Stroke
        Options&rdquo; for the full popover) and <strong>Simplify</strong> (live preview
        with an Auto-Smooth pass and a points/percent badge). Press <kbd>Esc</kbd> or
        <em>Back</em>/<em>Done</em> to leave a sub-mode.</p>
        <p>Selecting a live <strong>rectangle or polygon</strong> adds a shape-properties
        popover for corner radius and side count. The trailing <strong>&hellip;</strong>
        menu lets you show the docked panel, pin, reset, or hide the bar. Turn the whole
        bar on or off under <em>Document Setup &rarr; Guides &amp; Display</em>.</p>
        <p>Double-clicking into a group shows an <strong>isolation breadcrumb</strong>
        across the top of the canvas: click any ancestor crumb to step out one level, the
        back arrow to exit one level, or <em>Document</em> to leave isolation entirely.</p>
      </div>`;
    const toolsAndTransformBody = `
      <div class="help-prose" id="help-tools-transform" data-help-section="tools-transform">
        <p>The <strong>All Tools</strong> drawer opens from the <strong>&hellip;</strong> button
        at the bottom of the tool rail. It lists every tool grouped by category
        (Select, Draw, Shapes, Type, Modify, Navigate); click one to switch to it, and hover an
        entry to see which rail slot it lives in. A <strong>grid / list</strong> toggle at the top
        remembers your choice.</p>
        <p>The <strong>Transform</strong> section shows editable <strong>X / Y / W / H</strong>
        for shape and text selections &mdash; type a value to move or resize precisely. The
        <em>link</em> toggle keeps width and height proportional. <strong>Flip Horizontal</strong>
        and <strong>Flip Vertical</strong> buttons sit beside rotate. With the Direct-Selection
        tool and a single anchor selected, X / Y edit that anchor&rsquo;s position instead.</p>
        <p>In the <strong>Text</strong> panel, hovering a font in the picker previews it live on
        the canvas before you commit, and the size field offers a preset dropdown of common
        sizes.</p>
      </div>`;
    const canvas = `
      ${accordion('Navigation', navRows, true)}
      ${accordion('Selection &amp; Transform', selRows, true)}
      ${accordion('Contextual Task Bar', contextBarBody, true)}
      ${accordion('All Tools &amp; Numeric Transform', toolsAndTransformBody, true)}
      ${accordion('Touch &amp; Trackpad', touchRows)}`;

    /* -- Layers -- */
    const layerSelectRows = `
      <table class="help-kbd-table">
        <tbody>
          ${row(CMD + k('A'),                                   'Select all')}
          ${row(mouse('click'),                                 'Select layer (or whole group / morph)')}
          ${row(mouse('double-click'),                          'Edit a child inside a group or morph')}
          ${row(k('Esc'),                                       'Exit group / morph editing')}
          ${row(CMD + sep + mouse('click'),                     'Toggle selection')}
          ${row(SHF + sep + mouse('click'),                     'Range select')}
        </tbody>
      </table>`;
    const layerOrgRows = `
      <table class="help-kbd-table">
        <tbody>
          ${row(CMD + k('G'),         'Group')}
          ${row(CMD + SHF + k('G'),   'Ungroup')}
          ${row(CMD + k('E'),         'Expand to sublayers')}
          ${row(CMD + k('D'),         'Duplicate')}
          ${row(OPT + sep + mouse('drag'), 'Duplicate by dragging')}
          ${row(SHF + sep + mouse('drag'), 'Make clipping mask (drop onto target)')}
          ${row(k('Delete'),          'Remove')}
        </tbody>
      </table>`;
    const layerStackRows = `
      <table class="help-kbd-table">
        <tbody>
          ${row(CMD + k('['),         'Send Backward')}
          ${row(CMD + k(']'),         'Bring Forward')}
          ${row(CMD + SHF + k('['),   'Send to Back')}
          ${row(CMD + SHF + k(']'),   'Bring to Front')}
        </tbody>
      </table>`;
    const wallpaperRows = `
      <table class="help-kbd-table">
        <tbody>
          ${row(CMD + k('←'), 'Cycle wallpaper group within current lattice (back)')}
          ${row(CMD + k('→'), 'Cycle wallpaper group within current lattice (forward)')}
        </tbody>
      </table>`;
    const layers = `
      ${accordion('Selecting Layers', layerSelectRows, true)}
      ${accordion('Organizing Layers', layerOrgRows, true)}
      ${accordion('Stack Order', layerStackRows)}
      ${accordion('Wallpaper Modifier', wallpaperRows)}
      ${callout('Drag a layer into a <strong>Mirror Modifier</strong> to reflect it symmetrically. Enable <strong>Mask</strong> on a parent layer to clip all nested children inside its silhouette. <strong>Single-click</strong> a group or Morph to select it as one object; <strong>double-click</strong> to step inside and edit one unlocked child (the Morph re-blends live); switch to the <strong>direct-select</strong> tool to reshape that end’s points or bevel; <strong>Esc</strong> steps back out.')}`;

    /* -- Pen -- */
    const penDrawRows = `
      <table class="help-kbd-table">
        <tbody>
          ${row(k('Enter'),             'Commit path')}
          ${row(mouse('double-click'),  'Close path near start')}
          ${row(k('Backspace'),         'Remove last point')}
          ${row(k('Esc'),              'Cancel draft')}
        </tbody>
      </table>`;
    const penModRows = `
      <table class="help-kbd-table">
        <tbody>
          ${row(SHF,  'Constrain angle / handles')}
          ${row(OPT,  'Break/freeze handles',   'also draws shape from center')}
          ${row(CMD,  'Temporary selection while drawing')}
        </tbody>
      </table>`;
    const petalRows = `
      <table class="help-kbd-table">
        <tbody>
          ${row(k('A') + ' ' + k('P') + ' ' + k('+') + ' ' + k('−'), 'Anchor tools')}
          ${row(mouse('middle-click drag'),  'Pan designer canvas')}
          ${row(mouse('scroll wheel'),       'Zoom both petals simultaneously')}
        </tbody>
      </table>`;
    const pen = `
      ${accordion('Path Drawing', penDrawRows, true)}
      ${accordion('Modifier Keys', penModRows, true)}
      ${accordion('Petal Designer', petalRows)}`;

    /* -- File and Export -- */
    const fileExport = `
      <table class="help-kbd-table">
        <tbody>
          ${section('File',
            row(CMD + k('O'),       'Open project') +
            row(CMD + k('S'),       'Save project') +
            row(CMD + k('S'),       'Save preset (config panel focused, after editing a preset)') +
            row(CMD + SHF + k('P'), 'Import SVG') +
            row(CMD + SHF + k('E'), 'Export SVG') +
            row(CMD + k('K'),       'Document Setup')
          )}
          ${section('Help',
            row(k('F1'),            'Help Guide') +
            row(k('?'),             'Keyboard shortcuts')
          )}
        </tbody>
      </table>
      ${callout(`
        <strong>Export SVG</strong> includes four optimization passes you can mix and match:
        <ul class="help-callout-list">
          <li><strong>Line Simplify</strong> — reduce anchor count while preserving shape.</li>
          <li><strong>Line Sort</strong> — reorder paths to minimize pen travel distance.</li>
          <li><strong>Multipass</strong> — repeat strokes for heavier ink deposit.</li>
          <li><strong>Remove Hidden Geometry</strong> — strip masked-out paths from output.</li>
        </ul>
        A live preview shows pen-order color coding before you download.
      `)}
      ${callout('<strong>Export Animated SVG…</strong> is a separate File action for the harmonograph/Pendula family — it emits a self-contained, looping <em>draw-on</em> SVG (the strokes draw themselves on repeat) for sharing the figure drawing itself. The canonical Export SVG stays clean and static.')}`;

    /* -- Touch -- */
    const t = (name) => `<strong>${name}</strong>`;
    const touchPageRows = `
      <table class="help-kbd-table">
        <tbody>
          ${row(t('Tap'),                          'Select an object or layer', 'A tap within 22 px of a stroke selects it · a locked layer selects nothing')}
          ${row(t('Drag'),                         'Move the selected object')}
          ${row(t('Pinch') + ' · ' + t('Two-finger drag'), 'Zoom · pan the canvas')}
          ${row(t('Undo / Redo buttons'),          'Undo and redo the last change', 'Two-finger tap = undo · Three-finger tap = redo · Zoom In, Zoom Out and Fit buttons set the view')}
          ${row(t('Done chip') + ' · ' + t('Double-tap'), 'Finish a pen path')}
          ${row(t('Modifier bar'),                 'Multi-select, Constrain, Duplicate and Pan apply to the next gesture', 'Double-tap a modifier to lock it')}
          ${row(t('Hold a layer row') + ' · ' + t('Tap ⋯'), 'Open the layer menu', '&ldquo;Selection menu&hellip;&rdquo; in the context bar')}
          ${row(t('Hold the canvas'),              'Select the object under your finger and open the canvas menu', 'Select, Direct Selection and Hand tools · on empty canvas the menu offers Select All')}
          ${row(t('Hold an icon button'),          'Show its name', 'The name shows while your finger is down and for 1.5 s after')}
          ${row(t('Drag a grip'),                  'Reorder layers and panels')}
          ${row(t('Tap a value chip'),             'Type a value', 'Hold a slider label to open its Reset to default menu')}
          ${row(t('Hold a button marked ▸'),       'Open its sub-menu (on touch, tap it again when it is active)')}
        </tbody>
      </table>`;
    const touch = `
      ${callout('Touch and Apple Pencil input use the same tools as the mouse. The modifier bar replaces the Shift, Option and Cmd keys.')}
      ${touchPageRows}`;

    return `
      <div class="help-wrap">
        <div class="help-toolbar">
          <div class="help-tabs">
            <button class="help-tab-btn" data-tab="quickstart"  type="button">Quick Start</button>
            <button class="help-tab-btn" data-tab="algorithms"  type="button">Algorithms</button>
            <button class="help-tab-btn" data-tab="tools"       type="button">Tools</button>
            <button class="help-tab-btn" data-tab="canvas"      type="button">Canvas</button>
            <button class="help-tab-btn" data-tab="layers"      type="button">Layers</button>
            <button class="help-tab-btn" data-tab="pen"         type="button">Pen</button>
            <button class="help-tab-btn" data-tab="fileexport"  type="button">File &amp; Export</button>
            <button class="help-tab-btn" data-tab="touch"       type="button">Touch</button>
          </div>
          <div class="help-platform-toggle">
            <button class="help-platform-btn" data-platform="mac" type="button">⌘ Mac</button>
            <button class="help-platform-btn" data-platform="win" type="button">Ctrl Win</button>
            <button class="help-platform-btn" data-platform="touch" type="button">Touch</button>
          </div>
        </div>
        <div class="help-panels">
          <div class="help-panel" data-panel="quickstart" >${quickStart}</div>
          <div class="help-panel" data-panel="algorithms" >${algorithms}</div>
          <div class="help-panel" data-panel="tools"      >${tools}</div>
          <div class="help-panel" data-panel="canvas"     >${canvas}</div>
          <div class="help-panel" data-panel="layers"     >${layers}</div>
          <div class="help-panel" data-panel="pen"        >${pen}</div>
          <div class="help-panel" data-panel="fileexport" >${fileExport}</div>
          <div class="help-panel" data-panel="touch"      >${touch}</div>
        </div>
      </div>`;
  }

  function _applyHelpPlatform(root, platform) {
    requireDeps('_applyHelpPlatform');
    // Touch is not a third key set: kbd text stays on the mac/win value.
    let keys = platform;
    if (platform === 'touch') {
      keys = (this && this._helpKeyPlatform)
        || (/Mac|iPod|iPhone|iPad/.test(navigator.platform) ? 'mac' : 'win');
    } else if (this) {
      this._helpKeyPlatform = platform;
    }
    root.querySelectorAll('[data-mac]').forEach(el => {
      el.textContent = keys === 'mac' ? el.dataset.mac : el.dataset.win;
    });
    root.querySelectorAll('.help-platform-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.platform === platform);
    });
  }

  function openHelp(focusShortcuts = false) {
    requireDeps('openHelp');
    const body = this.buildHelpContent();
    this.openModal({ title: 'Help Guide', body, cardClass: 'modal-card--help' });
    const wrap = this.modal.bodyEl.querySelector('.help-wrap');
    if (!wrap) return;

    const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform);
    if (!this._helpPlatform) {
      // TUX-052: body.touch-ui (never maxTouchPoints) picks the Touch page by default.
      const touchUi = !!(document.body && document.body.classList.contains('touch-ui'));
      this._helpKeyPlatform = isMac ? 'mac' : 'win';
      this._helpPlatform = touchUi ? 'touch' : this._helpKeyPlatform;
    }
    this._applyHelpPlatform(wrap, this._helpPlatform);

    wrap.querySelectorAll('.help-platform-btn').forEach(btn => {
      btn.onclick = () => {
        this._helpPlatform = btn.dataset.platform;
        this._applyHelpPlatform(wrap, this._helpPlatform);
        if (this._helpPlatform === 'touch') switchTab('touch');
      };
    });

    const switchTab = (id) => {
      wrap.querySelectorAll('.help-tab-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.tab === id));
      wrap.querySelectorAll('.help-panel').forEach(p => {
        p.hidden = p.dataset.panel !== id;
      });
      this._lastHelpTab = id;
    };

    wrap.querySelectorAll('.help-tab-btn').forEach(btn => {
      btn.onclick = () => switchTab(btn.dataset.tab);
    });

    const initial = focusShortcuts ? 'tools'
      : (this._helpPlatform === 'touch' && !this._lastHelpTab ? 'touch' : (this._lastHelpTab || 'quickstart'));
    switchTab(initial);
    // TUX-052: the modal focuses its first control (Quick Start) after open, on a timer. Redirect that
    // initial focus to the active tab so a focus ring never makes an inactive tab look selected.
    const redirect = (e) => {
      const t = e.target;
      if (!t || !t.classList || !t.classList.contains('help-tab-btn') || t.classList.contains('active')) return;
      const activeBtn = wrap.querySelector('.help-tab-btn.active');
      wrap.removeEventListener('focusin', redirect);
      if (activeBtn) activeBtn.focus({ preventScroll: true });
    };
    wrap.addEventListener('focusin', redirect);
    window.setTimeout(() => wrap.removeEventListener('focusin', redirect), 400);
  }

  Modals.HelpShortcuts = {
    /**
     * Inject closure-captured legacy ui.js IIFE locals.
     * @param {object} _deps - reserved (no IIFE-local deps today; argument is
     *   accepted so the bind() shape matches every other Phase 2/3 module).
     */
    bind(_deps) {
      DEPS = _deps || {};
    },
    buildHelpContent,
    _applyHelpPlatform,
    openHelp,
    installOn(proto) {
      proto.buildHelpContent = function() { return buildHelpContent.call(this); };
      proto._applyHelpPlatform = function(root, platform) { return _applyHelpPlatform.call(this, root, platform); };
      proto.openHelp = function(focusShortcuts = false) { return openHelp.call(this, focusShortcuts); };
    },
  };
})();
