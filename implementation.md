# Implementation Guide (Security)

This document is the living checklist for security posture and recurring actions.

## Core Principles

- Minimize PII exposure (responses, logs, analytics).
- Verify payment events server-to-server before state changes.
- Keep dependencies patched and audited.
- Use the least-privileged access for tokens and secrets.

## Current Baseline (Must Stay True)

- OpenPix webhook must verify charge status with the OpenPix API before marking a transaction as succeeded.
- Affiliate dashboard must not expose lead PII (name, WhatsApp, email, IP, user agent, tracking ID).
- Referral access tokens must be sent via Authorization header on API calls.
- Admin credentials and secrets must never be logged.

## Recurring Checklist (Monthly)

1. Dependency audit (backend):
   - Run `npm audit` in `backend`.
   - Update `next` and `jsonwebtoken` when fixes are available.
   - Keep overrides for `qs` and `jws` at secure versions.
2. Webhook verification:
   - Confirm OpenPix verification still calls the API and checks status/value.
   - Confirm Stripe webhook signature is validated with `STRIPE_WEBHOOK_SECRET`.
3. PII hygiene:
   - Verify `/api/referral/stats` and `/api/referral/update-pix` do not return lead PII.
   - Confirm logs do not include names, emails, phone numbers, or tokens.

## Operational Checks (Before Deploy)

- `DATABASE_URL` points to the correct database.
- `OPENPIX_APP_ID`, `STRIPE_SECRET_KEY`, and `STRIPE_WEBHOOK_SECRET` are set.
- `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH` are set.
- Run `npx prisma migrate deploy` for backend changes.

## Backlog / Future Improvements

- Move referral dashboard token from URL to short-lived session storage or a login flow.
- Introduce Redis (or similar) for rate limiting in production.
- Add IP allowlist or signature verification for OpenPix if available.
- Add log redaction at the platform level (Vercel/hosted logs).

