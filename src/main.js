(() => {
  window.addEventListener('load', () => {
    if (!window.Vectura || !window.Vectura.App) {
      console.warn('[Vectura] App failed to load. Check script order.');
      return;
    }
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
