'use strict';

require('dotenv').config();

const express = require('express');
const cors    = require('cors');

const webhookRoutes = require('./routes/webhooks');
const apiRoutes     = require('./routes/api');

const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json({ limit: '1mb' }));

// ─── Shared helpers ───────────────────────────────────────────────────────────

const SHARED_STYLES = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f172a; color: #e2e8f0; min-height: 100vh; }
  a { color: inherit; text-decoration: none; }

  .tier-badge { display: inline-block; font-size: 10px; font-weight: 700; letter-spacing: 0.8px; padding: 3px 8px; border-radius: 99px; text-transform: uppercase; }
  .tier-badge.hot  { background: #450a0a; color: #f87171; border: 1px solid #7f1d1d; }
  .tier-badge.warm { background: #451a03; color: #fbbf24; border: 1px solid #78350f; }
  .tier-badge.cold { background: #0c1a3a; color: #60a5fa; border: 1px solid #1e3a5f; }

  .source-pill { display: inline-block; font-size: 10px; font-weight: 600; padding: 2px 7px; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.4px; margin-right: 4px; }
  .source-pill.rb2b   { background: #1e1b4b; color: #a5b4fc; border: 1px solid #312e81; }
  .source-pill.vector { background: #0d2d1a; color: #6ee7b7; border: 1px solid #064e3b; }

  .score-wrap { display: flex; align-items: center; gap: 8px; min-width: 100px; }
  .score-bar-bg { flex: 1; height: 6px; background: #0f172a; border-radius: 99px; overflow: hidden; }
  .score-bar { height: 100%; border-radius: 99px; }
  .score-bar.hot  { background: #ef4444; }
  .score-bar.warm { background: #f59e0b; }
  .score-bar.cold { background: #3b82f6; }
  .score-num { font-size: 13px; font-weight: 700; width: 28px; text-align: right; flex-shrink: 0; }
  .score-num.hot  { color: #f87171; }
  .score-num.warm { color: #fbbf24; }
  .score-num.cold { color: #60a5fa; }

  .engagement-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; margin-top: 4px; }
  .engagement-dot.page       { background: #6366f1; }
  .engagement-dot.click      { background: #ef4444; }
  .engagement-dot.impression { background: #f59e0b; }
`;

const SHARED_JS = `
  function esc(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function relativeTime(iso) {
    if (!iso) return '—';
    const d = Math.floor((Date.now() - new Date(iso)) / 1000);
    if (d < 60)   return 'just now';
    if (d < 3600) return Math.floor(d/60)   + 'm ago';
    if (d < 86400)return Math.floor(d/3600) + 'h ago';
    return Math.floor(d/86400) + 'd ago';
  }
  function scoreBadge(score, tier) {
    return \`<div class="score-wrap">
      <div class="score-bar-bg"><div class="score-bar \${tier}" style="width:\${score}%"></div></div>
      <span class="score-num \${tier}">\${score}</span>
    </div>\`;
  }
`;

// ─── Shared page shell ────────────────────────────────────────────────────────

function shell(title, activeTab, body, extraStyles = '') {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title} — Visitor Intelligence</title>
<style>
  ${SHARED_STYLES}
  ${extraStyles}

  /* ── Top nav ── */
  .topbar { display:flex; align-items:center; gap:0; padding:0 32px; border-bottom:1px solid #1e293b; height:52px; }
  .topbar-brand { font-size:15px; font-weight:800; color:#f8fafc; letter-spacing:-0.3px; margin-right:32px; }
  .nav-tab { display:inline-flex; align-items:center; height:52px; padding:0 16px; font-size:13px; font-weight:500;
             color:#64748b; border-bottom:2px solid transparent; margin-bottom:-1px; cursor:pointer; transition:color .15s; text-decoration:none; }
  .nav-tab:hover { color:#cbd5e1; }
  .nav-tab.active { color:#f1f5f9; border-bottom-color:#6366f1; font-weight:600; }
  .topbar-right { margin-left:auto; display:flex; align-items:center; gap:8px; }
  .topbar-meta { font-size:12px; color:#475569; }
  .admin-link { font-size:12px; color:#64748b; border:1px solid #334155; padding:3px 12px; border-radius:99px; background:#1e293b; }
  .admin-link:hover { color:#f1f5f9; }

  /* ── Stats bar ── */
  .stats-grid { display:grid; grid-template-columns:repeat(6,1fr); gap:12px; padding:20px 32px; }
  .stat-card { background:#1e293b; border:1px solid #334155; border-radius:12px; padding:16px 20px; }
  .stat-card .lbl { font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:.8px; color:#64748b; margin-bottom:6px; }
  .stat-card .val { font-size:28px; font-weight:700; color:#f1f5f9; line-height:1; }
  .stat-card.hot  .val { color:#f87171; }
  .stat-card.warm .val { color:#fbbf24; }
  .stat-card.cold .val { color:#60a5fa; }

  /* ── Dashboard charts row ── */
  .dashboard-row { display:grid; grid-template-columns:200px 1fr 1fr; gap:12px; padding:0 32px 20px; }
  .chart-card { background:#1e293b; border:1px solid #334155; border-radius:12px; padding:16px 20px; }
  .chart-title { font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:.7px; color:#64748b; margin-bottom:14px; }
  .donut-wrap { display:flex; flex-direction:column; align-items:center; gap:10px; }
  .donut-legend { display:flex; flex-direction:column; gap:5px; width:100%; }
  .legend-item { display:flex; align-items:center; justify-content:space-between; font-size:12px; }
  .legend-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; margin-right:6px; }
  .legend-label { color:#94a3b8; display:flex; align-items:center; }
  .legend-val { color:#e2e8f0; font-weight:600; font-size:12px; }
  .bar-list { display:flex; flex-direction:column; gap:8px; }
  .bar-item { display:flex; flex-direction:column; gap:4px; }
  .bar-item-header { display:flex; justify-content:space-between; font-size:12px; }
  .bar-item-label { color:#94a3b8; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:180px; }
  .bar-item-val { color:#e2e8f0; font-weight:600; flex-shrink:0; margin-left:8px; }
  .bar-track { height:4px; background:#0f172a; border-radius:99px; overflow:hidden; }
  .bar-fill { height:100%; border-radius:99px; background:#6366f1; }
  .bar-fill.hot  { background:#ef4444; }
  .bar-fill.warm { background:#f59e0b; }

  /* ── Filter bar ── */
  .filter-bar { display:flex; align-items:flex-end; justify-content:space-between; flex-wrap:wrap; gap:8px; padding:0 32px 12px; }
  .filter-bar-left { display:flex; gap:8px; align-items:flex-end; flex-wrap:wrap; }
  .filter-bar-right { display:flex; gap:6px; align-items:center; padding-bottom:1px; }
  .filter-field-wrap { display:flex; flex-direction:column; gap:3px; }
  .filter-field-label { font-size:10px; font-weight:600; text-transform:uppercase; letter-spacing:.6px; color:#475569; }
  .filter-text-input { background:#1e293b; border:1px solid #334155; border-radius:8px; padding:5px 10px; font-size:12px; color:#e2e8f0; font-family:inherit; outline:none; width:160px; }
  .filter-text-input:focus { border-color:#6366f1; }
  .filter-text-input::placeholder { color:#475569; }
  .filter-select { background:#1e293b; border:1px solid #334155; border-radius:8px; padding:5px 10px; font-size:12px; color:#e2e8f0; font-family:inherit; outline:none; cursor:pointer; }
  .filter-select:focus { border-color:#6366f1; }
  .filter-select option { background:#1e293b; }
  .score-range-wrap { display:flex; flex-direction:column; gap:3px; }
  .score-range-label { font-size:10px; font-weight:600; text-transform:uppercase; letter-spacing:.6px; color:#475569; }
  input[type=range] { accent-color:#6366f1; width:90px; cursor:pointer; display:block; margin-top:2px; }
  .chip { display:inline-flex; align-items:center; gap:5px; background:#1e1b4b; border:1px solid #312e81; color:#a5b4fc; font-size:11px; font-weight:600; padding:3px 8px; border-radius:99px; cursor:pointer; transition:all .15s; }
  .chip:hover { background:#312e81; }
  .chip-x { opacity:.7; font-size:10px; }
  .chip:hover .chip-x { opacity:1; }
  .clear-filters-btn { background:transparent; border:1px solid #334155; border-radius:8px; color:#64748b; font-size:12px; padding:4px 10px; cursor:pointer; font-family:inherit; transition:all .15s; }
  .clear-filters-btn:hover { border-color:#f87171; color:#f87171; }

  /* ── Table base ── */
  .section-wrap { padding:0 32px 40px; }
  .section-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:14px; flex-wrap:wrap; gap:8px; }
  .section-title { font-size:14px; font-weight:600; color:#94a3b8; }
  .filter-row { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
  .filter-btn { font-size:12px; padding:4px 12px; border-radius:99px; border:1px solid #334155; background:transparent; color:#94a3b8; cursor:pointer; transition:all .15s; }
  .filter-btn:hover, .filter-btn.active { border-color:#6366f1; color:#818cf8; background:#1e1b4b; }
  .filter-btn.active { font-weight:600; }
  .search-box { background:#1e293b; border:1px solid #334155; border-radius:8px; padding:5px 12px; font-size:12px; color:#e2e8f0; font-family:inherit; outline:none; width:200px; }
  .search-box:focus { border-color:#6366f1; }
  .search-box::placeholder { color:#475569; }

  /* sortable table */
  table { width:100%; border-collapse:collapse; font-size:13px; }
  thead th { text-align:left; padding:10px 14px; font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:.6px; color:#475569; border-bottom:1px solid #1e293b; white-space:nowrap; user-select:none; }
  thead th.sortable { cursor:pointer; }
  thead th.sortable:hover { color:#94a3b8; }
  thead th.sort-asc, thead th.sort-desc { color:#818cf8; }
  .sort-icon { margin-left:4px; opacity:0.5; font-size:10px; }
  thead th.sort-asc  .sort-icon,
  thead th.sort-desc .sort-icon { opacity:1; color:#818cf8; }
  tbody tr { border-bottom:1px solid #1e293b; transition:background .1s; cursor:pointer; }
  tbody tr:hover { background:#1e293b; }
  tbody td { padding:12px 14px; vertical-align:middle; }

  .contact-name { font-weight:600; color:#f1f5f9; font-size:13px; }
  .contact-sub  { font-size:12px; color:#64748b; margin-top:2px; }
  .contact-sub a:hover { color:#818cf8; text-decoration:underline; }
  .cell-muted { color:#94a3b8; font-size:12px; }
  .cell-dim   { color:#64748b; font-size:12px; }

  #error-banner { display:none; margin:0 32px 16px; padding:12px 16px; background:#450a0a; border:1px solid #7f1d1d; border-radius:8px; color:#fca5a5; font-size:13px; }

  /* ── Account list rows ── */
  .acct-avatar { width:34px; height:34px; border-radius:8px; background:#1e293b; border:1px solid #334155; display:inline-flex; align-items:center; justify-content:center; font-size:14px; font-weight:700; color:#6366f1; flex-shrink:0; }
  .acct-name { font-weight:600; color:#f1f5f9; font-size:13px; }
  .acct-domain { font-size:11px; color:#475569; margin-top:1px; }
</style>
</head>
<body>

<div class="topbar">
  <span class="topbar-brand">Visitor Intelligence</span>
  <a href="/" class="nav-tab ${activeTab === 'people' ? 'active' : ''}">People</a>
  <a href="/accounts" class="nav-tab ${activeTab === 'accounts' ? 'active' : ''}">Accounts</a>
  <div class="topbar-right">
    <span class="topbar-meta" id="last-updated"></span>
    <a href="/admin" class="admin-link">⚙ Admin</a>
  </div>
</div>

<div id="error-banner"></div>

${body}

<script>
  ${SHARED_JS}
</script>
</body>
</html>`;
}

// ─── GET /  (People) ──────────────────────────────────────────────────────────

app.get('/', (req, res) => {
  res.send(shell('People', 'people', `

<div class="stats-grid" id="stats-grid">
  <div class="stat-card"><div class="lbl">Total</div><div class="val" id="s-total">—</div></div>
  <div class="stat-card hot"><div class="lbl">Hot</div><div class="val" id="s-hot">—</div></div>
  <div class="stat-card warm"><div class="lbl">Warm</div><div class="val" id="s-warm">—</div></div>
  <div class="stat-card cold"><div class="lbl">Cold</div><div class="val" id="s-cold">—</div></div>
  <div class="stat-card"><div class="lbl">Avg Score</div><div class="val" id="s-avg">—</div></div>
  <div class="stat-card"><div class="lbl">Ad Clicks</div><div class="val" id="s-clicks">—</div></div>
</div>

<!-- Dashboard charts -->
<div class="dashboard-row" id="dashboard-row" style="display:none">
  <div class="chart-card">
    <div class="chart-title">Tier Breakdown</div>
    <div class="donut-wrap">
      <svg id="donut-svg" width="110" height="110" viewBox="0 0 110 110"></svg>
      <div class="donut-legend" id="donut-legend"></div>
    </div>
  </div>
  <div class="chart-card">
    <div class="chart-title">Top Companies</div>
    <div class="bar-list" id="top-companies"></div>
  </div>
  <div class="chart-card">
    <div class="chart-title">Top Job Titles</div>
    <div class="bar-list" id="top-titles"></div>
  </div>
</div>

<div class="section-wrap">
  <!-- datalists for autocomplete -->
  <datalist id="dl-titles"></datalist>
  <datalist id="dl-companies"></datalist>

  <!-- Filter bar -->
  <div class="filter-bar" id="filter-bar">
    <div class="filter-bar-left">
      <div class="filter-field-wrap">
        <span class="filter-field-label">Search</span>
        <input class="search-box" id="search" placeholder="Name, email, company…" oninput="debounceRender()">
      </div>
      <div class="filter-field-wrap">
        <span class="filter-field-label">Title contains</span>
        <input class="filter-text-input" id="f-title" list="dl-titles" placeholder="e.g. VP, Director…" oninput="debounceRender()">
      </div>
      <div class="filter-field-wrap">
        <span class="filter-field-label">Company contains</span>
        <input class="filter-text-input" id="f-company" list="dl-companies" placeholder="e.g. Acme…" oninput="debounceRender()">
      </div>
      <div class="filter-field-wrap">
        <span class="filter-field-label">Source</span>
        <select class="filter-select" id="f-source" onchange="renderTable()" style="margin-top:1px">
          <option value="">Any</option>
          <option value="rb2b">RB2B</option>
          <option value="vector">Vector</option>
        </select>
      </div>
      <div class="score-range-wrap">
        <span class="filter-field-label">Score ≥ <span id="score-min-val">0</span></span>
        <input type="range" id="f-score-min" min="0" max="100" value="0" oninput="document.getElementById('score-min-val').textContent=this.value; renderTable()">
      </div>
    </div>
    <div class="filter-bar-right">
      <button class="filter-btn active" data-tier="">All</button>
      <button class="filter-btn" data-tier="hot">🔥 Hot</button>
      <button class="filter-btn" data-tier="warm">⚡ Warm</button>
      <button class="filter-btn" data-tier="cold">❄ Cold</button>
    </div>
  </div>
  <!-- Active filter chips -->
  <div id="active-chips" style="display:none;padding:0 32px 10px;gap:6px;flex-wrap:wrap;align-items:center"></div>

  <div class="section-header" style="margin-top:4px">
    <span class="section-title" id="people-label">People</span>
    <button class="clear-filters-btn" id="clear-filters" onclick="clearAllFilters()" style="display:none">✕ Clear filters</button>
  </div>
  <table id="people-table">
    <thead>
      <tr>
        <th class="sortable" data-col="name">Person <span class="sort-icon">↕</span></th>
        <th class="sortable" data-col="jobTitle">Title <span class="sort-icon">↕</span></th>
        <th class="sortable" data-col="company">Company <span class="sort-icon">↕</span></th>
        <th class="sortable sort-desc" data-col="intentScore">Score <span class="sort-icon">↓</span></th>
        <th class="sortable" data-col="intentTier">Tier <span class="sort-icon">↕</span></th>
        <th>Sources</th>
        <th class="sortable" data-col="visitCount">Visits <span class="sort-icon">↕</span></th>
        <th class="sortable" data-col="lastSeenAt">Last Seen <span class="sort-icon">↕</span></th>
      </tr>
    </thead>
    <tbody id="people-body">
      <tr><td colspan="8" style="text-align:center;padding:48px;color:#475569">Loading…</td></tr>
    </tbody>
  </table>
</div>

<script>
  let activeTier = '', searchTimer;
  let allPeople = [];
  let sortCol = 'intentScore', sortDir = 'desc';

  async function loadPeople() {
    const data = await fetch('/api/contacts?limit=200&sort=intentScore&order=desc').then(r => r.json());
    allPeople = data.contacts || [];
    populateAutocomplete(allPeople);
    buildDashboard(allPeople);
    renderTable();
  }

  function populateAutocomplete(people) {
    // Job titles datalist — sorted by frequency desc
    const titleMap = {};
    people.forEach(p => { if (p.jobTitle) titleMap[p.jobTitle] = (titleMap[p.jobTitle]||0)+1; });
    const titles = Object.entries(titleMap).sort((a,b)=>b[1]-a[1]).map(([t])=>t);
    document.getElementById('dl-titles').innerHTML =
      titles.map(t => \`<option value="\${esc(t)}">\`).join('');

    // Companies datalist — sorted alpha
    const companies = [...new Set(people.map(p=>p.company).filter(Boolean))].sort();
    document.getElementById('dl-companies').innerHTML =
      companies.map(c => \`<option value="\${esc(c)}">\`).join('');
  }

  async function loadStats() {
    const s = await fetch('/api/stats').then(r => r.json());
    document.getElementById('s-total').textContent  = s.totalContacts;
    document.getElementById('s-hot').textContent    = s.hotCount;
    document.getElementById('s-warm').textContent   = s.warmCount;
    document.getElementById('s-cold').textContent   = s.coldCount;
    document.getElementById('s-avg').textContent    = s.avgIntentScore;
    document.getElementById('s-clicks').textContent = s.adClickTotal;
  }

  function buildDashboard(people) {
    // Tier donut
    const hot  = people.filter(p => p.intentTier === 'hot').length;
    const warm = people.filter(p => p.intentTier === 'warm').length;
    const cold = people.filter(p => p.intentTier === 'cold').length;
    drawDonut([
      { label:'Hot',  val:hot,  color:'#ef4444' },
      { label:'Warm', val:warm, color:'#f59e0b' },
      { label:'Cold', val:cold, color:'#3b82f6' },
    ], 'donut-svg', 'donut-legend');

    // Top companies
    const compMap = {};
    people.forEach(p => { const c = p.company||'Unknown'; compMap[c] = (compMap[c]||0)+1; });
    const topCompanies = Object.entries(compMap).sort((a,b)=>b[1]-a[1]).slice(0,7);
    const maxC = topCompanies[0]?.[1] || 1;
    document.getElementById('top-companies').innerHTML = topCompanies.map(([name,cnt]) =>
      \`<div class="bar-item">
        <div class="bar-item-header"><span class="bar-item-label" title="\${esc(name)}">\${esc(name)}</span><span class="bar-item-val">\${cnt}</span></div>
        <div class="bar-track"><div class="bar-fill" style="width:\${Math.round(cnt/maxC*100)}%"></div></div>
      </div>\`).join('');

    // Top job titles
    const titleMap = {};
    people.forEach(p => { if (p.jobTitle) { titleMap[p.jobTitle] = (titleMap[p.jobTitle]||0)+1; } });
    const topTitles = Object.entries(titleMap).sort((a,b)=>b[1]-a[1]).slice(0,7);
    const maxT = topTitles[0]?.[1] || 1;
    document.getElementById('top-titles').innerHTML = topTitles.map(([name,cnt]) =>
      \`<div class="bar-item">
        <div class="bar-item-header"><span class="bar-item-label" title="\${esc(name)}">\${esc(name)}</span><span class="bar-item-val">\${cnt}</span></div>
        <div class="bar-track"><div class="bar-fill" style="width:\${Math.round(cnt/maxT*100)}%"></div></div>
      </div>\`).join('');

    document.getElementById('dashboard-row').style.display = 'grid';
  }

  function drawDonut(segments, svgId, legendId) {
    const cx=55, cy=55, r=38, inner=24;
    const total = segments.reduce((s,x)=>s+x.val,0) || 1;
    let startAngle = -Math.PI/2;
    let paths = '';
    segments.forEach(seg => {
      const angle = (seg.val/total) * 2 * Math.PI;
      const endAngle = startAngle + angle;
      if (angle < 0.01) { startAngle = endAngle; return; }
      const x1=cx+r*Math.cos(startAngle), y1=cy+r*Math.sin(startAngle);
      const x2=cx+r*Math.cos(endAngle),   y2=cy+r*Math.sin(endAngle);
      const x3=cx+inner*Math.cos(endAngle),y3=cy+inner*Math.sin(endAngle);
      const x4=cx+inner*Math.cos(startAngle),y4=cy+inner*Math.sin(startAngle);
      const large = angle > Math.PI ? 1 : 0;
      paths += \`<path d="M\${x1},\${y1} A\${r},\${r} 0 \${large},1 \${x2},\${y2} L\${x3},\${y3} A\${inner},\${inner} 0 \${large},0 \${x4},\${y4} Z" fill="\${seg.color}"/>\`;
      startAngle = endAngle;
    });
    document.getElementById(svgId).innerHTML = paths +
      \`<text x="\${cx}" y="\${cy+5}" text-anchor="middle" fill="#f1f5f9" font-size="18" font-weight="700" font-family="system-ui">\${total}</text>\`;
    document.getElementById(legendId).innerHTML = segments.map(s =>
      \`<div class="legend-item">
        <span class="legend-label"><span class="legend-dot" style="background:\${s.color}"></span>\${s.label}</span>
        <span class="legend-val">\${s.val} <span style="color:#475569;font-weight:400">\${Math.round(s.val/total*100)}%</span></span>
      </div>\`).join('');
  }

  function getVal(c, col) {
    switch(col) {
      case 'name':       return ((c.firstName||'') + ' ' + (c.lastName||'')).trim().toLowerCase() || (c.fullName||'').toLowerCase();
      case 'jobTitle':   return (c.jobTitle||'').toLowerCase();
      case 'company':    return (c.company||'').toLowerCase();
      case 'intentScore':return c.intentScore || 0;
      case 'intentTier': return ['hot','warm','cold'].indexOf(c.intentTier||'cold');
      case 'visitCount': return c.visitCount || 0;
      case 'lastSeenAt': return c.lastSeenAt || '';
      default:           return '';
    }
  }

  function renderTable() {
    const q         = (document.getElementById('search').value || '').toLowerCase();
    const fTitle    = (document.getElementById('f-title').value || '').toLowerCase().trim();
    const fCompany  = (document.getElementById('f-company').value || '').toLowerCase().trim();
    const fSource   = document.getElementById('f-source').value;
    const fScoreMin = parseInt(document.getElementById('f-score-min').value, 10) || 0;

    let list = allPeople.slice();
    if (activeTier)  list = list.filter(c => c.intentTier === activeTier);
    if (fTitle)      list = list.filter(c => (c.jobTitle||'').toLowerCase().includes(fTitle));
    if (fCompany)    list = list.filter(c => (c.company||'').toLowerCase().includes(fCompany));
    if (fSource)     list = list.filter(c => (c.sources||[]).includes(fSource));
    if (fScoreMin>0) list = list.filter(c => (c.intentScore||0) >= fScoreMin);
    if (q) list = list.filter(c =>
      ((c.firstName||'') + ' ' + (c.lastName||'')).toLowerCase().includes(q) ||
      (c.fullName||'').toLowerCase().includes(q) ||
      (c.company||'').toLowerCase().includes(q) ||
      (c.email||'').toLowerCase().includes(q) ||
      (c.jobTitle||'').toLowerCase().includes(q)
    );

    list.sort((a, b) => {
      const av = getVal(a, sortCol), bv = getVal(b, sortCol);
      const mul = sortDir === 'asc' ? 1 : -1;
      if (av < bv) return -1 * mul;
      if (av > bv) return  1 * mul;
      return 0;
    });

    document.getElementById('people-label').textContent = 'People (' + list.length + ')';

    // Render active filter chips
    const chips = [];
    if (activeTier) chips.push({ label: 'Tier: ' + activeTier, clear: () => { activeTier=''; document.querySelectorAll('.filter-btn').forEach(b=>{b.classList.remove('active'); if(!b.dataset.tier)b.classList.add('active');}); renderTable(); }});
    if (fTitle)     chips.push({ label: 'Title contains: ' + document.getElementById('f-title').value,    clear: () => { document.getElementById('f-title').value=''; renderTable(); }});
    if (fCompany)   chips.push({ label: 'Company contains: ' + document.getElementById('f-company').value,clear: () => { document.getElementById('f-company').value=''; renderTable(); }});
    if (fSource)    chips.push({ label: 'Source: ' + fSource,  clear: () => { document.getElementById('f-source').value=''; renderTable(); }});
    if (fScoreMin>0)chips.push({ label: 'Score ≥ ' + fScoreMin,clear: () => { document.getElementById('f-score-min').value=0; document.getElementById('score-min-val').textContent='0'; renderTable(); }});
    if (q)          chips.push({ label: 'Search: "' + q + '"', clear: () => { document.getElementById('search').value=''; renderTable(); }});

    const chipsEl = document.getElementById('active-chips');
    const clearBtn = document.getElementById('clear-filters');
    if (chips.length) {
      chipsEl.style.display = 'flex'; chipsEl.style.flexWrap = 'wrap';
      clearBtn.style.display = 'inline-flex';
      chipsEl.innerHTML = '<span style="font-size:11px;color:#475569;font-weight:600;text-transform:uppercase;letter-spacing:.6px;margin-right:2px">Filters:</span>' +
        chips.map((ch, i) => \`<span class="chip" data-chip="\${i}">\${esc(ch.label)} <span class="chip-x">✕</span></span>\`).join('');
      chipsEl.querySelectorAll('.chip').forEach((el, i) => {
        el.addEventListener('click', () => chips[i].clear());
      });
    } else {
      chipsEl.style.display = 'none';
      clearBtn.style.display = 'none';
    }

    // Update header arrows
    document.querySelectorAll('#people-table thead th.sortable').forEach(th => {
      const col = th.dataset.col;
      th.classList.remove('sort-asc','sort-desc');
      const icon = th.querySelector('.sort-icon');
      if (col === sortCol) {
        th.classList.add(sortDir === 'asc' ? 'sort-asc' : 'sort-desc');
        icon.textContent = sortDir === 'asc' ? '↑' : '↓';
      } else {
        icon.textContent = '↕';
      }
    });

    const tbody = document.getElementById('people-body');
    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:48px;color:#475569">No contacts found.</td></tr>';
      return;
    }

    tbody.innerHTML = list.map(c => {
      const name    = [c.firstName, c.lastName].filter(Boolean).join(' ') || c.fullName || '—';
      const tier    = c.intentTier || 'cold';
      const sources = (c.sources||[]).map(s => '<span class="source-pill '+s+'">'+s+'</span>').join('');
      const company = c.company
        ? '<a class="contact-sub" href="/account?company='+encodeURIComponent(c.company)+'" onclick="event.stopPropagation()">'+esc(c.company)+'</a>'
        : '';
      return '<tr onclick="location.href=\\'/account?company='+encodeURIComponent(c.company||'')+'\\'">' +
        '<td><div class="contact-name">'+esc(name)+'</div></td>' +
        '<td class="cell-muted">'+esc(c.jobTitle||'—')+'</td>' +
        '<td>'+company+'</td>' +
        '<td>'+scoreBadge(c.intentScore, tier)+'</td>' +
        '<td><span class="tier-badge '+tier+'">'+tier+'</span></td>' +
        '<td>'+sources+'</td>' +
        '<td class="cell-dim">'+(c.visitCount||0)+'</td>' +
        '<td class="cell-dim">'+relativeTime(c.lastSeenAt)+'</td>' +
        '</tr>';
    }).join('');
  }

  function debounceRender() { clearTimeout(searchTimer); searchTimer = setTimeout(renderTable, 200); }

  function clearAllFilters() {
    activeTier = '';
    ['search','f-title','f-company'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('f-source').value = '';
    document.getElementById('f-score-min').value = 0;
    document.getElementById('score-min-val').textContent = '0';
    document.querySelectorAll('.filter-btn').forEach(b => { b.classList.remove('active'); if (!b.dataset.tier) b.classList.add('active'); });
    renderTable();
  }

  // Sort header clicks
  document.querySelectorAll('#people-table thead th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      if (sortCol === col) {
        sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        sortCol = col;
        sortDir = ['intentScore','visitCount','lastSeenAt'].includes(col) ? 'desc' : 'asc';
      }
      renderTable();
    });
  });

  // Tier filter buttons
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeTier = btn.dataset.tier;
      renderTable();
    });
  });

  async function refresh() {
    try {
      await Promise.all([loadStats(), loadPeople()]);
      document.getElementById('last-updated').textContent = 'Updated ' + new Date().toLocaleTimeString();
      document.getElementById('error-banner').style.display = 'none';
    } catch(e) {
      const b = document.getElementById('error-banner');
      b.style.display = 'block'; b.textContent = 'Failed to load: ' + e.message;
    }
  }

  refresh();
  setInterval(refresh, 30000);
</script>
`));
});

// ─── GET /accounts  (Accounts list) ──────────────────────────────────────────

app.get('/accounts', (req, res) => {
  res.send(shell('Accounts', 'accounts', `

<div class="stats-grid" id="stats-grid">
  <div class="stat-card"><div class="lbl">Accounts</div><div class="val" id="s-accts">—</div></div>
  <div class="stat-card"><div class="lbl">People</div><div class="val" id="s-total">—</div></div>
  <div class="stat-card hot"><div class="lbl">Hot Accounts</div><div class="val" id="s-hot">—</div></div>
  <div class="stat-card warm"><div class="lbl">Warm</div><div class="val" id="s-warm">—</div></div>
  <div class="stat-card"><div class="lbl">Total Visits</div><div class="val" id="s-visits">—</div></div>
  <div class="stat-card"><div class="lbl">Ad Clicks</div><div class="val" id="s-clicks">—</div></div>
</div>

<!-- Dashboard charts -->
<div class="dashboard-row" id="dashboard-row" style="display:none">
  <div class="chart-card">
    <div class="chart-title">Account Tiers</div>
    <div class="donut-wrap">
      <svg id="donut-svg" width="110" height="110" viewBox="0 0 110 110"></svg>
      <div class="donut-legend" id="donut-legend"></div>
    </div>
  </div>
  <div class="chart-card">
    <div class="chart-title">Top Accounts by Score</div>
    <div class="bar-list" id="top-score-accts"></div>
  </div>
  <div class="chart-card">
    <div class="chart-title">Top Accounts by Visits</div>
    <div class="bar-list" id="top-visit-accts"></div>
  </div>
</div>

<div class="section-wrap">
  <div class="section-header">
    <span class="section-title" id="accts-label">Accounts</span>
    <div class="filter-row">
      <input class="search-box" id="search" placeholder="Search company…" oninput="debounceRender()">
      <button class="filter-btn active" data-tier="">All</button>
      <button class="filter-btn" data-tier="hot">🔥 Hot</button>
      <button class="filter-btn" data-tier="warm">⚡ Warm</button>
      <button class="filter-btn" data-tier="cold">❄ Cold</button>
    </div>
  </div>
  <table id="accts-table">
    <thead>
      <tr>
        <th class="sortable sort-asc" data-col="company">Account <span class="sort-icon">↑</span></th>
        <th class="sortable" data-col="peopleCount">People <span class="sort-icon">↕</span></th>
        <th class="sortable sort-desc" data-col="topIntentScore">Top Score <span class="sort-icon">↓</span></th>
        <th class="sortable" data-col="topIntentTier">Tier <span class="sort-icon">↕</span></th>
        <th>Sources</th>
        <th class="sortable" data-col="totalVisits">Visits <span class="sort-icon">↕</span></th>
        <th class="sortable" data-col="totalAdClicks">Ad Clicks <span class="sort-icon">↕</span></th>
        <th class="sortable" data-col="lastSeenAt">Last Seen <span class="sort-icon">↕</span></th>
      </tr>
    </thead>
    <tbody id="accts-body">
      <tr><td colspan="8" style="text-align:center;padding:48px;color:#475569">Loading…</td></tr>
    </tbody>
  </table>
</div>

<script>
  let activeTier = '', searchTimer, allAccounts = [];
  let sortCol = 'topIntentScore', sortDir = 'desc';

  async function loadAccounts() {
    const data = await fetch('/api/accounts').then(r => r.json());
    allAccounts = data.accounts || [];

    // Stats
    document.getElementById('s-accts').textContent  = allAccounts.length;
    const totalPeople = allAccounts.reduce((s,a) => s + a.peopleCount, 0);
    const hotAccts    = allAccounts.filter(a => a.topIntentTier === 'hot').length;
    const warmAccts   = allAccounts.filter(a => a.topIntentTier === 'warm').length;
    const totalVisits = allAccounts.reduce((s,a) => s + a.totalVisits, 0);
    const totalClicks = allAccounts.reduce((s,a) => s + a.totalAdClicks, 0);
    document.getElementById('s-total').textContent  = totalPeople;
    document.getElementById('s-hot').textContent    = hotAccts;
    document.getElementById('s-warm').textContent   = warmAccts;
    document.getElementById('s-visits').textContent = totalVisits;
    document.getElementById('s-clicks').textContent = totalClicks;

    buildDashboard(allAccounts);
    renderTable();
  }

  function buildDashboard(accounts) {
    const hot  = accounts.filter(a => a.topIntentTier === 'hot').length;
    const warm = accounts.filter(a => a.topIntentTier === 'warm').length;
    const cold = accounts.filter(a => a.topIntentTier === 'cold').length;
    drawDonut([
      { label:'Hot',  val:hot,  color:'#ef4444' },
      { label:'Warm', val:warm, color:'#f59e0b' },
      { label:'Cold', val:cold, color:'#3b82f6' },
    ], 'donut-svg', 'donut-legend');

    // Top by score
    const byScore = accounts.slice().sort((a,b)=>b.topIntentScore-a.topIntentScore).slice(0,7);
    const maxScore = byScore[0]?.topIntentScore || 1;
    document.getElementById('top-score-accts').innerHTML = byScore.map(a => {
      const tier = a.topIntentTier || 'cold';
      return \`<div class="bar-item">
        <div class="bar-item-header"><span class="bar-item-label" title="\${esc(a.company)}">\${esc(a.company)}</span><span class="bar-item-val">\${a.topIntentScore}</span></div>
        <div class="bar-track"><div class="bar-fill \${tier}" style="width:\${Math.round(a.topIntentScore/maxScore*100)}%"></div></div>
      </div>\`;
    }).join('');

    // Top by visits
    const byVisits = accounts.slice().sort((a,b)=>b.totalVisits-a.totalVisits).slice(0,7);
    const maxVisits = byVisits[0]?.totalVisits || 1;
    document.getElementById('top-visit-accts').innerHTML = byVisits.map(a =>
      \`<div class="bar-item">
        <div class="bar-item-header"><span class="bar-item-label" title="\${esc(a.company)}">\${esc(a.company)}</span><span class="bar-item-val">\${a.totalVisits}</span></div>
        <div class="bar-track"><div class="bar-fill" style="width:\${Math.round(a.totalVisits/maxVisits*100)}%"></div></div>
      </div>\`).join('');

    document.getElementById('dashboard-row').style.display = 'grid';
  }

  function drawDonut(segments, svgId, legendId) {
    const cx=55, cy=55, r=38, inner=24;
    const total = segments.reduce((s,x)=>s+x.val,0) || 1;
    let startAngle = -Math.PI/2;
    let paths = '';
    segments.forEach(seg => {
      const angle = (seg.val/total) * 2 * Math.PI;
      const endAngle = startAngle + angle;
      if (angle < 0.01) { startAngle = endAngle; return; }
      const x1=cx+r*Math.cos(startAngle), y1=cy+r*Math.sin(startAngle);
      const x2=cx+r*Math.cos(endAngle),   y2=cy+r*Math.sin(endAngle);
      const x3=cx+inner*Math.cos(endAngle),y3=cy+inner*Math.sin(endAngle);
      const x4=cx+inner*Math.cos(startAngle),y4=cy+inner*Math.sin(startAngle);
      const large = angle > Math.PI ? 1 : 0;
      paths += \`<path d="M\${x1},\${y1} A\${r},\${r} 0 \${large},1 \${x2},\${y2} L\${x3},\${y3} A\${inner},\${inner} 0 \${large},0 \${x4},\${y4} Z" fill="\${seg.color}"/>\`;
      startAngle = endAngle;
    });
    document.getElementById(svgId).innerHTML = paths +
      \`<text x="\${cx}" y="\${cy+5}" text-anchor="middle" fill="#f1f5f9" font-size="18" font-weight="700" font-family="system-ui">\${total}</text>\`;
    document.getElementById(legendId).innerHTML = segments.map(s =>
      \`<div class="legend-item">
        <span class="legend-label"><span class="legend-dot" style="background:\${s.color}"></span>\${s.label}</span>
        <span class="legend-val">\${s.val} <span style="color:#475569;font-weight:400">\${Math.round(s.val/total*100)}%</span></span>
      </div>\`).join('');
  }

  function getVal(a, col) {
    switch(col) {
      case 'company':       return (a.company||'').toLowerCase();
      case 'peopleCount':   return a.peopleCount || 0;
      case 'topIntentScore':return a.topIntentScore || 0;
      case 'topIntentTier': return ['hot','warm','cold'].indexOf(a.topIntentTier||'cold');
      case 'totalVisits':   return a.totalVisits || 0;
      case 'totalAdClicks': return a.totalAdClicks || 0;
      case 'lastSeenAt':    return a.lastSeenAt || '';
      default:              return '';
    }
  }

  function renderTable() {
    const q = (document.getElementById('search').value || '').toLowerCase();
    let list = allAccounts.slice();
    if (activeTier) list = list.filter(a => a.topIntentTier === activeTier);
    if (q) list = list.filter(a => (a.company||'').toLowerCase().includes(q) || (a.companyDomain||'').toLowerCase().includes(q));

    list.sort((a, b) => {
      const av = getVal(a, sortCol), bv = getVal(b, sortCol);
      const mul = sortDir === 'asc' ? 1 : -1;
      if (av < bv) return -1 * mul;
      if (av > bv) return  1 * mul;
      return 0;
    });

    document.getElementById('accts-label').textContent = 'Accounts (' + list.length + ')';

    // Update header arrows
    document.querySelectorAll('#accts-table thead th.sortable').forEach(th => {
      const col = th.dataset.col;
      th.classList.remove('sort-asc','sort-desc');
      const icon = th.querySelector('.sort-icon');
      if (col === sortCol) {
        th.classList.add(sortDir === 'asc' ? 'sort-asc' : 'sort-desc');
        icon.textContent = sortDir === 'asc' ? '↑' : '↓';
      } else {
        icon.textContent = '↕';
      }
    });

    const tbody = document.getElementById('accts-body');
    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:48px;color:#475569">No accounts found.</td></tr>';
      return;
    }

    tbody.innerHTML = list.map(a => {
      const tier    = a.topIntentTier || 'cold';
      const initial = (a.company||'?').charAt(0).toUpperCase();
      const sources = (a.sources||[]).map(s => '<span class="source-pill '+s+'">'+s+'</span>').join('');
      return '<tr onclick="location.href=\\'/account?company='+encodeURIComponent(a.company)+'\\'">'+
        '<td><div style="display:flex;align-items:center;gap:10px">'+
          '<div class="acct-avatar">'+esc(initial)+'</div>'+
          '<div><div class="acct-name">'+esc(a.company)+'</div>'+
          (a.companyDomain ? '<div class="acct-domain">'+esc(a.companyDomain)+'</div>' : '')+
          '</div></div></td>'+
        '<td class="cell-muted">'+a.peopleCount+'</td>'+
        '<td>'+scoreBadge(a.topIntentScore, tier)+'</td>'+
        '<td><span class="tier-badge '+tier+'">'+tier+'</span></td>'+
        '<td>'+sources+'</td>'+
        '<td class="cell-dim">'+a.totalVisits+'</td>'+
        '<td class="cell-dim">'+a.totalAdClicks+'</td>'+
        '<td class="cell-dim">'+relativeTime(a.lastSeenAt)+'</td>'+
        '</tr>';
    }).join('');
  }

  function debounceRender() { clearTimeout(searchTimer); searchTimer = setTimeout(renderTable, 200); }

  // Sort header clicks
  document.querySelectorAll('#accts-table thead th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      if (sortCol === col) {
        sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        sortCol = col;
        sortDir = ['topIntentScore','peopleCount','totalVisits','totalAdClicks','lastSeenAt'].includes(col) ? 'desc' : 'asc';
      }
      renderTable();
    });
  });

  // Tier filter buttons
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeTier = btn.dataset.tier;
      renderTable();
    });
  });

  async function refresh() {
    try {
      await loadAccounts();
      document.getElementById('last-updated').textContent = 'Updated ' + new Date().toLocaleTimeString();
      document.getElementById('error-banner').style.display = 'none';
    } catch(e) {
      const b = document.getElementById('error-banner');
      b.style.display = 'block'; b.textContent = 'Failed to load: ' + e.message;
    }
  }

  refresh();
  setInterval(refresh, 30000);
</script>
`));
});

// ─── GET /account?company=...  (Account detail) ───────────────────────────────

app.get('/account', async (req, res) => {
  const store   = require('./store/contacts');
  const company = (req.query.company || '').trim();
  if (!company) return res.redirect('/accounts');

  const all      = await store.getAll();
  const contacts = all
    .filter(c => (c.company || '').trim().toLowerCase() === company.toLowerCase())
    .sort((a, b) => b.intentScore - a.intentScore);

  if (contacts.length === 0) return res.redirect('/accounts');

  const domain      = contacts.find(c => c.companyDomain)?.companyDomain || null;
  const totalVisits = contacts.reduce((s, c) => s + c.visitCount, 0);
  const totalClicks = contacts.reduce((s, c) => s + c.adClickCount, 0);
  const totalImpr   = contacts.reduce((s, c) => s + c.adImpressionCount, 0);
  const topScore    = contacts[0].intentScore;
  const topTier     = contacts[0].intentTier;
  const sources     = [...new Set(contacts.flatMap(c => c.sources))];
  const firstSeen   = contacts.map(c => c.firstSeenAt).sort()[0];
  const lastSeen    = contacts.map(c => c.lastSeenAt).sort().reverse()[0];

  const timeline = contacts.flatMap(c => {
    const name = [c.firstName, c.lastName].filter(Boolean).join(' ') || c.fullName || c.email || '—';
    return [
      ...(c.pagesVisited || []).map(p => ({ kind: 'page', person: name, label: 'Visited ' + (p.url.replace(/^https?:\/\/[^/]+/, '') || '/'), time: p.visitedAt })),
      ...(c.adEvents     || []).map(e => ({ kind: e.type, person: name, label: (e.type === 'click' ? 'Clicked' : 'Saw') + ' ad' + (e.campaignName ? ' · ' + e.campaignName : ''), time: e.occurredAt })),
    ];
  }).sort((a, b) => new Date(b.time) - new Date(a.time));

  const escStr = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/`/g,'&#96;');

  // Build top pages chart data
  const pageMap = {};
  contacts.forEach(c => (c.pagesVisited||[]).forEach(p => {
    const path = p.url.replace(/^https?:\/\/[^/]+/, '') || '/';
    pageMap[path] = (pageMap[path]||0) + 1;
  }));
  const topPages = Object.entries(pageMap).sort((a,b)=>b[1]-a[1]).slice(0,8);

  const pageBody = `
<style>
  .page { max-width:1200px; margin:0 auto; padding:0 32px 64px; }

  nav { padding:16px 0 0; display:flex; align-items:center; gap:8px; font-size:13px; color:#475569; }
  nav a { color:#6366f1; } nav a:hover { text-decoration:underline; }
  nav .sep { color:#334155; }

  .hero { padding:24px 0 28px; border-bottom:1px solid #1e293b; display:flex; align-items:flex-start; justify-content:space-between; gap:24px; }
  .hero-left { display:flex; align-items:center; gap:18px; }
  .avatar { width:56px; height:56px; border-radius:14px; background:#1e293b; border:1px solid #334155; display:flex; align-items:center; justify-content:center; font-size:22px; font-weight:700; color:#6366f1; flex-shrink:0; }
  .hero-name { font-size:26px; font-weight:800; color:#f8fafc; letter-spacing:-.5px; line-height:1.1; }
  .hero-domain { font-size:13px; color:#64748b; margin-top:4px; }
  .hero-meta { display:flex; align-items:center; gap:10px; margin-top:10px; flex-wrap:wrap; }
  .hero-dates { display:flex; flex-direction:column; align-items:flex-end; gap:6px; font-size:12px; color:#475569; }

  .stats-row { display:grid; grid-template-columns:repeat(5,1fr); gap:12px; padding:24px 0; border-bottom:1px solid #1e293b; }
  .stat { background:#1e293b; border:1px solid #334155; border-radius:12px; padding:16px 20px; }
  .stat .lbl { font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:.7px; color:#64748b; margin-bottom:6px; }
  .stat .val { font-size:30px; font-weight:700; color:#f1f5f9; line-height:1; }

  /* Dashboard row */
  .acct-dash { display:grid; grid-template-columns:1fr 1fr; gap:12px; padding:24px 0; border-bottom:1px solid #1e293b; }
  .dash-card { background:#1e293b; border:1px solid #334155; border-radius:12px; padding:16px 20px; }
  .dash-title { font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:.7px; color:#64748b; margin-bottom:14px; }

  .columns { display:grid; grid-template-columns:1fr 340px; gap:24px; padding-top:28px; }

  .section-title { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.7px; color:#475569; margin-bottom:14px; }

  /* People table on left */
  .people-table { width:100%; border-collapse:collapse; font-size:13px; }
  .people-table thead th { text-align:left; padding:8px 12px; font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:.6px; color:#475569; border-bottom:1px solid #1e293b; white-space:nowrap; user-select:none; }
  .people-table thead th.sortable { cursor:pointer; }
  .people-table thead th.sortable:hover { color:#94a3b8; }
  .people-table thead th.sort-asc, .people-table thead th.sort-desc { color:#818cf8; }
  .people-table tbody tr { border-bottom:1px solid #1e293b; transition:background .1s; cursor:pointer; }
  .people-table tbody tr:hover { background:#1e293b; }
  .people-table tbody td { padding:12px 12px; vertical-align:middle; }
  .person-name { font-weight:600; color:#f1f5f9; }
  .person-sub  { font-size:12px; color:#64748b; margin-top:2px; }

  /* Expandable rows */
  .detail-row { display:none; }
  .detail-row.open { display:table-row; }
  .detail-cell { background:#111827; padding:12px 16px 16px 16px !important; }
  .event-list { display:flex; flex-direction:column; gap:8px; }
  .event-item { display:flex; align-items:flex-start; gap:10px; }
  .dot { width:7px; height:7px; border-radius:50%; flex-shrink:0; margin-top:4px; }
  .dot.page { background:#6366f1; } .dot.click { background:#ef4444; } .dot.impression { background:#f59e0b; }
  .event-text { font-size:12px; color:#94a3b8; flex:1; }
  .event-time { font-size:11px; color:#475569; white-space:nowrap; }

  /* Timeline on right */
  .timeline { position:sticky; top:24px; }
  .timeline-inner { background:#1e293b; border:1px solid #334155; border-radius:12px; padding:18px; max-height:calc(100vh - 80px); overflow-y:auto; }
  .tl-item { display:flex; align-items:flex-start; gap:10px; padding:8px 0; border-bottom:1px solid #0f172a; }
  .tl-item:last-child { border-bottom:none; }
  .tl-body { flex:1; min-width:0; }
  .tl-label { font-size:12px; color:#cbd5e1; line-height:1.4; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .tl-person { font-size:11px; color:#64748b; margin-top:2px; }
  .tl-time { font-size:11px; color:#475569; flex-shrink:0; padding-top:2px; }

  /* bar list reuse */
  .bar-list { display:flex; flex-direction:column; gap:8px; }
  .bar-item { display:flex; flex-direction:column; gap:4px; }
  .bar-item-header { display:flex; justify-content:space-between; font-size:12px; }
  .bar-item-label { color:#94a3b8; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:220px; }
  .bar-item-val { color:#e2e8f0; font-weight:600; flex-shrink:0; margin-left:8px; }
  .bar-track { height:4px; background:#0f172a; border-radius:99px; overflow:hidden; }
  .bar-fill { height:100%; border-radius:99px; background:#6366f1; }
</style>

<div class="page">

  <nav>
    <a href="/accounts">← Accounts</a>
    <span class="sep">/</span>
    <span>${escStr(company)}</span>
  </nav>

  <div class="hero">
    <div class="hero-left">
      <div class="avatar">${escStr(company.charAt(0).toUpperCase())}</div>
      <div>
        <div class="hero-name">${escStr(company)}</div>
        ${domain ? `<div class="hero-domain">${escStr(domain)}</div>` : ''}
        <div class="hero-meta">
          <span class="tier-badge ${topTier}">${topTier}</span>
          ${sources.map(s => `<span class="source-pill ${s}">${s}</span>`).join('')}
        </div>
      </div>
    </div>
    <div class="hero-dates">
      <span>First seen <span data-iso="${firstSeen}"></span></span>
      <span>Last seen <span data-iso="${lastSeen}"></span></span>
    </div>
  </div>

  <div class="stats-row">
    <div class="stat"><div class="lbl">People</div><div class="val">${contacts.length}</div></div>
    <div class="stat"><div class="lbl">Total Visits</div><div class="val">${totalVisits}</div></div>
    <div class="stat"><div class="lbl">Ad Clicks</div><div class="val">${totalClicks}</div></div>
    <div class="stat"><div class="lbl">Impressions</div><div class="val">${totalImpr}</div></div>
    <div class="stat"><div class="lbl">Top Score</div><div class="val">${topScore}</div></div>
  </div>

  <!-- Account-level dashboard -->
  <div class="acct-dash">
    <div class="dash-card">
      <div class="dash-title">Top Pages Visited</div>
      <div class="bar-list" id="top-pages">
        ${topPages.length === 0
          ? '<div style="font-size:12px;color:#475569">No page visits recorded.</div>'
          : (() => {
              const maxP = topPages[0][1];
              return topPages.map(([path, cnt]) =>
                `<div class="bar-item">
                  <div class="bar-item-header"><span class="bar-item-label" title="${escStr(path)}">${escStr(path)}</span><span class="bar-item-val">${cnt}</span></div>
                  <div class="bar-track"><div class="bar-fill" style="width:${Math.round(cnt/maxP*100)}%"></div></div>
                </div>`
              ).join('');
            })()
        }
      </div>
    </div>
    <div class="dash-card">
      <div class="dash-title">People by Score</div>
      <div class="bar-list">
        ${(() => {
            const maxS = contacts[0]?.intentScore || 1;
            return contacts.slice(0,8).map(c => {
              const name = [c.firstName, c.lastName].filter(Boolean).join(' ') || c.fullName || c.email || '—';
              const tier = c.intentTier || 'cold';
              const barColor = tier === 'hot' ? '#ef4444' : tier === 'warm' ? '#f59e0b' : '#3b82f6';
              return `<div class="bar-item">
                <div class="bar-item-header"><span class="bar-item-label" title="${escStr(name)}">${escStr(name)}</span><span class="bar-item-val" style="color:${barColor}">${c.intentScore}</span></div>
                <div class="bar-track"><div class="bar-fill" style="width:${Math.round(c.intentScore/maxS*100)}%;background:${barColor}"></div></div>
              </div>`;
            }).join('');
          })()
        }
      </div>
    </div>
  </div>

  <div class="columns">

    <div>
      <div class="section-title">People (${contacts.length}) — click to expand</div>
      <table class="people-table" id="people-table">
        <thead>
          <tr>
            <th class="sortable sort-desc" data-col="intentScore">Score <span class="sort-icon">↓</span></th>
            <th class="sortable" data-col="name">Person <span class="sort-icon">↕</span></th>
            <th class="sortable" data-col="jobTitle">Title <span class="sort-icon">↕</span></th>
            <th class="sortable" data-col="visitCount">Visits <span class="sort-icon">↕</span></th>
            <th class="sortable" data-col="lastSeenAt">Last Seen <span class="sort-icon">↕</span></th>
          </tr>
        </thead>
        <tbody id="people-body">
          ${contacts.map((c, i) => {
            const name   = [c.firstName, c.lastName].filter(Boolean).join(' ') || c.fullName || '—';
            const tier   = c.intentTier || 'cold';
            const events = [
              ...(c.pagesVisited || []).map(p => ({ kind: 'page',   label: 'Visited ' + (p.url.replace(/^https?:\/\/[^/]+/, '')||'/'), time: p.visitedAt })),
              ...(c.adEvents     || []).map(e => ({ kind: e.type,   label: (e.type==='click'?'Clicked':'Saw')+' ad'+(e.campaignName?' · '+e.campaignName:''), time: e.occurredAt })),
            ].sort((a, b) => new Date(b.time) - new Date(a.time));

            return `<tr onclick="toggleDetail(${i})">
              <td>
                <div class="score-wrap">
                  <div class="score-bar-bg"><div class="score-bar ${tier}" style="width:${c.intentScore}%"></div></div>
                  <span class="score-num ${tier}">${c.intentScore}</span>
                </div>
              </td>
              <td>
                <div class="person-name">${escStr(name)}</div>
                ${c.email ? `<div class="person-sub">${escStr(c.email)}</div>` : ''}
              </td>
              <td style="font-size:12px;color:#94a3b8">${escStr(c.jobTitle||'—')}</td>
              <td style="font-size:12px;color:#64748b">${c.visitCount||0}</td>
              <td style="font-size:12px;color:#64748b" data-iso="${c.lastSeenAt||''}"></td>
            </tr>
            <tr class="detail-row" id="detail-${i}">
              <td class="detail-cell" colspan="5">
                ${events.length === 0
                  ? '<span style="font-size:12px;color:#475569">No engagement recorded.</span>'
                  : `<div class="event-list">${events.map(ev => `
                    <div class="event-item">
                      <div class="dot ${ev.kind}"></div>
                      <div class="event-text">${escStr(ev.label)}</div>
                      <div class="event-time" data-iso="${ev.time||''}"></div>
                    </div>`).join('')}</div>`
                }
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>

    <div class="timeline">
      <div class="section-title">All Engagement</div>
      <div class="timeline-inner">
        ${timeline.length === 0
          ? '<div style="font-size:12px;color:#475569;padding:8px 0">No engagement recorded yet.</div>'
          : timeline.map(ev => `
            <div class="tl-item">
              <div class="dot ${ev.kind}" style="margin-top:5px"></div>
              <div class="tl-body">
                <div class="tl-label">${escStr(ev.label)}</div>
                <div class="tl-person">${escStr(ev.person)}</div>
              </div>
              <div class="tl-time" data-iso="${ev.time||''}"></div>
            </div>`).join('')
        }
      </div>
    </div>

  </div>
</div>

<script>
  document.querySelectorAll('[data-iso]').forEach(el => {
    el.textContent = relativeTime(el.dataset.iso);
  });
  document.getElementById('last-updated').textContent = 'Loaded ' + new Date().toLocaleTimeString();

  function toggleDetail(i) {
    const row = document.getElementById('detail-' + i);
    row.classList.toggle('open');
  }

  // Sortable people table on account detail
  let peopleSortCol = 'intentScore', peopleSortDir = 'desc';
  const rawContacts = ${JSON.stringify(contacts.map(c => ({
    id: c.id,
    firstName: c.firstName, lastName: c.lastName, fullName: c.fullName,
    email: c.email, jobTitle: c.jobTitle,
    intentScore: c.intentScore, intentTier: c.intentTier,
    visitCount: c.visitCount, lastSeenAt: c.lastSeenAt,
    pagesVisited: c.pagesVisited, adEvents: c.adEvents,
  })))};

  document.querySelectorAll('#people-table thead th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      if (peopleSortCol === col) {
        peopleSortDir = peopleSortDir === 'asc' ? 'desc' : 'asc';
      } else {
        peopleSortCol = col;
        peopleSortDir = ['intentScore','visitCount','lastSeenAt'].includes(col) ? 'desc' : 'asc';
      }
      sortPeopleTable();
    });
  });

  function getPeopleVal(c, col) {
    switch(col) {
      case 'name':        return ((c.firstName||'') + ' ' + (c.lastName||'')).trim().toLowerCase();
      case 'jobTitle':    return (c.jobTitle||'').toLowerCase();
      case 'intentScore': return c.intentScore || 0;
      case 'visitCount':  return c.visitCount || 0;
      case 'lastSeenAt':  return c.lastSeenAt || '';
      default:            return '';
    }
  }

  function sortPeopleTable() {
    const sorted = rawContacts.slice().sort((a, b) => {
      const av = getPeopleVal(a, peopleSortCol), bv = getPeopleVal(b, peopleSortCol);
      const mul = peopleSortDir === 'asc' ? 1 : -1;
      if (av < bv) return -1 * mul;
      if (av > bv) return  1 * mul;
      return 0;
    });

    document.querySelectorAll('#people-table thead th.sortable').forEach(th => {
      th.classList.remove('sort-asc','sort-desc');
      const icon = th.querySelector('.sort-icon');
      if (th.dataset.col === peopleSortCol) {
        th.classList.add(peopleSortDir === 'asc' ? 'sort-asc' : 'sort-desc');
        icon.textContent = peopleSortDir === 'asc' ? '↑' : '↓';
      } else {
        icon.textContent = '↕';
      }
    });

    const tbody = document.getElementById('people-body');
    tbody.innerHTML = sorted.map((c, i) => {
      const name   = [c.firstName, c.lastName].filter(Boolean).join(' ') || c.fullName || '—';
      const tier   = c.intentTier || 'cold';
      const events = [
        ...(c.pagesVisited || []).map(p => ({ kind: 'page',  label: 'Visited ' + (p.url.replace(/^https?:\\/\\/[^\\/]+/, '')||'/'), time: p.visitedAt })),
        ...(c.adEvents     || []).map(e => ({ kind: e.type,  label: (e.type==='click'?'Clicked':'Saw')+' ad'+(e.campaignName?' · '+e.campaignName:''), time: e.occurredAt })),
      ].sort((a, b) => new Date(b.time) - new Date(a.time));

      return '<tr onclick="toggleDetail2(' + i + ')">' +
        '<td><div class="score-wrap"><div class="score-bar-bg"><div class="score-bar ' + tier + '" style="width:' + c.intentScore + '%"></div></div><span class="score-num ' + tier + '">' + c.intentScore + '</span></div></td>' +
        '<td><div class="person-name">' + esc(name) + '</div>' + (c.email ? '<div class="person-sub">' + esc(c.email) + '</div>' : '') + '</td>' +
        '<td style="font-size:12px;color:#94a3b8">' + esc(c.jobTitle||'—') + '</td>' +
        '<td style="font-size:12px;color:#64748b">' + (c.visitCount||0) + '</td>' +
        '<td style="font-size:12px;color:#64748b">' + relativeTime(c.lastSeenAt) + '</td>' +
        '</tr>' +
        '<tr class="detail-row" id="detail2-' + i + '">' +
        '<td class="detail-cell" colspan="5">' +
        (events.length === 0
          ? '<span style="font-size:12px;color:#475569">No engagement recorded.</span>'
          : '<div class="event-list">' + events.map(ev =>
              '<div class="event-item"><div class="dot ' + ev.kind + '"></div><div class="event-text">' + esc(ev.label) + '</div><div class="event-time">' + relativeTime(ev.time) + '</div></div>'
            ).join('') + '</div>'
        ) +
        '</td></tr>';
    }).join('');
  }

  function toggleDetail2(i) {
    const row = document.getElementById('detail2-' + i);
    if (row) row.classList.toggle('open');
  }
</script>
`;

  res.send(shell(`${company}`, 'accounts', pageBody));
});

// ─── Admin  GET /admin ────────────────────────────────────────────────────────

app.get('/admin', (req, res) => {
  const host   = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
  const proto  = req.headers['x-forwarded-proto'] || 'http';
  const baseUrl = `${proto}://${host}`;

  res.send(shell('Admin', '', `
<style>
  .page { max-width:860px; margin:0 auto; padding:0 32px 64px; }
  nav { padding:20px 0 0; display:flex; align-items:center; gap:8px; font-size:13px; color:#475569; }
  nav a { color:#6366f1; } nav a:hover { text-decoration:underline; }
  nav .sep { color:#334155; }
  .page-title { font-size:22px; font-weight:800; color:#f8fafc; letter-spacing:-.4px; margin:24px 0 4px; }
  .page-sub   { font-size:13px; color:#64748b; margin-bottom:28px; }
  .tabs { display:flex; gap:4px; border-bottom:1px solid #1e293b; margin-bottom:28px; }
  .tab-btn { background:none; border:none; padding:8px 16px; font-size:13px; font-weight:500; color:#64748b; cursor:pointer; border-bottom:2px solid transparent; margin-bottom:-1px; transition:color .15s; font-family:inherit; }
  .tab-btn:hover { color:#94a3b8; }
  .tab-btn.active { color:#f1f5f9; border-bottom-color:#6366f1; font-weight:600; }
  .tab-panel { display:none; } .tab-panel.active { display:block; }
  .card { background:#1e293b; border:1px solid #334155; border-radius:14px; padding:22px 24px; margin-bottom:16px; }
  .card-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:16px; }
  .card-title { font-size:15px; font-weight:700; color:#f1f5f9; display:flex; align-items:center; gap:10px; }
  .card-logo { width:32px; height:32px; border-radius:8px; display:flex; align-items:center; justify-content:center; font-size:15px; font-weight:800; flex-shrink:0; }
  .logo-rb2b   { background:#1e1b4b; color:#a5b4fc; border:1px solid #312e81; }
  .logo-vector { background:#0d2d1a; color:#6ee7b7; border:1px solid #064e3b; }
  .logo-system { background:#1e293b; color:#94a3b8; border:1px solid #334155; }
  .status-dot { width:8px; height:8px; border-radius:50%; display:inline-block; margin-right:6px; }
  .status-dot.ready { background:#22c55e; box-shadow:0 0 6px #22c55e88; }
  .status-badge { font-size:11px; font-weight:600; padding:3px 10px; border-radius:99px; }
  .status-badge.ready { background:#052e16; color:#4ade80; border:1px solid #14532d; }
  .card-desc { font-size:13px; color:#94a3b8; line-height:1.6; margin-bottom:18px; }
  .url-field { display:flex; align-items:center; gap:8px; }
  .url-box { flex:1; background:#0f172a; border:1px solid #334155; border-radius:8px; padding:9px 14px; font-size:12px; font-family:'SF Mono','Fira Code',monospace; color:#e2e8f0; overflow-x:auto; white-space:nowrap; }
  .copy-btn { flex-shrink:0; background:#334155; border:1px solid #475569; border-radius:8px; color:#e2e8f0; font-size:12px; padding:8px 14px; cursor:pointer; font-family:inherit; transition:all .15s; }
  .copy-btn:hover { background:#475569; } .copy-btn.copied { background:#052e16; border-color:#14532d; color:#4ade80; }
  .steps { list-style:none; counter-reset:step-counter; display:flex; flex-direction:column; gap:10px; margin-top:18px; padding-top:18px; border-top:1px solid #334155; }
  .steps li { counter-increment:step-counter; display:flex; align-items:flex-start; gap:12px; font-size:13px; color:#94a3b8; line-height:1.5; }
  .steps li::before { content:counter(step-counter); min-width:22px; height:22px; border-radius:50%; background:#334155; color:#94a3b8; font-size:11px; font-weight:700; display:flex; align-items:center; justify-content:center; flex-shrink:0; margin-top:1px; }
  .steps a { color:#818cf8; } .steps a:hover { text-decoration:underline; }
  .test-btn { margin-top:18px; padding-top:18px; border-top:1px solid #334155; display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
  .btn { border:none; border-radius:8px; font-size:13px; font-weight:600; padding:8px 18px; cursor:pointer; font-family:inherit; transition:all .15s; }
  .btn-primary  { background:#6366f1; color:#fff; } .btn-primary:hover  { background:#4f46e5; }
  .btn-secondary { background:#1e293b; border:1px solid #334155; color:#94a3b8; } .btn-secondary:hover { border-color:#475569; color:#f1f5f9; }
  .test-result { font-size:12px; font-family:monospace; color:#64748b; }
  .test-result.ok { color:#4ade80; } .test-result.err { color:#f87171; }
  .settings-table { width:100%; border-collapse:collapse; font-size:13px; }
  .settings-table th { text-align:left; font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:.6px; color:#475569; padding:8px 12px; border-bottom:1px solid #334155; }
  .settings-table td { padding:10px 12px; color:#94a3b8; border-bottom:1px solid #1e293b; vertical-align:middle; }
  .settings-table tr:last-child td { border-bottom:none; }
  .settings-table td:first-child { color:#cbd5e1; font-weight:500; }
  .pill { display:inline-block; font-size:11px; font-weight:600; padding:2px 8px; border-radius:4px; background:#0f172a; border:1px solid #334155; color:#94a3b8; }
  .info-row { display:flex; align-items:center; justify-content:space-between; padding:10px 0; border-bottom:1px solid #1e293b; font-size:13px; }
  .info-row:last-child { border-bottom:none; }
  .info-key { color:#64748b; } .info-val { color:#e2e8f0; font-family:monospace; font-size:12px; }
  .info-val a { color:#818cf8; } .info-val a:hover { text-decoration:underline; }
</style>
<div class="page">
  <nav>
    <a href="/">← Visitor Intelligence</a>
    <span class="sep">/</span>
    <span>Admin</span>
  </nav>
  <div class="page-title">Admin</div>
  <div class="page-sub">Configure integrations, webhooks, and system settings.</div>
  <div class="tabs">
    <button class="tab-btn active" data-tab="integrations">Integrations</button>
    <button class="tab-btn" data-tab="scoring">Intent Scoring</button>
    <button class="tab-btn" data-tab="system">System</button>
  </div>

  <div class="tab-panel active" id="tab-integrations">
    <div class="card">
      <div class="card-header">
        <div class="card-title"><div class="card-logo logo-rb2b">R</div>RB2B — Visitor Identification</div>
        <span class="status-badge ready"><span class="status-dot ready"></span>Ready</span>
      </div>
      <div class="card-desc">RB2B de-anonymizes website visitors. Paste the webhook URL below into your RB2B dashboard under <strong style="color:#e2e8f0">Integrations → Webhook</strong>.</div>
      <div class="url-field">
        <div class="url-box" id="rb2b-url">${baseUrl}/webhooks/rb2b</div>
        <button class="copy-btn" onclick="copyUrl('rb2b-url',this)">Copy</button>
      </div>
      <ol class="steps">
        <li>Go to <a href="https://app.rb2b.com/integrations/webhook" target="_blank">app.rb2b.com → Integrations → Webhook</a></li>
        <li>Paste the URL above and click <strong style="color:#e2e8f0">Save</strong></li>
        <li>Optionally enable <strong style="color:#e2e8f0">Send repeat visitor data</strong></li>
      </ol>
      <div class="test-btn">
        <button class="btn btn-primary" onclick="sendTest('rb2b')">Send test event</button>
        <span class="test-result" id="test-rb2b"></span>
      </div>
    </div>
    <div class="card">
      <div class="card-header">
        <div class="card-title"><div class="card-logo logo-vector">V</div>Vector — Ad Engagement</div>
        <span class="status-badge ready"><span class="status-dot ready"></span>Ready</span>
      </div>
      <div class="card-desc">Vector tracks LinkedIn ad clicks and impressions tied back to individual contacts.</div>
      <div class="url-field">
        <div class="url-box" id="vector-url">${baseUrl}/webhooks/vector</div>
        <button class="copy-btn" onclick="copyUrl('vector-url',this)">Copy</button>
      </div>
      <ol class="steps">
        <li>In Vector, navigate to <strong style="color:#e2e8f0">Settings → Webhooks</strong></li>
        <li>Add a new endpoint with the URL above</li>
        <li>Select event types: <strong style="color:#e2e8f0">ad_click</strong> and <strong style="color:#e2e8f0">ad_impression</strong></li>
      </ol>
      <div class="test-btn">
        <button class="btn btn-primary" onclick="sendTest('vector')">Send test event</button>
        <span class="test-result" id="test-vector"></span>
      </div>
    </div>
  </div>

  <div class="tab-panel" id="tab-scoring">
    <div class="card">
      <div class="card-header"><div class="card-title"><div class="card-logo logo-system">📄</div>Page Signal</div><span class="pill">max 40 pts</span></div>
      <table class="settings-table"><thead><tr><th>URL contains</th><th>Points</th></tr></thead><tbody>
        <tr><td>/pricing</td><td>40</td></tr><tr><td>/demo, /book-a-demo</td><td>40</td></tr>
        <tr><td>/contact</td><td>35</td></tr><tr><td>/case-studies, /customers</td><td>25</td></tr>
        <tr><td>/features, /product, /solutions</td><td>20</td></tr><tr><td>/about</td><td>10</td></tr>
        <tr><td>/blog/</td><td>8</td></tr><tr><td>Any other page</td><td>5</td></tr>
      </tbody></table>
    </div>
    <div class="card">
      <div class="card-header"><div class="card-title"><div class="card-logo logo-system">🔁</div>Visit Frequency</div><span class="pill">max 20 pts</span></div>
      <table class="settings-table"><thead><tr><th>Visits</th><th>Points</th></tr></thead><tbody>
        <tr><td>1</td><td>5</td></tr><tr><td>2–3</td><td>10</td></tr><tr><td>4–6</td><td>15</td></tr><tr><td>7+</td><td>20</td></tr>
      </tbody></table>
    </div>
    <div class="card">
      <div class="card-header"><div class="card-title"><div class="card-logo logo-system">📣</div>Ad Engagement</div><span class="pill">max 25 pts</span></div>
      <table class="settings-table"><thead><tr><th>Signal</th><th>Points</th></tr></thead><tbody>
        <tr><td>Per ad click (up to 3)</td><td>8 each</td></tr><tr><td>Any impression</td><td>1</td></tr>
      </tbody></table>
    </div>
    <div class="card">
      <div class="card-header"><div class="card-title"><div class="card-logo logo-system">👤</div>Job Title</div><span class="pill">max 15 pts</span></div>
      <table class="settings-table"><thead><tr><th>Title contains</th><th>Points</th></tr></thead><tbody>
        <tr><td>CEO, Founder, Owner, President</td><td>15</td></tr><tr><td>CTO, CMO, CFO, COO, CPO</td><td>14</td></tr>
        <tr><td>VP, Vice President</td><td>13</td></tr><tr><td>Director</td><td>11</td></tr>
        <tr><td>Head of, Lead</td><td>9</td></tr><tr><td>Manager</td><td>6</td></tr>
        <tr><td>Engineer, Developer, Designer</td><td>3</td></tr>
      </tbody></table>
    </div>
    <div class="card">
      <div class="card-header"><div class="card-title"><div class="card-logo logo-system">🎯</div>Score Tiers</div></div>
      <table class="settings-table"><thead><tr><th>Range</th><th>Tier</th></tr></thead><tbody>
        <tr><td>60–100</td><td><span class="tier-badge hot">hot</span></td></tr>
        <tr><td>30–59</td><td><span class="tier-badge warm">warm</span></td></tr>
        <tr><td>0–29</td><td><span class="tier-badge cold">cold</span></td></tr>
      </tbody></table>
    </div>
  </div>

  <div class="tab-panel" id="tab-system">
    <div class="card">
      <div class="card-header"><div class="card-title"><div class="card-logo logo-system">🚀</div>Deployment</div></div>
      <div class="info-row"><span class="info-key">Live URL</span><span class="info-val"><a href="${baseUrl}" target="_blank">${baseUrl}</a></span></div>
      <div class="info-row"><span class="info-key">GitHub</span><span class="info-val"><a href="https://github.com/bdlc-tx/visitor-intelligence" target="_blank">github.com/bdlc-tx/visitor-intelligence</a></span></div>
      <div class="info-row"><span class="info-key">Runtime</span><span class="info-val">Node.js ${process.version} · Express</span></div>
      <div class="info-row"><span class="info-key">Storage</span><span class="info-val">Upstash Redis (persistent)</span></div>
    </div>
    <div class="card">
      <div class="card-header"><div class="card-title"><div class="card-logo logo-system">🔗</div>Endpoints</div></div>
      <table class="settings-table"><thead><tr><th>Method</th><th>Path</th><th>Description</th></tr></thead><tbody>
        <tr><td><span class="pill">POST</span></td><td>/webhooks/rb2b</td><td>RB2B visitor identification</td></tr>
        <tr><td><span class="pill">POST</span></td><td>/webhooks/vector</td><td>Vector ad engagement</td></tr>
        <tr><td><span class="pill">GET</span></td><td>/api/contacts</td><td>Paginated contact list</td></tr>
        <tr><td><span class="pill">GET</span></td><td>/api/stats</td><td>Aggregate dashboard stats</td></tr>
        <tr><td><span class="pill">GET</span></td><td>/api/accounts</td><td>Account-level aggregates</td></tr>
        <tr><td><span class="pill">GET</span></td><td>/accounts</td><td>Accounts list page</td></tr>
        <tr><td><span class="pill">GET</span></td><td>/account</td><td>Account profile page</td></tr>
        <tr><td><span class="pill">GET</span></td><td>/admin</td><td>This page</td></tr>
      </tbody></table>
    </div>
    <div class="card">
      <div class="card-header"><div class="card-title"><div class="card-logo logo-system">⚕</div>Health</div></div>
      <div class="test-btn" style="margin-top:0;padding-top:0;border:none">
        <button class="btn btn-secondary" onclick="checkHealth()">Check health</button>
        <span class="test-result" id="test-health"></span>
      </div>
    </div>
  </div>
</div>

<script>
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    });
  });
  function copyUrl(id, btn) {
    navigator.clipboard.writeText(document.getElementById(id).textContent.trim()).then(() => {
      btn.textContent = 'Copied!'; btn.classList.add('copied');
      setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 2000);
    });
  }
  async function sendTest(source) {
    const el = document.getElementById('test-' + source);
    el.className = 'test-result'; el.textContent = 'Sending…';
    try {
      const body = source === 'rb2b'
        ? { 'LinkedIn URL':'https://linkedin.com/in/test','First Name':'Test','Last Name':'User','Title':'VP Engineering','Company Name':'Test Co','Business Email':'test@testco.com','Captured URL':window.location.origin+'/pricing','Seen At':new Date().toISOString() }
        : { event:'ad_click', person:{email:'test@testco.com'}, campaign:{id:'test',name:'Test',adId:'ad1'}, engagement:{type:'click',occurredAt:new Date().toISOString()} };
      const url = source === 'rb2b' ? '/webhooks/rb2b' : '/webhooks/vector';
      const r = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
      const d = await r.json();
      el.className = 'test-result ' + (r.ok ? 'ok' : 'err');
      el.textContent = r.ok ? '✓ score '+d.intentScore+' ('+d.intentTier+') · '+(d.isNewContact?'new':'merged') : '✗ '+(d.error||r.status);
    } catch(e) { el.className='test-result err'; el.textContent='✗ '+e.message; }
  }
  async function checkHealth() {
    const el = document.getElementById('test-health');
    el.className = 'test-result'; el.textContent = 'Checking…';
    try {
      const s = await fetch('/api/stats').then(r => r.json());
      el.className = 'test-result ok';
      el.textContent = '✓ Healthy · ' + s.totalContacts + ' contacts';
    } catch(e) { el.className='test-result err'; el.textContent='✗ '+e.message; }
  }
</script>
`));
});

// Routes
app.use('/webhooks', webhookRoutes);
app.use('/api', apiRoutes);

app.use((req, res) => res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` }));
app.use((err, req, res, _next) => { console.error('[error]', err); res.status(500).json({ error: 'Internal server error' }); });

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`visitor-intelligence running on http://localhost:${PORT}`));
}

module.exports = app;
