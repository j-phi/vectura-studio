/**
 * TUX-060 detector self-tests. Each rule R1-R12 (plus the R13 marker reader) is
 * exercised on inline strings: positive, negative, commented-out match, string or
 * data match where relevant, and the touch-ok opt-out.
 * The rules live in touch-static-guard-rules.js (pure functions, no file access).
 */
const R = require('./touch-static-guard-rules.js');

const count = (rule, src, file = 'src/x.js') => R.scan(src, file).filter((h) => h.rule === rule).length;
const OK = (rule) => `// touch-ok: TUX-060 fixture for ${rule}\n`;

describe('R1 contextmenu without TouchHold', () => {
  const rule = 'R1';
  test('flags addEventListener and oncontextmenu', () => {
    expect(count(rule, "el.addEventListener('contextmenu', (e) => { openMenu(e); });")).toBe(1);
    expect(count(rule, 'el.oncontextmenu = (e) => { openMenu(e); };')).toBe(1);
  });
  test('preventDefault-only handlers are touch-neutral', () => {
    expect(count(rule, 'el.oncontextmenu = (e) => e.preventDefault();')).toBe(0);
    expect(count(rule, "el.addEventListener('contextmenu', function (e) { e.preventDefault(); e.stopPropagation(); return false; });")).toBe(0);
    expect(count(rule, "el.addEventListener('contextmenu', suppress); function suppress(e) { e.preventDefault(); }")).toBe(0);
  });
  test('TouchHold identifier or touch-alt marker makes the file compliant', () => {
    expect(count(rule, "TouchHold.attach(el, open); el.addEventListener('contextmenu', (e) => { open(e); });")).toBe(0);
    expect(count(rule, "// touch-alt: TUX-034 hold lives in renderer.js\nel.addEventListener('contextmenu', (e) => { open(e); });")).toBe(0);
  });
  test('comments and strings never count', () => {
    expect(count(rule, "// el.addEventListener('contextmenu', open)")).toBe(0);
    expect(count(rule, 'const s = "el.oncontextmenu = open";')).toBe(0);
  });
  test('touch-ok opt-out', () => {
    expect(count(rule, "el.addEventListener('contextmenu', (e) => { open(e); }); // touch-ok: TUX-034 reason")).toBe(0);
    expect(count(rule, OK(rule) + 'el.oncontextmenu = (e) => { open(e); };')).toBe(0);
  });
});

describe('R2 mouseenter-only open', () => {
  const rule = 'R2';
  test('flags mouseenter/mouseover in a file without click or pointer registrations', () => {
    expect(count(rule, "a.addEventListener('mouseenter', open);")).toBe(1);
    expect(count(rule, 'a.onmouseover = open;')).toBe(1);
  });
  test('click, pointerup or pointerdown in the same file satisfies it', () => {
    expect(count(rule, "a.addEventListener('mouseenter', open); a.addEventListener('click', open);")).toBe(0);
    expect(count(rule, "a.onmouseover = open; a.addEventListener('pointerdown', go);")).toBe(0);
    expect(count(rule, "a.addEventListener('mouseenter', open); a.onpointerup = go;")).toBe(0);
  });
  test('pairs by target, not by file', () => {
    expect(count(rule, "a.addEventListener('mouseenter', open); b.addEventListener('click', x);")).toBe(1);
    expect(count(rule, "a.addEventListener('mouseenter', open); a.addEventListener('click', x);")).toBe(0);
    expect(count(rule, "x.algoParentItem.onmouseover = open; x.other.onpointerdown = go;")).toBe(1);
  });
  test('a touch-alt marker near the registration satisfies it', () => {
    expect(count(rule, "// touch-alt: TUX-035 tap opens it\na.addEventListener('mouseenter', open);")).toBe(0);
  });
  test('comments and strings never count', () => {
    expect(count(rule, "// a.addEventListener('mouseenter', open)")).toBe(0);
    expect(count(rule, "const s = \"a.addEventListener('mouseenter', x)\";")).toBe(0);
  });
  test('touch-ok opt-out', () => {
    expect(count(rule, "a.addEventListener('mouseenter', open); // touch-ok: Q3 hover hint only")).toBe(0);
  });
});

