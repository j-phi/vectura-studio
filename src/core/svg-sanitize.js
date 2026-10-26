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
 *   - Every DOM-path check keys on localName + namespaceURI, never on the
 *     qualified tagName / attr.name (`<x:script>` bound to the SVG namespace,
 *     `foo:href` bound to XLink). Elements outside the SVG namespace (e.g.
 *     XHTML `<h:script>`) are dropped with their subtree; attributes outside
 *     no-namespace / XLink / XML / xmlns are removed.
 *
 * Defense-in-depth:
 *   - All javascript: checks decode HTML/URL entities (e.g. `javascript&#58;`,
 *     `%6Aavascript:`) and tolerate leading whitespace/tabs/newlines and
 *     mixed case (`JavaScript:`, `\tjavascript:`).
 *   - Sanitize is idempotent: sanitize(sanitize(x)) === sanitize(x).
 *   - Runs without DOM mounts; safe to call before innerHTML / parseFromString.
 *   - Without DOMParser/xmldom, a linear tokenizer rebuilds every tag under the
 *     same policy (entity/whitespace-decoded scheme checks on href, xlink:href,
 *     src and animation to/from/by/values), caps input at 8 MiB and fails
 *     closed on anything it cannot read with certainty.
 *
 * Public API stays stable; this module is loaded before pattern.js, the
 * pattern designer, file I/O, and pattern-registry in index.html.
 */
