/**
 * Application orchestrator.
 */
(() => {
  const { VectorEngine, Renderer, UI } = window.Vectura || {};

  class App {
    constructor() {
      console.log('Initializing Vectura Studio...');
      this.engine = new VectorEngine();
      this.renderer = new Renderer('main-canvas', this.engine);
      this.ui = new UI(this);

      this.render();
    }

    regen() {
      this.engine.generate(this.engine.activeLayerId);
      this.render();
      this.ui.updateFormula();
    }

    render() {
      this.renderer.draw();
      this.updateStats();
    }

    updateStats() {
      const s = this.engine.getStats();
      const dist = document.getElementById('stat-dist');
      const time = document.getElementById('stat-time');
      if (!dist || !time) return;
      dist.innerText = s.distance;
      time.innerText = s.time;
    }
  }

  window.Vectura = window.Vectura || {};
  window.Vectura.App = App;
})();
