const { T, a3 } = require('./plotter-test-helpers.js');

const tick = () => new Promise((r) => setImmediate(r));

const makeFakePort = () => {
  const written = [];
  let ctrl;
  const calls = [];
  const port = {
    calls,
    readable: new ReadableStream({ start(c) { ctrl = c; }, cancel() { calls.push('reader.cancel'); } }),
    writable: new WritableStream({ write(chunk) { written.push(chunk); } }),
    async open(o) { calls.push('open'); port.openOpts = o; },
    async close() { calls.push('close'); },
  };
  const origGetReader = port.readable.getReader.bind(port.readable);
  port.readable.getReader = () => { const r = origGetReader(); const rl = r.releaseLock.bind(r); r.releaseLock = () => { calls.push('reader.release'); rl(); }; return r; };
  const origGetWriter = port.writable.getWriter.bind(port.writable);
  port.writable.getWriter = () => { const w = origGetWriter(); const rl = w.releaseLock.bind(w); w.releaseLock = () => { calls.push('writer.release'); rl(); }; return w; };
  return { port, written, push: (text) => ctrl.enqueue(new TextEncoder().encode(text)), error: (e) => ctrl.error(e), end: () => ctrl.close() };
};

const makeSerial = (port) => {
  const listeners = {};
  return {
    requested: [],
    async requestPort(o) { this.requested.push(o); return port; },
    async getPorts() { return [port]; },
    addEventListener(n, f) { listeners[n] = f; },
    removeEventListener(n) { delete listeners[n]; },
    fire(n, e) { if (listeners[n]) listeners[n](e); },
    listeners,
  };
};

describe('WebSerialTransport', () => {
  test('does not throw when navigator.serial is absent', async () => {
    expect(T.WebSerialTransport.isSupported()).toBe(false);
    const t = new T.WebSerialTransport({ profile: a3 });
    expect(t.isSupported()).toBe(false);
    expect(t.isOpen).toBe(false);
    expect(await t.getGrantedPorts()).toEqual([]);
    await expect(t.requestPort()).rejects.toThrow(/not available/);
    await expect(t.open()).rejects.toThrow(/not available/);
    await expect(t.close()).resolves.toBeUndefined();
  });

  test('requestPort uses a vendor-id-only filter, with a show-all fallback', async () => {
    const f = makeFakePort();
    const serial = makeSerial(f.port);
    const t = new T.WebSerialTransport({ profile: a3, serial });
    await t.requestPort();
    await t.requestPort({ showAll: true });
    expect(serial.requested[0]).toEqual({ filters: [{ usbVendorId: 0x1a86 }] });
    expect(serial.requested[1]).toEqual({});
    expect((await t.getGrantedPorts()).length).toBe(1);
  });

  test('cancelled picker resolves null', async () => {
    const serial = { requestPort: async () => { const e = new Error('x'); e.name = 'NotFoundError'; throw e; } };
    const t = new T.WebSerialTransport({ profile: a3, serial });
    expect(await t.requestPort()).toBeNull();
  });

  test('open uses profile serial settings; lines split across chunks and CRLF', async () => {
    const f = makeFakePort();
    const t = new T.WebSerialTransport({ profile: a3, serial: makeSerial(f.port) });
    await t.requestPort();
    await t.open();
    expect(f.port.openOpts).toMatchObject({ baudRate: 115200, dataBits: 8, stopBits: 1, parity: 'none' });
    const lines = [];
    t.onLine((l) => lines.push(l));
    f.push('Grbl 1.1h [\'$\' fo');
    await tick();
    expect(lines).toEqual([]);
    f.push('r help]\r\nok\r\n\r\n<Idle|MPos:0,0,0>\r');
    await tick();
    f.push('\nok');
    await tick();
    expect(lines).toEqual(["Grbl 1.1h ['$' for help]", 'ok', '<Idle|MPos:0,0,0>']);
    f.push('\n');
    await tick();
    expect(lines[lines.length - 1]).toBe('ok');
  });

  test('writeLine appends the line ending; writeRealtime sends one raw byte', async () => {
    const f = makeFakePort();
    const t = new T.WebSerialTransport({ profile: a3, serial: makeSerial(f.port) });
    await t.requestPort();
    await t.open();
    await t.writeLine('G21');
    await t.writeRealtime(0x85);
    await t.writeRealtime('?');
    expect(Array.from(f.written[0])).toEqual([...'G21\n'].map((c) => c.charCodeAt(0)));
    expect(Array.from(f.written[1])).toEqual([0x85]);
    expect(Array.from(f.written[2])).toEqual([0x3f]);
  });

  test('close cancels the reader, releases locks, then closes the port; no disconnect callback', async () => {
    const f = makeFakePort();
    const serial = makeSerial(f.port);
    const t = new T.WebSerialTransport({ profile: a3, serial });
    await t.requestPort();
    await t.open();
    let disc = 0;
    t.onDisconnect(() => { disc += 1; });
    await t.close();
    expect(f.port.calls).toEqual(['open', 'reader.cancel', 'reader.release', 'writer.release', 'close']);
    expect(t.isOpen).toBe(false);
    expect(disc).toBe(0);
    expect(serial.listeners.disconnect).toBeUndefined();
  });

  test('navigator.serial disconnect event is fatal and notifies once', async () => {
    const f = makeFakePort();
    const serial = makeSerial(f.port);
    const t = new T.WebSerialTransport({ profile: a3, serial });
    await t.requestPort();
    await t.open();
    const reasons = [];
    t.onDisconnect((r) => reasons.push(r));
    serial.fire('disconnect', { target: f.port });
    await tick();
    expect(reasons.length).toBe(1);
    expect(t.isOpen).toBe(false);
    expect(() => t.writeLine('G21')).toThrow();
  });

  test('a disconnect event for another port is ignored', async () => {
    const f = makeFakePort();
    const serial = makeSerial(f.port);
    const t = new T.WebSerialTransport({ profile: a3, serial });
    await t.requestPort();
    await t.open();
    serial.fire('disconnect', { target: {} });
    expect(t.isOpen).toBe(true);
    await t.close();
  });

  test('read errors are fatal', async () => {
    const f = makeFakePort();
    const t = new T.WebSerialTransport({ profile: a3, serial: makeSerial(f.port) });
    await t.requestPort();
    await t.open();
    const reasons = [];
    t.onDisconnect((r) => reasons.push(r));
    f.error(new Error('device lost'));
    await tick();
    await tick();
    expect(reasons[0]).toMatch(/device lost/);
    expect(t.isOpen).toBe(false);
  });

  test('stream ending unexpectedly is fatal', async () => {
    const f = makeFakePort();
    const t = new T.WebSerialTransport({ profile: a3, serial: makeSerial(f.port) });
    await t.requestPort();
    await t.open();
    const reasons = [];
    t.onDisconnect((r) => reasons.push(r));
    f.end();
    await tick();
    await tick();
    expect(reasons.length).toBe(1);
  });
});
