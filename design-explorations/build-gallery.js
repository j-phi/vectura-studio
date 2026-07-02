/* Assembles the six Text-panel redesign concepts into one switchable gallery HTML. */
const fs = require('fs');
const path = require('path');

const SRC = '/private/tmp/claude-501/-Users-jayphi-Documents-github-vectura-studio/02d36763-b37f-4704-89f6-ccbb01a1ccd0/tasks/w0sf1ao52.output';
const OUT = path.join(__dirname, 'text-panel-redesign.html');

const outer = JSON.parse(fs.readFileSync(SRC, 'utf8'));
let r = outer.result;
if (typeof r === 'string') r = JSON.parse(r);
const { concepts, panel } = r;

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
// srcdoc attribute escaping: ampersand + double-quote are the required ones
const srcdocEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');

// Order concepts by panel ranking (rank 1 first); fall back to judge total.
const rankOf = {};
for (const row of panel.ranking) rankOf[row.name] = row.rank;
const ordered = [...concepts].sort((a, b) => {
  const ra = rankOf[a.name] ?? 99, rb = rankOf[b.name] ?? 99;
  if (ra !== rb) return ra - rb;
  return b.judge.total - a.judge.total;
});

const scoreBar = (label, val) => `
  <div class="sc-row">
    <span class="sc-lbl">${esc(label)}</span>
    <span class="sc-track"><span class="sc-fill" style="width:${(val / 25) * 100}%"></span></span>
    <span class="sc-val">${val}<span class="sc-max">/25</span></span>
  </div>`;

const tabs = ordered.map((c, i) => {
  const rk = rankOf[c.name];
  return `<button class="tab${i === 0 ? ' active' : ''}" data-i="${i}">
    <span class="tab-rank">#${rk ?? '–'}</span>
    <span class="tab-name">${esc(c.name)}</span>
    <span class="tab-score">${c.judge.total}</span>
  </button>`;
}).join('');

const panels = ordered.map((c, i) => {
  const issues = (c.review && Array.isArray(c.review.issues)) ? c.review.issues : [];
  const moves = (c.keyMoves || []).map((m) => `<li>${esc(m)}</li>`).join('');
  const changelog = (c.changelog || []).map((m) => `<li>${esc(m)}</li>`).join('');
  const lost = (c.review && c.review.lostFunctionality) || [];
  return `<section class="concept${i === 0 ? ' active' : ''}" data-i="${i}">
    <div class="stage">
      <div class="stage-bar">
        <span class="dot"></span><span class="dot"></span><span class="dot"></span>
        <span class="stage-title">${esc(c.name)} — Text panel mockup</span>
        <a class="pop" href="data:text/html;charset=utf-8,${encodeURIComponent(c.html)}" target="_blank" rel="noopener">Open standalone ↗</a>
      </div>
      <iframe loading="lazy" srcdoc="${srcdocEsc(c.html)}"></iframe>
    </div>
    <aside class="info">
      <div class="info-card">
        <h3>Judge score <b>${c.judge.total}<span class="of">/100</span></b></h3>
        ${scoreBar('Ease of use', c.judge.scores.easeOfUse)}
        ${scoreBar('Consistency', c.judge.scores.consistency)}
        ${scoreBar('Delight', c.judge.scores.delight)}
        ${scoreBar('Completeness', c.judge.scores.completeness)}
        <p class="verdict">${esc(c.judge.verdict)}</p>
        <p class="sw"><b class="good">Standout.</b> ${esc(c.judge.standout)}</p>
        <p class="sw"><b class="bad">Weakness.</b> ${esc(c.judge.weakness)}</p>
      </div>
      <div class="info-card">
        <h3>Design thesis</h3>
        <p class="thesis">${esc(c.thesis)}</p>
      </div>
      <div class="info-card">
        <h3>Key moves</h3>
        <ul>${moves}</ul>
      </div>
      <div class="info-card">
        <h3>Why users love it</h3>
        <p class="thesis">${esc(c.rationale)}</p>
      </div>
      ${changelog ? `<div class="info-card"><h3>Fixed after adversarial review</h3><ul>${changelog}</ul></div>` : ''}
      <div class="info-card">
        <h3>Adversarial review</h3>
        ${lost.length ? `<p class="sw"><b class="bad">Lost functionality flagged:</b> ${esc(lost.join('; '))}</p>` : '<p class="sw"><b class="good">No lost functionality.</b></p>'}
        ${c.review ? `<p class="verdict">${esc(c.review.verdict)}</p>` : ''}
        ${issues.length ? `<ul class="issues">${issues.map((it) => `<li><span class="sev sev-${esc(it.severity)}">${esc(it.severity)}</span> ${esc(it.problem)} <em>→ ${esc(it.fix)}</em></li>`).join('')}</ul>` : ''}
      </div>
    </aside>
  </section>`;
}).join('\n');

