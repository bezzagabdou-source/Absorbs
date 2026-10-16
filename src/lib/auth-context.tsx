"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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
  PhoneAuthProvider,
  RecaptchaVerifier,
  linkWithCredential,
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
  /** v19: ask the server for a 6-digit verification code (emailed when a provider is set) */
  sendSecurityCode: () => Promise<{ delivery: "email" | "link" | "phone" | "none"; expiresIn: number; masked: string; code?: string }>;
  /** v19: verify the 6-digit code → opens a 15-minute trusted window */
  verifySecurityCode: (code: string) => Promise<{ trustedUntil: string }>;
  /** v19: burn the pending code and close the trusted window */
  revokeSecurity: () => Promise<void>;
  /** v19: set the 2FA preference (off · email · phone) */
  setTwoFactor: (mode: "off" | "email" | "phone") => Promise<void>;
  /** v19: send a real SMS code with Firebase phone auth (needs a reCAPTCHA container in the DOM) */
  sendPhoneCode: (phone: string, containerId: string) => Promise<{ confirmation: ConfirmationResult; verificationId: string }>;
  /** v19: confirm the SMS code and link the number to this account */
  confirmPhoneCode: (input: { confirmation?: ConfirmationResult; verificationId?: string; code: string }) => Promise<void>;
  /** fetch() wrapper that attaches a fresh Firebase ID token */
  authFetch: (input: string, init?: RequestInit) => Promise<Response>;
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

/** Firebase phone-auth error codes → Darija. */
export function phoneError(code: string): string {
  if (code === "auth/quota-exceeded" || code === "auth/too-many-requests") return "الطلبات كثرت — استنى شوية وعاود.";
  if (code === "auth/captcha-check-failed") return "فحص reCAPTCHA فشل — حدّث الصفحة وعاود.";
  if (code === "auth/network-request-failed") return "الإنترنت مقطوع — تحقق من الاتصال.";
  if (code === "auth/missing-client-identifier") return "إعدادات Firebase ناقصة للتحقق بالهاتف.";
  return "";
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
    await syncUser(cred.user, "login", "password");
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
      await syncUser(cred.user, "signup", "password");
    },
    []
  );

  const signInGoogle = useCallback(async () => {
    // Google refuses OAuth inside in-app browsers (Facebook, Instagram, TikTok…): say so instead of a blank popup
    if (isEmbeddedBrowser()) throw Object.assign(new Error("webview"), { code: "auth/webview" });
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      const isNew = getAdditionalUserInfo(cred)?.isNewUser === true;
      await syncUser(cred.user, isNew ? "signup" : "login", "google");
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

  /* ------------------------------------------------------------------ *
   * v19 — رمز التحقق (server-minted 6-digit code + Firebase delivery)
   * ------------------------------------------------------------------ */
  const sendSecurityCode = useCallback(async () => {
    const token = await auth.currentUser?.getIdToken();
    const r = await fetch("/api/user/security", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ action: "mint-code" }),
    });
    const j = (await r.json().catch(() => null)) as
      | { ok?: boolean; delivery?: "email" | "link"; expiresIn?: number; masked?: string; code?: string; detail?: string }
      | null;
    if (!r.ok || !j?.ok) throw new Error(j?.detail ?? "تعذّر إنشاء الرمز.");
    // no mail provider configured → Firebase's own verification mail is the channel
    if (j.delivery !== "email") {
      const u = auth.currentUser;
      if (u && !u.emailVerified) {
        await mailWithFallback((s) => sendEmailVerification(u, s)).catch(() => undefined);
      }
    }
    return { delivery: (j.delivery ?? "link") as "email" | "link" | "phone" | "none", expiresIn: j.expiresIn ?? 600, masked: j.masked ?? "", code: j.code };
  }, []);

  const verifySecurityCode = useCallback(async (code: string) => {
    const token = await auth.currentUser?.getIdToken();
    const r = await fetch("/api/user/security", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ action: "verify-code", code }),
    });
    const j = (await r.json().catch(() => null)) as { ok?: boolean; trustedUntil?: string; detail?: string } | null;
    if (!r.ok || !j?.ok) throw new Error(j?.detail ?? "الرمز مرفوض.");
    const u = auth.currentUser;
    if (u) {
      await u.reload().catch(() => undefined);
      await u.getIdToken(true).catch(() => undefined);
      setRev((n) => n + 1);
      void syncUser(u);
    }
    return { trustedUntil: j.trustedUntil ?? new Date().toISOString() };
  }, []);

  const revokeSecurity = useCallback(async () => {
    const token = await auth.currentUser?.getIdToken();
    await fetch("/api/user/security", { method: "DELETE", headers: token ? { Authorization: `Bearer ${token}` } : {} }).catch(() => undefined);
  }, []);

  const setTwoFactor = useCallback(async (mode: "off" | "email" | "phone") => {
    const token = await auth.currentUser?.getIdToken();
    await fetch("/api/user/security", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ action: "two-factor", mode }),
    }).catch(() => undefined);
  }, []);

  /* ------------------------------------------------------------------ *
   * v19 — رمز عبر SMS (Firebase phone auth)
   * ------------------------------------------------------------------ */
  const sendPhoneCode = useCallback(async (phone: string, containerId: string) => {
    const el = typeof document !== "undefined" ? document.getElementById(containerId) : null;
    if (!el) throw new Error("حاوية reCAPTCHA غير موجودة في الصفحة.");
    const verifier = new RecaptchaVerifier(auth, containerId, { size: "invisible" });
    const clean = phone.replace(/[^\d+]/g, "");
    try {
      const confirmation = await signInWithPhoneNumber(auth, clean, verifier);
      return { confirmation, verificationId: "" };
    } catch (e) {
      const code = (e as { code?: string })?.code ?? "";
      if (code === "auth/operation-not-allowed") throw new Error("تسجيل الدخول بالهاتف غير مفعّل في إعدادات Firebase (Authentication → Sign-in method → Phone).");
      if (code === "auth/invalid-phone-number") throw new Error("رقم الهاتف غير صالح — اكتبه بالصيغة الدولية مثل +213555123456.");
      if (code === "auth/too-many-requests") throw new Error("طلبات كثيرة — استنى شوية وعاود.");
      if (code === "auth/unauthorized-domain") throw new Error("هذا النطاق غير مسموح في إعدادات Firebase.");
      throw new Error(phoneError(code) || "تعذّر إرسال الرمز.");
    }
  }, []);

  const confirmPhoneCode = useCallback(async (input: { confirmation?: ConfirmationResult; verificationId?: string; code: string }) => {
    const u = auth.currentUser;
    if (!u) throw new Error("ما كاينش حساب مفتوح.");
    const code = String(input.code ?? "").replace(/\D/g, "");
    if (code.length !== 6) throw new Error("الرمز ستة أرقام.");
    try {
      if (input.confirmation) {
        await input.confirmation.confirm(code);
      } else if (input.verificationId) {
        const cred = PhoneAuthProvider.credential(input.verificationId, code);
        await linkWithCredential(u, cred);
      } else {
        throw new Error("ما كاينش جلسة تحقق — اطلب رمزًا جديدًا.");
      }
    } catch (e) {
      const c = (e as { code?: string })?.code ?? "";
      if (c === "auth/invalid-verification-code") throw new Error("الرمز غالط.");
      if (c === "auth/code-expired") throw new Error("الرمز انتهى — اطلب واحدًا جديدًا.");
      if (c === "auth/credential-already-in-use") throw new Error("هذا الرقم مربوط بحساب آخر.");
      throw new Error(phoneError(c) || "تعذّر تأكيد الرمز.");
    }
    const phone = u.phoneNumber ?? u.reload().then(() => u.phoneNumber).catch(() => null);
    const token = await u.getIdToken(true).catch(() => "");
    await fetch("/api/user/security", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ action: "save-phone", phone: typeof phone === "string" ? phone : "", verified: true }),
    }).catch(() => undefined);
    setRev((n) => n + 1);
    void syncUser(u);
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
      sendSecurityCode,
      verifySecurityCode,
      revokeSecurity,
      setTwoFactor,
      sendPhoneCode,
      confirmPhoneCode,
      authFetch,
    }),
    [user, rev, loading, signInEmail, signUpEmail, signInGoogle, signOut, sendVerification, refreshVerified, sendReset, changePassword, sendSecurityCode, verifySecurityCode, revokeSecurity, setTwoFactor, sendPhoneCode, confirmPhoneCode, authFetch]
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
    default:
      return "generic";
  }
}
