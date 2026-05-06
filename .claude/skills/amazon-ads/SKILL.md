---
name: amazon-ads
description: Amazon Ads API integration patterns — OAuth flow, report fetching, token refresh, marketplace handling. Use when building features that read/write Amazon advertising data (campaigns, search terms, products, keywords, reports).
---

# Amazon Ads API Integration

## Quick reference

- **Auth host**: `https://api.amazon.com/auth/o2/token`
- **API host (NA)**: `https://advertising-api.amazon.com`
- **API host (EU)**: `https://advertising-api-eu.amazon.com`
- **API host (FE)**: `https://advertising-api-fe.amazon.com`
- **Required scope**: `advertising::campaign_management`
- **Profile ID**: each marketplace = separate profile ID (US, IN, UK, DE all different)

## OAuth flow (already implemented)

See `api/src/routes/amazon-oauth.ts`:
1. User clicks "Connect Amazon" → server generates random state token
2. User authorizes on Amazon → returns to `/api/oauth/amazon/callback?code=...&state=...`
3. Server exchanges code for `access_token` + `refresh_token` + `expires_in`
4. Server fetches profiles list, encrypts tokens, stores in `amazon_connections` table
5. Scheduler reads encrypted refresh_token, exchanges for new access_token when needed (with 5-min buffer)

**Key detail**: refresh_token doesn't expire (use it indefinitely). access_token expires every 60 min.

## Token storage

**Always encrypt before DB write**:
```ts
import { encryptOrPassThrough } from "@/lib/crypto.js";
const encrypted = encryptOrPassThrough(refresh_token);
```

**Decrypt on read**:
```ts
import { decrypt } from "@/lib/crypto.js";
const refresh_token = decrypt(row.refresh_token);
```

## Report types we use

| Report | Frequency | Endpoint | Records |
|---|---|---|---|
| Campaigns | Every 15 min | `/v2/sp/campaigns` | per campaign |
| Search terms | Every 60 min | `POST /reporting/reports` (sponsoredProducts/searchTerm) | per search term |
| Products | Every 180 min | `POST /reporting/reports` (sponsoredProducts/asin) | per ASIN |
| Hourly performance | Every 1 min | `/v2/hsa/campaigns/extended` | hourly granularity |
| Yesterday | Every 30 min during 00-12 UTC | reportType=yesterday | per row |

## Common gotchas

1. **Report polling**: reports are async. Submit → get reportId → poll status → download URL. `_poll_report()` in fetcher.py handles this.
2. **Rate limits**: Amazon limits ~2 req/sec per profile. Use exponential backoff on 429.
3. **Date format**: always YYYY-MM-DD (not ISO timestamps).
4. **Profile-scoped requests**: every request needs `Amazon-Advertising-API-ClientId` AND `Amazon-Advertising-API-Scope` (= profile_id) headers.
5. **Server-side timezone**: Amazon returns data in profile's reporting timezone, NOT UTC. Indian profile = IST, US profile = PST.

## Code patterns

### Get authenticated headers for a workspace
```ts
const access_token = await tokenManager.getAccessToken(workspace_id, profile_id);
const headers = {
  Authorization: `Bearer ${access_token}`,
  "Amazon-Advertising-API-ClientId": process.env.AMAZON_ADS_CLIENT_ID!,
  "Amazon-Advertising-API-Scope": profile_id,
};
```

### Submit + poll a report (Python scheduler)
```python
report_id = self._submit_report(...)
download_url = self._poll_report(report_id, timeout=1200)  # 20 min max
data = self._download_report(download_url)
self._upsert_to_db(data)
```

## Marketplace IDs reference

| Country | Marketplace ID | Currency |
|---|---|---|
| US | `ATVPDKIKX0DER` | USD |
| India | `A21TJRUUN4KGV` | INR |
| UK | `A1F83G8C2ARO7P` | GBP |
| Germany | `A1PA6795UKMFR9` | EUR |
| Canada | `A2EUQ1WTGCTBG2` | CAD |
| Mexico | `A1AM78C64UM0Y8` | MXN |
| Japan | `A1VC38T7YXB528` | JPY |

## When to ask the user vs proceed

- **Proceed**: pulling data, displaying it, computing aggregations
- **Ask first**: changing campaign status, modifying budgets, creating/deleting keywords (these affect their real ad spend)

## Useful Amazon docs

- API reference: https://advertising.amazon.com/API/docs/
- Reporting API v3: https://advertising.amazon.com/API/docs/en-us/reporting/v3
- OAuth flow: https://advertising.amazon.com/API/docs/en-us/getting-started/sign-up
