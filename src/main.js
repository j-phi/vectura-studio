(() => {
  window.addEventListener('load', () => {
    if (!window.Vectura || !window.Vectura.App) {
      console.warn('[Vectura] App failed to load. Check script order.');
      return;
    }
    const app = new window.Vectura.App();
    window.app = app;
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
