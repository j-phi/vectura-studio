/**
 * Text edit controller — Illustrator-style on-canvas Type-tool editing (M2/M3).
 *
 * Owns the transient edit SESSION for a single text layer. It reads caret
 * position ONLY from the layer's world-space `layer.glyphs` (via
 * Vectura.TextMetrics); it never recomputes pen/layout geometry itself. The
 * session lives on `layer._edit` (transient, never serialized):
 *
 *   layer._edit = { active, caretIndex, anchorIndex, focusIndex }
 *
 * anchorIndex/focusIndex are reserved for M4 range selection — they track
 * caretIndex for now.
 *
 * GATES (binding entry conditions):
 *   - Regen-before-edit: on entry, if `layer.glyphs` is empty (post import/undo)
 *     the host is asked to regenerate so we never index into empty glyphs.
 *   - Jitter gate: jitter > 0 perturbs ink but not cell math, so the caret would
 *     mislocate — editing is NOT entered for jittered layers.
 *   - Ligature / soft-wrap mutation gate: caret movement/display is always
 *     allowed, but insert/delete are BLOCKED when the layer uses a google
 *     (shaped) face that may ligate OR is soft-wrapped (`hyphenate && wrapWidth`)
 *     because `sourceIndex` carries the wrong offset there.
 *
 * The controller is host-driven so it can be unit-tested without the renderer or
 * app. The host adapter provides:
 *   regen(layer)            re-run engine.generate(layer.id) → fresh layer.glyphs
 *   pushHistory()           record one undo step
 *   requestDraw()           schedule a canvas redraw (optional; enables blink)
 *   createTextLayerAt(x,y)  create + return a new 'text' layer (optional)
 *   refreshPanel()          rebuild the side panel to mirror text (optional)
 * plus an options bag: { bindKeys } (default true — attach a window keydown
 * capture listener while a session is active).
 */
