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
  signOut as fbSignOut,
  updateProfile,
  sendEmailVerification,
  sendPasswordResetEmail,
  getAdditionalUserInfo,
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
  /** fetch() wrapper that attaches a fresh Firebase ID token */
  authFetch: (input: string, init?: RequestInit) => Promise<Response>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/** Where the e-mail link brings the user back to. */
function actionSettings() {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return origin ? { url: `${origin}/app`, handleCodeInApp: false } : undefined;
}

/** Client-side password rules (Firebase enforces the 6-character floor; we ask for more). */
export function passwordProblem(pw: string): "short" | "weak" | null {
  if (pw.length < 8) return "short";
  if (!/[A-Za-z\u0600-\u06FF]/.test(pw) || !/\d/.test(pw)) return "weak";
  return null;
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
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setLoading(false);
      if (u) void syncUser(u);
    });
    return () => unsub();
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
      sendEmailVerification(cred.user, actionSettings()).catch(() => undefined);
      await syncUser(cred.user, "signup", "password");
    },
    []
  );

  const signInGoogle = useCallback(async () => {
    const cred = await signInWithPopup(auth, googleProvider);
    const isNew = getAdditionalUserInfo(cred)?.isNewUser === true;
    await syncUser(cred.user, isNew ? "signup" : "login", "google");
  }, []);

  const signOut = useCallback(async () => {
    await fbSignOut(auth);
  }, []);

  const sendVerification = useCallback(async () => {
    const u = auth.currentUser;
    if (!u) throw Object.assign(new Error("no user"), { code: "auth/user-not-found" });
    await sendEmailVerification(u, actionSettings());
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
    await sendPasswordResetEmail(auth, email.trim().toLowerCase(), actionSettings());
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
      authFetch,
    }),
    [user, rev, loading, signInEmail, signUpEmail, signInGoogle, signOut, sendVerification, refreshVerified, sendReset, authFetch]
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
    case "auth/too-many-requests":
      return "tooMany";
    default:
      return "generic";
  }
}
