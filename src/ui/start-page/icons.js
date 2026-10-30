/**
 * Start Page icons — window.Vectura.StartPageIcons. Inline Lucide paths (24x24, currentColor stroke). The app's
 * shared registry (src/ui/icons.js) carries no settings / rail / pause / play glyphs, so these live here.
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};
  const lu = (name, body) => `<svg class="sp-ico sp-ico-${name}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
  Vectura.StartPageIcons = Object.freeze({
    railClose: lu('rail-close', '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M15 3v18"/><path d="m8 9 3 3-3 3"/>'), // Lucide panel-right-close
    railOpen: lu('rail-open', '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M15 3v18"/><path d="m10 15-3-3 3-3"/>'), // Lucide panel-right-open
    gear: lu('gear', '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>'), // Lucide settings
    pause: lu('pause', '<circle cx="12" cy="12" r="10"/><line x1="10" x2="10" y1="15" y2="9"/><line x1="14" x2="14" y1="15" y2="9"/>'), // Lucide circle-pause
    play: lu('play', '<circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/>'), // Lucide circle-play
    pencil: lu('pencil', '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>'), // Lucide pencil
    dice: '<svg class="sp-ico sp-ico-dice" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true" focusable="false"><rect x="2.5" y="2.5" width="11" height="11" rx="2.2"/><g fill="currentColor" stroke="none"><circle cx="5.6" cy="5.6" r=".9"/><circle cx="10.4" cy="10.4" r=".9"/><circle cx="10.4" cy="5.6" r=".9"/><circle cx="5.6" cy="10.4" r=".9"/><circle cx="8" cy="8" r=".9"/></g></svg>',
  });
})();
