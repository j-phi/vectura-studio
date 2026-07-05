/*
 * Text edit lifecycle / safety — BLOCKER regression coverage (M2/M3).
 *
 * These tests drive the REAL keydown propagation through BOTH the controller's
 * capture-phase window listener AND a faithful stand-in of the global bubble
 * shortcut handler (mirroring src/ui/shortcuts.js ~:404 delete + ~:38 undo).
 * Events are dispatched on document.body (NOT on window) so the window capture
 * listener fires during the descending capture phase — exactly as a real browser
 * keydown from the focused canvas/body would behave — letting stopPropagation in
 * capture prevent the bubble handler from running.
 *
 * Blockers covered:
 *   1. No-op / gated Backspace/Delete must NOT fall through to the global delete.
 *   2. Undo/redo mid-session must not orphan the controller's layer reference.
 *   3. Removing / replacing the edited layer must end() the session (no leaks).
 *   plus: double-begin guard, multi-line sourceIndex editing, empty-box first key.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Type tool edit lifecycle / safety (blockers)', () => {
  let runtime, V, win, doc;

  beforeEach(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    win = runtime.window;
    doc = runtime.document;
  });
  afterEach(() => runtime.cleanup());

  const makeTextLayer = (engine, extra = {}) => {
    const id = engine.addLayer('text');
    const layer = engine.layers.find((l) => l.id === id);
    Object.assign(layer.params, { text: '', font: 'sans', fitToFrame: false, fontSize: 40, jitter: 0 }, extra);
    engine.generate(id);
    return { id, layer };
  };

  // Host that enables blink (requestDraw present) so timer-leak assertions bite.
  const makeHost = (engine, over = {}) => ({
    regen: (layer) => { if (layer) engine.generate(layer.id); },
    pushHistory: vi.fn(),
    requestDraw: vi.fn(),
    refreshPanel: vi.fn(),
    ...over,
  });

  const dispatchKey = (key, opts = {}) => {
    const ev = new win.KeyboardEvent('keydown', {
      key,
      bubbles: true,
      cancelable: true,
      ...opts,
    });
    doc.body.dispatchEvent(ev);
    return ev;
  };

  // Faithful stand-in of the global bubble shortcut handler. Returns spies.
  const installGlobalShortcuts = (engine, getSelectedId) => {
    const onDelete = vi.fn();
    const onUndo = vi.fn();
    const handler = (e) => {
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      const primary = e.metaKey || e.ctrlKey;
      const k = (e.key || '').toLowerCase();
      if (primary && !e.altKey && k === 'z') { onUndo(); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const id = getSelectedId();
        onDelete(id);
        if (id) engine.removeLayer(id);
      }
    };
    win.addEventListener('keydown', handler, false); // bubble, like shortcuts.js
    return { onDelete, onUndo, remove: () => win.removeEventListener('keydown', handler, false) };
  };

  // ── BLOCKER 1 ──────────────────────────────────────────────────────────────
  test('B1: Backspace at index 0 is swallowed — layer is NOT deleted', () => {
    const engine = new V.VectorEngine();
    const { id, layer } = makeTextLayer(engine, { text: 'Hi' });
    const ctrl = new V.TextEditController(makeHost(engine));
    const g = installGlobalShortcuts(engine, () => id);
    try {
      ctrl.begin(layer, 0); // caret at start → deleteBackward is a no-op
      const ev = dispatchKey('Backspace');
      expect(ctrl.deleteBackward === undefined).toBe(false);
      expect(g.onDelete).not.toHaveBeenCalled();
      expect(engine.layers.some((l) => l.id === id)).toBe(true);
      expect(layer.params.text).toBe('Hi');
      expect(ev.defaultPrevented).toBe(true);
    } finally {
      g.remove();
      ctrl.end();
    }
  });

  test('B1: web-font layer edits after ligature-off enablement; delete keys stay swallowed, layer survives', () => {
    const engine = new V.VectorEngine();
    const { id, layer } = makeTextLayer(engine, { text: 'AB', font: 'google:inter' });
    const ctrl = new V.TextEditController(makeHost(engine));
    const g = installGlobalShortcuts(engine, () => id);
    try {
      // A ligated web font is gated OUTSIDE an edit session (sourceIndex unsafe).
      expect(ctrl.canMutate(layer)).toBe(false);
      ctrl.begin(layer, 1);
      // Entering the session switches it to ligature-off (1:1) → editable.
      expect(layer.params.otLigatures).toBe(false);
      expect(ctrl.canMutate(layer)).toBe(true);
      dispatchKey('Backspace'); // caret at 1 → deletes 'A'
      // Delete keys are still SWALLOWED (never reach the global delete-layer) and
      // the layer survives — they edit text now instead of no-op'ing.
      expect(g.onDelete).not.toHaveBeenCalled();
      expect(engine.layers.some((l) => l.id === id)).toBe(true);
      expect(layer.params.text).toBe('B');
      // Caret navigation still works through the real listener.
      dispatchKey('ArrowRight');
      expect(ctrl.getCaretIndex()).toBe(1);
    } finally {
      g.remove();
      ctrl.end();
    }
  });

  test('B1: a printable tool-shortcut key (e.g. "v") types instead of switching tools', () => {
    const engine = new V.VectorEngine();
    const { layer } = makeTextLayer(engine, { text: '' });
    const toolSwitch = vi.fn();
    const ctrl = new V.TextEditController(makeHost(engine));
    win.addEventListener('keydown', (e) => { if (e.key === 'v' && !e.defaultPrevented) toolSwitch(); }, false);
    try {
      ctrl.begin(layer, 0);
      const ev = dispatchKey('v');
      expect(layer.params.text).toBe('v');
      expect(ev.defaultPrevented).toBe(true);
    } finally {
      ctrl.end();
    }
  });

  // ── BLOCKER 2 ──────────────────────────────────────────────────────────────
  test('B2: Ctrl/Cmd+Z mid-session ends the session and lets undo propagate (no orphan, no leaked timer)', () => {
    const engine = new V.VectorEngine();
    const { id, layer } = makeTextLayer(engine, { text: 'Hi' });
    const ctrl = new V.TextEditController(makeHost(engine));
    const g = installGlobalShortcuts(engine, () => id);
    try {
      ctrl.begin(layer, 2);
      expect(ctrl.isActive()).toBe(true);
      dispatchKey('z', { metaKey: true });
      // Session ended → no orphan layer reference, blink timer cleared.
      expect(ctrl.isActive()).toBe(false);
      expect(ctrl.getActiveLayer()).toBe(null);
      expect(ctrl._blinkTimer).toBe(null);
      expect(layer._edit).toBe(null);
      // Undo still fired (event propagated to the global handler).
      expect(g.onUndo).toHaveBeenCalledTimes(1);
    } finally {
      g.remove();
      ctrl.end();
    }
  });

  test('B2: after importState rebuilds layers, an active session never holds a stale layer', () => {
    const engine = new V.VectorEngine();
    const { id, layer } = makeTextLayer(engine, { text: 'Hi' });
    const ctrl = new V.TextEditController(makeHost(engine));
    // Mirror the app wiring: document replacement ends the session.
    engine.onLayerRemoved = (rid) => ctrl.notifyLayerRemoved(rid);
    try {
      const snapshot = engine.exportState();
      ctrl.begin(layer, 1);
      expect(ctrl.isActive()).toBe(true);
      // Simulate undo/open: end the session via the document-replaced choke point,
      // then rebuild layers (new Layer objects).
      ctrl.notifyDocumentReplaced();
      engine.importState(snapshot);
      const fresh = engine.layers.find((l) => l.id === id);
      expect(fresh).toBeTruthy();
      expect(fresh).not.toBe(layer); // brand-new object
      expect(ctrl.isActive()).toBe(false);
      expect(ctrl.getActiveLayer()).toBe(null);
      expect(ctrl._blinkTimer).toBe(null);
    } finally {
      ctrl.end();
    }
  });

  // ── BLOCKER 3 ──────────────────────────────────────────────────────────────
  test('B3: engine.removeLayer(editedId) ends the session and clears interval + listener', () => {
    const engine = new V.VectorEngine();
    const { id, layer } = makeTextLayer(engine, { text: 'Hi' });
    const ctrl = new V.TextEditController(makeHost(engine));
    engine.onLayerRemoved = (rid) => ctrl.notifyLayerRemoved(rid);
    ctrl.begin(layer, 1);
    expect(ctrl.isActive()).toBe(true);
    expect(ctrl._blinkTimer).not.toBe(null);
    expect(ctrl._keyHandler).not.toBe(null);
    engine.removeLayer(id);
    expect(ctrl.isActive()).toBe(false);
    expect(ctrl.getActiveLayer()).toBe(null);
    expect(ctrl._blinkTimer).toBe(null);
    expect(ctrl._keyHandler).toBe(null);
  });

  test('B3: end() is idempotent and always clears timer + listener', () => {
    const engine = new V.VectorEngine();
    const { layer } = makeTextLayer(engine, { text: 'Hi' });
    const host = makeHost(engine);
    const ctrl = new V.TextEditController(host);
    ctrl.begin(layer, 0);
    ctrl.end();
    host.refreshPanel.mockClear();
    ctrl.end(); // second end must be a no-op (no panel rebuild) and not throw
    expect(host.refreshPanel).not.toHaveBeenCalled();
    expect(ctrl._blinkTimer).toBe(null);
    expect(ctrl._keyHandler).toBe(null);
    expect(ctrl.isActive()).toBe(false);
  });

  // ── Cascade teardown (group delete ends the session) ─────────────────────
  test('B3: deleting a GROUP containing the edited text layer ends the session (cascade)', () => {
    const engine = new V.VectorEngine();
    const { id, layer } = makeTextLayer(engine, { text: 'Hi' });
    // Nest the text layer under a group so removal cascades to it.
    const groupId = engine.addGroupLayer();
    layer.parentId = groupId;
    const ctrl = new V.TextEditController(makeHost(engine));
    engine.onLayerRemoved = (rid) => ctrl.notifyLayerRemoved(rid);
    ctrl.begin(layer, 1);
    expect(ctrl.isActive()).toBe(true);
    expect(ctrl._blinkTimer).not.toBe(null);
    expect(ctrl._keyHandler).not.toBe(null);
    // Remove the GROUP — the child text layer is announced via the cascade.
    engine.removeLayer(groupId);
    expect(engine.layers.some((l) => l.id === id)).toBe(false); // child cascaded out
    expect(ctrl.isActive()).toBe(false);
    expect(ctrl.getActiveLayer()).toBe(null);
    expect(ctrl._blinkTimer).toBe(null);
    expect(ctrl._keyHandler).toBe(null);
    expect(layer._edit).toBe(null);
  });

  // ── Double-begin guard ───────────────────────────────────────────────────
  test('double begin() ends the prior session — only one active session, no leaked listener', () => {
    const engine = new V.VectorEngine();
    const a = makeTextLayer(engine, { text: 'A' });
    const b = makeTextLayer(engine, { text: 'B' });
    let added = 0; let removed = 0;
    const origAdd = win.addEventListener.bind(win);
    const origRemove = win.removeEventListener.bind(win);
    win.addEventListener = (type, fn, cap) => { if (type === 'keydown' && cap === true) added += 1; return origAdd(type, fn, cap); };
    win.removeEventListener = (type, fn, cap) => { if (type === 'keydown' && cap === true) removed += 1; return origRemove(type, fn, cap); };
    const ctrl = new V.TextEditController(makeHost(engine));
    try {
      ctrl.begin(a.layer, 0);
      ctrl.begin(b.layer, 0);
      expect(ctrl.getActiveLayer().id).toBe(b.id);
      expect(a.layer._edit).toBe(null); // prior session torn down
      expect(added - removed).toBe(1);   // exactly one live capture listener
    } finally {
      win.addEventListener = origAdd;
      win.removeEventListener = origRemove;
      ctrl.end();
    }
  });

  // ── Multi-line sourceIndex editing (was correct but untested) ────────────
  test('multi-line: insert at start of line 2 of "a\\nb" lands at raw index 2 → "a\\nXb"', () => {
    const engine = new V.VectorEngine();
    const { layer } = makeTextLayer(engine, { text: 'a\nb' });
    const ctrl = new V.TextEditController(makeHost(engine));
    ctrl.begin(layer, 2); // start of line 2 (before 'b')
    expect(ctrl.insertText('X')).toBe(true);
    expect(layer.params.text).toBe('a\nXb');
    expect(ctrl.getCaretIndex()).toBe(3);
    ctrl.end();
  });

  test('multi-line: Backspace at start of line 2 removes the newline → "ab"', () => {
    const engine = new V.VectorEngine();
    const { layer } = makeTextLayer(engine, { text: 'a\nb' });
    const ctrl = new V.TextEditController(makeHost(engine));
    ctrl.begin(layer, 2); // before 'b'; char before caret is '\n' at index 1
    expect(ctrl.deleteBackward()).toBe(true);
    expect(layer.params.text).toBe('ab');
    expect(ctrl.getCaretIndex()).toBe(1);
    ctrl.end();
  });

  // ── Empty new box: first keystroke lands ─────────────────────────────────
  test('beginNewAt empty box: the first keystroke inserts correctly', () => {
    const engine = new V.VectorEngine();
    const created = makeTextLayer(engine, { text: '' });
    const host = makeHost(engine, {
      createTextLayerAt: () => created.layer,
    });
    const ctrl = new V.TextEditController(host);
    const layer = ctrl.beginNewAt(100, 100);
    expect(layer).toBe(created.layer);
    expect(ctrl.isActive()).toBe(true);
    expect(ctrl.insertText('H')).toBe(true);
    expect(layer.params.text).toBe('H');
    expect(ctrl.getCaretIndex()).toBe(1);
    ctrl.end();
  });

  test('caret changes broadcast vectura:textcaret (drives the gated per-pair kern UI)', () => {
    const engine = new V.VectorEngine();
    const { layer } = makeTextLayer(engine, { text: 'AVA' });
    const ctrl = new V.TextEditController(makeHost(engine));
    const seen = [];
    const onCaret = (e) => seen.push(e.detail);
    doc.addEventListener('vectura:textcaret', onCaret);
    try {
      ctrl.begin(layer, 1);
      const afterBegin = seen[seen.length - 1];
      expect(afterBegin.active).toBe(true);
      expect(afterBegin.layerId).toBe(layer.id);
      expect(afterBegin.caretIndex).toBe(1);
      // Arrow-move the caret → a fresh broadcast with the new index.
      seen.length = 0;
      dispatchKey('ArrowRight');
      expect(seen.length).toBeGreaterThanOrEqual(1);
      expect(seen[seen.length - 1].caretIndex).toBe(2);
      // Ending the session broadcasts active:false so the kern control re-locks.
      seen.length = 0;
      ctrl.end();
      expect(seen.some((d) => d.active === false)).toBe(true);
    } finally {
      doc.removeEventListener('vectura:textcaret', onCaret);
      ctrl.end();
    }
  });
});
