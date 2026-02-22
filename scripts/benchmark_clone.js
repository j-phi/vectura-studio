// Benchmark script to compare JSON.parse(JSON.stringify) vs structuredClone

const jsonClone = (obj) => JSON.parse(JSON.stringify(obj));
// structuredClone is available globally in Node 22

const complexConfig = {
  lines: 130,
  noiseType: 'simplex',
  noiseImageId: '',
  noiseImageName: '',
  noises: [
    {
      id: 'noise-1',
      enabled: true,
      type: 'simplex',
      blend: 'add',
      amplitude: 9,
      zoom: 0.02,
      freq: 1.0,
      angle: 0,
      shiftX: 0,
      shiftY: 0,
      tileMode: 'off',
      tilePadding: 0,
      patternScale: 1,
      warpStrength: 1,
      cellularScale: 1,
      cellularJitter: 1,
      stepsCount: 5,
      seed: 0,
      noiseStyle: 'linear',
      noiseThreshold: 0,
      imageWidth: 1,
      imageHeight: 1,
      microFreq: 0,
      imageInvertColor: false,
      imageInvertOpacity: false,
      imageId: '',
      imageName: '',
      imagePreview: '',
      imageAlgo: 'luma',
      imageEffects: [
        {
          id: 'effect-1',
          enabled: true,
          mode: 'luma',
          imageBrightness: 0,
          imageLevelsLow: 0,
          imageLevelsHigh: 1,
          imageEmbossStrength: 1,
          imageSharpenAmount: 1,
          imageSharpenRadius: 1,
          imageMedianRadius: 1,
          imageGamma: 1,
          imageContrast: 1,
          imageSolarize: 0.5,
          imagePixelate: 12,
          imageDither: 0.5,
          imageThreshold: 0.5,
          imagePosterize: 5,
          imageBlur: 0,
          imageBlurRadius: 0,
          imageBlurStrength: 1,
          imageEdgeBlur: 0,
          imageHighpassRadius: 1,
          imageHighpassStrength: 1,
          imageLowpassRadius: 2,
          imageLowpassStrength: 0.6,
          imageVignetteStrength: 0.4,
          imageVignetteRadius: 0.85,
          imageCurveStrength: 0.4,
          imageBandCenter: 0.5,
          imageBandWidth: 0.3,
        },
      ],
      imageThreshold: 0.5,
      imagePosterize: 5,
      imageBlur: 0,
      imageBlurRadius: 0,
      imageBlurStrength: 1,
      imageBrightness: 0,
      imageLevelsLow: 0,
      imageLevelsHigh: 1,
      imageEmbossStrength: 1,
      imageSharpenAmount: 1,
      imageSharpenRadius: 1,
      imageMedianRadius: 1,
      imageGamma: 1,
      imageContrast: 1,
      imageSolarize: 0.5,
      imagePixelate: 12,
      imageDither: 0.5,
      noiseStyle: 'linear',
      noiseThreshold: 0,
      imageWidth: 1,
      imageHeight: 1,
      microFreq: 0,
      polygonRadius: 2,
      polygonSides: 6,
      polygonRotation: 0,
      polygonOutline: 0,
      polygonEdgeRadius: 0,
    },
  ],
  imageAlgo: 'luma',
  imageThreshold: 0.5,
  imagePosterize: 5,
  imageBlur: 0,
  amplitude: 9,
  zoom: 0.02,
  tilt: 0,
  gap: 1.0,
  freq: 1.0,
  lineOffset: 180,
  continuity: 'none',
  dampenExtremes: false,
  overlapPadding: 0,
  flatCaps: false,
  edgeFadeMode: 'both',
  edgeFade: 0,
  edgeFadeThreshold: 0,
  edgeFadeFeather: 0,
  noiseAngle: 0,
  verticalFade: 0,
  verticalFadeThreshold: 0,
  verticalFadeFeather: 0,
  verticalFadeMode: 'both',
  smoothing: 0,
  simplify: 0,
  curves: false,
};

// Simulate a large array of points
const largeArray = new Array(10000).fill(0).map((_, i) => ({ x: Math.random(), y: Math.random(), i }));

function runBenchmark(name, fn, data, iterations) {
  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    fn(data);
  }
  const end = performance.now();
  return (end - start);
}

console.log('--- Benchmarking Config Object (10000 iterations) ---');
const timeJsonConfig = runBenchmark('JSON.parse(JSON.stringify)', jsonClone, complexConfig, 10000);
console.log(`JSON Clone:       ${timeJsonConfig.toFixed(2)}ms`);

const timeStructConfig = runBenchmark('structuredClone', structuredClone, complexConfig, 10000);
console.log(`structuredClone:  ${timeStructConfig.toFixed(2)}ms`);

const improvementConfig = ((timeJsonConfig - timeStructConfig) / timeJsonConfig * 100).toFixed(2);
console.log(`Improvement:      ${improvementConfig}%`);


console.log('\n--- Benchmarking Large Array (1000 iterations) ---');
const timeJsonArray = runBenchmark('JSON.parse(JSON.stringify)', jsonClone, largeArray, 1000);
console.log(`JSON Clone:       ${timeJsonArray.toFixed(2)}ms`);

const timeStructArray = runBenchmark('structuredClone', structuredClone, largeArray, 1000);
console.log(`structuredClone:  ${timeStructArray.toFixed(2)}ms`);

const improvementArray = ((timeJsonArray - timeStructArray) / timeJsonArray * 100).toFixed(2);
console.log(`Improvement:      ${improvementArray}%`);