(() => {
  const Vectura = (window.Vectura = window.Vectura || {});

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const BLINK_MS = 530;
  // Screen-space drag distance (px) below which a Type-tool press-drag is treated
  // as a plain caret click rather than a range selection.
  const DRAG_THRESHOLD_PX = 3;
  const isBlank = (t) => !t || /^\s*$/.test(String(t));

  class TextEditController {
    constructor(host = {}, options = {}) {
      this.host = host || {};
      this.bindKeys = (host && host.bindKeys !== undefined ? host.bindKeys : options.bindKeys) !== false;
      this.active = false;
      this.layer = null;
      this.caretIndex = 0;
      // Selection is anchor + focus (caretIndex IS the focus). The selected range
      // is [min(anchor, focus), max(anchor, focus)]; collapsed when anchor===focus.
      this.anchorIndex = 0;
      this._runDirty = false;      // true once history pushed for the current typing run
      this._caretVisible = true;
      this._blinkTimer = null;
      this._keyHandler = null;
      // Empty-object cleanup bookkeeping (M6): the layer CREATED via beginNewAt
      // this session, and whether any mutation pushed history since creation.
      this._createdLayer = null;
      this._pushedHistoryThisSession = false;
    }

    // ── Session lifecycle ──────────────────────────────────────────────────
    isActive() { return this.active === true; }
    getCaretIndex() { return this.caretIndex; }
    getCaretVisible() { return this._caretVisible; }
    getActiveLayer() { return this.active ? this.layer : null; }

    /** Begin an edit session on a text layer at the given caret index. */
    begin(layer, caretIndex = 0) {
      if (!layer || layer.type !== 'text') return false;
      if (this._jitterBlocked(layer)) return false;
      if (this.active) this.end();
      this._ensureGlyphs(layer);
      const t = this._text(layer);
      const ci = clamp(caretIndex | 0, 0, t.length);
      this.layer = layer;
      this.active = true;
      this._runDirty = false;
      this._createdLayer = null;
      this._pushedHistoryThisSession = false;
      this.caretIndex = ci;
      this.anchorIndex = ci;
      layer._edit = { active: true, caretIndex: ci, anchorIndex: ci, focusIndex: ci };
      this._startBlink();
      this._attachKeys();
      this._requestDraw();
      return true;
    }

    /** Place the caret from a world-space click on an existing text layer. */
    placeCaretAtWorld(layer, wx, wy) {
      if (!layer || layer.type !== 'text') return false;
      if (this._jitterBlocked(layer)) return false;
      this._ensureGlyphs(layer);
      const TM = Vectura.TextMetrics;
      const r = TM && TM.pointToCaretIndex(layer.glyphs || [], wx, wy);
      const ci = r && Number.isFinite(r.caretIndex) ? r.caretIndex : 0;
      return this.begin(layer, ci);
    }

    /** Create a new point-type text layer at a world point and begin editing it. */
    beginNewAt(wx, wy) {
      if (typeof this.host.createTextLayerAt !== 'function') return null;
      const layer = this.host.createTextLayerAt(wx, wy);
      if (!layer || layer.type !== 'text') return null;
      if (!this.begin(layer, 0)) return null;
      // Tag as created-this-session so an empty session end discards it (M6).
      this._createdLayer = layer;
      return layer;
    }

    /**
     * Create a new AREA-type text layer for a Type-tool click-drag rectangle and
     * begin editing it. Mirrors beginNewAt (point type) but routes through the
     * host's createAreaTextLayerAt hook with the drag rect corners; the resulting
     * layer word-wraps typed text inside the frame.
     */
    beginNewAtArea(x0, y0, x1, y1) {
      if (typeof this.host.createAreaTextLayerAt !== 'function') return null;
      const layer = this.host.createAreaTextLayerAt(x0, y0, x1, y1);
      if (!layer || layer.type !== 'text') return null;
      if (!this.begin(layer, 0)) return null;
      // Tag as created-this-session so an empty session end discards it (M6).
      this._createdLayer = layer;
      return layer;
    }

    /**
     * End the session: clear `_edit`, stop blink, detach keys. The panel
     * specimen is SUPPRESSED during a session (to avoid two editors fighting
     * over `params.text`); `refreshPanel` is called here so it re-syncs to the
     * final text exactly once when editing finishes.
     */
    end() {
      // Always tear down the timer + window listener, regardless of how the
      // session terminates (Escape, tool-switch, layer removal, undo). end() is
      // idempotent: a second call clears nothing new and re-fires no host hooks.
      const wasActive = this.active;
      this._stopBlink();
      this._detachKeys();
      const layer = this.layer;
      const created = this._createdLayer;
      const pushed = this._pushedHistoryThisSession;
      if (layer && layer._edit) layer._edit = null;
      this.active = false;
      this.layer = null;
      this.caretIndex = 0;
      this.anchorIndex = 0;
      this._runDirty = false;
      this._createdLayer = null;
      this._pushedHistoryThisSession = false;
      if (!wasActive) return;
      // Empty-object cleanup (M6): a layer created THIS session that never got
      // real (non-whitespace) text is discarded so a stray Type click doesn't
      // litter the document. discardCreatedLayer also unwinds the creation
      // history push (when no mutation pushed after it) so undo stays consistent.
      // engine.removeLayer re-enters via notifyLayerRemoved, but active is already
      // false by now → that path is a no-op (no reentrancy).
      if (created && layer && created === layer && isBlank(this._text(layer))) {
        if (typeof this.host.discardCreatedLayer === 'function') {
          this.host.discardCreatedLayer(layer, { unwindHistory: !pushed });
          return; // the host owns the resulting panel/redraw refresh
        }
      }
      if (typeof this.host.refreshPanel === 'function') this.host.refreshPanel(layer);
      if (typeof this.host.requestDraw === 'function') this.host.requestDraw();
    }

    // Commit (Cmd/Ctrl+Enter) / cancel (Esc): end the session and return the
    // active tool to Selection (Illustrator-style). Both share behavior here —
    // there is no revert semantics; the text is already written through.
    _endAndReturnToSelect() {
      this.end();
      if (typeof this.host.setTool === 'function') this.host.setTool('select');
    }

    // ── Lifecycle notifications (host choke points) ────────────────────────
    /**
     * Called when a layer is removed from the engine (context menu, layers
     * panel, keyboard delete, or a cascade). If the removed id is the layer
     * being edited, the session ends so we never keep editing a dead object or
     * leak its blink timer / window listener. Idempotent + safe when inactive.
     */
    notifyLayerRemoved(id) {
      if (this.active && this.layer && this.layer.id === id) this.end();
    }

    /**
     * Called before the whole document is replaced (undo/redo's importState,
     * open `.vectura`, new document). importState builds BRAND-NEW Layer objects,
     * so any cached `this.layer` becomes an orphan — end the session first.
     */
    notifyDocumentReplaced() {
      if (this.active) this.end();
    }

    // ── Caret display ──────────────────────────────────────────────────────
    /** World-space caret segment {x0,y0,x1,y1} for the renderer overlay pass. */
    getCaretSegment() {
      if (!this.active || !this.layer) return null;
      const TM = Vectura.TextMetrics;
      if (!TM) return null;
      const seg = TM.caretIndexToWorldSegment(this.layer.glyphs || [], this.caretIndex);
      if (seg) return seg;
      // Empty box (no glyphs yet): synthesize a caret at the layer's world
      // origin so a brand-new box shows a blinking insertion bar where the first
      // glyph will land. The first keystroke then produces real glyphs and the
      // caret jumps to the true left/right edge above.
      return this._emptyBoxCaretSegment();
    }

    /**
     * Fallback caret for an empty (glyph-less) box: a vertical bar ~cap-height
     * tall anchored at the layer's world origin — which, for a freshly created
     * point-type box, is exactly the click point. Rotated/scaled about the origin
     * to stay correct under the layer's transform (the same pivot the engine uses
     * for glyph quads, so the bar tracks a rotated layer).
     */
    _emptyBoxCaretSegment() {
      const layer = this.layer;
      const p = (layer && layer.params) || {};
      // Area box: anchor the first-line caret at the frame's world top-left corner
      // (the engine-transformed sidecar), descending one cap-height to the
      // baseline. This is where the first glyph will land in a wrapped frame.
      if (p.textMode === 'area' && Array.isArray(layer.textFrame) && layer.textFrame.length === 4) {
        const tl = layer.textFrame[0];
        const size = Math.max(1, Number(p.fontSize) || 40);
        return { x0: tl.x, y0: tl.y, x1: tl.x, y1: tl.y + size };
      }
      const origin = (layer && layer.origin) || { x: 0, y: 0 };
      const posX = Number(p.posX) || 0;
      const posY = Number(p.posY) || 0;
      const size = Math.max(1, Number(p.fontSize) || 40);
      const scaleY = Number.isFinite(p.scaleY) ? p.scaleY : 1;
      const rot = ((Number(p.rotation) || 0) * Math.PI) / 180;
      const cos = Math.cos(rot);
      const sin = Math.sin(rot);
      // World anchor = the point-type origin (origin + translation).
      const cxw = origin.x + posX;
      const cyw = origin.y + posY;
      // Half cap-height, offset ±half vertically then rotated about the anchor.
      const half = (size * scaleY) / 2;
      return {
        x0: cxw + half * sin, y0: cyw - half * cos, // cap-top
        x1: cxw - half * sin, y1: cyw + half * cos, // baseline
      };
    }

    // ── Selection model (M4) ───────────────────────────────────────────────
    // anchorIndex/focusIndex are SOURCE (caret insertion) indices; caretIndex IS
    // the focus. The selected range is [min, max]; collapsed when they coincide.
    hasSelection() { return this.active && this.anchorIndex !== this.caretIndex; }

    /** Selected range {start, end} (source indices), or null when inactive. */
    getSelection() {
      if (!this.active) return null;
      const a = this.anchorIndex; const f = this.caretIndex;
      return { start: Math.min(a, f), end: Math.max(a, f) };
    }

    /** World-space quads for every cell inside the current selection (renderer). */
    getSelectionQuads() {
      if (!this.hasSelection() || !this.layer) return [];
      const { start, end } = this.getSelection();
      const out = [];
      for (const g of this.layer.glyphs || []) {
        if (g.sourceIndex >= start && g.sourceIndex < end) out.push(g.quad);
      }
      return out;
    }

    /** Set an explicit anchor→focus selection (caret lands at focus). */
    selectRange(anchor, focus) {
      if (!this.active) return false;
      const len = this._text(this.layer).length;
      this.anchorIndex = clamp(anchor | 0, 0, len);
      this.caretIndex = clamp(focus | 0, 0, len);
      this._runDirty = false;
      this._syncEditState();
      this._requestDraw();
      return true;
    }

    /** Extend the focus (shift-click / shift-arrow) keeping the anchor fixed. */
    extendSelectionTo(focus) {
      if (!this.active) return false;
      this._setCaret(clamp(focus | 0, 0, this._text(this.layer).length), true);
      return true;
    }

    /** Word range containing a source index → select it (double-click). */
    selectWordAt(sourceIndex) {
      if (!this.active) return false;
      const TM = Vectura.TextMetrics;
      const r = TM && TM.wordRangeAt(this._text(this.layer), sourceIndex);
      if (!r) return false;
      return this.selectRange(r.start, r.end);
    }

    /** Paragraph range containing a source index → select it (triple-click). */
    selectParagraphAt(sourceIndex) {
      if (!this.active) return false;
      const TM = Vectura.TextMetrics;
      const r = TM && TM.paragraphRangeAt(this._text(this.layer), sourceIndex);
      if (!r) return false;
      return this.selectRange(r.start, r.end);
    }

    // World-space variants used by the renderer's multi-click / drag gestures.
    // The hit CELL index (sourceIndex) drives word/paragraph; the insertion index
    // (caretIndex) drives drag/shift-extend.
    selectWordAtWorld(wx, wy) {
      const si = this._sourceIndexAtWorld(wx, wy);
      return si == null ? false : this.selectWordAt(si);
    }

    selectParagraphAtWorld(wx, wy) {
      const si = this._sourceIndexAtWorld(wx, wy);
      return si == null ? false : this.selectParagraphAt(si);
    }

    extendSelectionToWorld(wx, wy) {
      const ci = this._caretIndexAtWorld(wx, wy);
      return ci == null ? false : this.extendSelectionTo(ci);
    }

    /** Live drag update: move the focus to the caret slot under the cursor. */
    updateSelectionDragToWorld(wx, wy) {
      const ci = this._caretIndexAtWorld(wx, wy);
      return ci == null ? false : this.extendSelectionTo(ci);
    }

    /** Screen-space press→cursor distance exceeds the drag-select threshold. */
    exceedsDragThreshold(ax, ay, bx, by) {
      return Math.hypot(bx - ax, by - ay) > DRAG_THRESHOLD_PX;
    }

    _sourceIndexAtWorld(wx, wy) {
      if (!this.active || !this.layer) return null;
      const TM = Vectura.TextMetrics;
      const r = TM && TM.pointToCaretIndex(this.layer.glyphs || [], wx, wy);
      if (!r) return null;
      return r.sourceIndex != null ? r.sourceIndex : r.caretIndex;
    }

    _caretIndexAtWorld(wx, wy) {
      if (!this.active || !this.layer) return null;
      const TM = Vectura.TextMetrics;
      const r = TM && TM.pointToCaretIndex(this.layer.glyphs || [], wx, wy);
      return r && Number.isFinite(r.caretIndex) ? r.caretIndex : null;
    }

    // ── Mutation gate ──────────────────────────────────────────────────────
    /**
     * Mutation (insert/delete) is allowed only for layers whose `sourceIndex`
     * faithfully maps to the raw string: built-in stroke faces with no soft-wrap.
     * Shaped (google) faces may ligate and soft-wrap reflows the offset, so both
     * disable mutation while still permitting caret movement/display.
     */
    canMutate(layer) {
      const p = (layer && layer.params) || {};
      const GF = Vectura.GoogleFonts;
      const isWeb = !!(GF && GF.isWebFontKey && GF.isWebFontKey(p.font));
      // Web (shaped) faces may ligate → sourceIndex degrades. Blocked in every
      // mode (area type on web fonts is out of scope / deferred).
      if (isWeb) return false;
      // AREA type on a built-in stroke face uses exact-sourceIndex word-wrap (no
      // synthetic hyphen), so wrapped editing is safe — allow it.
      if (p.textMode === 'area') return true;
      // Point type: only the legacy hyphenate soft-wrap reflows the offset.
      const softWrap = p.hyphenate === true && Number(p.wrapWidth) > 0;
      return !softWrap;
    }

    // ── Editing — mutations ────────────────────────────────────────────────
    insertText(str) {
      if (!this.active || !str) return false;
      const layer = this.layer;
      if (!this.canMutate(layer)) return false;
      this._pushHistoryOncePerRun();
      const t = this._text(layer);
      let i;
      if (this.hasSelection()) {
        // Replace the selection: delete the range, then insert at its start.
        const { start, end } = this.getSelection();
        const cut = t.slice(0, start) + t.slice(end);
        i = start;
        layer.params.text = cut.slice(0, i) + str + cut.slice(i);
      } else {
        i = clamp(this.caretIndex, 0, t.length);
        layer.params.text = t.slice(0, i) + str + t.slice(i);
      }
      this.caretIndex = i + str.length;
      this._afterMutation();
      return true;
    }

    insertNewline() { return this.insertText('\n'); }

    deleteBackward() {
      if (!this.active) return false;
      const layer = this.layer;
      if (!this.canMutate(layer)) return false;
      if (this.hasSelection()) return this._deleteSelection();
      const t = this._text(layer);
      const i = clamp(this.caretIndex, 0, t.length);
      if (i <= 0) return false;
      this._pushHistoryOncePerRun();
      layer.params.text = t.slice(0, i - 1) + t.slice(i);
      this.caretIndex = i - 1;
      this._afterMutation();
      return true;
    }

    deleteForward() {
      if (!this.active) return false;
      const layer = this.layer;
      if (!this.canMutate(layer)) return false;
      if (this.hasSelection()) return this._deleteSelection();
      const t = this._text(layer);
      const i = clamp(this.caretIndex, 0, t.length);
      if (i >= t.length) return false;
      this._pushHistoryOncePerRun();
      layer.params.text = t.slice(0, i) + t.slice(i + 1);
      this.caretIndex = i;
      this._afterMutation();
      return true;
    }

    // Delete the current non-empty selection, collapsing the caret to its start.
    _deleteSelection() {
      const layer = this.layer;
      if (!this.canMutate(layer)) return false;
      const { start, end } = this.getSelection();
      if (start === end) return false;
      this._pushHistoryOncePerRun();
      const t = this._text(layer);
      layer.params.text = t.slice(0, start) + t.slice(end);
      this.caretIndex = start;
      this._afterMutation();
      return true;
    }

    // ── Editing — navigation (never records history) ───────────────────────
    // Navigation. `extend` (shift held) keeps the anchor and moves only the
    // focus; a plain move collapses an existing selection to the relevant edge.
    moveLeft(extend = false) {
      if (!this.active) return false;
      if (!extend && this.hasSelection()) { this._setCaret(this.getSelection().start, false); return true; }
      this._setCaret(clamp(this.caretIndex - 1, 0, this._text(this.layer).length), extend);
      return true;
    }

    moveRight(extend = false) {
      if (!this.active) return false;
      if (!extend && this.hasSelection()) { this._setCaret(this.getSelection().end, false); return true; }
      this._setCaret(clamp(this.caretIndex + 1, 0, this._text(this.layer).length), extend);
      return true;
    }

    moveLineStart(extend = false) {
      if (!this.active) return false;
      const TM = Vectura.TextMetrics;
      const range = TM && TM.paragraphRangeAt(this._text(this.layer), this.caretIndex);
      this._setCaret(range ? range.start : 0, extend);
      return true;
    }

    moveLineEnd(extend = false) {
      if (!this.active) return false;
      const TM = Vectura.TextMetrics;
      const t = this._text(this.layer);
      const range = TM && TM.paragraphRangeAt(t, this.caretIndex);
      this._setCaret(range ? range.end : t.length, extend);
      return true;
    }

    moveUp(extend = false) { return this._moveVertical(-1, extend); }
    moveDown(extend = false) { return this._moveVertical(1, extend); }

    // ── Keyboard dispatch ──────────────────────────────────────────────────
    /** Map a KeyboardEvent-like to an edit op. Returns true when handled. */
    handleKey(e) {
      if (!this.active || !e) return false;
      const k = e.key;
      const shift = !!e.shiftKey;
      switch (k) {
        case 'ArrowLeft': return this.moveLeft(shift);
        case 'ArrowRight': return this.moveRight(shift);
        case 'ArrowUp': return this.moveUp(shift);
        case 'ArrowDown': return this.moveDown(shift);
        case 'Home': return this.moveLineStart(shift);
        case 'End': return this.moveLineEnd(shift);
        case 'Backspace': return this.deleteBackward();
        case 'Delete': return this.deleteForward();
        // Cmd/Ctrl+Enter commits (returns to Select); plain Enter inserts a newline.
        case 'Enter':
          if (e.metaKey || e.ctrlKey) { this._endAndReturnToSelect(); return true; }
          return this.insertNewline();
        case 'Escape': this._endAndReturnToSelect(); return true;
        default: break;
      }
      // Printable single character (ignore modified chords like Ctrl/Cmd+X).
      if (typeof k === 'string' && k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        return this.insertText(k);
      }
      return false;
    }

    // ── Internals ──────────────────────────────────────────────────────────
    _text(layer) { return layer && layer.params && layer.params.text != null ? String(layer.params.text) : ''; }

    _jitterBlocked(layer) { return Number((layer.params && layer.params.jitter) || 0) > 0; }

    _ensureGlyphs(layer) {
      if (!Array.isArray(layer.glyphs) || layer.glyphs.length === 0) this._regen(layer);
    }

    _regen(layer) {
      if (typeof this.host.regen === 'function') this.host.regen(layer || this.layer);
    }

    _requestDraw() {
      if (typeof this.host.requestDraw === 'function') this.host.requestDraw();
    }

    _pushHistoryOncePerRun() {
      if (this._runDirty) return;
      if (typeof this.host.pushHistory === 'function') this.host.pushHistory();
      this._runDirty = true;
      this._pushedHistoryThisSession = true;
    }

    // After a text mutation: regen (fresh glyphs), mirror into `_edit`, redraw,
    // and refresh the side panel (write-through keeps the specimen in sync).
    _afterMutation() {
      this._regen(this.layer);
      this.caretIndex = clamp(this.caretIndex, 0, this._text(this.layer).length);
      // Every mutation collapses the selection to a caret at the edit point.
      this.anchorIndex = this.caretIndex;
      this._syncEditState();
      if (typeof this.host.refreshPanel === 'function') this.host.refreshPanel(this.layer);
      this._requestDraw();
    }

    // Caret move: update the focus, break the typing-run coalescing, redraw.
    // `keepAnchor` (shift-extend) preserves the selection anchor; otherwise the
    // selection collapses to the new caret.
    _setCaret(idx, keepAnchor = false) {
      this.caretIndex = idx;
      if (!keepAnchor) this.anchorIndex = idx;
      this._runDirty = false;
      this._syncEditState();
      this._requestDraw();
    }

    _syncEditState() {
      const ed = this.layer && this.layer._edit;
      if (ed) { ed.caretIndex = this.caretIndex; ed.anchorIndex = this.anchorIndex; ed.focusIndex = this.caretIndex; }
    }

    // Line index at a caret position (glyph to the right, else to the left).
    _caretLineIndex(glyphs, idx) {
      const at = glyphs.find((g) => g.sourceIndex === idx);
      if (at) return at.lineIndex;
      const before = glyphs.find((g) => g.sourceIndex === idx - 1);
      return before ? before.lineIndex : 0;
    }

    // World x of the caret at a position (left edge of the cell, else right edge).
    _caretWorldX(glyphs, idx) {
      const TM = Vectura.TextMetrics;
      const seg = TM && TM.caretIndexToWorldSegment(glyphs, idx);
      return seg ? seg.x0 : 0;
    }

    // Up/Down: move to the nearest caret slot on the adjacent line (by x). Caret
    // slots on a line are each cell's left edge (sourceIndex) and right edge
    // (sourceIndex + 1). Returns false when there is no adjacent line.
    _moveVertical(dir, extend = false) {
      if (!this.active) return false;
      const glyphs = (this.layer && this.layer.glyphs) || [];
      if (!glyphs.length) return false;
      const curLine = this._caretLineIndex(glyphs, this.caretIndex);
      const curX = this._caretWorldX(glyphs, this.caretIndex);
      const targetLine = curLine + dir;
      let best = null; let bestDist = Infinity;
      for (const g of glyphs) {
        if (g.lineIndex !== targetLine) continue;
        const left = g.quad[0].x;
        const right = g.quad[1].x;
        const slots = [{ idx: g.sourceIndex, x: left }, { idx: g.sourceIndex + 1, x: right }];
        for (const s of slots) {
          const d = Math.abs(s.x - curX);
          if (d < bestDist) { bestDist = d; best = s.idx; }
        }
      }
      if (best === null) return false;
      this._setCaret(best, extend);
      return true;
    }

    // ── Blink ──────────────────────────────────────────────────────────────
    _startBlink() {
      this._caretVisible = true;
      this._stopBlink();
      // Only blink when a redraw sink exists (production) so headless tests that
      // omit requestDraw never leak a timer.
      if (typeof this.host.requestDraw !== 'function' || typeof setInterval !== 'function') return;
      this._blinkTimer = setInterval(() => {
        this._caretVisible = !this._caretVisible;
        this.host.requestDraw();
      }, BLINK_MS);
    }

    _stopBlink() {
      if (this._blinkTimer != null) { clearInterval(this._blinkTimer); this._blinkTimer = null; }
      this._caretVisible = true;
    }

    // Undo/redo chord (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl/Cmd+Y). importState
    // rebuilds every Layer, so the cached `this.layer` would orphan — instead we
    // COMMIT-AND-EXIT the field (Illustrator-style) and let the chord propagate
    // to the global undo handler, which then runs against a session-free engine.
    _isUndoRedoChord(e) {
      if (!e || !(e.ctrlKey || e.metaKey) || e.altKey) return false;
      const k = (typeof e.key === 'string' ? e.key : '').toLowerCase();
      return k === 'z' || k === 'y';
    }

    /**
     * Is this key OWNED by the active text session — i.e. it is text editing's
     * to consume, even when the underlying op is a no-op (Backspace at index 0,
     * Delete at end, or any mutation on a gated layer)? Owned keys must be
     * swallowed so they never reach global shortcuts (which would DELETE the
     * layer on Backspace/Delete or switch tools on a printable key). Modified
     * chords (Ctrl/Cmd) are NOT owned — they pass through to global shortcuts.
     */
    _ownsKey(e) {
      if (!e) return false;
      if (e.ctrlKey || e.metaKey) return false;
      switch (e.key) {
        case 'Backspace':
        case 'Delete':
        case 'Enter':
        case 'ArrowLeft':
        case 'ArrowRight':
        case 'ArrowUp':
        case 'ArrowDown':
        case 'Home':
        case 'End':
        case 'Escape':
          return true;
        default:
          break;
      }
      // A printable single character (Alt-less) — e.g. 'v'/'m'/'t'/' '/'?' which
      // are otherwise tool / help shortcuts — types instead while editing.
      return typeof e.key === 'string' && e.key.length === 1 && !e.altKey;
    }

    // ── Window keyboard capture ────────────────────────────────────────────
    // A capture-phase listener intercepts keystrokes BEFORE the global shortcut
    // handler (which is bubble-phase on window), so typing 'v' inserts a 'v'
    // rather than switching tools. Every key OWNED by the session is swallowed
    // (preventDefault + stopPropagation) even when its edit op is a no-op, so a
    // no-op Backspace can never fall through to the global delete-layer handler.
    _attachKeys() {
      if (!this.bindKeys || this._keyHandler || typeof window === 'undefined' || !window.addEventListener) return;
      this._keyHandler = (e) => {
        if (!this.active) return;
        // Undo/redo exits the field, then propagates to the global handler.
        if (this._isUndoRedoChord(e)) { this.end(); return; }
        const handled = this.handleKey(e);
        if (handled || this._ownsKey(e)) {
          if (typeof e.preventDefault === 'function') e.preventDefault();
          if (typeof e.stopPropagation === 'function') e.stopPropagation();
        }
      };
      window.addEventListener('keydown', this._keyHandler, true);
    }

    _detachKeys() {
      if (this._keyHandler && typeof window !== 'undefined' && window.removeEventListener) {
        window.removeEventListener('keydown', this._keyHandler, true);
      }
      this._keyHandler = null;
    }
  }

  Vectura.TextEditController = TextEditController;
})();
