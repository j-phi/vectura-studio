/**
 * Algorithm descriptions for the UI.
 */
(() => {
  const Vectura = (window.Vectura = window.Vectura || {});
  window.Vectura.DESCRIPTIONS = {
    flowfield:
      'Particles traverse a Noise Rack vector field, with stacked noise layers driving angle or curl flow for organic, fluid-like textures.',
    lissajous:
      'Parametric curves created by the intersection of two sinusoidal waves. Produces elegant, looping harmonic figures often used in signal physics.',
    harmonograph:
      'Generates damped, multi-pendulum curves by combining decaying sine waves along the X and Y axes.',
    pendula:
      'A kinetic harmonograph studio — damped multi-pendulum curves you set in motion with stacked temporal LFOs (a Motion Rack) that modulate scale, drift, paper rotation, and per-pendulum frequency, detune, amplitude and phase as the virtual plotter loops.',
    wavetable:
      'Generates terrain-like elevations by modulating selectable line structures with one or more stacked noise sources.',
    rings:
      'Generates concentric tree rings with organic variation — uneven spacing, subtle drift, bark texture, and surface details like knots, scars, cracks, and rays.',
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
    terrain:
      'Realism-focused heightfield rendered as scanlines under a selectable perspective (orthographic, one-point, two-point, or isometric), with native generators for ridged mountains, V/U valleys, river traces, and an ocean coastline.',
    shapePack:
      'Packs non-overlapping shapes that can be perfect circles or regular polygons. Supports perspective warping for angular forms.',
    expanded:
      'Static sublayer created from an expanded generation. Use transform and common controls to refine the line.',
    group: 'Group container for expanded line sublayers.',
    svgDistort:
      'Imports an external SVG, converts filled shapes to plottable line fills (hatch, wavelines, contour, etc.), and applies Noise Rack point displacement.',
    spirograph:
      'Rolls primitive gear shapes around a main primitive to generate closed roulette curves with inside, outside, or combined paths.',
    spiral3d:
      'Wraps lines or dot loops around cone, cylinder, and ellipsoid surfaces, with front-only or see-through projection and optional orthographic or perspective view.',
    polyhedron:
      'Draws polyhedral (or imported STL) face bands, edges, and vertex rings with front-face culling, opaque pruning, dashed hidden-line styling, and orthographic or perspective projection.',
    meshTopography:
      'Builds primitive 3D meshes — sphere, torus, cube, cone, ellipsoid, cylinder, capsule, pyramid, superellipsoid, torus knot, or an imported STL — and renders them as projected wireframes or plane-sliced topographic contours, with curve smoothing and orthographic or perspective view.',
    imageSurface:
      'Samples a height source — a built-in relief, a preloaded noise image, an imported picture, or a canvas you paint by hand — and projects it as line relief, deformed mesh, raster topography, or extruded bars.',
  };
})();