describe('R3 mousedown without pointerdown', () => {
  const rule = 'R3';
  test('every mousedown registration counts, even beside pointerdown', () => {
    expect(count(rule, "a.addEventListener('mousedown', go);")).toBe(1);
    expect(count(rule, "grip.onmousedown = go; other.addEventListener('pointerdown', x);")).toBe(1);
    expect(count(rule, "a.addEventListener('mousedown', go); b.onmousedown = go;")).toBe(2);
  });
  test('MouseEvent construction is not a registration', () => {
    expect(count(rule, "el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));")).toBe(0);
  });
  test('data arrays and comments do not count; forEach event arrays do', () => {
    expect(count(rule, "const names = ['mousedown', 'mouseup'];")).toBe(0);
    expect(count(rule, "// a.addEventListener('mousedown', go)")).toBe(0);
    expect(count(rule, "['mousedown', 'touchstart'].forEach((ev) => a.addEventListener(ev, go));")).toBe(1);
  });
  test('a pointerdown on the same target text pairs the mousedown (fallback or swallow)', () => {
    expect(count(rule, "c.addEventListener('pointerdown', d); c.addEventListener('mousedown', m);")).toBe(0);
    expect(count(rule, "['mousedown', 'click'].forEach((t) => doc.addEventListener(t, eat, true)); doc.addEventListener('pointerdown', off, true);")).toBe(0);
    // still flagged: pointerdown on another target, or none at all
    expect(count(rule, "c.addEventListener('pointerdown', d); e.addEventListener('mousedown', m);")).toBe(1);
    expect(count(rule, "el.addEventListener('mousedown', start);")).toBe(1);
  });
  test('the pairing is scoped: an unrelated pointerdown on a same-named variable in another function does not pair', () => {
    const unrelated = [
      'function a() { const el = pick(); el.addEventListener(\'mousedown\', go); }',
      'function b() { const el = other(); el.addEventListener(\'pointerdown\', go2); }',
    ].join('\n');
    expect(count(rule, unrelated)).toBe(1);
    // module-level pointerdown does not pair a mousedown inside a function either
    expect(count(rule, "el.addEventListener('pointerdown', d); function a() { el.addEventListener('mousedown', m); }")).toBe(1);
    // the same function (and a nested listener block of it) still pairs
    expect(count(rule, "function a() { el.addEventListener('pointerdown', d); el.addEventListener('mousedown', m); }")).toBe(0);
    expect(count(rule, "function a() { el.addEventListener('pointerdown', d); } function b() { el.addEventListener('pointerdown', d); el.onmousedown = m; }")).toBe(0);
    expect(count(rule, "const init = () => { el.onmousedown = m; el.addEventListener('pointerdown', d); };")).toBe(0);
  });
  test('a neutral handler (stopPropagation only) is compliant', () => {
    expect(count(rule, "inp.addEventListener('mousedown', (e) => e.stopPropagation());")).toBe(0);
    expect(count(rule, "inp.addEventListener('mousedown', (e) => { e.stopPropagation(); start(e); });")).toBe(1);
  });
  test('touch-ok opt-out', () => {
    expect(count(rule, "a.addEventListener('mousedown', go); // touch-ok: TUX-060 reason")).toBe(0);
    expect(count(rule, OK(rule) + 'a.onmousedown = go;')).toBe(0);
  });
});

describe('R4 pointerup without pointercancel', () => {
  const rule = 'R4';
  test('pointerup only counts 1', () => {
    expect(count(rule, "w.addEventListener('pointerup', end);")).toBe(1);
    expect(count(rule, 'w.onpointerup = end;')).toBe(1);
  });
  test('cancel routed to the same end handler is compliant', () => {
    expect(count(rule, 'w.onpointerup = end; w.onpointercancel = end;')).toBe(0);
    expect(count(rule, "w.addEventListener('pointerup', end); w.addEventListener('pointercancel', end);")).toBe(0);
    expect(count(rule, "['pointerup', 'pointercancel'].forEach((ev) => w.addEventListener(ev, end));")).toBe(0);
  });
  test('difference is per file', () => {
    expect(count(rule, "a.addEventListener('pointerup', e1); b.addEventListener('pointerup', e2); c.addEventListener('pointercancel', e1);")).toBe(1);
    expect(count(rule, "a.addEventListener('pointercancel', e1);")).toBe(0);
  });
  test('comments and string data never count', () => {
    expect(count(rule, "// slider listens for pointerup: w.addEventListener('pointerup', end)")).toBe(0);
    expect(count(rule, "const evs = ['pointerup'];")).toBe(0);
  });
  test('touch-ok opt-out', () => {
    expect(count(rule, "w.addEventListener('pointerup', end); // touch-ok: TUX-031 reason")).toBe(0);
  });
});

