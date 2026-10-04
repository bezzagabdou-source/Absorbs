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
  /** fetch() wrapper that attaches a fresh Firebase ID token */
  authFetch: (input: string, init?: RequestInit) => Promise<Response>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

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

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setLoading(false);
      if (u) void syncUser(u);
    });
    return () => unsub();
  }, []);

  const signInEmail = useCallback(async (email: string, password: string) => {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    await syncUser(cred.user, "login", "password");
  }, []);

  const signUpEmail = useCallback(
    async (name: string, email: string, password: string) => {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      if (name.trim()) {
        await updateProfile(cred.user, { displayName: name.trim() });
      }
      // a real verification e-mail (non-blocking: the account works immediately)
      sendEmailVerification(cred.user).catch(() => undefined);
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
      authFetch,
    }),
    [user, loading, signInEmail, signUpEmail, signInGoogle, signOut, authFetch]
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
