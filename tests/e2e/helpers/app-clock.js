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

module.exports = { install, freeze, advance, thaw };
