'use strict';

const { Router } = require('express');
const store = require('../store/contacts');

const router = Router();

// POST /webhooks/rb2b
// Receives RB2B visitor identification payloads
router.post('/rb2b', (req, res) => {
  try {
    const payload = req.body;

    if (!payload || typeof payload !== 'object') {
      return res.status(400).json({ error: 'Request body must be a JSON object' });
    }

    const { person, pageVisit } = payload;

    if (!person || typeof person !== 'object') {
      return res.status(400).json({ error: 'Missing required field: person' });
    }

    if (!person.email && !person.linkedinUrl) {
      return res.status(400).json({
        error: 'At least one identity field is required: person.email or person.linkedinUrl',
      });
    }

    const contact = store.upsertContact({
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
      isNewContact: contact.createdAt === contact.updatedAt,
    });
  } catch (err) {
    console.error('[webhooks/rb2b] Unexpected error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /webhooks/vector
// Receives Vector ad engagement payloads
router.post('/vector', (req, res) => {
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

    const contact = store.upsertContact({
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
      isNewContact: contact.createdAt === contact.updatedAt,
    });
  } catch (err) {
    console.error('[webhooks/vector] Unexpected error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
