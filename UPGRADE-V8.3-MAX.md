# Barq v8.3 — MAX fix

- src/lib/max-engine.ts: new strict MAX contract (huge size floor, deep game systems, zero-error rules, no draft merging, MAX DESIGN LAW = modern UI/UX, never flat black). MAX_STUDIO_ADDON for the Studio mega builder.
- src/app/api/ai/chat/route.ts: MAX build = ONE strongest engine writes everything (no ensemble merge), 64k tokens, 30 auto-continue rounds.
- src/lib/prompts.ts: removed the "dark + neon by default" rules (game + site specs) -> modern colour-rich UI/UX.
- src/components/app/chat.tsx: model row (برق 5 / 6 / 8 / MAX) is its own full-width row — nothing is clipped, MAX is orange and always visible. Big code is hidden: "thinking" progress while it builds, then a result card (open / download / show code). Live preview still opens automatically.
- Theme: orange + white background with black text is now the default (storage key barq_theme_v2; dark stays available in the toggle).
- Voice call: picks the most natural installed voice (Google / Neural / Online), shorter breaths, first clause spoken at once, human phone-style prompt (fast, dialect-matched, no markdown).

Run: npm install && npm run typecheck && npm run dev

## v8.4 — security + extras
- server-auth.ts: email_verified + sign-in provider now read from the SIGNED Firebase token (the client can no longer fake "verified"); /api/user/sync is rate-limited and keeps users.email_verified in sync.
- Passwords are NEVER stored in our database (Firebase keeps a salted hash). The DB stores email, name, verified flag, provider and login history.
- Signup: 8+ characters with letters and digits, e-mail lower-cased; verification e-mail + reset e-mail return the user to /app.
- New VerifyEmailBanner (resend with 60 s cooldown, auto-detects the click) shown inside the app until the e-mail is verified.
- New page /app/settings/security: verification status, resend, change password (reset e-mail), last sign-ins (/api/user/security), sign out.
- 4 new MAX starters (survival 3D, city builder, space shooter, learning platform). Service-worker cache bumped so everyone gets the new build.
- NOTE: Firebase sends a verification LINK, not a numeric code. A real 6-digit OTP needs your own e-mail sender (Resend/SendGrid).
- Firebase console: Authentication > Templates (set language/sender) and Settings > Authorized domains (add your Vercel domain).

## Vercel build failed with "module-not-found"?
- Replace the WHOLE project (package.json included), not only src/. The app needs: katex, rehype-katex, remark-math, rehype-highlight, framer-motion, react-markdown, remark-gfm.
- Delete the old package-lock.json / node_modules from the repo so Vercel installs from this package.json.
- If it still fails: Vercel -> Deployment -> Build Logs -> search "Module not found" and read the FIRST error (the stack lines at the bottom are only import traces).
