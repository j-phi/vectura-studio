(() => {
  window.addEventListener('load', () => {
    if (!window.Vectura || !window.Vectura.App) {
      console.warn('[Vectura] App failed to load. Check script order.');
      return;
    }
    window.app = new window.Vectura.App();
  });
})();
