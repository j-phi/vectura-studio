/**
 * Start Page rail + colophon strip — window.Vectura.UI.StartPageRail.
 *   build() -> { rail, colo }       the open rail (Start / Resume / Recent / launch preference) and the collapsed
 *                                   colophon strip (New, Open, Resume, up to 8 recents with ⌥⌘ numbers)
 *   render({ app, live, entries, liveSvg, liveColorway, colorwayFor }) fills both from the same data.
 * Both stay in the DOM; the page decides which one is shown (collapse state, container width) and marks the other
 * `inert`. The Resume thumbnail is a StartPageInk tile in its colorway.
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};
  const UI = Vectura.UI = Vectura.UI || {};

  const isMac = () => /mac|iphone|ipad|ipod/.test(`${navigator.platform || ''} ${navigator.userAgent || ''}`.toLowerCase());
  const mod = () => (isMac() ? '⌘' : 'Ctrl+');

  const create = () => {
    const { h, pad2 } = Vectura.StartPageDom;
    const I = () => Vectura.StartPageIcons;
    const plus = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
    const folder = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>';
    void I;

    const build = ({ paperKeys, paperLabel }) => {
      const chips = h('div', { class: 'sp-chips', role: 'radiogroup', 'aria-label': 'Paper for new canvas' },
        paperKeys.map((k) => h('button', { type: 'button', role: 'radio', 'data-paper': k, text: paperLabel(k) })));
      const rail = h('aside', { class: 'sp-rail', id: 'sp-rail', 'aria-label': 'Start and recent files' },
        h('section', { class: 'sp-sec' },
          h('div', { class: 'sp-h' }, h('span', { class: 'sp-lbl', text: 'Start' })),
          h('button', { class: 'sp-primary', type: 'button', 'data-act': 'new', title: `New blank canvas (${mod()}N)` },
            h('span', { html: plus }), h('span', { text: 'New blank canvas' }), h('kbd', { text: `${mod()}N` })),
          h('div', { class: 'sp-paper' }, chips, h('div', { class: 'sp-cap', id: 'sp-paper-cap' })),
          h('button', { class: 'sp-line', type: 'button', 'data-act': 'open', title: `Open file (${mod()}O)` },
            h('span', { html: folder }), h('span', { text: 'Open file…' }), h('kbd', { text: `${mod()}O` }))),
        h('section', { class: 'sp-sec sp-recent' },
          h('div', { class: 'sp-h' }, h('span', { class: 'sp-lbl', text: 'Resume' })),
          h('div', { id: 'sp-resume' }),
          h('div', { class: 'sp-h sp-h2' }, h('span', { class: 'sp-lbl', text: 'Recent' }),
            h('span', { class: 'sp-aside' }, h('button', { type: 'button', 'data-act': 'clear-recent', hidden: true, text: 'Clear' }))),
          h('div', { class: 'sp-list', id: 'sp-list' })),
        h('footer', { class: 'sp-foot' },
          h('label', { class: 'sp-chk' },
            h('input', { type: 'checkbox', 'data-pref': 'showOnLaunch' }), h('span', { class: 'sp-box' }), h('span', { text: 'Show Start Page on launch' })),
          h('p', { text: `Re-enable any time in Document Setup (${mod()}K).` })));
      const colo = h('div', { class: 'sp-colo-wrap', id: 'sp-colo-wrap' }, h('div', { class: 'sp-colo-in' },
        h('nav', { class: 'sp-colo', id: 'sp-colo', 'aria-label': 'Start and recent files' })));
      return { rail, colo };
    };

    // A stored thumbnail (SVG or PNG) painted in the work's colorway: strokes become the ink color on the paper, so a
    // raw dark-on-dark thumb never reads as a black block. The plain <img> stays in place until the tint lands and is the
    // permanent fallback, so the thumbnail is never blank.
    const tintInto = (host, src, cw) => {
      const img = h('img', { alt: '', src });
      host.append(img);
      if (!cw || !cw.ink || !cw.paper || typeof document === 'undefined') return;
      const probe = new G.Image();
      probe.onload = () => {
        try {
          const dpr = Math.max(1, Math.min(3, G.devicePixelRatio || 1));
          const nw = probe.naturalWidth || 256;
          const nh = probe.naturalHeight || 256;
          const k = Math.min(1, (512 * dpr) / Math.max(nw, nh));
          const w = Math.max(1, Math.round(nw * k));
          const hh = Math.max(1, Math.round(nh * k));
          const cv = document.createElement('canvas');
          cv.width = w; cv.height = hh;
          const ctx = cv.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(probe, 0, 0, w, hh);
          const px = ctx.getImageData(0, 0, w, hh);
          const d = px.data;
          const bgA = d[3];
          const bg = [d[0], d[1], d[2]];
          const ink = [parseInt(cw.ink.slice(1, 3), 16), parseInt(cw.ink.slice(3, 5), 16), parseInt(cw.ink.slice(5, 7), 16)];
          if (ink.some((v) => Number.isNaN(v))) return;
          for (let i = 0; i < d.length; i += 4) {
            const a = d[i + 3] / 255;
            const dist = bgA > 200 ? Math.max(Math.abs(d[i] - bg[0]), Math.abs(d[i + 1] - bg[1]), Math.abs(d[i + 2] - bg[2])) / 255 : 1;
            const alpha = Math.min(1, dist * 1.8) * a;
            d[i] = ink[0]; d[i + 1] = ink[1]; d[i + 2] = ink[2]; d[i + 3] = Math.round(alpha * 255);
          }
          ctx.putImageData(px, 0, 0);
          cv.className = 'sp-tint';
          cv.setAttribute('aria-hidden', 'true');
          host.style.background = cw.paper;
          host.append(cv);
          img.remove();
        } catch (_) { /* keep the plain image */ }
      };
      probe.src = src;
    };

    const thumbImg = (app, entry, cw) => {
      const src = app.recents?.thumbSrc(entry);
      const th = h('span', { class: 'sp-thumb' });
      if (src) tintInto(th, src, cw);
      return th;
    };

    const rowFor = (app, entry, hint, cw) => h('button', {
      class: 'sp-row', type: 'button', 'data-recent-id': entry.id, title: entry.name, 'aria-label': `Open ${entry.name}`,
    }, thumbImg(app, entry, cw),
    h('span', { class: 'sp-tx' }, h('span', { class: 'sp-nm', text: entry.name }),
      h('span', { class: 'sp-mt', text: `${entry.algorithm} · ${app.recents.relativeTime(entry.lastOpened)}` })),
    hint && isMac() ? h('kbd', { text: `⌥⌘${hint}` }) : null);

    const mountResume = (cth, svg, cw) => {
      const ink = Vectura.StartPageInk;
      if (!ink || !svg || !cw) return;
      ink.mount(cth, { id: `resume:${cw.key || 'x'}`, svg }, { colorway: cw, label: false }).catch(() => {});
    };

    const render = ({ app, root, live, entries, liveSvg, liveColorway, resumeSvg, resumeColorway, colorwayFor }) => {
      const cwOf = (e) => (typeof colorwayFor === 'function' ? colorwayFor(e) : null);
      const resume = root.querySelector('#sp-resume');
      const list = root.querySelector('#sp-list');
      const colo = root.querySelector('#sp-colo');
      const unmount = (el) => { try { Vectura.StartPageInk?.unmount(el); } catch (_) { /* noop */ } };
      resume.querySelectorAll('.sp-cth').forEach(unmount);
      resume.textContent = '';
      list.textContent = '';
      colo.textContent = '';
      let rest = entries;
      let hintBase = 1;
      let resumeLabel = null;
      let resumeAttrs = null;
      if (live) {
        const first = (app.engine.layers.find((l) => l && !l.isGroup) || {}).type;
        const label = (first && Vectura.PresetNameHeuristics?.algoLabel?.(first)) || 'Canvas';
        const n = app.engine.layers.length;
        const cth = h('span', { class: 'sp-cth' }, h('span', { class: 'sp-go', text: 'Return' }));
        resume.append(h('button', { class: 'sp-cont', type: 'button', 'data-resume': 'current' }, cth,
          h('span', { class: 'sp-nm', text: 'Continue current canvas' }),
          h('span', { class: 'sp-mt', text: `${label} · ${n} layer${n === 1 ? '' : 's'}` })));
        mountResume(cth, liveSvg, liveColorway);
        resumeLabel = 'current canvas'; resumeAttrs = { 'data-resume': 'current' };
      } else if (entries.length) {
        const e = entries[0];
        const cth = h('span', { class: 'sp-cth' }, isMac() ? h('kbd', { text: '⌥⌘1' }) : null);
        resume.append(h('button', { class: 'sp-cont', type: 'button', 'data-recent-id': e.id, 'aria-label': `Open ${e.name}` }, cth,
          h('span', { class: 'sp-nm', text: e.name }),
          h('span', { class: 'sp-mt', text: `${e.algorithm} · ${app.recents.relativeTime(e.lastOpened)}` })));
        // the file shows in its own colors (resumeColorway = the file's own paper and ink, or null for the plain thumbnail)
        const resumeSrc = app.recents.thumbSrc(e);
        if (resumeSvg && resumeColorway) mountResume(cth, resumeSvg, resumeColorway);
        else if (resumeSrc) tintInto(cth, resumeSrc, resumeColorway || cwOf(e));
        rest = entries.slice(1);
        hintBase = 2;
        resumeLabel = e.name.replace(/\.vectura$/, ''); resumeAttrs = { 'data-recent-id': e.id };
      } else {
        resume.append(h('div', { class: 'sp-none' }, h('b', { text: 'Nothing to resume yet' }), 'The file you last worked on waits here.'));
      }
      if (rest.length) rest.slice(0, 8).forEach((e, i) => list.append(rowFor(app, e, hintBase + i, cwOf(e))));
      else list.append(h('div', { class: 'sp-none' }, 'Files you open or save show up here and in File → Open Recent.'));
      root.querySelector('[data-act="clear-recent"]').hidden = !entries.length;

      // colophon strip
      const all = live ? entries : entries;
      const acts = h('div', { class: 'sp-co-acts' },
        h('button', { type: 'button', class: 'sp-co-btn pri', 'data-act': 'new', title: 'New blank canvas' }, h('span', { html: plus }), h('span', { text: 'New' }), h('kbd', { text: `${mod()}N` })),
        h('button', { type: 'button', class: 'sp-co-btn', 'data-act': 'open', title: 'Open a file' }, h('span', { html: folder }), h('span', { text: 'Open…' }), h('kbd', { text: `${mod()}O` })),
        resumeLabel ? h('button', { type: 'button', class: 'sp-co-btn res', ...resumeAttrs, title: `Resume ${resumeLabel}` }, h('span', { class: 'k', text: '↵' }), h('span', { text: 'Resume' }), h('b', { text: resumeLabel })) : null);
      const head = h('div', { class: 'sp-co-h' }, h('b', { text: 'Colophon' }), h('span', { text: 'Recently set' }), isMac() ? h('span', { text: '⌥⌘1–8' }) : null, h('span', { class: 'grow' }),
        all.length ? h('button', { type: 'button', 'data-act': 'clear-recent', text: 'Clear' }) : null);
      const rows = all.length
        ? h('ol', { class: 'sp-co-rows' }, all.slice(0, 8).map((e, i) => h('li', {}, h('button', {
          type: 'button', class: 'sp-co-row', 'data-recent-id': e.id, 'aria-label': `Open ${e.name}, ${app.recents.relativeTime(e.lastOpened)}`,
        }, h('span', { class: 'n', text: i ? pad2(i + 1) : '↵' }), thumbImg(app, e, cwOf(e)),
        h('span', { class: 'nm' }, e.name, h('i', { text: `${e.algorithm} · ${app.recents.relativeTime(e.lastOpened)}` })),
        isMac() ? h('kbd', { text: `⌥⌘${i + 1}` }) : null))))
        : h('div', { class: 'sp-co-empty', text: 'Nothing set yet. Files you open or save are listed here and in File → Open Recent.' });
      colo.append(acts, h('div', { class: 'sp-co-list' }, head, rows));
    };

    return { build, render, isMac };
  };

  UI.StartPageRail = { create };
})();
