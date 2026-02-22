const { JSDOM } = require('jsdom');

describe('Security DOM sinks', () => {
  test('textContent treats untrusted filename text as plain content', () => {
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
    const document = dom.window.document;
    const payload = '<img src=x onerror=alert(1)>.jpg';

    const nameEl = document.createElement('div');
    nameEl.className = 'noise-image-name';
    nameEl.textContent = payload;

    expect(nameEl.textContent).toBe(payload);
    expect(nameEl.innerHTML).not.toContain('<img');
    expect(nameEl.querySelector('img')).toBeNull();
  });

  test('img.src keeps malicious preview text inside src attribute', () => {
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
    const document = dom.window.document;
    const payload = '\"><img src=x onerror=alert(1)>';

    const img = document.createElement('img');
    img.src = payload;

    const wrap = document.createElement('div');
    wrap.appendChild(img);

    expect(wrap.querySelectorAll('img').length).toBe(1);
    expect(img.getAttribute('onerror')).toBeNull();
    expect(wrap.querySelector('[onerror]')).toBeNull();
  });
});
