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
      ${callout('Press and hold any toolbar button marked <b>▸</b> to reveal extra algorithm and tool options. Double-click a parameter value to edit it inline; double-click a control to reset it to its default.')}`;

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
      ${callout('<strong>Noise Rack</strong> — many algorithms share a universal noise stacking system. Open the Noise Rack panel to layer multiple algorithms (Perlin, Simplex, Voronoi, Curl…) and control exactly how they modulate the generation.')}`;

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
          ${row(mouse('top-right handle'),          'Rotate',               'Shift snaps to 45°')}
          ${row(mouse('corner widget'),             'Round corners',        'Direct Select = one corner')}
          ${row(k('↑↓←→'),     'Nudge position',       'Shift = 10 ×')}
        </tbody>
      </table>`;
    const touchRows = `
      <table class="help-kbd-table">
        <tbody>
          ${row(mouse('1 finger'),   'Tool input')}
          ${row(mouse('2 fingers'),  'Pan / pinch-zoom')}
        </tbody>
      </table>`;
    const canvas = `
      ${accordion('Navigation', navRows, true)}
      ${accordion('Selection &amp; Transform', selRows, true)}
      ${accordion('Touch &amp; Trackpad', touchRows)}`;

    /* -- Layers -- */
    const layerSelectRows = `
      <table class="help-kbd-table">
        <tbody>
          ${row(CMD + k('A'),                                   'Select all')}
          ${row(mouse('click'),                                 'Select layer')}
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
          ${row(CMD + k('['),         'Move down one')}
          ${row(CMD + k(']'),         'Move up one')}
          ${row(CMD + SHF + k('['),   'Send to back')}
          ${row(CMD + SHF + k(']'),   'Send to front')}
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
      ${callout('Drag a layer into a <strong>Mirror Modifier</strong> to reflect it symmetrically. Enable <strong>Mask</strong> on a parent layer to clip all nested children inside its silhouette.')}`;

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
          </div>
          <div class="help-platform-toggle">
            <button class="help-platform-btn" data-platform="mac" type="button">⌘ Mac</button>
            <button class="help-platform-btn" data-platform="win" type="button">Ctrl Win</button>
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
        </div>
      </div>`;
  }

  function _applyHelpPlatform(root, platform) {
    requireDeps('_applyHelpPlatform');
    root.querySelectorAll('[data-mac]').forEach(el => {
      el.textContent = platform === 'mac' ? el.dataset.mac : el.dataset.win;
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
    if (!this._helpPlatform) this._helpPlatform = isMac ? 'mac' : 'win';
    this._applyHelpPlatform(wrap, this._helpPlatform);

    wrap.querySelectorAll('.help-platform-btn').forEach(btn => {
      btn.onclick = () => {
        this._helpPlatform = btn.dataset.platform;
        this._applyHelpPlatform(wrap, this._helpPlatform);
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

    const initial = focusShortcuts ? 'tools' : (this._lastHelpTab || 'quickstart');
    switchTab(initial);
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
