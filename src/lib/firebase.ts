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

// Optional analytics — browser only, never crashes SSR or unsupported envs.
if (typeof window !== "undefined") {
  import("firebase/analytics")
    .then(({ getAnalytics, isSupported }) =>
      isSupported().then((ok) => {
        if (ok) getAnalytics(app);
      })
    )
    .catch(() => undefined);
}

export const firebaseApp = app;
export const auth = authInstance;
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });
