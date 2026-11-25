/**
 * Vectura formula panel (Phase 2 step 4 first panel extraction from src/ui/ui.js).
 *
 * Exposes window.Vectura.UI.FormulaPanel — updateFormula(): renders the live
 * formula/expression block (#formula-display) and the seed display
 * (#formula-seed-display) for the active layer.
 *
 * The legacy UI prototype's updateFormula() is now a thin delegator that calls
 * into this module. The function body still references this.app via `this`,
 * which is bound by the delegator's .call(this) site.
 *
 * DI bag: { getEl, escapeHtml, usesSeed }.
 *
 * Compile gate at tests/unit/formula-panel-compile.test.js.
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};
  const UI = Vectura.UI = Vectura.UI || {};

  let DEPS = null;

  const requireDeps = (name) => {
    if (!DEPS) {
      throw new Error(`FormulaPanel.${name} invoked before FormulaPanel.bind(deps) — load order broken`);
    }
    return DEPS;
  };

  const copyText = async (text) => {
    try {
      if (G.navigator && G.navigator.clipboard && G.navigator.clipboard.writeText) {
        await G.navigator.clipboard.writeText(text);
        return true;
      }
    } catch (_) { /* fall through to the textarea path */ }
    try {
      const doc = G.document;
      const ta = doc.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      doc.body.appendChild(ta);
      ta.select();
      const ok = doc.execCommand && doc.execCommand('copy');
      ta.remove();
      return !!ok;
    } catch (_) {
      return false;
    }
  };

  // One delegated listener per #formula-display: the block is re-rendered via
  // innerHTML on every update, so the button itself can't hold the handler.
  function bindCopy(formula) {
    if (formula.dataset.copyBound === '1') return;
    formula.dataset.copyBound = '1';
    formula.addEventListener('click', async (e) => {
      const btn = e.target && e.target.closest ? e.target.closest('.formula-copy-btn') : null;
      if (!btn) return;
      e.preventDefault();
      const ok = await copyText(formula.dataset.copyText || '');
      const label = btn.querySelector('.formula-copy-label');
      btn.dataset.state = ok ? 'copied' : 'failed';
      if (label) label.textContent = ok ? 'Copied' : 'Copy failed';
      clearTimeout(btn._copyTimer);
      btn._copyTimer = setTimeout(() => {
        if (!btn.isConnected) return;
        delete btn.dataset.state;
        if (label) label.textContent = 'Copy';
      }, 1600);
    });
  }

  function updateFormula() {
    const { getEl, escapeHtml, usesSeed } = requireDeps('updateFormula');
    const l = this.app.engine.getActiveLayer();
    if (!l) return;
    const formula = getEl('formula-display');
    const seedDisplay = getEl('formula-seed-display');
    if (formula) {
      const fmt = (val) => {
        if (typeof val === 'number') return Number.isFinite(val) ? val.toFixed(3) : `${val}`;
        if (typeof val === 'boolean') return val ? 'true' : 'false';
        if (val === null || val === undefined) return '';
        if (Array.isArray(val)) return val.map((item) => fmt(item)).join(', ');
        if (typeof val === 'object') return JSON.stringify(val);
        return `${val}`;
      };
      const entries = [];
      Object.entries(l.params || {}).forEach(([key, val]) => {
        if (key === 'pendulums' && Array.isArray(val)) {
          val.forEach((pend, idx) => {
            if (!pend || typeof pend !== 'object') return;
            Object.entries(pend).forEach(([pKey, pVal]) => {
              if (pKey === 'id') return;
              entries.push([`P${idx + 1}.${pKey}`, fmt(pVal)]);
            });
          });
          return;
        }
        if (key === 'noises' && Array.isArray(val)) {
          val.forEach((noise, idx) => {
            if (!noise || typeof noise !== 'object') return;
            Object.entries(noise).forEach(([nKey, nVal]) => {
              if (nKey === 'id' || nKey === 'imagePreview') return;
              entries.push([`N${idx + 1}.${nKey}`, fmt(nVal)]);
            });
          });
          return;
        }
        if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
          Object.entries(val).forEach(([subKey, subVal]) => {
            entries.push([`${key}.${subKey}`, fmt(subVal)]);
          });
          return;
        }
        entries.push([key, fmt(val)]);
      });
      const formulaText = this.app.engine.getFormula(l.id);
      const formulaLines = `${formulaText || ''}`.split('\n').filter((line) => line.trim().length);
      const formulaHtml = formulaLines
        .map((line) => `<div class="formula-line">${escapeHtml(line)}</div>`)
        .join('');
      const valuesHtml = entries.length
        ? `
            <div class="formula-values">
              <div class="formula-values-title">Values</div>
              ${entries
                .map(
                  ([key, val]) =>
                    `<div class="formula-row"><span class="formula-key">${escapeHtml(
                      key
                    )}</span><span class="formula-val">${escapeHtml(val)}</span></div>`
                )
                .join('')}
            </div>
          `
        : '';
      // Plain-text copy of the whole model (formula, every Values row, seed),
      // read by the Copy button so the clipboard never depends on what's visible.
      const seedLine = usesSeed(l.type) && l.params ? `Seed: ${l.params.seed}` : '';
      formula.dataset.copyText = [
        ...formulaLines.map((line) => line.trim()),
        ...(entries.length ? ['', 'Values', ...entries.map(([key, val]) => `${key}: ${val}`)] : []),
        ...(seedLine ? ['', seedLine] : []),
      ].join('\n');
      bindCopy(formula);
      formula.innerHTML = `
          <div class="formula-block">
            <button type="button" class="formula-copy-btn" aria-label="Copy mathematical model" title="Copy the full mathematical model">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              <span class="formula-copy-label">Copy</span>
            </button>
            <div class="formula-equation">${formulaHtml || '<span class="text-vectura-muted">Select a layer...</span>'}</div>
            ${valuesHtml}
          </div>
        `;
    }
    if (seedDisplay) {
      const shouldShow = usesSeed(l.type) && l.params;
      seedDisplay.style.display = shouldShow ? '' : 'none';
      if (shouldShow) seedDisplay.innerText = `Seed: ${l.params.seed}`;
    }
  }

  UI.FormulaPanel = {
    /**
     * Inject closure-captured legacy ui.js IIFE locals.
     * Idempotent. Called once from the legacy ui.js IIFE.
     * @param {object} deps
     */
    bind(deps) {
      DEPS = deps;
    },
    updateFormula,
    installOn(proto) {
      proto.updateFormula = function() { return updateFormula.call(this); };
    },
  };
})();