describe('R5 dblclick without touch alternative', () => {
  const rule = 'R5';
  test('bare dblclick counts', () => {
    expect(count(rule, "a.addEventListener('dblclick', go);")).toBe(1);
    expect(count(rule, 'a.ondblclick = go;')).toBe(1);
  });
  test('touch-alt within 5 lines above satisfies; 6 lines does not', () => {
    expect(count(rule, "// touch-alt: TUX-035 long-press rename\n\n\na.addEventListener('dblclick', go);")).toBe(0);
    expect(count(rule, "// touch-alt: TUX-035 long-press rename\n\n\n\n\n\na.addEventListener('dblclick', go);")).toBe(1);
  });
  test('TouchHold in the file satisfies', () => {
    expect(count(rule, "TouchHold.attach(a, go); a.addEventListener('dblclick', go);")).toBe(0);
  });
  test('comments and strings never count', () => {
    expect(count(rule, "// a.addEventListener('dblclick', go)")).toBe(0);
    expect(count(rule, "const t = 'dblclick';")).toBe(0);
  });
  test('touch-ok opt-out', () => {
    expect(count(rule, "a.addEventListener('dblclick', go); // touch-ok: TUX-035 reason")).toBe(0);
  });
});

describe('R6 html5 dnd without pointer reorder', () => {
  const rule = 'R6';
  test('counts draggable assignments, attributes, markup and dragstart', () => {
    expect(count(rule, 'el.draggable = true;')).toBe(1);
    expect(count(rule, "el.setAttribute('draggable', 'true');")).toBe(1);
    expect(count(rule, "el.setAttribute('draggable', true);")).toBe(1);
    expect(count(rule, 'const h = `<div draggable="true" class="${c}">x</div>`;')).toBe(1);
    expect(count(rule, "el.addEventListener('dragstart', go);")).toBe(1);
    expect(count(rule, 'const h = \'<li class="a" draggable="true">\';')).toBe(1);
  });
  test('dataTransfer alone and OS file drops are not counted', () => {
    expect(count(rule, "e.dataTransfer.dropEffect = 'copy';")).toBe(0);
    expect(count(rule, "zone.addEventListener('drop', (e) => { const f = e.dataTransfer.files; load(f); }); zone.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); });")).toBe(0);
  });
  test('comments and selector strings never count', () => {
    expect(count(rule, '// el.draggable = true')).toBe(0);
    expect(count(rule, "const q = '[draggable=\"true\"]';")).toBe(0);
  });
  test('a file that references PointerReorder has the pointer-reorder path', () => {
    expect(count(rule, 'UI.PointerReorder.attach(list); el.draggable = true;')).toBe(0);
    expect(count(rule, "const P = window.Vectura.UI.PointerReorder; el.addEventListener('dragstart', go);")).toBe(0);
    expect(count(rule, "const P = 'PointerReorder'; el.draggable = true;")).toBe(1);
  });
  test('restoring a saved draggable value is not a draggable=true literal', () => {
    expect(count(rule, 'const was = el.draggable; el.draggable = false; const back = () => { el.draggable = was; };')).toBe(0);
  });
  test('touch-alt within 5 lines satisfies', () => {
    expect(count(rule, "// touch-alt: TUX-038 pointer reorder\nel.draggable = true;")).toBe(0);
  });
  test('index.html markup counts', () => {
    expect(count(rule, '<html><body><div draggable="true">x</div></body></html>', 'index.html')).toBe(1);
    expect(count(rule, '<html><body><div>x</div></body></html>', 'index.html')).toBe(0);
  });
  test('touch-ok opt-out', () => {
    expect(count(rule, 'el.draggable = true; // touch-ok: TUX-038 reason')).toBe(0);
  });
});

