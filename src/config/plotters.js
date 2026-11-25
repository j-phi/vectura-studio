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

  // Manufacturer-published specifications (vendor product page). These are the vendor's claims, stored in metric;
  // the UI renders imperial from them. Display only: no profile limit or safety cap is derived from this data.
  const axes = (xf, xa, yf, ya, zf, za) => ({ x: { maxFeed: xf, maxAccel: xa }, y: { maxFeed: yf, maxAccel: ya }, z: { maxFeed: zf, maxAccel: za } });
  const UUNATEK_SPEED_MODES = [
    { id: 'high-speed', name: 'High-speed writing mode', note: 'High acceleration increases noise and decreases precision. Exceeding these parameters may cause abnormal operation, positioning errors, motor step loss and stalling.', axes: axes(20000, 6000, 20000, 2000, 20000, 4000) },
    { id: 'standard', name: 'Standard mode (factory default)', note: '', axes: axes(15000, 2000, 15000, 2000, 8000, 2000) },
    { id: 'drawing', name: 'Drawing mode (recommended for drawing)', note: 'Accurate curves and arcs while keeping straight-line speed; reduces vibration and noise.', axes: axes(12000, 500, 12000, 500, 12000, 2000) },
    { id: 'silence', name: 'Silence mode', note: '', axes: axes(10000, 1000, 10000, 1000, 8000, 1000) },
  ];
  const uunatekSpecs = (physical) => ({
    source: 'Manufacturer product page',
    note: "These specifications are the manufacturer's own claims and have not been verified by Vectura.",
    performance: {
      repeatAccuracy: [
        { label: 'A3 / A2', mm: 0.02 },
        { label: 'A1 / A0', mm: 0.05 },
        { label: 'Custom formats over 2 m', mm: 0.1 },
      ],
      maxWritingSpeedMmMin: 20000,
      maxWritingSpeedText: 'Up to 20,000 mm/min (X/Y/Z)',
      noise: 'Less than 60 dB (industrial-grade silent drive)',
      sizesAvailable: 'A3 / A2 / A1 / A0 and custom sizes up to 4 \u00d7 2 m',
    },
    tool: {
      maxWritingThicknessMm: 30,
      maxWritingThicknessModifiedMm: 40,
      penDiameterMaxMm: 17.5,
      penAngleDeg: { min: 0, max: 90 },
      penAngleNote: 'Slanted brush and calligraphy pens',
      motors: { x: 'NEMA 17 (42)', y: 'NEMA 17 (42) / NEMA 23 (57)', z: 'NEMA 17 (42)' },
      limitSwitches: 'Integrated (customizable)',
      laser: 'Optional 10 W laser head',
    },
    physical,
    electronics: {
      frame: 'Heavy-duty Q235 carbon steel + aluminum alloy',
      basePlate: '2 mm industrial steel plate cover (custom over 2 m: 8 mm tempered glass)',
      board: 'GRBL board',
      ratedPowerW: 20,
      ratedPowerNote: '12 V 3 A / 24 V 2 A',
      operatingVoltage: 'DC 12\u201324 V',
      adapterInput: 'AC 110\u2013230 V',
      adapterOutput: 'DC 12 V',
      operatingTempC: { min: -20, max: 55 },
      design: 'Pre-assembled all-in-one, modular, no installation required',
    },
    software: {
      controlSoftware: ['UUNA TEK 3.0 Software (recommended)', 'Inkscape', 'Universal Gcode Sender (UGS)', 'LightBurn', 'LaserGRBL'],
      os: 'Windows & macOS (Intel & Apple silicon)',
      connectivity: 'USB and Wi-Fi (default), SD card offline support',
      memoryCard: 'SD/TF',
      protocol: 'G-code via serial UART',
      fileFormats: ['SVG', 'DXF', 'JPG', 'PNG', 'BMP', 'PDF'],
    },
    speedModes: UUNATEK_SPEED_MODES,
  });
  const box = (l, w, h) => (h === undefined ? { l, w } : { l, w, h });
  const UUNATEK_PHYSICAL = {
    a3: { writingAreaMm: { width: 420, height: 297 }, paperEquivalents: 'A3 & US Ledger', productMm: box(575, 450, 194), tableMm: box(610, 500), packageMm: box(630, 520, 240), netWeightKg: 11 },
    a2: { writingAreaMm: { width: 594, height: 420 }, paperEquivalents: 'A2 & ANSI C', productMm: box(758, 580, 194), tableMm: box(860, 650), packageMm: box(890, 680, 280), netWeightKg: 17.5 },
    a1: { writingAreaMm: { width: 841, height: 594 }, paperEquivalents: 'A1 & ANSI D', productMm: box(1018, 785, 205), tableMm: box(1120, 850), packageMm: box(1150, 880, 350), netWeightKg: 32 },
    a0: { writingAreaMm: { width: 1189, height: 841 }, paperEquivalents: 'A0 & ANSI E', productMm: box(1366, 1030, 205), tableMm: box(1450, 1100), packageMm: box(1480, 1130, 350), netWeightKg: 48 },
  };

  const uunatek = (size, width, height, tested) => merge(BASE_PROFILE, {
    id: `uunatek-3-${size}`,
    name: `UUNATEK 3.0 ${size.toUpperCase()}`,
    vendor: 'UUNATEK',
    tested,
    workArea: { width, height },
    specs: uunatekSpecs(UUNATEK_PHYSICAL[size]),
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
