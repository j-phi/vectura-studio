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
    if (S && S.showTourOnFirstLaunch && !S.tourSeen) {
      setTimeout(() => {
        window.Vectura.Tutorial?.start(() => {
          S.tourSeen = true;
          app.persistPreferences?.();
        });
      }, 800);
    }
  });
})();