describe('R7 no bare 100vh', () => {
  const rule = 'R7';
  const css = (body) => `.a { ${body} }`;
  test('bare 100vh counts', () => {
    expect(count(rule, css('height: 100vh;'), 'a.css')).toBe(1);
    expect(count(rule, css('max-height: calc(100vh - 40px);'), 'a.css')).toBe(1);
  });
  test('var() fallback is excluded', () => {
    expect(count(rule, css('height: var(--x, 100vh);'), 'a.css')).toBe(0);
  });
  test('order of the dvh fallback matters', () => {
    expect(count(rule, css('height:100dvh; height:100vh'), 'a.css')).toBe(1);
    expect(count(rule, css('height:100vh; height:100dvh'), 'a.css')).toBe(0);
    expect(count(rule, css('height:100vh; height:100svh'), 'a.css')).toBe(0);
    expect(count(rule, css('height:100vh; width:100dvh'), 'a.css')).toBe(1);
  });
  test('a later same-property value with var(--app-vh) is dynamic', () => {
    expect(count(rule, css('max-height: calc(100vh - 64px); max-height: calc(var(--app-vh) - 64px);'), 'a.css')).toBe(0);
    expect(count(rule, css('max-height: calc(var(--app-vh) - 64px); max-height: calc(100vh - 64px);'), 'a.css')).toBe(1);
    expect(count(rule, css('max-height: calc(100vh - 64px); width: calc(var(--app-vh) - 64px);'), 'a.css')).toBe(1);
    expect(count(rule, css('height: 100vh; height: var(--other);'), 'a.css')).toBe(1);
  });
  test('partial vh and comments never count', () => {
    expect(count(rule, css('height: 60vh;'), 'a.css')).toBe(0);
    expect(count(rule, '/* .a { height: 100vh; } */ .b { color: red; }', 'a.css')).toBe(0);
  });
  test('touch-ok opt-out', () => {
    expect(count(rule, '.a {\n  /* touch-ok: TUX-060 reason */\n  height: 100vh;\n}', 'a.css')).toBe(0);
    expect(count(rule, '.a {\n  height: 100vh; /* touch-ok: Q4 */\n}', 'a.css')).toBe(0);
  });
  test('index.html body class', () => {
    const html = (cls) => `<html><body class="${cls}"><p>x</p></body></html>`;
    expect(count(rule, html('h-screen flex'), 'index.html')).toBe(1);
    expect(count(rule, html('min-h-screen max-h-screen'), 'index.html')).toBe(2);
    expect(count(rule, html('flex'), 'index.html')).toBe(0);
    expect(count(rule, '<html><body><div class="h-screen"></div></body></html>', 'index.html')).toBe(0);
  });
});

describe('R8 hover-only reveal outside (hover: hover)', () => {
  const rule = 'R8';
  const bare = '.row:hover .acts { opacity: 1; }';
  test('bare hover reveal counts', () => {
    expect(count(rule, bare, 'a.css')).toBe(1);
    expect(count(rule, '.row:hover .acts { display: flex; }', 'a.css')).toBe(1);
    expect(count(rule, '.row:hover .acts { visibility: visible; }', 'a.css')).toBe(1);
  });
  test('hover-capable wrappers are compliant', () => {
    expect(count(rule, `@media (hover: hover) { ${bare} }`, 'a.css')).toBe(0);
    expect(count(rule, `@media (any-hover: hover) { ${bare} }`, 'a.css')).toBe(0);
    expect(count(rule, `@media (pointer: fine) { ${bare} }`, 'a.css')).toBe(0);
    expect(count(rule, `@media (min-width: 600px) and (hover: hover) { ${bare} }`, 'a.css')).toBe(0);
  });
  test('a (hover: none) wrapper does not make the rule compliant', () => {
    expect(count(rule, `@media (hover: none) { ${bare} }`, 'a.css')).toBe(1);
    expect(count(rule, `@media (min-width: 600px) { ${bare} }`, 'a.css')).toBe(1);
  });
  test('hover rules that do not reveal are ignored', () => {
    expect(count(rule, '.row:hover { color: red; background: blue; }', 'a.css')).toBe(0);
    expect(count(rule, '.row .acts { opacity: 1; }', 'a.css')).toBe(0);
  });
  test('comments never count', () => {
    expect(count(rule, '/* .row:hover .acts { opacity: 1; } */', 'a.css')).toBe(0);
  });
  test('touch-ok opt-out', () => {
    expect(count(rule, '/* touch-ok: TUX-036 reason */\n' + bare, 'a.css')).toBe(0);
  });
});

