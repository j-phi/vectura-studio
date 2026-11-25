/**
 * PlotSafety: pure hardware-safety rules for Send to Plotter (no DOM).
 * Command allow-list, work-area/feed/Z clamps, job bounds, profile validation.
 */
(() => {
  const getDefaults = () => {
    if (typeof module !== 'undefined' && module.exports && typeof require === 'function') {
      return require('../../config/plotters.js').PLOTTER_DEFAULTS;
    }
    return (typeof window !== 'undefined' && window.Vectura && window.Vectura.PLOTTER_DEFAULTS) || null;
  };

  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  const posNum = (v) => isNum(v) && v > 0;

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

  // ---- Command classification (rule 1) ----
  const ALLOWED_G = new Set([0, 1, 2, 3, 4, 17, 20, 21, 53, 54, 90, 91, 91.1, 92, 92.1, 93, 94]);
  const ALLOWED_M = new Set([3, 4, 5]);
  const ALLOWED_WORDS = new Set(['G', 'M', 'X', 'Y', 'Z', 'F', 'S', 'P', 'I', 'J', 'K', 'R', 'N']);

  const stripComments = (line) => {
    let s = String(line);
    const semi = s.indexOf(';');
    if (semi >= 0) s = s.slice(0, semi);
    return s.replace(/\([^)]*\)/g, '');
  };

  const blocked = (reason, kind) => ({ ok: false, reason, kind: kind || 'blocked' });

  const classifyDollar = (s, opts) => {
    // s: uppercase, whitespace removed, starts with '$'
    if (s.startsWith('$RST')) return blocked('$RST restores factory settings and is always blocked.');
    if (s.startsWith('$SLP')) return blocked('$SLP puts the controller to sleep and is blocked.');
    if (s === '$$' || s === '$I' || s === '$G' || s === '$#' || s === '$N' || s === '$') {
      return { ok: true, reason: '', kind: 'query' };
    }
    if (s.startsWith('$J=')) return { ok: true, reason: '', kind: 'jog' };
    if (s === '$H') {
      return opts.allowHoming
        ? { ok: true, reason: '', kind: 'homing' }
        : blocked('Homing ($H) is only available when the machine reports homing switches and you confirm it.', 'homing');
    }
    if (s === '$X') {
      return opts.allowUnlock
        ? { ok: true, reason: '', kind: 'unlock' }
        : blocked('Unlock ($X) only runs from the Unlock button after a warning.', 'unlock');
    }
    if (s === '$C') return blocked('Check mode ($C) toggles controller state and is blocked.');
    if (s.startsWith('$I=')) return blocked('$I= writes the build info string to EEPROM and is blocked.', 'setting');
    if (/^\$N\d*=/.test(s)) return blocked('Startup blocks ($N=, $N0=, $N1=) write to EEPROM and are blocked.', 'setting');
    if (/^\$CONFIG\//.test(s)) return blocked('Writing $Config/ values changes firmware settings and is blocked.', 'setting');
    if (/^\$CD=/.test(s)) return blocked('$CD= writes firmware configuration and is blocked.', 'setting');
    if (/^\$\d+=/.test(s)) {
      if (opts.allowFirmwareWrites) return { ok: true, reason: '', kind: 'setting' };
      return blocked('Writing firmware settings ($n=value) is blocked. Enable Advanced firmware writes to allow it.', 'setting');
    }
    if (s.includes('=')) return blocked('Firmware setting writes ($name=value) are blocked.', 'setting');
    return blocked('Command is not on the allowed list.');
  };

  const classifySingle = (rawLine, opts) => {
    if (rawLine === '?') return { ok: true, reason: '', kind: 'query' };
    if (rawLine === '!' || rawLine === '~' || rawLine === '\x18' || rawLine === '\x85') {
      return { ok: true, reason: '', kind: 'realtime' };
    }
    const s = stripComments(rawLine).toUpperCase().replace(/\s+/g, '');
    if (!s) return { ok: true, reason: '', kind: 'motion' };
    if (s.startsWith('$')) return classifyDollar(s, opts);
    if (s.includes('$')) return blocked('Firmware commands ($) may not be mixed into a G-code line.');

    const words = [];
    let rest = s;
    const re = /^([A-Z])([-+]?(?:\d+\.?\d*|\.\d+))/;
    while (rest.length) {
      const m = re.exec(rest);
      if (!m) return blocked('Command is not on the allowed list (could not parse "' + rest.slice(0, 12) + '").');
      words.push({ letter: m[1], value: parseFloat(m[2]) });
      rest = rest.slice(m[0].length);
    }
    const gs = [];
    for (const w of words) {
      if (!ALLOWED_WORDS.has(w.letter)) return blocked('Word ' + w.letter + ' is not on the allowed list.');
      if (w.letter === 'G') {
        if (w.value === 10) return blocked('G10 writes work offsets to EEPROM and is blocked.', 'setting');
        if (w.value === 28.1 || w.value === 30.1) {
          return blocked('G' + w.value + ' stores a position in EEPROM and is blocked.', 'setting');
        }
        if (!ALLOWED_G.has(w.value)) return blocked('G' + w.value + ' is not on the allowed list.');
        gs.push(w.value);
      } else if (w.letter === 'M') {
        if (!ALLOWED_M.has(w.value)) return blocked('M' + w.value + ' is not on the allowed list.');
      }
    }
    if (gs.includes(53) && !gs.includes(0) && !gs.includes(1)) {
      return blocked('G53 is only allowed combined with G0 or G1.');
    }
    return { ok: true, reason: '', kind: 'motion' };
  };

  const classifyCommand = (line, opts) => {
    const o = opts || {};
    const text = typeof line === 'string' ? line : String(line == null ? '' : line);
    const parts = text.split(/\r?\n/);
    let last = { ok: true, reason: '', kind: 'motion' };
    for (const part of parts) {
      const r = classifySingle(part, o);
      if (!r.ok) return r;
      last = r;
    }
    return last;
  };

  // ---- Limits ----
  const fwVal = (fw, key) => (fw && posNum(fw[key]) ? fw[key] : Infinity);

  const effectiveWorkArea = (profile, fw) => ({
    width: Math.min(profile.workArea.width, fwVal(fw, 130)),
    height: Math.min(profile.workArea.height, fwVal(fw, 131)),
  });

  const clampFeed = (f, cap, fallback) => {
    const c = Math.max(1, cap);
    const v = isNum(f) ? f : fallback;
    return Math.max(1, Math.min(isNum(v) ? v : c, c));
  };

  const clampFeedXY = (f, profile, fw) => {
    const cap = Math.min(profile.limits.maxFeedXY, fwVal(fw, 110), fwVal(fw, 111));
    return clampFeed(f, cap, profile.motion && profile.motion.drawFeed);
  };

  const clampFeedZ = (f, profile, fw) => {
    const cap = Math.min(profile.limits.maxFeedZ, fwVal(fw, 112));
    return clampFeed(f, cap, profile.pen && profile.pen.zFeed);
  };

  const clampZ = (z, profile, fw) => {
    const lo = profile.pen.zMin;
    const hi = Math.max(lo, Math.min(profile.pen.zMax, fwVal(fw, 132)));
    const v = isNum(z) ? z : profile.pen.up;
    return Math.max(lo, Math.min(isNum(v) ? v : lo, hi));
  };

  // Bounds tolerance (mm). GRBL status reports round to 3 decimals and MPos, WPos and WCO are
  // rounded independently, so WCO can be off by 0.001 per report; G92 round-trips add the same.
  // A target this close outside the work area is treated as on the edge (clamped for moves,
  // accepted for jobs/console). Never widen this beyond what rounding noise needs.
  const BOUNDS_TOLERANCE_MM = 0.02;

  // Round a machine coordinate to firmware resolution (3 decimals) and snap values within
  // tolerance of 0 or of the far edge (size) to exactly that value.
  const snapMachineCoord = (v, size) => {
    const r = Math.round(v * 1000) / 1000;
    if (Math.abs(r) <= BOUNDS_TOLERANCE_MM) return 0;
    if (isNum(size) && Math.abs(r - size) <= BOUNDS_TOLERANCE_MM) return size;
    return r;
  };

  // ---- Job bounds (rule 2) ----
  // Job coordinates are relative to the work origin; the work origin sits at
  // machine position originOffset, so the allowed range is [-offset, size - offset].
  const checkJobBounds = (job, area, opts) => {
    const off = (opts && opts.originOffset) || {};
    const ox = isNum(off.x) ? off.x : 0;
    const oy = isNum(off.y) ? off.y : 0;
    let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
    let invalid = false;
    ((job && job.pens) || []).forEach((pen) => {
      (pen.paths || []).forEach((path) => {
        (path || []).forEach((pt) => {
          if (!pt || !isNum(pt.x) || !isNum(pt.y)) { invalid = true; return; }
          if (pt.x < minX) minX = pt.x;
          if (pt.x > maxX) maxX = pt.x;
          if (pt.y < minY) minY = pt.y;
          if (pt.y > maxY) maxY = pt.y;
        });
      });
    });
    const overflow = { left: 0, right: 0, top: 0, bottom: 0 };
    if (minX === Infinity) return { ok: !invalid, overflow, bbox: null, ...(invalid ? { reason: 'Job contains invalid coordinates.' } : {}) };
    const eps = BOUNDS_TOLERANCE_MM;
    overflow.left = Math.max(0, -ox - minX);
    overflow.right = Math.max(0, maxX - (area.width - ox));
    overflow.top = Math.max(0, -oy - minY);
    overflow.bottom = Math.max(0, maxY - (area.height - oy));
    Object.keys(overflow).forEach((k) => { if (overflow[k] <= eps) overflow[k] = 0; });
    const ok = !invalid && !overflow.left && !overflow.right && !overflow.top && !overflow.bottom;
    const out = { ok, overflow, bbox: { minX, minY, maxX, maxY } };
    if (invalid) out.reason = 'Job contains invalid coordinates.';
    return out;
  };

  // ---- Profile validation / normalization ----
  const KNOWN_DRIVERS = ['grbl'];
  const KNOWN_MECHANISMS = ['z', 'servo', 'custom'];

  const validateProfile = (p) => {
    const errors = [];
    if (!p || typeof p !== 'object') return { ok: false, errors: ['Profile must be an object.'] };
    const num = (label, v, { min = 0, allowZero = true } = {}) => {
      if (!isNum(v)) { errors.push(label + ' must be a finite number.'); return false; }
      if (v < min || (!allowZero && v === 0)) { errors.push(label + ' must not be negative' + (allowZero ? '' : ' or zero') + '.'); return false; }
      return true;
    };
    if (typeof p.id !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(p.id)) errors.push('id must be lowercase kebab-case.');
    if (typeof p.name !== 'string' || !p.name.trim()) errors.push('name is required.');
    if (!KNOWN_DRIVERS.includes(p.driver)) errors.push('Unknown driver "' + p.driver + '".');

    const wa = p.workArea || {};
    ['width', 'height'].forEach((k) => {
      if (!isNum(wa[k]) || wa[k] <= 0) errors.push('workArea.' + k + ' must be greater than 0.');
      else if (wa[k] > 4000) errors.push('workArea.' + k + ' must be 4000 mm or less.');
    });

    const pen = p.pen || {};
    if (!KNOWN_MECHANISMS.includes(pen.mechanism)) errors.push('Unknown pen mechanism "' + pen.mechanism + '".');
    const penOk = ['up', 'down', 'zMin', 'zMax', 'zFeed', 'downDelay', 'upDelay']
      .map((k) => num('pen.' + k, pen[k]))
      .every(Boolean);
    if (penOk) {
      if (pen.mechanism === 'z' && pen.zMax > 12) errors.push('pen.zMax must be 12 mm or less for a Z-axis pen.');
      if (pen.zMin > pen.zMax) errors.push('pen.zMin must not exceed pen.zMax.');
      ['up', 'down'].forEach((k) => {
        if (pen[k] < pen.zMin || pen[k] > pen.zMax) errors.push('pen.' + k + ' must be within zMin..zMax.');
      });
    }
    if (pen.mechanism === 'servo' || pen.mechanism === 'custom') {
      ['servoUp', 'servoDown'].forEach((k) => {
        if (typeof pen[k] !== 'string' || !pen[k].trim()) {
          errors.push('pen.' + k + ' template is required.');
        } else {
          const r = classifyCommand(pen[k]);
          if (!r.ok) errors.push('pen.' + k + ' template is not allowed: ' + r.reason);
        }
      });
    }

    const feedLabels = [];
    ['drawFeed', 'travelFeed', 'jogFeed'].forEach((k) => feedLabels.push(['motion.' + k, (p.motion || {})[k]]));
    ['maxFeedXY', 'maxFeedZ', 'maxJogFeed'].forEach((k) => feedLabels.push(['limits.' + k, (p.limits || {})[k]]));
    feedLabels.push(['pen.zFeed', pen.zFeed]);
    feedLabels.forEach(([label, v]) => {
      if (!isNum(v) || v <= 0) errors.push(label + ' must be greater than 0.');
      else if (v > 20000) errors.push(label + ' must be 20000 mm/min or less.');
    });

    const ser = p.serial || {};
    if (!posNum(ser.baudRate)) errors.push('serial.baudRate must be a positive number.');
    if (ser.rxBuffer !== undefined && !(isNum(ser.rxBuffer) && ser.rxBuffer >= 16 && ser.rxBuffer <= 127)) {
      errors.push('serial.rxBuffer must be between 16 and 127 bytes.');
    }
    const gc = p.gcode || {};
    ['preamble', 'postamble'].forEach((k) => {
      if (!Array.isArray(gc[k])) { errors.push('gcode.' + k + ' must be an array.'); return; }
      gc[k].forEach((line) => {
        const r = classifyCommand(line);
        if (!r.ok) errors.push('gcode.' + k + ' line "' + line + '" is not allowed: ' + r.reason);
      });
    });
    if (gc.decimals !== undefined && !(isNum(gc.decimals) && gc.decimals >= 0 && gc.decimals <= 6)) {
      errors.push('gcode.decimals must be between 0 and 6.');
    }
    return { ok: errors.length === 0, errors };
  };

  const normalizeProfile = (p) => {
    const defaults = getDefaults();
    return merge((defaults && defaults.profile) || {}, p || {});
  };

  const api = {
    classifyCommand,
    effectiveWorkArea,
    clampFeedXY,
    clampFeedZ,
    clampZ,
    checkJobBounds,
    BOUNDS_TOLERANCE_MM,
    snapMachineCoord,
    validateProfile,
    normalizeProfile,
  };

  if (typeof window !== 'undefined') {
    const Vectura = (window.Vectura = window.Vectura || {});
    Vectura.PlotSafety = api;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
