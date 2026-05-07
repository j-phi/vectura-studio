const { loadUIComponent } = require('../../helpers/load-ui-component');

describe('UI.overlays.ProgressBar (Phase 4)', () => {
  let runtime;
  let ProgressBar;
  beforeEach(() => {
    runtime = loadUIComponent(['utils', 'progress-bar']);
    ProgressBar = runtime.window.Vectura.UI.overlays.ProgressBar;
  });
  afterEach(() => runtime.cleanup());

  test('show() creates host, hides when stack empty', () => {
    const handle = ProgressBar.show({ label: 'Exporting' });
    const host = runtime.document.getElementById('vectura-progress-bar-host');
    expect(host).toBeTruthy();
    expect(host.style.display).toBe('flex');
    expect(host.getAttribute('aria-busy')).toBe('true');
    expect(host.querySelector('.vectura-progress-bar-label').textContent).toBe('Exporting');
    expect(host.querySelector('.vectura-progress-bar')).toBeTruthy();
    handle.done();
    expect(host.style.display).toBe('none');
    expect(host.getAttribute('aria-busy')).toBeNull();
  });

  test('stacked jobs keep bar visible until last done', () => {
    const a = ProgressBar.show('A');
    const b = ProgressBar.show('B');
    expect(ProgressBar._stackDepth()).toBe(2);
    const host = runtime.document.getElementById('vectura-progress-bar-host');
    expect(host.querySelector('.vectura-progress-bar-label').textContent).toBe('B');
    b.done();
    expect(host.style.display).toBe('flex');
    expect(host.querySelector('.vectura-progress-bar-label').textContent).toBe('A');
    a.done();
    expect(host.style.display).toBe('none');
    expect(ProgressBar._stackDepth()).toBe(0);
  });

  test('wrap(async) shows + dones around the work, even on throw', async () => {
    let sawBusyDuring = false;
    const host = (() => {
      const fake = ProgressBar.show('seed'); fake.done();
      return runtime.document.getElementById('vectura-progress-bar-host');
    })();
    await ProgressBar.wrap({ label: 'Saving' }, async () => {
      sawBusyDuring = host.getAttribute('aria-busy') === 'true';
    });
    expect(sawBusyDuring).toBe(true);
    expect(host.style.display).toBe('none');

    let caught;
    try {
      await ProgressBar.wrap({ label: 'Bad' }, async () => { throw new Error('boom'); });
    } catch (err) { caught = err; }
    expect(caught && caught.message).toBe('boom');
    expect(ProgressBar._stackDepth()).toBe(0);
  });

  test('hide() clears all jobs', () => {
    ProgressBar.show('a');
    ProgressBar.show('b');
    ProgressBar.show('c');
    ProgressBar.hide();
    expect(ProgressBar._stackDepth()).toBe(0);
    const host = runtime.document.getElementById('vectura-progress-bar-host');
    expect(host.style.display).toBe('none');
  });

  test('handle.update changes the displayed label', () => {
    const h = ProgressBar.show('First');
    const host = runtime.document.getElementById('vectura-progress-bar-host');
    h.update({ label: 'Second' });
    expect(host.querySelector('.vectura-progress-bar-label').textContent).toBe('Second');
    h.done();
  });
});
