"use client";

/**
 * Browser-only Firebase loader for Google sign-in.
 *
 * The Firebase SDK is loaded lazily (dynamic import) and only when the
 * deployment actually provides a public Firebase web config, so the marketplace
 * keeps working — and stays lean — without Firebase. Every failure is reported
 * as a stable, translated error code instead of a raw SDK exception.
 */
export type GoogleConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  messagingSenderId?: string;
};

const CONFIG_KEY = ["NEXT_PUBLIC_FIREBASE_API_KEY", "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", "NEXT_PUBLIC_FIREBASE_PROJECT_ID", "NEXT_PUBLIC_FIREBASE_APP_ID"] as const;

function readConfig(): GoogleConfig | null {
  const values = CONFIG_KEY.map((key) => (process.env[key] ?? "").trim());
  const [apiKey, authDomain, projectId, appId] = values;
  if (!apiKey || !authDomain || !projectId || !appId) return null;
  if (!/^AIza[\w-]{20,}$/.test(apiKey) || !/^[a-z0-9-]{3,64}$/i.test(projectId)) return null;
  return { apiKey, authDomain, projectId, appId, messagingSenderId: (process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "").trim() || undefined };
}

export function googleEnabled(): boolean {
  return readConfig() !== null;
}

type FirebaseAuth = import("firebase/auth").Auth;

let authInstance: FirebaseAuth | null = null;

async function getFirebaseAuth(): Promise<FirebaseAuth> {
  if (authInstance) return authInstance;
  const config = readConfig();
  if (!config) throw Object.assign(new Error("google_not_configured"), { code: "google_not_configured" });
  const [{ initializeApp, getApps, getApp }, authModule] = await Promise.all([import("firebase/app"), import("firebase/auth")]);
  const app = getApps().length ? getApp() : initializeApp(config);
  authInstance = authModule.getAuth(app);
  try { await authModule.setPersistence(authInstance, authModule.browserLocalPersistence); } catch { /* private mode */ }
  return authInstance;
}

/**
 * Runs the Google sign-in flow and returns a Firebase ID token.
 * A popup is preferred; when the popup is blocked (Android WebView, Safari
 * in-app, strict browsers) the redirect flow is used instead.
 */
export async function signInWithGoogle(): Promise<{ idToken: string } | { redirecting: true }> {
  const auth = await getFirebaseAuth();
  const { GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult } = await import("firebase/auth");
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });

  // A previous full-page redirect may have completed while this page was loading.
  try {
    const redirected = await getRedirectResult(auth);
    if (redirected?.user) return { idToken: await redirected.user.getIdToken(true) };
  } catch { /* no pending redirect */ }

  try {
    const credential = await signInWithPopup(auth, provider);
    if (!credential?.user) throw Object.assign(new Error("google_failed"), { code: "google_failed" });
    return { idToken: await credential.user.getIdToken(true) };
  } catch (error) {
    const code = (error as { code?: string }).code ?? "";
    if (["auth/popup-blocked", "auth/operation-not-supported-in-this-environment", "auth/web-storage-unsupported"].includes(code)) {
      await signInWithRedirect(auth, provider);
      return { redirecting: true };
    }
    throw error;
  }
}

/** Maps a Firebase SDK error to a stable code the UI can translate. */
export function googleErrorCode(error: unknown): string {
  const code = (error as { code?: string })?.code ?? "";
  const message = (error as { message?: string })?.message ?? "";
  if (/^google_/.test(message)) return message;
  switch (code) {
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return "google_cancelled";
    case "auth/network-request-failed":
      return "service_unavailable";
    case "auth/too-many-requests":
      return "rate_limited";
    case "auth/unauthorized-domain":
    case "auth/invalid-api-key":
    case "auth/operation-not-allowed":
    case "auth/configuration-not-found":
      return "google_not_configured";
    case "auth/account-exists-with-different-credential":
      return "google_account_conflict";
    default:
      return "google_failed";
  }
}
