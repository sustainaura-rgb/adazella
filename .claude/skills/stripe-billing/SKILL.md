---
name: stripe-billing
description: Stripe subscription billing patterns — Checkout, Customer Portal, webhooks, India tax (GST), tier-based feature gating. Use when building paid plans, adding billing pages, or processing Stripe webhooks.
---

# Stripe Billing for Adazella

## Account setup

- Use **Stripe India** (stripe.com/in) — registered to Sustainaura LLC
- KYC requires PAN, GST cert, bank details (3-5 day verification)
- Currencies: USD + INR (Stripe auto-handles based on customer country)
- Tax: enable Stripe Tax ($40/mo) for India GST compliance

## Subscription tiers

| Tier | Stripe Product ID | Price (USD) | Price (INR) | Features |
|---|---|---|---|---|
| Starter | `prod_starter` | $9 → $29 | ₹749 → ₹2400 | Basic dashboard, 1 Amazon account |
| Pro | `prod_pro` | $29 → $49 | ₹2400 → ₹4000 | + AI insights, multi-marketplace, CSV export |
| Business | `prod_business` | $79 → $99 | ₹6400 → ₹8000 | + Keepa, Rainforest, priority support |

Beta pricing (lower) for first 50 customers, then regular.

## Architecture pattern

```
Frontend (PricingPage) → calls /api/billing/checkout-session
  ↓ returns Stripe-hosted checkout URL
Stripe Checkout → user pays → redirect back with ?success=1
  ↓ async webhook
/api/billing/webhook (Stripe POST) → updates `subscriptions` table → unlocks tier
```

## Required env vars

```
STRIPE_SECRET_KEY=sk_test_... (or sk_live_... in prod)
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PUBLISHABLE_KEY=pk_test_... (frontend uses this)
```

Store all in AWS Secrets Manager (post-AWS migration), env vars (now).

## DB schema needed (migration 004)

```sql
CREATE TABLE subscriptions (
    id BIGSERIAL PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id),
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    tier TEXT NOT NULL,        -- 'starter', 'pro', 'business'
    status TEXT NOT NULL,      -- 'active', 'past_due', 'canceled'
    current_period_end TIMESTAMPTZ,
    canceled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE workspaces ADD COLUMN stripe_customer_id TEXT;
ALTER TABLE workspaces ADD COLUMN tier TEXT DEFAULT 'free';
```

## Webhook events to handle

Critical (must implement):
- `checkout.session.completed` → activate subscription
- `customer.subscription.updated` → handle plan changes
- `customer.subscription.deleted` → downgrade to free
- `invoice.payment_failed` → email user, retry
- `invoice.payment_succeeded` → log audit event

Less critical:
- `customer.created` — store customer_id
- `customer.subscription.trial_will_end` — send "trial ending" email

## Webhook idempotency (CRITICAL)

Stripe retries webhooks. Each event has unique `id` like `evt_1234`. Store processed event IDs to skip duplicates:

```ts
const eventId = req.body.id;
const seen = await checkIfEventProcessed(eventId);
if (seen) return res.status(200).send("ok"); // already processed
// ... process event ...
await markEventProcessed(eventId);
```

## Tier-based feature gating

API middleware:
```ts
function requireTier(minTier: 'starter' | 'pro' | 'business') {
  return async (req, res, next) => {
    const tier = await getWorkspaceTier(req.workspaceId);
    if (!hasAccess(tier, minTier)) {
      return res.status(403).json({ error: 'Upgrade required', requiresTier: minTier });
    }
    next();
  };
}

// Usage:
campaignsRouter.post('/bulk-update', requireTier('pro'), bulkUpdateHandler);
```

Frontend:
```tsx
if (user.tier === 'free' || user.tier === 'starter') {
  return <UpgradePrompt requiredTier="pro" feature="Bulk Edit" />;
}
return <BulkEditUI />;
```

## India GST handling

If customer is in India:
- Add 18% GST on subscription
- Show GST as separate line item on invoice
- Stripe Tax handles automatically once configured
- File quarterly returns (your accountant)

If customer is outside India:
- No GST
- Stripe handles VAT for EU customers automatically

## Test cards

```
Success:        4242 4242 4242 4242
Decline:        4000 0000 0000 0002
Auth required:  4000 0025 0000 3155
India card:     4000 0035 6000 0008 (RuPay)
```

CVC: any 3 digits, expiry: any future date.

## Stripe docs

- Checkout: https://stripe.com/docs/payments/checkout
- Subscriptions: https://stripe.com/docs/billing/subscriptions/overview
- Webhooks: https://stripe.com/docs/webhooks
- India: https://stripe.com/docs/india
- Customer Portal: https://stripe.com/docs/billing/subscriptions/customer-portal
