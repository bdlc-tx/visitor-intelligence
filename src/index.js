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
  <a href="/admin" style="margin-left:16px;font-size:12px;color:#64748b;border:1px solid #334155;padding:3px 12px;border-radius:99px;background:#1e293b;" onmouseover="this.style.color='#f1f5f9'" onmouseout="this.style.color='#64748b'">⚙ Admin</a>
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

// ─── Admin  GET /admin ───────────────────────────────────────────────────────

app.get('/admin', (req, res) => {
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
  const proto = req.headers['x-forwarded-proto'] || 'http';
  const baseUrl = `${proto}://${host}`;

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Admin — Visitor Intelligence</title>
<style>
  ${SHARED_STYLES}

  .page { max-width: 860px; margin: 0 auto; padding: 0 32px 64px; }

  nav { padding: 20px 0 0; display: flex; align-items: center; gap: 8px; font-size: 13px; color: #475569; }
  nav a { color: #6366f1; }
  nav a:hover { text-decoration: underline; }
  nav .sep { color: #334155; }

  .page-title { font-size: 22px; font-weight: 800; color: #f8fafc; letter-spacing: -0.4px; margin: 24px 0 4px; }
  .page-sub   { font-size: 13px; color: #64748b; margin-bottom: 28px; }

  /* Tabs */
  .tabs { display: flex; gap: 4px; border-bottom: 1px solid #1e293b; margin-bottom: 28px; }
  .tab-btn { background: none; border: none; padding: 8px 16px; font-size: 13px; font-weight: 500; color: #64748b; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px; transition: color 0.15s; font-family: inherit; }
  .tab-btn:hover { color: #94a3b8; }
  .tab-btn.active { color: #f1f5f9; border-bottom-color: #6366f1; font-weight: 600; }
  .tab-panel { display: none; }
  .tab-panel.active { display: block; }

  /* Cards */
  .card { background: #1e293b; border: 1px solid #334155; border-radius: 14px; padding: 22px 24px; margin-bottom: 16px; }
  .card-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
  .card-title { font-size: 15px; font-weight: 700; color: #f1f5f9; display: flex; align-items: center; gap: 10px; }
  .card-logo { width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 15px; font-weight: 800; flex-shrink: 0; }
  .logo-rb2b   { background: #1e1b4b; color: #a5b4fc; border: 1px solid #312e81; }
  .logo-vector { background: #0d2d1a; color: #6ee7b7; border: 1px solid #064e3b; }
  .logo-system { background: #1e293b; color: #94a3b8; border: 1px solid #334155; }

  .status-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; margin-right: 6px; }
  .status-dot.ready   { background: #22c55e; box-shadow: 0 0 6px #22c55e88; }
  .status-dot.waiting { background: #f59e0b; }
  .status-badge { font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 99px; }
  .status-badge.ready   { background: #052e16; color: #4ade80; border: 1px solid #14532d; }
  .status-badge.waiting { background: #451a03; color: #fbbf24; border: 1px solid #78350f; }

  .card-desc { font-size: 13px; color: #94a3b8; line-height: 1.6; margin-bottom: 18px; }

  /* Webhook URL field */
  .url-field { display: flex; align-items: center; gap: 8px; }
  .url-box { flex: 1; background: #0f172a; border: 1px solid #334155; border-radius: 8px; padding: 9px 14px; font-size: 12px; font-family: 'SF Mono', 'Fira Code', monospace; color: #e2e8f0; overflow-x: auto; white-space: nowrap; }
  .copy-btn { flex-shrink: 0; background: #334155; border: 1px solid #475569; border-radius: 8px; color: #e2e8f0; font-size: 12px; padding: 8px 14px; cursor: pointer; font-family: inherit; transition: all 0.15s; white-space: nowrap; }
  .copy-btn:hover { background: #475569; color: #f8fafc; }
  .copy-btn.copied { background: #052e16; border-color: #14532d; color: #4ade80; }

  /* Steps */
  .steps { list-style: none; counter-reset: step-counter; display: flex; flex-direction: column; gap: 10px; margin-top: 18px; padding-top: 18px; border-top: 1px solid #334155; }
  .steps li { counter-increment: step-counter; display: flex; align-items: flex-start; gap: 12px; font-size: 13px; color: #94a3b8; line-height: 1.5; }
  .steps li::before { content: counter(step-counter); min-width: 22px; height: 22px; border-radius: 50%; background: #334155; color: #94a3b8; font-size: 11px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 1px; }
  .steps a { color: #818cf8; }
  .steps a:hover { text-decoration: underline; }

  /* Test button */
  .test-btn { margin-top: 18px; padding-top: 18px; border-top: 1px solid #334155; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  .btn { border: none; border-radius: 8px; font-size: 13px; font-weight: 600; padding: 8px 18px; cursor: pointer; font-family: inherit; transition: all 0.15s; }
  .btn-primary  { background: #6366f1; color: #fff; }
  .btn-primary:hover  { background: #4f46e5; }
  .btn-secondary { background: #1e293b; border: 1px solid #334155; color: #94a3b8; }
  .btn-secondary:hover { border-color: #475569; color: #f1f5f9; }
  .test-result { font-size: 12px; font-family: monospace; color: #64748b; }
  .test-result.ok  { color: #4ade80; }
  .test-result.err { color: #f87171; }

  /* Settings table */
  .settings-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .settings-table th { text-align: left; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.6px; color: #475569; padding: 8px 12px; border-bottom: 1px solid #334155; }
  .settings-table td { padding: 10px 12px; color: #94a3b8; border-bottom: 1px solid #1e293b; vertical-align: middle; }
  .settings-table tr:last-child td { border-bottom: none; }
  .settings-table td:first-child { color: #cbd5e1; font-weight: 500; }
  .pill { display: inline-block; font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 4px; background: #0f172a; border: 1px solid #334155; color: #94a3b8; }

  /* Deployment info */
  .info-row { display: flex; align-items: center; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #1e293b; font-size: 13px; }
  .info-row:last-child { border-bottom: none; }
  .info-key { color: #64748b; }
  .info-val { color: #e2e8f0; font-family: monospace; font-size: 12px; }
  .info-val a { color: #818cf8; }
  .info-val a:hover { text-decoration: underline; }
</style>
</head>
<body>
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

  <!-- ── Integrations ── -->
  <div class="tab-panel active" id="tab-integrations">

    <!-- RB2B -->
    <div class="card">
      <div class="card-header">
        <div class="card-title">
          <div class="card-logo logo-rb2b">R</div>
          RB2B — Visitor Identification
        </div>
        <span class="status-badge ready"><span class="status-dot ready"></span>Ready</span>
      </div>
      <div class="card-desc">
        RB2B de-anonymizes your website visitors and identifies them by name, LinkedIn profile, job title, and company. Paste the webhook URL below into your RB2B dashboard under <strong style="color:#e2e8f0">Integrations → Webhook</strong>.
      </div>
      <div class="url-field">
        <div class="url-box" id="rb2b-url">${baseUrl}/webhooks/rb2b</div>
        <button class="copy-btn" onclick="copyUrl('rb2b-url', this)">Copy</button>
      </div>
      <ol class="steps">
        <li>Go to <a href="https://app.rb2b.com/integrations/webhook" target="_blank">app.rb2b.com → Integrations → Webhook</a></li>
        <li>Paste the URL above and click <strong style="color:#e2e8f0">Save</strong></li>
        <li>Optionally enable <strong style="color:#e2e8f0">Send repeat visitor data</strong> to track return visits</li>
        <li>Click <strong style="color:#e2e8f0">Send a Test Event</strong> in RB2B, then use the button below to verify</li>
      </ol>
      <div class="test-btn">
        <button class="btn btn-primary" onclick="sendTest('rb2b')">Send test event</button>
        <span class="test-result" id="test-rb2b"></span>
      </div>
    </div>

    <!-- Vector -->
    <div class="card">
      <div class="card-header">
        <div class="card-title">
          <div class="card-logo logo-vector">V</div>
          Vector — Ad Engagement
        </div>
        <span class="status-badge ready"><span class="status-dot ready"></span>Ready</span>
      </div>
      <div class="card-desc">
        Vector tracks LinkedIn ad clicks and impressions and ties them back to individual contacts. Configure your Vector account to POST engagement events to the URL below.
      </div>
      <div class="url-field">
        <div class="url-box" id="vector-url">${baseUrl}/webhooks/vector</div>
        <button class="copy-btn" onclick="copyUrl('vector-url', this)">Copy</button>
      </div>
      <ol class="steps">
        <li>In your Vector dashboard, navigate to <strong style="color:#e2e8f0">Settings → Webhooks</strong></li>
        <li>Add a new webhook endpoint with the URL above</li>
        <li>Select event types: <strong style="color:#e2e8f0">ad_click</strong> and <strong style="color:#e2e8f0">ad_impression</strong></li>
        <li>Save and use the button below to send a test event</li>
      </ol>
      <div class="test-btn">
        <button class="btn btn-primary" onclick="sendTest('vector')">Send test event</button>
        <span class="test-result" id="test-vector"></span>
      </div>
    </div>

  </div>

  <!-- ── Intent Scoring ── -->
  <div class="tab-panel" id="tab-scoring">

    <div class="card">
      <div class="card-header">
        <div class="card-title">
          <div class="card-logo logo-system">📄</div>
          Page Signal
        </div>
        <span class="pill">max 40 pts</span>
      </div>
      <table class="settings-table">
        <thead><tr><th>URL contains</th><th>Points</th></tr></thead>
        <tbody>
          <tr><td>/pricing</td><td>40</td></tr>
          <tr><td>/demo, /book-a-demo, /request-demo</td><td>40</td></tr>
          <tr><td>/contact</td><td>35</td></tr>
          <tr><td>/case-studies, /customers</td><td>25</td></tr>
          <tr><td>/features, /product, /solutions</td><td>20</td></tr>
          <tr><td>/about</td><td>10</td></tr>
          <tr><td>/blog/</td><td>8</td></tr>
          <tr><td>Any other page</td><td>5</td></tr>
        </tbody>
      </table>
    </div>

    <div class="card">
      <div class="card-header">
        <div class="card-title">
          <div class="card-logo logo-system">🔁</div>
          Visit Frequency
        </div>
        <span class="pill">max 20 pts</span>
      </div>
      <table class="settings-table">
        <thead><tr><th>Visit count</th><th>Points</th></tr></thead>
        <tbody>
          <tr><td>1 visit</td><td>5</td></tr>
          <tr><td>2–3 visits</td><td>10</td></tr>
          <tr><td>4–6 visits</td><td>15</td></tr>
          <tr><td>7+ visits</td><td>20</td></tr>
        </tbody>
      </table>
    </div>

    <div class="card">
      <div class="card-header">
        <div class="card-title">
          <div class="card-logo logo-system">📣</div>
          Ad Engagement
        </div>
        <span class="pill">max 25 pts</span>
      </div>
      <table class="settings-table">
        <thead><tr><th>Signal</th><th>Points</th></tr></thead>
        <tbody>
          <tr><td>Per ad click (up to 3)</td><td>8 each</td></tr>
          <tr><td>Any impression</td><td>1</td></tr>
        </tbody>
      </table>
    </div>

    <div class="card">
      <div class="card-header">
        <div class="card-title">
          <div class="card-logo logo-system">👤</div>
          Job Title
        </div>
        <span class="pill">max 15 pts</span>
      </div>
      <table class="settings-table">
        <thead><tr><th>Title contains</th><th>Points</th></tr></thead>
        <tbody>
          <tr><td>CEO, Founder, Co-Founder, President, Owner</td><td>15</td></tr>
          <tr><td>CTO, CMO, CFO, COO, CPO, CRO, CHRO</td><td>14</td></tr>
          <tr><td>VP, Vice President</td><td>13</td></tr>
          <tr><td>Director</td><td>11</td></tr>
          <tr><td>Head of, Lead</td><td>9</td></tr>
          <tr><td>Manager</td><td>6</td></tr>
          <tr><td>Engineer, Developer, Designer</td><td>3</td></tr>
        </tbody>
      </table>
    </div>

    <div class="card">
      <div class="card-header">
        <div class="card-title"><div class="card-logo logo-system">🎯</div>Score Tiers</div>
      </div>
      <table class="settings-table">
        <thead><tr><th>Score range</th><th>Tier</th></tr></thead>
        <tbody>
          <tr><td>60–100</td><td><span class="tier-badge hot">hot</span></td></tr>
          <tr><td>30–59</td><td><span class="tier-badge warm">warm</span></td></tr>
          <tr><td>0–29</td><td><span class="tier-badge cold">cold</span></td></tr>
        </tbody>
      </table>
    </div>

  </div>

  <!-- ── System ── -->
  <div class="tab-panel" id="tab-system">

    <div class="card">
      <div class="card-header">
        <div class="card-title"><div class="card-logo logo-system">🚀</div>Deployment</div>
      </div>
      <div class="info-row"><span class="info-key">Live URL</span><span class="info-val"><a href="${baseUrl}" target="_blank">${baseUrl}</a></span></div>
      <div class="info-row"><span class="info-key">GitHub</span><span class="info-val"><a href="https://github.com/bdlc-tx/visitor-intelligence" target="_blank">github.com/bdlc-tx/visitor-intelligence</a></span></div>
      <div class="info-row"><span class="info-key">Runtime</span><span class="info-val">Node.js ${process.version} · Express</span></div>
      <div class="info-row"><span class="info-key">Storage</span><span class="info-val">In-memory (resets on cold start)</span></div>
    </div>

    <div class="card">
      <div class="card-header">
        <div class="card-title"><div class="card-logo logo-system">🔗</div>Endpoints</div>
      </div>
      <table class="settings-table">
        <thead><tr><th>Method</th><th>Path</th><th>Description</th></tr></thead>
        <tbody>
          <tr><td><span class="pill">POST</span></td><td>/webhooks/rb2b</td><td>RB2B visitor identification</td></tr>
          <tr><td><span class="pill">POST</span></td><td>/webhooks/vector</td><td>Vector ad engagement</td></tr>
          <tr><td><span class="pill">GET</span></td><td>/api/contacts</td><td>Paginated contact list</td></tr>
          <tr><td><span class="pill">GET</span></td><td>/api/stats</td><td>Aggregate dashboard stats</td></tr>
          <tr><td><span class="pill">GET</span></td><td>/api/accounts</td><td>Account-level aggregates</td></tr>
          <tr><td><span class="pill">GET</span></td><td>/account</td><td>Company profile page</td></tr>
          <tr><td><span class="pill">GET</span></td><td>/admin</td><td>This page</td></tr>
        </tbody>
      </table>
    </div>

    <div class="card">
      <div class="card-header">
        <div class="card-title"><div class="card-logo logo-system">⚠</div>Data</div>
      </div>
      <div class="card-desc" style="margin-bottom:0">
        The contact store is <strong style="color:#e2e8f0">in-memory</strong> — data does not persist across server restarts or Vercel cold starts. To add persistence, swap <code style="font-size:12px;background:#0f172a;padding:1px 6px;border-radius:4px;border:1px solid #334155">src/store/contacts.js</code> with a Vercel KV (Redis) adapter.
      </div>
      <div class="test-btn" style="margin-top:14px;padding-top:14px">
        <button class="btn btn-secondary" onclick="checkHealth()">Check health</button>
        <span class="test-result" id="test-health"></span>
      </div>
    </div>

  </div>

</div>

<script>
  ${SHARED_JS}

  // Tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    });
  });

  // Copy URL
  function copyUrl(elId, btn) {
    const text = document.getElementById(elId).textContent.trim();
    navigator.clipboard.writeText(text).then(() => {
      btn.textContent = 'Copied!';
      btn.classList.add('copied');
      setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 2000);
    });
  }

  // Send test events
  async function sendTest(source) {
    const el = document.getElementById('test-' + source);
    el.className = 'test-result';
    el.textContent = 'Sending…';
    try {
      let body, url;
      if (source === 'rb2b') {
        url = '/webhooks/rb2b';
        body = {
          'LinkedIn URL': 'https://www.linkedin.com/in/test-user/',
          'First Name': 'Test', 'Last Name': 'User',
          'Title': 'VP of Engineering', 'Company Name': 'Test Co',
          'Business Email': 'test@testco.com', 'Website': 'https://testco.com',
          'Captured URL': window.location.origin + '/pricing',
          'Seen At': new Date().toISOString()
        };
      } else {
        url = '/webhooks/vector';
        body = {
          event: 'ad_click',
          person: { email: 'test@testco.com' },
          campaign: { id: 'test_campaign', name: 'Admin Test', adId: 'ad_test' },
          engagement: { type: 'click', occurredAt: new Date().toISOString() }
        };
      }
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (res.ok) {
        el.className = 'test-result ok';
        el.textContent = '✓ Received · score ' + data.intentScore + ' (' + data.intentTier + ') · ' + (data.isNewContact ? 'new contact' : 'merged');
      } else {
        el.className = 'test-result err';
        el.textContent = '✗ ' + (data.error || res.status);
      }
    } catch(e) {
      el.className = 'test-result err';
      el.textContent = '✗ ' + e.message;
    }
  }

  // Health check
  async function checkHealth() {
    const el = document.getElementById('test-health');
    el.className = 'test-result';
    el.textContent = 'Checking…';
    try {
      const [statsRes] = await Promise.all([fetch('/api/stats')]);
      const stats = await statsRes.json();
      el.className = 'test-result ok';
      el.textContent = '✓ Healthy · ' + stats.totalContacts + ' contacts in store · uptime ' + Math.round(performance.now()/1000) + 's';
    } catch(e) {
      el.className = 'test-result err';
      el.textContent = '✗ ' + e.message;
    }
  }
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