describe('R9 icon-only button without aria-label', () => {
  const rule = 'R9';
  const page = (b) => `<html><body>${b}</body></html>`;
  test('empty and symbol-only buttons without a label count', () => {
    expect(count(rule, page('<button></button>'), 'index.html')).toBe(1);
    expect(count(rule, page('<button>  </button>'), 'index.html')).toBe(1);
    expect(count(rule, page('<button>×</button>'), 'index.html')).toBe(1);
    expect(count(rule, page('<button><svg></svg></button>'), 'index.html')).toBe(1);
  });
  test('labelled or texted buttons are fine', () => {
    expect(count(rule, page('<button aria-label="Close">×</button>'), 'index.html')).toBe(0);
    expect(count(rule, page('<button aria-labelledby="t">×</button>'), 'index.html')).toBe(0);
    expect(count(rule, page('<button>Save</button>'), 'index.html')).toBe(0);
  });
  test('only index.html is scanned', () => {
    expect(count(rule, "const b = document.createElement('button');", 'src/x.js')).toBe(0);
  });
  test('html comment and touch-ok', () => {
    expect(count(rule, page('<!-- <button></button> -->'), 'index.html')).toBe(0);
    expect(count(rule, page('\n<!-- touch-ok: TUX-039 reason -->\n<button></button>'), 'index.html')).toBe(0);
  });
  test('a touch-ok marker inside a multiline html comment is read (CodeQL bad-tag-filter)', () => {
    const src = page('\n<!--\n  touch-ok: TUX-039 reason\n-->\n<button></button>');
    const ok = R.markers(src, 'index.html').touchOk;
    expect(ok.length).toBe(1);
    expect(ok[0].valid).toBe(true);
    expect(count(rule, src, 'index.html')).toBe(0);
    // A marker-like string outside any comment is not a marker.
    expect(R.markers(page('<p>touch-ok: TUX-039 x</p>'), 'index.html').touchOk.length).toBe(0);
  });
});

