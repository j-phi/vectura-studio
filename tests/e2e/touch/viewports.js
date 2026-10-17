// Single source of truth for touch viewports (TUX-057, docs/touch-ux-requirements.md §1.2).
// Assumption: "iPhone 18 Pro" = 402x874 @3x. Change only these constants if the device differs.
const IOS_VERSION = '18_5';
const IPHONE_UA = `Mozilla/5.0 (iPhone; CPU iPhone OS ${IOS_VERSION} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1`;
const IPAD_UA = `Mozilla/5.0 (iPad; CPU OS ${IOS_VERSION} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1`;

// short name -> { width, height, dpr, ua }
const DEVICES = {
  iPadP: { width: 834, height: 1210, dpr: 2, ua: IPAD_UA },
  iPadL: { width: 1210, height: 834, dpr: 2, ua: IPAD_UA },
  iPhP: { width: 402, height: 874, dpr: 3, ua: IPHONE_UA },
  iPhL: { width: 874, height: 402, dpr: 3, ua: IPHONE_UA },
  'iPhP-c': { width: 402, height: 750, dpr: 3, ua: IPHONE_UA },
  'iPhL-c': { width: 874, height: 330, dpr: 3, ua: IPHONE_UA },
  coarseWide: { width: 1366, height: 1024, dpr: 2, ua: IPAD_UA },
};

// project name -> { device, engine }
const CHROMIUM_PROJECTS = {
  'touch-ipad-portrait': 'iPadP',
  'touch-ipad-landscape': 'iPadL',
  'touch-iphone-portrait': 'iPhP',
  'touch-iphone-landscape': 'iPhL',
  'touch-iphone-portrait-chrome': 'iPhP-c',
  'touch-iphone-landscape-chrome': 'iPhL-c',
  'touch-coarse-wide': 'coarseWide',
};
const WEBKIT_PROJECTS = {
  'webkit-ipad-portrait': 'iPadP',
  'webkit-ipad-landscape': 'iPadL',
  'webkit-iphone-portrait': 'iPhP',
  'webkit-iphone-landscape': 'iPhL',
};

const PROJECTS = {};
Object.entries(CHROMIUM_PROJECTS).forEach(([n, d]) => { PROJECTS[n] = { device: d, engine: 'chromium', ...DEVICES[d] }; });
Object.entries(WEBKIT_PROJECTS).forEach(([n, d]) => { PROJECTS[n] = { device: d, engine: 'webkit', ...DEVICES[d] }; });

module.exports = { DEVICES, CHROMIUM_PROJECTS, WEBKIT_PROJECTS, PROJECTS, IPHONE_UA, IPAD_UA };
