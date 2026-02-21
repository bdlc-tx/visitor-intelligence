# visitor-intelligence

A lightweight Node.js/Express webhook server that unifies B2B visitor signals from [RB2B](https://www.rb2b.com/) and [Vector](https://vector.co/) into a single contact store with intent scoring.

```
[RB2B]  → POST /webhooks/rb2b  ─┐
                                  ├─→ [Unified Contact Store] ←─ GET /api/*  ←─ [Dashboard]
[Vector] → POST /webhooks/vector ─┘
```

## Features

- **Unified contact store** — merges contacts from both sources by email or LinkedIn URL
- **Intent scoring (0–100)** — based on pages visited, visit frequency, ad engagement, and job title
- **OR-match identity resolution** — a match on either email or LinkedIn URL triggers a merge
- **Dashboard API** — paginated contact list and aggregate stats

## Quick Start

```bash
npm install
cp .env.example .env   # optional — PORT defaults to 3000
npm run dev
```

Then verify the server is running:
```bash
curl http://localhost:3000/
# {"status":"ok","service":"visitor-intelligence","uptime":1}
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Local server port |
| `CORS_ORIGIN` | `*` | Allowed CORS origin(s) |

Create a `.env` file in the project root (already in `.gitignore`):
```
PORT=3000
CORS_ORIGIN=*
```

## API Reference

### POST /webhooks/rb2b

Receives RB2B visitor identification payloads.

**Request body:**
```json
{
  "event": "visitor_identified",
  "timestamp": "2026-02-21T10:00:00Z",
  "person": {
    "firstName": "Jane",
    "lastName": "Doe",
    "fullName": "Jane Doe",
    "email": "jane.doe@acme.com",
    "linkedinUrl": "https://www.linkedin.com/in/jane-doe/",
    "jobTitle": "VP of Engineering",
    "company": "Acme Corp",
    "companyDomain": "acme.com"
  },
  "pageVisit": {
    "url": "https://yoursite.com/pricing",
    "referrer": "https://www.google.com",
    "visitedAt": "2026-02-21T10:00:00Z",
    "sessionId": "sess_abc123"
  }
}
```

At least one of `person.email` or `person.linkedinUrl` is required.

**Response (200):**
```json
{
  "received": true,
  "contactId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "intentScore": 66,
  "intentTier": "hot",
  "isNewContact": true
}
```

---

### POST /webhooks/vector

Receives Vector ad engagement payloads.

**Request body:**
```json
{
  "event": "ad_click",
  "timestamp": "2026-02-21T10:05:00Z",
  "person": {
    "email": "jane.doe@acme.com",
    "linkedinUrl": "https://www.linkedin.com/in/jane-doe/"
  },
  "campaign": {
    "id": "camp_q1_retargeting",
    "name": "Q1 LinkedIn Retargeting",
    "adId": "ad_cta_pricing_banner",
    "adName": "Pricing CTA Banner"
  },
  "engagement": {
    "type": "click",
    "occurredAt": "2026-02-21T10:05:00Z"
  }
}
```

`engagement.type` must be `click` or `impression`.

**Response (200):**
```json
{
  "received": true,
  "contactId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "intentScore": 74,
  "intentTier": "hot",
  "isNewContact": false
}
```

---

### GET /api/contacts

Returns the unified contact list with intent scores.

**Query parameters:**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `tier` | string | — | Filter by intent tier: `hot`, `warm`, `cold` |
| `source` | string | — | Filter by source: `rb2b`, `vector` |
| `sort` | string | `intentScore` | Sort field: `intentScore`, `visitCount`, `adClickCount`, `createdAt`, `updatedAt`, `lastSeenAt` |
| `order` | string | `desc` | Sort direction: `asc`, `desc` |
| `limit` | number | `50` | Results per page (max 200) |
| `offset` | number | `0` | Results to skip |

**Response (200):**
```json
{
  "total": 1,
  "count": 1,
  "limit": 50,
  "offset": 0,
  "contacts": [
    {
      "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      "email": "jane.doe@acme.com",
      "linkedinUrl": "in/jane-doe",
      "firstName": "Jane",
      "lastName": "Doe",
      "fullName": "Jane Doe",
      "jobTitle": "VP of Engineering",
      "company": "Acme Corp",
      "companyDomain": "acme.com",
      "pagesVisited": [{ "url": "https://yoursite.com/pricing", "visitedAt": "..." }],
      "visitCount": 1,
      "adEvents": [{ "type": "click", "campaignId": "camp_q1_retargeting", "occurredAt": "..." }],
      "adClickCount": 1,
      "adImpressionCount": 0,
      "intentScore": 66,
      "intentTier": "hot",
      "sources": ["rb2b", "vector"],
      "firstSeenAt": "2026-02-21T10:00:00Z",
      "lastSeenAt": "2026-02-21T10:05:00Z",
      "createdAt": "2026-02-21T10:00:00Z",
      "updatedAt": "2026-02-21T10:05:00Z"
    }
  ]
}
```

---

### GET /api/stats

Returns aggregated stats for the dashboard.

**Response (200):**
```json
{
  "totalContacts": 42,
  "hotCount": 8,
  "warmCount": 19,
  "coldCount": 15,
  "rb2bCount": 35,
  "vectorCount": 20,
  "bothSourcesCount": 13,
  "avgIntentScore": 41,
  "adClickTotal": 27,
  "topPages": [
    { "url": "https://yoursite.com/pricing", "count": 14 },
    { "url": "https://yoursite.com/features", "count": 9 }
  ]
}
```

---

## Intent Scoring Reference

Scores are clamped to **0–100** and calculated as the sum of four categories.

### A. Page Signal (max 40 pts)

Best single page visited wins (no stacking).

| URL contains | Points |
|---|---|
| `/pricing` | 40 |
| `/demo`, `/book-a-demo`, `/request-demo` | 40 |
| `/contact` | 35 |
| `/case-studies`, `/customers` | 25 |
| `/features`, `/product`, `/solutions` | 20 |
| `/about` | 10 |
| `/blog/` | 8 |
| Anything else | 5 |

### B. Visit Frequency (max 20 pts)

| Visit count | Points |
|---|---|
| 1 | 5 |
| 2–3 | 10 |
| 4–6 | 15 |
| 7+ | 20 |

### C. Ad Engagement (max 25 pts)

| Signal | Points |
|---|---|
| Per ad click (up to 3) | 8 each |
| Any impression | 1 |

### D. Job Title (max 15 pts)

| Title contains | Points |
|---|---|
| CEO, Founder, Co-Founder, President, Owner | 15 |
| CTO, CMO, CFO, COO, CPO, CRO, CHRO | 14 |
| VP, Vice President | 13 |
| Director | 11 |
| Head of, Lead | 9 |
| Manager | 6 |
| Engineer, Developer, Designer | 3 |
| Unknown | 0 |

### Score Tiers

| Score | Tier |
|---|---|
| 60–100 | `hot` |
| 30–59 | `warm` |
| 0–29 | `cold` |

---

## Merge Logic

Contacts are merged using **OR-match identity resolution**:

1. Normalize email (lowercase) and LinkedIn URL (extract `in/handle` path)
2. Look up an existing contact where **either** email **or** LinkedIn URL matches
3. If found → merge the records (enrich null fields, append page visits and ad events)
4. If not found → create a new contact with a UUID
5. Intent score is recalculated on every write

This approach maximizes deduplication across channels where Vector may only provide email and RB2B provides both.

---

## Data Model

| Field | Type | Source | Description |
|---|---|---|---|
| `id` | string | system | UUID, stable identifier |
| `email` | string | both | Normalized lowercase email |
| `linkedinUrl` | string | both | Normalized `in/handle` path |
| `firstName` | string | RB2B | First name |
| `lastName` | string | RB2B | Last name |
| `fullName` | string | RB2B | Full display name |
| `jobTitle` | string | RB2B | Job title (used for scoring) |
| `company` | string | RB2B | Company name |
| `companyDomain` | string | RB2B | Company domain |
| `pagesVisited` | array | RB2B | `[{ url, visitedAt, referrer, sessionId }]` |
| `visitCount` | number | RB2B | Total distinct page visits |
| `adEvents` | array | Vector | `[{ type, campaignId, campaignName, adId, occurredAt }]` |
| `adClickCount` | number | Vector | Total ad clicks |
| `adImpressionCount` | number | Vector | Total ad impressions |
| `intentScore` | number | system | 0–100, recalculated on every write |
| `intentTier` | string | system | `hot`, `warm`, or `cold` |
| `sources` | array | system | `['rb2b', 'vector']` — which sources contributed |
| `firstSeenAt` | string | system | ISO 8601 timestamp |
| `lastSeenAt` | string | system | ISO 8601 timestamp |
| `createdAt` | string | system | ISO 8601 timestamp |
| `updatedAt` | string | system | ISO 8601 timestamp |

---

## Deployment to Vercel

```bash
npm i -g vercel
vercel deploy
```

All routes are forwarded to `src/index.js` via `vercel.json`. Vercel's `@vercel/node` runtime wraps the exported Express app as a serverless function.

> **Note on persistence:** The in-memory store resets on every cold start of the serverless function. For production use with persistence, replace `src/store/contacts.js` with an adapter backed by [Vercel KV](https://vercel.com/docs/storage/vercel-kv) (Redis).

---

## Project Structure

```
visitor-intelligence/
├── src/
│   ├── index.js              # Express app entry point, exports app for Vercel
│   ├── routes/
│   │   ├── webhooks.js       # POST /webhooks/rb2b, POST /webhooks/vector
│   │   └── api.js            # GET /api/contacts, GET /api/stats
│   ├── store/
│   │   └── contacts.js       # In-memory store, OR-match merge logic, indexes
│   └── scoring/
│       └── intent.js         # Pure intent scoring functions
├── package.json
├── vercel.json               # Vercel serverless deployment config
├── .gitignore
└── README.md
```

## Testing the Endpoints

```bash
# 1. Start the server
npm run dev

# 2. Send an RB2B webhook (VP visiting pricing page)
curl -s -X POST http://localhost:3000/webhooks/rb2b \
  -H "Content-Type: application/json" \
  -d '{
    "event": "visitor_identified",
    "person": {
      "email": "jane@acme.com",
      "linkedinUrl": "https://linkedin.com/in/jane-doe",
      "jobTitle": "VP of Engineering",
      "company": "Acme Corp"
    },
    "pageVisit": {
      "url": "https://yoursite.com/pricing",
      "visitedAt": "2026-02-21T10:00:00Z"
    }
  }' | jq

# 3. Send a Vector ad click for the same contact (merges by email)
curl -s -X POST http://localhost:3000/webhooks/vector \
  -H "Content-Type: application/json" \
  -d '{
    "event": "ad_click",
    "person": { "email": "jane@acme.com" },
    "campaign": { "id": "c1", "name": "Q1 Retargeting" },
    "engagement": { "type": "click", "occurredAt": "2026-02-21T10:05:00Z" }
  }' | jq

# Expected: intentScore = 40 (pricing) + 5 (1 visit) + 8 (1 click) + 13 (VP) = 66 → hot

# 4. Check merged contact
curl -s http://localhost:3000/api/contacts | jq

# 5. Check stats
curl -s http://localhost:3000/api/stats | jq
```
