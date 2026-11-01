/**
 * File I/O and SVG export methods for the UI class.
 * Mixed into UI.prototype by ui.js.
 */
(() => {
  const {
    SETTINGS = {},
    Layer,
  } = window.Vectura || {};

  const clone = window.Vectura.Utils.clone;

  // Phase 3 closure: toast helper. UI.overlays.Toast is a Phase 1 primitive
  // composed throughout the file-I/O surface for save/open/import/export
  // success and failure feedback.
  const toast = (message, variant = 'info', duration = 3500) => {
    const T = window.Vectura?.UI?.overlays?.Toast;
    if (T && typeof T.show === 'function') {
      try { T.show({ message, variant, duration }); } catch (_) { /* noop */ }
    }
  };

  // Phase 4: indeterminate progress helper. Returns a handle with .done().
  // Falls back to a no-op handle when the primitive is missing (legacy load
  // path / JSDOM tests without overlay scripts).
  const NOOP_HANDLE = { done() {}, update() {} };
  const startProgress = (label) => {
    const PB = window.Vectura?.UI?.overlays?.ProgressBar;
    if (PB && typeof PB.show === 'function') {
      try { return PB.show({ label }); } catch (_) { /* noop */ }
    }
    return NOOP_HANDLE;
  };

  const Vectura = (window.Vectura = window.Vectura || {});

  // === TUX-053: file picker ===
  // iOS Files greys out a .vectura unless the accept list maps to a type iOS knows,
  // so iOS adds application/octet-stream. Detection is platform-based and runs at
  // call time: iPadOS in desktop mode reports a Macintosh UA with touch points.
  const isIOSPicker = () => {
    const nav = window.navigator || {};
    return /iPhone|iPad|iPod/.test(nav.userAgent || '')
      || (nav.platform === 'MacIntel' && (nav.maxTouchPoints || 0) > 1);
  };
  const acceptFor = (kind) => {
    if (isIOSPicker()) return '.vectura,application/json,application/octet-stream';
    return kind === 'vectura-preset' ? '.vectura' : '.vectura,application/json';
  };
  // Compute accept at open time, then open the picker. Returns the input.
  const pickFile = ({ kind, input } = {}) => {
    const el = input || document.createElement('input');
    el.type = 'file';
    el.accept = acceptFor(kind);
    el.click();
    return el;
  };
  // Cheap content check on the first 256 bytes: a Vectura document is a JSON object.
  const sniffJsonHead = (file) => new Promise((resolve) => {
    try {
      const reader = new FileReader();
      reader.onload = () => {
        const head = String(reader.result || '').replace(/^\uFEFF/, '').trimStart();
        resolve(head.charAt(0) === '{');
      };
      reader.onerror = () => resolve(false);
      reader.readAsText(file.slice(0, 256));
    } catch (_) { resolve(false); }
  });
  Vectura.FilePicker = { isIOSPicker, acceptFor, pickFile, sniffJsonHead };
  // === /TUX-053 ===
  window.Vectura._UIFileIOMixin = {
    getAppVersion() {
      const runtimeVersion = window.Vectura?.APP_VERSION;
      if (runtimeVersion) return `${runtimeVersion}`;
      const meta = document.querySelector('.pane-meta');
      if (!meta) return '';
      return `${meta.textContent || ''}`.replace('V.', '').trim();
    },

    saveVecturaFile() {
      const progress = startProgress('Saving project…');
      try {
        const version = this.getAppVersion();
        const images = window.Vectura?.NOISE_IMAGES || {};
        const imagePayload = Object.entries(images).reduce((acc, [id, img]) => {
          if (!img || !img.data) return acc;
          acc[id] = {
            width: img.width,
            height: img.height,
            data: Array.from(img.data),
          };
          return acc;
        }, {});
        // TUX-037: lock ids are an undo-snapshot detail, not part of the .vectura format.
        const savedState = this.app.captureState();
        delete savedState.layerLockedIds;
        const payload = {
          type: 'vectura',
          version,
          created: new Date().toISOString(),
          state: savedState,
          images: imagePayload,
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const date = new Date().toISOString().slice(0, 10);
        // A named document (an opened colorway copy, "Riverbed (colorway)") saves under its name.
        let named = `${this.app.documentName || ''}`.replace(/\.vectura$/i, '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').replace(/^[\s.]+/, '').replace(/[\s.]+$/, '').slice(0, 80).trim();
        // Windows device names (CON, PRN, AUX, NUL, COM1-9, LPT1-9) are not usable as a file name, with or without an extension.
        if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(named)) named = `${named}-file`;
        const filename = named ? `${named}.vectura` : `vectura-${date}.vectura`;
        // TUX-054: no await before saveBlob — the share sheet needs the tap's user activation.
        window.Vectura.Download.saveBlob(blob, filename).then((result) => {
          if (result === 'cancelled') return;
          toast(`Saved ${filename}`, 'success');
          this.app.markDocumentClean?.();
          // Recents: a full copy of what was just saved (Save stays a download — no handle).
          this.app.recents?.record({ source: 'save', name: filename, payload, id: this.app.currentRecentId || undefined, forceNew: !this.app.currentRecentId });
        }).catch((err) => {
          console.error('saveVecturaFile failed', err);
          toast('Could not save the project — see console for details', 'danger');
        });
      } catch (err) {
        console.error('saveVecturaFile failed', err);
        toast('Could not save the project — see console for details', 'danger');
      } finally {
        progress.done();
      }
    },

    openVecturaFile(file, opts = {}) {
      if (!file) return;
      const rejectInvalid = () => {
        toast('Invalid .vectura file', 'danger');
        const errBody = document.createElement('p');
        errBody.className = 'modal-text';
        errBody.textContent = 'That file could not be loaded as a .vectura document.';
        this.openModal({ title: 'Invalid File', body: errBody });
      };
      // TUX-053: reject a non-JSON file from its first bytes before the full read.
      // Resolves true once the file loaded. A reopen from Recents (`fromRecent`) fails quietly: its caller falls
      // back to the stored copy.
      return sniffJsonHead(file).then((ok) => {
        if (!ok) { if (!opts.fromRecent) rejectInvalid(); return false; }
        return this._readVecturaFile(file, opts);
      });
    },

    // Open a file from anywhere: Chromium's file picker (keeps a handle for Recents) when it is usable,
    // otherwise a plain <input type=file>. Under automation the input path is always used, so the
    // existing specs (and their filechooser events) are unaffected.
    pickVecturaFile({ input = null, host = null, forceInput = false } = {}) {
      const canUseFsa = !forceInput && typeof window.showOpenFilePicker === 'function'
        && !(typeof navigator !== 'undefined' && navigator.webdriver === true) && window.isSecureContext !== false;
      if (canUseFsa) {
        window.showOpenFilePicker({
          multiple: false,
          types: [{ description: 'Vectura project', accept: { 'application/json': ['.vectura', '.json'] } }],
        }).then(async ([handle]) => {
          if (!handle) return;
          const file = await handle.getFile();
          this.openVecturaFile(file, { handle });
        }).catch((err) => {
          if (err && err.name === 'AbortError') return;
          console.warn('showOpenFilePicker failed; using the input fallback', err);
          this.pickVecturaFile({ input, host: host || document.body, forceInput: true });
        });
        return;
      }
      let el = input;
      if (!el) {
        // A transient input hosted inside the Start Page (the editor underneath is inert).
        document.getElementById('sp-transient-open')?.remove();
        el = document.createElement('input');
        el.id = 'sp-transient-open';
        el.type = 'file';
        el.hidden = true;
        el.onchange = () => {
          const file = el.files?.[0];
          if (file) this.openVecturaFile(file);
          el.remove();
        };
        (host || document.body).appendChild(el);
      }
      Vectura.FilePicker.pickFile({ kind: 'vectura', input: el });
    },

    _readVecturaFile(file, opts = {}) {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onerror = () => resolve(false);
        reader.onload = () => {
          let parsed = null;
          try { parsed = JSON.parse(reader.result); } catch (_) { parsed = null; }
          if (opts.fromRecent && !(parsed && (parsed.state || parsed).engine && (parsed.state || parsed).settings)) { resolve(false); return; }
          if (!this.loadVecturaPayload(parsed, { name: file.name })) { resolve(false); return; }
          // Recents: every successful Open records a full copy (and the handle, when there is one).
          this.app.recents?.record({ source: 'open', name: file.name || 'untitled.vectura', handle: opts.handle || null, payload: parsed });
          this.app.startPage?.hide?.({ restoreFocus: false });
          resolve(true);
        };
        reader.readAsText(file);
      });
    },

    // Apply a parsed .vectura object. Returns true when it loaded; on failure the editor is rolled back and
    // the user is told. `quiet` skips the "Project loaded" toast (callers that have their own message).
    // `name`: the file (or recent) the document came from; Save then keeps it ("Riverbed.vectura" -> "Riverbed").
    loadVecturaPayload(parsed, { quiet = false, name = null } = {}) {
      // Snapshot BEFORE any mutation. If parse/apply throws mid-flight we
      // roll the engine + SETTINGS back so the user is never stranded with
      // a half-loaded project. Bugs-9.
      const rollback = this.app.captureState();
      try {
        const state = parsed?.state || parsed;
        if (!state?.engine || !state?.settings) {
          throw new Error('Missing state payload');
        }
        // AUD-02: a file from a FUTURE format still loads best-effort
        // (importState migrates known versions; unknown-newer passes
        // through), but the user must know settings may not apply.
        const fileFormat = Number(state.engine.formatVersion) || 0;
        const knownFormat = window.Vectura?.VECTURA_FORMAT_VERSION ?? 1;
        if (fileFormat > knownFormat) {
          toast(
            'This file was saved by a newer version of Vectura Studio; some settings may not apply.',
            'warning',
            6000
          );
        }
        if (parsed?.images) {
          const store = (window.Vectura.NOISE_IMAGES = window.Vectura.NOISE_IMAGES || {});
          Object.entries(parsed.images).forEach(([id, img]) => {
            if (!img || !Array.isArray(img.data)) return;
            store[id] = {
              width: img.width,
              height: img.height,
              data: new Uint8ClampedArray(img.data),
            };
          });
        }
        this.app.applyState(state);
      } catch (err) {
        // Restore the pre-import state. applyState is idempotent so this
        // safely undoes any half-applied SETTINGS or engine.layers mutation.
        try { this.app.applyState(rollback); } catch (_) { /* best-effort */ }
        console.error('openVecturaFile failed', err);
        toast('Invalid .vectura file', 'danger');
        // Bugs-4: build the body as a Node so we never feed an HTML string
        // through the modal's sanitizer for this error path.
        const errBody = document.createElement('p');
        errBody.className = 'modal-text';
        errBody.textContent = 'That file could not be loaded as a .vectura document.';
        this.openModal({ title: 'Invalid File', body: errBody });
        return false;
      }
      // Only after the import installs cleanly: clear history and
      // baseline the fresh state. Doing this inside the try would discard
      // the user's undo stack even when the import ultimately fails.
      this.app.history = [];
      this.app.pushHistory();
      this.app.markDocumentClean?.();
      this.app.currentRecentId = null; // set again by recents.record() for the opened file
      // The opened file's name (minus .vectura) so Save downloads under it and its recent keeps its name; a colorway
      // copy sets its own name again after this returns.
      const opened = typeof name === 'string' ? name.replace(/\.vectura$/i, '').trim() : '';
      this.app.documentName = opened || null;
      if (!quiet) toast('Project loaded', 'success');
      return true;
    },

    importSvgFile(file) {
      if (!file || !Layer) return;
      const reader = new FileReader();
      reader.onload = () => {
        const text = reader.result;
        const groups = this.parseSvgToLayerGroups(text);
        if (!groups.length) {
          toast('SVG had no importable paths', 'warning');
          const errBody = document.createElement('p');
          errBody.className = 'modal-text';
          errBody.textContent = 'The SVG did not contain any vector paths to import.';
          this.openModal({ title: 'No Paths Found', body: errBody });
          return;
        }
        if (this.app.pushHistory) this.app.pushHistory();
        const created = [];
        groups.forEach((group) => {
          const id = window.Vectura.generateId();
          const name = this.getUniqueLayerName(group.name || 'Imported SVG', id);
          const layer = new Layer(id, 'shape', name);
          layer.params.seed = 0;
          layer.params.smoothing = 0;
          layer.params.simplify = 0;
          layer.params.curves = false;
          layer.sourcePaths = clone(group.paths);
          if (group.stroke) layer.color = group.stroke;
          if (Number.isFinite(group.strokeWidth)) layer.strokeWidth = group.strokeWidth;
          const { width, height } = this.app.engine.currentProfile;
          let bMinX = Infinity, bMinY = Infinity, bMaxX = -Infinity, bMaxY = -Infinity;
          group.paths.forEach(path => path.forEach(pt => {
            bMinX = Math.min(bMinX, pt.x); bMinY = Math.min(bMinY, pt.y);
            bMaxX = Math.max(bMaxX, pt.x); bMaxY = Math.max(bMaxY, pt.y);
          }));
          if (Number.isFinite(bMinX)) {
            layer.params.posX = width / 2 - (bMinX + bMaxX) / 2;
            layer.params.posY = height / 2 - (bMinY + bMaxY) / 2;
          }
          created.push(layer);
          this.app.engine.layers.push(layer);
          this.app.engine.generate(layer.id);
        });
        const primary = created[created.length - 1];
        if (primary && this.app.renderer) {
          this.app.engine.activeLayerId = primary.id;
          this.app.renderer.setSelection([primary.id], primary.id);
        }
        this.renderLayers();
        this.buildControls();
        this.updateFormula();
        this.app.render();
        toast(`Imported ${created.length} layer${created.length === 1 ? '' : 's'}`, 'success');
      };
      reader.readAsText(file);
    },

    // Import a .obj or .stl 3D model file and wrap it as a scene object3d
    // (solidType:'importedMesh') via VectorEngine.importMeshAsScene — the mesh
    // becomes a lit, shaded, selectable object in the 3D scene compositor. If a
    // scene is active the object is added to it; otherwise a new scene tree is
    // created. Binary STL needs an ArrayBuffer; OBJ / ASCII STL are text — the STL
    // parser accepts either, so .stl is always read as an ArrayBuffer.
    //
    // Parsing + the engine's compose are SYNCHRONOUS and can run for seconds on a
    // real download, so an indeterminate progress bar goes up first and the work
    // is deferred one frame — otherwise the tab simply froze with no feedback
    // (saveVecturaFile / exportSVG use the same startProgress idiom). The face
    // budget in buildImportedMeshParams bounds how long that can be.
    import3dModelFile(file) {
      if (!file || !Layer) return;
      const engine = this.app.engine;
      const lower = (file.name || '').toLowerCase();
      const isObj = lower.endsWith('.obj');

      const failModal = (title, text, variant = 'danger') => {
        toast(title, variant);
        const errBody = document.createElement('p');
        errBody.className = 'modal-text';
        errBody.textContent = text;
        this.openModal({ title, body: errBody });
      };

      const progress = startProgress(`Importing ${file.name}…`);
      // Yield a frame so the progress bar actually paints before the blocking
      // parse/compose. Falls back to a timeout under JSDOM / headless harnesses.
      const defer = (fn) => {
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => setTimeout(fn, 0));
        else setTimeout(fn, 0);
      };

      const reader = new FileReader();
      reader.onerror = () => {
        progress.done();
        failModal('3D Import Failed', `Could not read "${file.name}" from disk. The file may be unreadable or was removed.`);
      };
      reader.onload = () => {
        defer(() => {
          try {
            let mesh;
            try {
              mesh = isObj
                ? window.Vectura.ObjImport.parse(reader.result, file.name)
                : window.Vectura.StlParser.parse(reader.result, file.name);
            } catch (err) {
              // The parsers say "no faces"/"no triangles" when the file read fine
              // but described no usable geometry — a different user story from a
              // file we could not decode at all.
              if (/no faces|no triangles/i.test(err?.message || '')) {
                failModal('No Mesh Found',
                  `"${file.name}" contained no faces to import. ${err.message.replace(/^\w+ parse:\s*/, '')}`,
                  'warning');
              } else {
                failModal('3D Import Failed',
                  `Could not read "${file.name}". Make sure it is a valid ${isObj ? 'OBJ' : 'binary or ASCII STL'} mesh.`);
              }
              return;
            }
            if (!mesh || !mesh.vertices?.length || !mesh.faces?.length) {
              failModal('No Mesh Found', 'The 3D model contained no faces to import.', 'warning');
              return;
            }
            if (this.app.pushHistory) this.app.pushHistory();
            const result = engine.importMeshAsScene(mesh, mesh.name || file.name);
            if (!result || !result.ok) {
              toast('Could not import 3D model', 'danger');
              return;
            }
            engine.activeLayerId = result.childId;
            if (this.app.renderer) this.app.renderer.setSelection([result.childId], result.childId);
            this.renderLayers();
            this.buildControls();
            this.updateFormula();
            this.app.render();
            // Report the STORED triangle count, and say so when the face budget
            // reduced it — quoting the file's count would be a lie about what is
            // in the document. Parser warnings (dropped faces / bad `v` records)
            // ride along so a malformed file is never silently "fine".
            const stored = Number.isFinite(result.faces) ? result.faces : mesh.faces.length;
            const source = Number.isFinite(result.sourceFaces) ? result.sourceFaces : stored;
            const notes = Array.isArray(mesh.warnings) ? mesh.warnings.slice() : [];
            if (source > stored) notes.unshift(`reduced from ${source.toLocaleString()}`);
            const suffix = notes.length ? ` · ${notes.join(' · ')}` : '';
            toast(
              `Imported ${mesh.name || file.name} · ${stored.toLocaleString()} tris${suffix}`,
              notes.length ? 'warning' : 'success',
              notes.length ? 6000 : 3500,
            );
          } finally {
            progress.done();
          }
        });
      };
      if (isObj) reader.readAsText(file);
      else reader.readAsArrayBuffer(file);
    },

    parseSvgToLayerGroups(svgText) {
      if (!svgText) return [];
      const sanitizeSvg = window.Vectura?.SvgSanitize?.sanitize;
      const safeText = typeof sanitizeSvg === 'function' ? sanitizeSvg(svgText) : svgText;
      const parser = new DOMParser();
      const doc = parser.parseFromString(safeText, 'image/svg+xml');
      const svg = doc.querySelector('svg');
      if (!svg) return [];
      const parseNumber = (val, fallback = 0) => {
        if (!val) return fallback;
        const cleaned = `${val}`.replace(/[^0-9.+-]/g, '');
        const num = parseFloat(cleaned);
        return Number.isFinite(num) ? num : fallback;
      };
      const parseLengthMm = (val) => {
        if (!val) return null;
        const m = String(val).trim().match(/^([+-]?[0-9]*\.?[0-9]+)\s*(px|mm|cm|in|pt|pc)?$/i);
        if (!m) return null;
        const num = parseFloat(m[1]);
        const unit = (m[2] || 'px').toLowerCase();
        const toMm = { px: 25.4 / 96, mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72, pc: 25.4 / 6 };
        return toMm[unit] != null ? num * toMm[unit] : null;
      };
      const viewBox = svg.getAttribute('viewBox');
      let vbMinX = 0;
      let vbMinY = 0;
      let vbW = parseNumber(svg.getAttribute('width'), 0);
      let vbH = parseNumber(svg.getAttribute('height'), 0);
      if (viewBox) {
        const parts = viewBox.split(/[\s,]+/).map((v) => parseFloat(v));
        if (parts.length >= 4) {
          [vbMinX, vbMinY, vbW, vbH] = parts;
        }
      }
      const physWMm = parseLengthMm(svg.getAttribute('width'));
      const physHMm = parseLengthMm(svg.getAttribute('height'));
      const isIllustrator = /Adobe Illustrator/i.test(svgText);
      const defaultUnitMm = isIllustrator ? (25.4 / 72) : (25.4 / 96);
      let scaleMm = defaultUnitMm;
      if (physWMm != null && vbW > 0) {
        scaleMm = physWMm / vbW;
      } else if (physHMm != null && vbH > 0) {
        scaleMm = physHMm / vbH;
      }
      const tempSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      if (viewBox) tempSvg.setAttribute('viewBox', viewBox);
      if (vbW && vbH) {
        tempSvg.setAttribute('width', vbW);
        tempSvg.setAttribute('height', vbH);
      }
      tempSvg.style.position = 'absolute';
      tempSvg.style.left = '-9999px';
      tempSvg.style.top = '-9999px';
      tempSvg.style.width = '0';
      tempSvg.style.height = '0';
      tempSvg.style.visibility = 'hidden';
      document.body.appendChild(tempSvg);

      const groups = new Map();
      const order = [];
      const addGroup = (key, name, stroke, strokeWidth) => {
        if (!groups.has(key)) {
          groups.set(key, { name, stroke, strokeWidth, paths: [], isClosed: false, originalFill: null });
          order.push(key);
        }
        return groups.get(key);
      };
      const elements = svg.querySelectorAll('path, line, polyline, polygon, rect, circle, ellipse');
      elements.forEach((el) => {
        const clone = el.cloneNode(true);
        tempSvg.appendChild(clone);
        const stroke = el.getAttribute('stroke') || el.style?.stroke || '';
        const strokeWidth = parseNumber(el.getAttribute('stroke-width') || el.style?.strokeWidth, NaN);
        const groupLabel =
          el.closest('g')?.getAttribute('data-name') ||
          el.closest('g')?.getAttribute('id') ||
          (stroke && stroke !== 'none' ? `Stroke ${stroke}` : 'Imported SVG');
        const key = `${groupLabel}|${stroke || 'none'}`;
        const group = addGroup(key, groupLabel || 'Imported SVG', stroke && stroke !== 'none' ? stroke : null, strokeWidth);
        const fill = el.getAttribute('fill') || el.style?.fill || '';
        if (fill && fill !== 'none') {
          group.isClosed = true;
          if (!group.originalFill) group.originalFill = fill;
        }
        const paths = this.svgElementToPaths(clone, vbMinX, vbMinY);
        paths.forEach((path) => group.paths.push(path));
        clone.remove();
      });
      tempSvg.remove();

      // Geometric closure pass: mark groups closed if any path starts and ends at the same point
      order.forEach((key) => {
        const group = groups.get(key);
        if (group.isClosed) return;
        group.paths.forEach((path) => {
          if (path.length < 3) return;
          const first = path[0];
          const last = path[path.length - 1];
          if (Math.hypot(last.x - first.x, last.y - first.y) < 1.0) {
            group.isClosed = true;
          }
        });
      });

      // Declare closure on the path geometry itself. The closure detection above
      // tolerates a 1px endpoint gap (and fill-based closure has no gap test at
      // all), but masking's geometric closure check is exact — so a closed import
      // would be ineligible as a mask source unless we stamp meta.closed here.
      order.forEach((key) => {
        const group = groups.get(key);
        if (!group.isClosed) return;
        group.paths.forEach((path) => {
          if (!Array.isArray(path) || path.length < 3) return;
          path.meta = { ...(path.meta || {}), closed: true };
        });
      });

      if (scaleMm !== 1) {
        order.forEach((key) => {
          const group = groups.get(key);
          group.paths.forEach((path) => path.forEach((pt) => { pt.x *= scaleMm; pt.y *= scaleMm; }));
          if (Number.isFinite(group.strokeWidth)) group.strokeWidth *= scaleMm;
        });
      }

      return order.map((key) => groups.get(key)).filter((group) => group.paths && group.paths.length);
    },

    svgElementToPaths(el, offsetX = 0, offsetY = 0) {
      if (!el) return [];
      const tag = el.tagName.toLowerCase();
      const applyMatrix = (pt, matrix) => {
        if (!matrix) return pt;
        return {
          x: pt.x * matrix.a + pt.y * matrix.c + matrix.e,
          y: pt.x * matrix.b + pt.y * matrix.d + matrix.f,
        };
      };
      const applyOffset = (pt) => ({ x: pt.x - offsetX, y: pt.y - offsetY });
      const matrix = typeof el.getCTM === 'function' ? el.getCTM() : null;
      const normalizePoints = (points) =>
        points.map((pt) => applyOffset(applyMatrix({ x: pt.x, y: pt.y }, matrix)));
      const parseNumber = (val, fallback = 0) => {
        if (val === undefined || val === null) return fallback;
        const cleaned = `${val}`.replace(/[^0-9.+-]/g, '');
        const num = parseFloat(cleaned);
        return Number.isFinite(num) ? num : fallback;
      };

      if (tag === 'line') {
        const x1 = parseNumber(el.getAttribute('x1'));
        const y1 = parseNumber(el.getAttribute('y1'));
        const x2 = parseNumber(el.getAttribute('x2'));
        const y2 = parseNumber(el.getAttribute('y2'));
        return [normalizePoints([{ x: x1, y: y1 }, { x: x2, y: y2 }])];
      }
      if (tag === 'polyline' || tag === 'polygon') {
        const pointsAttr = el.getAttribute('points') || '';
        const coords = pointsAttr
          .trim()
          .split(/[\s,]+/)
          .map((val) => parseFloat(val))
          .filter((val) => Number.isFinite(val));
        const points = [];
        for (let i = 0; i < coords.length; i += 2) {
          points.push({ x: coords[i], y: coords[i + 1] });
        }
        if (tag === 'polygon' && points.length) points.push({ ...points[0] });
        return points.length ? [normalizePoints(points)] : [];
      }
      if (tag === 'rect') {
        const x = parseNumber(el.getAttribute('x'));
        const y = parseNumber(el.getAttribute('y'));
        const w = parseNumber(el.getAttribute('width'));
        const h = parseNumber(el.getAttribute('height'));
        const points = [
          { x, y },
          { x: x + w, y },
          { x: x + w, y: y + h },
          { x, y: y + h },
          { x, y },
        ];
        return [normalizePoints(points)];
      }
      if (tag === 'circle' || tag === 'ellipse') {
        const cx = parseNumber(el.getAttribute('cx'));
        const cy = parseNumber(el.getAttribute('cy'));
        const rx = parseNumber(el.getAttribute(tag === 'circle' ? 'r' : 'rx'));
        const ry = parseNumber(el.getAttribute(tag === 'circle' ? 'r' : 'ry'));
        const steps = 48;
        const points = [];
        for (let i = 0; i <= steps; i++) {
          const t = (i / steps) * Math.PI * 2;
          points.push({ x: cx + Math.cos(t) * rx, y: cy + Math.sin(t) * ry });
        }
        return [normalizePoints(points)];
      }
      if (tag === 'path') {
        try {
          const len = el.getTotalLength ? el.getTotalLength() : 0;
          if (!Number.isFinite(len) || len <= 0) return [];
          const steps = Math.max(10, Math.floor(len / 2));
          const step = len / steps;
          
          const allSubPaths = [];
          let currentPath = [];

          for (let idx = 0; idx <= steps + 1; idx++) {
             const actualLen = Math.min(idx * step, len);
             const pt = el.getPointAtLength(actualLen);
             
             if (currentPath.length > 0) {
                const prev = currentPath[currentPath.length - 1];
                const prevLen = Math.max(0, (idx - 1) * step);
                const dLen = actualLen - prevLen;
                const maxDist = (dLen > 0 ? dLen : step) * 1.5;
                
                if (Math.hypot(pt.x - prev.x, pt.y - prev.y) > maxDist) {
                    let L = prevLen;
                    let R = actualLen;
                    let beforeJump = L;
                    
                    for (let iter = 0; iter < 8; iter++) {
                        const mid = (L + R) / 2;
                        const midPt = el.getPointAtLength(mid);
                        if (Math.hypot(midPt.x - prev.x, midPt.y - prev.y) > (mid - prevLen) * 1.5) {
                            R = mid;
                        } else {
                            beforeJump = mid;
                            L = mid;
                        }
                    }
                    
                    if (currentPath.length > 1) {
                        const endPt = el.getPointAtLength(beforeJump);
                        currentPath.push({ x: endPt.x, y: endPt.y });
                        allSubPaths.push(normalizePoints(currentPath));
                    }
                    
                    const jumpPt = el.getPointAtLength(beforeJump + 0.05);
                    currentPath = [{ x: jumpPt.x, y: jumpPt.y }, { x: pt.x, y: pt.y }];
                    if (actualLen === len) break;
                    continue;
                }
             }
             currentPath.push({ x: pt.x, y: pt.y });
             if (actualLen === len) break;
          }
          if (currentPath.length > 0) allSubPaths.push(normalizePoints(currentPath));
          return allSubPaths;
        } catch (err) {
          return [];
        }
      }
      return [];
    },

    getExportSnapshot() {
      return window.Vectura.ExportSvgBuilder.buildExportSnapshot(this.app.engine, {
        computeDisplayGeometry: () => this.app.computeDisplayGeometry(),
        optimizeTargets: typeof this.optimizeTargetsForCurrentScope === 'function'
          ? (options) => this.optimizeTargetsForCurrentScope(options)
          : null,
      });
    },

    // Build the plotter SVG document for the current canvas without downloading it (export and the
    // Recents thumbnail share this). Returns { svg, pathCount, snapshot }. The markup itself comes
    // from ExportSvgBuilder, which the Start Page art renderer also uses.
    buildSvgDocument() {
      const snapshot =
        typeof this.getExportSnapshot === 'function'
          ? this.getExportSnapshot()
          : window.Vectura.UI.prototype.getExportSnapshot.call(this);
      const B = window.Vectura.ExportSvgBuilder;
      return { svg: B.buildSvgDocument(snapshot), pathCount: B.countPaths(snapshot), snapshot };
    },

    exportSVG() {
      const progress = startProgress('Exporting SVG…');
      try {
      // `this` may be a bare { app } stand-in (tests call the prototype method), so fall back to the prototype.
      const { svg, pathCount } = (typeof this.buildSvgDocument === 'function'
        ? this.buildSvgDocument() : window.Vectura.UI.prototype.buildSvgDocument.call(this));
      // Delight moment: the snapshot's groups are already in hand, so the
      // path count comes for free — "Exported vectura.svg — 1,165 paths".
      const filename = 'vectura.svg';
      // TUX-054: no await before saveBlob — the share sheet needs the tap's user activation.
      window.Vectura.Download.saveBlob(new Blob([svg], { type: 'image/svg+xml' }), filename).then((result) => {
        if (result === 'cancelled') return;
        toast(`Exported ${filename} — ${pathCount.toLocaleString()} path${pathCount === 1 ? '' : 's'}`, 'success');
      }).catch((err) => {
        console.error('exportSVG failed', err);
        toast('Could not export the SVG — see console for details', 'danger');
      });
      } finally {
        progress.done();
      }
    },

    // Phase 4: a SEPARATE "draw-on" animation export. Reuses the same export
    // snapshot geometry but emits a screen-only SVG whose strokes draw
    // themselves on a loop (SMIL stroke-dashoffset). Kept distinct from the
    // canonical plotter SVG so the plotter-ready output stays clean/static.
    exportAnimatedSVG() {
      const builder = window.Vectura.AnimatedSvg;
      if (!builder || typeof builder.buildDrawOn !== 'function') {
        toast('Animated export unavailable', 'danger');
        return;
      }
      const progress = startProgress('Exporting animated SVG…');
      try {
        const snapshot =
          typeof this.getExportSnapshot === 'function'
            ? this.getExportSnapshot()
            : window.Vectura.UI.prototype.getExportSnapshot.call(this);
        const { prof, precision, groups } = snapshot;

        // Collect continuous polylines (line-mode geometry). Skip meta shapes
        // (circles) and degenerate paths.
        const polylines = [];
        let stroke = 'black';
        let strokeWidth = 0.3;
        let gotStroke = false;
        groups.forEach((group) => {
          const penColor = (group.pen && group.pen.color) || 'black';
          group.items.forEach((item) => {
            if (!gotStroke) { stroke = penColor; strokeWidth = item.strokeWidth || 0.3; gotStroke = true; }
            const pts = Array.isArray(item.path) ? item.path : null;
            if (pts && pts.length > 1 && pts.every((pt) => pt && Number.isFinite(pt.x) && Number.isFinite(pt.y))) {
              polylines.push(pts.map((pt) => ({ x: pt.x, y: pt.y })));
            }
          });
        });

        if (!polylines.length) {
          toast('Animated export needs line-mode paths (no continuous strokes found)', 'danger');
          return;
        }

        // Draw time: the active harmonograph-family layer's duration (capped for
        // watchability), else a sensible default.
        const active = this.app.engine.getActiveLayer?.();
        const famDur = active && (active.type === 'pendula' || active.type === 'harmonograph')
          ? active.params?.duration : null;
        const durationSec = Math.min(14, Math.max(3, Number.isFinite(famDur) ? famDur : 8));

        const svg = builder.buildDrawOn(polylines, {
          width: prof.width,
          height: prof.height,
          stroke,
          strokeWidth,
          durationSec,
          precision,
          background: SETTINGS.bgColor || null,
        });

        const filename = 'vectura-animated.svg';
        const pathCount = polylines.length;
        window.Vectura.Download.saveBlob(new Blob([svg], { type: 'image/svg+xml' }), filename).then((result) => {
          if (result === 'cancelled') return;
          toast(`Exported ${filename} — ${pathCount.toLocaleString()} path${pathCount === 1 ? '' : 's'}`, 'success');
        }).catch((err) => {
          console.error('exportAnimatedSVG failed', err);
          toast('Could not export the animated SVG — see console for details', 'danger');
        });
      } finally {
        progress.done();
      }
    },
  };

  // Grouped installer for the file-I/O buttons (`btn-save-vectura`,
  // `btn-open-vectura`/`file-open-vectura`, `btn-import-svg`/`file-import-svg`).
  // `this` is the UI instance and the handlers delegate to mixin methods
  // (`saveVecturaFile`, `openVecturaFile`, `importSvgFile`) installed by the
  // existing `_UIFileIOMixin` assignment.
  let DEPS = null;

  const requireDeps = (name) => {
    if (!DEPS) {
      throw new Error(`UIFileIO.${name} invoked before UIFileIO.bind(deps) — load order broken`);
    }
    return DEPS;
  };

  function bindFileIoListeners() {
    const { getEl } = requireDeps('bindFileIoListeners');
    const btnSaveVectura = getEl('btn-save-vectura', { silent: true });
    const btnOpenVectura = getEl('btn-open-vectura', { silent: true });
    const btnImportSvg = getEl('btn-import-svg', { silent: true });
    const fileOpenVectura = getEl('file-open-vectura', { silent: true });
    const fileImportSvg = getEl('file-import-svg', { silent: true });
    const btnImport3d = getEl('btn-import-3d', { silent: true });
    const fileImport3d = getEl('file-import-3d', { silent: true });
    if (btnSaveVectura) {
      btnSaveVectura.onclick = () => this.saveVecturaFile();
    }
    if (btnOpenVectura && fileOpenVectura) {
      btnOpenVectura.onclick = () => this.pickVecturaFile({ input: fileOpenVectura });
      fileOpenVectura.onchange = () => {
        const file = fileOpenVectura.files?.[0];
        if (file) this.openVecturaFile(file);
        fileOpenVectura.value = '';
      };
    }
    if (btnImportSvg && fileImportSvg) {
      btnImportSvg.onclick = () => fileImportSvg.click();
      fileImportSvg.onchange = () => {
        const file = fileImportSvg.files?.[0];
        if (file) this.importSvgFile(file);
        fileImportSvg.value = '';
      };
    }
    if (btnImport3d && fileImport3d) {
      btnImport3d.onclick = () => fileImport3d.click();
      fileImport3d.onchange = () => {
        const file = fileImport3d.files?.[0];
        if (file) this.import3dModelFile(file);
        fileImport3d.value = '';
      };
    }
  }

  window.Vectura.UI = window.Vectura.UI || {};
  window.Vectura.UI.FileIO = {
    /**
     * Inject closure-captured legacy ui.js IIFE locals.
     * @param {object} deps - { getEl }
     */
    bind(deps) {
      DEPS = deps || {};
    },
    bindFileIoListeners,
    installOn(proto) {
      proto.bindFileIoListeners = function() { return bindFileIoListeners.call(this); };
    },
  };
})();
