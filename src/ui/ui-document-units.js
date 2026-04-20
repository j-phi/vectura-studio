/**
 * Document-units methods for the UI class — mixed into UI.prototype by ui.js.
 */
(() => {
  const getEl = (id, options = {}) => {
    const el = document.getElementById(id);
    if (!el && !options.silent) console.warn(`[UI] Missing element #${id}`);
    return el;
  };

  const stepPrecision = (step) => {
    const s = step?.toString?.() || '';
    if (!s.includes('.')) return 0;
    return s.split('.')[1].length;
  };

  const resolveUnitUtils = () => {
    const U = window.Vectura?.UnitUtils || {};
    const normalizeDocumentUnits = U.normalizeDocumentUnits || ((value) => (`${value || ''}`.trim().toLowerCase() === 'imperial' ? 'imperial' : 'metric'));
    const getDocumentUnitLabel = U.getDocumentUnitLabel || ((units) => (normalizeDocumentUnits(units) === 'imperial' ? 'in' : 'mm'));
    const mmToDocumentUnits = U.mmToDocumentUnits || ((value, units) => (normalizeDocumentUnits(units) === 'imperial' ? Number(value || 0) / 25.4 : Number(value || 0)));
    const documentUnitsToMm = U.documentUnitsToMm || ((value, units) => (normalizeDocumentUnits(units) === 'imperial' ? Number(value || 0) * 25.4 : Number(value || 0)));
    const getDocumentUnitPrecision = U.getDocumentUnitPrecision || ((units, fallback = null) => (Number.isFinite(fallback) ? fallback : (normalizeDocumentUnits(units) === 'imperial' ? 2 : 1)));
    const getDocumentUnitStep = U.getDocumentUnitStep || ((units, fallback = null) => (Number.isFinite(fallback) ? fallback : (normalizeDocumentUnits(units) === 'imperial' ? 0.01 : 0.1)));
    return { normalizeDocumentUnits, getDocumentUnitLabel, mmToDocumentUnits, documentUnitsToMm, getDocumentUnitPrecision, getDocumentUnitStep };
  };

  window.Vectura = window.Vectura || {};
  window.Vectura._UIDocumentUnitsMixin = {
    getDocumentUnits() {
      const { normalizeDocumentUnits } = resolveUnitUtils();
      return normalizeDocumentUnits((window.Vectura.SETTINGS || {}).documentUnits);
    },

    getDocumentUnitLabel() {
      const { getDocumentUnitLabel } = resolveUnitUtils();
      return getDocumentUnitLabel(this.getDocumentUnits());
    },

    getDocumentLengthConfig(options = {}) {
      const { mmToDocumentUnits, getDocumentUnitPrecision, getDocumentUnitStep, getDocumentUnitLabel } = resolveUnitUtils();
      const units = this.getDocumentUnits();
      const convertedStep = options.stepMm !== undefined ? mmToDocumentUnits(options.stepMm, units) : null;
      const step = options.step !== undefined ? options.step : (convertedStep || getDocumentUnitStep(units));
      const precision = Math.max(
        getDocumentUnitPrecision(units, options.precision),
        stepPrecision(step)
      );
      const min = options.minMm !== undefined ? mmToDocumentUnits(options.minMm, units) : null;
      const max = options.maxMm !== undefined ? mmToDocumentUnits(options.maxMm, units) : null;
      return { units, precision, step, min, max, unitLabel: getDocumentUnitLabel(units) };
    },

    formatDocumentNumber(valueMm, options = {}) {
      const { mmToDocumentUnits, getDocumentUnitPrecision } = resolveUnitUtils();
      const units = options.units || this.getDocumentUnits();
      const precision = getDocumentUnitPrecision(units, options.precision);
      const displayValue = mmToDocumentUnits(valueMm, units);
      if (!Number.isFinite(displayValue)) return '0';
      let text = displayValue.toFixed(precision);
      if (options.trimTrailingZeros !== false && text.includes('.')) {
        text = text.replace(/\.?0+$/, '');
      }
      return text;
    },

    parseDocumentNumber(raw, options = {}) {
      const { documentUnitsToMm } = resolveUnitUtils();
      const fallbackMm = options.fallbackMm ?? 0;
      const next = parseFloat(raw);
      if (!Number.isFinite(next)) return fallbackMm;
      return documentUnitsToMm(next, this.getDocumentUnits());
    },

    syncDocumentLengthInput(input, valueMm, options = {}) {
      if (!input) return;
      const config = this.getDocumentLengthConfig(options);
      if (config.min !== null) input.min = `${config.min}`;
      if (config.max !== null) input.max = `${config.max}`;
      input.step = `${config.step}`;
      input.value = this.formatDocumentNumber(valueMm, {
        units: config.units,
        precision: config.precision,
      });
    },

    refreshDocumentUnitsUi() {
      const SETTINGS = window.Vectura.SETTINGS || {};
      const unitLabel = this.getDocumentUnitLabel();
      const documentUnits = getEl('set-document-units', { silent: true });
      const paperWidthLabel = getEl('set-paper-width-label', { silent: true });
      const paperHeightLabel = getEl('set-paper-height-label', { silent: true });
      const marginLabel = getEl('set-margin-label', { silent: true });
      const marginLineWeightUnit = getEl('set-margin-line-weight-unit', { silent: true });
      const selectionOutlineWidthUnit = getEl('set-selection-outline-width-unit', { silent: true });
      const margin = getEl('set-margin', { silent: true });
      const paperWidth = getEl('set-paper-width', { silent: true });
      const paperHeight = getEl('set-paper-height', { silent: true });
      const marginLineWeight = getEl('set-margin-line-weight', { silent: true });
      const marginLineWeightSlider = getEl('set-margin-line-weight-slider', { silent: true });
      const selectionOutlineWidth = getEl('set-selection-outline-width', { silent: true });
      const selectionOutlineWidthSlider = getEl('set-selection-outline-width-slider', { silent: true });

      if (documentUnits) documentUnits.value = this.getDocumentUnits();
      if (paperWidthLabel) paperWidthLabel.textContent = `Width (${unitLabel})`;
      if (paperHeightLabel) paperHeightLabel.textContent = `Height (${unitLabel})`;
      if (marginLabel) marginLabel.textContent = `Margin (${unitLabel})`;
      if (marginLineWeightUnit) marginLineWeightUnit.textContent = unitLabel;
      if (selectionOutlineWidthUnit) selectionOutlineWidthUnit.textContent = unitLabel;

      this.syncDocumentLengthInput(margin, SETTINGS.margin, { minMm: 0, stepMm: 0.5 });
      this.syncDocumentLengthInput(paperWidth, SETTINGS.paperWidth ?? 210, { minMm: 1, stepMm: 0.5 });
      this.syncDocumentLengthInput(paperHeight, SETTINGS.paperHeight ?? 297, { minMm: 1, stepMm: 0.5 });
      this.syncDocumentLengthInput(marginLineWeight, SETTINGS.marginLineWeight ?? 0.2, { minMm: 0.05, maxMm: 2, stepMm: 0.05 });
      this.syncDocumentLengthInput(marginLineWeightSlider, SETTINGS.marginLineWeight ?? 0.2, { minMm: 0.05, maxMm: 2, stepMm: 0.05 });
      this.syncDocumentLengthInput(selectionOutlineWidth, SETTINGS.selectionOutlineWidth ?? 0.4, { minMm: 0.1, maxMm: 2, stepMm: 0.05 });
      this.syncDocumentLengthInput(selectionOutlineWidthSlider, SETTINGS.selectionOutlineWidth ?? 0.4, { minMm: 0.1, maxMm: 2, stepMm: 0.05 });
    },
  };
})();
