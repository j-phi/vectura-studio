/**
 * TUX-060 static touch guard: detector core.
 *
 * Pure functions. Input is source text plus a repo-relative path. Output is a list
 * of { rule, file, line, detail? }. No file access here: the tests load the files.
 * JS is parsed with espree and walked as an AST, so comments and string contents
 * never count as code. CSS is parsed with postcss. index.html is parsed with jsdom.
 *
 * Opt-out markers:
 *   touch-ok: <reason>   reason must match /TUX-\d{3}|Q\d+/. A marker on the same line
 *                        as a match, or on the line directly above it, removes that
 *                        match from every rule. A trailing marker covers only its own line.
 *   touch-alt: TUX-nnn <text>   declares a touch alternative (used by R1, R5, R6).
 *
 * R10 exclusion heuristic (raw .metaKey/.ctrlKey/.shiftKey/.altKey reads):
 *   a read is excluded when ANY function around it
 *   (a) is named getModifierState,
 *   (b) is registered for keydown/keyup/keypress (inline, or by a name that resolves
 *       to a function declared in the same file), or
 *   (c) itself reads .key, .code, .keyCode or .which on its event object (its first parameter,
 *       or e/ev/evt/event). Reads such as hit.which do not count (nested functions not included).
 *   Every read in src/ui/input-modifiers.js is excluded. Assignments are writes, not reads.
 */
const espree = require('espree');
const postcss = require('postcss');
const { JSDOM } = require('jsdom');
const crypto = require('crypto');

const MODIFIER_PROPS = new Set(['metaKey', 'ctrlKey', 'shiftKey', 'altKey']);
const KEY_PROPS = new Set(['key', 'code', 'keyCode', 'which']);
const KEY_EVENTS = new Set(['keydown', 'keyup', 'keypress']);
const NEUTRAL_CALLS = new Set(['preventDefault', 'stopPropagation', 'stopImmediatePropagation']);
const SLIDER_PATH = 'src/ui/components/slider.js';
const MODIFIER_HELPER_PATH = 'src/ui/input-modifiers.js';
const EXTRA_DRAG_CLASSES = ['ctxbar-handle'];

const cache = new Map();
const memo = (kind, rel, text, fn) => {
  const key = `${kind}|${rel}|${crypto.createHash('sha1').update(text).digest('hex')}`;
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key);
};

// ---------------------------------------------------------------- markers
const OK_RE = /touch-ok:([^\n]*)/g;
const ALT_RE = /touch-alt:([^\n]*)/g;
const OK_REASON = /TUX-\d{3}|Q\d+/;
const ALT_FORMAT = /touch-alt:\s*TUX-\d{3}\s+\S+/;

/** comments: [{ text, startLine, endLine, trailing }] */
function markersFromComments(comments) {
  const touchOk = [];
  const touchAlt = [];
  comments.forEach((c) => {
    c.text.split('\n').forEach((lineText, i) => {
      let m;
      OK_RE.lastIndex = 0;
      while ((m = OK_RE.exec(lineText))) {
        touchOk.push({ line: c.startLine + i, endLine: c.endLine, trailing: c.trailing, valid: OK_REASON.test(m[1]), text: m[0].trim() });
      }
      ALT_RE.lastIndex = 0;
      while ((m = ALT_RE.exec(lineText))) {
        touchAlt.push({ line: c.startLine + i, endLine: c.endLine, valid: ALT_FORMAT.test(m[0]), text: m[0].trim() });
      }
    });
  });
  return { touchOk, touchAlt };
}

const isTrailing = (lines, startLine, startCol) => (lines[startLine - 1] || '').slice(0, startCol).trim() !== '';

// ---------------------------------------------------------------- JS
function parseJs(text, rel) {
  const base = { ecmaVersion: 'latest', comment: true, loc: true, range: true };
  try {
    return espree.parse(text, { ...base, sourceType: 'script' });
  } catch (scriptErr) {
    try {
      return espree.parse(text, { ...base, sourceType: 'module' });
    } catch (moduleErr) {
      throw new Error(`touch-static-guard: cannot parse ${rel}: ${moduleErr.message}`);
    }
  }
}

