import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  setPersistence,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  type Auth,
} from "firebase/auth";

import { firebaseConfig } from "@/lib/firebase-config";

export { firebaseConfig };

let app: FirebaseApp;
let authInstance: Auth;

if (getApps().length === 0) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApp();
}
authInstance = getAuth(app);

// Keep the user signed in on this device until they explicitly sign out.
if (typeof window !== "undefined") {
  setPersistence(authInstance, indexedDBLocalPersistence).catch(() =>
    setPersistence(authInstance, browserLocalPersistence).catch(() => undefined)
  );
}

/*
 * Optional Firebase services — browser only, lazy-loaded, each one fails silently
 * (never crashes SSR, private mode or unsupported browsers).
 */
type AnalyticsApi = typeof import("firebase/analytics");
let analyticsMod: AnalyticsApi | null = null;
let analyticsInst: import("firebase/analytics").Analytics | null = null;

if (typeof window !== "undefined") {
  // 1) App Check (anti-abuse for Firebase calls): only when a reCAPTCHA v3 site key is configured
  const siteKey = (process.env.NEXT_PUBLIC_FIREBASE_APPCHECK_KEY ?? "").trim();
  if (siteKey) {
    import("firebase/app-check")
      .then(({ initializeAppCheck, ReCaptchaV3Provider }) => {
        initializeAppCheck(app, { provider: new ReCaptchaV3Provider(siteKey), isTokenAutoRefreshEnabled: true });
      })
      .catch(() => undefined);
  }

  // 2) Analytics
  import("firebase/analytics")
    .then((mod) =>
      mod.isSupported().then((ok) => {
        if (!ok) return;
        analyticsMod = mod;
        analyticsInst = mod.getAnalytics(app);
      })
    )
    .catch(() => undefined);

  // 3) Performance Monitoring (page load, network timing)
  import("firebase/performance")
    .then(({ getPerformance }) => {
      getPerformance(app);
    })
    .catch(() => undefined);
}

/** Sends a custom Analytics event (no personal data, no prompts). Safe to call anywhere. */
export function trackEvent(name: string, params?: Record<string, string | number | boolean>): void {
  try {
    if (analyticsMod && analyticsInst) analyticsMod.logEvent(analyticsInst, name, params);
  } catch {
    /* analytics is optional */
  }
}

/**
 * Remote Config: change values from the Firebase console without redeploying
 * (for example `announcement`, `image_edit_enabled`). Defaults apply when offline.
 */
export const REMOTE_DEFAULTS = {
  announcement: "",
  image_edit_enabled: true,
  maintenance: false,
} as const;
export type RemoteKey = keyof typeof REMOTE_DEFAULTS;

let remoteCache: Record<string, string | boolean> | null = null;

export async function loadRemoteConfig(): Promise<Record<RemoteKey, string | boolean>> {
  const fallback = { ...REMOTE_DEFAULTS } as Record<RemoteKey, string | boolean>;
  if (typeof window === "undefined") return fallback;
  if (remoteCache) return { ...fallback, ...remoteCache } as Record<RemoteKey, string | boolean>;
  try {
    const { getRemoteConfig, fetchAndActivate, getValue } = await import("firebase/remote-config");
    const rc = getRemoteConfig(app);
    rc.settings.minimumFetchIntervalMillis = 60 * 60 * 1000;
    rc.defaultConfig = { ...REMOTE_DEFAULTS };
    await fetchAndActivate(rc).catch(() => false);
    const out: Record<string, string | boolean> = {};
    for (const k of Object.keys(REMOTE_DEFAULTS) as RemoteKey[]) {
      const v = getValue(rc, k);
      out[k] = typeof REMOTE_DEFAULTS[k] === "boolean" ? v.asBoolean() : v.asString();
    }
    remoteCache = out;
    return { ...fallback, ...out } as Record<RemoteKey, string | boolean>;
  } catch {
    return fallback;
  }
}

export const firebaseApp = app;
export const auth = authInstance;
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });
