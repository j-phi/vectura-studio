/**
 * rings algorithm definition.
 */
(() => {
  window.Vectura = window.Vectura || {};
  window.Vectura.AlgorithmRegistry = window.Vectura.AlgorithmRegistry || {};
  window.Vectura.AlgorithmRegistry.rings = {
      generate: (p, rng, noise, bounds) => {
        const { m, width, height } = bounds;
        const TAU = Math.PI * 2;
        const inset = bounds.truncate ? m : 0;
        const innerW = width - inset * 2;
        const innerH = height - inset * 2;
        const cx = width / 2 + (p.offsetX ?? 0);
        const cy = height / 2 + (p.offsetY ?? 0);
        const maxR = Math.max(1, Math.min(width, height) / 2 - inset);
        const outerDiameter = Math.max(0, p.outerDiameter ?? 0);
        const effectiveMaxR = outerDiameter > 0 ? outerDiameter / 2 : maxR;

        // rings param = wood ring count; bark rings are additive
        const woodCount = Math.max(1, Math.floor(p.rings ?? 1));
        const centerRadiusBoost = Math.max(0, Math.min((p.centerDiameter ?? 0) / 2, effectiveMaxR - 0.1));
        const rack = window.Vectura.NoiseRack.createEvaluator({ noise, seed: p.seed ?? 0 });

        // tree-ring params
        const gapCurveStart = p.gapCurveStart ?? 1;
        const gapCurveEnd = p.gapCurveEnd ?? 1;
        const spacingVariance = Math.max(0, p.spacingVariance ?? 0);
        const barkRings = Math.max(0, Math.floor(p.barkRings ?? 0));
        const totalRings = woodCount + barkRings;
        const barkGap = Math.max(0, p.barkGap ?? 0.1);
        const breakCount = Math.max(0, Math.floor(p.breakCount ?? 0));
        const centerDrift = Math.max(0, p.centerDrift ?? 0);
        const biasStrength = Math.max(0, Math.min(1, p.biasStrength ?? 0));
        const biasAngleRad = ((p.biasAngle ?? 0) * Math.PI) / 180;
        const rayCount = Math.max(0, Math.floor(p.rayCount ?? 0));
        const rayLength = Math.max(0.1, p.rayLength ?? 2.5);
        const rayInnerFraction = Math.max(0, Math.min(0.9, p.rayInnerFraction ?? 0.15));
        const raySeed = p.raySeed != null ? Math.floor(p.raySeed) : null;
        const rayLengthVariance = Math.max(0, p.rayLengthVariance ?? 0);
        const knotCount = Math.max(0, Math.floor(p.knotCount ?? 0));
        const knotIntensity = Math.max(0, p.knotIntensity ?? 0.6);
        const knotSpreadRad = (Math.max(1, p.knotSpread ?? 30) * Math.PI) / 180;
        const knotStrengthVariance = Math.max(0, p.knotStrengthVariance ?? 0);
        const knotDirection = p.knotDirection ?? 'outer';
        const knotSizeVariance = Math.max(0, p.knotSizeVariance ?? 0);
        const knotSize = Math.max(1, p.knotSize ?? 5);

        // Break params
        const breakRadiusMinFrac = (p.breakRadiusMin ?? 0) / 100;
        const breakRadiusMaxFrac = (p.breakRadiusMax ?? 100) / 100;
        const breakLengthVariance = p.breakLengthVariance ?? 0;
        const breakNoiseSeed = (p.breakNoiseSeed != null && p.breakNoiseSeed !== 0)
          ? Math.floor(p.breakNoiseSeed) : null;
        const breakWidthMinRad = (p.breakWidthMin ?? 2) * Math.PI / 180 / 2;
        const breakWidthMaxRad = (p.breakWidthMax ?? 6) * Math.PI / 180 / 2;
        const breakWidthVariance = p.breakWidthVariance ?? 0;

        // Ray range (fallback to legacy rayLength for old saves)
        const rayMinLength = p.rayMinLength ?? 0.5;
        const rayMaxLength = p.rayMaxLength ?? rayLength;

        // Knot seed + range (fallback to legacy knotSize)
        const knotSeed = (p.knotSeed != null && p.knotSeed !== 0)
          ? Math.floor(p.knotSeed) : null;
        const knotMinSize = p.knotMinSize ?? 1;
        const knotMaxSize = p.knotMaxSize ?? knotSize;

        // V-Markings: sharp inward V-chevron warps (linear angular falloff = pointed, vs knot's cosine = rounded)
        const vMarkCount     = Math.max(0, Math.floor(p.vMarkCount ?? 0));
        const vMarkDepth     = Math.max(0, p.vMarkDepth ?? 5);
        const vMarkSpreadRad = (Math.max(0.1, p.vMarkSpread ?? 1) * Math.PI) / 180;
        const vMarkSize      = Math.max(0, p.vMarkSize ?? 50); // 0–100 % of effectiveMaxR

        // Scars: asymmetric healing wounds — only rings at/after wound, narrowing + shallowing outward
        const scarCount        = Math.max(0, Math.floor(p.scarCount ?? 0));
        const scarDepth        = Math.max(0, p.scarDepth ?? 3);
        const scarHalfWidthRad = (Math.max(0.1, p.scarWidth ?? 5) / 2 * Math.PI) / 180;
        const scarSize         = Math.max(1, p.scarSize ?? 8);

        // Thick rings: clustered ring compression bands (Pass 1 spacing modification)
        const thickRingCount   = Math.max(0, Math.floor(p.thickRingCount ?? 0));
        const thickRingDensity = Math.max(0, Math.min(1, p.thickRingDensity ?? 0.85));
        const thickRingWidth   = Math.max(1, p.thickRingWidth ?? 3);

        // Cracks: outward-to-inward V-wedge radial checking paths
        const crackCount         = Math.max(0, Math.floor(p.crackCount ?? 0));
        const crackHalfSpreadRad = (Math.max(0.5, p.crackSpread ?? 4) / 2 * Math.PI) / 180;
        const crackDepthFrac     = Math.max(0, Math.min(0.99, p.crackDepth ?? 0.5));
        const crackNoise         = Math.max(0, Math.min(1, p.crackNoise ?? 0.3));
        const crackOutline       = Boolean(p.crackOutline ?? false);

        // bark-type params
        const barkType = p.barkType ?? 'smooth';
        // rough
        const barkRoughness = Math.max(0, p.barkRoughness ?? 4);
        const barkRoughnessConfinement = Math.max(0, Math.min(1, p.barkRoughnessConfinement ?? 0.5));
        const barkFreq = Math.max(1, p.barkFreq ?? 3);
        // furrowed
        const barkFurrowCount = Math.max(1, Math.floor(p.barkFurrowCount ?? 14));
        const barkFurrowDepth = Math.max(0, p.barkFurrowDepth ?? 5);
        const barkFurrowWidth = Math.max(0.01, p.barkFurrowWidth ?? 0.12);
        // plated
        const barkPlateCount = Math.max(1, Math.floor(p.barkPlateCount ?? 10));
        const barkPlateRelief = Math.max(0, p.barkPlateRelief ?? 3.5);
        const barkPlateVariance = Math.max(0, p.barkPlateVariance ?? 0.4);
        // papery
        const barkPaperStrips = Math.max(1, Math.floor(p.barkPaperStrips ?? 7));
        const barkPaperPeel = Math.max(0, p.barkPaperPeel ?? 2.5);
        const barkPaperJitter = Math.max(0, p.barkPaperJitter ?? 0.3);
        // fibrous
        const barkFiberCount = Math.max(1, Math.floor(p.barkFiberCount ?? 28));
        const barkFiberAmplitude = Math.max(0, p.barkFiberAmplitude ?? 2.5);
        const barkFiberPhaseShift = Math.max(0, p.barkFiberPhaseShift ?? 0.25);
        // scaly
        const barkScaleColumns = Math.max(1, Math.floor(p.barkScaleColumns ?? 18));
        const barkScaleRelief = Math.max(0, p.barkScaleRelief ?? 3);
        const barkScaleTaper = Math.max(0, p.barkScaleTaper ?? 0.6);
        // cracked bark (ring V-notch pattern — distinct from crackCount radial paths)
        const barkCrackDensity = Math.max(0, Math.floor(p.barkCrackDensity ?? 8));
        const barkCrackDepth = Math.max(0, p.barkCrackDepth ?? 5);
        const barkCrackWidth = Math.max(0.005, p.barkCrackWidth ?? 0.07);
        // lenticular
        const barkLenticleCount = Math.max(1, Math.floor(p.barkLenticleCount ?? 18));
        const barkLenticleDepth = Math.max(0, p.barkLenticleDepth ?? 3);
        const barkLenticleWidth = Math.max(0.01, p.barkLenticleWidth ?? 0.12);
        // woven
        const barkWeaveFreq = Math.max(1, p.barkWeaveFreq ?? 9);
        const barkWeaveAmplitude = Math.max(0, p.barkWeaveAmplitude ?? 2);
        const barkWeaveAngle = p.barkWeaveAngle ?? 45;

        const legacyNoise = {
          type: p.noiseType || 'simplex',
          blend: 'add',
          amplitude: p.amplitude ?? 8,
          zoom: p.noiseScale ?? 0.001,
          freq: 1,
          angle: 0,
          shiftX: p.noiseOffsetX ?? 0,
          shiftY: p.noiseOffsetY ?? 0,
          tileMode: 'off',
          tilePadding: 0,
          patternScale: 1,
          warpStrength: 1,
          cellularScale: 1,
          cellularJitter: 1,
          stepsCount: 5,
          seed: 0,
          applyMode: 'orbit',
          ringDrift: p.noiseLayer ?? 0.5,
          ringRadius: p.noiseRadius ?? 100,
          noiseStyle: 'linear',
          noiseThreshold: 0,
          imageWidth: 1,
          imageHeight: 1,
          microFreq: 0,
          imageInvertColor: false,
          imageInvertOpacity: false,
          imageId: p.noiseImageId || '',
          imageName: p.noiseImageName || '',
          imagePreview: '',
          imageAlgo: p.imageAlgo || 'luma',
          imageEffects: [],
          polygonZoomReference: p.noiseScale ?? 0.001,
          polygonRadius: 2,
          polygonSides: 6,
          polygonRotation: 0,
          polygonOutline: 0,
          polygonEdgeRadius: 0,
        };

        const noiseLayers = (Array.isArray(p.noises) && p.noises.length ? p.noises : [legacyNoise])
          .map((noiseLayer) => ({
            ...legacyNoise,
            ...(noiseLayer || {}),
            enabled: noiseLayer?.enabled !== false,
          }))
          .filter((noiseLayer) => noiseLayer.enabled !== false);

        const maxAmp = noiseLayers.reduce((sum, noiseLayer) => sum + Math.abs(noiseLayer.amplitude ?? 0), 0) || 1;

        const sampleNoise = ({ theta, ringIndex, ringRadiusBase, worldX, worldY }) => {
          let combined;
          noiseLayers.forEach((noiseLayer) => {
            const amplitude = noiseLayer.amplitude ?? 0;
            const zoom = Math.max(0.0001, noiseLayer.zoom ?? 0.001);
            const freq = Math.max(0.05, noiseLayer.freq ?? 1);
            const angle = ((noiseLayer.angle ?? 0) * Math.PI) / 180;
            const cosA = Math.cos(angle);
            const sinA = Math.sin(angle);
            const shiftX = noiseLayer.shiftX ?? 0;
            const shiftY = noiseLayer.shiftY ?? 0;
            const applyMode = noiseLayer.applyMode || 'orbit';
            const ringDrift = noiseLayer.ringDrift ?? 0;
            const ringScale = Math.max(1e-6, noiseLayer.ringRadius ?? 100);

            let sampleX = 0;
            let sampleY = 0;
            let closureBlend = 0;
            let seamStartX = 0;
            let seamStartY = 0;
            let seamEndX = 0;
            let seamEndY = 0;

            if (applyMode === 'topdown') {
              const dx = worldX - cx + shiftX;
              const dy = worldY - cy + shiftY;
              const rx = dx * cosA - dy * sinA;
              const ry = dx * sinA + dy * cosA;

              if (noiseLayer.type === 'image' && (noiseLayer.tileMode || 'off') === 'off') {
                const u = (worldX - inset + shiftX) / Math.max(1, innerW) - 0.5;
                const v = (worldY - inset + shiftY) / Math.max(1, innerH) - 0.5;
                sampleX = u / Math.max(0.05, noiseLayer.imageWidth ?? freq ?? 1);
                sampleY = v / Math.max(0.05, noiseLayer.imageHeight ?? 1);
              } else {
                const widthScale =
                  noiseLayer.type === 'image' ? 1 / Math.max(0.05, noiseLayer.imageWidth ?? freq ?? 1) : freq;
                const heightScale =
                  noiseLayer.type === 'image' ? 1 / Math.max(0.05, noiseLayer.imageHeight ?? 1) : 1;
                sampleX = rx * zoom * widthScale;
                sampleY = ry * zoom * heightScale;
              }
            } else if (applyMode === 'concentric') {
              const pathT = Math.max(0, Math.min(1, theta / TAU));
              const localX = (pathT - 0.5) * ringScale + shiftX;
              const localY = ringIndex * ringDrift + shiftY;
              const rx = localX * cosA - localY * sinA;
              const ry = localX * sinA + localY * cosA;
              const seamLocalY = localY;
              const seamRawStartX = -0.5 * ringScale + shiftX;
              const seamRawEndX = 0.5 * ringScale + shiftX;
              const seamRxStart = seamRawStartX * cosA - seamLocalY * sinA;
              const seamRyStart = seamRawStartX * sinA + seamLocalY * cosA;
              const seamRxEnd = seamRawEndX * cosA - seamLocalY * sinA;
              const seamRyEnd = seamRawEndX * sinA + seamLocalY * cosA;
              closureBlend = pathT;

              const widthScale =
                noiseLayer.type === 'image' ? 1 / Math.max(0.05, noiseLayer.imageWidth ?? freq ?? 1) : freq;
              const heightScale =
                noiseLayer.type === 'image' ? 1 / Math.max(0.05, noiseLayer.imageHeight ?? 1) : 1;
              sampleX = rx * zoom * widthScale;
              sampleY = ry * zoom * heightScale;
              seamStartX = seamRxStart * zoom * widthScale;
              seamStartY = seamRyStart * zoom * heightScale;
              seamEndX = seamRxEnd * zoom * widthScale;
              seamEndY = seamRyEnd * zoom * heightScale;
            } else {
              const orbitX = shiftX + Math.cos(theta) * ringScale;
              const orbitY = shiftY + Math.sin(theta) * ringScale;
              const rx = orbitX * cosA - orbitY * sinA;
              const ry = orbitX * sinA + orbitY * cosA;
              const drift = ringIndex * ringDrift;

              if (noiseLayer.type === 'image' && (noiseLayer.tileMode || 'off') === 'off') {
                const radiusNorm = maxR > 0 ? ringRadiusBase / maxR : 0;
                const polarX = Math.cos(theta) * radiusNorm * 0.5;
                const polarY = Math.sin(theta) * radiusNorm * 0.5;
                sampleX = polarX / Math.max(0.05, noiseLayer.imageWidth ?? 1) + drift;
                sampleY = polarY / Math.max(0.05, noiseLayer.imageHeight ?? 1) + drift;
              } else {
                const widthScale =
                  noiseLayer.type === 'image' ? 1 / Math.max(0.05, noiseLayer.imageWidth ?? freq ?? 1) : freq;
                const heightScale =
                  noiseLayer.type === 'image' ? 1 / Math.max(0.05, noiseLayer.imageHeight ?? 1) : 1;
                sampleX = rx * zoom * widthScale + drift;
                sampleY = ry * zoom * heightScale + drift;
              }
            }

            let value = rack.evaluate(sampleX, sampleY, noiseLayer, { worldX, worldY });
            if (applyMode === 'concentric' && closureBlend > 0) {
              const seamStartValue = rack.evaluate(seamStartX, seamStartY, noiseLayer, { worldX, worldY });
              const seamEndValue = rack.evaluate(seamEndX, seamEndY, noiseLayer, { worldX, worldY });
              value -= (seamEndValue - seamStartValue) * closureBlend;
            }
            value *= amplitude;
            combined = window.Vectura.NoiseRack.combineBlend({
              combined,
              value,
              blend: noiseLayer.blend || 'add',
              maxAmplitude: maxAmp,
            });
          });
          return combined ?? 0;
        };

        // Build ring radii in two independent passes.
        const barkGapPx = barkGap;
        // Reserve space for bark rings so wood rings never overflow into the bark zone.
        const barkSpace = barkRings > 0 ? barkRings * barkGapPx : 0;
        const woodMaxR = Math.max(0.1, effectiveMaxR - barkSpace);

        // Pass 1: compute normal ring layout for wood rings only.
        const baseGap = woodCount > 1 ? woodMaxR / (woodCount - 1) : woodMaxR;
        const gapScale = baseGap * (p.gap ?? 1);
        const spacingNoiseLayer = { type: 'simplex', seed: (p.seed ?? 0) + 7919 };

        const allRingGaps = [];
        for (let i = 0; i < woodCount; i++) {
          const t = woodCount > 1 ? i / (woodCount - 1) : 0;
          const taper = gapCurveStart + (gapCurveEnd - gapCurveStart) * t;
          let g = gapScale * taper;
          if (spacingVariance > 0) {
            const sn = rack.evaluate(i * 0.31, 0.5, spacingNoiseLayer, {});
            g = Math.max(0.1, g * (1 + spacingVariance * sn));
          }
          allRingGaps.push(g);
        }
        const thickRingRng = thickRingCount > 0 ? new window.Vectura.SeededRNG((p.thickRingSeed ?? p.seed ?? 0) + 23143) : null;
        if (thickRingCount > 0) {
          const clusterCenters = Array.from({ length: thickRingCount }, () =>
            Math.floor(thickRingRng.nextFloat() * woodCount));
          for (let i = 0; i < woodCount; i++) {
            let compression = 1;
            for (const center of clusterCenters) {
              const dist = Math.abs(i - center);
              if (dist < thickRingWidth) {
                const influence = 1 - dist / thickRingWidth;
                compression *= 1 - thickRingDensity * influence * influence;
              }
            }
            allRingGaps[i] = Math.max(0.5, allRingGaps[i] * compression);
          }
        }

        const normalTotalGap = allRingGaps.slice(1).reduce((s, g) => s + g, 0);
        // Rescale proportionally if gaps overflow the wood zone (happens when gap > 1).
        const overflowScale = normalTotalGap > woodMaxR ? woodMaxR / normalTotalGap : 1;
        if (overflowScale < 1) {
          for (let i = 0; i < allRingGaps.length; i++) allRingGaps[i] *= overflowScale;
        }
        const rescaledTotal = normalTotalGap * overflowScale;
        const startR = Math.max(0, woodMaxR - rescaledTotal);

        // Pass 2: wood rings keep their normal positions;
        //         bark rings anchor from effectiveMaxR inward with fixed absolute spacing.
        const ringRadii = [startR];
        for (let i = 1; i < woodCount; i++) {
          ringRadii.push(ringRadii[i - 1] + allRingGaps[i]);
        }
        const lastWoodR = ringRadii[woodCount - 1];
        for (let i = woodCount; i < totalRings; i++) {
          const barkIdx = i - woodCount; // 0 = innermost bark, barkRings-1 = outermost
          const barkR = effectiveMaxR - (barkRings - 1 - barkIdx) * barkGapPx;
          ringRadii.push(Math.max(lastWoodR, barkR));
        }

        // centerDiameter opens only ring 0's hole — does not shift outer rings
        if (centerRadiusBoost > ringRadii[0]) {
          ringRadii[0] = centerRadiusBoost;
        }

        const avgGap = woodCount > 1 ? (lastWoodR - startR) / (woodCount - 1) : gapScale;

        // Dedicated RNGs for features that don't need early setup
        const vMarkRng = vMarkCount > 0 ? new window.Vectura.SeededRNG((p.vMarkSeed ?? p.seed ?? 0) + 13337) : null;
        const scarRng  = scarCount  > 0 ? new window.Vectura.SeededRNG((p.scarSeed  ?? p.seed ?? 0) + 17891) : null;

        // Pre-compute crack angles early so ring suppression and path generation share the same positions.
        const crackRng    = crackCount > 0 ? new window.Vectura.SeededRNG((p.crackSeed ?? p.seed ?? 0) + 31337) : null;
        const crackAngles = crackRng ? Array.from({ length: crackCount }, () => crackRng.nextFloat() * TAU) : [];
        const crackInnerR = crackCount > 0 ? effectiveMaxR * (1 - crackDepthFrac) : 0;

        // Scar depth is clamped so a scar cannot displace a ring past its neighbor.
        const effectiveScarDepth = Math.min(scarDepth, avgGap * 0.9);

        // V-mark radial reach in absolute pixels (vMarkSize is 0–100 % of effectiveMaxR).
        const vMarkReachR = (vMarkSize / 100) * effectiveMaxR;

        // knot positions — dedicated RNG when knotSeed is set; per-knot reach from knotMinSize..knotMaxSize
        const wrapAngle = (a) => a - TAU * Math.round(a / TAU);
        const knotRng = knotSeed != null ? new window.Vectura.SeededRNG(knotSeed) : rng;
        const knots = [];
        for (let i = 0; i < knotCount; i++) {
          void knotRng.nextFloat(); // consumed for RNG parity across all direction modes
          const angle = knotRng.nextFloat() * TAU;
          const ringFrac = 0.25 + knotRng.nextFloat() * 0.5;
          const intensityScale = knotStrengthVariance > 0
            ? Math.max(0, 1 + knotStrengthVariance * (knotRng.nextFloat() - 0.5) * 2)
            : 1;
          const spreadScale = knotSizeVariance > 0
            ? Math.max(0.1, 1 + knotSizeVariance * (knotRng.nextFloat() - 0.5) * 2)
            : 1;
          const knotReach = knotMinSize + knotRng.nextFloat() * (knotMaxSize - knotMinSize);
          if (knotDirection === 'both') {
            // Paired pushes: outward slightly outside ringFrac, inward slightly inside — simulates a real knot cross-section.
            const offset = 0.04;
            knots.push({ angle, ringFrac: Math.min(0.75, ringFrac + offset), dirSign: +1, intensityScale, spreadScale, knotReach });
            knots.push({ angle, ringFrac: Math.max(0.25, ringFrac - offset), dirSign: -1, intensityScale, spreadScale, knotReach });
          } else {
            const dirSign = knotDirection === 'inner' ? -1 : 1;
            knots.push({ angle, ringFrac, dirSign, intensityScale, spreadScale, knotReach });
          }
        }

        const vMarks = Array.from({ length: vMarkCount }, () => ({
          angle:    vMarkRng.nextFloat() * TAU,
          ringFrac: 0.2 + vMarkRng.nextFloat() * 0.6,
        }));

        const scars = Array.from({ length: scarCount }, () => ({
          angle:    scarRng.nextFloat() * TAU,
          ringFrac: 0.3 + scarRng.nextFloat() * 0.5,
        }));

        // Radial breaks: per-break angle, arc half-width, and radial range.
        // breakNoiseSeed isolates break RNG from global seed when set.
        const hasBreaks = breakCount > 0;
        const breakRng = (hasBreaks && breakNoiseSeed != null)
          ? new window.Vectura.SeededRNG(breakNoiseSeed) : rng;

        const breaks = Array.from({ length: breakCount }, () => {
          const angle = breakRng.nextFloat() * TAU;
          let arcHalf = breakWidthMinRad + breakRng.nextFloat() * (breakWidthMaxRad - breakWidthMinRad);
          if (breakWidthVariance > 0) {
            arcHalf = Math.max(0.001, arcHalf * (1 + breakWidthVariance * (breakRng.nextFloat() - 0.5) * 2));
          }
          // Breaks always anchor at the bark (outer edge) and go inward.
          let rMax = effectiveMaxR;
          let rMin = effectiveMaxR * (1 - breakRadiusMaxFrac);
          if (breakLengthVariance > 0) {
            rMin = Math.max(0, rMin * (1 - breakRng.nextFloat() * breakLengthVariance));
          }
          return { angle, arcHalf, rMin, rMax };
        });

        // Dedicated RNG for bark-type geometry — seed offset 41201 avoids all existing offsets.
        const barkRng = barkRings > 0
          ? new window.Vectura.SeededRNG((p.seed ?? 0) + 41201)
          : null;

        // Global bark state: angles shared across all bark rings (furrow/crack notch positions).
        let barkGlobalState = null;
        if (barkRng) {
          if (barkType === 'furrowed') {
            barkGlobalState = {
              furrowAngles: Array.from({ length: barkFurrowCount }, () => barkRng.nextFloat() * TAU),
            };
          } else if (barkType === 'cracked') {
            barkGlobalState = {
              crackAngles: Array.from({ length: barkCrackDensity }, () => barkRng.nextFloat() * TAU),
            };
          } else {
            barkGlobalState = {};
          }
        }

        // Per-ring bark state: phase offsets and per-ring variance factors.
        // Lenticular uses one shared offset so ridges align across all bark rings.
        const sharedLenticleOffset = (barkType === 'lenticular' && barkRng)
          ? barkRng.nextFloat() * (TAU / Math.max(1, barkLenticleCount))
          : 0;
        const barkRingStates = [];
        if (barkRng) {
          for (let b = 0; b < barkRings; b++) {
            if (barkType === 'rough') {
              barkRingStates.push({ phase1: barkRng.nextFloat() * TAU, phase2: barkRng.nextFloat() * TAU });
            } else if (barkType === 'plated') {
              const varianceFactor = barkPlateVariance > 0
                ? Math.max(0.1, 1 + barkPlateVariance * (barkRng.nextFloat() - 0.5) * 2)
                : 1;
              barkRingStates.push({ phaseOffset: barkRng.nextFloat() * (TAU / barkPlateCount), varianceFactor });
            } else if (barkType === 'papery') {
              barkRingStates.push({ stripOffset: barkRng.nextFloat() * (TAU / barkPaperStrips) * barkPaperJitter });
            } else if (barkType === 'lenticular') {
              barkRingStates.push({ lenticleOffset: sharedLenticleOffset });
            } else {
              barkRingStates.push({});
            }
          }
        }

        // Reusable bark-displacement helper — called from ring loop and ray generation.
        const computeBarkDisp = (theta, barkIdx, barkRingState) => {
          if (barkRings === 0 || barkIdx < 0) return 0;
          switch (barkType) {
            case 'rough': {
              // Normalize wave to ±1 then scale by confinement; prevents excessive radial spread.
              const wave = (Math.sin(barkFreq * theta + barkRingState.phase1) +
                0.4 * Math.sin(barkFreq * 2.618 * theta + barkRingState.phase2)) / 1.4;
              return (1 - barkRoughnessConfinement) * barkRoughness * wave;
            }
            case 'furrowed': {
              let d = 0;
              for (const fa of barkGlobalState.furrowAngles) {
                let dt = theta - fa;
                dt -= TAU * Math.round(dt / TAU);
                const hw = barkFurrowWidth * Math.PI;
                if (Math.abs(dt) < hw)
                  d -= barkFurrowDepth * (Math.cos((dt / hw) * Math.PI * 0.5) ** 2);
              }
              return d;
            }
            case 'plated': {
              const pa = TAU / barkPlateCount;
              const pos = ((theta + barkRingState.phaseOffset) % pa + pa) % pa;
              return barkPlateRelief * barkRingState.varianceFactor * Math.sin((pos / pa) * Math.PI);
            }
            case 'papery': {
              const sa = TAU / barkPaperStrips;
              const adj = ((theta + barkRingState.stripOffset) % TAU + TAU) % TAU;
              const withinStrip = (adj % sa) / sa;
              return barkPaperPeel * Math.sin(withinStrip * Math.PI);
            }
            case 'fibrous':
              return barkFiberAmplitude * Math.sin(barkFiberCount * theta + barkIdx * Math.PI * barkFiberPhaseShift);
            case 'scaly': {
              const sa = TAU / barkScaleColumns;
              const phase = (barkIdx % 2) * (Math.PI / barkScaleColumns);
              const pos = ((theta + phase) % sa + sa) % sa;
              return barkScaleRelief * barkScaleTaper * Math.max(0, Math.sin((pos / sa) * Math.PI));
            }
            case 'cracked': {
              // Use min() instead of summing so overlapping cracks don't cross each other.
              let d = 0;
              for (const ca of barkGlobalState.crackAngles) {
                let dt = theta - ca;
                dt -= TAU * Math.round(dt / TAU);
                const hw = barkCrackWidth * Math.PI;
                if (Math.abs(dt) < hw) {
                  const contribution = -barkCrackDepth * (1 - Math.abs(dt) / hw);
                  d = Math.min(d, contribution);
                }
              }
              return d;
            }
            case 'lenticular': {
              const la = TAU / barkLenticleCount;
              const adj = ((theta + barkRingState.lenticleOffset) % TAU + TAU) % TAU;
              const posInL = (adj % la) / la;
              const distFromCenter = Math.abs(posInL - 0.5) * 2;
              const halfW = barkLenticleWidth * 2;
              // Positive displacement: ridges push outward; shared offset aligns them across rings.
              return distFromCenter < halfW
                ? barkLenticleDepth * (Math.cos((distFromCenter / halfW) * Math.PI * 0.5) ** 2)
                : 0;
            }
            case 'woven': {
              const angleRad = (barkWeaveAngle * Math.PI) / 180;
              // Uniform angular parameterization ensures consistent band width around the perimeter.
              // angleRad-scaled row phase creates the diagonal woven appearance.
              const rowPhase = barkIdx * Math.PI + barkIdx * angleRad;
              return barkWeaveAmplitude * Math.sin(barkWeaveFreq * theta + rowPhase);
            }
            default:
              return 0;
          }
        };

        const paths = [];

        // Phase A: Pre-compute per-ring drift centers (centerDrift only applies to wood rings).
        const ringCenters = [];
        {
          let driftX = 0;
          let driftY = 0;
          for (let i = 0; i < totalRings; i++) {
            if (i < woodCount && centerDrift > 0) {
              driftX += centerDrift * (rng.nextFloat() - 0.5) * 2;
              driftY += centerDrift * (rng.nextFloat() - 0.5) * 2;
            }
            ringCenters.push({ cx: cx + driftX, cy: cy + driftY });
          }
        }

        // Phase B: Pre-compute raw radii on a unified theta grid so Phase C can propagate
        // inward pushes across all rings at the same angular positions.
        const UNIFIED_STEPS = Math.max(360, Math.floor(effectiveMaxR * 2));
        const US = UNIFIED_STEPS;
        const rawR = new Float32Array(totalRings * US);
        for (let i = 0; i < totalRings; i++) {
          const rBaseForRing = Math.max(0.1, ringRadii[i]);
          const isWoodRing = i < woodCount;
          const barkIdx = isWoodRing ? -1 : (i - woodCount);
          const barkRingState = barkIdx >= 0 ? barkRingStates[barkIdx] : null;
          const { cx: ringCx, cy: ringCy } = ringCenters[i];
          for (let k = 0; k < US; k++) {
            const theta = (k / US) * TAU;
            const baseX = ringCx + Math.cos(theta) * rBaseForRing;
            const baseY = ringCy + Math.sin(theta) * rBaseForRing;
            const n = sampleNoise({ theta, ringIndex: i, ringRadiusBase: rBaseForRing, worldX: baseX, worldY: baseY });
            const biasFactor = biasStrength > 0 ? 1 + biasStrength * Math.cos(theta - biasAngleRad) : 1;
            let knotWarp = 0;
            if (isWoodRing) {
              for (const knot of knots) {
                const knotR = knot.ringFrac * effectiveMaxR;
                const ringDist = Math.abs(rBaseForRing - knotR) / (avgGap || 1);
                if (ringDist >= knot.knotReach) continue;
                const knotSpreadForThis = knotSpreadRad * knot.spreadScale;
                const angleDelta = Math.abs(wrapAngle(theta - knot.angle));
                if (angleDelta >= knotSpreadForThis) continue;
                const angularFalloff = Math.cos((angleDelta / knotSpreadForThis) * Math.PI * 0.5) ** 2;
                const ringFalloff = Math.exp(-ringDist * ringDist * 0.25);
                knotWarp += knot.dirSign * knot.intensityScale * knotIntensity * avgGap * 5 * angularFalloff * ringFalloff;
              }
              if (vMarkCount > 0 && vMarkReachR > 0) {
                for (const vm of vMarks) {
                  const vmR = vm.ringFrac * effectiveMaxR;
                  const distR = Math.abs(rBaseForRing - vmR);
                  if (distR >= vMarkReachR) continue;
                  const angleDelta = Math.abs(wrapAngle(theta - vm.angle));
                  if (angleDelta >= vMarkSpreadRad) continue;
                  const angularFalloff = 1 - angleDelta / vMarkSpreadRad;
                  const normDist = distR / (vMarkReachR * 0.4 || 1);
                  const ringFalloff = Math.exp(-normDist * normDist);
                  knotWarp -= vMarkDepth * angularFalloff * ringFalloff;
                }
              }
              if (scarCount > 0) {
                for (const scar of scars) {
                  const scarRingIdx = Math.floor(scar.ringFrac * woodCount);
                  if (i < scarRingIdx) continue;
                  const healProgress = Math.min(1, (i - scarRingIdx) / (scarSize + 1));
                  const depthFactor = 1 - healProgress;
                  if (depthFactor <= 0) continue;
                  const currentHalfWidth = scarHalfWidthRad * (1 - healProgress * 0.75);
                  const angleDelta = Math.abs(wrapAngle(theta - scar.angle));
                  if (angleDelta >= currentHalfWidth) continue;
                  const angularFalloff = Math.cos((angleDelta / currentHalfWidth) * Math.PI * 0.5);
                  knotWarp -= effectiveScarDepth * angularFalloff * depthFactor;
                }
              }
            }
            const barkDisp = computeBarkDisp(theta, barkIdx, barkRingState);
            rawR[i * US + k] = Math.max(0.1, rBaseForRing * biasFactor + n + knotWarp + barkDisp);
          }
        }

        // Phase C: Propagate inward pushes — when an outer ring is displaced inward past an inner
        // ring, push the inner ring inward too, cascading all the way to the center ring.
        // Scan outermost → innermost; each inner ring accommodates its outward neighbor.
        // Exception: ring 0 boosted by centerDiameter is intentionally out-of-order; don't move it.
        const MIN_SEP = 0.1;
        for (let k = 0; k < US; k++) {
          for (let i = totalRings - 1; i >= 1; i--) {
            if (rawR[i * US + k] < rawR[(i - 1) * US + k] + MIN_SEP) {
              if (i - 1 === 0 && centerRadiusBoost > 0) continue;
              rawR[(i - 1) * US + k] = rawR[i * US + k] - MIN_SEP;
            }
          }
        }

        // Pre-compute crack arm geometry (with wobble) before Phase D so that ring suppression
        // and path output share the same positions — without this, the ring gap boundaries
        // use the clean geometric zone while the drawn arm paths are shifted by wobble noise.
        const CRACK_POINTS = 14;
        const outerRingIdx = totalRings - 1;
        const precomputedCrackArms = [];
        if (crackCount > 0) {
          for (let c = 0; c < crackCount; c++) {
            const crackAngle = crackAngles[c];
            const innerR_c = effectiveMaxR * (1 - crackDepthFrac);
            const armData = { anglesPerSide: [[], []], paths: [], outerRPerSide: [] };
            for (let sideIdx = 0; sideIdx < 2; sideIdx++) {
              const side = sideIdx === 0 ? -1 : 1;
              const arm = [];
              let armOuterR = effectiveMaxR;
              for (let t = 0; t <= CRACK_POINTS; t++) {
                const frac = t / CRACK_POINTS;
                const angularOffset = side * crackHalfSpreadRad * (1 - frac);
                const wobble = crackNoise * (1 - frac) * (crackRng.nextFloat() - 0.5) * crackHalfSpreadRad * 2;
                const angle = crackAngle + angularOffset + wobble;
                armData.anglesPerSide[sideIdx].push(angle);
                let r;
                if (t === 0) {
                  // Snap outer point to the actual outermost ring radius at this angle,
                  // after all Phase-B/C transforms (noise, bias, bark, propagation).
                  const normA = ((angle % TAU) + TAU) % TAU;
                  const kFloat = normA / TAU * US;
                  const k0 = Math.floor(kFloat) % US;
                  const k1 = (k0 + 1) % US;
                  const tf = kFloat - Math.floor(kFloat);
                  armOuterR = rawR[outerRingIdx * US + k0] * (1 - tf) + rawR[outerRingIdx * US + k1] * tf;
                  r = armOuterR;
                } else {
                  r = armOuterR + (innerR_c - armOuterR) * frac;
                }
                arm.push({ x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r });
              }
              armData.paths.push(arm);
              armData.outerRPerSide.push(armOuterR);
            }
            precomputedCrackArms.push(armData);
          }
        }

        const isInCrack = (theta, rAtPoint) => {
          if (precomputedCrackArms.length === 0 || rAtPoint < crackInnerR) return false;
          const innerR_c = effectiveMaxR * (1 - crackDepthFrac);
          for (let c = 0; c < precomputedCrackArms.length; c++) {
            const { anglesPerSide, outerRPerSide } = precomputedCrackArms[c];

            const lFrac = Math.max(0, Math.min(1, (outerRPerSide[0] - rAtPoint) / Math.max(1, outerRPerSide[0] - innerR_c)));
            const lT    = lFrac * CRACK_POINTS;
            const lt0 = Math.floor(lT); const lt1 = Math.min(lt0 + 1, CRACK_POINTS); const ltf = lT - lt0;
            const leftAngle = anglesPerSide[0][lt0] + (anglesPerSide[0][lt1] - anglesPerSide[0][lt0]) * ltf;

            const rFrac = Math.max(0, Math.min(1, (outerRPerSide[1] - rAtPoint) / Math.max(1, outerRPerSide[1] - innerR_c)));
            const rT    = rFrac * CRACK_POINTS;
            const rt0 = Math.floor(rT); const rt1 = Math.min(rt0 + 1, CRACK_POINTS); const rtf = rT - rt0;
            const rightAngle = anglesPerSide[1][rt0] + (anglesPerSide[1][rt1] - anglesPerSide[1][rt0]) * rtf;

            const ca   = crackAngles[c];
            const tRel = wrapAngle(theta - ca);
            const lRel = wrapAngle(leftAngle  - ca);
            const rRel = wrapAngle(rightAngle - ca);
            if (tRel >= Math.min(lRel, rRel) && tRel <= Math.max(lRel, rRel)) return true;
          }
          return false;
        };

        // Phase D: Build path points from the propagation-adjusted radii.
        for (let i = 0; i < totalRings; i++) {
          if (i === 0 && centerRadiusBoost === 0) continue;
          const rBaseForRing = Math.max(0.1, ringRadii[i]);
          const { cx: ringCx, cy: ringCy } = ringCenters[i];
          let currentPath = [];
          const subPaths = [];
          let hadAnyGap = false;

          for (let k = 0; k < US; k++) {
            const theta = (k / US) * TAU;
            const r = rawR[i * US + k];
            const pt = { x: ringCx + Math.cos(theta) * r, y: ringCy + Math.sin(theta) * r };

            const inCrack = isInCrack(theta, r);

            const gapped = inCrack || (hasBreaks && breaks.some(b =>
              rBaseForRing >= b.rMin &&
              rBaseForRing <= b.rMax &&
              Math.abs(wrapAngle(theta - b.angle)) < b.arcHalf
            ));
            if (gapped) {
              hadAnyGap = true;
              if (currentPath.length >= 3) subPaths.push(currentPath);
              currentPath = [];
            } else {
              currentPath.push(pt);
            }
          }

          const hasGaps = hasBreaks || crackAngles.length > 0;
          if (hasGaps) {
            if (currentPath.length >= 3) subPaths.push(currentPath);

            // n+1 fix: the walk from theta=0→TAU creates a spurious extra split at the seam.
            // When the seam is not inside any active gap for this ring, merge last+first sub-paths.
            if (subPaths.length > 1) {
              const seamInBreak = hasBreaks && breaks.some(b =>
                rBaseForRing >= b.rMin &&
                rBaseForRing <= b.rMax &&
                Math.abs(wrapAngle(-b.angle)) < b.arcHalf
              );
              const seamInCrack = isInCrack(0, rawR[i * US + 0]);
              if (!seamInBreak && !seamInCrack) {
                const first = subPaths.shift();
                const last = subPaths[subPaths.length - 1];
                subPaths[subPaths.length - 1] = last.concat(first);
              }
            } else if (!hadAnyGap && subPaths.length === 1) {
              // No gap intersected this ring — close it the same way the gap-free branch does.
              const sp = subPaths[0];
              if (sp.length) sp.push({ ...sp[0] });
            }

            subPaths.forEach((sp) => paths.push(sp));
          } else {
            if (currentPath.length) currentPath.push({ ...currentPath[0] });
            paths.push(currentPath);
          }
        }

        // medullary rays: outer bound is read from Phase-C-adjusted rawR so it reflects the true
        // rendered bark including bias, noise, knots, and ring collision propagation.
        if (rayCount > 0) {
          const rayRng = raySeed != null ? new window.Vectura.SeededRNG(raySeed) : rng;
          const outerRingIdx = totalRings - 1;
          for (let r = 0; r < rayCount; r++) {
            const angle = rayRng.nextFloat() * TAU;
            // Use the Phase-C-adjusted rawR for the true rendered bark radius at this angle.
            const kFloat = (((angle % TAU) + TAU) % TAU) / TAU * US;
            const k0 = Math.floor(kFloat) % US;
            const k1 = (k0 + 1) % US;
            const frac = kFloat - Math.floor(kFloat);
            const outerBarkR = rawR[outerRingIdx * US + k0] * (1 - frac) + rawR[outerRingIdx * US + k1] * frac;
            const rayBiasFactor = biasStrength > 0 ? 1 + biasStrength * Math.cos(angle - biasAngleRad) : 1;
            const rayInnerR = outerBarkR * rayInnerFraction;
            const baseLength = rayMinLength + rayRng.nextFloat() * (rayMaxLength - rayMinLength);
            const thisRayLength = rayLengthVariance > 0
              ? Math.max(0.1, baseLength * (1 + rayLengthVariance * (rayRng.nextFloat() * 2 - 1)))
              : baseLength;
            const rayLengthPx = avgGap * thisRayLength * rayBiasFactor;
            const rayOuterLimit = outerBarkR - rayLengthPx;
            const availRange = Math.max(0.1, rayOuterLimit - rayInnerR);
            const innerR = rayInnerR + rayRng.nextFloat() * availRange;
            const outerR = Math.min(innerR + rayLengthPx, outerBarkR);
            paths.push([
              { x: cx + Math.cos(angle) * innerR, y: cy + Math.sin(angle) * innerR },
              { x: cx + Math.cos(angle) * outerR, y: cy + Math.sin(angle) * outerR },
            ]);
          }
        }

        if (crackOutline) {
          for (const armData of precomputedCrackArms) {
            const left  = armData.paths[0];
            const right = armData.paths[1].slice().reverse();
            paths.push([...left, ...right]);
          }
        }

        return paths;
      },
      formula: (p) =>
        `Tree-ring concentric generator\nSpacing: gapCurveStart→gapCurveEnd envelope + spacingVariance noise\nDiameter: outerDiameter (0 = no rings); outerDiameter/2 = effectiveMaxR; centerDiameter < outerDiameter\nBark: barkRings anchor from effectiveMaxR inward at barkGap; barkType selects texture (smooth/rough/furrowed/plated/papery/fibrous/scaly/cracked/lenticular/woven)\nBreaks: per-break angle, arcHalf (breakWidthMin–Max°), radial range (breakRadiusMin–Max%); breakNoiseSeed isolates RNG\nBias+Drift: biasStrength applies to all rings (wood+bark shape); centerDrift applies to wood only\nRays: medullary ray segments; rayMinLength–rayMaxLength range + variance; bounded by outermost bark radius\nKnots: directional warp bulges on wood rings; per-knot reach from knotMinSize–knotMaxSize; knotSeed isolates RNG\nV-Marks: sharp inward V-chevron warps, linear falloff (vMarkCount, vMarkDepth, vMarkSpread, vMarkSize)\nScars: asymmetric healing wounds, cosine falloff, narrows outward (scarCount, scarDepth, scarWidth, scarSize)\nThick rings: clustered gap compression bands (thickRingCount, thickRingDensity, thickRingWidth)\nCracks: V-wedge radial checking paths from outer edge inward (crackCount, crackDepth, crackSpread, crackNoise)\nr_wood = rBase * biasFactor + noiseAmp + knotWarp; r_bark = rBase * biasFactor + noiseAmp + barkDisp`,
    };
})();