const SKIP_KEYS = new Set(['type', 'loc', 'range', 'start', 'end', 'comments', 'tokens']);
const isFn = (n) => n && (n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression');
const propName = (m) => (m && m.type === 'MemberExpression' && !m.computed && m.property.type === 'Identifier' ? m.property.name : null);
const strValue = (n) => {
  if (!n) return null;
  if (n.type === 'Literal' && typeof n.value === 'string') return n.value;
  if (n.type === 'TemplateLiteral' && n.expressions.length === 0) return n.quasis[0].value.cooked;
  return null;
};

function walk(node, anc, visit) {
  if (!node || typeof node.type !== 'string') return;
  visit(node, anc);
  anc.push(node);
  for (const key in node) {
    if (SKIP_KEYS.has(key)) continue;
    const v = node[key];
    if (Array.isArray(v)) {
      for (let i = 0; i < v.length; i++) if (v[i] && typeof v[i].type === 'string') walk(v[i], anc, visit);
    } else if (v && typeof v.type === 'string') walk(v, anc, visit);
  }
  anc.pop();
}

function analyzeJs(text, rel) {
  const ast = parseJs(text, rel);
  const lines = text.split('\n');
  const comments = ast.comments.map((c) => ({
    text: c.value,
    startLine: c.loc.start.line,
    endLine: c.loc.end.line,
    trailing: isTrailing(lines, c.loc.start.line, c.loc.start.column),
  }));
  const info = {
    comments,
    touchHold: false,
    regs: [], // { event, line, handler, how }
    pendingAdds: [], // addEventListener with a non-literal event argument
    fnByName: new Map(),
    arrayByName: new Map(),
    modReads: [], // { line, fns }
    keyReadFns: new Set(),
    keyRegisteredFns: new Set(),
    keyRegisteredNames: new Set(),
    draggable: [], // lines
    rangeInput: [], // lines
    dragstart: [], // lines
    fnNames: new Map(),
    bridgeSelector: null,
  };
  const fnStack = [];

  const declareFn = (name, fn) => { if (name && fn && !info.fnByName.has(name)) info.fnByName.set(name, fn); };

  walk(ast, [], function visit(node, anc) {
    // function stack bookkeeping is done manually: visit is called before children
    switch (node.type) {
      case 'Identifier':
        if (node.name === 'TouchHold') info.touchHold = true;
        break;
      case 'FunctionDeclaration':
        declareFn(node.id && node.id.name, node);
        break;
      case 'VariableDeclarator':
        if (node.id.type === 'Identifier' && node.init) {
          if (isFn(node.init)) declareFn(node.id.name, node.init);
          else if (node.init.type === 'ArrayExpression') info.arrayByName.set(node.id.name, node.init);
          else if (node.id.name === 'bridgeSelector' && strValue(node.init) != null) info.bridgeSelector = strValue(node.init);
        }
        break;
      case 'MemberExpression': {
        const name = propName(node);
        if (name === 'TouchHold') info.touchHold = true;
        if (name && KEY_PROPS.has(name) && isEventObject(node.object, nearestFn(anc))) {
          const fn = nearestFn(anc);
          if (fn) info.keyReadFns.add(fn);
        }
        if (name && MODIFIER_PROPS.has(name)) {
          const parent = anc[anc.length - 1];
          const isWrite = parent && ((parent.type === 'AssignmentExpression' && parent.left === node) || (parent.type === 'UpdateExpression'));
          if (!isWrite) info.modReads.push({ line: node.loc.start.line, fns: anc.filter(isFn) });
        }
        break;
      }
      case 'AssignmentExpression': {
        const name = propName(node.left);
        if (!name) break;
        const line = node.loc.start.line;
        if (name.startsWith('on') && name.length > 2) {
          info.regs.push({ event: name.slice(2), line, handler: node.right, how: 'prop', anc: anc.slice(), target: srcOf(text, node.left.object) });
          if (KEY_EVENTS.has(name.slice(2))) markKeyHandler(info, node.right);
        }
        if (name === 'draggable' && ((node.right.type === 'Literal' && (node.right.value === true || node.right.value === 'true')))) info.draggable.push(line);
        if (name === 'type' && strValue(node.right) === 'range') info.rangeInput.push(line);
        if (node.left.property && isFn(node.right)) info.fnNames.set(node.right, name);
        break;
      }
      case 'Property':
      case 'MethodDefinition': {
        const key = !node.computed && node.key && (node.key.type === 'Identifier' ? node.key.name : null);
        if (key && isFn(node.value)) info.fnNames.set(node.value, key);
        break;
      }
      case 'CallExpression': {
        const name = propName(node.callee);
        const line = node.loc.start.line;
        if (name === 'addEventListener' && node.arguments.length >= 2) {
          const ev = strValue(node.arguments[0]);
          if (ev != null) {
            info.regs.push({ event: ev, line, handler: node.arguments[1], how: 'add', anc: anc.slice(), target: srcOf(text, node.callee.object) });
            if (KEY_EVENTS.has(ev)) markKeyHandler(info, node.arguments[1]);
            if (ev === 'dragstart') info.dragstart.push(line);
          } else if (node.arguments[0].type === 'Identifier') {
            info.pendingAdds.push({ name: node.arguments[0].name, line, handler: node.arguments[1], anc: anc.slice(), target: srcOf(text, node.callee.object) });
          }
        } else if (name === 'setAttribute' && node.arguments.length >= 2) {
          const a = strValue(node.arguments[0]);
          const b = node.arguments[1];
          if (a === 'draggable' && ((b.type === 'Literal' && (b.value === true || b.value === 'true')))) info.draggable.push(line);
          if (a === 'type' && strValue(b) === 'range') info.rangeInput.push(line);
        }
        break;
      }
      case 'Literal':
        if (typeof node.value === 'string') scanMarkupString(info, node.value, node.loc.start.line);
        break;
      case 'TemplateLiteral': {
        const joined = node.quasis.map((q) => q.value.cooked == null ? q.value.raw : q.value.cooked).join('$X');
        scanMarkupString(info, joined, node.loc.start.line);
        break;
      }
      default:
    }
  });

  // resolve array / forEach event names for addEventListener(ev, fn)
  info.pendingAdds.forEach((p) => {
    resolveLoopEvents(p, info).forEach((ev) => {
      info.regs.push({ event: ev, line: p.line, handler: p.handler, how: 'add', anc: p.anc, target: p.target });
      if (KEY_EVENTS.has(ev)) markKeyHandler(info, p.handler);
      if (ev === 'dragstart') info.dragstart.push(p.line);
    });
  });
  return info;
}

const srcOf = (text, node) => (node && node.range ? text.slice(node.range[0], node.range[1]) : null);
const EVENT_IDENTS = new Set(['e', 'ev', 'evt', 'event']);
// R10 (c): a key read counts only on the handler's event object (first parameter or a known event identifier).
function isEventObject(obj, fn) {
  if (!obj || obj.type !== 'Identifier') return false;
  if (EVENT_IDENTS.has(obj.name)) return true;
  const first = fn && fn.params && fn.params[0];
  return !!first && first.type === 'Identifier' && first.name === obj.name;
}

function nearestFn(anc) {
  for (let i = anc.length - 1; i >= 0; i--) if (isFn(anc[i])) return anc[i];
  return null;
}

function markKeyHandler(info, handler) {
  if (isFn(handler)) info.keyRegisteredFns.add(handler);
  else if (handler && handler.type === 'Identifier') info.keyRegisteredNames.add(handler.name);
}

function arrayStrings(arr, info) {
  let node = arr;
  if (node && node.type === 'Identifier') node = info.arrayByName.get(node.name);
  if (!node || node.type !== 'ArrayExpression') return [];
  return node.elements.map(strValue).filter((s) => s != null);
}

function resolveLoopEvents(p, info) {
  const out = [];
  for (let i = p.anc.length - 1; i >= 0; i--) {
    const n = p.anc[i];
    if (isFn(n)) {
      const parent = p.anc[i - 1];
      if (parent && parent.type === 'CallExpression' && parent.arguments.includes(n) && propName(parent.callee) === 'forEach') {
        const first = n.params[0];
        if (first && first.type === 'Identifier' && first.name === p.name) return arrayStrings(parent.callee.object, info);
      }
    } else if (n.type === 'ForOfStatement') {
      const decl = n.left.type === 'VariableDeclaration' ? n.left.declarations[0] : null;
      if (decl && decl.id.type === 'Identifier' && decl.id.name === p.name) return arrayStrings(n.right, info);
    }
  }
  return out;
}

const MARKUP_DRAG = /<[^<>]*\bdraggable\s*=\s*["']?true\b/g;
const MARKUP_RANGE = /<[^<>]*\btype\s*=\s*["']?range\b/g;
function scanMarkupString(info, value, startLine) {
  if (value.indexOf('<') < 0) return;
  let m;
  MARKUP_DRAG.lastIndex = 0;
  while ((m = MARKUP_DRAG.exec(value))) info.draggable.push(startLine + countNl(value, m.index));
  MARKUP_RANGE.lastIndex = 0;
  while ((m = MARKUP_RANGE.exec(value))) info.rangeInput.push(startLine + countNl(value, m.index));
}
const countNl = (s, upTo) => { let n = 0; for (let i = 0; i < upTo; i++) if (s.charCodeAt(i) === 10) n++; return n; };

// --- handler helpers
function resolveHandler(handler, info) {
  if (isFn(handler)) return handler;
  if (handler && handler.type === 'Identifier') return info.fnByName.get(handler.name) || null;
  return null;
}

function isNeutralCall(expr) {
  if (!expr) return false;
  if (expr.type === 'CallExpression') {
    const n = propName(expr.callee);
    return !!n && NEUTRAL_CALLS.has(n);
  }
  return expr.type === 'Literal' && expr.value === false;
}

function isNeutralHandler(handler, info) {
  const fn = resolveHandler(handler, info);
  if (!fn) return false;
  if (fn.body.type !== 'BlockStatement') return isNeutralCall(fn.body);
  return fn.body.body.every((s) => {
    if (s.type === 'ExpressionStatement') return isNeutralCall(s.expression);
    if (s.type === 'ReturnStatement') return s.argument == null || isNeutralCall(s.argument);
    return false;
  });
}

// ---------------------------------------------------------------- JS rules
function jsHits(info, rel) {
  const hits = [];
  const add = (rule, line, detail) => hits.push({ rule, file: rel, line, detail });
  const regs = info.regs;
  const altLines = info.markers.touchAlt;
  const altNear = (line) => altLines.some((a) => a.endLine <= line && a.endLine >= line - 5);
  const evs = (names) => regs.filter((r) => names.includes(r.event));

  // R1
  const compliantR1 = info.touchHold || altLines.length > 0;
  if (!compliantR1) {
    evs(['contextmenu']).forEach((r) => {
      if (!isNeutralHandler(r.handler, info)) add('R1', r.line);
    });
  }
  // R2
  // Paired by target: a mouseenter/mouseover is compliant only when click/pointerup/pointerdown
  // is registered on the same target (same source text), or a touch-alt marker sits near it.
  const pressTargets = new Set(regs.filter((r) => r.event === 'click' || r.event === 'pointerup' || r.event === 'pointerdown').map((r) => r.target));
  evs(['mouseenter', 'mouseover']).forEach((r) => {
    if (r.target != null && pressTargets.has(r.target)) return;
    if (altNear(r.line)) return;
    add('R2', r.line);
  });
  // R3
  evs(['mousedown']).forEach((r) => add('R3', r.line));
  // R4 (touch-ok removal is applied before counting, see filter below)
  hits.push(...[]);
  // R5
  evs(['dblclick']).forEach((r) => { if (!info.touchHold && !altNear(r.line)) add('R5', r.line); });
  // R6
  info.draggable.concat(info.dragstart).forEach((line) => { if (!altNear(line)) add('R6', line); });
  // R11
  if (rel !== SLIDER_PATH) info.rangeInput.forEach((line) => add('R11', line));
  // R10
  const named = (fn) => info.fnNames.get(fn) || (fn.id && fn.id.name) || nameOfDeclarator(info, fn);
  info.r10Raw = 0;
  info.modReads.forEach((rd) => {
    info.r10Raw++;
    if (rel === MODIFIER_HELPER_PATH) return;
    const excluded = rd.fns.some((fn) => {
      const nm = named(fn);
      if (nm === 'getModifierState') return true;
      if (info.keyRegisteredFns.has(fn)) return true;
      if (nm && info.keyRegisteredNames.has(nm)) return true;
      return info.keyReadFns.has(fn);
    });
    if (!excluded) add('R10', rd.line);
  });
  return hits;
}

function nameOfDeclarator(info, fn) {
  for (const [name, f] of info.fnByName) if (f === fn) return name;
  return null;
}

function applyTouchOk(hits, markers) {
  const covered = new Set();
  markers.touchOk.forEach((m) => {
    covered.add(m.endLine);
    if (!m.trailing) covered.add(m.endLine + 1);
  });
  return hits.filter((h) => !covered.has(h.line));
}

function scanJs(text, rel) {
  return memo('js', rel, text, () => {
    const info = analyzeJs(text, rel);
    info.markers = markersFromComments(info.comments);
    // touch-ok removes registrations before counting, so R2/R4 see the filtered set
    const okLines = new Set();
    info.markers.touchOk.forEach((m) => { okLines.add(m.endLine); if (!m.trailing) okLines.add(m.endLine + 1); });
    const allRegs = info.regs;
    let hits = jsHits(info, rel);
    // R4: per-file difference, after dropping touch-ok registrations
    const ups = allRegs.filter((r) => r.event === 'pointerup' && !okLines.has(r.line));
    const cancels = allRegs.filter((r) => r.event === 'pointercancel' && !okLines.has(r.line));
    const extra = Math.max(0, ups.length - cancels.length);
    ups.slice(ups.length - extra).forEach((r) => hits.push({ rule: 'R4', file: rel, line: r.line }));
    hits = applyTouchOk(hits, info.markers);
    return { hits, markers: info.markers, stats: { r10Raw: info.r10Raw }, info };
  });
}

// ---------------------------------------------------------------- CSS
const stripVar = (value) => {
  let out = '';
  let i = 0;
  while (i < value.length) {
    if (value.startsWith('var(', i)) {
      let depth = 0;
      let j = i + 3;
      for (; j < value.length; j++) {
        if (value[j] === '(') depth++;
        else if (value[j] === ')') { depth--; if (depth === 0) break; }
      }
      i = j + 1;
    } else { out += value[i]; i++; }
  }
  return out;
};
const BARE_VH = /(^|[^\d.])100vh\b/;
const DYN_VH = /\b\d+(?:\.\d+)?(?:dvh|svh|lvh)\b/;
const HOVER_CAPABLE = /(?:\bany-hover|\bhover)\s*:\s*hover\b|\bpointer\s*:\s*fine\b/;

function scanCss(text, rel) {
  return memo('css', rel, text, () => {
    let root;
    try {
      root = postcss.parse(text, { from: rel });
    } catch (e) {
      throw new Error(`touch-static-guard: cannot parse ${rel}: ${e.message}`);
    }
    const lines = text.split('\n');
    const comments = [];
    root.walkComments((c) => {
      comments.push({
        text: c.text,
        startLine: c.source.start.line,
        endLine: c.source.end.line,
        trailing: isTrailing(lines, c.source.start.line, c.source.start.column - 1),
      });
    });
    const markers = markersFromComments(comments);
    let hits = [];
    root.walkDecls((decl) => {
      if (!BARE_VH.test(stripVar(decl.value))) return;
      const parent = decl.parent;
      let later = false;
      let seen = false;
      parent.each((sib) => {
        if (sib === decl) { seen = true; return; }
        if (seen && sib.type === 'decl' && sib.prop.toLowerCase() === decl.prop.toLowerCase() && DYN_VH.test(sib.value)) later = true;
      });
      if (!later) hits.push({ rule: 'R7', file: rel, line: decl.source.start.line, detail: `${decl.prop}: ${decl.value}` });
    });
    root.walkRules((rule) => {
      if (!/:hover/.test(rule.selector)) return;
      const reveals = rule.nodes && rule.nodes.some((n) => n.type === 'decl' && ['opacity', 'display', 'visibility'].includes(n.prop.toLowerCase()));
      if (!reveals) return;
      for (let p = rule.parent; p; p = p.parent) {
        if (p.type === 'atrule' && HOVER_CAPABLE.test(p.params)) return;
      }
      hits.push({ rule: 'R8', file: rel, line: rule.source.start.line, detail: rule.selector });
    });
    hits = applyTouchOk(hits, markers);
    return { hits, markers, stats: {} };
  });
}

// ---------------------------------------------------------------- HTML
function scanHtml(text, rel) {
  return memo('html', rel, text, () => {
    const dom = new JSDOM(text, { includeNodeLocations: true });
    const doc = dom.window.document;
    const lineOf = (el) => { const loc = dom.nodeLocation(el); return loc ? loc.startLine : 0; };
    let hits = [];
    const add = (rule, el, detail) => hits.push({ rule, file: rel, line: lineOf(el), detail });
    const body = doc.body;
    if (body) {
      const tokens = (body.getAttribute('class') || '').split(/\s+/);
      ['h-screen', 'min-h-screen', 'max-h-screen'].forEach((t) => { if (tokens.includes(t)) add('R7', body, t); });
    }
    doc.querySelectorAll('[draggable="true"]').forEach((el) => add('R6', el));
    doc.querySelectorAll('input[type="range"]').forEach((el) => add('R11', el));
    doc.querySelectorAll('button').forEach((el) => {
      const t = el.textContent.trim();
      const iconOnly = t === '' || !/\p{L}/u.test(t);
      if (iconOnly && !el.hasAttribute('aria-label') && !el.hasAttribute('aria-labelledby')) add('R9', el);
    });
    // markers: HTML comments, line based
    const lines = text.split('\n');
    const comments = [];
    lines.forEach((ln, i) => {
      const m = /<!--(.*?)(?:-->|$)/.exec(ln);
      if (m) comments.push({ text: m[1], startLine: i + 1, endLine: i + 1, trailing: ln.slice(0, m.index).trim() !== '' });
    });
    const markers = markersFromComments(comments);
    hits = applyTouchOk(hits, markers);
    return { hits, markers, stats: {} };
  });
}

// ---------------------------------------------------------------- API
function scanFull(text, rel) {
  if (/\.css$/.test(rel)) return scanCss(text, rel);
  if (/\.html?$/.test(rel)) return scanHtml(text, rel);
  const r = scanJs(text, rel);
  return { hits: r.hits, markers: r.markers, stats: r.stats };
}
const scan = (text, rel) => scanFull(text, rel).hits;
const markers = (text, rel) => scanFull(text, rel).markers;

/** Class names from the ui-touch.js bridgeSelector string literal, plus the extra handles. */
function bridgeClasses(uiTouchText) {
  const info = scanJs(uiTouchText, 'src/ui/ui-touch.js').info;
  if (info.bridgeSelector == null) throw new Error('touch-static-guard: bridgeSelector string literal not found in ui-touch.js');
  const out = [];
  info.bridgeSelector.replace(/\.([A-Za-z0-9_-]+)/g, (_, c) => { if (!out.includes(c)) out.push(c); return _; });
  EXTRA_DRAG_CLASSES.forEach((c) => { if (!out.includes(c)) out.push(c); });
  return out;
}

/** R12: classes with no skin rule that ends in them and declares touch-action: none. */
function checkR12(classes, cssFiles) {
  const covered = new Set();
  cssFiles.forEach(({ rel, text }) => {
    let root;
    try { root = postcss.parse(text, { from: rel }); } catch (e) { throw new Error(`touch-static-guard: cannot parse ${rel}: ${e.message}`); }
    root.walkRules((rule) => {
      const none = rule.nodes && rule.nodes.some((n) => n.type === 'decl' && n.prop.toLowerCase() === 'touch-action' && /^none\b/i.test(n.value.trim()));
      if (!none) return;
      rule.selectors.forEach((sel) => {
        const compound = sel.trim().replace(/(?::[A-Za-z-]+(?:\([^)]*\))?)+$/, '').split(/[\s>+~]+/).pop();
        const m = /\.([A-Za-z0-9_-]+)$/.exec(compound);
        if (m) covered.add(m[1]);
      });
    });
  });
  return classes.filter((c) => !covered.has(c)).map((c) => ({ rule: 'R12', file: 'src/ui/skin', line: 0, detail: c }));
}

module.exports = {
  scan,
  scanFull,
  markers,
  bridgeClasses,
  checkR12,
  OK_REASON,
  ALT_FORMAT,
};
