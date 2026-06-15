/**
 * spirograph algorithm definition.
 */
(() => {
  const Vectura = (window.Vectura = window.Vectura || {});
  const G3 = Vectura.Geometry3D;
  window.Vectura.AlgorithmRegistry = window.Vectura.AlgorithmRegistry || {};

  const TAU = Math.PI * 2;
  const clamp = G3?.clamp || ((value, min, max) => Math.max(min, Math.min(max, Number(value) || 0)));
  const finite = G3?.finite || ((value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback));
  const closePath = G3?.closePath || ((path) => path);

  const gcd = (a, b) => {
    a = Math.max(1, Math.abs(Math.round(a)));
    b = Math.max(1, Math.abs(Math.round(b)));
    while (b) [a, b] = [b, a % b];
    return a || 1;
  };

  const shapeRadius = (shape, angle, width, height, points = 6, cornerRadius = 0) => {
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    const ax = w * 0.5;
    const ay = h * 0.5;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    if (shape === 'oval' || shape === 'pill') {
      return 1 / Math.sqrt((c * c) / (ax * ax) + (s * s) / (ay * ay));
    }
    if (shape === 'polygon' || shape === 'star') {
      const n = Math.max(3, Math.round(points));
      const sector = TAU / n;
      const local = ((angle + Math.PI / 2 + sector * 0.5) % sector) - sector * 0.5;
      const base = Math.min(ax, ay) * Math.cos(Math.PI / n) / Math.max(0.15, Math.cos(local));
      if (shape === 'star') {
        const pulse = 0.82 + 0.18 * Math.cos(n * angle);
        return base * pulse;
      }
      return base;
    }
    const rectRadius = Math.min(
      Math.abs(c) < 1e-6 ? Infinity : ax / Math.abs(c),
      Math.abs(s) < 1e-6 ? Infinity : ay / Math.abs(s)
    );
    if (shape === 'roundedRectangle') {
      const blend = clamp(cornerRadius / Math.max(1, Math.min(ax, ay)), 0, 0.9);
      const ovalRadius = 1 / Math.sqrt((c * c) / (ax * ax) + (s * s) / (ay * ay));
      return rectRadius * (1 - blend) + ovalRadius * blend;
    }
    return rectRadius;
  };

  const gearRadiusAt = (p, angle, mainRadius) => {
    const teethRatio = clamp(finite(p.gearTeeth, 59) / Math.max(4, finite(p.mainTeeth, 240)), 0.02, 0.95);
    const base = mainRadius * teethRatio;
    const shape = p.gearShape || 'circle';
    if (shape === 'oval') {
      const ax = clamp(finite(p.gearAspectX, 100) / 100, 0.4, 1.8);
      const ay = clamp(finite(p.gearAspectY, 100) / 100, 0.4, 1.8);
      return base / Math.sqrt((Math.cos(angle) ** 2) / (ax * ax) + (Math.sin(angle) ** 2) / (ay * ay));
    }
    if (shape === 'polygon') {
      return shapeRadius(
        'polygon',
        angle,
        base * 2 * clamp(finite(p.gearAspectX, 100) / 100, 0.4, 1.8),
        base * 2 * clamp(finite(p.gearAspectY, 100) / 100, 0.4, 1.8),
        finite(p.gearPoints, 6),
        finite(p.gearCornerRadius, 0)
      );
    }
    return base;
  };

  const buildRollPath = (p, bounds, mode) => {
    const width = Math.max(4, finite(p.mainWidth, 140));
    const height = Math.max(4, finite(p.mainHeight, 140));
    const mainTeeth = Math.max(4, Math.round(finite(p.mainTeeth, 240)));
    const gearTeeth = Math.max(3, Math.round(finite(p.gearTeeth, 59)));
    const loops = Math.min(80, gearTeeth / gcd(mainTeeth, gearTeeth));
    const preview = Boolean(p.fastPreview || bounds.fastPreview);
    const resolution = clamp(finite(p.curveResolution, 1200), 120, 5000);
    const steps = Math.max(90, Math.round(resolution * loops * (preview ? (G3?.previewDetailScale?.(bounds) ?? 0.4) * 0.6 : 1) / 8));
    const penAngle = (finite(p.penAngle, 0) * Math.PI) / 180;
    const penPct = clamp(finite(p.penOffset, 83) / 100, 0, 2.5);
    const cx = bounds.width * 0.5;
    const cy = bounds.height * 0.5;
    const path = [];

    for (let i = 0; i <= steps; i++) {
      const theta = (i / steps) * TAU * loops;
      const mainR = shapeRadius(
        p.mainShape || 'polygon',
        theta,
        width,
        height,
        finite(p.mainPoints, 6),
        finite(p.mainCornerRadius, 0)
      );
      let gearR = gearRadiusAt(p, theta, mainR);
      if (mode === 'inside') gearR = Math.min(gearR, mainR * 0.92);
      const sign = mode === 'inside' ? -1 : 1;
      const centerR = Math.max(0.5, mainR + sign * gearR);
      const roll = theta * (mainTeeth + sign * gearTeeth) / Math.max(1, gearTeeth);
      const radialX = Math.cos(theta);
      const radialY = Math.sin(theta);
      const centerX = cx + radialX * centerR;
      const centerY = cy + radialY * centerR;
      const penR = gearR * penPct;
      path.push({
        x: centerX - sign * Math.cos(roll + penAngle) * penR,
        y: centerY - sign * Math.sin(roll + penAngle) * penR,
      });
    }
    const out = closePath(path);
    out.meta = {
      algorithm: 'spirograph',
      rollMode: mode,
      closed: true,
      straight: true,
    };
    return out;
  };

  window.Vectura.AlgorithmRegistry.spirograph = {
    generate: (params = {}, rng, noise, bounds = {}) => {
      const p = params || {};
      const mode = p.rollMode || (p.rollInside && !p.rollOutside ? 'inside' : p.rollOutside && !p.rollInside ? 'outside' : 'both');
      const paths = [];
      if (mode === 'inside' || mode === 'both') paths.push(buildRollPath(p, bounds, 'inside'));
      if (mode === 'outside' || mode === 'both') paths.push(buildRollPath(p, bounds, 'outside'));
      return paths.filter((path) => Array.isArray(path) && path.length >= 4);
    },
    formula: () => 'Primitive roulette curve with teeth ratio closure and pen offset.',
  };
})();
