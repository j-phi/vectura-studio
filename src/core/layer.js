/**
 * Layer data model.
 */
(() => {
  const { ALGO_DEFAULTS, SETTINGS } = window.Vectura || {};

  class Layer {
    constructor(id, type = 'flowfield', name) {
      this.id = id;
      this.type = type;
      this.name = name;
      this.params = JSON.parse(JSON.stringify(ALGO_DEFAULTS[type] || ALGO_DEFAULTS.flowfield));
      this.params.seed = Math.floor(Math.random() * 99999);
      this.params.posX = 0;
      this.params.posY = 0;
      this.params.scaleX = 1;
      this.params.scaleY = 1;
      this.params.rotation = 0;
      this.paramStates = {};
      this.color = '#e4e4e7';
      this.strokeWidth = SETTINGS?.strokeWidth ?? 0.3;
      this.lineCap = 'round';
      this.visible = true;
      this.paths = [];
    }
  }

  window.Vectura = window.Vectura || {};
  window.Vectura.Layer = Layer;
})();
