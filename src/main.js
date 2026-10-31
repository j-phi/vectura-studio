(() => {
  window.addEventListener('load', () => {
    if (!window.Vectura || !window.Vectura.App) {
      console.warn('[Vectura] App failed to load. Check script order.');
      return;
    }
    // The Start Page covers the editor on launch, so the editor holds back its paper texture build until the page has
    // settled (Renderer#_paperHeld). Cleared below when the page does not open.
    window.Vectura.bootCover = true;
    const app = new window.Vectura.App();
    window.app = app;
    const UI = window.Vectura.UI;
    if (!UI || !UI.MultiSelectionPanel || !UI.PathfinderPanel || !UI.PaintBucketPanel) {
      console.warn('[Vectura] Critical UI panels failed to load.');
    }
    UI?.MultiSelectionPanel?.init?.(app);
    UI?.PathfinderPanel?.init?.(app);
    UI?.PaintBucketPanel?.init?.(app);
    const S = window.Vectura.SETTINGS;
    // Start Page on launch (the automation rule lives in App#shouldShowStartPageOnLaunch).
    const startPageShown = app.showStartPageOnLaunchIfWanted?.() === true;
    if (!startPageShown) {
      document.documentElement.removeAttribute('data-sp-boot'); // no page: the boot cover must not stay behind
      window.Vectura.bootCover = false;
      if (app.renderer?.ready) app.render();
    } else {
      // Once the page closes the editor is no longer covered: nothing may stay held back.
      window.addEventListener('vectura:start-page-hidden', () => { window.Vectura.bootCover = false; }, { once: true });
    }
    if (S && S.showTourOnFirstLaunch && !S.tourSeen) {
      const startTour = () => {
        setTimeout(() => {
          window.Vectura.Tutorial?.start(() => {
            S.tourSeen = true;
            app.persistPreferences?.();
          });
        }, 800);
      };
      // The tour points at the editor, so it waits until the Start Page has been dismissed.
      if (startPageShown) window.addEventListener('vectura:start-page-hidden', startTour, { once: true });
      else startTour();
    }
  });
})();
