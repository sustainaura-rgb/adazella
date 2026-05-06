#!/usr/bin/env bash
# Reference: test Stripe webhook locally using stripe CLI.
#
# Prerequisites:
#   - Install stripe CLI: https://stripe.com/docs/stripe-cli
#   - Login: stripe login
#
# Usage: bash .claude/skills/stripe-billing/scripts/test-webhook.sh

set -e

API_URL="${API_URL:-http://localhost:3000}"

# Forward Stripe events to local webhook handler
echo "Listening for Stripe events on $API_URL/api/billing/webhook..."
echo "(Run this in one terminal, then trigger events in another with: stripe trigger checkout.session.completed)"
echo ""

stripe listen --forward-to "$API_URL/api/billing/webhook"
