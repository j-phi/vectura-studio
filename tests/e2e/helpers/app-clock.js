// App-time control for timer-dependent touch tests (nightly B1).
// A hosted runner can stretch the wall-clock gap between two Playwright steps from ~20 ms to 700 ms, so a 500 ms
// hold, a 250 ms one-finger gate or a 300 ms double-tap window fires between steps the test meant to be adjacent.
// With the page clock frozen, the page's timers, Date.now() and performance.now() advance only by the amounts the
// test names (advance), whatever the round trips cost. Native events still dispatch at once.
//
//   install(page)  before page.goto: the clock flows with real time until frozen.
//   freeze(page)   pause the page clock (it first jumps a short lead forward; due timers fire then).
//   advance(page, ms)  run the page clock forward by ms, firing the timers due in that span.
//   thaw(page)     let the clock flow with real time again (rAF and render timers resume).
//   frozenDrag(page, from, to, opts)  touch.drag on a frozen clock, then thaw.
//   frozen(page, fn)  freeze, run fn, thaw (also when fn throws): fn's sleeps become advance() calls.
//   frozenLongPress(page, p, opts)  inside frozen(): touchstart, hold holdMs + margin of APP time, touchend.

const install = (page) => page.clock.install();

const freeze = async (page, leadMs = 1000) => {
  for (let lead = leadMs; ; lead *= 4) {
    const now = await page.evaluate(() => Date.now());
    try {
      await page.clock.pauseAt(now + lead);
      return;
    } catch (err) {
      // The round trip took longer than the lead: the target is already in the page's past. Retry further ahead.
      if (lead > 60_000 || !/past/i.test(String(err && err.message))) throw err;
    }
  }
};

const advance = (page, ms) => page.clock.runFor(ms);

const thaw = (page) => page.clock.resume();

// A quick one-finger drag on a frozen page clock: the steps are app time (touch.drag frozenClock), then settleMs
// of app time for the lift, then the clock flows again. Needs install() before page.goto.
const frozenDrag = async (page, from, to, opts = {}, settleMs = 60) => {
  const touch = require('./touch');
  await freeze(page);
  try {
    await touch.drag(page, from, to, { ...opts, frozenClock: true });
    await advance(page, settleMs);
  } finally {
    await thaw(page);
  }
};

// Run fn with the page clock frozen; the clock flows again afterwards, even when fn throws. Inside fn use
// advance() where a test would sleep, and avoid page.waitForFunction (its rAF polling is a page timer).
const frozen = async (page, fn) => {
  await freeze(page);
  try {
    return await fn(page);
  } finally {
    await thaw(page);
  }
};

const holdMsOf = (page) => page.evaluate(() => window.Vectura.TOUCH_HOLD.holdMs);

// A hold on a frozen page clock (call inside frozen()): finger down, holdMs + marginMs of app time, finger up.
// whileDown() runs with the finger still down after the hold time (sample the fired state there); afterLift() runs
// right after the lift (e.g. the compat click WebKit's synthetic touch lacks), then settleMs of app time pass.
// The wall-clock cost of the round trips never counts: a slow runner cannot lift before the fire timer.
const frozenLongPress = async (page, p, { marginMs = 100, settleMs = 100, whileDown, afterLift } = {}) => {
  const touch = require('./touch');
  const holdMs = await holdMsOf(page);
  await touch.touchPhase(page, 'start', [{ ...p, id: 0 }]);
  await advance(page, holdMs + marginMs);
  const down = whileDown ? await whileDown() : undefined;
  await touch.touchPhase(page, 'end', [{ ...p, id: 0 }]);
  if (afterLift) await afterLift();
  if (settleMs) await advance(page, settleMs);
  return down;
};

module.exports = { install, freeze, advance, thaw, frozenDrag, frozen, holdMsOf, frozenLongPress };
