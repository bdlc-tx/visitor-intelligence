'use strict';

const { v4: uuidv4 } = require('uuid');
const { calculateIntentScore, getIntentTier } = require('../scoring/intent');

// In-memory store — module singleton (Node.js module cache keeps one instance per process)
const store = {
  byId: {},
  byEmail: {},
  byLinkedIn: {},
};

// --- Normalization helpers ---

function normalizeEmail(email) {
  if (!email) return null;
  const normalized = String(email).trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function normalizeLinkedIn(url) {
  if (!url) return null;
  // Extract "in/handle" from any linkedin.com URL variation
  const match = String(url).match(/linkedin\.com\/(in\/[^/?#\s]+)/i);
  return match ? match[1].toLowerCase() : null;
}

// --- Core upsert ---

/**
 * Upsert a contact from a webhook payload.
 *
 * @param {Object} payload
 * @param {string} payload.source         - 'rb2b' | 'vector'
 * @param {string} [payload.email]
 * @param {string} [payload.linkedinUrl]
 * @param {string} [payload.firstName]
 * @param {string} [payload.lastName]
 * @param {string} [payload.fullName]
 * @param {string} [payload.jobTitle]
 * @param {string} [payload.company]
 * @param {string} [payload.companyDomain]
 * @param {Object} [payload.pageVisit]    - { url, visitedAt, referrer, sessionId }
 * @param {Object} [payload.adEvent]      - { type, campaignId, campaignName, adId, occurredAt }
 * @returns {Object} The created or updated contact
 */
function upsertContact(payload) {
  const {
    source,
    email,
    linkedinUrl,
    firstName,
    lastName,
    fullName,
    jobTitle,
    company,
    companyDomain,
    pageVisit,
    adEvent,
  } = payload;

  const normEmail = normalizeEmail(email);
  const normLinkedIn = normalizeLinkedIn(linkedinUrl);
  const now = new Date().toISOString();

  // Find existing contact via OR-match (email takes priority if both match different IDs)
  let existingId = null;
  if (normEmail && store.byEmail[normEmail]) {
    existingId = store.byEmail[normEmail];
  }
  if (normLinkedIn && store.byLinkedIn[normLinkedIn] && existingId === null) {
    existingId = store.byLinkedIn[normLinkedIn];
  }

  if (existingId) {
    // MERGE path
    const contact = store.byId[existingId];

    // Enrich scalar fields — only update if new value is non-null and current is null
    if (firstName && !contact.firstName) contact.firstName = firstName;
    if (lastName && !contact.lastName) contact.lastName = lastName;
    if (fullName && !contact.fullName) contact.fullName = fullName;
    // Allow job title and company to update (people change jobs)
    if (jobTitle) contact.jobTitle = jobTitle;
    if (company) contact.company = company;
    if (companyDomain && !contact.companyDomain) contact.companyDomain = companyDomain;

    // Update identity fields and indexes if newly provided
    if (normEmail && !contact.email) {
      contact.email = normEmail;
      store.byEmail[normEmail] = contact.id;
    }
    if (normLinkedIn && !contact.linkedinUrl) {
      contact.linkedinUrl = normLinkedIn;
      store.byLinkedIn[normLinkedIn] = contact.id;
    }

    // Append page visit (deduplicate by url+visitedAt)
    if (pageVisit && pageVisit.url) {
      const key = `${pageVisit.url}|${pageVisit.visitedAt || now}`;
      const alreadyExists = contact.pagesVisited.some(
        (p) => `${p.url}|${p.visitedAt}` === key
      );
      if (!alreadyExists) {
        contact.pagesVisited.push({
          url: pageVisit.url,
          visitedAt: pageVisit.visitedAt || now,
          referrer: pageVisit.referrer || null,
          sessionId: pageVisit.sessionId || null,
        });
        contact.visitCount += 1;
      }
    }

    // Append ad event (deduplicate by type+adId+occurredAt)
    if (adEvent) {
      const key = `${adEvent.type}|${adEvent.adId || ''}|${adEvent.occurredAt || now}`;
      const alreadyExists = contact.adEvents.some(
        (e) => `${e.type}|${e.adId || ''}|${e.occurredAt}` === key
      );
      if (!alreadyExists) {
        contact.adEvents.push({
          type: adEvent.type,
          campaignId: adEvent.campaignId || null,
          campaignName: adEvent.campaignName || null,
          adId: adEvent.adId || null,
          occurredAt: adEvent.occurredAt || now,
        });
        if (adEvent.type === 'click') contact.adClickCount += 1;
        if (adEvent.type === 'impression') contact.adImpressionCount += 1;
      }
    }

    // Track source
    if (!contact.sources.includes(source)) contact.sources.push(source);

    contact.lastSeenAt = now;
    contact.updatedAt = now;

    // Recompute intent score
    contact.intentScore = calculateIntentScore(contact);
    contact.intentTier = getIntentTier(contact.intentScore);

    return contact;
  } else {
    // CREATE path
    const id = uuidv4();
    const contact = {
      id,
      email: normEmail,
      linkedinUrl: normLinkedIn,
      firstName: firstName || null,
      lastName: lastName || null,
      fullName: fullName || null,
      jobTitle: jobTitle || null,
      company: company || null,
      companyDomain: companyDomain || null,
      pagesVisited: [],
      visitCount: 0,
      adEvents: [],
      adClickCount: 0,
      adImpressionCount: 0,
      intentScore: 0,
      intentTier: 'cold',
      sources: [source],
      firstSeenAt: now,
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now,
    };

    if (pageVisit && pageVisit.url) {
      contact.pagesVisited.push({
        url: pageVisit.url,
        visitedAt: pageVisit.visitedAt || now,
        referrer: pageVisit.referrer || null,
        sessionId: pageVisit.sessionId || null,
      });
      contact.visitCount = 1;
    }

    if (adEvent) {
      contact.adEvents.push({
        type: adEvent.type,
        campaignId: adEvent.campaignId || null,
        campaignName: adEvent.campaignName || null,
        adId: adEvent.adId || null,
        occurredAt: adEvent.occurredAt || now,
      });
      if (adEvent.type === 'click') contact.adClickCount = 1;
      if (adEvent.type === 'impression') contact.adImpressionCount = 1;
    }

    // Add to indexes
    store.byId[id] = contact;
    if (normEmail) store.byEmail[normEmail] = id;
    if (normLinkedIn) store.byLinkedIn[normLinkedIn] = id;

    // Compute intent score
    contact.intentScore = calculateIntentScore(contact);
    contact.intentTier = getIntentTier(contact.intentScore);

    return contact;
  }
}

function getAll() {
  return Object.values(store.byId);
}

function getById(id) {
  return store.byId[id] || null;
}

function getStats() {
  const contacts = getAll();
  const total = contacts.length;

  const hotCount = contacts.filter((c) => c.intentTier === 'hot').length;
  const warmCount = contacts.filter((c) => c.intentTier === 'warm').length;
  const coldCount = contacts.filter((c) => c.intentTier === 'cold').length;

  const rb2bCount = contacts.filter((c) => c.sources.includes('rb2b')).length;
  const vectorCount = contacts.filter((c) => c.sources.includes('vector')).length;
  const bothSourcesCount = contacts.filter(
    (c) => c.sources.includes('rb2b') && c.sources.includes('vector')
  ).length;

  const avgIntentScore =
    total > 0 ? Math.round(contacts.reduce((sum, c) => sum + c.intentScore, 0) / total) : 0;

  const adClickTotal = contacts.reduce((sum, c) => sum + c.adClickCount, 0);

  // Top 5 most-visited pages
  const pageCounts = {};
  contacts.forEach((c) => {
    c.pagesVisited.forEach((p) => {
      pageCounts[p.url] = (pageCounts[p.url] || 0) + 1;
    });
  });
  const topPages = Object.entries(pageCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([url, count]) => ({ url, count }));

  return {
    totalContacts: total,
    hotCount,
    warmCount,
    coldCount,
    rb2bCount,
    vectorCount,
    bothSourcesCount,
    avgIntentScore,
    adClickTotal,
    topPages,
  };
}

function clear() {
  store.byId = {};
  store.byEmail = {};
  store.byLinkedIn = {};
}

module.exports = { upsertContact, getAll, getById, getStats, clear };
