/**
 * Preset library by system.
 */
(() => {
  window.Vectura = window.Vectura || {};
  window.Vectura.PRESETS = [
      {
        id: "camellia-japonica-pink-perfection",
        name: "Camellia Japonica Pink Perfection",
        preset_system: "petalisDesigner",
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
        preset_system: "petalisDesigner",
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
        preset_system: "petalisDesigner",
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
        preset_system: "petalisDesigner",
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
        preset_system: "petalisDesigner",
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
        preset_system: "petalisDesigner",
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
        preset_system: "petalisDesigner",
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
        preset_system: "petalisDesigner",
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
        preset_system: "petalisDesigner",
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
        preset_system: "petalisDesigner",
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
        preset_system: "petalisDesigner",
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
        preset_system: "petalisDesigner",
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
        preset_system: "petalisDesigner",
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
        preset_system: "petalisDesigner",
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
        preset_system: "petalisDesigner",
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
        preset_system: "petalisDesigner",
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
        preset_system: "petalisDesigner",
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
        preset_system: "petalisDesigner",
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
        preset_system: "petalisDesigner",
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
        preset_system: "petalisDesigner",
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
      },
      {
        id: "terrain-alpine",
        name: "Alpine Range",
        preset_system: "terrain",
        params: {
          perspectiveMode: "one-point",
          horizonHeight: 45,
          depthCompression: 70,
          depthSlices: 100,
          xResolution: 280,
          mountainAmplitude: 65,
          mountainFrequency: 0.012,
          mountainOctaves: 6,
          mountainGain: 0.55,
          peakSharpness: 3.0,
          valleyCount: 3,
          valleyDepth: 45,
          valleyWidth: 18,
          valleyShape: 0.7,
          valleyMeander: 55,
          riversEnabled: false,
          oceansEnabled: false
        }
      },
      {
        id: "terrain-rolling-hills",
        name: "Rolling Hills",
        preset_system: "terrain",
        params: {
          perspectiveMode: "one-point",
          horizonHeight: 55,
          depthCompression: 50,
          depthSlices: 70,
          xResolution: 220,
          mountainAmplitude: 25,
          mountainFrequency: 0.006,
          mountainOctaves: 3,
          mountainGain: 0.4,
          peakSharpness: 1.2,
          valleyCount: 1,
          valleyDepth: 15,
          valleyWidth: 35,
          valleyShape: 0.9,
          valleyMeander: 25,
          riversEnabled: false,
          oceansEnabled: false
        }
      },
      {
        id: "terrain-canyon-mesa",
        name: "Canyon Mesa",
        preset_system: "terrain",
        params: {
          perspectiveMode: "one-point",
          horizonHeight: 50,
          depthCompression: 75,
          depthSlices: 90,
          xResolution: 260,
          mountainAmplitude: 50,
          mountainFrequency: 0.005,
          mountainOctaves: 4,
          mountainGain: 0.65,
          peakSharpness: 1.0,
          valleyCount: 2,
          valleyDepth: 60,
          valleyWidth: 14,
          valleyShape: 0.05,
          valleyMeander: 30,
          riversEnabled: true,
          riverCount: 1,
          riverWidth: 4,
          riverDepth: 18,
          riverMeander: 65,
          oceansEnabled: false
        }
      },
      {
        id: "terrain-archipelago",
        name: "Archipelago",
        preset_system: "terrain",
        params: {
          perspectiveMode: "one-point",
          horizonHeight: 50,
          depthCompression: 60,
          depthSlices: 90,
          xResolution: 260,
          mountainAmplitude: 35,
          mountainFrequency: 0.011,
          mountainOctaves: 4,
          peakSharpness: 1.5,
          valleyCount: 4,
          valleyDepth: 40,
          valleyWidth: 22,
          valleyShape: 0.6,
          valleyMeander: 60,
          riversEnabled: false,
          oceansEnabled: true,
          waterLevel: 32,
          drawCoastline: true
        }
      },
      {
        id: "terrain-river-delta",
        name: "River Delta",
        preset_system: "terrain",
        params: {
          perspectiveMode: "one-point",
          horizonHeight: 55,
          depthCompression: 55,
          depthSlices: 80,
          xResolution: 240,
          mountainAmplitude: 30,
          mountainFrequency: 0.007,
          mountainOctaves: 4,
          mountainGain: 0.45,
          peakSharpness: 1.3,
          valleyCount: 2,
          valleyDepth: 35,
          valleyWidth: 25,
          valleyShape: 0.85,
          valleyMeander: 60,
          riversEnabled: true,
          riverCount: 4,
          riverWidth: 3,
          riverDepth: 10,
          riverMeander: 75,
          oceansEnabled: true,
          waterLevel: 18,
          drawCoastline: true
        }
      },
      {
        id: "terrain-tundra-flats",
        name: "Tundra Flats",
        preset_system: "terrain",
        params: {
          perspectiveMode: "orthographic",
          depthScale: 100,
          depthSlices: 60,
          xResolution: 240,
          mountainAmplitude: 18,
          mountainFrequency: 0.005,
          mountainOctaves: 3,
          mountainGain: 0.4,
          peakSharpness: 1.4,
          valleyCount: 0,
          riversEnabled: false,
          oceansEnabled: false
        }
      }

  ];
  window.Vectura.PETALIS_PRESETS = window.Vectura.PRESETS.filter((preset) => {
    const system = preset?.preset_system || 'petalisDesigner';
    return system === 'petalisDesigner';
  });
  window.Vectura.TERRAIN_PRESETS = window.Vectura.PRESETS.filter((preset) => preset?.preset_system === 'terrain');
})();
