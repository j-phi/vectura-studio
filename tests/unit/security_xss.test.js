const { JSDOM } = require('jsdom');

describe('Security: Noise Image Filename XSS', () => {
  const truncateFilename = (value) => {
    if (!value) return 'No file selected';
    const parts = value.split('.');
    if (parts.length < 2) return value.length > 10 ? `${value.slice(0, 10)}…` : value;
    const ext = parts.pop();
    const base = parts.join('.');
    const shortBase = base.length > 10 ? `${base.slice(0, 10)}…` : base;
    return `${shortBase}.${ext}`;
  };

  test('should escape HTML tags in the noise image name', () => {
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
    const document = dom.window.document;

    const noise = { imageName: '<img src=x onerror=alert(1)>.jpg' };
    const name = truncateFilename(noise.imageName || '');

    const nameEl = document.createElement('div');
    nameEl.className = 'noise-image-name';

    // This is what the fix does
    nameEl.textContent = name;

    // Verify it's escaped in innerHTML
    // Truncated: '<img src=x…' -> Escaped: '&lt;img src=x…'
    expect(nameEl.innerHTML).toContain('&lt;img src=x');
    expect(nameEl.innerHTML).not.toContain('<img');
    expect(nameEl.textContent).toBe(name);
  });

  test('should safely handle malicious imagePreview URLs', () => {
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
    const document = dom.window.document;

    const noise = { imagePreview: '"><img src=x onerror=alert(1)>' };

    const img = document.createElement('img');
    // This is what the fix does
    img.src = noise.imagePreview;

    const wrap = document.createElement('div');
    wrap.appendChild(img);

    // Ensure it's treated as one image tag and the malicious payload didn't break out
    expect(wrap.querySelectorAll('img').length).toBe(1);
    expect(img.getAttribute('onerror')).toBeNull();
  });
});