describe('R10 raw modifier flags outside the helper', () => {
  const rule = 'R10';
  test('a click handler reading shiftKey counts', () => {
    expect(count(rule, "el.addEventListener('click', (e) => { if (e.shiftKey) go(); });")).toBe(1);
    expect(count(rule, 'function f(e) { return e.metaKey || e.ctrlKey; }')).toBe(2);
  });
  test('keyboard handlers are excluded', () => {
    expect(count(rule, "window.addEventListener('keydown', (e) => { if (e.ctrlKey) go(); });")).toBe(0);
    expect(count(rule, "document.onkeyup = function (e) { return e.altKey; };")).toBe(0);
    expect(count(rule, 'function h(e) { if (e.key === "a" && e.ctrlKey) go(); }')).toBe(0);
    expect(count(rule, "w.addEventListener('keydown', onKey); function onKey(e) { return e.metaKey; }")).toBe(0);
    expect(count(rule, "window.addEventListener('keydown', (e) => { [1].some(() => e.ctrlKey); });")).toBe(0);
  });
  test('a member handler registered for a key event resolves by property name', () => {
    const src = "this._onMod = (e) => { return e.altKey; }; document.addEventListener('keydown', this._onMod); document.addEventListener('keyup', this._onMod);";
    expect(count(rule, src)).toBe(0);
    expect(count(rule, "this._onMod = (e) => e.altKey; document.addEventListener('keydown', this._other);")).toBe(1);
    expect(count(rule, "this._onMod = (e) => e.altKey; el.addEventListener('pointerdown', this._onMod);")).toBe(1);
  });
  test('key reads on a non-event object do not make a pointer handler a keyboard handler', () => {
    expect(count(rule, "el.addEventListener('pointerdown', (e) => { const k = hit.which; if (e.shiftKey) go(k); });")).toBe(1);
    expect(count(rule, 'function drag(e, hit) { if (hit.which) go(); return e.altKey; }')).toBe(1);
    expect(count(rule, 'function h(ev) { if (ev.keyCode === 13 && ev.ctrlKey) go(); }')).toBe(0);
  });
  test('getModifierState and the helper module are excluded', () => {
    expect(count(rule, 'function getModifierState(e) { return { ctrl: e.ctrlKey, shift: e.shiftKey }; }')).toBe(0);
    expect(count(rule, 'const api = { getModifierState(e) { return e.metaKey; } };')).toBe(0);
    expect(count(rule, 'function x(e) { return e.ctrlKey; }', 'src/ui/input-modifiers.js')).toBe(0);
  });
  test('object keys, destructuring, strings, comments and writes do not count', () => {
    expect(count(rule, 'const o = { ctrlKey: true, shiftKey: false };')).toBe(0);
    expect(count(rule, 'function f(e) { const { ctrlKey } = e; return ctrlKey; }')).toBe(0);
    expect(count(rule, "const s = 'e.ctrlKey';")).toBe(0);
    expect(count(rule, '// e.shiftKey')).toBe(0);
    expect(count(rule, 'function f(e) { e.shiftKey = true; }')).toBe(0);
  });
  test('touch-ok opt-out', () => {
    expect(count(rule, 'function f(e) { return e.shiftKey; } // touch-ok: TUX-033 reason')).toBe(0);
  });
  test('raw total is reported before exclusion', () => {
    const full = R.scanFull("window.addEventListener('keydown', (e) => e.ctrlKey); function f(e) { return e.altKey; }", 'src/x.js');
    expect(full.stats.r10Raw).toBe(2);
    expect(full.hits.filter((h) => h.rule === 'R10').length).toBe(1);
  });
});

