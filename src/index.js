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

// ─── Shared HTML helpers ────────────────────────────────────────────────────

const SHARED_STYLES = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f172a; color: #e2e8f0; min-height: 100vh; }
  a { color: inherit; text-decoration: none; }

  .tier-badge { display: inline-block; font-size: 10px; font-weight: 700; letter-spacing: 0.8px; padding: 3px 8px; border-radius: 99px; text-transform: uppercase; }
  .tier-badge.hot { background: #450a0a; color: #f87171; border: 1px solid #7f1d1d; }
  .tier-badge.warm { background: #451a03; color: #fbbf24; border: 1px solid #78350f; }
  .tier-badge.cold { background: #0c1a3a; color: #60a5fa; border: 1px solid #1e3a5f; }

  .source-pill { display: inline-block; font-size: 10px; font-weight: 600; padding: 2px 7px; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.4px; margin-right: 4px; }
  .source-pill.rb2b { background: #1e1b4b; color: #a5b4fc; border: 1px solid #312e81; }
  .source-pill.vector { background: #0d2d1a; color: #6ee7b7; border: 1px solid #064e3b; }

  .score-wrap { display: flex; align-items: center; gap: 8px; min-width: 120px; }
  .score-bar-bg { flex: 1; height: 6px; background: #0f172a; border-radius: 99px; overflow: hidden; }
  .score-bar { height: 100%; border-radius: 99px; }
  .score-bar.hot { background: #ef4444; }
  .score-bar.warm { background: #f59e0b; }
  .score-bar.cold { background: #3b82f6; }
  .score-num { font-size: 13px; font-weight: 700; width: 28px; text-align: right; flex-shrink: 0; }
  .score-num.hot { color: #f87171; }
  .score-num.warm { color: #fbbf24; }
  .score-num.cold { color: #60a5fa; }

  .engagement-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; margin-top: 4px; }
  .engagement-dot.page { background: #6366f1; }
  .engagement-dot.click { background: #ef4444; }
  .engagement-dot.impression { background: #f59e0b; }
`;

const SHARED_JS = `
  function esc(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function relativeTime(iso) {
    if (!iso) return '—';
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + 'm ago';
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    return Math.floor(hrs / 24) + 'd ago';
  }
`;

// ─── Dashboard  GET / ────────────────────────────────────────────────────────

app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Visitor Intelligence</title>
<style>
  ${SHARED_STYLES}

  header { padding: 24px 32px 0; display: flex; align-items: center; gap: 12px; }
  header h1 { font-size: 20px; font-weight: 700; color: #f8fafc; letter-spacing: -0.3px; }
  header .badge { font-size: 12px; color: #64748b; background: #1e293b; border: 1px solid #334155; padding: 2px 8px; border-radius: 99px; }
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
  .company-link { font-size: 12px; color: #64748b; margin-top: 2px; display: inline-block; cursor: pointer; }
  .company-link:hover { color: #818cf8; text-decoration: underline; }
  .contact-email { color: #94a3b8; font-size: 12px; }
  .job-title { color: #cbd5e1; }
  .meta { color: #64748b; font-size: 12px; }
  .meta strong { color: #94a3b8; font-weight: 600; }

  #error-banner { display: none; margin: 0 32px 16px; padding: 12px 16px; background: #450a0a; border: 1px solid #7f1d1d; border-radius: 8px; color: #fca5a5; font-size: 13px; }
</style>
</head>
<body>

<header>
  <h1>Visitor Intelligence</h1>
  <span class="badge" id="last-updated">Loading…</span>
  <div class="refresh-info">Auto-refreshes every 30s</div>
</header>

<div id="error-banner"></div>

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
      <tr><td colspan="8" style="text-align:center;padding:48px;color:#475569">Loading…</td></tr>
    </tbody>
  </table>
</div>

<script>
  ${SHARED_JS}
  let activeTier = '';

  async function loadStats() {
    const s = await fetch('/api/stats').then(r => r.json());
    document.getElementById('s-total').textContent = s.totalContacts;
    document.getElementById('s-hot').textContent   = s.hotCount;
    document.getElementById('s-warm').textContent  = s.warmCount;
    document.getElementById('s-cold').textContent  = s.coldCount;
    document.getElementById('s-avg').textContent   = s.avgIntentScore;
    document.getElementById('s-clicks').textContent = s.adClickTotal;
  }

  async function loadContacts() {
    const url = '/api/contacts?limit=200' + (activeTier ? '&tier=' + activeTier : '');
    const data = await fetch(url).then(r => r.json());
    const tbody = document.getElementById('contacts-body');
    document.getElementById('contacts-label').textContent = 'Contacts (' + data.total + ')';

    if (!data.contacts || data.contacts.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:48px;color:#475569">No contacts yet. Send a webhook to get started.</td></tr>';
      return;
    }

    tbody.innerHTML = data.contacts.map(c => {
      const tier    = c.intentTier || 'cold';
      const name    = [c.firstName, c.lastName].filter(Boolean).join(' ') || c.fullName || '—';
      const sources = (c.sources || []).map(s => '<span class="source-pill ' + s + '">' + s + '</span>').join('');
      const companyHtml = c.company
        ? '<a class="company-link" href="/account?company=' + encodeURIComponent(c.company) + '">' + esc(c.company) + '</a>'
        : '';
      return \`<tr>
        <td>
          <div class="contact-name">\${esc(name)}</div>
          \${companyHtml}
        </td>
        <td><span class="contact-email">\${esc(c.email || '—')}</span></td>
        <td><span class="job-title">\${esc(c.jobTitle || '—')}</span></td>
        <td>
          <div class="score-wrap">
            <div class="score-bar-bg"><div class="score-bar \${tier}" style="width:\${c.intentScore}%"></div></div>
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

  async function refresh() {
    try {
      await Promise.all([loadStats(), loadContacts()]);
      document.getElementById('last-updated').textContent = 'Updated ' + new Date().toLocaleTimeString();
      document.getElementById('error-banner').style.display = 'none';
    } catch(e) {
      const b = document.getElementById('error-banner');
      b.style.display = 'block';
      b.textContent = 'Failed to load data: ' + e.message;
    }
  }

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
</script>
</body>
</html>`);
});

// ─── Account Profile  GET /account?company=... ───────────────────────────────

app.get('/account', (req, res) => {
  const store = require('./store/contacts');
  const company = (req.query.company || '').trim();
  if (!company) return res.redirect('/');

  const all = store.getAll();
  const contacts = all
    .filter(c => (c.company || '').trim().toLowerCase() === company.toLowerCase())
    .sort((a, b) => b.intentScore - a.intentScore);

  if (contacts.length === 0) return res.redirect('/');

  const domain        = contacts.find(c => c.companyDomain)?.companyDomain || null;
  const totalVisits   = contacts.reduce((s, c) => s + c.visitCount, 0);
  const totalClicks   = contacts.reduce((s, c) => s + c.adClickCount, 0);
  const totalImpr     = contacts.reduce((s, c) => s + c.adImpressionCount, 0);
  const topScore      = contacts[0].intentScore;
  const topTier       = contacts[0].intentTier;
  const sources       = [...new Set(contacts.flatMap(c => c.sources))];
  const firstSeen     = contacts.map(c => c.firstSeenAt).sort()[0];
  const lastSeen      = contacts.map(c => c.lastSeenAt).sort().reverse()[0];

  // Build a unified chronological engagement timeline across all people
  const timeline = contacts.flatMap(c => {
    const name = [c.firstName, c.lastName].filter(Boolean).join(' ') || c.fullName || c.email || '—';
    return [
      ...(c.pagesVisited || []).map(p => ({
        kind: 'page',
        person: name,
        label: 'Visited ' + p.url.replace(/^https?:\/\/[^/]+/, ''),
        time: p.visitedAt,
      })),
      ...(c.adEvents || []).map(e => ({
        kind: e.type,
        person: name,
        label: (e.type === 'click' ? 'Clicked' : 'Saw') + ' ad' + (e.campaignName ? ' · ' + e.campaignName : ''),
        time: e.occurredAt,
      })),
    ];
  }).sort((a, b) => new Date(b.time) - new Date(a.time));

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${company} — Visitor Intelligence</title>
<style>
  ${SHARED_STYLES}

  /* Layout */
  .page { max-width: 1100px; margin: 0 auto; padding: 0 32px 64px; }

  /* Top nav */
  nav { padding: 20px 0 0; display: flex; align-items: center; gap: 8px; font-size: 13px; color: #475569; }
  nav a { color: #6366f1; }
  nav a:hover { text-decoration: underline; }
  nav .sep { color: #334155; }

  /* Account hero */
  .hero { padding: 28px 0 32px; border-bottom: 1px solid #1e293b; display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; }
  .hero-left { display: flex; align-items: center; gap: 18px; }
  .avatar { width: 56px; height: 56px; border-radius: 12px; background: #1e293b; border: 1px solid #334155; display: flex; align-items: center; justify-content: center; font-size: 22px; font-weight: 700; color: #6366f1; flex-shrink: 0; }
  .hero-name { font-size: 26px; font-weight: 800; color: #f8fafc; letter-spacing: -0.5px; line-height: 1.1; }
  .hero-domain { font-size: 13px; color: #64748b; margin-top: 4px; }
  .hero-meta { display: flex; align-items: center; gap: 10px; margin-top: 10px; flex-wrap: wrap; }
  .hero-right { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
  .first-seen { font-size: 12px; color: #475569; }

  /* Stats row */
  .stats-row { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; padding: 28px 0; border-bottom: 1px solid #1e293b; }
  .stat { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 16px 20px; }
  .stat .lbl { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.7px; color: #64748b; margin-bottom: 6px; }
  .stat .val { font-size: 30px; font-weight: 700; color: #f1f5f9; line-height: 1; }

  /* Two-column layout */
  .columns { display: grid; grid-template-columns: 1fr 380px; gap: 24px; padding-top: 28px; }

  /* People */
  .section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.7px; color: #475569; margin-bottom: 14px; }

  .person-card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 16px 18px; margin-bottom: 12px; }
  .person-top { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 12px; }
  .person-name { font-size: 14px; font-weight: 700; color: #f1f5f9; }
  .person-sub  { font-size: 12px; color: #94a3b8; margin-top: 2px; }
  .person-email { font-size: 11px; color: #64748b; margin-top: 2px; }
  .person-score-row { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }

  .person-events { border-top: 1px solid #334155; padding-top: 12px; display: flex; flex-direction: column; gap: 8px; }
  .event-row { display: flex; align-items: flex-start; gap: 10px; }
  .event-text { flex: 1; font-size: 12px; color: #94a3b8; line-height: 1.4; }
  .event-time { font-size: 11px; color: #475569; flex-shrink: 0; padding-top: 1px; }

  /* Timeline */
  .timeline { position: sticky; top: 24px; }
  .timeline-inner { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 18px; max-height: calc(100vh - 80px); overflow-y: auto; }
  .tl-item { display: flex; align-items: flex-start; gap: 10px; padding: 8px 0; border-bottom: 1px solid #0f172a; }
  .tl-item:last-child { border-bottom: none; }
  .tl-body { flex: 1; min-width: 0; }
  .tl-label { font-size: 12px; color: #cbd5e1; line-height: 1.4; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tl-person { font-size: 11px; color: #64748b; margin-top: 2px; }
  .tl-time { font-size: 11px; color: #475569; flex-shrink: 0; padding-top: 2px; }
</style>
</head>
<body>
<div class="page">

  <nav>
    <a href="/">← Visitor Intelligence</a>
    <span class="sep">/</span>
    <span>${company}</span>
  </nav>

  <div class="hero">
    <div class="hero-left">
      <div class="avatar">${company.charAt(0).toUpperCase()}</div>
      <div>
        <div class="hero-name">${company}</div>
        ${domain ? `<div class="hero-domain">${domain}</div>` : ''}
        <div class="hero-meta">
          <span class="tier-badge ${topTier}">${topTier}</span>
          ${sources.map(s => `<span class="source-pill ${s}">${s}</span>`).join('')}
        </div>
      </div>
    </div>
    <div class="hero-right">
      <div class="first-seen" id="first-seen-label"></div>
      <div class="first-seen" id="last-seen-label"></div>
    </div>
  </div>

  <div class="stats-row">
    <div class="stat"><div class="lbl">People</div><div class="val">${contacts.length}</div></div>
    <div class="stat"><div class="lbl">Total Visits</div><div class="val">${totalVisits}</div></div>
    <div class="stat"><div class="lbl">Ad Clicks</div><div class="val">${totalClicks}</div></div>
    <div class="stat"><div class="lbl">Impressions</div><div class="val">${totalImpr}</div></div>
    <div class="stat"><div class="lbl">Top Score</div><div class="val">${topScore}</div></div>
  </div>

  <div class="columns">

    <!-- Left: People -->
    <div>
      <div class="section-title">People (${contacts.length})</div>
      ${contacts.map(c => {
        const name   = [c.firstName, c.lastName].filter(Boolean).join(' ') || c.fullName || '—';
        const tier   = c.intentTier || 'cold';
        const events = [
          ...(c.pagesVisited || []).map(p => ({ kind: 'page',    label: 'Visited ' + p.url.replace(/^https?:\/\/[^/]+/, ''), time: p.visitedAt })),
          ...(c.adEvents     || []).map(e => ({ kind: e.type,    label: (e.type === 'click' ? 'Clicked' : 'Saw') + ' ad' + (e.campaignName ? ' · ' + e.campaignName : ''), time: e.occurredAt })),
        ].sort((a, b) => new Date(b.time) - new Date(a.time)).slice(0, 6);

        return `<div class="person-card">
          <div class="person-top">
            <div>
              <div class="person-name">${name}</div>
              ${c.jobTitle ? `<div class="person-sub">${c.jobTitle}</div>` : ''}
              ${c.email    ? `<div class="person-email">${c.email}</div>` : ''}
            </div>
            <span class="tier-badge ${tier}">${tier}</span>
          </div>
          <div class="person-score-row">
            <div class="score-wrap" style="flex:1">
              <div class="score-bar-bg" style="flex:1"><div class="score-bar ${tier}" style="width:${c.intentScore}%"></div></div>
              <span class="score-num ${tier}">${c.intentScore}</span>
            </div>
            <div style="font-size:11px;color:#475569;flex-shrink:0">${(c.sources||[]).map(s => `<span class="source-pill ${s}">${s}</span>`).join('')}</div>
          </div>
          ${events.length === 0
            ? '<div style="font-size:12px;color:#475569">No engagement recorded</div>'
            : `<div class="person-events">${events.map(ev => `
              <div class="event-row">
                <div class="engagement-dot ${ev.kind}"></div>
                <div class="event-text">${ev.label}</div>
                <div class="event-time" data-iso="${ev.time}"></div>
              </div>`).join('')}
            </div>`
          }
        </div>`;
      }).join('')}
    </div>

    <!-- Right: Engagement timeline -->
    <div class="timeline">
      <div class="section-title">All Engagement</div>
      <div class="timeline-inner">
        ${timeline.length === 0
          ? '<div style="font-size:12px;color:#475569;padding:8px 0">No engagement recorded yet.</div>'
          : timeline.map(ev => `
            <div class="tl-item">
              <div class="engagement-dot ${ev.kind}" style="margin-top:5px"></div>
              <div class="tl-body">
                <div class="tl-label">${ev.label}</div>
                <div class="tl-person">${ev.person}</div>
              </div>
              <div class="tl-time" data-iso="${ev.time}"></div>
            </div>`).join('')
        }
      </div>
    </div>

  </div>
</div>

<script>
  ${SHARED_JS}

  // Hydrate all relative timestamps
  document.querySelectorAll('[data-iso]').forEach(el => {
    el.textContent = relativeTime(el.dataset.iso);
  });
  document.getElementById('first-seen-label').textContent = 'First seen ' + relativeTime('${firstSeen}');
  document.getElementById('last-seen-label').textContent  = 'Last seen '  + relativeTime('${lastSeen}');
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
