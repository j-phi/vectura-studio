/**
 * Preset library by system.
 */
(() => {
  window.Vectura = window.Vectura || {};
  window.Vectura.PRESETS = [
      {
        id: "camellia-japonica-pink-perfection",
        name: "Camellia Japonica Pink Perfection",
        preset_system: "petalis",
        params: {
          petalProfile: "oval",
          petalScale: 28,
          petalWidthRatio: 0.55,
          count: 320,
          ringMode: "dual",
          innerCount: 140,
          outerCount: 200,
          ringSplit: 0.4,
          centerType: "disk",
          centerRadius: 6,
          innerShading: true,
          innerDensity: 0.5
        }
      },
      {
        id: "fenestraria-aurantiaca",
        name: "Fenestraria Aurantiaca",
        preset_system: "petalis",
        params: {
          petalProfile: "spoon",
          petalScale: 22,
          petalWidthRatio: 0.7,
          count: 120,
          spiralTightness: 0.8,
          budMode: true,
          budRadius: 0.28,
          centerType: "disk",
          centerRadius: 4
        }
      },
      {
        id: "pachyphytum-compactum",
        name: "Pachyphytum Compactum",
        preset_system: "petalis",
        params: {
          petalProfile: "lanceolate",
          petalScale: 24,
          petalWidthRatio: 0.42,
          count: 160,
          spiralTightness: 1.2,
          edgeWaveAmp: 0,
          centerType: "dome",
          centerRadius: 6
        }
      },
      {
        id: "echeveria-agavoides",
        name: "Echeveria Agavoides",
        preset_system: "petalis",
        params: {
          petalProfile: "lanceolate",
          petalScale: 26,
          petalWidthRatio: 0.38,
          count: 200,
          spiralTightness: 1.45,
          basePinch: 0.2,
          centerType: "disk",
          centerRadius: 5
        }
      },
      {
        id: "dahlia-cornel",
        name: "Dahlia Cornel",
        preset_system: "petalis",
        params: {
          petalProfile: "teardrop",
          petalScale: 30,
          petalWidthRatio: 0.5,
          count: 420,
          ringMode: "dual",
          innerCount: 180,
          outerCount: 260,
          ringSplit: 0.35,
          innerShading: true,
          innerDensity: 0.6,
          outerShading: true,
          outerDensity: 0.4
        }
      },
      {
        id: "dahlia-ivanetti",
        name: "Dahlia Ivanetti",
        preset_system: "petalis",
        params: {
          petalProfile: "teardrop",
          petalScale: 32,
          petalWidthRatio: 0.46,
          count: 380,
          edgeWaveAmp: 0.08,
          edgeWaveFreq: 5,
          innerShading: true,
          innerDensity: 0.55
        }
      },
      {
        id: "rosa-chinensis-mutabilis",
        name: "Rosa Chinensis Mutabilis",
        preset_system: "petalis",
        params: {
          petalProfile: "heart",
          petalScale: 34,
          petalWidthRatio: 0.6,
          count: 160,
          centerSizeMorph: -0.4,
          centerShapeMorph: 0.4,
          ringMode: "dual",
          innerCount: 60,
          outerCount: 120,
          ringSplit: 0.32
        }
      },
      {
        id: "chrysanthemum-morifolium",
        name: "Chrysanthemum Morifolium",
        preset_system: "petalis",
        params: {
          petalProfile: "lanceolate",
          petalScale: 26,
          petalWidthRatio: 0.25,
          count: 520,
          edgeWaveAmp: 0.02,
          centerType: "disk",
          centerRadius: 5
        }
      },
      {
        id: "ranunculus-asiaticus",
        name: "Ranunculus Asiaticus",
        preset_system: "petalis",
        params: {
          petalProfile: "oval",
          petalScale: 26,
          petalWidthRatio: 0.58,
          count: 260,
          ringMode: "dual",
          innerCount: 120,
          outerCount: 160,
          ringSplit: 0.4,
          centerType: "dome"
        }
      },
      {
        id: "anemone-coronaria",
        name: "Anemone Coronaria",
        preset_system: "petalis",
        params: {
          petalProfile: "oval",
          petalScale: 36,
          petalWidthRatio: 0.62,
          count: 120,
          centerType: "starburst",
          centerRadius: 8,
          centerDensity: 40,
          centerConnectors: true,
          connectorCount: 32,
          connectorLength: 12
        }
      },
      {
        id: "zinnia-elegans",
        name: "Zinnia Elegans",
        preset_system: "petalis",
        params: {
          petalProfile: "oval",
          petalScale: 30,
          petalWidthRatio: 0.5,
          count: 240,
          outerShading: true,
          outerDensity: 0.5,
          centerType: "disk",
          centerRadius: 7
        }
      },
      {
        id: "lotus-nelumbo-nucifera",
        name: "Lotus Nelumbo Nucifera",
        preset_system: "petalis",
        params: {
          petalProfile: "spoon",
          petalScale: 42,
          petalWidthRatio: 0.65,
          count: 120,
          ringMode: "dual",
          innerCount: 36,
          outerCount: 90,
          ringSplit: 0.3,
          centerType: "disk",
          centerRadius: 10,
          centerConnectors: true,
          connectorCount: 24,
          connectorLength: 14
        }
      },
      {
        id: "hellebore-niger",
        name: "Helleborus Niger",
        preset_system: "petalis",
        params: {
          petalProfile: "heart",
          petalScale: 38,
          petalWidthRatio: 0.7,
          count: 80,
          centerType: "dot",
          centerRadius: 6,
          innerShading: true,
          innerDensity: 0.4
        }
      },
      {
        id: "gerbera-jamesonii",
        name: "Gerbera Jamesonii",
        preset_system: "petalis",
        params: {
          petalProfile: "lanceolate",
          petalScale: 34,
          petalWidthRatio: 0.32,
          count: 260,
          centerType: "starburst",
          centerRadius: 7,
          centerDensity: 48
        }
      },
      {
        id: "tulipa-gesneriana",
        name: "Tulipa Gesneriana",
        preset_system: "petalis",
        params: {
          petalProfile: "spoon",
          petalScale: 44,
          petalWidthRatio: 0.6,
          count: 60,
          budMode: true,
          budRadius: 0.22,
          centerType: "disk",
          centerRadius: 5
        }
      },
      {
        id: "iris-germanica",
        name: "Iris Germanica",
        preset_system: "petalis",
        params: {
          petalProfile: "lanceolate",
          petalScale: 40,
          petalWidthRatio: 0.4,
          count: 90,
          tipTwist: 0.8,
          rotationJitter: 14,
          centerType: "disk",
          centerRadius: 5
        }
      },
      {
        id: "gardenia-jasminoides",
        name: "Gardenia Jasminoides",
        preset_system: "petalis",
        params: {
          petalProfile: "oval",
          petalScale: 32,
          petalWidthRatio: 0.58,
          count: 200,
          ringMode: "dual",
          innerCount: 80,
          outerCount: 140,
          ringSplit: 0.35,
          centerType: "dome"
        }
      },
      {
        id: "plumeria-rubra",
        name: "Plumeria Rubra",
        preset_system: "petalis",
        params: {
          petalProfile: "oval",
          petalScale: 46,
          petalWidthRatio: 0.72,
          count: 5,
          spiralMode: "custom",
          customAngle: 72,
          centerType: "disk",
          centerRadius: 9,
          outerShading: true,
          outerDensity: 0.35
        }
      },
      {
        id: "cosmos-bipinnatus",
        name: "Cosmos Bipinnatus",
        preset_system: "petalis",
        params: {
          petalProfile: "lanceolate",
          petalScale: 38,
          petalWidthRatio: 0.45,
          count: 8,
          spiralMode: "custom",
          customAngle: 45,
          centerType: "dot",
          centerRadius: 7
        }
      },
      {
        id: "protea-cynaroides",
        name: "Protea Cynaroides",
        preset_system: "petalis",
        params: {
          petalProfile: "lanceolate",
          petalScale: 36,
          petalWidthRatio: 0.38,
          count: 280,
          edgeWaveAmp: 0.12,
          edgeWaveFreq: 6,
          centerType: "filament",
          centerRadius: 10,
          centerDensity: 40
        }
      }
    
  ];
  window.Vectura.PETALIS_PRESETS = window.Vectura.PRESETS.filter((preset) => preset.preset_system === 'petalis');
})();