describe('R11 range input outside the global touch-safe controller (Q26)', () => {
  const rule = 'R11';
  test('a bare range input is covered by RangeTouch and the coarse CSS, so it is not flagged', () => {
    expect(count(rule, "input.type = 'range';")).toBe(0);
    expect(count(rule, "input.setAttribute('type', 'range');")).toBe(0);
    expect(count(rule, 'const h = `<input class="${c}" type="range" min="0">`;')).toBe(0);
    expect(count(rule, '<html><body><input type="range"></body></html>', 'index.html')).toBe(0);
  });
  test('a site that opts out of the controller is flagged (JS)', () => {
    expect(count(rule, "r.setAttribute('data-range-touch', 'off');")).toBe(1);
    expect(count(rule, "r.dataset.rangeTouch = 'off';")).toBe(1);
    expect(count(rule, "r.classList.add('tux-nope');")).toBe(1);
    expect(count(rule, "r.className = 'sld tux-nope';")).toBe(1);
    expect(count(rule, 'const h = `<input type="range" class="a tux-nope">`;')).toBe(1);
    expect(count(rule, "const h = '<div data-range-touch=\"off\"><input type=\"range\"></div>';")).toBe(1);
  });
  test('a site that opts out of the controller is flagged (index.html)', () => {
    expect(count(rule, '<html><body><input type="range" class="tux-nope"></body></html>', 'index.html')).toBe(1);
    expect(count(rule, '<html><body><div data-range-touch="off"><input type="range"></div></body></html>', 'index.html')).toBe(1);
  });
  test('the other opt-in values and comments do not count', () => {
    expect(count(rule, "r.setAttribute('data-range-touch', 'on');")).toBe(0);
    expect(count(rule, "const q = 'input[type=\"range\"]:not(.tux-nope)';")).toBe(0);
    expect(count(rule, "// r.classList.add('tux-nope')")).toBe(0);
  });
  test('touch-alt within 5 lines or touch-ok clears an opt-out', () => {
    expect(count(rule, "// touch-alt: TUX-043 via touchDialValue - own drag rule\nr.setAttribute('data-range-touch', 'off');")).toBe(0);
    expect(count(rule, "r.classList.add('tux-nope'); // touch-ok: TUX-043 reason")).toBe(0);
  });

  describe('coverage by the global controller and CSS', () => {
    const slider = [
      'UI.RangeTouch = (() => {',
      "  document.addEventListener('pointerdown', a, true);",
      "  document.addEventListener('pointermove', a, true);",
      "  document.addEventListener('pointerup', a, true);",
      "  document.addEventListener('pointercancel', a, true);",
      '})();',
    ].join('\n');
    const css = (body) => [{ rel: 'src/ui/skin/components.css', text: body }];
    const goodCss = "@media (pointer: coarse) { [data-ui-skin] input[type='range']:not(.tux-nope) { block-size: 44px; touch-action: pan-y; } }";
    test('the real shape passes', () => {
      expect(R.checkR11Coverage(slider, css(goodCss))).toEqual([]);
    });
    test('a range outside the controller coverage fails: no document-level pointer listeners', () => {
      const bare = "UI.RangeTouch = {}; el.addEventListener('pointerdown', a);";
      const hits = R.checkR11Coverage(bare, css(goodCss));
      expect(hits.length).toBe(1);
      expect(hits[0].rule).toBe('R11');
      expect(hits[0].file).toBe('src/ui/components/slider.js');
    });
    test('fails when one phase is missing, or RangeTouch is not exported', () => {
      expect(R.checkR11Coverage(slider.replace("document.addEventListener('pointercancel', a, true);", ''), css(goodCss)).length).toBe(1);
      expect(R.checkR11Coverage(slider.replace('UI.RangeTouch =', 'const x ='), css(goodCss)).length).toBe(1);
    });
    test('a range outside the coarse CSS fails: rule narrowed to a class, not coarse, or no touch-action', () => {
      const narrowed = "@media (pointer: coarse) { .panel input[type='range'] { block-size: 44px; touch-action: pan-y; } }";
      const fine = "[data-ui-skin] input[type='range'] { block-size: 44px; touch-action: pan-y; }";
      const noAction = "@media (pointer: coarse) { input[type='range'] { block-size: 44px; } }";
      const autoAction = "@media (pointer: coarse) { input[type='range'] { block-size: 44px; touch-action: auto; } }";
      [narrowed, fine, noAction, autoAction, '/* ' + goodCss + ' */'].forEach((c) => {
        const hits = R.checkR11Coverage(slider, css(c));
        expect(hits.length).toBe(1);
        expect(hits[0].file).toBe('src/ui/skin');
      });
    });
  });
});

describe('touch-alt v2: a marker must cite its touch equivalent', () => {
  const src = [{ rel: 'src/x.js', text: 'function bindTouchDrag() {}\n// bindGhost only in a comment\n' }];
  const m = (text, file = 'src/y.js') => [{ file, line: 1, text }];
  test('a cited, existing equivalent passes', () => {
    expect(R.checkAltMarkers(m('touch-alt: TUX-044 via bindTouchDrag - grip reorders by finger'), src)).toEqual([]);
  });
  test('an annotation without a citation fails', () => {
    const problems = R.checkAltMarkers(m('touch-alt: TUX-044 the grip reorders by finger'), src);
    expect(problems.length).toBe(1);
    expect(problems[0]).toMatch(/must cite its touch equivalent/);
  });
  test('a citation that exists only in a comment, or nowhere, fails', () => {
    expect(R.checkAltMarkers(m('touch-alt: TUX-044 via bindGhost - reason'), src).length).toBe(1);
    expect(R.checkAltMarkers(m('touch-alt: TUX-044 via noSuchSymbol - reason'), src).length).toBe(1);
  });
  test('the legacy allowlist covers only its count per file and only shrinks', () => {
    const two = [...m('touch-alt: TUX-038 old a', 'src/old.js'), ...m('touch-alt: TUX-038 old b', 'src/old.js')];
    expect(R.checkAltMarkers(two, src, { 'src/old.js': 2 })).toEqual([]);
    expect(R.checkAltMarkers(two, src, { 'src/old.js': 1 }).length).toBe(1);
    expect(R.checkAltMarkers(m('touch-alt: TUX-038 new', 'src/new.js'), src, { 'src/old.js': 2 }).length).toBe(2);
  });
  test('each legacy count must EQUAL the old-format markers the file holds (a stale allowance fails)', () => {
    const two = [...m('touch-alt: TUX-038 old a', 'src/old.js'), ...m('touch-alt: TUX-038 old b', 'src/old.js')];
    expect(R.checkAltMarkers(two, src, { 'src/old.js': 2 })).toEqual([]);
    const over = R.checkAltMarkers(two, src, { 'src/old.js': 3 });
    expect(over.length).toBe(1);
    expect(over[0]).toMatch(/src\/old\.js.*says 3.*holds 2.*lower LEGACY_TOUCH_ALT to 2/);
    // a legacy file whose markers were all migrated to the cited form must leave the allowlist
    const migrated = m('touch-alt: TUX-044 via bindTouchDrag - grip reorders by finger', 'src/old.js');
    const gone = R.checkAltMarkers(migrated, src, { 'src/old.js': 1 });
    expect(gone.length).toBe(1);
    expect(gone[0]).toMatch(/delete the entry/);
    // a file with no markers at all, listed in the allowlist, fails too
    expect(R.checkAltMarkers([], src, { 'src/ghost.js': 1 }).length).toBe(1);
  });
});

