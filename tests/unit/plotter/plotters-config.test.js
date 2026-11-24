const { PLOTTER_PROFILES, PLOTTER_DEFAULTS } = require('../../../src/config/plotters.js');
const safety = require('../../../src/core/plotter/plot-safety.js');

const byId = (id) => PLOTTER_PROFILES.find((p) => p.id === id);

describe('plotter profile registry', () => {
  test('ships the five built-in profiles in order', () => {
    expect(PLOTTER_PROFILES.map((p) => p.id)).toEqual([
      'uunatek-3-a3', 'uunatek-3-a2', 'uunatek-3-a1', 'uunatek-3-a0', 'generic-grbl-servo',
    ]);
  });

  test('only the A3 is marked tested', () => {
    expect(PLOTTER_PROFILES.filter((p) => p.tested).map((p) => p.id)).toEqual(['uunatek-3-a3']);
  });

  test('UUNATEK work areas and shared defaults', () => {
    expect(byId('uunatek-3-a3').workArea).toEqual({ width: 420, height: 297 });
    expect(byId('uunatek-3-a2').workArea).toEqual({ width: 594, height: 420 });
    expect(byId('uunatek-3-a1').workArea).toEqual({ width: 841, height: 594 });
    expect(byId('uunatek-3-a0').workArea).toEqual({ width: 1189, height: 841 });
    const a3 = byId('uunatek-3-a3');
    expect(a3.driver).toBe('grbl');
    expect(a3.serial).toMatchObject({ baudRate: 115200, rxBuffer: 127, lineEnding: '\n' });
    expect(a3.serial.filters).toEqual([{ usbVendorId: 0x1a86 }]);
    expect(a3.capabilities.resetsOnOpen).toBe(true);
    expect(a3.pen).toMatchObject({ mechanism: 'z', up: 0, down: 3.5, zMin: 0, zMax: 10, zFeed: 5000 });
    expect(a3.limits).toMatchObject({ maxFeedXY: 11000, maxFeedZ: 5000 });
    expect(a3.gcode.preamble).toEqual(['G21', 'G90']);
    expect(a3.capabilities.homing).toBe(false);
  });

  test('generic servo profile', () => {
    const g = byId('generic-grbl-servo');
    expect(g.pen.mechanism).toBe('servo');
    expect(g.pen.servoUp).toBe('M5');
    expect(g.pen.servoDown).toBe('M3 S1000');
    expect(g.workArea).toEqual({ width: 300, height: 200 });
  });

  test('every built-in profile validates', () => {
    PLOTTER_PROFILES.forEach((p) => {
      expect(safety.validateProfile(p)).toEqual({ ok: true, errors: [] });
    });
  });

  test('servo templates pass classifyCommand', () => {
    const g = byId('generic-grbl-servo');
    expect(safety.classifyCommand(g.pen.servoUp).ok).toBe(true);
    expect(safety.classifyCommand(g.pen.servoDown).ok).toBe(true);
  });

  test('preamble and postamble pass classifyCommand for every profile', () => {
    PLOTTER_PROFILES.forEach((p) => {
      [...p.gcode.preamble, ...p.gcode.postamble].forEach((l) => expect(safety.classifyCommand(l).ok).toBe(true));
    });
  });

  test('built-ins are deeply frozen', () => {
    expect(Object.isFrozen(PLOTTER_PROFILES)).toBe(true);
    PLOTTER_PROFILES.forEach((p) => {
      expect(Object.isFrozen(p)).toBe(true);
      expect(Object.isFrozen(p.pen)).toBe(true);
      expect(Object.isFrozen(p.workArea)).toBe(true);
      expect(Object.isFrozen(p.serial.filters)).toBe(true);
      expect(Object.isFrozen(p.serial.filters[0])).toBe(true);
      expect(Object.isFrozen(p.gcode.preamble)).toBe(true);
    });
    expect(() => { 'use strict'; byId('uunatek-3-a3').pen.zMax = 99; }).toThrow();
    expect(byId('uunatek-3-a3').pen.zMax).toBe(10);
  });

  test('built-in profiles do not share mutable state with defaults', () => {
    const a3 = byId('uunatek-3-a3');
    expect(a3.pen).not.toBe(PLOTTER_DEFAULTS.profile.pen);
    expect(Object.isFrozen(PLOTTER_DEFAULTS.profile)).toBe(false);
  });

  test('plot settings defaults match the spec', () => {
    expect(PLOTTER_DEFAULTS.settings).toMatchObject({
      profileId: 'uunatek-3-a3',
      placement: { mode: 'document', offsetX: 0, offsetY: 0, scale: 1, rotate: 0 },
      optimize: { enabled: true, simplify: 0.02, minLength: 0, dedupe: true, sort: true, merge: true, mergeTol: 0.1 },
      pens: {}, penOrder: null, penChange: 'pause', penChangePosition: 'origin',
      returnToOrigin: true, airPlot: false, profileOverrides: {},
    });
    expect(byId(PLOTTER_DEFAULTS.settings.profileId)).toBeTruthy();
  });
});
