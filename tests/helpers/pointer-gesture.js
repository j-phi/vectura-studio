/** Dispatch realistic pointer sequences (jsdom has no PointerEvent) for the Start Page click-guard specs. */
const ptr = (win, el, type, x, y, pointerType = 'mouse') => {
  const ev = new win.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
  Object.defineProperty(ev, 'pointerId', { value: 1 });
  Object.defineProperty(ev, 'pointerType', { value: pointerType });
  el.dispatchEvent(ev);
};
const click = (win, el) => el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
/** down -> moves -> up -> click, advancing the (mocked) clock by `ms` between down and up. */
const gesture = (win, el, { to = [0, 0], ms = 50, pointerType = 'mouse', tick } = {}) => {
  ptr(win, el, 'pointerdown', 100, 100, pointerType);
  ptr(win, el, 'pointermove', 100 + to[0] / 2, 100 + to[1] / 2, pointerType);
  ptr(win, el, 'pointermove', 100 + to[0], 100 + to[1], pointerType);
  if (tick) tick(ms);
  ptr(win, el, 'pointerup', 100 + to[0], 100 + to[1], pointerType);
  click(win, el);
};
module.exports = { ptr, click, gesture };
