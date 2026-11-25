/**
 * Plotter profile registry. Built-in profiles are deep-frozen so UI code can
 * never mutate them; user profiles are duplicated from a built-in first.
 * Safety limits here are enforced by PlotSafety (src/core/plotter/plot-safety.js).
 */
(() => {
  const clone = (v) => {
    if (Array.isArray(v)) return v.map(clone);
    if (v && typeof v === 'object') {
      const out = {};
      Object.keys(v).forEach((k) => { out[k] = clone(v[k]); });
      return out;
    }
    return v;
  };

  const merge = (base, over) => {
    const out = clone(base);
    if (!over || typeof over !== 'object') return out;
    Object.keys(over).forEach((k) => {
      const v = over[k];
      if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) {
        out[k] = merge(out[k], v);
      } else {
        out[k] = clone(v);
      }
    });
    return out;
  };

  const deepFreeze = (v) => {
    if (v && typeof v === 'object' && !Object.isFrozen(v)) {
      Object.freeze(v);
      Object.keys(v).forEach((k) => deepFreeze(v[k]));
    }
    return v;
  };

  const BASE_PROFILE = {
    id: 'custom-plotter',
    name: 'Custom plotter',
    vendor: '',
    driver: 'grbl',
    tested: false,
    serial: {
      baudRate: 115200,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      // WCH CH340 family; DrawCore boards seen with PID 0x7523 and 0x8040.
      filters: [{ usbVendorId: 0x1a86 }],
      rxBuffer: 127,
      lineEnding: '\n',
    },
    workArea: { width: 420, height: 297 },
    axes: { invertX: false, invertY: false, swapXY: false },
    pen: {
      mechanism: 'z',
      up: 0,
      down: 3.5,
      zMin: 0,
      zMax: 10,
      zFeed: 5000,
      servoUp: 'M5',
      servoDown: 'M3 S1000',
      downDelay: 0.05,
      upDelay: 0,
    },
    motion: { drawFeed: 3000, travelFeed: 6000, jogFeed: 2500 },
    limits: { maxFeedXY: 11000, maxFeedZ: 5000, maxJogFeed: 6000, edgeMargin: 2 },
    gcode: { preamble: ['G21', 'G90'], postamble: [], decimals: 3, compact: false },
    // homing is decided at runtime from firmware $22 (some DrawCore units report $22=1).
    capabilities: { homing: false, statusBufferReport: 'optional', resetsOnOpen: true },
  };

  const SETTINGS_DEFAULTS = {
    profileId: 'uunatek-3-a3',
    placement: { mode: 'document', offsetX: 0, offsetY: 0, scale: 1, rotate: 0 },
    optimize: { enabled: true, simplify: 0.02, minLength: 0, dedupe: true, sort: true, merge: true, mergeTol: 0.1 },
    pens: {},
    penOrder: null,
    penChange: 'pause',
    penChangePosition: 'origin',
    returnToOrigin: true,
    airPlot: false,
    profileOverrides: {},
  };

  const uunatek = (size, width, height, tested) => merge(BASE_PROFILE, {
    id: `uunatek-3-${size}`,
    name: `UUNATEK 3.0 ${size.toUpperCase()}`,
    vendor: 'UUNATEK',
    tested,
    workArea: { width, height },
  });

  const PLOTTER_PROFILES = deepFreeze([
    uunatek('a3', 420, 297, true),
    uunatek('a2', 594, 420, false),
    uunatek('a1', 841, 594, false),
    uunatek('a0', 1189, 841, false),
    merge(BASE_PROFILE, {
      id: 'generic-grbl-servo',
      name: 'Generic GRBL (servo pen)',
      vendor: 'Generic',
      tested: false,
      workArea: { width: 300, height: 200 },
      pen: { mechanism: 'servo', servoUp: 'M5', servoDown: 'M3 S1000' },
    }),
  ]);

  const PLOTTER_DEFAULTS = { profile: BASE_PROFILE, settings: SETTINGS_DEFAULTS };

  const api = { PLOTTER_PROFILES, PLOTTER_DEFAULTS };

  if (typeof window !== 'undefined') {
    const Vectura = (window.Vectura = window.Vectura || {});
    Vectura.PLOTTER_PROFILES = PLOTTER_PROFILES;
    Vectura.PLOTTER_DEFAULTS = PLOTTER_DEFAULTS;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
