'use strict';

const { Router } = require('express');
const store = require('../store/contacts');

const router = Router();

// POST /webhooks/rb2b
router.post('/rb2b', async (req, res) => {
  try {
    const payload = req.body;

    if (!payload || typeof payload !== 'object') {
      return res.status(400).json({ error: 'Request body must be a JSON object' });
    }

    let person, pageVisit;

    if (payload['LinkedIn URL'] || payload['Business Email']) {
      // Native RB2B format
      person = {
        email:         payload['Business Email'] || null,
        linkedinUrl:   payload['LinkedIn URL']   || null,
        firstName:     payload['First Name']     || null,
        lastName:      payload['Last Name']      || null,
        jobTitle:      payload['Title']          || null,
        company:       payload['Company Name']   || null,
        companyDomain: payload['Website']
          ? payload['Website'].replace(/^https?:\/\/(www\.)?/, '').split('/')[0]
          : null,
      };
      pageVisit = payload['Captured URL']
        ? { url: payload['Captured URL'], visitedAt: payload['Seen At'] || null, referrer: payload['Referrer'] || null }
        : null;
    } else {
      // Nested test format
      person    = payload.person;
      pageVisit = payload.pageVisit;
    }

    if (!person || typeof person !== 'object') {
      return res.status(400).json({ error: 'Missing required field: person' });
    }

    if (!person.email && !person.linkedinUrl) {
      return res.status(400).json({
        error: 'At least one identity field is required: person.email or person.linkedinUrl',
      });
    }

    const { contact, isNew } = await store.upsertContact({
      source: 'rb2b',
      email: person.email || null,
      linkedinUrl: person.linkedinUrl || null,
      firstName: person.firstName || null,
      lastName: person.lastName || null,
      fullName: person.fullName || null,
      jobTitle: person.jobTitle || null,
      company: person.company || null,
      companyDomain: person.companyDomain || null,
      pageVisit: pageVisit && pageVisit.url ? pageVisit : null,
    });

    return res.status(200).json({
      received: true,
      contactId: contact.id,
      intentScore: contact.intentScore,
      intentTier: contact.intentTier,
      isNewContact: isNew,
    });
  } catch (err) {
    console.error('[webhooks/rb2b] Unexpected error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /webhooks/vector
router.post('/vector', async (req, res) => {
  try {
    const payload = req.body;

    if (!payload || typeof payload !== 'object') {
      return res.status(400).json({ error: 'Request body must be a JSON object' });
    }

    const { person, campaign, engagement } = payload;

    if (!person || typeof person !== 'object') {
      return res.status(400).json({ error: 'Missing required field: person' });
    }

    if (!person.email && !person.linkedinUrl) {
      return res.status(400).json({
        error: 'At least one identity field is required: person.email or person.linkedinUrl',
      });
    }

    if (!engagement || !engagement.type) {
      return res.status(400).json({ error: 'Missing required field: engagement.type' });
    }

    const validEngagementTypes = ['click', 'impression'];
    if (!validEngagementTypes.includes(engagement.type)) {
      return res.status(400).json({
        error: `engagement.type must be one of: ${validEngagementTypes.join(', ')}`,
      });
    }

    const adEvent = {
      type: engagement.type,
      campaignId: campaign ? campaign.id || null : null,
      campaignName: campaign ? campaign.name || null : null,
      adId: campaign ? campaign.adId || null : null,
      occurredAt: engagement.occurredAt || null,
    };

    const { contact, isNew } = await store.upsertContact({
      source: 'vector',
      email: person.email || null,
      linkedinUrl: person.linkedinUrl || null,
      adEvent,
    });

    return res.status(200).json({
      received: true,
      contactId: contact.id,
      intentScore: contact.intentScore,
      intentTier: contact.intentTier,
      isNewContact: isNew,
    });
  } catch (err) {
    console.error('[webhooks/vector] Unexpected error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
