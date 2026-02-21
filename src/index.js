'use strict';

require('dotenv').config();

const express = require('express');
const cors = require('cors');

const webhookRoutes = require('./routes/webhooks');
const apiRoutes = require('./routes/api');

const app = express();

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
}));
app.use(express.json({ limit: '1mb' }));

// Dashboard
app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Visitor Intelligence</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f172a; color: #e2e8f0; min-height: 100vh; }
  header { padding: 24px 32px 0; display: flex; align-items: center; gap: 12px; }
  header h1 { font-size: 20px; font-weight: 700; color: #f8fafc; letter-spacing: -0.3px; }
  header span { font-size: 12px; color: #64748b; background: #1e293b; border: 1px solid #334155; padding: 2px 8px; border-radius: 99px; }
  .refresh-info { margin-left: auto; font-size: 12px; color: #475569; }

  .stats-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 12px; padding: 20px 32px; }
  .stat-card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 16px 20px; }
  .stat-card .label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.8px; color: #64748b; margin-bottom: 6px; }
  .stat-card .value { font-size: 28px; font-weight: 700; color: #f1f5f9; line-height: 1; }
  .stat-card.hot .value { color: #f87171; }
  .stat-card.warm .value { color: #fbbf24; }
  .stat-card.cold .value { color: #60a5fa; }

  .table-wrap { padding: 0 32px 32px; }
  .table-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
  .table-header h2 { font-size: 14px; font-weight: 600; color: #94a3b8; }
  .filter-row { display: flex; gap: 8px; }
  .filter-btn { font-size: 12px; padding: 4px 12px; border-radius: 99px; border: 1px solid #334155; background: transparent; color: #94a3b8; cursor: pointer; transition: all 0.15s; }
  .filter-btn:hover, .filter-btn.active { border-color: #6366f1; color: #818cf8; background: #1e1b4b; }
  .filter-btn.active { font-weight: 600; }

  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  thead th { text-align: left; padding: 10px 14px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.6px; color: #475569; border-bottom: 1px solid #1e293b; }
  tbody tr { border-bottom: 1px solid #1e293b; transition: background 0.1s; }
  tbody tr:hover { background: #1e293b; }
  tbody td { padding: 12px 14px; vertical-align: middle; }

  .contact-name { font-weight: 600; color: #f1f5f9; font-size: 13px; }
  .contact-company { font-size: 12px; color: #64748b; margin-top: 2px; }
  .contact-email { color: #94a3b8; font-size: 12px; }
  .job-title { color: #cbd5e1; }

  .score-wrap { display: flex; align-items: center; gap: 8px; min-width: 120px; }
  .score-bar-bg { flex: 1; height: 6px; background: #1e293b; border-radius: 99px; overflow: hidden; }
  .score-bar { height: 100%; border-radius: 99px; transition: width 0.4s; }
  .score-bar.hot { background: #ef4444; }
  .score-bar.warm { background: #f59e0b; }
  .score-bar.cold { background: #3b82f6; }
  .score-num { font-size: 13px; font-weight: 700; width: 28px; text-align: right; flex-shrink: 0; }
  .score-num.hot { color: #f87171; }
  .score-num.warm { color: #fbbf24; }
  .score-num.cold { color: #60a5fa; }

  .tier-badge { display: inline-block; font-size: 10px; font-weight: 700; letter-spacing: 0.8px; padding: 3px 8px; border-radius: 99px; text-transform: uppercase; }
  .tier-badge.hot { background: #450a0a; color: #f87171; border: 1px solid #7f1d1d; }
  .tier-badge.warm { background: #451a03; color: #fbbf24; border: 1px solid #78350f; }
  .tier-badge.cold { background: #0c1a3a; color: #60a5fa; border: 1px solid #1e3a5f; }

  .source-pill { display: inline-block; font-size: 10px; font-weight: 600; padding: 2px 7px; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.4px; margin-right: 4px; }
  .source-pill.rb2b { background: #1e1b4b; color: #a5b4fc; border: 1px solid #312e81; }
  .source-pill.vector { background: #0d2d1a; color: #6ee7b7; border: 1px solid #064e3b; }

  .meta { color: #64748b; font-size: 12px; }
  .meta strong { color: #94a3b8; font-weight: 600; }

  #empty-state { text-align: center; padding: 60px 0; color: #475569; }
  #empty-state p { margin-top: 8px; font-size: 13px; }

  #error-banner { display: none; margin: 0 32px 16px; padding: 12px 16px; background: #450a0a; border: 1px solid #7f1d1d; border-radius: 8px; color: #fca5a5; font-size: 13px; }

  .company-link { color: #64748b; font-size: 12px; margin-top: 2px; cursor: pointer; text-decoration: none; background: none; border: none; padding: 0; font-family: inherit; }
  .company-link:hover { color: #818cf8; text-decoration: underline; }

  /* Drawer overlay */
  #drawer-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 100; }
  #drawer-overlay.open { display: block; }

  /* Drawer panel */
  #drawer { position: fixed; top: 0; right: -520px; width: 520px; height: 100vh; background: #0f172a; border-left: 1px solid #334155; z-index: 101; overflow-y: auto; transition: right 0.25s ease; display: flex; flex-direction: column; }
  #drawer.open { right: 0; }

  #drawer-header { padding: 24px 24px 0; display: flex; align-items: flex-start; justify-content: space-between; flex-shrink: 0; }
  #drawer-title { font-size: 18px; font-weight: 700; color: #f1f5f9; }
  #drawer-domain { font-size: 12px; color: #64748b; margin-top: 3px; }
  #drawer-close { background: none; border: 1px solid #334155; border-radius: 6px; color: #94a3b8; cursor: pointer; font-size: 16px; line-height: 1; padding: 4px 8px; }
  #drawer-close:hover { border-color: #475569; color: #f1f5f9; }

  #drawer-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; padding: 20px 24px 0; flex-shrink: 0; }
  .drawer-stat { background: #1e293b; border: 1px solid #334155; border-radius: 10px; padding: 12px 14px; }
  .drawer-stat .label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.6px; color: #64748b; margin-bottom: 4px; }
  .drawer-stat .value { font-size: 22px; font-weight: 700; color: #f1f5f9; line-height: 1; }

  #drawer-body { padding: 20px 24px 32px; flex: 1; }
  #drawer-body h3 { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.6px; color: #475569; margin-bottom: 12px; }

  .person-card { background: #1e293b; border: 1px solid #334155; border-radius: 10px; padding: 14px 16px; margin-bottom: 10px; }
  .person-card-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
  .person-name { font-weight: 600; color: #f1f5f9; font-size: 13px; }
  .person-title { font-size: 12px; color: #94a3b8; margin-top: 2px; }
  .person-email { font-size: 11px; color: #64748b; margin-top: 2px; }

  .engagement-list { border-top: 1px solid #334155; padding-top: 10px; margin-top: 2px; }
  .engagement-item { display: flex; align-items: flex-start; gap: 10px; padding: 5px 0; font-size: 12px; color: #94a3b8; }
  .engagement-dot { width: 6px; height: 6px; border-radius: 50%; margin-top: 4px; flex-shrink: 0; }
  .engagement-dot.page { background: #6366f1; }
  .engagement-dot.click { background: #ef4444; }
  .engagement-dot.impression { background: #f59e0b; }
  .engagement-text { flex: 1; line-height: 1.4; }
  .engagement-time { color: #475569; font-size: 11px; flex-shrink: 0; }
</style>
</head>
<body>

<header>
  <h1>Visitor Intelligence</h1>
  <span id="last-updated">Loading…</span>
  <div class="refresh-info">Auto-refreshes every 30s</div>
</header>

<div id="error-banner"></div>

<!-- Account drawer -->
<div id="drawer-overlay"></div>
<div id="drawer">
  <div id="drawer-header">
    <div>
      <div id="drawer-title">—</div>
      <div id="drawer-domain"></div>
    </div>
    <button id="drawer-close">✕</button>
  </div>
  <div id="drawer-stats">
    <div class="drawer-stat"><div class="label">People</div><div class="value" id="da-people">—</div></div>
    <div class="drawer-stat"><div class="label">Visits</div><div class="value" id="da-visits">—</div></div>
    <div class="drawer-stat"><div class="label">Ad Clicks</div><div class="value" id="da-clicks">—</div></div>
    <div class="drawer-stat"><div class="label">Top Score</div><div class="value" id="da-score">—</div></div>
  </div>
  <div id="drawer-body">
    <h3>People &amp; Engagement</h3>
    <div id="drawer-people"></div>
  </div>
</div>

<div class="stats-grid">
  <div class="stat-card"><div class="label">Total Contacts</div><div class="value" id="s-total">—</div></div>
  <div class="stat-card hot"><div class="label">Hot</div><div class="value" id="s-hot">—</div></div>
  <div class="stat-card warm"><div class="label">Warm</div><div class="value" id="s-warm">—</div></div>
  <div class="stat-card cold"><div class="label">Cold</div><div class="value" id="s-cold">—</div></div>
  <div class="stat-card"><div class="label">Avg Score</div><div class="value" id="s-avg">—</div></div>
  <div class="stat-card"><div class="label">Ad Clicks</div><div class="value" id="s-clicks">—</div></div>
</div>

<div class="table-wrap">
  <div class="table-header">
    <h2 id="contacts-label">Contacts</h2>
    <div class="filter-row">
      <button class="filter-btn active" data-tier="">All</button>
      <button class="filter-btn" data-tier="hot">Hot</button>
      <button class="filter-btn" data-tier="warm">Warm</button>
      <button class="filter-btn" data-tier="cold">Cold</button>
    </div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Contact</th>
        <th>Email</th>
        <th>Title</th>
        <th>Intent Score</th>
        <th>Tier</th>
        <th>Sources</th>
        <th>Visits / Clicks</th>
        <th>Last Seen</th>
      </tr>
    </thead>
    <tbody id="contacts-body">
      <tr><td colspan="8" id="empty-state"><p>Loading contacts…</p></td></tr>
    </tbody>
  </table>
</div>

<script>
  let activeTier = '';

  function relativeTime(iso) {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + 'm ago';
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    return Math.floor(hrs / 24) + 'd ago';
  }

  async function loadStats() {
    const res = await fetch('/api/stats');
    const s = await res.json();
    document.getElementById('s-total').textContent = s.totalContacts;
    document.getElementById('s-hot').textContent = s.hotCount;
    document.getElementById('s-warm').textContent = s.warmCount;
    document.getElementById('s-cold').textContent = s.coldCount;
    document.getElementById('s-avg').textContent = s.avgIntentScore;
    document.getElementById('s-clicks').textContent = s.adClickTotal;
  }

  async function loadContacts() {
    const url = '/api/contacts?limit=200' + (activeTier ? '&tier=' + activeTier : '');
    const res = await fetch(url);
    const data = await res.json();
    const tbody = document.getElementById('contacts-body');
    document.getElementById('contacts-label').textContent =
      'Contacts (' + data.total + ')';

    if (!data.contacts || data.contacts.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:48px;color:#475569">No contacts yet. Send a webhook to get started.</td></tr>';
      return;
    }

    tbody.innerHTML = data.contacts.map(c => {
      const tier = c.intentTier || 'cold';
      const name = [c.firstName, c.lastName].filter(Boolean).join(' ') || c.fullName || '—';
      const sources = (c.sources || []).map(s =>
        '<span class="source-pill ' + s + '">' + s + '</span>'
      ).join('');
      return \`<tr>
        <td>
          <div class="contact-name">\${esc(name)}</div>
          \${c.company ? \`<button class="company-link" onclick="openAccount('\${esc(c.company)}')">\${esc(c.company)}</button>\` : ''}
        </td>
        <td><span class="contact-email">\${esc(c.email || '—')}</span></td>
        <td><span class="job-title">\${esc(c.jobTitle || '—')}</span></td>
        <td>
          <div class="score-wrap">
            <div class="score-bar-bg">
              <div class="score-bar \${tier}" style="width:\${c.intentScore}%"></div>
            </div>
            <span class="score-num \${tier}">\${c.intentScore}</span>
          </div>
        </td>
        <td><span class="tier-badge \${tier}">\${tier}</span></td>
        <td>\${sources}</td>
        <td><span class="meta"><strong>\${c.visitCount || 0}</strong> visits &nbsp;·&nbsp; <strong>\${c.adClickCount || 0}</strong> clicks</span></td>
        <td><span class="meta">\${relativeTime(c.lastSeenAt)}</span></td>
      </tr>\`;
    }).join('');
  }

  function esc(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  async function refresh() {
    try {
      await Promise.all([loadStats(), loadContacts()]);
      document.getElementById('last-updated').textContent =
        'Updated ' + new Date().toLocaleTimeString();
      document.getElementById('error-banner').style.display = 'none';
    } catch(e) {
      const b = document.getElementById('error-banner');
      b.style.display = 'block';
      b.textContent = 'Failed to load data: ' + e.message;
    }
  }

  // Filter buttons
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeTier = btn.dataset.tier;
      loadContacts();
    });
  });

  refresh();
  setInterval(refresh, 30000);

  // --- Account drawer ---
  let accountsCache = [];

  async function fetchAccounts() {
    const res = await fetch('/api/accounts');
    const data = await res.json();
    accountsCache = data.accounts || [];
  }
  fetchAccounts();

  function openAccount(company) {
    const acc = accountsCache.find(a => a.company === company);
    if (!acc) { fetchAccounts().then(() => openAccount(company)); return; }

    document.getElementById('drawer-title').textContent = acc.company;
    document.getElementById('drawer-domain').textContent = acc.companyDomain || '';
    document.getElementById('da-people').textContent = acc.peopleCount;
    document.getElementById('da-visits').textContent = acc.totalVisits;
    document.getElementById('da-clicks').textContent = acc.totalAdClicks;
    document.getElementById('da-score').textContent = acc.topIntentScore;

    const peopleEl = document.getElementById('drawer-people');
    peopleEl.innerHTML = (acc.contacts || [])
      .sort((a, b) => b.intentScore - a.intentScore)
      .map(c => {
        const name = [c.firstName, c.lastName].filter(Boolean).join(' ') || c.fullName || '—';
        const tier = c.intentTier || 'cold';

        // Build engagement timeline — pages + ad events, sorted by time
        const events = [
          ...(c.pagesVisited || []).map(p => ({ kind: 'page', label: 'Visited ' + p.url.replace(/^https?:\\/\\/[^\\/]+/, ''), time: p.visitedAt })),
          ...(c.adEvents || []).map(e => ({ kind: e.type, label: (e.type === 'click' ? 'Clicked' : 'Saw') + ' ad' + (e.campaignName ? ' · ' + e.campaignName : ''), time: e.occurredAt })),
        ].sort((a, b) => new Date(b.time) - new Date(a.time)).slice(0, 8);

        const eventsHtml = events.length === 0 ? '<div style="color:#475569;font-size:12px;padding-top:8px">No engagement recorded</div>' :
          '<div class="engagement-list">' + events.map(ev =>
            \`<div class="engagement-item">
              <div class="engagement-dot \${ev.kind}"></div>
              <div class="engagement-text">\${esc(ev.label)}</div>
              <div class="engagement-time">\${relativeTime(ev.time)}</div>
            </div>\`
          ).join('') + '</div>';

        return \`<div class="person-card">
          <div class="person-card-top">
            <div>
              <div class="person-name">\${esc(name)}</div>
              \${c.jobTitle ? \`<div class="person-title">\${esc(c.jobTitle)}</div>\` : ''}
              \${c.email ? \`<div class="person-email">\${esc(c.email)}</div>\` : ''}
            </div>
            <span class="tier-badge \${tier}">\${tier} \${c.intentScore}</span>
          </div>
          \${eventsHtml}
        </div>\`;
      }).join('');

    document.getElementById('drawer').classList.add('open');
    document.getElementById('drawer-overlay').classList.add('open');
  }

  function closeDrawer() {
    document.getElementById('drawer').classList.remove('open');
    document.getElementById('drawer-overlay').classList.remove('open');
  }

  document.getElementById('drawer-close').addEventListener('click', closeDrawer);
  document.getElementById('drawer-overlay').addEventListener('click', closeDrawer);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); });
</script>
</body>
</html>`);
});

// Routes
app.use('/webhooks', webhookRoutes);
app.use('/api', apiRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
});

// Error handler
app.use((err, req, res, _next) => {
  console.error('[unhandled error]', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server only when run directly (not when imported by Vercel)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`visitor-intelligence running on http://localhost:${PORT}`);
  });
}

// Export app for Vercel serverless runtime
module.exports = app;
