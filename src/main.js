import { App } from './app/app.js';
import { installWindowVecturaShim } from './compat/vectura-shim.js';

window.addEventListener('load', () => {
  installWindowVecturaShim();
  const app = new App();
  window.app = app;
});