(() => {
  const Vectura = (window.Vectura = window.Vectura || {});

  const EMPTY_SVG = '<svg xmlns="http://www.w3.org/2000/svg"/>';

  // Decode HTML numeric/named entities and percent-encoding so attackers can't
  // smuggle `javascript:` past us with `javascript&#58;` or `%6Aavascript:`.
  const decodeForUrlCheck = (raw) => {
    let value = `${raw == null ? '' : raw}`;
    // HTML numeric entities: &#58; &#x3A;
    value = value.replace(/&#x([0-9a-f]+);?/gi, (_, hex) => {
      const cp = parseInt(hex, 16);
      return Number.isFinite(cp) && cp <= 0x10ffff ? String.fromCodePoint(cp) : '';
    });
    value = value.replace(/&#(\d+);?/g, (_, dec) => {
      const cp = parseInt(dec, 10);
      return Number.isFinite(cp) && cp <= 0x10ffff ? String.fromCodePoint(cp) : '';
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

  // Namespaces. Every DOM-path check keys on (namespaceURI, localName), never
  // on tagName / attr.name: those are qualified names, so `<x:script>` with x
  // bound to the SVG namespace (tagName "x:script") or `foo:href` bound to
  // XLink would otherwise slip past a name-keyed allow/deny list.
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const XLINK_NS = 'http://www.w3.org/1999/xlink';
  const XML_NS = 'http://www.w3.org/XML/1998/namespace';
  const XMLNS_NS = 'http://www.w3.org/2000/xmlns/';
  // Elements must be SVG (or unnamespaced, for xmlns-less input). Anything
  // else — XHTML `<h:script>`, MathML, editor metadata — is dropped with its
  // subtree: foreign-namespace content is the classic sanitizer bypass.
  const isAllowedElementNs = (ns) => ns == null || ns === '' || ns === SVG_NS;
  // Attributes may be unnamespaced or XLink/XML/xmlns; others are dropped.
  const ALLOWED_ATTR_NS = new Set([XLINK_NS, XML_NS, XMLNS_NS]);
  const isAllowedAttrNs = (ns) => ns == null || ns === '' || ALLOWED_ATTR_NS.has(ns);

  const nodeLocalName = (node) => {
    const raw = node && (node.localName || node.nodeName || node.tagName || node.name);
    const lower = `${raw || ''}`.toLowerCase();
    const colon = lower.lastIndexOf(':');
    return colon >= 0 ? lower.slice(colon + 1) : lower;
  };

  // Elements that should be dropped wholesale, never just stripped of attrs.
  // <foreignObject>: arbitrary HTML/XSS surface inside SVG.
  // <script>: direct JS execution.
  // <style>: url(javascript:...), expression(), @import — drop instead of building a CSS sanitizer.
  const DROP_TAGS = new Set(['script', 'foreignobject', 'style']);
  const ANIMATION_TAGS = new Set(['animate', 'set', 'animatetransform', 'animatemotion']);

  const elementChildren = (node) => {
    const kids = node.childNodes ? Array.from(node.childNodes) : [];
    return kids.filter((kid) => kid && kid.nodeType === 1);
  };

  const collectAllElements = (root) => {
    const result = [];
    const walk = (node) => {
      if (!node || node.nodeType !== 1) return;
      result.push(node);
      const kids = elementChildren(node);
      for (let i = 0; i < kids.length; i += 1) walk(kids[i]);
    };
    walk(root);
    return result;
  };

  const removeNode = (node) => {
    if (node && node.parentNode) node.parentNode.removeChild(node);
  };

  const removeAttr = (node, attr) => {
    if (typeof node.removeAttributeNode === 'function') {
      node.removeAttributeNode(attr);
    } else if (attr.namespaceURI && typeof node.removeAttributeNS === 'function') {
      node.removeAttributeNS(attr.namespaceURI, attr.localName);
    } else {
      node.removeAttribute(attr.name);
    }
  };

  // Pass 1: remove always-dangerous elements (<script>, <foreignObject>,
  // <style>, under any prefix) and every element outside the SVG namespace.
  // Walk top-down and skip descendants of a removed node.
  const removeDangerousNodes = (root) => {
    if (!root) return;
    const walk = (node) => {
      elementChildren(node).forEach((kid) => {
        if (!isAllowedElementNs(kid.namespaceURI) || DROP_TAGS.has(nodeLocalName(kid))) {
          removeNode(kid);
          return;
        }
        walk(kid);
      });
    };
    walk(root);
  };

  // Pass 2: remove <animate> / <set> elements that target href or carry a
  // javascript: payload in to/from/values. Animation can swap an anchor's href
  // post-mount, so static href checks alone are not enough.
  const removeHostileAnimations = (root) => {
    if (!root) return;
    collectAllElements(root).forEach((node) => {
      if (!ANIMATION_TAGS.has(nodeLocalName(node))) return;
      // `attributeName="foo:href"` resolves through the element's prefixes;
      // any href target (whatever its prefix) is an href hijack.
      const attrName = `${node.getAttribute('attributeName') || ''}`
        .replace(/[\s\u0000-\u001f]/g, '')
        .toLowerCase();
      if (attrName === 'href' || attrName.endsWith(':href')) {
        removeNode(node);
        return;
      }
      const candidates = ['to', 'from', 'by', 'values'].map((a) => node.getAttribute(a) || '');
      // `values` is a semicolon-separated list — split before checking.
      const valueParts = `${node.getAttribute('values') || ''}`.split(';');
      const all = candidates.concat(valueParts);
      if (all.some((v) => looksLikeJsUrl(v))) removeNode(node);
    });
  };

  // Pass 3: handle href (unprefixed or under any prefix) and on* attributes
  // per the policy above, keyed on each attribute's localName + namespace.
  const sanitizeAttributesAndUseElements = (root) => {
    if (!root) return;
    const dropElements = [];
    collectAllElements(root).forEach((node) => {
      const tag = nodeLocalName(node);
      const attrs = node.attributes ? Array.from(node.attributes) : [];
      let useHasExternalRef = false;

      attrs.forEach((attr) => {
        const local = nodeLocalName(attr);

        // 3a. Attributes in an unexpected namespace: strip.
        if (!isAllowedAttrNs(attr.namespaceURI)) {
          removeAttr(node, attr);
          return;
        }

        // 3b. on* event handlers (any prefix): always strip.
        if (local.startsWith('on')) {
          removeAttr(node, attr);
          return;
        }

        // 3c. href in no namespace or XLink (any prefix) handling.
        if (local === 'href' && attr.namespaceURI !== XMLNS_NS) {
          const value = `${attr.value || ''}`;
          if (looksLikeJsUrl(value)) {
            // Preserve existing policy: rewrite to a safe fragment. Keeps
            // <a href="javascript:..."> intact as a non-clickable anchor.
            attr.value = '#';
            if (attr.value !== '#') {
              if (attr.namespaceURI && typeof node.setAttributeNS === 'function') {
                node.setAttributeNS(attr.namespaceURI, attr.name, '#');
              } else {
                node.setAttribute(attr.name, '#');
              }
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
              removeAttr(node, attr);
            }
          }
        }
      });

      if (useHasExternalRef) dropElements.push(node);
    });

    dropElements.forEach(removeNode);
  };

  // ---------------------------------------------------------------------------
  // Non-browser fallback. Used only when DOMParser/XMLSerializer are unavailable
  // (e.g. a CLI Node context without jsdom or xmldom). The browser and the
  // unit-test jsdom env use the DOM path above, which this code never touches.
  //
  // A single forward pass tokenizes the markup and rebuilds every tag from its
  // parsed name and attributes, applying the same policy as the DOM path.
  // Every character is consumed once and every search moves the cursor past
  // what it scanned, so run time is linear (lazy `[\s\S]*?` strips went
  // quadratic on unmatched open tags). Anything the tokenizer cannot read with
  // certainty (an unterminated tag, quote, comment or dropped element, a `<`
  // inside a tag) fails closed to EMPTY_SVG.
  // ---------------------------------------------------------------------------

  // The fallback has no streaming parser; bound memory and work. Applies to
  // the fallback only — the DOM path has no cap.
  const FALLBACK_MAX_INPUT = 8 * 1024 * 1024;
  const FALLBACK_DROP_TAGS = DROP_TAGS;
  const FALLBACK_ANIMATION_TAGS = ANIMATION_TAGS;
  const FALLBACK_ANIMATION_VALUE_ATTRS = new Set(['to', 'from', 'by', 'values']);
  const FALLBACK_URL_ATTRS = new Set(['href', 'src']);
  const NAME_START_RE = /[A-Za-z_]/;
  const TAG_NAME_RE = /[A-Za-z_][\w:.-]*/y;
  const ATTR_NAME_OK_RE = /^[A-Za-z_][\w:.-]*$/;
  const TAG_SPACE_RE = /[\s/]/;
  // Sticky scanners: each consumes a run of characters from `lastIndex`.
  const ATTR_NAME_RUN_RE = /[^\s=/<>]*/y;
  const SPACE_RUN_RE = /\s*/y;
  const UNQUOTED_VALUE_RUN_RE = /[^\s>]*/y;
  const scanRun = (re, text, j) => {
    re.lastIndex = j;
    re.exec(text);
    return re.lastIndex;
  };

  // URL normalisation shared with the DOM path's `looksLikeJsUrl`: decode
  // character references and percent-escapes, then drop ASCII whitespace and
  // control characters the way a browser's URL parser does.
  const compactForSchemeCheck = (raw) => decodeForUrlCheck(raw)
    .replace(/[\s\u0000-\u001f\u007f]/g, '')
    .toLowerCase();
  const HOSTILE_SCHEME_RE = /javascript:|vbscript:|data:text\/html/;
  const hasHostileScheme = (raw) => HOSTILE_SCHEME_RE.test(compactForSchemeCheck(raw));

  const localName = (name) => {
    const lower = `${name}`.toLowerCase();
    const colon = lower.lastIndexOf(':');
    return colon >= 0 ? lower.slice(colon + 1) : lower;
  };

  const escapeAttrValue = (value) => `${value}`.replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const escapeText = (value) => `${value}`.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const FAIL = null;

  // Parse one start or end tag beginning at `text[i] === '<'`.
  // Returns { end, closing, name, attrs, selfClosing } or FAIL.
  const readTag = (text, i) => {
    let j = i + 1;
    const closing = text[j] === '/';
    if (closing) j += 1;
    TAG_NAME_RE.lastIndex = j;
    const nameMatch = TAG_NAME_RE.exec(text);
    if (!nameMatch) return FAIL;
    const name = nameMatch[0];
    j += name.length;
    const attrs = [];
    let selfClosing = false;
    const n = text.length;
    while (j < n) {
      const ch = text[j];
      if (ch === '>') {
        return { end: j + 1, closing, name, attrs, selfClosing };
      }
      if (ch === '<') return FAIL;
      if (TAG_SPACE_RE.test(ch)) {
        selfClosing = ch === '/' && text[j + 1] === '>';
        j += 1;
        continue;
      }
      selfClosing = false;
      // Attribute name: everything up to whitespace, `=`, `/`, `>` or `<`.
      const nameStart = j;
      j = scanRun(ATTR_NAME_RUN_RE, text, j);
      const attrName = text.slice(nameStart, j);
      j = scanRun(SPACE_RUN_RE, text, j);
      let value = null;
      if (text[j] === '=') {
        j = scanRun(SPACE_RUN_RE, text, j + 1);
        const quote = text[j];
        if (quote === '"' || quote === "'") {
          const close = text.indexOf(quote, j + 1);
          if (close < 0) return FAIL;
          value = text.slice(j + 1, close);
          j = close + 1;
        } else {
          const valueStart = j;
          j = scanRun(UNQUOTED_VALUE_RUN_RE, text, j);
          value = text.slice(valueStart, j);
          if (value.indexOf('<') >= 0) return FAIL;
        }
      }
      attrs.push({ name: attrName, value: value == null ? '' : value });
    }
    return FAIL; // ran off the end without `>`
  };

  // Apply the DOM path's policy to one parsed start tag. Returns the rebuilt
  // tag string, or '' to drop the element.
  const rebuildStartTag = (tag) => {
    const local = localName(tag.name);
    const kept = [];
    const seen = new Set();
    let dropElement = false;
    tag.attrs.forEach((attr) => {
      const lower = attr.name.toLowerCase();
      if (!ATTR_NAME_OK_RE.test(attr.name) || seen.has(lower)) return;
      seen.add(lower);
      // Prefix bindings are unknown here, so key on the local part: `x:onload`
      // is a handler and `foo:href` a URL attribute under any prefix.
      const attrLocal = localName(attr.name);
      // on* event handlers: always strip.
      if (attrLocal.startsWith('on')) return;
      const decoded = decodeForUrlCheck(attr.value);
      if (FALLBACK_URL_ATTRS.has(attrLocal)) {
        if (hasHostileScheme(attr.value)) {
          if (attrLocal !== 'src') kept.push(`${attr.name}="#"`);
          return;
        }
        if (attrLocal !== 'src' && !isFragmentRef(decoded)) {
          // External reference: drop <use> wholesale, strip the attribute elsewhere.
          if (local === 'use') dropElement = true;
          return;
        }
      }
      if (FALLBACK_ANIMATION_TAGS.has(local)) {
        if (lower === 'attributename') {
          const target = decoded.replace(/[\s\u0000-\u001f]/g, '').toLowerCase();
          if (target === 'href' || target.endsWith(':href')) dropElement = true;
        }
        if (FALLBACK_ANIMATION_VALUE_ATTRS.has(lower)) {
          // `values` is a semicolon list; split after decoding (`&#59;` is `;`).
          if (decoded.split(';').some((part) => hasHostileScheme(part)) || hasHostileScheme(attr.value)) {
            dropElement = true;
          }
        }
      }
      kept.push(`${attr.name}="${escapeAttrValue(attr.value)}"`);
    });
    if (dropElement) return '';
    const attrText = kept.length ? ` ${kept.join(' ')}` : '';
    return `<${tag.name}${attrText}${tag.selfClosing ? '/' : ''}>`;
  };

  const tokenizeAndRebuild = (text) => {
    const out = [];
    const n = text.length;
    let i = 0;
    // When dropping an element, track nesting of that same element name so
    // its subtree (including nested same-name elements) is skipped.
    let skipName = null;
    let skipDepth = 0;
    const emit = (chunk) => { if (skipName === null) out.push(chunk); };
    while (i < n) {
      const lt = text.indexOf('<', i);
      if (lt < 0) {
        emit(text.slice(i));
        break;
      }
      if (lt > i) emit(text.slice(i, lt));
      i = lt;
      if (text.startsWith('<!--', i)) {
        // Comments are dropped (HTML's `<!-->` / `<!--->` would end early;
        // dropping everything up to `-->` covers both readings).
        const close = text.indexOf('-->', i + 4);
        if (close < 0) return FAIL;
        i = close + 3;
        continue;
      }
      if (text.startsWith('<![CDATA[', i)) {
        const close = text.indexOf(']]>', i + 9);
        if (close < 0) return FAIL;
        emit(escapeText(text.slice(i + 9, close)));
        i = close + 3;
        continue;
      }
      if (text[i + 1] === '?') {
        // Processing instructions (incl. xml-stylesheet): dropped.
        const close = text.indexOf('?>', i + 2);
        if (close < 0) return FAIL;
        i = close + 2;
        continue;
      }
      if (text[i + 1] === '!') {
        // DOCTYPE (with an optional internal subset that may declare
        // entities) and any other declaration: dropped.
        const gt = text.indexOf('>', i + 2);
        if (gt < 0) return FAIL;
        const bracket = text.indexOf('[', i + 2);
        if (bracket >= 0 && bracket < gt) {
          const subsetEnd = text.indexOf(']', bracket + 1);
          if (subsetEnd < 0) return FAIL;
          const end = text.indexOf('>', subsetEnd + 1);
          if (end < 0) return FAIL;
          i = end + 1;
        } else {
          i = gt + 1;
        }
        continue;
      }
      const next = text[i + 1] === '/' ? text[i + 2] : text[i + 1];
      if (next === undefined || !NAME_START_RE.test(next)) {
        // A bare `<` that starts no tag is text.
        emit('&lt;');
        i += 1;
        continue;
      }
      const tag = readTag(text, i);
      if (tag === FAIL) return FAIL;
      i = tag.end;
      const local = localName(tag.name);
      if (skipName !== null) {
        if (local === skipName && !tag.selfClosing) {
          skipDepth += tag.closing ? -1 : 1;
          if (skipDepth === 0) skipName = null;
        }
        continue;
      }
      if (tag.closing) {
        out.push(`</${tag.name}>`);
        continue;
      }
      const rebuilt = FALLBACK_DROP_TAGS.has(local) ? '' : rebuildStartTag(tag);
      if (rebuilt === '') {
        if (!tag.selfClosing) {
          skipName = local;
          skipDepth = 1;
        }
        continue;
      }
      out.push(rebuilt);
    }
    // An element we were dropping never closed: we cannot know where its
    // content ends, so store nothing.
    if (skipName !== null) return FAIL;
    return out.join('');
  };

  const fallbackRegexStrip = (input) => {
    if (input.length > FALLBACK_MAX_INPUT) return EMPTY_SVG;
    const out = tokenizeAndRebuild(input);
    if (out === FAIL) return EMPTY_SVG;
    // Final rejection: anything still dangerous in the rebuilt markup is
    // hostile — store nothing. Only markup is examined: text content that
    // mentions `javascript:` or reads like ` one=1` is legitimate. Each tag
    // runs from `<` to the closing `>` (quoted values may contain `>`), or to
    // end of input if it never closes. Alternatives start on disjoint
    // characters, so matching stays linear. The scheme check reads the
    // decoded, whitespace-stripped form a browser would resolve.
    const TAG_RE = /<(?:[^<>"']|"[^"]*(?:"|$)|'[^']*(?:'|$))*/g;
    // Rebuilt values are always double-quoted with no `"` inside, so blanking
    // them leaves attribute names only for the handler check (a title such
    // as `a online=1` is text, not a handler).
    const isHostileTag = (tag) => /^<\s*\/?\s*(?:[\w.-]+:)?(?:script|style|foreignObject)\b/i.test(tag)
      || /[\s"'/]on[a-z0-9_-]+\s*=/i.test(tag.replace(/"[^"]*"/g, '""'))
      || /javascript:/i.test(tag)
      || (/[:&%]/.test(tag) && hasHostileScheme(tag));
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
    if (!svg || nodeLocalName(svg) !== 'svg' || !isAllowedElementNs(svg.namespaceURI)) return EMPTY_SVG;

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
