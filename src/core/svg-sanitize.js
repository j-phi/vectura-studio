/**
 * SVG sanitizer — removes XSS vectors before user-supplied SVG markup is
 * assigned to innerHTML or stored in pattern/layer state.
 *
 * Public API: window.Vectura.SvgSanitize.sanitize(svgString) -> sanitized
 * string (always parseable SVG; returns "<svg/>" on parse failure).
 *
 * Behavior (pure, synchronous, no DOM mounts):
 *   - Drop <script> and <foreignObject> elements entirely.
 *   - Strip every attribute whose lowercased name starts with "on".
 *   - Rewrite href / xlink:href values matching /^\s*javascript:/i to "#".
 */
(() => {
  window.Vectura = window.Vectura || {};

  const EMPTY_SVG = '<svg xmlns="http://www.w3.org/2000/svg"/>';
  const JAVASCRIPT_HREF_RE = /^\s*javascript:/i;
  const HREF_ATTR_NAMES = ['href', 'xlink:href'];

  const removeDangerousNodes = (root) => {
    if (!root || typeof root.querySelectorAll !== 'function') return;
    // Use getElementsByTagName / querySelectorAll then iterate over a snapshot.
    const drop = [];
    const walk = (node) => {
      if (!node) return;
      const tag = (node.tagName || '').toLowerCase();
      if (tag === 'script' || tag === 'foreignobject') {
        drop.push(node);
        return;
      }
      // Iterate children (NodeList is live but we only read length lazily via for-of on a static copy).
      const kids = node.children ? Array.from(node.children) : [];
      for (let i = 0; i < kids.length; i += 1) walk(kids[i]);
    };
    walk(root);
    drop.forEach((node) => {
      if (node && node.parentNode) node.parentNode.removeChild(node);
    });
  };

  const stripDangerousAttributes = (root) => {
    if (!root) return;
    const visit = (node) => {
      if (!node || node.nodeType !== 1) return;
      const attrs = node.attributes ? Array.from(node.attributes) : [];
      attrs.forEach((attr) => {
        const name = `${attr.name || ''}`;
        const lower = name.toLowerCase();
        if (lower.startsWith('on')) {
          node.removeAttribute(name);
          return;
        }
        if (HREF_ATTR_NAMES.includes(lower)) {
          const value = `${attr.value || ''}`;
          if (JAVASCRIPT_HREF_RE.test(value)) {
            // Use setAttributeNS for namespaced href to preserve prefix; otherwise plain set.
            if (lower === 'xlink:href' && typeof node.setAttributeNS === 'function') {
              node.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', '#');
            } else {
              node.setAttribute(name, '#');
            }
          }
        }
      });
      const kids = node.children ? Array.from(node.children) : [];
      for (let i = 0; i < kids.length; i += 1) visit(kids[i]);
    };
    visit(root);
  };

  const sanitize = (svgString) => {
    if (svgString == null) return EMPTY_SVG;
    const input = `${svgString}`;
    if (!input.trim()) return EMPTY_SVG;
    if (typeof DOMParser === 'undefined' || typeof XMLSerializer === 'undefined') {
      // Non-browser environment: best-effort regex strip so we never store raw markup.
      return input
        .replace(/<script\b[\s\S]*?<\/script\s*>/gi, '')
        .replace(/<foreignObject\b[\s\S]*?<\/foreignObject\s*>/gi, '')
        .replace(/\son[a-z0-9_-]+\s*=\s*"[^"]*"/gi, '')
        .replace(/\son[a-z0-9_-]+\s*=\s*'[^']*'/gi, '')
        .replace(/(href|xlink:href)\s*=\s*"\s*javascript:[^"]*"/gi, '$1="#"')
        .replace(/(href|xlink:href)\s*=\s*'\s*javascript:[^']*'/gi, "$1='#'");
    }
    let doc;
    try {
      const parser = new DOMParser();
      doc = parser.parseFromString(input, 'image/svg+xml');
    } catch (_err) {
      return EMPTY_SVG;
    }
    if (!doc) return EMPTY_SVG;
    const parserError = doc.querySelector && doc.querySelector('parsererror');
    if (parserError) return EMPTY_SVG;
    const svg = doc.documentElement;
    if (!svg || (svg.tagName || '').toLowerCase() !== 'svg') return EMPTY_SVG;

    removeDangerousNodes(svg);
    stripDangerousAttributes(svg);

    try {
      const serializer = new XMLSerializer();
      return serializer.serializeToString(svg);
    } catch (_err) {
      return EMPTY_SVG;
    }
  };

  window.Vectura.SvgSanitize = { sanitize };
})();
