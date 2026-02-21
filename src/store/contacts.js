'use strict';

const { v4: uuidv4 } = require('uuid');
const { Redis } = require('@upstash/redis');
const { calculateIntentScore, getIntentTier } = require('../scoring/intent');

// Redis client — reads UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN from env
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// Redis key helpers
const KEYS = {
  contact: (id) => `contact:${id}`,
  allIds: () => 'contacts:ids',
  emailIndex: (email) => `idx:email:${email}`,
  linkedinIndex: (li) => `idx:linkedin:${li}`,
};

// --- Normalization helpers ---

function normalizeEmail(email) {
  if (!email) return null;
  const normalized = String(email).trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function normalizeLinkedIn(url) {
  if (!url) return null;
  const match = String(url).match(/linkedin\.com\/(in\/[^/?#\s]+)/i);
  if (match) return match[1].toLowerCase();
  // Handle bare "in/handle" format (no domain)
  const bare = String(url).match(/^(in\/[^/?#\s]+)$/i);
  return bare ? bare[1].toLowerCase() : null;
}

// --- Core upsert (async) ---

async function upsertContact(payload) {
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

  // OR-match lookup via index keys
  let existingId = null;
  if (normEmail) {
    existingId = await redis.get(KEYS.emailIndex(normEmail));
  }
  if (!existingId && normLinkedIn) {
    existingId = await redis.get(KEYS.linkedinIndex(normLinkedIn));
  }

  if (existingId) {
    // MERGE path
    const contact = await redis.get(KEYS.contact(existingId));
    if (!contact) {
      // Index pointed to a missing contact — treat as new
      existingId = null;
    } else {
      // Enrich scalar fields
      if (firstName && !contact.firstName) contact.firstName = firstName;
      if (lastName && !contact.lastName) contact.lastName = lastName;
      if (fullName && !contact.fullName) contact.fullName = fullName;
      if (jobTitle) contact.jobTitle = jobTitle;
      if (company) contact.company = company;
      if (companyDomain && !contact.companyDomain) contact.companyDomain = companyDomain;

      // Update identity indexes if newly provided
      if (normEmail && !contact.email) {
        contact.email = normEmail;
        await redis.set(KEYS.emailIndex(normEmail), contact.id);
      }
      if (normLinkedIn && !contact.linkedinUrl) {
        contact.linkedinUrl = normLinkedIn;
        await redis.set(KEYS.linkedinIndex(normLinkedIn), contact.id);
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
      contact.intentScore = calculateIntentScore(contact);
      contact.intentTier = getIntentTier(contact.intentScore);

      await redis.set(KEYS.contact(contact.id), contact);
      return { contact, isNew: false };
    }
  }

  // CREATE path (runs if existingId was null or index pointed to missing contact)
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

  contact.intentScore = calculateIntentScore(contact);
  contact.intentTier = getIntentTier(contact.intentScore);

  // Persist contact and update indexes
  await redis.set(KEYS.contact(id), contact);
  await redis.sadd(KEYS.allIds(), id);
  if (normEmail) await redis.set(KEYS.emailIndex(normEmail), id);
  if (normLinkedIn) await redis.set(KEYS.linkedinIndex(normLinkedIn), id);

  return { contact, isNew: true };
}

async function getAll() {
  const ids = await redis.smembers(KEYS.allIds());
  if (!ids || ids.length === 0) return [];
  // Batch fetch all contacts
  const pipeline = redis.pipeline();
  ids.forEach((id) => pipeline.get(KEYS.contact(id)));
  const results = await pipeline.exec();
  return results.filter(Boolean);
}

async function getById(id) {
  return await redis.get(KEYS.contact(id));
}

async function getStats() {
  const contacts = await getAll();
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

async function clear() {
  const ids = await redis.smembers(KEYS.allIds());
  if (ids && ids.length > 0) {
    const pipeline = redis.pipeline();
    ids.forEach((id) => pipeline.del(KEYS.contact(id)));
    await pipeline.exec();
  }
  await redis.del(KEYS.allIds());
}

module.exports = { upsertContact, getAll, getById, getStats, clear };
