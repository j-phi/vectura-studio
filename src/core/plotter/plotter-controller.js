/**
 * PlotterController: GRBL driver for Send to Plotter. Owns one transport, enforces
 * every rule of docs/plotter-send-spec.md section 2 (nothing is written unless
 * PlotSafety.classifyCommand allows it), streams jobs with character counting and
 * keeps a resume point. No DOM, no direct hardware access: all IO is the injected transport.
 */
(() => {
  const isNode = typeof module !== 'undefined' && module.exports && typeof require === 'function';
  const PS = () => (isNode ? require('./plot-safety.js') : window.Vectura.PlotSafety);
  const GP = () => (isNode ? require('./grbl-protocol.js') : window.Vectura.GrblProtocol);

  const RESET_MESSAGE = 'The plotter restarted; position and origin were lost. Re-set the origin before plotting.';
  const ACTIVE_JOB_STATES = ['running', 'paused', 'penChange'];
  const MANUAL_STATES = ['idle', 'jogging'];
  const PLANNER_BLOCKS = 15;
  const EPS = 1e-6;
  const CORNER_BOX_MM = 15;
  const CORNER_MESSAGE = 'Confirm the carriage was at its start corner when you connected. The plotter measures its limits from that point.';
  const WCO_TOLERANCE_MM = 0.05;
  const POSITION_MAX_AGE_MS = 500;
  const JOG_SEGMENT_S = 0.15;
  const JOG_MAX_LEAD_S = 0.3;
  const JOG_DEADMAN_MS = 350;
  const JOG_MAX_HOLD_MS = 8000;

  class PlotterError extends Error {
    constructor(code, message, details) {
      super(message);
      this.name = 'PlotterError';
      this.code = code;
      this.details = details || null;
    }
  }

  const fmt = (n) => String(Number((Math.round(n * 1000) / 1000).toFixed(3)));
  const defaultScheduler = () => ({
    now: () => Date.now(),
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (id) => clearTimeout(id),
    setInterval: (fn, ms) => setInterval(fn, ms),
    clearInterval: (id) => clearInterval(id),
  });

  class PlotterController {
    constructor(profile, transport, opts) {
      const o = opts || {};
      const v = PS().validateProfile(profile);
      if (!v.ok) throw new PlotterError('invalid-profile', 'Invalid plotter profile: ' + v.errors.join(' '), v);
      this.profile = profile;
      this.transport = transport;
      this.sch = o.scheduler || defaultScheduler();
      this.opts = Object.assign({
        statusIdleMs: 250, statusRunMs: 400, bannerTimeoutMs: 3000, handshakeTimeoutMs: 1500,
        commandTimeoutMs: 5000, stopHoldTimeoutMs: 3000, resetTimeoutMs: 3000, dropRecoveryMs: 1000,
        statusTimeoutMs: 5000, enforceSingleOwner: true,
      }, o);
      this._handlers = {};
      this.state = 'disconnected';
      this.fw = {};
      this.firmware = null;
      this.rxBuffer = (profile.serial && profile.serial.rxBuffer) || 127;
      this.status = null;
      this.wco = { x: 0, y: 0, z: 0 }; this._wcoPin = null; this.wcoVerified = null;
      this.originSet = false;
      this.originMachine = null;
      this.pen = { state: 'unknown', z: null };
      this.penMustRaise = false;
      this.resumePoint = null;
      this.lastError = null;
      this._phase = null;
      this._waiters = new Set();
      this._pending = null;
      this._cmdChain = Promise.resolve();
      this._job = null;
      this._lastJob = null;
      this._streamer = null;
      this._jogLoop = null;
      this._wcoPin = null;
      this.wcoVerified = null;
      this.machineCornerConfirmed = false;
      this._cornerCenter = { x: 0, y: 0 };
      this._lastJogTarget = null;
      this._pollTimer = null;
      this._lastStatusAt = 0;
      this._idleCount = 0;
      this._lastAckActivity = 0;
      this._unsubs = [];
      this._stopPromise = null;
    }

    // ---- events ----
    on(evt, fn) {
      (this._handlers[evt] = this._handlers[evt] || new Set()).add(fn);
      return () => this.off(evt, fn);
    }

    off(evt, fn) { if (this._handlers[evt]) this._handlers[evt].delete(fn); }

    emit(evt, payload) {
      (this._handlers[evt] ? Array.from(this._handlers[evt]) : []).forEach((fn) => {
        try { fn(payload); } catch (e) { /* listener errors must not break the controller */ }
      });
    }

    _log(dir, text) { this.emit('log', { dir, text }); }

    _setState(s) {
      if (s === this.state) return;
      const prev = this.state;
      this.state = s;
      this.emit('state', { state: s, prev });
    }

    getState() {
      return {
        state: this.state,
        machineState: this.status ? this.status.state : null,
        mpos: this.status ? this.status.mpos : null,
        wpos: this.status ? this.status.wpos : null,
        wco: Object.assign({}, this.wco),
        originSet: this.originSet,
        originMachine: this.originMachine ? Object.assign({}, this.originMachine) : null,
        pen: Object.assign({}, this.pen),
        settings: Object.assign({}, this.fw),
        firmware: this.firmware,
        resumePoint: this.resumePoint,
        workArea: this.getWorkArea(),
      };
    }

    getWorkArea() { return PS().effectiveWorkArea(this.profile, this.fw); }

    getResumePoint() { return this.resumePoint; }

    // ---- low level IO ----
    _open() { return !!(this.transport && this.transport.isOpen); }

    _tx(line, flags) {
      const f = flags || {};
      const c = PS().classifyCommand(line, {
        allowFirmwareWrites: !!f.allowFirmwareWrites, allowUnlock: !!f.allowUnlock, allowHoming: !!f.allowHoming,
      });
      if (!c.ok) {
        this._log('warn', 'Blocked: ' + line + ' (' + c.reason + ')');
        throw new PlotterError('blocked', c.reason, { line });
      }
      if (!this._open()) {
        this._onTransportFatal('The serial port is closed.');
        throw new PlotterError('not-connected', 'The plotter is not connected.');
      }
      this._lastAckActivity = this.sch.now();
      this._log('tx', line);
      let r;
      try { r = this.transport.writeLine(line); } catch (e) {
        this._onTransportFatal('Write failed: ' + String((e && e.message) || e));
        throw new PlotterError('not-connected', 'Write failed: ' + String((e && e.message) || e));
      }
      if (r && typeof r.catch === 'function') r.catch(() => {});
    }

    _txRealtime(byte) {
      const c = PS().classifyCommand(String.fromCharCode(byte), {});
      if (!c.ok || (c.kind !== 'realtime' && c.kind !== 'query')) throw new PlotterError('blocked', c.reason || 'Not a realtime command.');
      if (!this._open()) {
        this._onTransportFatal('The serial port is closed.');
        throw new PlotterError('not-connected', 'The plotter is not connected.');
      }
      let r;
      try { r = this.transport.writeRealtime(byte); } catch (e) {
        this._onTransportFatal('Write failed: ' + String((e && e.message) || e));
        throw new PlotterError('not-connected', 'Write failed.');
      }
      if (r && typeof r.catch === 'function') r.catch(() => {});
    }

    _await(kind, pred, timeoutMs, o) {
      const opts = o || {};
      return new Promise((resolve, reject) => {
        const w = { kind, pred, timer: null, poll: null };
        const done = () => {
          if (w.timer) this.sch.clearTimeout(w.timer);
          if (w.poll) this.sch.clearInterval(w.poll);
          this._waiters.delete(w);
        };
        w.finish = (v) => { done(); resolve(v); };
        w.fail = (e) => { done(); reject(e); };
        if (timeoutMs) w.timer = this.sch.setTimeout(() => w.fail(new PlotterError('timeout', 'Timed out waiting for ' + kind + '.')), timeoutMs);
        this._waiters.add(w);
        if (opts.pollMs) {
          w.poll = this.sch.setInterval(() => { try { this._txRealtime(GP().REALTIME.STATUS); } catch (e) { /* surfaced elsewhere */ } }, opts.pollMs);
        }
        if (opts.onStart) { try { opts.onStart(); } catch (e) { w.fail(e); } }
      });
    }

    _notify(kind, payload) {
      Array.from(this._waiters).forEach((w) => {
        if (w.kind === kind && w.pred(payload)) w.finish(payload);
      });
    }

    _failWaiters(err) { Array.from(this._waiters).forEach((w) => w.fail(err)); }

    _refreshStatus(timeoutMs) {
      return this._await('status', () => true, timeoutMs || 1500, {
        pollMs: 100, onStart: () => this._txRealtime(GP().REALTIME.STATUS),
      });
    }

    _waitStatus(pred, timeoutMs) {
      return this._await('status', pred, timeoutMs, { pollMs: 100, onStart: () => this._txRealtime(GP().REALTIME.STATUS) });
    }

    // One manual command at a time; resolves {ok, lines} on ok, rejects on error:N.
    _cmd(line, o) {
      if (this._estopBlock && !(o && o.stopSeq)) return Promise.reject(new PlotterError('stopped', 'Emergency stop: command refused.'));
      const p = this._cmdChain.then(() => this._cmdNow(line, o || {}));
      this._cmdChain = p.catch(() => {});
      return p;
    }

    _cmdNow(line, o) {
      return new Promise((resolve, reject) => {
        if (!this._open()) { reject(new PlotterError('not-connected', 'The plotter is not connected.')); return; }
        const timeoutMs = o.timeoutMs === null ? 0 : (o.timeoutMs || this.opts.commandTimeoutMs);
        const pend = { line, lines: [], timer: null };
        const finish = () => { if (pend.timer) this.sch.clearTimeout(pend.timer); if (this._pending === pend) this._pending = null; };
        pend.resolve = (v) => { finish(); resolve(v); };
        pend.reject = (e) => { finish(); reject(e); };
        if (timeoutMs) {
          pend.timer = this.sch.setTimeout(() => {
            if (o.tolerant) {
              this._log('warn', 'No ok for ' + line + '; continuing.');
              pend.resolve({ ok: true, lines: pend.lines, timedOut: true });
            } else {
              pend.reject(new PlotterError('timeout', 'Timed out waiting for the plotter to answer ' + line + '.'));
            }
          }, timeoutMs);
        }
        this._pending = pend;
        try { this._tx(line, o); } catch (e) { pend.reject(e); }
      });
    }

    _failPending(err) { if (this._pending) this._pending.reject(err); }

    _sync(timeoutMs) { return this._cmd('G4 P0', { timeoutMs: timeoutMs === undefined ? null : timeoutMs }); }

    // ---- incoming ----
    _onLine(raw) {
      GP().parseLines(raw).forEach((p) => this._handle(p));
    }

    _handle(p) {
      switch (p.type) {
        case 'ok':
        case 'error': this._onResponse(p); break;
        case 'status': this._onStatus(p); break;
        case 'alarm': this._onAlarm(p); break;
        case 'banner': this._onBanner(p); break;
        default:
          if (this._pending) this._pending.lines.push(p.raw);
          this._log('rx', p.raw);
      }
    }

    _onResponse(p) {
      this._lastAckActivity = this.sch.now();
      this._log('rx', p.raw);
      if (this._streamer && this._streamer.inFlightCount > 0) { this._streamer.onResponse(p); return; }
      if (this._pending) {
        if (p.type === 'ok') this._pending.resolve({ ok: true, lines: this._pending.lines });
        else this._pending.reject(new PlotterError('firmware-error', p.message, { code: p.code, line: this._pending.line }));
        return;
      }
      this._log('warn', 'Unexpected ' + p.raw);
    }

    _onStatus(p) {
      if (p.wco) {
        // A firmware whose status WCO omits the G92 offset must not override the offset we set and
        // the device confirmed via $#.
        const pin = this._wcoPin;
        const ignore = !!pin && this.wcoVerified !== false
          && (Math.abs(p.wco.x - pin.x) > WCO_TOLERANCE_MM || Math.abs(p.wco.y - pin.y) > WCO_TOLERANCE_MM);
        if (ignore) {
          if (!this._wcoIgnoredWarned) { this._wcoIgnoredWarned = true; this._log('warn', 'Status WCO disagrees with the confirmed G92 offset; ignoring it.'); }
        } else this.wco = { x: p.wco.x, y: p.wco.y, z: p.wco.z };
      }
      let mpos = p.mpos; let wpos = p.wpos;
      const w = this.wco;
      if (mpos && !wpos) wpos = { x: mpos.x - w.x, y: mpos.y - w.y, z: mpos.z - w.z };
      else if (wpos && !mpos) mpos = { x: wpos.x + w.x, y: wpos.y + w.y, z: wpos.z + w.z };
      this.status = { state: p.state, subState: p.subState, mpos, wpos, wco: Object.assign({}, w), fs: p.fs, bf: p.bf };
      this._lastStatusAt = this.sch.now();
      if (mpos && Number.isFinite(mpos.z)) {
        this.pen.z = mpos.z;
        if (mpos.z <= this.profile.pen.up + 0.05) this.pen.state = 'up';
      }
      this.emit('status', this.status);
      this._notify('status', this.status);
      if (this._phase) return;
      const ms = p.state;
      if (ms === 'Alarm' && (this.state === 'idle' || this.state === 'jogging')) {
        this._enterAlarm(this._alarmCode === undefined ? null : this._alarmCode, 'The controller is in an alarm state.');
      } else if (ms === 'Idle' && this.state === 'jogging' && !this._jogLoop && !this._pending) {
        this._lastJogTarget = null;
        this._setState('idle');
      } else if (ms === 'Idle' && this.state === 'alarm') {
        this._setState('idle');
      }
      this._checkDroppedAck(ms);
    }

    _maxDwellInFlight() {
      let m = 0;
      const lines = [];
      if (this._streamer) this._streamer.inFlight.forEach((e) => lines.push(e.text));
      if (this._pending) lines.push(this._pending.line);
      lines.forEach((l) => { m = Math.max(m, GP().parseDwellSeconds(l)); });
      return m;
    }

    // An ok that never arrives must not hang a job: Idle machine + unanswered lines = lost ok.
    _checkDroppedAck(ms) {
      if (ms === 'Idle') this._idleCount += 1; else this._idleCount = 0;
      const streaming = this._streamer && this._streamer.inFlightCount > 0;
      if (!streaming && !this._pending) return;
      const grace = Math.max(this.opts.dropRecoveryMs, this._maxDwellInFlight() * 1000 + 1500);
      if (this._idleCount < 2 || this.sch.now() - this._lastAckActivity < grace) return;
      this._log('warn', 'No ok received but the plotter is idle; recovering from a dropped acknowledgement.');
      this._lastAckActivity = this.sch.now();
      this._idleCount = 0;
      if (streaming) this._streamer.forceAck();
      else if (this._pending) this._pending.resolve({ ok: true, lines: this._pending.lines, recovered: true });
    }

    _onAlarm(p) {
      this._log('rx', p.raw);
      this._alarmCode = p.code;
      this._notify('alarm', p);
      if (this._phase === 'stopping' || this._phase === 'connecting') { this._stopAlarm = p.code; return; }
      this._enterAlarm(p.code, p.message);
    }

    _enterAlarm(code, message) {
      const already = this.state === 'alarm' && this._lastAlarmEmitted === code;
      this.penMustRaise = true;
      const rp = this._abortActive('alarm', message);
      this._failPending(new PlotterError('alarm', message || 'Alarm', { code }));
      this._setState('alarm');
      this._lastAlarmEmitted = code;
      if (!already) this.emit('alarm', { code, message, resumePoint: rp || this.resumePoint });
    }

    _onBanner(p) {
      this._log('rx', p.raw);
      this.firmware = Object.assign({}, this.firmware, { banner: p.raw, version: p.version });
      this._notify('banner', p);
      if (this._phase === 'connecting' || this._phase === 'stopping') return;
      // Banner mid-session: the board reset itself. Position and G92 origin are gone.
      const wasActive = ACTIVE_JOB_STATES.includes(this.state) || this.state === 'jogging' || this.state === 'stopping';
      this.originSet = false;
      this.originMachine = null;
      this.wco = { x: 0, y: 0, z: 0 }; this._wcoPin = null; this.wcoVerified = null;
      this.penMustRaise = true;
      this._unconfirmCorner({ x: 0, y: 0 });
      const rp = this._abortActive('reset', RESET_MESSAGE);
      this._failPending(new PlotterError('reset', RESET_MESSAGE));
      if (wasActive) this._setState('alarm');
      this.emit('reset', { message: RESET_MESSAGE, resumePoint: rp || this.resumePoint });
      this.emit('alarm', { code: null, reset: true, message: RESET_MESSAGE, resumePoint: rp || this.resumePoint });
    }

    _onTransportFatal(reason) {
      if (this.state === 'disconnected' || this._phase === 'closing') return;
      try { if (this._open()) this.transport.writeRealtime(GP().REALTIME.HOLD); } catch (e) { /* port already gone */ }
      this.penMustRaise = true;
      const rp = this._abortActive('disconnected', reason);
      this._stopPolling();
      this._stopJogLoop();
      const err = new PlotterError('disconnected', 'Plotter disconnected: ' + reason);
      this._failPending(err);
      this._failWaiters(err);
      this._unsubscribe();
      this._release();
      this.lastError = err.message;
      this._setState('disconnected');
      this.emit('error', { message: err.message, fatal: true, resumePoint: rp || this.resumePoint });
    }

    _fatalError(message) {
      try { if (this._open()) this.transport.writeRealtime(GP().REALTIME.HOLD); } catch (e) { /* ignore */ }
      this.penMustRaise = true;
      const rp = this._abortActive('error', message);
      this._failPending(new PlotterError('error', message));
      this.lastError = message;
      this._setState('error');
      this.emit('error', { message, fatal: false, resumePoint: rp || this.resumePoint });
    }

    _unsubscribe() { this._unsubs.splice(0).forEach((u) => { try { u(); } catch (e) { /* ignore */ } }); }

    _release() { if (PlotterController._active === this) PlotterController._active = null; }

    // ---- polling ----
    _pollInterval() {
      if (this.state === 'jogging') return Math.min(100, this.opts.statusRunMs);
      return ['running', 'paused', 'penChange', 'jogging', 'stopping'].includes(this.state) ? this.opts.statusRunMs : this.opts.statusIdleMs;
    }

    _startPolling() {
      this._stopPolling();
      this._lastStatusAt = this.sch.now();
      const tick = () => {
        this._pollTimer = null;
        if (!this._open() || this.state === 'disconnected') return;
        try { this._txRealtime(GP().REALTIME.STATUS); } catch (e) { return; }
        const busy = ['running', 'paused', 'penChange', 'jogging'].includes(this.state);
        if (busy && this.sch.now() - this._lastStatusAt > this.opts.statusTimeoutMs) {
          this._fatalError('The plotter stopped responding.');
        }
        this._pollTimer = this.sch.setTimeout(tick, this._pollInterval());
      };
      this._pollTimer = this.sch.setTimeout(tick, this._pollInterval());
    }

    _stopPolling() { if (this._pollTimer) { this.sch.clearTimeout(this._pollTimer); this._pollTimer = null; } }

    // ---- connect / disconnect ----
    async connect() {
      if (this.state !== 'disconnected' && this.state !== 'error') throw new PlotterError('already-connected', 'Already connected.');
      if (this.opts.enforceSingleOwner && PlotterController._active && PlotterController._active !== this) {
        throw new PlotterError('port-busy', 'Another plotter connection is already open in this tab.');
      }
      PlotterController._active = this;
      this._estopBlock = false;
      this._setState('connecting');
      this._phase = 'connecting';
      this.fw = {};
      try {
        this._unsubs.push(this.transport.onLine((l) => this._onLine(l)));
        this._unsubs.push(this.transport.onDisconnect((r) => this._onTransportFatal(String(r || 'port closed'))));
        const bannerP = this._await('banner', () => true, this.opts.bannerTimeoutMs);
        bannerP.catch(() => {});
        await this.transport.open();
        // Opening the port resets the board (DTR): send nothing until the banner arrives.
        let gotBanner = true;
        try { await bannerP; } catch (e) { gotBanner = false; }
        if (!gotBanner) {
          this._log('warn', 'No banner after opening the port; probing.');
          this._tx('');
        }
        const info = await this._cmd('$I', { timeoutMs: this.opts.handshakeTimeoutMs, tolerant: true });
        this._parseInfo(info.lines);
        const settings = await this._cmd('$$', { timeoutMs: this.opts.handshakeTimeoutMs, tolerant: true });
        this.fw = GP().parseSettings(settings.lines);
        if (!Object.keys(this.fw).length) this._log('warn', 'Could not read firmware settings; using profile limits.');
        await this._cmd('$G', { timeoutMs: this.opts.handshakeTimeoutMs, tolerant: true });
        let st = null;
        try { st = await this._refreshStatus(this.opts.handshakeTimeoutMs); } catch (e) { this._log('warn', 'No status report during handshake.'); }
        this.originSet = false;
        this.originMachine = null;
        this._wcoPin = null;
        this.wcoVerified = null;
        this._unconfirmCorner(st && st.mpos && Number.isFinite(st.mpos.x) && Number.isFinite(st.mpos.y) ? { x: st.mpos.x, y: st.mpos.y } : { x: 0, y: 0 });
        this.penMustRaise = !!(st && st.mpos && st.mpos.z > this.profile.pen.up + 0.05);
        this._phase = null;
        this._startPolling();
        if (st && st.state === 'Alarm') {
          this._enterAlarm(this._alarmCode === undefined ? null : this._alarmCode, 'The controller is in an alarm state.');
        } else this._setState('idle');
        return this.getState();
      } catch (err) {
        this._phase = 'closing';
        this._stopPolling();
        this._failWaiters(err);
        this._unsubscribe();
        try { await this.transport.close(); } catch (e) { /* ignore */ }
        this._release();
        this._phase = null;
        this.lastError = err.message;
        this._setState('disconnected');
        this.emit('error', { message: err.message, fatal: true });
        throw err;
      }
    }

    _parseInfo(lines) {
      const info = Object.assign({}, this.firmware);
      (lines || []).forEach((l) => {
        const p = GP().parseLine(l);
        if (p.type === 'msg' && p.kind === 'VER') info.ver = p.ver;
        if (p.type === 'msg' && p.kind === 'OPT') info.opt = p.opt;
      });
      this.firmware = info;
      this.rxBuffer = GP().usableRxBuffer(this.profile.serial && this.profile.serial.rxBuffer, info.opt);
    }

    async disconnect() {
      if (this.state === 'disconnected') return;
      this._phase = 'closing';
      if (ACTIVE_JOB_STATES.includes(this.state) || this.state === 'jogging') {
        try { this.transport.writeRealtime(this.state === 'jogging' ? GP().REALTIME.JOG_CANCEL : GP().REALTIME.HOLD); } catch (e) { /* ignore */ }
      }
      this.penMustRaise = true;
      this._abortActive('disconnected', 'Disconnected by user.');
      this._stopPolling();
      this._stopJogLoop();
      const err = new PlotterError('disconnected', 'Disconnected.');
      this._failPending(err);
      this._failWaiters(err);
      this._unsubscribe();
      try { await this.transport.close(); } catch (e) { /* ignore */ }
      this._release();
      this._phase = null;
      this.originSet = false;
      this._setState('disconnected');
    }

    // Synchronous, best effort: for pagehide / beforeunload.
    bestEffortHold() {
      try {
        if (!this._open()) return false;
        if (ACTIVE_JOB_STATES.includes(this.state)) this.transport.writeRealtime(GP().REALTIME.HOLD);
        else if (this.state === 'jogging') this.transport.writeRealtime(GP().REALTIME.JOG_CANCEL);
        else return false;
        return true;
      } catch (e) { return false; }
    }

    // ---- limits ----
    _limits() {
      const p = this.profile; const fw = this.fw; const S = PS();
      const area = S.effectiveWorkArea(p, fw);
      return {
        area,
        zLo: p.pen.zMin,
        zHi: S.clampZ(p.pen.zMax, p, fw),
        xyCap: S.feedCapInfo(p, fw).cap,
        zCap: Math.min(p.limits.maxFeedZ, fw[112] > 0 ? fw[112] : Infinity),
        jogCap: p.limits.maxJogFeed,
      };
    }

    // Machine-space limits: the area shrunk by limits.edgeMargin on every side, except on a side where the
    // work origin itself sits inside the margin (the origin and return-to-origin must stay reachable).
    _machineLimits() {
      const w = PS().workLimits(this.profile, this._limits().area, { x: this.wco.x, y: this.wco.y });
      return { loX: w.minX + this.wco.x, hiX: w.maxX + this.wco.x, loY: w.minY + this.wco.y, hiY: w.maxY + this.wco.y };
    }

    // Work-coordinate range of the corner-confirmation box (null once confirmed).
    _cornerRange() {
      if (this.machineCornerConfirmed) return null;
      const c = this._cornerCenter || { x: 0, y: 0 };
      return {
        minX: c.x - CORNER_BOX_MM - this.wco.x, maxX: c.x + CORNER_BOX_MM - this.wco.x,
        minY: c.y - CORNER_BOX_MM - this.wco.y, maxY: c.y + CORNER_BOX_MM - this.wco.y,
      };
    }

    // opts.noBox: the area limits only (moves that must be refused, not clamped, outside the box).
    _workRange(opts) {
      const l = this._machineLimits();
      const r = { minX: l.loX - this.wco.x, maxX: l.hiX - this.wco.x, minY: l.loY - this.wco.y, maxY: l.hiY - this.wco.y };
      const b = !(opts && opts.noBox) && this._cornerRange();
      if (b) {
        r.minX = Math.max(r.minX, b.minX); r.maxX = Math.min(r.maxX, b.maxX);
        r.minY = Math.max(r.minY, b.minY); r.maxY = Math.min(r.maxY, b.maxY);
      }
      return r;
    }

    _outsideCorner(x, y) {
      const b = this._cornerRange();
      if (!b) return false;
      const TOL = PS().BOUNDS_TOLERANCE_MM;
      return x < b.minX - TOL || x > b.maxX + TOL || y < b.minY - TOL || y > b.maxY + TOL;
    }

    confirmMachineCorner() {
      this.machineCornerConfirmed = true;
      this.emit('corner', { confirmed: true });
      return true;
    }

    _unconfirmCorner(center) {
      this.machineCornerConfirmed = false;
      this._cornerCenter = center || { x: 0, y: 0 };
      this.emit('corner', { confirmed: false });
    }

    // True while a job is parked at a pen change (buffer drained, Idle, waiting for the user).
    _inPenChange() {
      return this.state === 'penChange' && !!this._job && !!this._job.penWait && !this._job.penWait.continuing && !this._job.finished;
    }

    // penChangeOk: pen height and repositioning moves are allowed while parked at a pen change.
    _requireManual(what, penChangeOk) {
      if (penChangeOk && this._inPenChange()) return;
      if (this.state === 'alarm') throw new PlotterError('alarm', 'The plotter is in alarm. Unlock it before ' + what + '.');
      if (!MANUAL_STATES.includes(this.state)) {
        throw new PlotterError('busy', 'Cannot ' + what + ' while the plotter is ' + this.state + '.');
      }
    }

    // ---- pen ----
    _zFeed() { return PS().clampFeedZ(this.profile.pen.zFeed, this.profile, this.fw); }

    _penUpLine() {
      const pen = this.profile.pen;
      return pen.mechanism === 'z' ? 'G1 Z' + fmt(PS().clampZ(pen.up, this.profile, this.fw)) + ' F' + fmt(this._zFeed()) : pen.servoUp;
    }

    async _penUpRaw() {
      const pen = this.profile.pen;
      await this._cmd(this._penUpLine());
      if (pen.upDelay > 0) await this._cmd('G4 P' + fmt(pen.upDelay));
      await this._sync();
      this.pen = { state: 'up', z: pen.mechanism === 'z' ? pen.up : this.pen.z };
      this.penMustRaise = false;
    }

    async _raiseIfNeeded() { if (this.penMustRaise) await this._penUpRaw(); }

    // Enter 'jogging' unless parked at a pen change (the job state must not be left).
    _enterJogging() { if (!this._inPenChange()) this._setState('jogging'); }

    async penUp() { this._requireManual('raising the pen', true); await this._penUpRaw(); return this.pen; }

    async penDown() {
      this._requireManual('lowering the pen', true);
      const pen = this.profile.pen;
      if (pen.mechanism === 'z') {
        await this._cmd('G1 Z' + fmt(PS().clampZ(pen.down, this.profile, this.fw)) + ' F' + fmt(this._zFeed()));
      } else {
        await this._cmd(pen.servoDown);
      }
      if (pen.downDelay > 0) await this._cmd('G4 P' + fmt(pen.downDelay));
      await this._sync();
      this.pen = { state: 'down', z: pen.mechanism === 'z' ? pen.down : this.pen.z };
      return this.pen;
    }

    async setPenHeight(z) {
      this._requireManual('setting the pen height', true);
      if (this.profile.pen.mechanism !== 'z') throw new PlotterError('unsupported', 'This plotter has no Z-axis pen.');
      if (!Number.isFinite(z)) throw new PlotterError('invalid', 'Pen height must be a number.');
      const clamped = PS().clampZ(z, this.profile, this.fw);
      await this._cmd('G1 Z' + fmt(clamped) + ' F' + fmt(this._zFeed()));
      await this._sync();
      this.pen = { state: Math.abs(clamped - this.profile.pen.up) < 0.05 ? 'up' : 'down', z: clamped };
      if (this.pen.state === 'up') this.penMustRaise = false;
      return { z: clamped, clamped: Math.abs(clamped - z) > EPS };
    }

    // ---- position trust ----
    // Cross-check the G92 offset the device holds ($# [G92:x,y,z]) against the offset we set.
    // Disagreement beyond 0.05 mm blocks motion until the origin is set again.
    async refreshWco(expected) {
      const exp = expected || (this.originMachine ? { x: this.originMachine.x, y: this.originMachine.y } : { x: 0, y: 0 });
      let r;
      try { r = await this._cmd('$#', { timeoutMs: this.opts.handshakeTimeoutMs, tolerant: true }); } catch (e) { return { ok: null, reason: e.message }; }
      const line = (r.lines || []).find((l) => /^\[G92:/i.test(l));
      const m = line && /G92:\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)/i.exec(line);
      if (!m) { this.wcoVerified = null; return { ok: null, reason: 'no G92 report' }; }
      const dev = { x: parseFloat(m[1]), y: parseFloat(m[2]) };
      const ok = Math.abs(dev.x - exp.x) <= WCO_TOLERANCE_MM && Math.abs(dev.y - exp.y) <= WCO_TOLERANCE_MM;
      this.wcoVerified = ok;
      if (!ok) {
        this._log('warn', 'Work offset mismatch: the plotter reports G92 (' + fmt(dev.x) + ', ' + fmt(dev.y) + ') but (' + fmt(exp.x) + ', ' + fmt(exp.y) + ') was set. Set the origin again.');
        this.emit('wco-mismatch', { device: dev, expected: { x: exp.x, y: exp.y } });
      }
      return { ok, device: dev, expected: { x: exp.x, y: exp.y } };
    }

    // Motion that depends on the position estimate needs fresh, finite, verified numbers.
    _requireTrusted(what, st) {
      const s0 = st || this.status;
      const bad = (msg) => { throw new PlotterError('position-untrusted', 'Cannot ' + what + ': ' + msg); };
      if (this.wcoVerified === false) bad('the plotter disagrees about where the work origin is. Set the origin again.');
      if (!s0 || !s0.mpos || !s0.wpos) bad('no position report from the plotter yet.');
      if (this.sch.now() - this._lastStatusAt > POSITION_MAX_AGE_MS) bad('the position report is out of date.');
      ['x', 'y'].forEach((k) => {
        if (!Number.isFinite(s0.mpos[k]) || !Number.isFinite(s0.wpos[k])) bad('the position report is incomplete.');
      });
      return s0;
    }

    // ---- origin / moves ----
    async setOrigin() {
      this._requireManual('setting the origin');
      const st = await this._refreshStatus();
      if (st.state !== 'Idle') throw new PlotterError('busy', 'Wait for the plotter to stop moving before setting the origin.');
      await this._cmd('G92 X0 Y0');
      const area = this._limits().area;
      const om = { x: PS().snapMachineCoord(st.mpos.x, area.width), y: PS().snapMachineCoord(st.mpos.y, area.height) };
      this.originMachine = om;
      this.wco = { x: om.x, y: om.y, z: this.wco.z };
      this._wcoPin = { x: om.x, y: om.y };
      this.wcoVerified = null;
      this.originSet = true;
      await this.refreshWco({ x: st.mpos.x, y: st.mpos.y }).catch(() => null);
      await this._refreshStatus().catch(() => null);
      this.emit('origin', { machine: Object.assign({}, this.originMachine) });
      return Object.assign({}, this.originMachine);
    }

    async _moveTo(x, y, feed) {
      const r = this._workRange({ noBox: true });
      const TOL = PS().BOUNDS_TOLERANCE_MM;
      if (x < r.minX - TOL || x > r.maxX + TOL || y < r.minY - TOL || y > r.maxY + TOL) {
        throw new PlotterError('out-of-bounds', 'Target (' + fmt(x) + ', ' + fmt(y) + ') is outside the work area.');
      }
      x = Math.min(r.maxX, Math.max(r.minX, x)); // within tolerance: clamp to the edge
      y = Math.min(r.maxY, Math.max(r.minY, y));
      if (this._outsideCorner(x, y)) throw new PlotterError('corner-unconfirmed', CORNER_MESSAGE);
      await this._penUpRaw(); // pen up before any travel, always
      const f = PS().clampFeedXY(feed || this.profile.motion.travelFeed, this.profile, this.fw);
      this._enterJogging();
      try {
        await this._cmd('G1 X' + fmt(x) + ' Y' + fmt(y) + ' F' + fmt(f));
        await this._sync();
      } finally {
        if (this.state === 'jogging') this._setState('idle');
      }
    }

    // A single move never travels farther than the area diagonal.
    _capTravel(st, x, y) {
      const a = this._limits().area;
      const d = Math.hypot(x - st.wpos.x, y - st.wpos.y);
      if (d > Math.hypot(a.width, a.height) + PS().BOUNDS_TOLERANCE_MM) {
        throw new PlotterError('move-too-long', 'That move is longer than the plotter\'s work area diagonal; the position estimate looks wrong.');
      }
    }

    async goTo(x, y, feed) {
      this._requireManual('moving', true);
      if (!Number.isFinite(x) || !Number.isFinite(y)) throw new PlotterError('invalid', 'Target must be numbers.');
      const st = await this._refreshStatus().catch(() => null);
      this._requireTrusted('move', st);
      this._capTravel(st, x, y);
      await this._moveTo(x, y, feed);
    }

    async goToOrigin() {
      this._requireManual('moving', true);
      if (!this.originSet) throw new PlotterError('origin-not-set', 'Set the origin first.');
      const st = await this._refreshStatus().catch(() => null);
      this._requireTrusted('move', st);
      this._capTravel(st, 0, 0);
      await this._moveTo(0, 0);
    }

    // ---- jog ----
    _jogFeed(feed) {
      const f = PS().clampFeedXY(feed || this.profile.motion.jogFeed, this.profile, this.fw);
      return Math.min(f, this.profile.limits.maxJogFeed);
    }

    _clampTarget(base, dx, dy) {
      const r = this._workRange();
      const atLimit = { x: null, y: null, any: false };
      let tx = base.x + dx; let ty = base.y + dy;
      if (tx < r.minX) { tx = r.minX; atLimit.x = 'min'; } else if (tx > r.maxX) { tx = r.maxX; atLimit.x = 'max'; }
      if (ty < r.minY) { ty = r.minY; atLimit.y = 'min'; } else if (ty > r.maxY) { ty = r.maxY; atLimit.y = 'max'; }
      atLimit.any = !!(atLimit.x || atLimit.y);
      return { x: tx, y: ty, atLimit };
    }

    // Relative jog ($J=G21G91): the vector is bounded by the request, whatever the WCO estimate says.
    // `end` is the estimated end point, kept only to tell when the move has finished.
    async _sendJogRel(vx, vy, feed, end) {
      const mag = Math.hypot(vx, vy);
      if (!Number.isFinite(mag)) throw new PlotterError('position-untrusted', 'Jog vector is not a number.');
      let line = '$J=G21G91';
      if (Math.abs(vx) > 5e-4) line += 'X' + fmt(vx);
      if (Math.abs(vy) > 5e-4) line += 'Y' + fmt(vy);
      line += 'F' + fmt(feed);
      await this._cmd(line);
      this._lastJogTarget = end ? { x: end.x, y: end.y } : null;
    }

    // At most one single jog in flight (command round trip plus the motion itself): further
    // calls are dropped so key auto-repeat can never queue travel ahead of the carriage.
    async jog(dx, dy, feed) {
      this._requireManual('jogging', true);
      if (!Number.isFinite(dx) || !Number.isFinite(dy)) throw new PlotterError('invalid', 'Jog distances must be numbers.');
      if (this._jogBusy || (this.state === 'jogging' && !this._jogLoop && this._lastJogTarget)) {
        return { sent: false, reason: 'busy', target: null, atLimit: { x: null, y: null, any: false }, feed: null };
      }
      this._jogBusy = true;
      try {
        await this._raiseIfNeeded();
        const st = this._requireTrusted('jog', await this._refreshStatus());
        const base = st.wpos;
        const t = this._clampTarget(base, dx, dy);
        const f = this._jogFeed(feed);
        const vx = t.x - base.x; const vy = t.y - base.y; // per-axis shrink only: never longer than asked
        const moved = Math.abs(vx) > 5e-4 || Math.abs(vy) > 5e-4;
        if (moved) {
          this._enterJogging();
          await this._sendJogRel(vx, vy, f, t);
        }
        return { sent: moved, target: { x: t.x, y: t.y }, atLimit: t.atLimit, feed: f };
      } finally { this._jogBusy = false; }
    }

    // Press-and-hold jog. Segments are 0.15 s of travel; the commanded target never leads the
    // reported position by more than 0.3 s. Deadman: the UI must call handle.keepAlive() at least
    // every 350 ms or the hold is cancelled; hard cap of 8 s per hold.
    async jogContinuousStart(dir, feed) {
      this._requireManual('jogging', true);
      const mag = Math.hypot(dir.x || 0, dir.y || 0);
      if (!mag) throw new PlotterError('invalid', 'Jog direction is zero.');
      await this._raiseIfNeeded();
      this._stopJogLoop();
      const st = this._requireTrusted('jog', await this._refreshStatus());
      const f = this._jogFeed(feed);
      const mmPerS = f / 60;
      const seg = mmPerS * JOG_SEGMENT_S;
      const maxLead = mmPerS * JOG_MAX_LEAD_S;
      const u = { x: dir.x / mag, y: dir.y / mag };
      const loop = { dir: u, target: { x: st.wpos.x, y: st.wpos.y }, busy: false, timer: null, stopped: false, deadman: null, maxTimer: null };
      this._jogLoop = loop;
      this._enterJogging();
      this._startPolling(); // 100 ms status while jogging
      const stopFor = (reason) => {
        if (loop.stopped || this._jogLoop !== loop) return;
        this.emit('jogstop', { reason });
        this.jogCancel().catch(() => {});
      };
      const keepAlive = () => {
        if (loop.stopped) return;
        if (loop.deadman) this.sch.clearTimeout(loop.deadman);
        loop.deadman = this.sch.setTimeout(() => stopFor('deadman'), JOG_DEADMAN_MS);
      };
      keepAlive();
      loop.maxTimer = this.sch.setTimeout(() => stopFor('max-hold'), JOG_MAX_HOLD_MS);
      const tick = async () => {
        if (loop.busy || loop.stopped) return;
        loop.busy = true;
        try {
          const s2 = this.status && this.status.wpos;
          if (!s2 || this.sch.now() - this._lastStatusAt > 300) return; // stale position: do not lead blindly
          if (this.sch.now() - this._lastStatusAt > POSITION_MAX_AGE_MS || !Number.isFinite(s2.x) || !Number.isFinite(s2.y) || this.wcoVerified === false) {
            stopFor('untrusted'); return;
          }
          let lead = (loop.target.x - s2.x) * u.x + (loop.target.y - s2.y) * u.y;
          if (lead < 0) { loop.target = { x: s2.x, y: s2.y }; lead = 0; }
          if (lead + seg > maxLead + 1e-9) return;
          const t = this._clampTarget(loop.target, u.x * seg, u.y * seg);
          const moved = Math.abs(t.x - loop.target.x) > 5e-4 || Math.abs(t.y - loop.target.y) > 5e-4;
          if (moved && !loop.stopped) {
            const prev = loop.target;
            loop.target = { x: t.x, y: t.y };
            await this._sendJogRel(t.x - prev.x, t.y - prev.y, f, t);
          }
          if (t.atLimit.any) {
            this.emit('limit', { atLimit: t.atLimit });
            this._stopJogLoop();
          }
        } catch (e) {
          this._stopJogLoop();
        } finally { loop.busy = false; }
      };
      loop.timer = this.sch.setInterval(tick, 50);
      tick();
      return { feed: f, keepAlive, stop: () => this.jogCancel() };
    }

    _stopJogLoop() {
      const loop = this._jogLoop;
      if (!loop) return;
      loop.stopped = true;
      if (loop.timer) this.sch.clearInterval(loop.timer);
      if (loop.deadman) this.sch.clearTimeout(loop.deadman);
      if (loop.maxTimer) this.sch.clearTimeout(loop.maxTimer);
      this._jogLoop = null;
    }

    // 0x85, then G4 P0 and wait for its ok (0x85 can be missed when jogs are queued).
    async jogCancel() {
      this._stopJogLoop();
      if (!this._open() || (this.state !== 'jogging' && !this._lastJogTarget)) return false;
      this._txRealtime(GP().REALTIME.JOG_CANCEL);
      try { await this._sync(this.opts.commandTimeoutMs); } catch (e) { this._log('warn', 'Jog cancel sync failed: ' + e.message); }
      this._lastJogTarget = null;
      if (this.state === 'jogging') this._setState('idle');
      return true;
    }

    jogContinuousStop() { return this.jogCancel(); }

    // ---- unlock / home ----
    async unlock() {
      if (!['alarm', 'idle', 'error'].includes(this.state)) throw new PlotterError('busy', 'Cannot unlock while ' + this.state + '.');
      await this._cmd('$X', { allowUnlock: true });
      const st = await this._refreshStatus().catch(() => null);
      this._alarmCode = undefined;
      this._lastAlarmEmitted = undefined;
      if (this.originSet && st && st.wco && this.originMachine
        && (Math.abs(st.wco.x - this.originMachine.x) > 1e-3 || Math.abs(st.wco.y - this.originMachine.y) > 1e-3)) {
        this.originSet = false;
        this._log('warn', 'The work origin was lost during the alarm. Re-set the origin.');
      }
      this._setState('idle');
      if (this.penMustRaise) await this._penUpRaw();
      return this.getState();
    }

    async home(o) {
      const opts = o || {};
      if (this.fw[22] !== 1) throw new PlotterError('homing-disabled', 'Homing is disabled: the plotter does not report homing switches ($22=1).');
      if (opts.confirm !== true) throw new PlotterError('confirm-required', 'Homing needs explicit confirmation.');
      if (!['idle', 'alarm'].includes(this.state)) throw new PlotterError('busy', 'Cannot home while ' + this.state + '.');
      await this._cmd('$H', { allowHoming: true, timeoutMs: 180000 });
      this.originSet = false;
      this.originMachine = null;
      this.wco = { x: 0, y: 0, z: 0 }; this._wcoPin = null; this.wcoVerified = null;
      await this._refreshStatus().catch(() => null);
      this._setState('idle');
    }

    // ---- job validation ----
    _boundsMessage(b) {
      const parts = [];
      ['left', 'right', 'top', 'bottom'].forEach((k) => { if (b.overflow[k] > 0) parts.push(k + ' ' + fmt(b.overflow[k]) + ' mm'); });
      return 'The job extends beyond the work area (' + parts.join(', ') + ').';
    }

    _validateGcode(entries) {
      const L = this._limits();
      const S = PS(); const G = GP();
      const cur = this.status && this.status.wpos ? { x: this.status.wpos.x, y: this.status.wpos.y, z: this.status.wpos.z } : { x: 0, y: 0, z: 0 };
      const points = [];
      let modalF = 0;
      const WHY = {
        0: 'G0 runs at maximum rate; jobs use G1 with a feed', 2: 'arcs are not supported', 3: 'arcs are not supported',
        20: 'inches are not supported', 91: 'relative moves are not allowed in jobs',
        92: 'jobs must not change the origin', 92.1: 'jobs must not change the origin',
      };
      for (const e of entries) {
        const n = 'Line ' + (e.index + 1);
        const c = S.classifyCommand(e.text, {});
        if (!c.ok) return { ok: false, code: 'blocked', reason: n + ' is not allowed: ' + c.reason };
        if (/^\s*\$/.test(e.text)) return { ok: false, code: 'blocked', reason: n + ': $ commands are not allowed inside a job.' };
        const sc = G.scanGcode(e.text);
        if (sc.error) return { ok: false, code: 'blocked', reason: n + ': ' + sc.error };
        const bad = sc.g.find((g) => WHY[g] !== undefined);
        if (bad !== undefined) return { ok: false, code: 'blocked', reason: n + ': G' + bad + ' refused (' + WHY[bad] + ').' };
        const hasXY = sc.X !== undefined || sc.Y !== undefined;
        const hasZ = sc.Z !== undefined;
        if (sc.F !== undefined) {
          if (!(sc.F > 0) || sc.F > Math.max(L.xyCap, L.zCap) + EPS) return { ok: false, code: 'feed', reason: n + ': feed F' + fmt(sc.F) + ' exceeds the limit.' };
          modalF = sc.F;
        }
        if (hasXY || hasZ) {
          const cap = hasXY && hasZ ? Math.min(L.xyCap, L.zCap) : (hasXY ? L.xyCap : L.zCap);
          if (modalF > cap + EPS) return { ok: false, code: 'feed', reason: n + ': feed F' + fmt(modalF) + ' exceeds the ' + fmt(cap) + ' mm/min limit.' };
          const g53 = sc.g.includes(53);
          if (sc.X !== undefined) cur.x = g53 ? sc.X - this.wco.x : sc.X;
          if (sc.Y !== undefined) cur.y = g53 ? sc.Y - this.wco.y : sc.Y;
          if (hasZ) {
            cur.z = g53 ? sc.Z - this.wco.z : sc.Z;
            const zm = cur.z + this.wco.z;
            if (zm < L.zLo - EPS || zm > L.zHi + EPS) {
              return { ok: false, code: 'z-range', reason: n + ': Z' + fmt(zm) + ' is outside the pen range ' + fmt(L.zLo) + '..' + fmt(L.zHi) + ' mm.' };
            }
          }
          if (hasXY) points.push({ x: cur.x, y: cur.y });
        }
      }
      const jobPens = { pens: [{ paths: [points] }] };
      const b = S.checkJobBounds(jobPens, L.area, { originOffset: { x: this.wco.x, y: this.wco.y }, limits: this._workRange({ noBox: true }) });
      if (!b.ok) return { ok: false, code: 'out-of-bounds', reason: this._boundsMessage(b), overflow: b.overflow, bbox: b.bbox };
      const box = this._cornerRange();
      if (box && !S.checkJobBounds(jobPens, L.area, { limits: box }).ok) return { ok: false, code: 'corner-unconfirmed', reason: CORNER_MESSAGE, bbox: b.bbox };
      return { ok: true, bbox: b.bbox };
    }

    // ---- job run ----
    _pathOfLine(line) {
      const ps = (this._job && this._job.gcode.pathStartIndices) || [];
      let idx = 0;
      for (let i = 0; i < ps.length; i += 1) if (ps[i] <= line) idx = i;
      return idx;
    }

    _computeResumePoint() {
      const job = this._job;
      if (!job) return null;
      const ps = job.gcode.pathStartIndices || [];
      if (!ps.length) return null;
      const bf = this.status && this.status.bf;
      const used = bf && Number.isFinite(bf.planner) ? Math.max(0, PLANNER_BLOCKS - bf.planner) : PLANNER_BLOCKS;
      // acked lines run ahead of executed lines by up to the queued planner blocks: rewind conservatively
      const safeLine = job.ackedLine - used - 2;
      const idx = safeLine < ps[0] ? 0 : this._pathOfLine(safeLine);
      return { pathIndex: idx, lineIndex: ps[idx], ackedLine: job.ackedLine, pathCount: ps.length };
    }

    // Tears down the active job (if any); returns the resume point.
    _abortActive(status, message) {
      this._stopJogLoop();
      const job = this._job;
      if (!job) return null;
      const rp = this._computeResumePoint();
      this.resumePoint = rp;
      job.finished = true;
      if (this._streamer) this._streamer.cancel();
      this._streamer = null;
      if (job.penWait) { job.penWait.reject(new PlotterError('aborted', 'Job aborted.')); job.penWait = null; }
      this._job = null;
      job.resolve({ status, message, resumePoint: rp });
      return rp;
    }

    async run(gcode, o) {
      const opts = o || {};
      const lines = gcode && gcode.lines;
      if (!Array.isArray(lines) || !lines.length) throw new PlotterError('invalid', 'There is no G-code to send.');
      if (this.state === 'disconnected' || this.state === 'connecting') throw new PlotterError('not-connected', 'Connect to the plotter first.');
      if (this.state !== 'idle') throw new PlotterError('busy', 'The plotter must be idle to start a job (it is ' + this.state + ').');
      if (!this.originSet && !opts.useMachineZero) throw new PlotterError('origin-not-set', 'Set the origin before plotting (or choose to use machine zero).');
      const ps = gcode.pathStartIndices || [];
      const startPath = opts.startPath || 0;
      if (startPath > 0 && startPath >= ps.length) throw new PlotterError('invalid', 'Start path ' + startPath + ' does not exist.');
      const st = await this._refreshStatus();
      if (st.state !== 'Idle') throw new PlotterError('busy', 'The plotter is not idle (' + st.state + ').');
      this._requireTrusted('start the job', st);
      if (this.state !== 'idle') throw new PlotterError('busy', 'The plotter must be idle to start a job.');

      const all = lines.map((text, index) => ({ text, index }));
      let entries = all;
      let startLine = 0;
      if (startPath > 0) {
        startLine = ps[startPath];
        // preamble + pen up, then straight to the travel move of the chosen path
        entries = all.slice(0, ps[0]).concat([{ text: this._penUpLine(), index: -1 }], all.slice(startLine));
      }
      const v = this._validateGcode(entries);
      if (!v.ok) { this._log('warn', 'Job refused: ' + v.reason); throw new PlotterError(v.code, v.reason, v); }

      await this._raiseIfNeeded();
      const job = {
        gcode, opts, startLine, ackedLine: startLine - 1, finished: false, penWait: null, startedAt: this.sch.now(), penOrdinal: 0,
      };
      job.promise = new Promise((resolve) => { job.resolve = resolve; });
      this._job = job;
      this._lastJob = { gcode, opts };
      this.resumePoint = null;
      this._idleCount = 0;
      this._lastAckActivity = this.sch.now();
      this._setState('running');

      const streamer = new (GP().CharCountingStreamer)({
        write: (t) => this._tx(t),
        rxBuffer: this.rxBuffer || 127,
        onProgress: (p) => this._onJobProgress(job, p),
        onError: (e) => this._onStreamError(job, e),
        onBoundary: (idx) => this._onBoundary(job, idx),
        onDone: () => this._onStreamDone(job),
      });
      this._streamer = streamer;
      if (opts.penChange !== 'continue') {
        (gcode.penChangeIndices || []).forEach((i) => { if (i > startLine) streamer.pauseAt(i); });
      }
      streamer.enqueue(entries.map((e) => ({ text: e.text, index: e.index < 0 ? startLine - 1 : e.index })));
      return job.promise;
    }

    _onJobProgress(job, p) {
      if (job.finished) return;
      job.ackedLine = Math.max(job.ackedLine, p.ackedIndex);
      const ps = job.gcode.pathStartIndices || [];
      const total = job.gcode.lines.length;
      this.emit('progress', {
        ackedLine: job.ackedLine, sentLines: p.sent, totalLines: total,
        pathIndex: this._pathOfLine(job.ackedLine), pathCount: ps.length || job.gcode.pathCount || 0,
        percent: total ? Math.min(100, Math.round(((job.ackedLine + 1) / total) * 100)) : 100,
        penOrdinal: job.penOrdinal,
      });
    }

    _onStreamError(job, e) {
      if (job.finished) return;
      const message = typeof e.code === 'number'
        ? 'The plotter rejected line ' + (e.index + 1) + ' (' + e.line + '): ' + e.message
        : 'Job stopped: ' + e.message;
      this._log('warn', message);
      this.lastError = message;
      this._safeStop({ status: 'error', message, errorEvent: { message, fatal: false, line: e.line, index: e.index } }).catch(() => {});
    }

    async _onBoundary(job, index) {
      if (job.finished) return;
      this._setState('penChange');
      job.penOrdinal += 1;
      try {
        await this._penUpRaw();
        const pos = job.opts.penChangePosition;
        const target = pos && typeof pos === 'object' ? { x: pos.x, y: pos.y } : { x: 0, y: 0 };
        await this._refreshStatus().catch(() => null);
        if (job.finished) return;
        const r = this._workRange({ noBox: true });
        const TOL = PS().BOUNDS_TOLERANCE_MM;
        if (target.x < r.minX - TOL || target.x > r.maxX + TOL || target.y < r.minY - TOL || target.y > r.maxY + TOL) {
          throw new PlotterError('out-of-bounds', 'The pen-change position is outside the work area.');
        }
        target.x = Math.min(r.maxX, Math.max(r.minX, target.x));
        target.y = Math.min(r.maxY, Math.max(r.minY, target.y));
        const f = PS().clampFeedXY(this.profile.motion.travelFeed, this.profile, this.fw);
        await this._cmd('G1 X' + fmt(target.x) + ' Y' + fmt(target.y) + ' F' + fmt(f));
        await this._sync();
        if (job.finished) return;
        const waitP = new Promise((resolve, reject) => { job.penWait = { resolve, reject }; });
        this.emit('penChange', { index, ordinal: job.penOrdinal, pen: (job.opts.pens && job.opts.pens[job.penOrdinal]) || null });
        await waitP;
        job.penWait = null;
        if (job.finished) return;
        this._setState('running');
        this._streamer.releaseBoundary();
      } catch (e) {
        if (!job.finished && e && e.code !== 'aborted') this._fatalError(e.message);
      }
    }

    // Raises the pen first if the user left it down (re-check height), then lets travel resume.
    continuePenChange() {
      const job = this._job;
      if (!job || !job.penWait || job.penWait.continuing) throw new PlotterError('invalid', 'The plotter is not waiting for a pen change.');
      const wait = job.penWait;
      wait.continuing = true;
      return (async () => {
        try {
          await this.jogCancel();
          await this._penUpRaw();
          wait.resolve();
        } catch (e) {
          wait.continuing = false;
          if (!job.finished) this._fatalError(e.message);
        }
      })();
    }

    async _onStreamDone(job) {
      if (job.finished || this._job !== job) return;
      try {
        await this._sync();
        if (job.finished) return;
        await this._penUpRaw(); // safety net: a job always ends pen-up
        if (job.finished) return;
        job.finished = true;
        this._streamer = null;
        this._job = null;
        this.resumePoint = null;
        this._setState('idle');
        const result = { status: 'done', pathCount: (job.gcode.pathStartIndices || []).length, lines: job.gcode.lines.length, elapsedMs: this.sch.now() - job.startedAt };
        this.emit('done', Object.assign({ aborted: false }, result));
        job.resolve(result);
      } catch (e) {
        if (!job.finished) this._fatalError(e.message);
      }
    }

    pause() {
      if (this.state !== 'running') throw new PlotterError('busy', 'Nothing to pause.');
      this._txRealtime(GP().REALTIME.HOLD);
      this._setState('paused');
    }

    resume() {
      if (this.state !== 'paused') throw new PlotterError('busy', 'Nothing to resume.');
      this._txRealtime(GP().REALTIME.RESUME);
      this._setState('running');
    }

    // ---- emergency stop ----
    // Synchronous realtime bytes first (0x85 jog cancel, then ! feed hold), before any await, then the
    // normal safe-stop sequence (hold settles, reset, unlock unless position lost, G92 restore, pen up).
    // Works from any state with an open port; idempotent; never throws. Resolves like stop().
    emergencyStop() {
      try {
        if (!this._open() || this.state === 'disconnected' || this.state === 'connecting') return Promise.resolve({ stopped: false });
        const prev = this.state;
        try { this.transport.writeRealtime(GP().REALTIME.JOG_CANCEL); } catch (e) { /* port trouble surfaces in the stop sequence */ }
        try { this.transport.writeRealtime(GP().REALTIME.HOLD); } catch (e) { /* ditto */ }
        this._stopJogLoop();
        if (prev === 'stopping' && this._stopPromise) return this._stopPromise;
        this.emit('estop', { state: prev });
        this._estopBlock = true;
        this._failPending(new PlotterError('stopped', 'Emergency stop.'));
        const p = this._safeStop({ status: 'estop', message: 'Emergency stop.' });
        p.catch(() => {});
        return p;
      } catch (e) {
        return Promise.resolve({ stopped: false, error: String((e && e.message) || e) });
      }
    }

    // ---- stop (rule 7) ----
    async stop() {
      if (this.state === 'stopping') return this._stopPromise;
      if (this.state === 'jogging') { await this.jogCancel(); return { stopped: true, status: 'jog' }; }
      if (!ACTIVE_JOB_STATES.includes(this.state)) return { stopped: false };
      return this._safeStop({ status: 'stopped', message: 'Stopped by user.' });
    }

    _safeStop(info) {
      if (this._stopPromise && this.state === 'stopping') return this._stopPromise;
      this._stopPromise = this._doSafeStop(info).finally(() => { this._stopPromise = null; });
      return this._stopPromise;
    }

    async _doSafeStop(info) {
      this._phase = 'stopping';
      this._stopAlarm = undefined;
      this._setState('stopping');
      this._stopJogLoop();
      const rp = this._abortActive(info.status || 'stopped', info.message);
      this._failPending(new PlotterError('stopped', 'Stopped.'));
      this.penMustRaise = true;
      try {
        this._txRealtime(GP().REALTIME.HOLD);
        try {
          await this._waitStatus((s) => s.state === 'Alarm' || s.state === 'Idle' || (s.state === 'Hold' && s.subState === '0'), this.opts.stopHoldTimeoutMs);
        } catch (e) { this._log('warn', 'Feed hold did not settle; resetting anyway.'); }
        const bannerP = this._await('banner', () => true, this.opts.resetTimeoutMs);
        bannerP.catch(() => {});
        this._txRealtime(GP().REALTIME.RESET);
        await bannerP; // the reset wipes G92 and the planner
        this._estopBlock = false;
        this.wco = { x: 0, y: 0, z: 0 }; this._wcoPin = null; this.wcoVerified = null;
        let st = await this._refreshStatus(2000);
        if (this._stopAlarm === 3) {
          // ALARM:3 = reset while in motion: steps were lost, so machine and work
          // positions are untrustworthy. Move nothing (no unlock, no G92, no Z):
          // the user must recover by hand, then connect and set the origin again.
          const message = 'The plotter stopped while moving, so its position is no longer reliable. '
            + 'Power the plotter off, gently move the carriage back to its start corner, power it on, '
            + 'then reconnect and set the origin again.';
          this.originSet = false;
          this.originMachine = null;
          this._unconfirmCorner({ x: 0, y: 0 });
          this._phase = null;
          this._alarmCode = 3;
          this._setState('alarm');
          this.emit('alarm', { code: 3, message, positionLost: true, resumePoint: rp });
          this.emit('done', { aborted: true, reason: info.status, message, resumePoint: rp, positionLost: true });
          return { stopped: true, status: info.status, resumePoint: rp, positionLost: true };
        }
        if (st.state === 'Alarm' || this._stopAlarm !== undefined) {
          await this._cmd('$X', { allowUnlock: true });
          st = await this._refreshStatus(2000);
        }
        if (this.originSet && this.originMachine) {
          await this._cmd('G92 X' + fmt(st.mpos.x - this.originMachine.x) + ' Y' + fmt(st.mpos.y - this.originMachine.y));
          this.wco = { x: this.originMachine.x, y: this.originMachine.y, z: 0 };
          this._wcoPin = { x: this.originMachine.x, y: this.originMachine.y };
          this.wcoVerified = null;
          await this.refreshWco().catch(() => null);
          await this._refreshStatus(2000).catch(() => null);
        }
        await this._penUpRaw();
        this._phase = null;
        this._alarmCode = undefined;
        this._lastAlarmEmitted = undefined;
        this._setState('idle');
        if (info.errorEvent) this.emit('error', Object.assign({ resumePoint: rp }, info.errorEvent));
        this.emit('done', { aborted: true, reason: info.status, message: info.message, resumePoint: rp });
        return { stopped: true, status: info.status, resumePoint: rp };
      } catch (err) {
        this._phase = null;
        this._estopBlock = false;
        if (this.state === 'disconnected') throw err;
        this.lastError = err.message;
        this._setState('error');
        this.emit('error', { message: 'Stop sequence failed: ' + err.message, fatal: false, resumePoint: rp });
        throw err;
      }
    }

    async resumeFrom(pathIndex) {
      if (!this._lastJob) throw new PlotterError('invalid', 'There is no job to resume.');
      const idx = Number.isFinite(pathIndex) ? pathIndex : (this.resumePoint ? this.resumePoint.pathIndex : 0);
      return this.run(this._lastJob.gcode, Object.assign({}, this._lastJob.opts, { startPath: idx }));
    }

    // ---- console (spec section 10.1) ----
    _consoleCheck(scan, wpos) {
      const L = this._limits();
      const cap = (hasXY, hasZ, jog) => {
        let c = hasXY && hasZ ? Math.min(L.xyCap, L.zCap) : (hasXY ? L.xyCap : L.zCap);
        if (jog) c = Math.min(c, L.jogCap);
        return c;
      };
      if (scan.g.includes(20)) return 'G20 (inches) is not allowed; the plotter works in millimeters.';
      if (scan.g.includes(2) || scan.g.includes(3)) return 'Arcs (G2/G3) are not allowed from the console.';
      if (scan.g.includes(91) && !scan.jog) return 'Relative moves (G91) are not allowed from the console. Use Jog instead.';
      const hasXY = scan.X !== undefined || scan.Y !== undefined;
      const hasZ = scan.Z !== undefined;
      if (scan.F !== undefined && !(scan.F > 0)) return 'Feed must be greater than zero.';
      if (scan.jog && scan.F === undefined) return 'Jog commands need a feed (F).';
      if (scan.F !== undefined) {
        const c = hasXY || hasZ ? cap(hasXY, hasZ, scan.jog) : L.xyCap;
        if (scan.F > c + EPS) return 'Feed F' + fmt(scan.F) + ' is above the ' + fmt(c) + ' mm/min limit.';
      }
      if (!hasXY && !hasZ) return null;
      const g53 = scan.g.includes(53);
      const rel = scan.jog && scan.g.includes(91);
      const base = wpos || { x: 0, y: 0, z: 0 };
      const t = { x: base.x, y: base.y, z: base.z };
      ['X', 'Y', 'Z'].forEach((a) => {
        const k = a.toLowerCase();
        if (scan[a] === undefined) return;
        if (rel) t[k] = base[k] + scan[a];
        else if (g53) t[k] = scan[a] - this.wco[k];
        else t[k] = scan[a];
      });
      const r = this._workRange({ noBox: true });
      if (hasXY) {
        const TOL = PS().BOUNDS_TOLERANCE_MM;
        if (t.x < r.minX - TOL || t.x > r.maxX + TOL) return 'X target ' + fmt(t.x) + ' is outside the work area (' + fmt(r.minX) + ' to ' + fmt(r.maxX) + ' mm).';
        if (t.y < r.minY - TOL || t.y > r.maxY + TOL) return 'Y target ' + fmt(t.y) + ' is outside the work area (' + fmt(r.minY) + ' to ' + fmt(r.maxY) + ' mm).';
        if (this._outsideCorner(t.x, t.y)) return CORNER_MESSAGE;
      }
      if (hasZ) {
        const zm = t.z + this.wco.z;
        if (zm < L.zLo - EPS || zm > L.zHi + EPS) return 'Z target ' + fmt(zm) + ' is outside the pen range (' + fmt(L.zLo) + ' to ' + fmt(L.zHi) + ' mm).';
      }
      return null;
    }

    // Resolves {ok, lines} or {ok:false, refused, reason}; never throws for refusals.
    async sendConsole(text, o) {
      const opts = o || {};
      const input = String(text == null ? '' : text);
      if (this.state === 'disconnected' || this.state === 'connecting') return { ok: false, refused: true, reason: 'The plotter is not connected.' };
      const busy = ACTIVE_JOB_STATES.includes(this.state) || this.state === 'stopping';
      if (input.length === 1 && PS().classifyCommand(input, {}).kind !== 'motion') {
        if (busy && input !== '?') return { ok: false, refused: true, reason: 'Use Pause, Resume or Stop while a job is running.' };
        try { this._txRealtime(input.charCodeAt(0)); } catch (e) { return { ok: false, refused: true, reason: e.message }; }
        return { ok: true, lines: [] };
      }
      const parts = input.split(/\r?\n/).filter((l) => l.trim() !== '');
      if (!parts.length) return { ok: true, lines: [] };
      if (busy) return { ok: false, refused: true, reason: 'The console is locked while a job is running.' };
      const flags = { allowFirmwareWrites: opts.allowFirmwareWrites === true };
      let fresh = null;
      for (const part of parts) {
        const c = PS().classifyCommand(part, flags);
        if (!c.ok) return { ok: false, refused: true, reason: c.reason };
        const sc = GP().scanGcode(part);
        if (sc.error) {
          if (/^\s*\$/.test(part)) continue; // $ queries and settings were classified above
          return { ok: false, refused: true, reason: 'Could not parse the command: ' + sc.error };
        }
        const moves = sc.X !== undefined || sc.Y !== undefined || sc.Z !== undefined;
        if (this.state === 'alarm' && moves) return { ok: false, refused: true, reason: 'The plotter is in alarm. Unlock it before moving.' };
        if (!fresh && moves) fresh = await this._refreshStatus().catch(() => this.status);
        const why = this._consoleCheck(sc, fresh && fresh.wpos);
        if (why) return { ok: false, refused: true, reason: why };
      }
      const lines = [];
      let sawG92 = false;
      for (const part of parts) {
        try {
          const r = await this._cmd(part, flags);
          lines.push(...r.lines);
          if (/G92/i.test(part)) sawG92 = true;
        } catch (e) {
          if (e.code === 'firmware-error') return { ok: false, error: e.details && e.details.code, reason: e.message, lines };
          return { ok: false, refused: e.code === 'blocked', reason: e.message, lines };
        }
      }
      if (sawG92) {
        this._wcoPin = null; this.wcoVerified = null;
        const st = await this._refreshStatus().catch(() => null);
        if (st) { this.originMachine = { x: this.wco.x, y: this.wco.y }; this.originSet = true; }
      }
      return { ok: true, lines };
    }
  }

  PlotterController._active = null;
  PlotterController.bestEffortHold = () => (PlotterController._active ? PlotterController._active.bestEffortHold() : false);
  PlotterController.emergencyStopActive = () => {
    const c = PlotterController._active;
    if (!c) return false;
    c.emergencyStop();
    return true;
  };
  PlotterController.resetOwnership = () => { PlotterController._active = null; };

  const PLOTTER_DRIVERS = {
    grbl: { createController: (profile, transport, opts) => new PlotterController(profile, transport, opts) },
  };

  const api = { PlotterController, PlotterError, PLOTTER_DRIVERS };

  if (typeof window !== 'undefined') {
    const Vectura = (window.Vectura = window.Vectura || {});
    Vectura.PlotterController = PlotterController;
    Vectura.PlotterError = PlotterError;
    Vectura.PLOTTER_DRIVERS = Object.assign(Vectura.PLOTTER_DRIVERS || {}, PLOTTER_DRIVERS);
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
