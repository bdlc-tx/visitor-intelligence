'use strict';

// Page scoring rules — evaluated against URL path, highest match wins
const PAGE_RULES = [
  { patterns: ['/pricing'], points: 40 },
  { patterns: ['/demo', '/book-a-demo', '/request-demo'], points: 40 },
  { patterns: ['/contact'], points: 35 },
  { patterns: ['/case-studies', '/customers'], points: 25 },
  { patterns: ['/features', '/product', '/solutions'], points: 20 },
  { patterns: ['/about'], points: 10 },
  { patterns: ['/blog/'], points: 8 },
];
const PAGE_DEFAULT_POINTS = 5;

// Job title scoring rules — case-insensitive substring match, highest match wins
const TITLE_RULES = [
  { patterns: ['ceo', 'founder', 'co-founder', 'president', 'owner'], points: 15 },
  { patterns: ['cto', 'cmo', 'cfo', 'coo', 'cpo', 'cro', 'chro'], points: 14 },
  { patterns: ['vp', 'vice president'], points: 13 },
  { patterns: ['director'], points: 11 },
  { patterns: ['head of', 'lead'], points: 9 },
  { patterns: ['manager'], points: 6 },
  { patterns: ['engineer', 'developer', 'designer'], points: 3 },
];

function scoreForUrl(url) {
  if (!url) return PAGE_DEFAULT_POINTS;
  const lower = url.toLowerCase();
  for (const rule of PAGE_RULES) {
    if (rule.patterns.some((p) => lower.includes(p))) {
      return rule.points;
    }
  }
  return PAGE_DEFAULT_POINTS;
}

function scoreForVisitCount(count) {
  if (count >= 7) return 20;
  if (count >= 4) return 15;
  if (count >= 2) return 10;
  if (count >= 1) return 5;
  return 0;
}

function scoreForJobTitle(title) {
  if (!title) return 0;
  const lower = title.toLowerCase();
  for (const rule of TITLE_RULES) {
    if (rule.patterns.some((p) => lower.includes(p))) {
      return rule.points;
    }
  }
  return 0;
}

function calculateIntentScore(contact) {
  // Category A: page signal (max 40) — best single page wins
  const pageScore =
    contact.pagesVisited && contact.pagesVisited.length > 0
      ? contact.pagesVisited.reduce((max, p) => Math.max(max, scoreForUrl(p.url)), 0)
      : 0;

  // Category B: visit frequency (max 20)
  const visitScore = scoreForVisitCount(contact.visitCount || 0);

  // Category C: ad engagement (max 25)
  const clickPts = Math.min((contact.adClickCount || 0) * 8, 24);
  const impressionPts = (contact.adImpressionCount || 0) > 0 ? 1 : 0;
  const adScore = Math.min(clickPts + impressionPts, 25);

  // Category D: job title (max 15)
  const titleScore = scoreForJobTitle(contact.jobTitle);

  return Math.min(pageScore + visitScore + adScore + titleScore, 100);
}

function getIntentTier(score) {
  if (score >= 60) return 'hot';
  if (score >= 30) return 'warm';
  return 'cold';
}

module.exports = { calculateIntentScore, getIntentTier, scoreForUrl, scoreForVisitCount, scoreForJobTitle };
