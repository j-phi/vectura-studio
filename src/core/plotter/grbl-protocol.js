/**
 * GrblProtocol: pure GRBL 1.1 line parsers, G-code word scanner and the
 * character-counting streamer used by the plotter controller (no DOM, no timers).
 */
(() => {
  const REALTIME = Object.freeze({
    STATUS: 0x3f, // ?
    HOLD: 0x21, // !
    RESUME: 0x7e, // ~
    RESET: 0x18, // Ctrl-X
    JOG_CANCEL: 0x85,
  });

  const ALARM_MESSAGES = {
    1: 'Hard limit triggered. Machine position is likely lost.',
    2: 'Soft limit alarm: the target is outside the machine travel.',
    3: 'Reset while in motion. Machine position may be lost.',
    4: 'Probe fail.',
    5: 'Probe fail.',
    6: 'Homing fail: reset during homing cycle.',
    7: 'Homing fail: safety door opened.',
    8: 'Homing fail: limit switch not cleared.',
    9: 'Homing fail: limit switch not found.',
    10: 'Limit switch engaged at startup.',
  };

  const ERROR_MESSAGES = {
    1: 'G-code letter not found.',
    2: 'Bad number format.',
    3: 'Invalid $ statement.',
    5: 'Homing is not enabled.',
    8: 'Not idle: command needs the machine to be idle.',
    9: 'Locked out during alarm or jog state. Unlock first.',
    11: 'Line overflow.',
    15: 'Jog target exceeds machine travel.',
    20: 'Unsupported or invalid G-code command.',
    22: 'Feed rate has not yet been set.',
    23: 'G-code command requires an integer value.',
    31: 'G92 requires at least one axis word.',
  };

  const describeAlarm = (code) => ALARM_MESSAGES[code] || ('Alarm ' + code + '.');
  const describeError = (code) => ERROR_MESSAGES[code] || ('Firmware error ' + code + '.');

  const num = (s) => {
    const v = parseFloat(s);
    return Number.isFinite(v) ? v : null;
  };

  const parseVec = (s) => {
    const parts = String(s).split(',').map(num);
    const out = { x: parts[0], y: parts[1], z: parts[2] };
    if (parts.length > 3) out.a = parts[3];
    return out;
  };

  const parseStatusBody = (inner) => {
    const parts = inner.split('|');
    const head = parts[0].split(':');
    const out = {
      type: 'status',
      state: head[0],
      subState: head.length > 1 ? head[1] : null,
      mpos: null, wpos: null, wco: null, fs: null, bf: null, pn: null, raw: '<' + inner + '>',
    };
    parts.slice(1).forEach((field) => {
      const idx = field.indexOf(':');
      if (idx < 0) return;
      const key = field.slice(0, idx);
      const val = field.slice(idx + 1);
      switch (key) {
        case 'MPos': out.mpos = parseVec(val); break;
        case 'WPos': out.wpos = parseVec(val); break;
        case 'WCO': out.wco = parseVec(val); break;
        case 'FS': {
          const a = val.split(',').map(num);
          out.fs = { feed: a[0], speed: a[1] };
          break;
        }
        case 'F': out.fs = { feed: num(val), speed: 0 }; break;
        case 'Bf': {
          const a = val.split(',').map(num);
          out.bf = { planner: a[0], rx: a[1] };
          break;
        }
        case 'Pn': out.pn = val; break;
        default: break;
      }
    });
    return out;
  };

  // Splits merged junk such as "ok<Idle|...>" into separate tokens.
  const splitMerged = (str) => {
    const out = [];
    let rest = String(str).trim();
    while (rest.length) {
      if (rest[0] === '<') {
        const end = rest.indexOf('>');
        if (end < 0) { out.push(rest); break; }
        out.push(rest.slice(0, end + 1));
        rest = rest.slice(end + 1).trim();
      } else if (/^ok(?=<|$)/i.test(rest)) {
        out.push('ok');
        rest = rest.slice(2).trim();
      } else {
        const lt = rest.indexOf('<');
        const gt = lt > 0 ? rest.indexOf('>', lt) : -1;
        if (lt > 0 && gt > lt) {
          // text followed directly by a status report (e.g. "[MSG:x]<Idle|..>")
          out.push(rest.slice(0, lt));
          rest = rest.slice(lt).trim();
        } else if (/ok$/i.test(rest) && /^<.*>ok$/i.test(rest)) {
          out.push(rest.slice(0, -2));
          out.push('ok');
          rest = '';
        } else {
          out.push(rest);
          rest = '';
        }
      }
    }
    return out;
  };

  const parseSingle = (raw) => {
    const s = String(raw).trim();
    if (!s) return { type: 'other', raw: s };
    if (s[0] === '<' && s.endsWith('>')) return parseStatusBody(s.slice(1, -1));
    if (/^ok$/i.test(s)) return { type: 'ok', raw: s };
    let m = /^error:\s*(\d+)/i.exec(s);
    if (m) {
      const code = parseInt(m[1], 10);
      return { type: 'error', code, message: describeError(code), raw: s };
    }
    m = /^ALARM:\s*(\d+)/i.exec(s);
    if (m) {
      const code = parseInt(m[1], 10);
      return { type: 'alarm', code, message: describeAlarm(code), raw: s };
    }
    if (/^grbl(hal)?\s/i.test(s) || /^grbl$/i.test(s)) {
      const vm = /^grbl(?:hal)?\s+([0-9][^\s\[]*)/i.exec(s);
      return { type: 'banner', version: vm ? vm[1] : null, text: s, raw: s };
    }
    m = /^\$(\d+)\s*=\s*(.*)$/.exec(s);
    if (m) {
      const v = num(m[2]);
      return { type: 'setting', id: parseInt(m[1], 10), value: v === null ? m[2] : v, raw: s };
    }
    m = /^\[([^:\]]*):?(.*)\]$/.exec(s);
    if (m) {
      const kind = m[1].toUpperCase();
      const out = { type: 'msg', kind, body: m[2], raw: s };
      if (kind === 'GC') out.modal = m[2].trim().split(/\s+/).filter(Boolean);
      if (kind === 'VER') out.ver = m[2].replace(/:$/, '').trim();
      if (kind === 'OPT') {
        const parts = m[2].split(',');
        out.opt = { flags: parts[0] || '', blocks: num(parts[1]), rxBuffer: num(parts[2]) };
      }
      return out;
    }
    return { type: 'other', raw: s };
  };

  // GRBL reports the serial RX buffer size as OPT field 3; usable bytes = size - 1.
  const usableRxBuffer = (profileRx, opt) => {
    const base = Number.isFinite(profileRx) ? profileRx : 127;
    return opt && Number.isFinite(opt.rxBuffer) && opt.rxBuffer > 16 ? Math.min(base, opt.rxBuffer - 1) : base;
  };

  const parseLines = (str) => splitMerged(str).map(parseSingle);

  const parseLine = (str) => {
    const toks = splitMerged(str);
    if (toks.length > 1) {
      const parsed = toks.map(parseSingle);
      const status = parsed.find((p) => p.type === 'status');
      if (status) {
        status.alsoOk = parsed.some((p) => p.type === 'ok');
        return status;
      }
      return parsed[0];
    }
    return parseSingle(toks.length ? toks[0] : str);
  };

  const parseSettings = (lines) => {
    const list = Array.isArray(lines) ? lines : String(lines || '').split(/\r?\n/);
    const out = {};
    list.forEach((l) => {
      const text = typeof l === 'string' ? l : (l && l.raw) || '';
      const m = /^\s*\$(\d+)\s*=\s*([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/.exec(text);
      if (m) out[parseInt(m[1], 10)] = parseFloat(m[2]);
    });
    return out;
  };

  // ---- G-code word scanner (used for bounds checks) ----
  const stripComments = (line) => {
    let s = String(line);
    const semi = s.indexOf(';');
    if (semi >= 0) s = s.slice(0, semi);
    return s.replace(/\([^)]*\)/g, '');
  };

  const scanGcode = (line) => {
    let text = stripComments(line).toUpperCase().replace(/\s+/g, '');
    const out = { text, jog: false, words: [], g: [], m: [], X: undefined, Y: undefined, Z: undefined, F: undefined, P: undefined, S: undefined, error: null };
    if (text.startsWith('$J=')) {
      out.jog = true;
      text = text.slice(3);
    } else if (text.startsWith('$')) {
      out.error = 'not a G-code line';
      return out;
    }
    const re = /^([A-Z])([-+]?(?:\d+\.?\d*|\.\d+))/;
    let rest = text;
    while (rest.length) {
      const m = re.exec(rest);
      if (!m) { out.error = 'could not parse "' + rest.slice(0, 12) + '"'; return out; }
      const letter = m[1];
      const value = parseFloat(m[2]);
      out.words.push({ letter, value });
      if (letter === 'G') out.g.push(value);
      else if (letter === 'M') out.m.push(value);
      else if (['X', 'Y', 'Z', 'F', 'P', 'S'].includes(letter)) out[letter] = value;
      rest = rest.slice(m[0].length);
    }
    return out;
  };

  const parseDwellSeconds = (line) => {
    const s = scanGcode(line);
    return !s.error && s.g.includes(4) && Number.isFinite(s.P) ? s.P : 0;
  };

  // ---- Character-counting streamer ----
  class CharCountingStreamer {
    constructor(opts) {
      const o = opts || {};
      if (typeof o.write !== 'function') throw new Error('CharCountingStreamer requires a write function');
      this.write = o.write;
      this.rxBuffer = o.rxBuffer || 127;
      this.maxLineLength = o.maxLineLength || 80;
      this.onProgress = o.onProgress || (() => {});
      this.onError = o.onError || (() => {});
      this.onBoundary = o.onBoundary || (() => {});
      this.onDone = o.onDone || (() => {});
      this.onLineSent = o.onLineSent || (() => {});
      this.queue = [];
      this.inFlight = [];
      this.bytesInFlight = 0;
      this.ackedIndex = -1;
      this.sentCount = 0;
      this.ackedCount = 0;
      this.totalEnqueued = 0;
      this.halted = false;
      this.cancelled = false;
      this.done = false;
      this._nextIndex = 0;
      this._boundaries = new Set();
      this._released = new Set();
      this._waitingBoundary = null;
      this._pumping = false;
      this._again = false;
    }

    get inFlightCount() { return this.inFlight.length; }

    // lines: strings (auto-indexed) or {text, index}
    enqueue(lines) {
      (lines || []).forEach((item) => {
        const isObj = item && typeof item === 'object';
        const raw = isObj ? item.text : item;
        const index = isObj && Number.isFinite(item.index) ? item.index : this._nextIndex;
        this._nextIndex = index + 1;
        const text = stripComments(raw == null ? '' : String(raw)).trim();
        if (!text) return; // blank / comment-only lines are never sent
        this.queue.push({ index, text, bytes: text.length + 1 });
        this.totalEnqueued += 1;
      });
      this.done = false;
      this.pump();
    }

    pauseAt(index) { this._boundaries.add(index); }

    releaseBoundary() {
      if (this._waitingBoundary !== null) {
        this._released.add(this._waitingBoundary);
        this._waitingBoundary = null;
      }
      this.pump();
    }

    isDrained() { return this.inFlight.length === 0; }

    isDone() { return this.queue.length === 0 && this.inFlight.length === 0; }

    _boundaryFor(entry) {
      let hit = null;
      this._boundaries.forEach((b) => {
        if (!this._released.has(b) && entry.index >= b && (hit === null || b < hit)) hit = b;
      });
      return hit;
    }

    pump() {
      if (this._pumping) { this._again = true; return; }
      this._pumping = true;
      try {
        do {
          this._again = false;
          while (!this.halted && !this.cancelled && this._waitingBoundary === null && this.queue.length) {
            const entry = this.queue[0];
            const boundary = this._boundaryFor(entry);
            if (boundary !== null) {
              if (this.inFlight.length) break;
              this._waitingBoundary = boundary;
              this.onBoundary(boundary);
              break;
            }
            if (entry.bytes > this.rxBuffer || entry.bytes > this.maxLineLength) {
              this.halted = true;
              this.onError({ code: 'line-too-long', index: entry.index, line: entry.text, message: 'Line is too long for the controller buffer.' });
              break;
            }
            if (this.bytesInFlight + entry.bytes > this.rxBuffer) break;
            this.queue.shift();
            this.inFlight.push(entry);
            this.bytesInFlight += entry.bytes;
            this.sentCount += 1;
            try {
              this.write(entry.text);
            } catch (err) {
              this.halted = true;
              this.onError({ code: 'write-failed', index: entry.index, line: entry.text, message: String((err && err.message) || err) });
              break;
            }
            this.onLineSent(entry);
          }
        } while (this._again);
      } finally {
        this._pumping = false;
      }
    }

    _ack(entry, error) {
      this.ackedCount += 1;
      this.ackedIndex = entry.index;
      if (error) {
        this.halted = true;
        this.onError({ code: error.code, index: entry.index, line: entry.text, message: error.message });
        return;
      }
      this.onProgress({
        ackedIndex: this.ackedIndex, sent: this.sentCount, acked: this.ackedCount,
        total: this.totalEnqueued, inFlight: this.inFlight.length,
      });
    }

    // Returns true when the response was consumed by an in-flight line.
    onResponse(parsed) {
      if (this.cancelled || !parsed || !this.inFlight.length) return false;
      if (parsed.type !== 'ok' && parsed.type !== 'error') return false;
      const entry = this.inFlight.shift();
      this.bytesInFlight -= entry.bytes;
      this._ack(entry, parsed.type === 'error' ? { code: parsed.code, message: parsed.message } : null);
      this._afterAck();
      return true;
    }

    // Used when an ok was lost (machine is idle but lines remain unacknowledged).
    forceAck(count) {
      let n = Number.isFinite(count) ? count : this.inFlight.length;
      const forced = [];
      while (n > 0 && this.inFlight.length && !this.cancelled) {
        const entry = this.inFlight.shift();
        this.bytesInFlight -= entry.bytes;
        forced.push(entry.index);
        this._ack(entry, null);
        n -= 1;
      }
      if (forced.length) this._afterAck();
      return forced;
    }

    _afterAck() {
      if (this.halted || this.cancelled) return;
      this.pump();
      if (!this.done && this.isDone()) {
        this.done = true;
        this.onDone({ ackedIndex: this.ackedIndex });
      }
    }

    cancel() {
      const info = {
        ackedIndex: this.ackedIndex,
        droppedUnsent: this.queue.length,
        droppedInFlight: this.inFlight.length,
      };
      this.cancelled = true;
      this.queue = [];
      this.inFlight = [];
      this.bytesInFlight = 0;
      this._waitingBoundary = null;
      return info;
    }
  }

  const api = {
    REALTIME, parseLine, parseLines, splitMerged, parseSettings, parseStatus: parseStatusBody,
    scanGcode, stripComments, parseDwellSeconds, usableRxBuffer, describeAlarm, describeError, CharCountingStreamer,
  };

  if (typeof window !== 'undefined') {
    const Vectura = (window.Vectura = window.Vectura || {});
    Vectura.GrblProtocol = api;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
