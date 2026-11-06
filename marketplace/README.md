# DZ Exchange — Algerian marketplace

The original marketplace, rebuilt around PostgreSQL/Drizzle services and the Next.js App Router. Interface languages: Arabic (RTL), English and French (LTR).

## Run locally

Requires Node 22.12+ and PostgreSQL 16+ (tested locally with PostgreSQL 18.6).

```bash
npm ci
cp .env.example .env.local
# Set DATABASE_MIGRATION_URL to the owner connection string.
# Set independent DB_RUNTIME_PASSWORD and DB_WORKER_PASSWORD (24+ characters).
npm run db:migrate
npm run db:seed
npm run push:keys
# Set DATABASE_URL, PUSH_DATABASE_URL and APP_URL as documented in .env.example.
npm run dev
```

`db:migrate` creates two non-superuser, non-BYPASSRLS login roles, applies the versioned schema, then applies `docs/rls-policies.sql`. The web runtime must use `DATABASE_URL`, never the migration owner. Run migrations as a deployment step, not inside a web request.

For an explicitly labeled development preview only, set `DEMO_MODE=true` and run `npm run db:seed:demo`. The preview accounts are `seller@preview.invalid` and `buyer@preview.invalid`; the fixture password is `Preview-Only-2026!`. Demo login is disabled when `NODE_ENV=production`, regardless of `DEMO_MODE`. Never seed fixtures into a live marketplace.

## Vercel import

1. Push this repository and import `bezzagabdou-source/Absorbs` into a **new** Vercel project.
2. Set **Root Directory = `marketplace`**, Framework = Next.js, Node = 22.x. Leave the output directory at the Next.js default. The included `marketplace/vercel.json` selects the framework and build command.
3. Provision an external PostgreSQL database reachable from Vercel with TLS. Vercel does not host the sandbox's embedded PostgreSQL. Run `npm run db:migrate` and `npm run db:seed` once from a trusted migration machine against that database. Do not run the demo seed.
4. Set the variables in `.env.example` in Vercel. `APP_URL` must exactly match the canonical HTTPS origin. Generate a separate VAPID pair for deployment. Never upload `.env.local`.
5. Deploy. Confirm `/api/health`, registration/login, listing creation, offers and seller analytics against the deployed database.
6. Run `npm run push:worker` as a persistent **external worker** (container/VM), with `PUSH_DATABASE_URL` and VAPID variables. A Vercel web deployment alone does not run this worker or deliver queued push notifications. Use a process supervisor and one or more workers; jobs use `FOR UPDATE SKIP LOCKED`.

The worker uses at-least-once delivery and a stable notification tag. Provider calls happen outside database transactions. Transient errors back off; 404/410 subscriptions are removed; only explicitly allowed push-provider hosts are contacted. Test actual browser delivery on the deployed HTTPS origin before enabling it for users.

## Verification

```bash
npm run check                 # types, lint, 24 unit tests, production build
npm run test:db               # 25 PostgreSQL/RLS/worker integration checks
npx playwright install chromium
npm run test:e2e              # 7 browser tests against a running, seeded dev server
npm audit
```

For a CI image without browser system libraries, the optional `@sparticuz/chromium` test path is available with `E2E_SERVERLESS_CHROMIUM=true npm run test:e2e`. It is a test-only dependency, not part of the web runtime. Database tests create temporary accounts and clean them up; use a test database, not live data. Push integration checks use an injected provider adapter and do not claim external delivery.

## Architecture

- `src/app/api`: thin HTTP routes; shared authentication, roles, origin checks, rate limits, bounded JSON and Zod validation.
- `src/features`: catalog, offers, dashboard, notifications and chat data/business services.
- `src/db`: schema and transaction-local actor identity; no hardcoded product catalog in application queries.
- `docs/rls-policies.sql`: forced RLS, least-privilege grants, immutable offer fields, transactional notification outbox and session RPCs.
- `src/lib/i18n`: parity-tested AR/EN/FR dictionaries; immediate locale/direction changes and persistent preference.
- `src/components/marketplace`: responsive catalog, filters, bargaining, seller charts, settings and chat.
- `src/sw.ts` → `public/sw.js`: validated push payloads, safe same-origin destinations and public-listing offline fallback. Build with `npm run build:sw`.

## Operational boundaries

This is a verified development implementation, **not a claim of production security certification**. Payment/escrow processing, independent seller verification, email verification/identity recovery, image object storage and moderation are not connected. The UI explicitly labels those boundaries; it does not simulate charges or verification. Connect and assess those services before a public launch. Demo photographs are remote fixtures; replace them with your own licensed, stored assets.

Set `TRUST_PROXY_HEADERS=true` only when the ingress proxy overwrites `x-real-ip`; otherwise anonymous requests share a conservative rate-limit bucket. Configure proxy limits, backups, monitoring, log retention, abuse controls and a UTF-8 PostgreSQL database. Review CSP, CORS, push-provider hosts and database TLS for your deployment. The development-only `*.e2b.app` preview allowance is never enabled in production.
