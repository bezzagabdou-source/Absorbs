/**
 * Firebase web config — safe to expose (client SDK keys are public by design).
 * Override any value in Vercel via NEXT_PUBLIC_FIREBASE_* env vars.
 * Kept free of firebase imports so the server can read the project id too.
 */
/**
 * Optional same-domain auth handler (set NEXT_PUBLIC_FIREBASE_AUTH_PROXY=1).
 * Fixes Google redirect sign-in on Safari / iOS / Brave, which block the cross-site storage
 * Firebase needs when authDomain differs from the site. next.config.ts proxies /__/auth/* for it.
 * Remember to add https://YOUR-DOMAIN/__/auth/handler to the OAuth client's redirect URIs.
 */
const SAME_DOMAIN_AUTH = process.env.NEXT_PUBLIC_FIREBASE_AUTH_PROXY === "1" && typeof window !== "undefined";

export const firebaseConfig = {
  apiKey:
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY ??
    "AIzaSyDeja2hzGtRXafKzACUFFw-g3joWmlzGTU",
  authDomain:
    (SAME_DOMAIN_AUTH ? window.location.host : undefined) ??
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ??
    "mohtal-9b1d3.firebaseapp.com",
  databaseURL:
    process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL ??
    "https://mohtal-9b1d3-default-rtdb.firebaseio.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "mohtal-9b1d3",
  storageBucket:
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ??
    "mohtal-9b1d3.firebasestorage.app",
  messagingSenderId:
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "282432971728",
  appId:
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID ??
    "1:282432971728:web:70f11fd64bbb2ad34ecfd5",
  measurementId:
    process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID ?? "G-DX3XPKQ1WE",
};
