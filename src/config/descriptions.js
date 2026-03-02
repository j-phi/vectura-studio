/**
 * Algorithm descriptions for the UI.
 */
(() => {
  window.Vectura = window.Vectura || {};
  window.Vectura.DESCRIPTIONS = {
    flowfield:
      'Particles traverse a Noise Rack vector field, with stacked noise layers driving angle or curl flow for organic, fluid-like textures.',
    lissajous:
      'Parametric curves created by the intersection of two sinusoidal waves. Produces elegant, looping harmonic figures often used in signal physics.',
    harmonograph:
      'Generates damped, multi-pendulum curves by combining decaying sine waves along the X and Y axes.',
    wavetable:
      'Generates terrain-like elevations by modulating selectable line structures with one or more stacked noise sources, including a horizon perspective mode with independent horizontal/vertical line counts, linked fan-density control, configurable skyline relief, and compressed distant terrain.',
    rings:
      'Creates concentric rings with Noise Rack radius modulation, including stacked noise sampled from a world-space XY field, seam-corrected path sampling along each ring, or the legacy ring-local orbit field.',
    topo:
      'Builds contour lines from a Noise Rack height field, with stacked layers driving the contour extraction and mapping modes.',
    petalisDesigner:
      'Generates layered radial petals with an embedded Petal Designer panel for direct outer/inner profile drawing, live shading iteration, and per-modifier Noise Rack stacks for drift and geometry modulation.',
    rainfall:
      'Simulates falling rain traces with optional droplet shapes, wind influence, and silhouette masking.',
    spiral:
      'An Archimedean spiral distorted by noise. Can create vinyl-like grooves or organic coil patterns.',
    grid:
      'A rectilinear mesh deformed by a stacked Noise Rack field. Supports warping vertices or displacing rows/cols for glitch effects.',
    phylla:
      'Arranges points in a spiral pattern based on the golden angle, with stacked Noise Rack fields adding controlled organic drift.',
    boids:
      'Simulates the flocking behavior of birds (Agents). Rules for Separation, Alignment, and Cohesion create complex emergent movement trails.',
    attractor:
      'Plots Strange Attractors (Lorenz, Aizawa). These represent chaotic systems where trajectories orbit a fractal set of states.',
    hyphae:
      'Simulates organic growth (like fungi or roots) using a branching algorithm. Sources grow segments and fork based on probability.',
    shapePack:
      'Packs non-overlapping shapes that can be perfect circles or regular polygons. Supports perspective warping for angular forms.',
    expanded:
      'Static sublayer created from an expanded generation. Use transform and common controls to refine the line.',
    group: 'Group container for expanded line sublayers.',
  };
})();
