"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as fbSignOut,
  type User,
} from "firebase/auth";
import { auth, googleProvider } from "@/lib/firebase";

export type Profile = {
  id: string;
  email: string;
  name: string | null;
  photo: string | null;
  pro: boolean;
  paidPro: boolean;
  trial: boolean;
  planExpiresAt: string | null;
  trialEndsAt: string | null;
};

type AuthCtx = {
  user: User | null;
  ready: boolean;
  profile: Profile | null;
  refreshProfile: () => Promise<void>;
  signInGoogle: () => Promise<void>;
  signInEmail: (email: string, password: string, create: boolean) => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function useAuth(): AuthCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used inside <AuthProvider>");
  return c;
}

/** fetch() that attaches the Firebase ID token (the server verifies it on every call). */
export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const token = await auth.currentUser?.getIdToken().catch(() => undefined);
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(
    () =>
      onAuthStateChanged(auth, (u) => {
        setUser(u);
        setReady(true);
        if (!u) setProfile(null);
      }),
    [],
  );

  const refreshProfile = useCallback(async () => {
    try {
      const r = await apiFetch("/api/user/me");
      if (r.ok) setProfile(((await r.json()) as { user: Profile }).user);
    } catch {
      /* offline — keep the last profile */
    }
  }, []);

  useEffect(() => {
    if (user) void refreshProfile();
  }, [user, refreshProfile]);

  const value = useMemo<AuthCtx>(
    () => ({
      user,
      ready,
      profile,
      refreshProfile,
      signInGoogle: async () => {
        await signInWithPopup(auth, googleProvider);
      },
      signInEmail: async (email, password, create) => {
        if (create) await createUserWithEmailAndPassword(auth, email, password);
        else await signInWithEmailAndPassword(auth, email, password);
      },
      signOut: () => fbSignOut(auth),
    }),
    [user, ready, profile, refreshProfile],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