describe('R12 drag handle without touch-action none', () => {
  const uiTouch = "const bridgeSelector = '.pane-resizer, .layer-grip, .angle-dial';";
  test('reads the bridge selector list and adds ctxbar-handle', () => {
    expect(R.bridgeClasses(uiTouch)).toEqual(['pane-resizer', 'layer-grip', 'angle-dial', 'ctxbar-handle']);
  });
  test('a class with a touch-action none rule passes; others are reported', () => {
    const classes = R.bridgeClasses(uiTouch);
    const css = [{
      rel: 'src/ui/skin/components.css',
      text: '.pane-resizer, .x .layer-grip:active { touch-action: none; } .angle-dial { touch-action: manipulation; } .ctxbar-handle { touch-action: none !important; }',
    }];
    const hits = R.checkR12(classes, css);
    expect(hits.map((h) => h.detail)).toEqual(['angle-dial']);
    expect(hits[0].rule).toBe('R12');
    expect(hits[0].file).toBe('src/ui/skin');
  });
  test('a descendant selector is not a standalone compound ending in the class', () => {
    const hits = R.checkR12(['layer-grip'], [{ rel: 'a.css', text: '.layer-grip .child { touch-action: none; }' }]);
    expect(hits.length).toBe(1);
  });
  test('comments never count', () => {
    const hits = R.checkR12(['layer-grip'], [{ rel: 'a.css', text: '/* .layer-grip { touch-action: none; } */' }]);
    expect(hits.length).toBe(1);
  });
});

describe('R13 opt-out markers', () => {
  test('reads touch-ok and touch-alt from comments only', () => {
    const src = [
      '// touch-ok: TUX-031 good reason',
      '// touch-ok: no ticket here',
      '/* touch-alt: TUX-034 long press */',
      '// touch-alt: bad',
      "const s = '// touch-ok: TUX-999 in a string';",
    ].join('\n');
    const m = R.markers(src, 'src/x.js');
    expect(m.touchOk.map((x) => x.valid)).toEqual([true, false]);
    expect(m.touchAlt.map((x) => x.valid)).toEqual([true, false]);
  });
  test('reads CSS and HTML markers', () => {
    expect(R.markers('/* touch-ok: Q5 pending */ .a{}', 'a.css').touchOk.map((x) => x.valid)).toEqual([true]);
    expect(R.markers('<html><body><!-- touch-ok: nope --></body></html>', 'index.html').touchOk.map((x) => x.valid)).toEqual([false]);
  });
});

describe('parse failures', () => {
  test('an unparseable JS file throws and names the file', () => {
    expect(() => R.scan('function (', 'src/broken.js')).toThrow(/src\/broken\.js/);
  });
});
