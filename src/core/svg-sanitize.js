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
 *   - Element ALLOWLIST: only the SVG vocabulary the app renders survives
 *     (ALLOWED_ELEMENTS, matched on exact localName in the SVG namespace).
 *     Anything else — `<xmp>`, `<iframe>`, `<embed>`, `<img>`, `<div>`,
 *     `<math>`, `<noscript>` … even when bound to the SVG namespace — is
 *     dropped with its subtree. Those names are HTML breakout / raw-text
 *     elements once the markup is re-parsed with HTML rules (mXSS).
 *   - <desc>, <title>, <metadata> are HTML integration points: they keep
 *     text only, every child element is dropped.
 *   - CDATA sections become plain text nodes (serialized escaped); comments
 *     and processing instructions are dropped. Both survive XML
 *     serialization verbatim and are read differently by the HTML parser.
 *   - `xml:base` is stripped; any attribute whose value (entity-, percent-
 *     and CSS-escape-decoded) carries javascript:/vbscript:/data:text/html is
 *     removed; `style` is also removed on expression()/@import/binding.
 *   - <animate>/<set>/... are dropped when attributeName targets on*, style,
 *     href, src, base or similar (any prefix / case).
 *   - Final safety net: when a DOM is available, the output is re-parsed
 *     with HTML rules in an inert <template> and re-checked (namespace,
 *     allowlist, handlers, element count). Any difference → EMPTY_SVG.
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
  const ANIMATION_TAGS = new Set(['animate', 'set', 'animatetransform', 'animatemotion', 'animatecolor']);

  // SVG 1.1 / SVG 2 vocabulary the app can use, minus script, foreignObject
  // and style. Exact-case localNames (XML is case-sensitive). Everything else
  // is dropped with its subtree: unknown names in the SVG namespace become
  // live HTML elements (`<embed>`, `<iframe>`, `<xmp>` …) when the markup is
  // re-parsed as HTML.
  const ALLOWED_ELEMENTS = new Set([
    'svg', 'g', 'defs', 'symbol', 'use', 'switch', 'view', 'a',
    'title', 'desc', 'metadata',
    'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
    'text', 'tspan', 'textPath',
    'image', 'marker', 'pattern', 'clipPath', 'mask',
    'linearGradient', 'radialGradient', 'stop', 'solidcolor', 'hatch', 'hatchpath',
    'animate', 'animateMotion', 'animateTransform', 'animateColor', 'set', 'mpath',
    'filter', 'feBlend', 'feColorMatrix', 'feComponentTransfer', 'feComposite',
    'feConvolveMatrix', 'feDiffuseLighting', 'feDisplacementMap', 'feDistantLight',
    'feDropShadow', 'feFlood', 'feFuncA', 'feFuncB', 'feFuncG', 'feFuncR',
    'feGaussianBlur', 'feImage', 'feMerge', 'feMergeNode', 'feMorphology',
    'feOffset', 'fePointLight', 'feSpecularLighting', 'feSpotLight', 'feTile',
    'feTurbulence',
  ]);
  const ALLOWED_ELEMENTS_LOWER = new Set(Array.from(ALLOWED_ELEMENTS, (n) => n.toLowerCase()));
  // HTML integration points (and metadata): text content only.
  const TEXT_ONLY_TAGS = new Set(['title', 'desc', 'metadata']);
  // Animation targets that can carry script or a URL.
  const isDangerousAnimationTarget = (raw) => {
    const compact = `${raw == null ? '' : raw}`.replace(/[\s\u0000-\u001f]/g, '').toLowerCase();
    const colon = compact.lastIndexOf(':');
    const target = colon >= 0 ? compact.slice(colon + 1) : compact;
    return target.startsWith('on') || DANGEROUS_ANIMATION_TARGETS.has(target);
  };
  const DANGEROUS_ANIMATION_TARGETS = new Set([
    'href', 'style', 'src', 'base', 'srcdoc', 'data', 'action', 'formaction', 'xmlns',
  ]);

  // Exact-case local name (prefix stripped), for allowlist checks.
  const exactLocalName = (node) => {
    const raw = `${(node && (node.localName || node.nodeName || node.tagName)) || ''}`;
    const colon = raw.lastIndexOf(':');
    return colon >= 0 ? raw.slice(colon + 1) : raw;
  };

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

  // Pass 1: walk every node. Drop non-allowlisted / non-SVG elements with
  // their subtree, comments, processing instructions and anything that is not
  // an element or text; turn CDATA sections into text nodes; keep text only
  // inside <desc>/<title>/<metadata>.
  const isAllowedElement = (node) => isAllowedElementNs(node.namespaceURI)
    && ALLOWED_ELEMENTS.has(exactLocalName(node))
    && !DROP_TAGS.has(nodeLocalName(node));
  const removeDangerousNodes = (root) => {
    if (!root) return;
    const walk = (node) => {
      const textOnly = TEXT_ONLY_TAGS.has(exactLocalName(node));
      const kids = node.childNodes ? Array.from(node.childNodes) : [];
      kids.forEach((kid) => {
        if (!kid) return;
        if (kid.nodeType === 3) return;
        if (kid.nodeType === 4) {
          // CDATA → plain text (XMLSerializer escapes `<`, `>` and `&`).
          const doc = kid.ownerDocument || node.ownerDocument;
          const text = doc && typeof doc.createTextNode === 'function'
            ? doc.createTextNode(`${kid.data || kid.nodeValue || ''}`)
            : null;
          if (text) node.replaceChild(text, kid);
          else removeNode(kid);
          return;
        }
        if (kid.nodeType !== 1 || textOnly || !isAllowedElement(kid)) {
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
      if (isDangerousAnimationTarget(node.getAttribute('attributeName'))) {
        removeNode(node);
        return;
      }
      const candidates = ['to', 'from', 'by', 'values'].map((a) => node.getAttribute(a) || '');
      // `values` is a semicolon-separated list — split before checking.
      const valueParts = `${node.getAttribute('values') || ''}`.split(';');
      const all = candidates.concat(valueParts);
      if (all.some((v) => looksLikeJsUrl(v) || isHostileAttrValue(v))) removeNode(node);
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

        // 3b'. xml:base can rebase every relative URL onto javascript:.
        if (local === 'base' && (attr.namespaceURI === XML_NS || `${attr.name}`.toLowerCase() === 'xml:base')) {
          removeAttr(node, attr);
          return;
        }

        // 3b''. style: drop on script URLs / expression() / @import / bindings.
        if (local === 'style' && isHostileStyle(attr.value)) {
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
          return;
        }

        // 3d. Any other attribute carrying a script URL (presentation
        // attributes are CSS-parsed: fill="url(javascript:…)").
        if (attr.namespaceURI !== XMLNS_NS && isHostileAttrValue(attr.value)) {
          removeAttr(node, attr);
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

  // CSS reading of a value: comments removed (linear indexOf scan) and
  // `\6a` / `\j` escapes decoded, so `url(java\73 cript:…)` is caught.
  const decodeCssEscapes = (raw) => {
    const text = `${raw == null ? '' : raw}`;
    let out = '';
    let i = 0;
    while (i < text.length) {
      const open = text.indexOf('/*', i);
      if (open < 0) { out += text.slice(i); break; }
      out += text.slice(i, open);
      const close = text.indexOf('*/', open + 2);
      if (close < 0) break;
      i = close + 2;
    }
    return out
      .replace(/\\([0-9a-f]{1,6})[ \t\n\r\f]?/gi, (_, hex) => {
        const cp = parseInt(hex, 16);
        return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : '';
      })
      .replace(/\\([^0-9a-f\n\r\f])/gi, '$1');
  };
  const isHostileAttrValue = (raw) => hasHostileScheme(raw)
    || hasHostileScheme(decodeCssEscapes(decodeForUrlCheck(raw)));
  const isHostileStyle = (raw) => {
    if (isHostileAttrValue(raw)) return true;
    const css = compactForSchemeCheck(decodeCssEscapes(decodeForUrlCheck(raw)));
    return /expression\(|@import|binding|behavior:/.test(css);
  };

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
      if (lower === 'xml:base') return;
      if (attrLocal === 'style' && isHostileStyle(attr.value)) return;
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
      } else if (!lower.startsWith('xmlns') && isHostileAttrValue(attr.value)) {
        return;
      }
      if (FALLBACK_ANIMATION_TAGS.has(local)) {
        if (lower === 'attributename' && isDangerousAnimationTarget(decoded)) dropElement = true;
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
    // Inside <desc>/<title>/<metadata>: text only, child tags are dropped.
    let textOnlyName = null;
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
      const exactLocal = tag.name.slice(tag.name.lastIndexOf(':') + 1);
      const allowed = ALLOWED_ELEMENTS.has(exactLocal) && !FALLBACK_DROP_TAGS.has(local);
      if (tag.closing) {
        if (textOnlyName !== null) {
          if (local === textOnlyName) {
            textOnlyName = null;
            out.push(`</${tag.name}>`);
          }
          continue;
        }
        // Closing tags of dropped (non-allowlisted) elements are dropped too.
        if (allowed) out.push(`</${tag.name}>`);
        continue;
      }
      const rebuilt = !allowed || textOnlyName !== null ? '' : rebuildStartTag(tag);
      if (rebuilt === '') {
        if (!tag.selfClosing) {
          skipName = local;
          skipDepth = 1;
        }
        continue;
      }
      out.push(rebuilt);
      if (TEXT_ONLY_TAGS.has(exactLocal) && !tag.selfClosing) textOnlyName = local;
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

  // Final safety net: read the output the way an HTML sink would
  // (div.innerHTML / svg.innerHTML) inside an inert <template>, and require
  // the same safe tree: SVG namespace, allowlisted names, no handlers, no
  // script URLs, text-only integration points, and as many elements as the
  // XML reading has. A parser differential that survives the passes above
  // fails closed here. Skipped when no DOM is available (Node CLI).
  const htmlReparseIsSafe = (markup, expectedCount) => {
    if (typeof document === 'undefined' || !document || typeof document.createElement !== 'function') return true;
    let root;
    try {
      const tpl = document.createElement('template');
      if (tpl && tpl.content && typeof tpl.content.querySelectorAll === 'function') {
        tpl.innerHTML = markup;
        root = tpl.content;
      } else if (document.implementation && typeof document.implementation.createHTMLDocument === 'function') {
        const inert = document.implementation.createHTMLDocument('');
        inert.body.innerHTML = markup;
        root = inert.body;
      } else {
        return true;
      }
    } catch (_err) {
      return false;
    }
    const elements = Array.from(root.querySelectorAll('*'));
    if (expectedCount != null && elements.length !== expectedCount) return false;
    return elements.every((el) => {
      if (el.namespaceURI !== SVG_NS) return false;
      const name = `${el.localName || ''}`.toLowerCase();
      if (!ALLOWED_ELEMENTS_LOWER.has(name)) return false;
      if (TEXT_ONLY_TAGS.has(name) && el.children && el.children.length) return false;
      return Array.from(el.attributes || []).every((attr) => {
        const local = `${attr.localName || attr.name || ''}`.toLowerCase();
        if (local.startsWith('on')) return false;
        if (local === 'href') return !looksLikeJsUrl(attr.value) && !hasHostileScheme(attr.value);
        return attr.namespaceURI === XMLNS_NS || !isHostileAttrValue(attr.value);
      });
    });
  };

  // Rebuild the sanitized tree with canonical, unprefixed names: elements
  // keep their namespace but lose any prefix (`<x:svg>` would be read by the
  // HTML parser as an unknown HTML element `x:svg`), XLink/XML attributes use
  // the `xlink:` / `xml:` prefixes, and only the default and `xmlns:xlink`
  // declarations are kept. The serialized output then reads the same under
  // XML and HTML rules.
  const rebuildCanonical = (node, doc) => {
    if (node.nodeType === 3) return doc.createTextNode(`${node.data || node.nodeValue || ''}`);
    if (node.nodeType !== 1) return null;
    const ns = node.namespaceURI || null;
    const el = ns ? doc.createElementNS(ns, exactLocalName(node)) : doc.createElement(exactLocalName(node));
    Array.from(node.attributes || []).forEach((attr) => {
      const local = exactLocalName(attr);
      const value = `${attr.value || ''}`;
      try {
        if (attr.namespaceURI === XMLNS_NS) {
          if (attr.name === 'xmlns' && value === (ns || '')) el.setAttributeNS(XMLNS_NS, 'xmlns', value);
          else if (attr.name === 'xmlns:xlink' && value === XLINK_NS) el.setAttributeNS(XMLNS_NS, 'xmlns:xlink', value);
        } else if (attr.namespaceURI === XLINK_NS) {
          el.setAttributeNS(XLINK_NS, `xlink:${local}`, value);
        } else if (attr.namespaceURI === XML_NS) {
          el.setAttributeNS(XML_NS, `xml:${local}`, value);
        } else if (!attr.namespaceURI) {
          el.setAttribute(attr.name, value);
        }
      } catch (_err) {
        // Unrepresentable attribute name: drop it.
      }
    });
    Array.from(node.childNodes || []).forEach((kid) => {
      const copy = rebuildCanonical(kid, doc);
      if (copy) el.appendChild(copy);
    });
    return el;
  };

  const countMarkupElements = (markup) => {
    // Fallback output has no DOM tree; count start tags of the rebuilt markup.
    const matches = `${markup}`.match(/<[A-Za-z_]/g);
    return matches ? matches.length : 0;
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
          const stripped = fallbackRegexStrip(input);
          return htmlReparseIsSafe(stripped, countMarkupElements(stripped)) ? stripped : EMPTY_SVG;
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

    let out;
    let canonical;
    try {
      canonical = rebuildCanonical(svg, doc);
      const serializer = new ActiveXMLSerializer();
      out = serializer.serializeToString(canonical);
    } catch (_err) {
      return EMPTY_SVG;
    }
    return htmlReparseIsSafe(out, collectAllElements(canonical).length) ? out : EMPTY_SVG;
  };

  Vectura.SvgSanitize = { sanitize };
})();
