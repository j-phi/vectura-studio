/**
 * Vectura.Download — the single place that saves a Blob as a file (TUX-054).
 *
 *   saveBlob(blob, filename) -> Promise<'shared' | 'downloaded' | 'cancelled'>
 *
 * Two paths:
 *   1. Share sheet. On a coarse-pointer device where navigator.canShare accepts a
 *      File, the share sheet opens directly ("Save to Files" on iOS). The
 *      navigator.share call runs synchronously, because it needs the transient
 *      user activation of the tap that started the save.
 *   2. Anchor download. Everywhere else, and after a share failure that is not a
 *      user cancel. The blob URL is revoked REVOKE_DELAY_MS after click(), never
 *      synchronously: iOS Safari can lose the file when the URL dies at once.
 *
 * Call sites must look up window.Vectura.Download when they run, not at load.
 * Do not copy this logic inline; tests/unit/download-blob-guard.test.js enforces it.
 */
(() => {
  const REVOKE_DELAY_MS = 30000;

  // No UA sniffing: iPadOS reports a Mac UA, and simulators report maxTouchPoints 0.
  const prefersShareSheet = (file) => {
    try {
      return typeof navigator.share === 'function'
        && typeof navigator.canShare === 'function'
        && !!navigator.canShare({ files: [file] })
        && !!matchMedia('(pointer: coarse)').matches;
    } catch (_) {
      return false;
    }
  };

  const anchorDownload = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
  };

  const saveBlob = (blob, filename) => {
    let file = null;
    try {
      file = new File([blob], filename, { type: blob.type });
    } catch (_) { /* no File constructor: anchor path only */ }

    if (file && prefersShareSheet(file)) {
      let pending;
      try {
        // Synchronous call: no await or microtask before it (user activation).
        pending = navigator.share({ files: [file] });
      } catch (err) {
        pending = Promise.reject(err);
      }
      return Promise.resolve(pending).then(
        () => 'shared',
        (err) => {
          if (err && err.name === 'AbortError') return 'cancelled';
          anchorDownload(blob, filename);
          return 'downloaded';
        },
      );
    }

    try {
      anchorDownload(blob, filename);
      return Promise.resolve('downloaded');
    } catch (err) {
      return Promise.reject(err);
    }
  };

  const Vectura = (window.Vectura = window.Vectura || {});
  Vectura.Download = { REVOKE_DELAY_MS, prefersShareSheet, saveBlob };
})();
