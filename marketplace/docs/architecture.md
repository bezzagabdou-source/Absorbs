# DZ Exchange · Architecture & delivery specification

## 1. What this repository delivers

This is a working marketplace foundation and UI, not a claim that an unconfigured third-party payment network, KYC vendor, or real-time messaging service is already live. The app implements the App Router screens, listing reads, a relational Drizzle schema, a signed-session verification boundary for protected offer/push writes, a service worker, IndexedDB listing cache, local UI preferences, and explicit provider-gated flows.

The prepared repository currently runs Next.js 16. The route structure, server components, promised `params` / `searchParams`, and React APIs used here are compatible with Next.js 15; the project intentionally stays on the installed baseline instead of making an unrelated framework downgrade. Tailwind CSS v4 is already configured. Motion is provided by `framer-motion`; the interface uses bespoke accessible primitives instead of importing a generated shadcn component tree.

## 2. Project tree

```text
.
├── docs/
│   ├── architecture.md
│   └── rls-policies.sql              # reviewed policy template; apply only with identity context
├── public/
│   ├── icons/icon.svg
│   └── sw.js                         # deployed service worker
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── health/route.ts
│   │   │   ├── listings/route.ts     # Drizzle-backed, public active listing query
│   │   │   ├── offers/route.ts       # signed-session gated insert
│   │   │   └── push/subscriptions/route.ts
│   │   ├── chat/page.tsx
│   │   ├── dashboard/page.tsx
│   │   ├── explore/page.tsx
│   │   ├── offline/page.tsx
│   │   ├── product/[id]/page.tsx
│   │   ├── settings/page.tsx
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   ├── manifest.ts
│   │   └── page.tsx
│   ├── components/marketplace/
│   │   ├── BargainEscrowModal.tsx
│   │   ├── ChatWorkspace.tsx
│   │   ├── DashboardPage.tsx
│   │   ├── ExploreClient.tsx
│   │   ├── HomeMarketplace.tsx
│   │   ├── Icon.tsx
│   │   ├── MarketplaceHeader.tsx
│   │   ├── MarketplaceShell.tsx
│   │   ├── MobileDock.tsx
│   │   ├── ProductCard.tsx
│   │   ├── ProductDetails.tsx
│   │   ├── SettingsPage.tsx
│   │   └── marketplace-provider.tsx
│   ├── db/
│   │   ├── index.ts
│   │   ├── schema.ts
│   │   └── seed-reference-data.ts
│   ├── lib/
│   │   ├── auth/session.ts           # verifies upstream HMAC session; does not issue credentials
│   │   ├── marketplace-data.ts       # fallback content and formatting
│   │   ├── marketplace-db.ts         # safe UUID product reader
│   │   ├── marketplace-ui.ts         # shared icon-name types
│   │   ├── offline-db.ts             # Dexie v2 public listing cache
│   │   ├── search/algolia.ts         # server-only Algolia adapter with Arabic normalization
│   │   └── wilayas.ts                # reference list (01–58)
│   └── sw.ts                         # typed worker source mirrored to public/sw.js
├── .env.example
├── drizzle.config.json
└── README.md
```

## 3. Request, render and state flow

### Rendering

- The root layout owns metadata, the shared navigation, the mobile dock and the toast viewport.
- Home and route shells render on the server. Interactive islands are client components with narrow responsibilities.
- Product detail looks up a database product only when `id` is a UUID, then falls back to a matching preview listing. Invalid database UUIDs are never passed to PostgreSQL.
- Explore debounces live input and calls `GET /api/listings`; when Algolia credentials/index are configured, the server adapter searches the Algolia DSN with a search-only key and Arabic normalization. Without it, the endpoint uses Drizzle `ILIKE`. Successful rows are cached with Dexie; sample rows keep first-run previews populated.
- The service worker uses network-first navigation for public routes, an offline page fallback, and cache-first/stale-refresh static resources. It never caches API responses, dashboard routes, payment pages, or arbitrary authenticated navigation.

### Client state

`MarketplaceProvider` owns cross-route presentation state: favorite IDs, theme (`light`, `dark`, `amoled`), display language, install prompt, and transient toasts. Preferences are stored in localStorage and are presentation conveniences, not authorization data. Dexie (`dz-exchange-offline`, version 2) stores cached listing objects and the optional outbox object store. Chat sample messages and seller settings shown in the preview are local-only until a provider-backed session/realtime adapter is configured.

A recommended production expansion is TanStack Query for server-state invalidation and a typed state machine for checkout/escrow; neither should be used to duplicate payment state or trust decisions in the browser.

