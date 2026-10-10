"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut as fbSignOut,
  updateProfile,
  sendEmailVerification,
  sendPasswordResetEmail,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  getAdditionalUserInfo,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  type ConfirmationResult,
  type User,
} from "firebase/auth";
import { auth, googleProvider } from "@/lib/firebase";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  signInEmail: (email: string, password: string) => Promise<void>;
  signUpEmail: (name: string, email: string, password: string) => Promise<void>;
  signInGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  /** sends (or re-sends) the Firebase verification e-mail; throws code auth/too-many-requests when throttled */
  sendVerification: () => Promise<void>;
  /** reloads the Firebase user and returns the fresh emailVerified flag */
  refreshVerified: () => Promise<boolean>;
  sendReset: (email: string) => Promise<void>;
  /** v14: change the password in-app (requires the current one) */
  changePassword: (current: string, next: string) => Promise<void>;
  /** fetch() wrapper that attaches a fresh Firebase ID token */
  authFetch: (input: string, init?: RequestInit) => Promise<Response>;
  /** v18: sends an SMS code. `containerId` = id of an empty div used by the invisible reCAPTCHA */
  startPhoneSignIn: (e164: string, containerId: string) => Promise<ConfirmationResult>;
  /** v18: checks the SMS code and signs the user in */
  confirmPhoneCode: (confirmation: ConfirmationResult, code: string) => Promise<void>;
  /** v18: drops the reCAPTCHA widget (call when leaving the phone step) */
  resetPhoneVerifier: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/** Where the e-mail link brings the user back to. */
function actionSettings() {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return origin ? { url: `${origin}/app`, handleCodeInApp: false } : undefined;
}

/** Firebase rejects the e-mail when our domain is not in "Authorized domains": retry without the continue URL so the mail still goes out. */
async function mailWithFallback(send: (s?: { url: string; handleCodeInApp: boolean }) => Promise<void>) {
  try {
    await send(actionSettings());
  } catch (e) {
    const code = (e as { code?: string }).code ?? "";
    if (/continue-uri|unauthorized-domain/.test(code)) await send(undefined);
    else throw e;
  }
}

/** Client-side password rules (Firebase enforces the 6-character floor; we ask for more). */
export function passwordProblem(pw: string): "short" | "weak" | null {
  if (pw.length < 8) return "short";
  if (!/[A-Za-z\u0600-\u06FF]/.test(pw) || !/\d/.test(pw)) return "weak";
  return null;
}

/** True inside Facebook / Instagram / TikTok / Line / Android WebView — Google blocks sign-in there. */
function isEmbeddedBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return /FBAN|FBAV|FB_IAB|Instagram|TikTok|musical_ly|Line\/|Snapchat|; wv\)|MicroMessenger/i.test(navigator.userAgent);
}

/**
 * Records the profile + login event on the server. Callers do NOT await it: the user is
 * already signed in on the client, so the app opens immediately and the sync finishes in the background.
 */
