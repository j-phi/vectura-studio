/**
 * SVG sanitizer — removes XSS vectors before user-supplied SVG markup is
 * assigned to innerHTML or stored in pattern/layer state.
 *
 * Public API: window.Vectura.SvgSanitize.sanitize(svgString) -> sanitized
 * string (always parseable SVG; returns "<svg/>" on parse failure).
 *
 * Threat model and policy:
 *   - <script>, <foreignObject>, <style> elements: DROP entirely.
 *       * <script>: executes arbitrary JS on mount.
 *       * <foreignObject>: allows arbitrary HTML inside SVG (full XSS surface).
 *       * <style>: inline CSS supports url(javascript:...), expression(),
 *         @import, etc. We do not need stylesheet support in user-imported
 *         pattern SVGs, so we drop the block wholesale — much simpler than
 *         building a CSS sanitizer. Visual fills/strokes use SVG presentation
 *         attributes (fill="...", stroke="..."), which are untouched.
 *   - on* event-handler attributes (onerror, onclick, onload, onbegin, ...):
 *     STRIP attribute, keep element.
 *   - href / xlink:href (case-insensitive):
 *       * Value matches `javascript:` after URL-decoding & whitespace-strip:
 *         REWRITE attribute value to "#" (preserves element/anchor structure).
 *       * Value is NOT a same-document fragment (`#…`) and NOT plain empty:
 *           - On <use>: DROP the element (external <use> can pull in hostile
 *             SVG that re-introduces script/event handlers post-sanitize).
 *           - On every other element (<image>, <a>, <linearGradient>,
 *             <radialGradient>, <pattern>, <filter>, <feImage>, <textPath>,
 *             <mpath>, …): REMOVE the attribute. The element keeps rendering
 *             with whatever fallback the renderer provides.
 *   - <animate> / <set>: DROP the element if
 *       * attributeName ∈ {href, xlink:href}  (animation-based href hijack),
 *         OR
 *       * any of to / from / values, after URL-decoding & whitespace-strip,
 *         contains `javascript:` (animated value can poison href post-mount).
 *
 * Defense-in-depth:
 *   - All javascript: checks decode HTML/URL entities (e.g. `javascript&#58;`,
 *     `%6Aavascript:`) and tolerate leading whitespace/tabs/newlines and
 *     mixed case (`JavaScript:`, `\tjavascript:`).
 *   - Sanitize is idempotent: sanitize(sanitize(x)) === sanitize(x).
 *   - Runs without DOM mounts; safe to call before innerHTML / parseFromString.
 *
 * Public API stays stable; this module is loaded before pattern.js, the
 * pattern designer, file I/O, and pattern-registry in index.html.
 */
