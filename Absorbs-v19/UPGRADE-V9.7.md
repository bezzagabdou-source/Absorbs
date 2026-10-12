# Nexus AI v9.7 — ready to publish

## New
- scripts/preflight.mjs + `npm run preflight`: checks files, manifest, icons, privacy page, env keys (FAIL = blocks publishing, WARN = optional)
- public/.well-known/assetlinks.json: template for Google Play (package com.nexusai.dz); paste the SHA-256 from PWABuilder
- /api/health now also lists which engines have a key (Gemini, Grok, OpenRouter, Hugging Face, Claude, DeepSeek, Groq) — names only, never values
- Security headers on all pages (nosniff, HSTS, X-Frame-Options SAMEORIGIN, Referrer-Policy, Permissions-Policy with microphone/camera for voice call). No CSP on purpose.
- Service-worker cache nexus-v9-7-publish

## Publish steps
1. npm install, npm run typecheck, npm run preflight
2. Deploy on Vercel with env vars, open /api/health (ok:true, enginesOn >= 3)
3. Follow STORE-PUBLISHING.md (PWABuilder -> AAB/APK -> assetlinks.json SHA-256 -> redeploy)