async function syncUser(u: User, event?: "login" | "signup", provider?: string) {
  try {
    const token = await u.getIdToken();
    await fetch("/api/user/sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        email: u.email,
        displayName: u.displayName,
        photoUrl: u.photoURL,
        ...(event
          ? { event, provider: provider ?? "password", emailVerified: u.emailVerified }
          : {}),
      }),
    });
  } catch {
    // non-fatal: next request will retry sync
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [rev, setRev] = useState(0);

  useEffect(() => {
    // if Firebase never answers (blocked storage / network), stop the endless loader after 10 s
    const guard = setTimeout(() => setLoading(false), 10_000);
    const unsub = onAuthStateChanged(
      auth,
      async (u) => {
        clearTimeout(guard);
        setUser(u);
        setLoading(false);
        if (u) void syncUser(u);
      },
      () => {
        clearTimeout(guard);
        setLoading(false);
      }
    );
    return () => {
      clearTimeout(guard);
      unsub();
    };
  }, []);

  // Returning from a Google redirect (used on phones / when the popup is blocked)
  useEffect(() => {
    getRedirectResult(auth)
      .then((cred) => {
        if (!cred) return;
        const isNew = getAdditionalUserInfo(cred)?.isNewUser === true;
        void syncUser(cred.user, isNew ? "signup" : "login", "google");
      })
      .catch((e) => {
        console.warn("[auth] redirect sign-in failed:", (e as { code?: string })?.code ?? e);
      });
  }, []);

  const signInEmail = useCallback(async (email: string, password: string) => {
    const cred = await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
    void syncUser(cred.user, "login", "password");
  }, []);

  const signUpEmail = useCallback(
    async (name: string, email: string, password: string) => {
      const pw = passwordProblem(password);
      if (pw) throw Object.assign(new Error(pw), { code: "auth/weak-password" });
      const cred = await createUserWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
      if (name.trim()) {
        await updateProfile(cred.user, { displayName: name.trim() });
      }
      // a real verification e-mail (non-blocking: the account works immediately)
      mailWithFallback((s) => sendEmailVerification(cred.user, s)).catch(() => undefined);
      void syncUser(cred.user, "signup", "password");
    },
    []
  );

  const signInGoogle = useCallback(async () => {
    // Google refuses OAuth inside in-app browsers (Facebook, Instagram, TikTok…): say so instead of a blank popup
    if (isEmbeddedBrowser()) throw Object.assign(new Error("webview"), { code: "auth/webview" });
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      const isNew = getAdditionalUserInfo(cred)?.isNewUser === true;
      void syncUser(cred.user, isNew ? "signup" : "login", "google");
    } catch (e) {
      const code = (e as { code?: string }).code ?? "";
      // popup blocked / unsupported (iOS Safari, PWA, strict browsers): full-page redirect always works
      if (code === "auth/popup-blocked" || code === "auth/operation-not-supported-in-this-environment") {
        await signInWithRedirect(auth, googleProvider);
        return;
      }
      throw e;
    }
  }, []);

  /* v18 — phone sign-in (SMS code). Needs the Phone provider enabled in Firebase Authentication. */
  const verifierRef = useRef<RecaptchaVerifier | null>(null);

  const resetPhoneVerifier = useCallback(() => {
    try {
      verifierRef.current?.clear();
    } catch {
      /* already cleared */
    }
    verifierRef.current = null;
  }, []);

  const startPhoneSignIn = useCallback(
    async (e164: string, containerId: string) => {
      if (!verifierRef.current) {
        verifierRef.current = new RecaptchaVerifier(auth, containerId, { size: "invisible" });
        await verifierRef.current.render();
      }
      try {
        return await signInWithPhoneNumber(auth, e164, verifierRef.current);
      } catch (e) {
        // a failed reCAPTCHA must be rebuilt, otherwise every retry fails with the same error
        resetPhoneVerifier();
        throw e;
      }
    },
    [resetPhoneVerifier]
  );

  const confirmPhoneCode = useCallback(async (confirmation: ConfirmationResult, code: string) => {
    const cred = await confirmation.confirm(code.trim());
    const isNew = getAdditionalUserInfo(cred)?.isNewUser === true;
    void syncUser(cred.user, isNew ? "signup" : "login", "phone");
    resetPhoneVerifier();
  }, [resetPhoneVerifier]);

  const signOut = useCallback(async () => {
    await fbSignOut(auth);
  }, []);

  const sendVerification = useCallback(async () => {
    const u = auth.currentUser;
    if (!u) throw Object.assign(new Error("no user"), { code: "auth/user-not-found" });
    await mailWithFallback((s) => sendEmailVerification(u, s));
  }, []);

  const refreshVerified = useCallback(async () => {
    const u = auth.currentUser;
    if (!u) return false;
    await u.reload();
    if (u.emailVerified) {
      await u.getIdToken(true); // new token carries email_verified = true
      setRev((n) => n + 1); // same User object (reload mutates it): force consumers to re-render
      void syncUser(u);
    }
    return u.emailVerified;
  }, []);

  const sendReset = useCallback(async (email: string) => {
    await mailWithFallback((s) => sendPasswordResetEmail(auth, email.trim().toLowerCase(), s));
  }, []);

  /**
   * v14 — real in-app password change.
   * Firebase requires a fresh credential before updatePassword(), so we
   * re-authenticate first and translate its error codes into Arabic.
   */
  const changePassword = useCallback(async (current: string, next: string) => {
    const u = auth.currentUser;
    if (!u?.email) throw new Error("ما كاينش حساب مسجّل بالبريد.");
    if (next.length < 8) throw new Error("كلمة السر الجديدة لازم 8 حروف على الأقل.");
    if (next === current) throw new Error("كلمة السر الجديدة بحال القديمة.");
    try {
      await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, current));
    } catch (e) {
      const code = (e as { code?: string })?.code ?? "";
      if (code === "auth/wrong-password" || code === "auth/invalid-credential") {
        throw new Error("كلمة السر الحالية غالطة.");
      }
      if (code === "auth/too-many-requests") {
        throw new Error("محاولات بزاف. استنى شوية وعاود.");
      }
      throw new Error("ما نجّمناش نتأكّدو منك. عاود دخول وجرّب.");
    }
    try {
      await updatePassword(u, next);
    } catch (e) {
      const code = (e as { code?: string })?.code ?? "";
      if (code === "auth/weak-password") throw new Error("كلمة السر ضعيفة بزاف.");
      throw new Error("ما تبدّلاتش كلمة السر. جرّب مرة أخرى.");
    }
    await u.getIdToken(true);
  }, []);

  const authFetch = useCallback(
    async (input: string, init: RequestInit = {}) => {
      const token = await auth.currentUser?.getIdToken();
      const headers = new Headers(init.headers);
      if (token) headers.set("Authorization", `Bearer ${token}`);
      if (init.body && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
      }
      return fetch(input, { ...init, headers });
    },
    []
  );

  const value = useMemo(
    () => ({
      user,
      loading,
      signInEmail,
      signUpEmail,
      signInGoogle,
      signOut,
      sendVerification,
      refreshVerified,
      sendReset,
      changePassword,
      authFetch,
      startPhoneSignIn,
      confirmPhoneCode,
      resetPhoneVerifier,
    }),
    [user, rev, loading, signInEmail, signUpEmail, signInGoogle, signOut, sendVerification, refreshVerified, sendReset, changePassword, authFetch, startPhoneSignIn, confirmPhoneCode, resetPhoneVerifier]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

/** Maps Firebase auth error codes to dictionary keys */
export function authErrorKey(code: string): string {
  switch (code) {
    case "auth/invalid-email":
      return "invalid";
    case "auth/email-already-in-use":
      return "used";
    case "auth/weak-password":
      return "weak";
    case "auth/wrong-password":
    case "auth/invalid-credential":
    case "auth/user-not-found":
      return "wrong";
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return "cancelled";
    case "auth/unauthorized-domain":
      return "domain";
    case "auth/operation-not-allowed":
      return "disabled";
    case "auth/network-request-failed":
      return "network";
    case "auth/webview":
      return "webview";
    case "auth/account-exists-with-different-credential":
      return "other";
    case "auth/too-many-requests":
      return "tooMany";
    case "auth/invalid-phone-number":
      return "badPhone";
    case "auth/invalid-verification-code":
    case "auth/code-expired":
    case "auth/missing-verification-code":
      return "badCode";
    case "auth/captcha-check-failed":
    case "auth/missing-client-identifier":
      return "captcha";
    default:
      return "generic";
  }
}