## 4. PostgreSQL / Drizzle data model

The source of truth is `src/db/schema.ts`:

| Entity | Purpose | Key controls |
| --- | --- | --- |
| `users` | Buyer, seller, support and admin profiles | unique email/phone, active flag, `trust_tier`, verification timestamp |
| `wilayas` | Official 01–58 regional index | unique two-digit code, French/English/Arabic names, optional centroid |
| `categories` | Localized category tree | unique slug, optional parent UUID, sort order |
| `products` | Marketplace listing | seller/category/wilaya FK, DZD numeric amount, condition/status enums, JSON images/attributes, location, escrow/delivery eligibility |
| `offers` | Buyer/seller bargaining history | product/buyer/seller FKs, numeric DZD amount, lifecycle enum, expiry |
| `escrow_transactions` | Payment and delivery-release ledger | restricted product/user FKs, provider references, state enum, hashed delivery OTP only |
| `disputes` | Evidence and resolution record | escrow FK, opener, status, JSON evidence URLs, resolution timestamp |
| `conversations` / `messages` | Durable messaging model | participant IDs, chronological index, message type and metadata |
| `price_history` | Listing price snapshots | time-series index by product |
| `push_subscriptions` | Web Push endpoints | unique endpoint, user FK, public subscription keys, updated timestamp |

Money is `numeric(14,2)` in the database and normalized to DZD; do not use JavaScript floating-point arithmetic for ledger posting. Production payment flows should use integer centimes or a rigorously defined fixed-decimal domain object at boundaries, idempotency keys, and an append-only ledger. No table mutation by itself releases or reserves real funds. Use migrations for every production schema change; `drizzle-kit push` is intended for the fresh sandbox/bootstrap workflow. `src/db/seed-reference-data.ts` is idempotent.

The existing pool reads `DATABASE_URL`; use Neon’s pooled connection string in serverless production and set `DB_POOL_MAX` intentionally. Keep DB access server-only. Read replicas are for non-authoritative listing/analytics reads; transaction transitions, escrow state, uniqueness checks and idempotency must use the primary.

### RLS rollout

`docs/rls-policies.sql` contains a reviewed PostgreSQL policy template. Policies are not enabled by this starter because the current sandbox uses a trusted server-side `pg` role and no identity provider has been configured. Before enabling RLS, set request identity transaction-locally from a verified session (`SET LOCAL app.user_id`, `app.role`), use a least-privilege runtime role, and test all joins under RLS. Never trust user IDs supplied in JSON. For Supabase Auth, map verified `auth.uid()` claims to the policies rather than accepting arbitrary custom GUC values from clients.

## 5. Security contracts and implementation boundary

### Signed identity session

`src/lib/auth/session.ts` verifies a compact `base64url(JSON claims).base64url(HMAC-SHA256)` token from the `HttpOnly`, `Secure`, `SameSite=Lax/Strict` cookie named `dz_session`. The HMAC secret is `DZ_SESSION_SECRET` and must be at least 32 bytes. Claims are `{ sub: UUID, role, iat, exp }`; expiry and UUID shape are checked using constant-time signature comparison. `POST /api/offers` and push-subscription writes require this verified subject and verify that the user is active. No endpoint in this repository issues sessions, resets passwords, performs OTP, or upgrades account roles. Connect NextAuth/Auth.js or Supabase Auth as the issuer; use short-lived access/refresh rotation and CSRF-safe cookies at that boundary.

The offer and push-subscription mutation routes enforce a same-origin `Origin` header and a signed session. Before public launch, add per-user/IP rate limiting (Upstash Redis), defense-in-depth CSRF tokens where needed, audit events, abuse monitoring, idempotency keys, content validation and request-size limits. `requireSession` is authorization plumbing, not a replacement for a full auth system.

### Trust, offers, escrow and disputes

- Trust tiers are moderator/KYC-controlled server data. Never infer verification from a client flag.
- The offer API is the only active protected write in this foundation. A real listing must exist in PostgreSQL and buyer/seller IDs come from the signed session/product, not form fields.
- Escrow screens disclose that payment is inactive. To activate: contract with an eligible Algerian payment provider; verify server-to-server webhooks and signatures; store provider references; enforce an explicit state machine; use row locks/serializable transitions and idempotency keys; expire/reconcile holds; and complete a legal/compliance review. A browser callback or delivery OTP alone cannot release funds.
- Store only a salted/peppered hash of a single-use delivery OTP, rate-limit verification attempts, bind it to a transaction and short expiry, and verify it server-side. Avoid storing full card data; use provider tokenization/hosted checkout.
- KYC document uploads must be direct-to-private object storage with short-lived signed URLs, malware scanning, retention/deletion policy, encryption and strict staff access. The settings file picker currently selects locally and deliberately does not upload/claim verification.

