import os
import re
import json

base_dir = "/Users/jayphi/.gemini/antigravity-cli/brain/e99b6f49-3d5c-4c72-8151-8a1423d87943/.system_generated/worktrees/subagent-Implementer-for-bugs-and-code-quality-implementer-1060bf53"

# 1. src/app/app.js
p = os.path.join(base_dir, "src/app/app.js")
if os.path.exists(p):
    with open(p, 'r') as f: content = f.read()
    target1 = """    updateStats() {
      const s = this.engine.getStats();
      const dist = document.getElementById('stat-dist');
      const time = document.getElementById('stat-time');
      const lines = document.getElementById('stat-lines');
      if (!dist || !time) return;
      dist.innerText = s.distance;
      time.innerText = s.time;
      if (lines) lines.innerText = s.lines?.toString?.() || '0';
    }"""
    rep1 = """    updateStats() {
      const s = this.engine.getStats();
      this.ui?.updateStats?.(s);
    }"""
    content = content.replace(target1, rep1)

    target2 = """      if (typeof document !== 'undefined') {
        const leftPane = document.getElementById('left-pane');
        const rightPane = document.getElementById('right-pane');
        const bottomPane = document.getElementById('bottom-pane');
        if (leftPane) leftPane.classList.remove('pane-collapsed', 'pane-force-open');
        if (rightPane) rightPane.classList.remove('pane-collapsed', 'pane-force-open');
        if (bottomPane) bottomPane.classList.remove('bottom-pane-collapsed');
      }"""
    rep2 = """      if (typeof document !== 'undefined') {
        this.ui?.resetPanes?.();
      }"""
    content = content.replace(target2, rep2)
    with open(p, 'w') as f: f.write(content)

# 2. src/ui/ui.js
p = os.path.join(base_dir, "src/ui/ui.js")
if os.path.exists(p):
    with open(p, 'r') as f: content = f.read()
    target3 = """  class UI {
    constructor(app) {
      this._init(app);
    }
  }"""
    rep3 = """  class UI {
    constructor(app) {
      this._init(app);
    }

    updateStats(s) {
      const dist = document.getElementById('stat-dist');
      const time = document.getElementById('stat-time');
      const lines = document.getElementById('stat-lines');
      if (!dist || !time) return;
      dist.innerText = s.distance;
      time.innerText = s.time;
      if (lines) lines.innerText = s.lines?.toString?.() || '0';
    }

    resetPanes() {
      const leftPane = document.getElementById('left-pane');
      const rightPane = document.getElementById('right-pane');
      const bottomPane = document.getElementById('bottom-pane');
      if (leftPane) leftPane.classList.remove('pane-collapsed', 'pane-force-open');
      if (rightPane) rightPane.classList.remove('pane-collapsed', 'pane-force-open');
      if (bottomPane) bottomPane.classList.remove('bottom-pane-collapsed');
    }
  }"""
    content = content.replace(target3, rep3)
    with open(p, 'w') as f: f.write(content)

# 3. layers-panel.js
p = os.path.join(base_dir, "src/ui/panels/layers-panel.js")
if os.path.exists(p):
    with open(p, 'r') as f: content = f.read()
    target4 = """        penMenu.querySelectorAll('.pen-option').forEach((opt) => {
          opt.onclick = (e) => {
            e.stopPropagation();
            if (this.app.pushHistory) this.app.pushHistory();
            applyPen(pens.find((pen) => pen.id === opt.dataset.penId));
            penMenu.classList.add('hidden');
          };
        });"""
    rep4 = """        penMenu.onclick = (e) => {
          const opt = e.target.closest('.pen-option');
          if (!opt) return;
          e.stopPropagation();
          if (this.app.pushHistory) this.app.pushHistory();
          applyPen(pens.find((pen) => pen.id === opt.dataset.penId));
          penMenu.classList.add('hidden');
        };"""
    content = content.replace(target4, rep4)
    with open(p, 'w') as f: f.write(content)

# 4. defaults.js
p = os.path.join(base_dir, "src/config/defaults.js")
if os.path.exists(p):
    with open(p, 'r') as f: content = f.read()
    content = content.replace("""      petalWidthRatio: 0.74,\n      petalLengthRatio: 1,\n      petalSizeRatio: 1,\n      leafSidePos: 0.45,\n      leafSideWidth: 1,""", """      petalWidthRatio: 0.74,\n      petalSizeRatio: 1,\n      leafSideWidth: 1,""")
    content = content.replace("""      baseFlare: 0,\n      basePinch: 0,\n      edgeWaveAmp: 0,\n      edgeWaveFreq: 3,\n      radiusScale: 0.2,""", """      baseFlare: 0,\n      basePinch: 0,\n      radiusScale: 0.2,""")
    content = content.replace("""      countJitter: 0,\n      layoutMode: 'whorl',\n      bloom: 100,""", """      countJitter: 0,\n      bloom: 100,""")
    content = content.replace("""      petalCupping: 0,\n      ringMode: 'dual',\n      innerCount: 0,""", """      petalCupping: 0,\n      innerCount: 0,""")
    content = content.replace("""      centerShapeMorph: 0.2,\n      centerProfile: 'oval',\n      centerCurlBoost: 0,\n      centerWaveBoost: 0.2,\n      budMode: false,""", """      centerShapeMorph: 0.2,\n      centerProfile: 'oval',\n      centerCurlBoost: 0,\n      budMode: false,""")
    with open(p, 'w') as f: f.write(content)