const rankingRows = panel.ranking
  .sort((a, b) => a.rank - b.rank)
  .map((row) => `<li><span class="rk">#${row.rank}</span> <b>${esc(row.name)}</b> — ${esc(row.oneLine)}</li>`)
  .join('');

const doc = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Vectura — Text Panel Redesign · 6 concepts</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
:root{
  --ui-bg:#1b1b1b; --ui-panel:#252525; --ui-panel-alt:#1e1e1e;
  --ui-border:#363636; --ui-border-hi:#484848;
  --ui-text:#e0e0e0; --ui-text-2:#a8a8a8; --ui-muted:#909097;
  --ui-accent:#4e9ee1; --ui-accent-2:rgba(78,158,225,.12);
  --good:#5ec98b; --bad:#e0a052; --danger:#e05252;
  --font-ui:'Space Grotesk',system-ui,sans-serif;
  --font-mono:'JetBrains Mono',monospace;
}
*{box-sizing:border-box}
html,body{margin:0}
body{
  background:radial-gradient(1100px 700px at 15% -8%,rgba(78,158,225,.06),transparent 60%),var(--ui-bg);
  color:var(--ui-text); font-family:var(--font-ui);
  -webkit-font-smoothing:antialiased; min-height:100vh;
}
.topbar{
  position:sticky; top:0; z-index:30; backdrop-filter:blur(8px);
  background:rgba(27,27,27,.86); border-bottom:1px solid var(--ui-border);
  padding:14px 26px 0;
}
.topbar h1{font-size:16px; font-weight:700; margin:0; letter-spacing:.2px}
.topbar h1 b{color:var(--ui-accent)}
.topbar .sub{color:var(--ui-muted); font-size:11px; margin:4px 0 12px; font-family:var(--font-mono)}
.tabs{display:flex; gap:6px; flex-wrap:wrap}
.tab{
  display:flex; align-items:center; gap:8px; cursor:pointer;
  background:var(--ui-panel); color:var(--ui-text-2);
  border:1px solid var(--ui-border); border-bottom:none;
  border-radius:9px 9px 0 0; padding:9px 13px; font-family:var(--font-ui);
  font-size:12px; font-weight:600; transition:background .12s,color .12s,border-color .12s;
}
.tab:hover{background:var(--ui-ctrl-hov,#2f2f2f); color:var(--ui-text)}
.tab.active{background:var(--ui-bg); color:var(--ui-text); border-color:var(--ui-accent); position:relative}
.tab.active::after{content:""; position:absolute; left:0; right:0; bottom:-1px; height:2px; background:var(--ui-bg)}
.tab-rank{font-family:var(--font-mono); font-size:10px; color:var(--ui-accent)}
.tab-score{
  font-family:var(--font-mono); font-size:10px; color:var(--ui-text-2);
  background:var(--ui-accent-2); padding:1px 6px; border-radius:20px;
}
.tab.active .tab-score{color:var(--ui-accent)}

.summary{
  margin:18px 26px 4px; padding:16px 18px; background:var(--ui-panel);
  border:1px solid var(--ui-border); border-left:3px solid var(--ui-accent);
  border-radius:10px;
}
.summary h2{margin:0 0 8px; font-size:13px; color:var(--ui-accent); letter-spacing:.4px; text-transform:uppercase}
.summary .rec{font-size:13px; line-height:1.55; margin:0 0 10px}
.summary .rec b{color:#fff}
.summary .hybrid{font-size:12px; color:var(--ui-text-2); line-height:1.5; margin:0 0 12px}
.summary ol{margin:0; padding:0; list-style:none; display:grid; gap:5px}
.summary ol li{font-size:12px; color:var(--ui-text-2); line-height:1.4}
.summary ol li b{color:var(--ui-text)}
.summary .rk{font-family:var(--font-mono); font-size:11px; color:var(--ui-accent); margin-right:4px}

.stagewrap{padding:18px 26px 60px}
.concept{display:none; grid-template-columns:minmax(0,1fr) 360px; gap:22px; align-items:start}
.concept.active{display:grid}
@media(max-width:1080px){ .concept.active{grid-template-columns:1fr} }

.stage{position:sticky; top:118px}
.stage-bar{
  display:flex; align-items:center; gap:7px; padding:8px 12px;
  background:var(--ui-panel-alt); border:1px solid var(--ui-border);
  border-bottom:none; border-radius:10px 10px 0 0;
}
.stage-bar .dot{width:9px; height:9px; border-radius:50%; background:var(--ui-border-hi)}
.stage-bar .dot:nth-child(1){background:#e05252aa}
.stage-bar .dot:nth-child(2){background:#e0a052aa}
.stage-bar .dot:nth-child(3){background:#5ec98baa}
.stage-title{font-size:11px; color:var(--ui-muted); font-family:var(--font-mono); margin-left:6px}
.stage-bar .pop{margin-left:auto; font-size:10px; color:var(--ui-accent); text-decoration:none; font-family:var(--font-mono)}
.stage-bar .pop:hover{text-decoration:underline}
.stage iframe{
  width:100%; height:760px; border:1px solid var(--ui-border); border-top:none;
  border-radius:0 0 10px 10px; background:var(--ui-bg); display:block;
}

.info{display:grid; gap:12px; min-width:0}
.info-card{
  background:var(--ui-panel); border:1px solid var(--ui-border);
  border-radius:10px; padding:13px 14px;
}
.info-card h3{
  margin:0 0 9px; font-size:11px; text-transform:uppercase; letter-spacing:.6px;
  color:var(--ui-text-2); display:flex; align-items:baseline; justify-content:space-between;
}
.info-card h3 b{color:var(--ui-accent); font-size:18px; font-family:var(--font-mono)}
.info-card h3 .of{color:var(--ui-muted); font-size:11px}
.info-card p{margin:0 0 8px; font-size:12px; line-height:1.55; color:var(--ui-text)}
.info-card p:last-child{margin-bottom:0}
.info-card ul{margin:0; padding-left:16px; display:grid; gap:5px}
.info-card li{font-size:12px; line-height:1.5; color:var(--ui-text-2)}
.thesis{color:var(--ui-text-2)!important}
.verdict{color:var(--ui-text-2)!important; font-style:italic}
.sw b.good{color:var(--good)} .sw b.bad{color:var(--bad)}
.sc-row{display:flex; align-items:center; gap:8px; margin-bottom:6px}
.sc-lbl{font-size:10px; color:var(--ui-text-2); width:84px; flex:0 0 auto}
.sc-track{flex:1; height:6px; background:var(--ui-border); border-radius:4px; overflow:hidden}
.sc-fill{display:block; height:100%; background:linear-gradient(90deg,var(--slider-start,#80c4f0),var(--ui-accent)); border-radius:4px}
.sc-val{font-family:var(--font-mono); font-size:10px; color:var(--ui-accent); width:42px; text-align:right; flex:0 0 auto}
.sc-val .sc-max{color:var(--ui-muted)}
.issues{margin-top:8px!important}
.issues li{margin-bottom:5px}
.issues em{color:var(--ui-muted); font-style:normal}
.sev{display:inline-block; font-size:9px; text-transform:uppercase; font-family:var(--font-mono); padding:1px 5px; border-radius:4px; margin-right:4px; letter-spacing:.4px}
.sev-blocker{background:rgba(224,82,82,.18); color:#e87171}
.sev-major{background:rgba(224,160,82,.18); color:#e0a052}
.sev-minor{background:rgba(144,144,151,.18); color:#a8a8a8}
</style>
</head>
<body>
<header class="topbar">
  <h1><b>Vectura</b> Text Panel — Redesign Exploration</h1>
  <p class="sub">6 parallel UX teams · research → design → adversarial review → revise → judge · tabs ordered by cross-panel rank</p>
  <div class="tabs">${tabs}</div>
</header>

<div class="summary">
  <h2>Cross-panel verdict · winner: ${esc(panel.winner)}</h2>
  <p class="rec">${esc(panel.recommendation)}</p>
  <p class="hybrid"><b style="color:var(--ui-accent)">Best hybrid:</b> ${esc(panel.hybridIdea)}</p>
  <ol>${rankingRows}</ol>
</div>

<div class="stagewrap">
${panels}
</div>

<script>
const tabs=[...document.querySelectorAll('.tab')];
const concepts=[...document.querySelectorAll('.concept')];
tabs.forEach(t=>t.addEventListener('click',()=>{
  const i=t.dataset.i;
  tabs.forEach(x=>x.classList.toggle('active',x===t));
  concepts.forEach(c=>c.classList.toggle('active',c.dataset.i===i));
  window.scrollTo({top:0,behavior:'smooth'});
}));
</script>
</body>
</html>`;

fs.writeFileSync(OUT, doc, 'utf8');
console.log('Wrote', OUT, '·', (doc.length / 1024).toFixed(0) + 'KB');