## 6. PWA, offline and hardware

`src/app/manifest.ts` emits the install manifest. `MarketplaceProvider` registers `/sw.js` and handles the install prompt. The custom worker source is in `src/sw.ts`, with the deployed classic worker in `public/sw.js`; keep them in sync. It precaches public entry routes, caches only same-origin static resources, uses a safe offline fallback, displays push payloads, validates notification destinations to same-origin, and processes the `dz-exchange-outbox` tag. The outbox is intentionally not auto-populated by an authenticated transaction flow. Only queue idempotent, non-sensitive drafts after a consented UX; do not queue payments, OTPs or KYC data.

`@ducanh2912/next-pwa` is documented as a possible build integration, but is not wrapping the authoritative worker in this checkout: it emits its own Workbox worker and can collide with `public/sw.js`/Turbopack. If adopted, pin and test the compatible build mode, set a distinct worker filename/custom-worker strategy, and verify the emitted artifact. Dexie is used for cached listings; no personal/payment response is cached.

Browser hooks in the UI: `beforeinstallprompt`, Push API permission/subscription, Geolocation and MediaRecorder. GPS, audio and photo/media data are sensitive; request permissions only after a user gesture, do not silently persist them, and disclose sharing scope. Push subscription registration requires a VAPID public key and authenticated account. Browser support for Background Sync is not universal (notably Safari); provide explicit retry UX.

## 7. Search, AI, media, shipping and scale adapters

Recommended boundaries (never call secret-bearing providers from client components):

| Concern | Server adapter | Required safeguards |
| --- | --- | --- |
| Instant search | Implemented Algolia REST adapter in `src/lib/search/algolia.ts`; Drizzle `ILIKE` is fallback | Configure a search-only key and `ALGOLIA_PRODUCTS_INDEX`; index public active products only, mark filter attributes (including `status`) filterable, enable Arabic/French language settings and Darja synonyms, keep PII out, and update records asynchronously |
| Price help / fraud triage | Gemini server route or queue consumer | schema-constrained output, human review, safety/PII filtering, prompt-injection controls, no autonomous fraud sanctions |
| Image similarity / watermark | private R2/S3 upload pipeline + image worker | MIME sniffing, AV scan, EXIF removal, bounded dimensions, content hash, signed upload and signed delivery URLs |
| Payments / escrow | provider adapter + signed webhook handler | PCI boundary, webhook replay protection, ledger, reconciliation, audit |
| Wilaya shipping | normalized carrier quote adapter | provider-specific credentials, server-calculated rates, clear delivery liability and tracking verification |
| Realtime chat | Supabase Realtime or Socket.IO service | authenticated channels, participant ACL on every subscription/publish, retention and abuse throttles |
| SMS OTP | licensed local gateway adapter | consent, cost/rate controls, anti-enumeration, no OTP logging |
| Maps | Leaflet/Mapbox adapter | location minimization, opt-in, geofence correctness, community-verified safe locations |

For scale: partition message/price history by time only when justified; keep product search index asynchronously updated with an outbox; use CDN image variants (AVIF/WebP) and signed uploads; apply per-user quotas; separate primary writes from regional read replicas; monitor query plans, pool saturation, queue lag and provider webhook age. Do not claim 58-wilaya delivery coverage until carrier matrices are contractual and refreshed.

## 8. Environment and release checklist

`.env.example` lists variable names only. Production secrets remain server-side. Minimum activation order:

1. Managed identity (Auth.js/Supabase), MFA/passkey ceremony, session issuer and account recovery.
2. Runtime DB role + RLS policies + migrations + seeded/verified wilaya/category rows.
3. Per-route rate limits, CSRF/Origin enforcement, audit trail, content policy and abuse response.
4. Private media uploads, image validation/transform pipeline and moderation queue.
5. Payment provider contracts, signed webhooks, ledger/idempotency/reconciliation, then escrow UX.
6. Carrier adapters and delivery confirmation state machine.
7. Push VAPID sender, search adapter, AI review queue, realtime chat and operational dashboards.
8. Penetration test, threat model, accessibility/mobile/network testing, backup/restore and incident runbooks.

Never market the current preview as a “zero-scam guarantee.” It is an implementation foundation with explicit, testable integration seams.
