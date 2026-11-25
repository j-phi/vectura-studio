/**
 * PlotterTransports: WebSerialTransport (browser only) and SimulatorTransport
 * (in-memory GRBL 1.1 emulator used by the UI "Simulator" port, unit tests and e2e).
 * Both implement: isOpen, open(), close(), writeLine(str), writeRealtime(byte),
 * onLine(cb) -> unsubscribe, onDisconnect(cb) -> unsubscribe.
 * Nothing here ever opens a port unless open() is called by the controller.
 */
(() => {
  // ---- Clocks ----
  const defaultClock = () => ({
    now: () => Date.now(),
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (id) => clearTimeout(id),
    setInterval: (fn, ms) => setInterval(fn, ms),
    clearInterval: (id) => clearInterval(id),
  });

  const macrotask = () => new Promise((resolve) => {
    if (typeof setImmediate === 'function') setImmediate(resolve);
    else setTimeout(resolve, 0);
  });

  // Deterministic virtual clock for tests: advance() runs due timers in order and
  // lets promise continuations settle between timers.
  const createManualClock = (start) => {
    let nowMs = Number.isFinite(start) ? start : 0;
    let seq = 0;
    const timers = new Map();
    const clock = {
      now: () => nowMs,
      setTimeout(fn, ms) {
        seq += 1;
        timers.set(seq, { id: seq, fn, at: nowMs + Math.max(0, ms || 0), interval: 0 });
        return seq;
      },
      clearTimeout(id) { timers.delete(id); },
      setInterval(fn, ms) {
        seq += 1;
        const iv = Math.max(1, ms || 1);
        timers.set(seq, { id: seq, fn, at: nowMs + iv, interval: iv });
        return seq;
      },
      clearInterval(id) { timers.delete(id); },
      pendingTimers: () => timers.size,
      async flush() { await macrotask(); },
      async advance(ms) {
        const target = nowMs + Math.max(0, ms || 0);
        await macrotask();
        for (;;) {
          let next = null;
          timers.forEach((t) => {
            if (t.at <= target && (!next || t.at < next.at || (t.at === next.at && t.id < next.id))) next = t;
          });
          if (!next) break;
          nowMs = Math.max(nowMs, next.at);
          if (next.interval) next.at += next.interval; else timers.delete(next.id);
          next.fn();
          await macrotask();
        }
        nowMs = target;
        await macrotask();
      },
      // Advances virtual time until the promise settles (or maxMs elapses).
      async settle(promise, opts) {
        const o = opts || {};
        const stepMs = o.stepMs || 50;
        const maxMs = o.maxMs || 3600000;
        let done = false;
        let value; let error; let failed = false;
        Promise.resolve(promise).then((v) => { done = true; value = v; }, (e) => { done = true; failed = true; error = e; });
        let spent = 0;
        await macrotask();
        while (!done && spent < maxMs) {
          await clock.advance(stepMs);
          spent += stepMs;
        }
        if (!done) throw new Error('settle: promise still pending after ' + maxMs + ' virtual ms');
        if (failed) throw error;
        return value;
      },
    };
    return clock;
  };

  // ---- Web Serial ----
  class WebSerialTransport {
    constructor(opts) {
      const o = opts || {};
      this.profile = o.profile || null;
      this._serial = o.serial !== undefined ? o.serial
        : (typeof navigator !== 'undefined' && navigator && navigator.serial) || null;
      this.port = null;
      this._reader = null;
      this._writer = null;
      this._readLoop = null;
      this._lineCbs = new Set();
      this._discCbs = new Set();
      this._buffer = '';
      this._closing = false;
      this._open = false;
      this._onSerialDisconnect = null;
      this.label = 'USB serial';
    }

    static isSupported() {
      return typeof navigator !== 'undefined' && !!navigator && !!navigator.serial;
    }

    isSupported() { return !!this._serial; }

    get isOpen() { return this._open; }

    _filters() {
      const f = this.profile && this.profile.serial && this.profile.serial.filters;
      // Vendor-id-only filter: UUNATEK boards were seen with PID 0x7523 and 0x8040.
      if (Array.isArray(f) && f.length) {
        const vendors = [];
        f.forEach((x) => { if (x && x.usbVendorId !== undefined && !vendors.includes(x.usbVendorId)) vendors.push(x.usbVendorId); });
        if (vendors.length) return vendors.map((v) => ({ usbVendorId: v }));
      }
      return [{ usbVendorId: 0x1a86 }];
    }

    // Must be called from a user gesture. showAll lists every serial port.
    async requestPort(opts) {
      if (!this._serial) throw new Error('Web Serial is not available in this browser.');
      const showAll = !!(opts && opts.showAll);
      try {
        this.port = await this._serial.requestPort(showAll ? {} : { filters: this._filters() });
      } catch (err) {
        if (err && err.name === 'NotFoundError') return null; // dialog dismissed or no matching port
        throw err;
      }
      return this.port;
    }

    async getGrantedPorts() {
      if (!this._serial || typeof this._serial.getPorts !== 'function') return [];
      try { return await this._serial.getPorts(); } catch (err) { return []; }
    }

    usePort(port) { this.port = port || null; }

    async open() {
      if (this._open) return;
      if (!this._serial) throw new Error('Web Serial is not available in this browser.');
      if (!this.port) throw new Error('No serial port selected.');
      const ser = (this.profile && this.profile.serial) || {};
      await this.port.open({
        baudRate: ser.baudRate || 115200,
        dataBits: ser.dataBits || 8,
        stopBits: ser.stopBits || 1,
        parity: ser.parity || 'none',
        flowControl: 'none',
      });
      this._closing = false;
      this._buffer = '';
      this._open = true;
      this._reader = this.port.readable.getReader();
      this._writer = this.port.writable.getWriter();
      this._onSerialDisconnect = (event) => {
        const target = event && (event.target || event.port);
        if (!target || target === this.port) this._fatal('Serial device was unplugged.');
      };
      if (typeof this._serial.addEventListener === 'function') {
        this._serial.addEventListener('disconnect', this._onSerialDisconnect);
      }
      this._readLoop = this._runReadLoop();
    }

    async _runReadLoop() {
      const decoder = new TextDecoder();
      const reader = this._reader;
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value && value.length) this._ingest(decoder.decode(value, { stream: true }));
        }
        if (!this._closing) this._fatal('Serial port closed unexpectedly.');
      } catch (err) {
        if (!this._closing) this._fatal('Serial read error: ' + String((err && err.message) || err));
      }
    }

    _ingest(text) {
      this._buffer += text;
      const parts = this._buffer.split('\n');
      this._buffer = parts.pop();
      parts.forEach((p) => {
        const line = p.replace(/\r$/, '');
        if (!line.trim()) return;
        this._lineCbs.forEach((cb) => { try { cb(line); } catch (e) { /* listener errors must not break the read loop */ } });
      });
    }

    _fatal(reason) {
      if (!this._open) return;
      this._open = false;
      this._teardown().catch(() => {});
      this._discCbs.forEach((cb) => { try { cb(reason); } catch (e) { /* ignore */ } });
    }

    async _teardown() {
      if (this._serial && this._onSerialDisconnect && typeof this._serial.removeEventListener === 'function') {
        this._serial.removeEventListener('disconnect', this._onSerialDisconnect);
      }
      this._onSerialDisconnect = null;
      const reader = this._reader; const writer = this._writer; const loop = this._readLoop;
      this._reader = null; this._writer = null; this._readLoop = null;
      if (reader) {
        try { await reader.cancel(); } catch (e) { /* ignore */ }
        if (loop) { try { await loop; } catch (e) { /* ignore */ } }
        try { reader.releaseLock(); } catch (e) { /* ignore */ }
      }
      if (writer) { try { writer.releaseLock(); } catch (e) { /* ignore */ } }
      if (this.port) { try { await this.port.close(); } catch (e) { /* ignore */ } }
    }

    // reader.cancel() -> release locks -> port.close()
    async close() {
      this._closing = true;
      this._open = false;
      await this._teardown();
    }

    _write(bytes) {
      if (!this._open || !this._writer) throw new Error('Serial port is not open.');
      const p = this._writer.write(bytes);
      return Promise.resolve(p).catch((err) => {
        this._fatal('Serial write error: ' + String((err && err.message) || err));
        throw err;
      });
    }

    writeLine(str) {
      const ending = (this.profile && this.profile.serial && this.profile.serial.lineEnding) || '\n';
      return this._write(new TextEncoder().encode(String(str) + ending));
    }

    writeRealtime(byte) {
      const b = typeof byte === 'string' ? byte.charCodeAt(0) : byte;
      return this._write(new Uint8Array([b & 0xff]));
    }

    onLine(cb) { this._lineCbs.add(cb); return () => this._lineCbs.delete(cb); }

    onDisconnect(cb) { this._discCbs.add(cb); return () => this._discCbs.delete(cb); }
  }

  // ---- Simulator ----
  const DEFAULT_SETTINGS = { 130: 420, 131: 297, 132: 12, 110: 11000, 111: 11000, 112: 5000, 22: 0, 20: 1, 10: 1 };
  const SETTING_ORDER = [10, 20, 22, 110, 111, 112, 130, 131, 132];
  const PLANNER_SIZE = 15;
  const f3 = (n) => (Math.round(n * 1000) / 1000).toFixed(3);

  class SimulatorTransport {
    constructor(opts) {
      const o = opts || {};
      this.profile = o.profile || null;
      this.label = 'Simulator';
      this.speed = Number.isFinite(o.speed) && o.speed > 0 ? o.speed : 1;
      this.clock = o.clock || defaultClock();
      this.rxBuffer = o.rxBuffer || 127;
      this.plannerSize = o.plannerSize || PLANNER_SIZE;
      this.penThreshold = Number.isFinite(o.penThreshold) ? o.penThreshold : 1.0;
      // Emulate real status rounding: MPos/WPos each rounded independently; WCO skewed (e.g. {x:-0.001}).
      this.wcoSkew = o.wcoSkew || null;
      this.statusMode = o.statusMode || 'both'; // 'mpos' | 'wpos' | 'both'
      this.resetOnOpen = o.resetOnOpen !== false;
      this.bannerDelayMs = Number.isFinite(o.bannerDelayMs) ? o.bannerDelayMs : 1200;
      this.holdDecelMs = o.holdDecelMs || 0;
      this.bannerText = o.banner || "Grbl 1.1h DrawCore V2.12 ['$' for help]";
      this.verText = o.ver || '1.1h DrawCore V2.12.20240704:';
      this.settings = Object.assign({}, DEFAULT_SETTINGS, o.settings || {});
      if (this.profile && this.profile.workArea && !(o.settings && (o.settings[130] || o.settings[131]))) {
        this.settings[130] = this.profile.workArea.width;
        this.settings[131] = this.profile.workArea.height;
      }
      this._init = o.initialPosition || { x: 0, y: 0, z: 0 };
      this._lineCbs = new Set();
      this._discCbs = new Set();
      this._outbox = [];
      this._draining = false;
      this._open = false;
      this._everOpened = false;
      this._booting = false;
      this._log = [];
      this._trace = [];
      this._faults = [];
      this._stats = {
        linesReceived: 0, motionLines: 0, maxRxBytes: 0, overflowCount: 0, settingWrites: [],
        realtime: {}, maxFeedRequested: 0, droppedWhileBooting: 0,
      };
      this._powerOn();
    }

    get isOpen() { return this._open; }

    isSupported() { return true; }

    // ---- machine state ----
    _powerOn() {
      this.mpos = { x: this._init.x, y: this._init.y, z: this._init.z };
      this.offset = { x: 0, y: 0, z: 0 };
      this.modal = { distance: 'G90', feed: 0, spindle: 0, motion: 'G0' };
      this.planner = [];
      this.cur = null;
      this.curTimer = null;
      this.holding = false;
      this.holdPhase = 0;
      this.holdTimer = null;
      this.alarm = null;
      this.positionLost = false;
      this.parserPos = Object.assign({}, this.mpos);
      this.rx = [];
      this.rxBytes = 0;
      this.parserBlock = null;
      this.dwellTimer = null;
      this.wcoDirty = true;
      this.statusCount = 0;
    }

    _now() { return this.clock.now(); }

    _currentPos() {
      if (!this.cur) return Object.assign({}, this.mpos);
      const b = this.cur;
      const t = b.duration > 0 ? Math.min(1, Math.max(0, (this._now() - b.startedAt) / b.duration)) : 1;
      return {
        x: b.from.x + (b.to.x - b.from.x) * t,
        y: b.from.y + (b.to.y - b.from.y) * t,
        z: b.from.z + (b.to.z - b.from.z) * t,
      };
    }

    _record(from, to) {
      if (from.z < this.penThreshold || to.z < this.penThreshold) return;
      if (Math.abs(from.x - to.x) < 1e-9 && Math.abs(from.y - to.y) < 1e-9) return;
      this._trace.push({
        from: { x: from.x, y: from.y }, to: { x: to.x, y: to.y }, z: to.z,
        wco: { x: this.offset.x, y: this.offset.y, z: this.offset.z },
      });
    }

    _machineState() {
      if (this.alarm !== null) return 'Alarm';
      if (this.holding) return 'Hold:' + this.holdPhase;
      if (this.cur) return this.cur.jog ? 'Jog' : 'Run';
      if (this.planner.length) return this.planner[0].jog ? 'Jog' : 'Run';
      return 'Idle';
    }

    _kick() {
      if (this.cur || this.holding || this.alarm !== null || !this.planner.length || !this._open) return;
      const b = this.planner[0];
      b.startedAt = this._now();
      this.cur = b;
      this.curTimer = this.clock.setTimeout(() => this._finishCur(), b.duration);
    }

    _finishCur() {
      const b = this.cur;
      if (!b) return;
      this.curTimer = null;
      this._record(b.from, b.to);
      this.mpos = { x: b.to.x, y: b.to.y, z: b.to.z };
      this.planner.shift();
      this.cur = null;
      this._kick();
      this._unblock();
    }

    // Stops the executing block at its current position (hold / cancel / reset / alarm).
    _truncateCur(keepRemainder) {
      if (!this.cur) return;
      const b = this.cur;
      const pos = this._currentPos();
      this.clock.clearTimeout(this.curTimer);
      this.curTimer = null;
      this._record(b.from, pos);
      this.mpos = pos;
      this.cur = null;
      if (keepRemainder) {
        const rem = { from: pos, to: b.to, feed: b.feed, jog: b.jog };
        rem.duration = this._duration(rem.from, rem.to, rem.feed);
        this.planner[0] = rem;
      } else {
        this.planner.shift();
      }
    }

    _duration(from, to, feed) {
      const len = Math.sqrt((to.x - from.x) ** 2 + (to.y - from.y) ** 2 + (to.z - from.z) ** 2);
      return (len / (Math.max(1, feed) / 60)) * 1000 / this.speed;
    }

    _unblock() {
      const w = this.parserBlock;
      if (w === 'planner' && this.planner.length < this.plannerSize) this.parserBlock = null;
      else if (w === 'sync' && !this.cur && !this.planner.length) this.parserBlock = null;
      if (this.parserBlock === null) this._runParser();
    }

    // ---- IO ----
    _emit(line) { this._outbox.push({ line }); this._schedule(); }

    _schedule() {
      if (this._draining) return;
      this._draining = true;
      queueMicrotask(() => {
        this._draining = false;
        const items = this._outbox.splice(0);
        items.forEach((it) => {
          if (it.disconnect !== undefined) {
            this._discCbs.forEach((cb) => { try { cb(it.disconnect); } catch (e) { /* ignore */ } });
          } else {
            this._log.push({ t: this._now(), dir: 'out', type: 'line', data: it.line });
            this._lineCbs.forEach((cb) => { try { cb(it.line); } catch (e) { /* ignore */ } });
          }
        });
        if (this._outbox.length) this._schedule();
      });
    }

    async open() {
      if (this._open) return;
      this._open = true;
      if (this._everOpened && this.resetOnOpen) this._reset(false);
      this._everOpened = true;
      if (this.resetOnOpen) {
        // DTR toggles the board's reset: anything written before the banner is lost.
        this._booting = true;
        this.mpos = { x: this._init.x, y: this._init.y, z: this._init.z };
        this.offset = { x: 0, y: 0, z: 0 };
        this.parserPos = Object.assign({}, this.mpos);
        this.wcoDirty = true;
        this.clock.setTimeout(() => {
          if (!this._open) return;
          this._booting = false;
          this._emitBanner();
        }, this.bannerDelayMs);
      }
    }

    async close() {
      this._open = false;
      this._clearTimers();
      this._outbox.length = 0;
    }

    _clearTimers() {
      [this.curTimer, this.holdTimer, this.dwellTimer].forEach((t) => { if (t) this.clock.clearTimeout(t); });
      this.curTimer = null; this.holdTimer = null; this.dwellTimer = null;
    }

    _emitBanner() {
      this._emit(this.bannerText);
      if (this.alarm !== null) this._emit("[MSG:'$H'|'$X' to unlock]");
    }

    _disconnect(reason) {
      if (!this._open) return;
      this._open = false;
      this._clearTimers();
      // Motion in progress when the cable drops simply freezes here.
      if (this.cur) this._truncateCur(false);
      this.planner = [];
      this._outbox.push({ disconnect: reason || 'Simulated disconnect' });
      this._schedule();
    }

    onLine(cb) { this._lineCbs.add(cb); return () => this._lineCbs.delete(cb); }

    onDisconnect(cb) { this._discCbs.add(cb); return () => this._discCbs.delete(cb); }

    writeLine(str) {
      if (!this._open) throw new Error('Simulator port is not open.');
      const text = String(str);
      if (text.indexOf('\n') >= 0) throw new Error('writeLine takes a single line.');
      const bytes = text.length + 1;
      this._log.push({ t: this._now(), dir: 'in', type: 'line', data: text, bytes });
      if (this._booting) { this._stats.droppedWhileBooting += 1; return Promise.resolve(); }
      this._stats.linesReceived += 1;
      if (this.rxBytes + bytes > this.rxBuffer) {
        this._stats.overflowCount += 1;
        this._log.push({ t: this._now(), dir: 'in', type: 'overflow', data: text });
        return Promise.resolve();
      }
      const entry = { text, bytes, dropOk: false };
      this.rx.push(entry);
      this.rxBytes += bytes;
      if (this.rxBytes > this._stats.maxRxBytes) this._stats.maxRxBytes = this.rxBytes;
      if (!this._applyFaults(entry)) return Promise.resolve();
      this._runParser();
      return Promise.resolve();
    }

    writeRealtime(byte) {
      if (!this._open) throw new Error('Simulator port is not open.');
      const b = typeof byte === 'string' ? byte.charCodeAt(0) : byte;
      this._log.push({ t: this._now(), dir: 'in', type: 'realtime', data: b, char: String.fromCharCode(b) });
      if (this._booting) { this._stats.droppedWhileBooting += 1; return Promise.resolve(); }
      const key = '0x' + b.toString(16);
      this._stats.realtime[key] = (this._stats.realtime[key] || 0) + 1;
      if (b === 0x3f) this._emit(this._statusReport());
      else if (b === 0x21) this._hold();
      else if (b === 0x7e) this._resume();
      else if (b === 0x18) this._reset(true);
      else if (b === 0x85) this._jogCancel();
      return Promise.resolve();
    }

    // ---- faults ----
    injectFault(fault) {
      const f = Object.assign({ type: 'dropOk' }, fault || {});
      if (f.type === 'disconnect' && f.afterLines === undefined && !f.match) { this._disconnect('Simulated disconnect'); return; }
      if (f.type === 'alarm' && f.afterLines === undefined && !f.match) { this._raiseAlarm(f.code || 1); return; }
      f.remaining = Number.isFinite(f.afterLines) ? f.afterLines : 1;
      this._faults.push(f);
    }

    // Returns false when the line must not be processed (disconnected).
    _applyFaults(entry) {
      for (const f of this._faults.slice()) {
        if (f.match) {
          const re = f.match instanceof RegExp ? f.match : new RegExp(String(f.match));
          if (!re.test(entry.text)) continue;
        }
        f.remaining -= 1;
        if (f.remaining > 0) continue;
        this._faults.splice(this._faults.indexOf(f), 1);
        if (f.type === 'dropOk') entry.dropOk = true;
        else if (f.type === 'alarm') this._raiseAlarm(f.code || 1);
        else if (f.type === 'disconnect') { this._disconnect('Simulated disconnect'); return false; }
      }
      return true;
    }

    // ---- realtime ----
    _hold() {
      if (this.holding || this.alarm !== null) return;
      this.holding = true;
      if (this.cur) {
        this._truncateCur(true);
        if (this.holdDecelMs > 0) {
          this.holdPhase = 1;
          this.holdTimer = this.clock.setTimeout(() => { this.holdPhase = 0; this.holdTimer = null; }, this.holdDecelMs);
        } else this.holdPhase = 0;
      } else this.holdPhase = 0;
    }

    _resume() {
      if (!this.holding) return;
      if (this.holdTimer) { this.clock.clearTimeout(this.holdTimer); this.holdTimer = null; }
      this.holding = false;
      this.holdPhase = 0;
      this._kick();
    }

    _jogCancel() {
      const jogging = (this.cur && this.cur.jog) || (this.planner[0] && this.planner[0].jog);
      if (!jogging) return; // a missed/ignored cancel is exactly why the controller syncs with G4 P0
      if (this.cur) this._truncateCur(false);
      this.planner = this.planner.filter((b) => !b.jog);
      this.holding = false;
      this.parserPos = Object.assign({}, this.mpos);
      this._kick();
      this._unblock();
    }

    _reset(emitOutput) {
      const moving = !!this.cur || (this.holding && this.holdPhase === 1);
      if (this.cur) this._truncateCur(false);
      this._clearTimers();
      this.planner = [];
      this.holding = false;
      this.holdPhase = 0;
      this.rx = [];
      this.rxBytes = 0;
      this.parserBlock = null;
      this.modal = { distance: 'G90', feed: 0, spindle: 0, motion: 'G0' };
      this.offset = { x: 0, y: 0, z: 0 }; // G92 offsets are volatile
      this.wcoDirty = true;
      this.parserPos = Object.assign({}, this.mpos);
      this.alarm = null;
      if (moving) { this.alarm = 3; this.positionLost = true; }
      if (emitOutput) {
        this._emit(this.bannerText);
        if (this.alarm !== null) { this._emit('ALARM:' + this.alarm); this._emit("[MSG:Reset while in motion. Position unknown. '$X' to unlock]"); }
      }
    }

    _raiseAlarm(code) {
      if (this.cur) this._truncateCur(false);
      this.planner = [];
      this.holding = false;
      this.alarm = code;
      if (code === 1 || code === 3) this.positionLost = true;
      this.parserPos = Object.assign({}, this.mpos);
      this.parserBlock = null;
      this._emit('ALARM:' + code);
      this._runParser();
    }

    // ---- status ----
    _statusReport() {
      const pos = this._currentPos();
      const parts = [this._machineState()];
      const wpos = { x: pos.x - this.offset.x, y: pos.y - this.offset.y, z: pos.z - this.offset.z };
      if (this.statusMode !== 'wpos') parts.push('MPos:' + f3(pos.x) + ',' + f3(pos.y) + ',' + f3(pos.z));
      if (this.statusMode !== 'mpos') parts.push('WPos:' + f3(wpos.x) + ',' + f3(wpos.y) + ',' + f3(wpos.z));
      parts.push('Bf:' + (this.plannerSize - this.planner.length) + ',' + (this.rxBuffer - this.rxBytes));
      parts.push('FS:' + Math.round(this.cur ? this.cur.feed : 0) + ',0');
      if (this.wcoDirty || this.statusCount % 10 === 0) {
        const sk = this.wcoSkew || {};
        parts.push('WCO:' + f3(this.offset.x + (sk.x || 0)) + ',' + f3(this.offset.y + (sk.y || 0)) + ',' + f3(this.offset.z + (sk.z || 0)));
        this.wcoDirty = false;
      }
      this.statusCount += 1;
      return '<' + parts.join('|') + '>';
    }

    // ---- parser ----
    _respond(entry, resp) {
      if (resp === null) return;
      if (resp === 'ok' && entry.dropOk) { this._log.push({ t: this._now(), dir: 'out', type: 'dropped', data: 'ok' }); return; }
      this._emit(resp);
    }

    _runParser() {
      if (this._parsing || !this._open || this._booting) return;
      this._parsing = true;
      try {
        while (this.parserBlock === null && this.rx.length) {
          const entry = this.rx[0];
          const res = this._exec(entry);
          if (res.wait) { this.parserBlock = res.wait; break; }
          this.rx.shift();
          this.rxBytes -= entry.bytes;
          this._respond(entry, res.resp);
        }
      } finally {
        this._parsing = false;
      }
    }

    _exec(entry) {
      const raw = entry.text;
      const stripped = raw.replace(/;.*$/, '').replace(/\([^)]*\)/g, '').toUpperCase().replace(/\s+/g, '');
      if (!stripped) return { resp: 'ok' };
      if (stripped[0] === '$') return this._execDollar(entry, stripped);
      if (this.alarm !== null) return { resp: 'error:9' };
      return this._execGcode(entry, stripped, false);
    }

    _execDollar(entry, s) {
      const safeInAlarm = s === '$X' || s === '$$' || s === '$I' || s === '$G' || s === '$#' || s === '$N' || s === '$H';
      if (this.alarm !== null && !safeInAlarm) return { resp: 'error:9' };
      if (s === '$$') {
        const ids = Object.keys(this.settings).map(Number).sort((a, b) => a - b);
        const order = SETTING_ORDER.filter((i) => ids.includes(i)).concat(ids.filter((i) => !SETTING_ORDER.includes(i)));
        order.forEach((id) => this._emit('$' + id + '=' + f3(this.settings[id])));
        return { resp: 'ok' };
      }
      if (s === '$I') {
        this._emit('[VER:' + this.verText + ']');
        this._emit('[OPT:VZHDL,' + PLANNER_SIZE + ',128]');
        return { resp: 'ok' };
      }
      if (s === '$G') {
        this._emit('[GC:G0 G54 G17 G21 ' + this.modal.distance + ' G94 M5 M9 T0 F' + Math.round(this.modal.feed) + ' S0]');
        return { resp: 'ok' };
      }
      if (s === '$#') {
        ['G54', 'G55', 'G56', 'G57', 'G58', 'G59', 'G28', 'G30'].forEach((n) => this._emit('[' + n + ':0.000,0.000,0.000]'));
        this._emit('[G92:' + f3(this.offset.x) + ',' + f3(this.offset.y) + ',' + f3(this.offset.z) + ']');
        this._emit('[TLO:0.000]');
        return { resp: 'ok' };
      }
      if (s === '$N') return { resp: 'ok' };
      if (s === '$X') {
        if (this.alarm !== null) { this.alarm = null; this._emit('[MSG:Caution: Unlocked]'); }
        return { resp: 'ok' };
      }
      if (s === '$H') {
        if (this.settings[22] !== 1) return { resp: 'error:5' };
        if (this.cur || this.planner.length) return { wait: 'sync' };
        this.alarm = null;
        this.mpos = { x: 0, y: 0, z: 0 };
        this.parserPos = { x: 0, y: 0, z: 0 };
        this.positionLost = false;
        this.wcoDirty = true;
        return { resp: 'ok' };
      }
      if (s.startsWith('$J=')) return this._execGcode(entry, s.slice(3), true);
      const m = /^\$(\d+)=(.+)$/.exec(s);
      if (m) {
        if (this._machineState() !== 'Idle') return { resp: 'error:8' };
        const v = parseFloat(m[2]);
        if (!Number.isFinite(v)) return { resp: 'error:2' };
        this.settings[parseInt(m[1], 10)] = v;
        this._stats.settingWrites.push(entry.text);
        return { resp: 'ok' };
      }
      return { resp: 'error:3' }; // $RST, $SLP, $C, $N0=... and everything else
    }

    _execGcode(entry, s, jog) {
      const words = [];
      let rest = s;
      const re = /^([A-Z])([-+]?(?:\d+\.?\d*|\.\d+))/;
      while (rest.length) {
        const m = re.exec(rest);
        if (!m) return { resp: 'error:1' };
        words.push({ l: m[1], v: parseFloat(m[2]) });
        rest = rest.slice(m[0].length);
      }
      const gs = []; const ms = []; const axes = {};
      let F; let P; let hasAxis = false;
      for (const w of words) {
        if (w.l === 'G') gs.push(w.v);
        else if (w.l === 'M') ms.push(w.v);
        else if (w.l === 'F') F = w.v;
        else if (w.l === 'P') P = w.v;
        else if (w.l === 'S') { /* spindle speed accepted */ }
        else if (w.l === 'X' || w.l === 'Y' || w.l === 'Z') { axes[w.l.toLowerCase()] = w.v; hasAxis = true; }
        else if (w.l === 'N') { /* line number */ }
        else return { resp: 'error:20' };
      }
      const moveG = gs.filter((g) => g === 0 || g === 1);
      const isMotion = jog || ((hasAxis || moveG.length > 0) && !gs.includes(92));
      if (!entry.counted && (jog || (hasAxis && !gs.includes(92)) || moveG.length)) {
        entry.counted = true;
        this._stats.motionLines += 1;
      }

      let distance = this.modal.distance;
      let g53 = false;
      for (const g of gs) {
        if (g === 90) distance = 'G90';
        else if (g === 91) distance = 'G91';
        else if (g === 53) g53 = true;
        else if ([0, 1, 4, 17, 21, 54, 92, 92.1, 94, 90.1, 91.1].includes(g)) { /* handled below */ }
        else return { resp: 'error:20' };
      }
      for (const m of ms) if (![3, 4, 5].includes(m)) return { resp: 'error:20' };

      if (jog) {
        if (F === undefined) return { resp: 'error:22' };
        if (!hasAxis) return { resp: 'error:20' };
        const st = this._machineState();
        if (st !== 'Idle' && st !== 'Jog') return { resp: 'error:8' };
      }

      // Sync-requiring commands wait for the planner to drain without side effects.
      const needsSync = gs.includes(4) || gs.includes(92) || gs.includes(92.1) || ms.length > 0;
      if (!jog && needsSync && (this.cur || this.planner.length)) return { wait: 'sync' };

      // Soft-limit alarm waits for queued motion to finish (like GRBL), then alarms.
      let target = null;
      if (isMotion && hasAxis) {
        target = Object.assign({}, this.parserPos);
        ['x', 'y', 'z'].forEach((a) => {
          if (axes[a] === undefined) return;
          if (g53) target[a] = axes[a];
          else if (distance === 'G91') target[a] = this.parserPos[a] + axes[a];
          else target[a] = axes[a] + this.offset[a];
        });
        if (this.settings[20] === 1) {
          const out = target.x < -1e-6 || target.x > this.settings[130] + 1e-6
            || target.y < -1e-6 || target.y > this.settings[131] + 1e-6
            || target.z < -1e-6 || target.z > this.settings[132] + 1e-6;
          if (out) {
            if (jog) return { resp: 'error:15' };
            if (this.cur || this.planner.length) return { wait: 'sync' };
            this._raiseAlarm(2);
            return { resp: null };
          }
        }
      }

      const feed = F !== undefined ? F : this.modal.feed;
      if (target) {
        const zeroLen = Math.abs(target.x - this.parserPos.x) < 1e-9 && Math.abs(target.y - this.parserPos.y) < 1e-9 && Math.abs(target.z - this.parserPos.z) < 1e-9;
        const motionG = moveG.length ? (moveG[moveG.length - 1] === 0 ? 'G0' : 'G1') : this.modal.motion;
        const rapid = !jog && motionG === 'G0';
        if (!jog && !rapid && !(feed > 0) && !zeroLen) return { resp: 'error:22' };
        if (!zeroLen) {
          if (this.planner.length >= this.plannerSize) return { wait: 'planner' };
          let used = feed;
          if (rapid) used = Math.min(this.settings[110], this.settings[111]);
          if (feed > this._stats.maxFeedRequested && !rapid) this._stats.maxFeedRequested = feed;
          const xy = target.x !== this.parserPos.x || target.y !== this.parserPos.y;
          const cap = xy ? Math.min(this.settings[110], this.settings[111]) : this.settings[112];
          used = Math.min(used, cap);
          const block = { from: Object.assign({}, this.parserPos), to: target, feed: used, jog: !!jog };
          block.duration = this._duration(block.from, block.to, used);
          this.planner.push(block);
          this.parserPos = Object.assign({}, target);
          this._kick();
        }
      }
      if (!jog) {
        if (F !== undefined) this.modal.feed = F;
        this.modal.distance = distance;
        if (moveG.length) this.modal.motion = moveG[moveG.length - 1] === 0 ? 'G0' : 'G1';
        if (gs.includes(92.1)) { this.offset = { x: 0, y: 0, z: 0 }; this.wcoDirty = true; }
        if (gs.includes(92)) {
          if (!hasAxis) return { resp: 'error:31' };
          ['x', 'y', 'z'].forEach((a) => { if (axes[a] !== undefined) this.offset[a] = this.mpos[a] - axes[a]; });
          this.wcoDirty = true;
        }
        if (gs.includes(4)) {
          if (P === undefined || P < 0) return { resp: 'error:2' };
          if (P > 0 && !entry.dwellDone) {
            if (!entry.dwellStarted) {
              entry.dwellStarted = true;
              this.dwellTimer = this.clock.setTimeout(() => {
                this.dwellTimer = null;
                entry.dwellDone = true;
                this.parserBlock = null;
                this._runParser();
              }, (P * 1000) / this.speed);
            }
            return { wait: 'dwell' };
          }
        }
      }
      return { resp: 'ok' };
    }

    // ---- inspection ----
    getLog() { return this._log.slice(); }

    clearLog() { this._log.length = 0; }

    getStats() { return JSON.parse(JSON.stringify(this._stats)); }

    getState() { return this._machineState(); }

    getPosition() {
      const p = this._currentPos();
      return {
        mpos: p,
        wpos: { x: p.x - this.offset.x, y: p.y - this.offset.y, z: p.z - this.offset.z },
        wco: Object.assign({}, this.offset),
        positionLost: this.positionLost,
      };
    }

    // Pen-down segments; space 'work' (default, relative to G92 origin at draw time) or 'machine'.
    getTrace(opts) {
      const machine = opts && opts.space === 'machine';
      return this._trace.map((s) => (machine
        ? { from: Object.assign({}, s.from), to: Object.assign({}, s.to), z: s.z }
        : {
          from: { x: s.from.x - s.wco.x, y: s.from.y - s.wco.y },
          to: { x: s.to.x - s.wco.x, y: s.to.y - s.wco.y },
          z: s.z,
        }));
    }

    // Contiguous trace segments merged into polylines.
    getPolylines(opts) {
      const out = [];
      let cur = null;
      this.getTrace(opts).forEach((s) => {
        if (cur && Math.abs(cur[cur.length - 1].x - s.from.x) < 1e-6 && Math.abs(cur[cur.length - 1].y - s.from.y) < 1e-6) {
          cur.push({ x: s.to.x, y: s.to.y });
        } else {
          cur = [{ x: s.from.x, y: s.from.y }, { x: s.to.x, y: s.to.y }];
          out.push(cur);
        }
      });
      return out;
    }

    clearTrace() { this._trace.length = 0; }
  }

  const api = { WebSerialTransport, SimulatorTransport, createManualClock, defaultClock };

  if (typeof window !== 'undefined') {
    const Vectura = (window.Vectura = window.Vectura || {});
    Vectura.PlotterTransports = api;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
