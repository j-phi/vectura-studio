const { loadUIComponent } = require('../../helpers/load-ui-component');

describe('UI.overlays.Tooltip', () => {
  let runtime;
  let Tooltip;

  beforeEach(() => {
    runtime = loadUIComponent(['utils', 'tooltip']);
    Tooltip = runtime.window.Vectura.UI.overlays.Tooltip;
  });
  afterEach(() => runtime.cleanup());

  test('returns {el, show, hide, update, destroy}', () => {
    const tip = Tooltip(runtime.document.body, { text: 'hi' });
    expect(tip.el).toBeInstanceOf(runtime.window.HTMLElement);
    ['show', 'hide', 'update', 'destroy', 'isVisible', 'reposition'].forEach((n) => expect(typeof tip[n]).toBe('function'));
    tip.destroy();
  });

  test('starts hidden and becomes visible after the show delay', async () => {
    const tip = Tooltip(runtime.document.body, { text: 'tip', delayShow: 5, delayHide: 0 });
    const target = runtime.document.createElement('button');
    runtime.document.body.appendChild(target);
    expect(tip.el.style.visibility).toBe('hidden');
    expect(tip.isVisible()).toBe(false);
    tip.show(target);
    await new Promise((r) => setTimeout(r, 30));
    expect(tip.el.style.visibility).toBe('visible');
    expect(tip.isVisible()).toBe(true);
    tip.destroy();
  });

  test('hide() conceals after delayHide', async () => {
    const tip = Tooltip(runtime.document.body, { text: 'hi', delayShow: 0, delayHide: 5 });
    const target = runtime.document.createElement('button');
    runtime.document.body.appendChild(target);
    tip.show(target);
    await new Promise((r) => setTimeout(r, 30));
    tip.hide();
    await new Promise((r) => setTimeout(r, 30));
    expect(tip.isVisible()).toBe(false);
    tip.destroy();
  });

  test('text override via show(target, { text }) sets tooltip content', async () => {
    const tip = Tooltip(runtime.document.body, { text: 'default', delayShow: 0 });
    const target = runtime.document.createElement('button');
    runtime.document.body.appendChild(target);
    tip.show(target, { text: 'custom' });
    await new Promise((r) => setTimeout(r, 5));
    expect(tip.el.textContent).toBe('custom');
    tip.destroy();
  });

  test('show() cancels a pending hide so quick re-enter keeps tooltip visible', async () => {
    const tip = Tooltip(runtime.document.body, { text: 'x', delayShow: 0, delayHide: 30 });
    const target = runtime.document.createElement('button');
    runtime.document.body.appendChild(target);
    tip.show(target);
    await new Promise((r) => setTimeout(r, 5));
    expect(tip.isVisible()).toBe(true);
    tip.hide();
    tip.show(target); // cancels the pending hide
    await new Promise((r) => setTimeout(r, 50));
    expect(tip.isVisible()).toBe(true);
    tip.destroy();
  });

  test('destroy() removes the tooltip element from the DOM', () => {
    const tip = Tooltip(runtime.document.body, { text: 'x' });
    const el = tip.el;
    tip.destroy();
    expect(el.parentNode).toBeNull();
  });
});