(() => {
  const Vectura = (window.Vectura = window.Vectura || {});

  const EMPTY_SVG = '<svg xmlns="http://www.w3.org/2000/svg"/>';
  const HREF_ATTR_NAMES = ['href', 'xlink:href'];

  // Decode HTML numeric/named entities and percent-encoding so attackers can't
  // smuggle `javascript:` past us with `javascript&#58;` or `%6Aavascript:`.
  const decodeForUrlCheck = (raw) => {
    let value = `${raw == null ? '' : raw}`;
    // HTML numeric entities: &#58; &#x3A;
    value = value.replace(/&#x([0-9a-f]+);?/gi, (_, hex) => {
      const cp = parseInt(hex, 16);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : '';
    });
    value = value.replace(/&#(\d+);?/g, (_, dec) => {
      const cp = parseInt(dec, 10);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : '';
    });
    // Named entities we care about for URL schemes.
    value = value.replace(/&colon;/gi, ':').replace(/&Tab;/gi, '\t').replace(/&NewLine;/gi, '\n');
    // Percent-encoding.
    try {
      value = decodeURIComponent(value);
    } catch (_err) {
      // Malformed percent escapes — leave as-is; downstream regex still catches plain form.
    }
    return value;
  };

  // Match `javascript:` (and `vbscript:`, `data:text/html` — unlikely vectors here
  // but cheap to block) after entity-decoding and whitespace/control trim.
  // The canonicalization removes ASCII whitespace+control chars *inside* the scheme
  // prefix so `java\tscript:` / `java\nscript:` cannot bypass.
  const looksLikeJsUrl = (raw) => {
    const decoded = decodeForUrlCheck(raw).replace(/^[\s\u0000-\u0008\u000e-\u001f]+/, '');
    // Strip ASCII whitespace/control chars from the first ~20 chars to defeat
    // `java\tscript:` and similar interleaved-whitespace bypasses.
    const compact = decoded.slice(0, 64).replace(/[\s\u0000-\u0008\u000e-\u001f]/g, '');
    return /^javascript:/i.test(compact) || /^vbscript:/i.test(compact);
  };

  const isFragmentRef = (raw) => {
    const value = `${raw == null ? '' : raw}`.trim();
    return value === '' || value.startsWith('#');
  };

  // Elements that should be dropped wholesale, never just stripped of attrs.
  // <foreignObject>: arbitrary HTML/XSS surface inside SVG.
  // <script>: direct JS execution.
  // <style>: url(javascript:...), expression(), @import — drop instead of building a CSS sanitizer.
  const DROP_TAGS = new Set(['script', 'foreignobject', 'style']);

  const collectAllElements = (root) => {
    const result = [];
    const walk = (node) => {
      if (!node || node.nodeType !== 1) return;
      result.push(node);
      const kids = node.children ? Array.from(node.children) : [];
      for (let i = 0; i < kids.length; i += 1) walk(kids[i]);
    };
    walk(root);
    return result;
  };

  // Pass 1: remove always-dangerous elements (<script>, <foreignObject>, <style>).
  const removeDangerousNodes = (root) => {
    if (!root) return;
    collectAllElements(root).forEach((node) => {
      const tag = (node.tagName || '').toLowerCase();
      if (DROP_TAGS.has(tag) && node.parentNode) {
        node.parentNode.removeChild(node);
      }
    });
  };

  // Pass 2: remove <animate> / <set> elements that target href or carry a
  // javascript: payload in to/from/values. Animation can swap an anchor's href
  // post-mount, so static href checks alone are not enough.
  const removeHostileAnimations = (root) => {
    if (!root) return;
    collectAllElements(root).forEach((node) => {
      const tag = (node.tagName || '').toLowerCase();
      if (tag !== 'animate' && tag !== 'set' && tag !== 'animatetransform') return;
      const attrName = `${node.getAttribute('attributeName') || ''}`.trim().toLowerCase();
      if (attrName === 'href' || attrName === 'xlink:href') {
        if (node.parentNode) node.parentNode.removeChild(node);
        return;
      }
      const candidates = ['to', 'from', 'by', 'values'].map((a) => node.getAttribute(a) || '');
      // `values` is a semicolon-separated list — split before checking.
      const valueParts = `${node.getAttribute('values') || ''}`.split(';');
      const all = candidates.concat(valueParts);
      if (all.some((v) => looksLikeJsUrl(v))) {
        if (node.parentNode) node.parentNode.removeChild(node);
      }
    });
  };

  // Pass 3: handle href/xlink:href and on* attributes per the policy above.
  const sanitizeAttributesAndUseElements = (root) => {
    if (!root) return;
    const dropElements = [];
    collectAllElements(root).forEach((node) => {
      const tag = (node.tagName || '').toLowerCase();
      const attrs = node.attributes ? Array.from(node.attributes) : [];
      let useHasExternalRef = false;

      attrs.forEach((attr) => {
        const name = `${attr.name || ''}`;
        const lower = name.toLowerCase();

        // 3a. on* event handlers: always strip.
        if (lower.startsWith('on')) {
          node.removeAttribute(name);
          return;
        }

        // 3b. href / xlink:href handling.
        if (HREF_ATTR_NAMES.includes(lower)) {
          const value = `${attr.value || ''}`;
          if (looksLikeJsUrl(value)) {
            // Preserve existing policy: rewrite to a safe fragment. Keeps
            // <a href="javascript:..."> intact as a non-clickable anchor.
            if (lower === 'xlink:href' && typeof node.setAttributeNS === 'function') {
              node.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', '#');
            } else {
              node.setAttribute(name, '#');
            }
            return;
          }
          if (!isFragmentRef(value)) {
            // External or absolute reference — neither <use> nor any other
            // element should fetch off-document SVG/raster content from
            // untrusted sources. <use> with an external ref is especially
            // dangerous: it re-introduces arbitrary content post-sanitize.
            if (tag === 'use') {
              useHasExternalRef = true;
            } else {
              if (lower === 'xlink:href' && typeof node.removeAttributeNS === 'function') {
                node.removeAttributeNS('http://www.w3.org/1999/xlink', 'href');
              }
              node.removeAttribute(name);
            }
          }
        }
      });

      if (useHasExternalRef) dropElements.push(node);
    });

    dropElements.forEach((node) => {
      if (node && node.parentNode) node.parentNode.removeChild(node);
    });
  };

  // Non-browser fallback: best-effort regex strip so we never store raw markup.
  // Used only when DOMParser/XMLSerializer are unavailable (e.g., a CLI Node
  // context without jsdom). Browser and the unit-test jsdom env use the DOM path.
  const fallbackRegexStrip = (input) => {
    const stripOnce = (text) => text
      .replace(/<script\b[\s\S]*?<\/script\b[^>]*>/gi, '')
      .replace(/<foreignObject\b[\s\S]*?<\/foreignObject\b[^>]*>/gi, '')
      .replace(/<style\b[\s\S]*?<\/style\b[^>]*>/gi, '')
      .replace(/\son[a-z0-9_-]+\s*=\s*"[^"]*"/gi, '')
      .replace(/\son[a-z0-9_-]+\s*=\s*'[^']*'/gi, '')
      .replace(/<animate\b[^>]*\battributeName\s*=\s*['"]?(?:xlink:)?href['"]?[^>]*\/?>(?:\s*<\/animate>)?/gi, '')
      .replace(/<set\b[^>]*\battributeName\s*=\s*['"]?(?:xlink:)?href['"]?[^>]*\/?>(?:\s*<\/set>)?/gi, '')
      .replace(/<animate\b[^>]*\b(?:to|from|values)\s*=\s*['"][^'"]*javascript:[^'"]*['"][^>]*\/?>(?:\s*<\/animate>)?/gi, '')
      .replace(/<set\b[^>]*\b(?:to|from|values)\s*=\s*['"][^'"]*javascript:[^'"]*['"][^>]*\/?>(?:\s*<\/set>)?/gi, '')
      .replace(/(href|xlink:href)\s*=\s*"\s*javascript:[^"]*"/gi, '$1="#"')
      .replace(/(href|xlink:href)\s*=\s*'\s*javascript:[^']*'/gi, "$1='#'");
    // Repeat until stable: one pass can splice a new `<script` / `on*=` together
    // out of the fragments around a removed match (e.g. `<scr<script></script>ipt>`).
    let out = input;
    for (let i = 0; i < 16; i += 1) {
      const next = stripOnce(out);
      if (next === out) break;
      out = next;
    }
    // Anything still dangerous after the fixed point is hostile — store nothing.
    // Only markup is examined: text content that mentions `javascript:` or
    // reads like ` one=1` is legitimate. Each tag runs from `<` to the closing
    // `>` (quoted values may contain `>`), or to end of input if it never
    // closes — an unterminated tag or quote is examined too, never skipped.
    // Alternatives start on disjoint characters, so matching stays linear.
    const TAG_RE = /<(?:[^<>"']|"[^"]*(?:"|$)|'[^']*(?:'|$))*/g;
    const isHostileTag = (tag) => /^<\s*\/?\s*(?:script|style|foreignObject)\b/i.test(tag)
      || /[\s"'/]on[a-z0-9_-]+\s*=/i.test(tag)
      || /javascript:/i.test(tag);
    const tags = out.match(TAG_RE) || [];
    if (tags.some(isHostileTag)) return EMPTY_SVG;
    return out;
  };

  const sanitize = (svgString) => {
    if (svgString == null) return EMPTY_SVG;
    const input = `${svgString}`;
    if (!input.trim()) return EMPTY_SVG;
    let ActiveDOMParser = typeof DOMParser !== 'undefined' ? DOMParser : null;
    let ActiveXMLSerializer = typeof XMLSerializer !== 'undefined' ? XMLSerializer : null;
    if (!ActiveDOMParser || !ActiveXMLSerializer) {
      try {
        const xmldom = require('@xmldom/xmldom');
        ActiveDOMParser = xmldom.DOMParser;
        ActiveXMLSerializer = xmldom.XMLSerializer;
      } catch (e) {
        try {
          const xmldom = require('xmldom');
          ActiveDOMParser = xmldom.DOMParser;
          ActiveXMLSerializer = xmldom.XMLSerializer;
        } catch (e2) {
          return fallbackRegexStrip(input);
        }
      }
    }
    let doc;
    try {
      const parser = new ActiveDOMParser();
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
    removeHostileAnimations(svg);
    sanitizeAttributesAndUseElements(svg);

    try {
      const serializer = new ActiveXMLSerializer();
      return serializer.serializeToString(svg);
    } catch (_err) {
      return EMPTY_SVG;
    }
  };

  Vectura.SvgSanitize = { sanitize };
})();