# 5. build-user-presets.js
p = os.path.join(base_dir, "scripts/build-user-presets.js")
if os.path.exists(p):
    with open(p, 'r') as f: content = f.read()
    target5 = """    const params = stripTransformKeys(layer.params || {});\n\n    systemPresets.push({ id, name, preset_system: system, group, params });"""
    rep5 = """    const params = stripTransformKeys(layer.params || {});\n    \n    // Validate keys against ALGO_DEFAULTS\n    const defaults = ALGO_DEFAULTS[system] || {};\n    for (const key of Object.keys(params)) {\n      if (!(key in defaults) && key !== 'seed' && !TRANSFORM_KEYS.has(key)) {\n        console.warn(`[user-presets:bundle] Warning: ${file} contains unknown key '${key}' for ${system}. Stripping it.`);\n        delete params[key];\n      }\n    }\n\n    systemPresets.push({ id, name, preset_system: system, group, params });"""
    content = content.replace(target5, rep5)
    with open(p, 'w') as f: f.write(content)

# 6. svg-sanitize.js
p = os.path.join(base_dir, "src/core/svg-sanitize.js")
if os.path.exists(p):
    with open(p, 'r') as f: content = f.read()
    target6 = """    if (typeof DOMParser === 'undefined' || typeof XMLSerializer === 'undefined') {\n      return fallbackRegexStrip(input);\n    }\n    let doc;\n    try {\n      const parser = new DOMParser();\n      doc = parser.parseFromString(input, 'image/svg+xml');\n    } catch (_err) {"""
    rep6 = """    let ActiveDOMParser = typeof DOMParser !== 'undefined' ? DOMParser : null;\n    let ActiveXMLSerializer = typeof XMLSerializer !== 'undefined' ? XMLSerializer : null;\n    if (!ActiveDOMParser || !ActiveXMLSerializer) {\n      try {\n        const xmldom = require('@xmldom/xmldom');\n        ActiveDOMParser = xmldom.DOMParser;\n        ActiveXMLSerializer = xmldom.XMLSerializer;\n      } catch (e) {\n        try {\n          const xmldom = require('xmldom');\n          ActiveDOMParser = xmldom.DOMParser;\n          ActiveXMLSerializer = xmldom.XMLSerializer;\n        } catch (e2) {\n          return fallbackRegexStrip(input);\n        }\n      }\n    }\n    let doc;\n    try {\n      const parser = new ActiveDOMParser();\n      doc = parser.parseFromString(input, 'image/svg+xml');\n    } catch (_err) {"""
    content = content.replace(target6, rep6)
    
    target7 = """    try {\n      const serializer = new XMLSerializer();\n      return serializer.serializeToString(svg);\n    } catch (_err) {"""
    rep7 = """    try {\n      const serializer = new ActiveXMLSerializer();\n      return serializer.serializeToString(svg);\n    } catch (_err) {"""
    content = content.replace(target7, rep7)
    with open(p, 'w') as f: f.write(content)

# 7. engine.js
p = os.path.join(base_dir, "src/core/engine.js")
if os.path.exists(p):
    with open(p, 'r') as f: content = f.read()
    content = content.replace("  class VectorEngine {", """  const generateId = () => {\n    if (typeof crypto !== 'undefined' && crypto.randomUUID) {\n      return crypto.randomUUID();\n    }\n    return Math.random().toString(36).slice(2, 11) + Math.random().toString(36).slice(2, 11);\n  };\n\n  class VectorEngine {""")
    content = content.replace("Math.random().toString(36).slice(2, 11)", "generateId()")
    with open(p, 'w') as f: f.write(content)

# 8. main.js
p = os.path.join(base_dir, "src/main.js")
if os.path.exists(p):
    with open(p, 'r') as f: content = f.read()
    target8 = """    window.Vectura.UI?.MultiSelectionPanel?.init?.(app);\n    window.Vectura.UI?.PathfinderPanel?.init?.(app);\n    window.Vectura.UI?.PaintBucketPanel?.init?.(app);"""
    rep8 = """    const UI = window.Vectura.UI;\n    if (!UI || !UI.MultiSelectionPanel || !UI.PathfinderPanel || !UI.PaintBucketPanel) {\n      console.warn('[Vectura] Critical UI panels failed to load.');\n    }\n    UI?.MultiSelectionPanel?.init?.(app);\n    UI?.PathfinderPanel?.init?.(app);\n    UI?.PaintBucketPanel?.init?.(app);"""
    content = content.replace(target8, rep8)
    with open(p, 'w') as f: f.write(content)

# 9. package.json
p = os.path.join(base_dir, "package.json")
if os.path.exists(p):
    with open(p, 'r') as f: data = json.load(f)
    if "dependencies" not in data: data["dependencies"] = {}
    data["dependencies"]["@xmldom/xmldom"] = "^0.8.10"
    with open(p, 'w') as f: json.dump(data, f, indent=2)

print("Done")
