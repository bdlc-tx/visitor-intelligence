'use strict';

const { Router } = require('express');
const store = require('../store/contacts');

const router = Router();

// GET /api/contacts
// Query params:
//   tier    - filter by intent tier: hot | warm | cold
//   source  - filter by source: rb2b | vector
//   sort    - field to sort by (default: intentScore)
//   order   - asc | desc (default: desc)
//   limit   - number of results per page (default: 50, max: 200)
//   offset  - number of results to skip (default: 0)
router.get('/contacts', (req, res) => {
  try {
    let contacts = store.getAll();

    const { tier, source, sort = 'intentScore', order = 'desc', limit = '50', offset = '0' } = req.query;

    // Filter by intent tier
    if (tier) {
      const validTiers = ['hot', 'warm', 'cold'];
      if (!validTiers.includes(tier)) {
        return res.status(400).json({ error: `tier must be one of: ${validTiers.join(', ')}` });
      }
      contacts = contacts.filter((c) => c.intentTier === tier);
    }

    // Filter by source
    if (source) {
      const validSources = ['rb2b', 'vector'];
      if (!validSources.includes(source)) {
        return res.status(400).json({ error: `source must be one of: ${validSources.join(', ')}` });
      }
      contacts = contacts.filter((c) => c.sources.includes(source));
    }

    // Sort
    const validSortFields = ['intentScore', 'visitCount', 'adClickCount', 'createdAt', 'updatedAt', 'lastSeenAt'];
    const sortField = validSortFields.includes(sort) ? sort : 'intentScore';
    const sortDir = order === 'asc' ? 1 : -1;

    contacts = contacts.slice().sort((a, b) => {
      const av = a[sortField] ?? '';
      const bv = b[sortField] ?? '';
      if (av < bv) return -1 * sortDir;
      if (av > bv) return 1 * sortDir;
      return 0;
    });

    const total = contacts.length;

    // Paginate
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
    const offsetNum = Math.max(parseInt(offset, 10) || 0, 0);
    const page = contacts.slice(offsetNum, offsetNum + limitNum);

    return res.status(200).json({
      total,
      count: page.length,
      limit: limitNum,
      offset: offsetNum,
      contacts: page,
    });
  } catch (err) {
    console.error('[api/contacts] Unexpected error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/stats
// Returns aggregated dashboard stats
router.get('/stats', (req, res) => {
  try {
    const stats = store.getStats();
    return res.status(200).json(stats);
  } catch (err) {
    console.error('[api/stats] Unexpected error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/accounts
// Groups contacts by company, returns account-level aggregates
router.get('/accounts', (req, res) => {
  try {
    const contacts = store.getAll();

    // Group by normalized company name
    const accountMap = {};
    for (const c of contacts) {
      const key = (c.company || '').trim().toLowerCase() || '__unknown__';
      const label = c.company || 'Unknown';
      if (!accountMap[key]) {
        accountMap[key] = {
          company: label,
          companyDomain: c.companyDomain || null,
          contacts: [],
          totalVisits: 0,
          totalAdClicks: 0,
          totalAdImpressions: 0,
          topIntentScore: 0,
          sources: [],
          firstSeenAt: c.firstSeenAt,
          lastSeenAt: c.lastSeenAt,
        };
      }
      const acc = accountMap[key];
      acc.contacts.push(c);
      acc.totalVisits += c.visitCount;
      acc.totalAdClicks += c.adClickCount;
      acc.totalAdImpressions += c.adImpressionCount;
      if (c.intentScore > acc.topIntentScore) acc.topIntentScore = c.intentScore;
      if (!acc.companyDomain && c.companyDomain) acc.companyDomain = c.companyDomain;
      for (const s of c.sources) {
        if (!acc.sources.includes(s)) acc.sources.push(s);
      }
      if (c.firstSeenAt < acc.firstSeenAt) acc.firstSeenAt = c.firstSeenAt;
      if (c.lastSeenAt > acc.lastSeenAt) acc.lastSeenAt = c.lastSeenAt;
    }

    const accounts = Object.values(accountMap)
      .map((acc) => ({
        company: acc.company,
        companyDomain: acc.companyDomain,
        peopleCount: acc.contacts.length,
        totalVisits: acc.totalVisits,
        totalAdClicks: acc.totalAdClicks,
        totalAdImpressions: acc.totalAdImpressions,
        topIntentScore: acc.topIntentScore,
        topIntentTier: acc.topIntentScore >= 60 ? 'hot' : acc.topIntentScore >= 30 ? 'warm' : 'cold',
        sources: acc.sources,
        contacts: acc.contacts,
        firstSeenAt: acc.firstSeenAt,
        lastSeenAt: acc.lastSeenAt,
      }))
      .sort((a, b) => b.topIntentScore - a.topIntentScore);

    return res.status(200).json({ total: accounts.length, accounts });
  } catch (err) {
    console.error('[api/accounts] Unexpected error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
