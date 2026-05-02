/**
 * SVG Import algorithm — imports external SVG geometry, converts filled shapes
 * to plottable line fills, and applies Noise Rack point displacement.
 */
(() => {
  window.Vectura = window.Vectura || {};
  window.Vectura.AlgorithmRegistry = window.Vectura.AlgorithmRegistry || {};

  // At default zoom=0.01, 4000 world-units = 40 noise-space units (far beyond simplex coherence)
  const NOISE_OFFSET = 4000;

  // Classify paths as outer contours vs compound-path holes, compute the correct boolean
  // silhouette, and return a fill-args object compatible with generatePatternFillPaths.
  // Holes are detected by containment: a path whose centroid lies inside a sibling path.
  // Outer paths are unioned so that cross-letter overlaps fill rather than cancel.
  const buildFillArgs = (paths) => {
    if (paths.length === 1) return { region: paths[0] };

    const FB = window.Vectura?.FillBoolean;
    const polyContains = window.Vectura?.AlgorithmRegistry?._polyContainsPoint;
    if (!FB?.union || !FB?.ringToMultiPolygon || !polyContains) {
      return { regions: paths };
    }

    const outerPaths = [];
    const holePaths = [];
    paths.forEach((path, i) => {
      const cx = path.reduce((s, pt) => s + pt.x, 0) / path.length;
      const cy = path.reduce((s, pt) => s + pt.y, 0) / path.length;
      const isHole = paths.some((other, j) => j !== i && polyContains(other, cx, cy));
      (isHole ? holePaths : outerPaths).push(path);
    });

    const outerGeoms = outerPaths.map((p) => FB.ringToMultiPolygon(p)).filter((g) => g.length);
    if (!outerGeoms.length) return { regions: paths };

    const united = outerGeoms.length === 1 ? outerGeoms[0] : FB.union(...outerGeoms);
    if (!united?.length) return { regions: paths };

    const holeGeoms = holePaths.map((p) => FB.ringToMultiPolygon(p)).filter((g) => g.length);
    const finalGeom = holeGeoms.length ? FB.difference(united, ...holeGeoms) : united;
    if (!finalGeom?.length) return { regions: paths };

    const resultPaths = FB.multiPolygonToPaths(finalGeom);
    if (!resultPaths.length) return { regions: paths };

    return resultPaths.length === 1 ? { region: resultPaths[0] } : { regions: resultPaths };
  };

  window.Vectura.AlgorithmRegistry.svgDistort = {
    generate(p, rng, noise, bounds) {
      if (!Array.isArray(p.importedGroups) || !p.importedGroups.length) return [];

      const { m, dW, dH } = bounds;
      const generateFill = window.Vectura.AlgorithmRegistry?._generatePatternFillPaths;

      // Compute bounding box across all imported geometry
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      p.importedGroups.forEach((group) => {
        (group.paths || []).forEach((path) => {
          path.forEach((pt) => {
            if (pt.x < minX) minX = pt.x;
            if (pt.y < minY) minY = pt.y;
            if (pt.x > maxX) maxX = pt.x;
            if (pt.y > maxY) maxY = pt.y;
          });
        });
      });
      if (!Number.isFinite(minX)) return [];

      const srcW = maxX - minX;
      const srcH = maxY - minY;
      const srcCx = (minX + maxX) / 2;
      const srcCy = (minY + maxY) / 2;

      let autoScale = 1;
      if (p.autoFit !== false && srcW > 0 && srcH > 0) {
        autoScale = Math.min(dW / srcW, dH / srcH);
      }
      const totalScale = autoScale * (p.scale ?? 1);
      const targetCx = m + dW / 2 + (p.offsetX ?? 0);
      const targetCy = m + dH / 2 + (p.offsetY ?? 0);

      const tx = (pt) => ({
        x: targetCx + (pt.x - srcCx) * totalScale,
        y: targetCy + (pt.y - srcCy) * totalScale,
      });

      const outlinePaths = [];
      const fillPathsList = [];

      p.importedGroups.forEach((group) => {
        const scaledPaths = (group.paths || []).map((path) => path.map(tx));

        if (p.showOutlines !== false) {
          scaledPaths.forEach((path) => outlinePaths.push(path));
        }

        if (group.isClosed && p.fillMode && p.fillMode !== 'none' && generateFill) {
          const validPaths = scaledPaths.filter((path) => path.length >= 3);
          if (validPaths.length > 0) {
            const spacing = 64 / (p.fillDensity ?? 8);
            const fillArgs = buildFillArgs(validPaths);
            const fills = generateFill({
              fillType: p.fillMode,
              density: spacing,
              angle: p.fillAngle ?? 0,
              amplitude: p.fillAmplitude ?? 1.0,
              dotSize: p.fillDotSize ?? 1.0,
              padding: p.fillPadding ?? 0,
              shiftX: p.fillShiftX ?? 0,
              shiftY: p.fillShiftY ?? 0,
              dotPattern: p.fillDotPattern ?? 'brick',
              centralDensity: p.fillRadialCentralDensity ?? 1.0,
              outerDiameter: p.fillRadialOuterDiameter ?? 1.0,
              axes: p.fillAxes ?? 3,
              polyTile: p.fillPolyTile ?? 'grid',
              ...fillArgs,
            });
            fills.forEach((fp) => fillPathsList.push(fp));
          }
        }
      });

      const allPaths = [...outlinePaths, ...fillPathsList];

      // Noise displacement
      const noiseLayers = (Array.isArray(p.noises) ? p.noises : []).filter(
        (nl) => nl?.enabled !== false,
      );

      if (noiseLayers.length > 0) {
        const noiseTarget = p.noiseTarget ?? 'all';
        const pathsToDisplace =
          noiseTarget === 'outlines' ? outlinePaths
          : noiseTarget === 'fills' ? fillPathsList
          : allPaths;

        const rack = window.Vectura.NoiseRack.createEvaluator({ noise, seed: p.seed ?? 0 });
        const maxAmp =
          noiseLayers.reduce((sum, nl) => sum + Math.abs(nl.amplitude ?? 0), 0) || 1;

        pathsToDisplace.forEach((path) => {
          if (!Array.isArray(path)) return;
          for (let i = 0; i < path.length; i++) {
            const { x, y } = path[i];
            let combinedX;
            let combinedY;
            noiseLayers.forEach((noiseLayer) => {
              const amp = noiseLayer.amplitude ?? 1;
              const dx = rack.sampleScalar(x, y, noiseLayer, { worldX: x, worldY: y }) * amp;
              const dy =
                rack.sampleScalar(x + NOISE_OFFSET, y + NOISE_OFFSET, noiseLayer, {
                  worldX: x,
                  worldY: y,
                }) * amp;
              combinedX = window.Vectura.NoiseRack.combineBlend({
                combined: combinedX,
                value: dx,
                blend: noiseLayer.blend || 'add',
                maxAmplitude: maxAmp,
              });
              combinedY = window.Vectura.NoiseRack.combineBlend({
                combined: combinedY,
                value: dy,
                blend: noiseLayer.blend || 'add',
                maxAmplitude: maxAmp,
              });
            });
            path[i] = { x: x + (combinedX ?? 0), y: y + (combinedY ?? 0) };
          }
        });
      }

      return allPaths;
    },

    formula(p) {
      const groups = (p.importedGroups || []).length;
      return `SVG Import — ${p.svgName || 'no file'} | groups: ${groups} | fill: ${p.fillMode} | scale: ${p.scale}`;
    },
  };
})();
