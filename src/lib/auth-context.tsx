"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut as fbSignOut,
  type User as FirebaseUser,
} from "firebase/auth";
import { auth, googleProvider } from "@/lib/firebase";

/* ------------------------------------------------------------------ types */

export type Profile = {
  id: string;
  email: string;
  name: string | null;
  photo: string | null;
  phone: string | null;
  country: string | null;
  pro: boolean;
  paidPro: boolean;
  trial: boolean;
  planExpiresAt: string | null;
  trialEndsAt: string | null;
};

export type NexusUser = {
  uid: string;
  email: string;
  name: string | null;
  photo: string | null;
  provider: "password" | "google";
};

type AuthCtx = {
  user: NexusUser | null;
  ready: boolean;
  profile: Profile | null;
  refreshProfile: () => Promise<void>;
  signUpLocal: (d: { name: string; email: string; phone: string; country: string; password: string }) => Promise<void>;
  signInLocal: (email: string, password: string) => Promise<void>;
  signInGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  updateProfile: (patch: { name?: string; phone?: string; country?: string }) => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function useAuth(): AuthCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used inside <AuthProvider>");
  return c;
}

/** Same-origin fetch — the session cookie (HttpOnly) travels automatically. */
export function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  return fetch(input, { credentials: "same-origin", ...init });
}

/** Maps API error codes to thrown {code, retryAfter?} for the UI. */
class AuthApiError extends Error {
  code: string;
  field?: string;
  reason?: string;
  retryAfter?: number;
  constructor(j: { code?: string; field?: string; reason?: string; retryAfter?: number }) {
    super(j.code ?? "ERROR");
    this.code = j.code ?? "ERROR";
    this.field = j.field;
    this.reason = j.reason;
    this.retryAfter = j.retryAfter;
  }
}

async function postJson(url: string, body: unknown): Promise<Record<string, unknown>> {
  const r = await apiFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const d = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok) throw new AuthApiError(d as never);
  return d;
}

function fbToNexus(u: FirebaseUser): NexusUser {
  return {
    uid: u.uid,
    email: u.email ?? "",
    name: u.displayName,
    photo: u.photoURL,
    provider: "google",
  };
}

/* ------------------------------------------------------------------ provider */

export function AuthProvider({ children }: { children: ReactNode }) {
  const [localUser, setLocalUser] = useState<NexusUser | null>(null);
  const [fbUser, setFbUser] = useState<FirebaseUser | null>(null);
  const [fbChecked, setFbChecked] = useState(false);
  const [localChecked, setLocalChecked] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);

  const user = localUser ?? (fbUser ? fbToNexus(fbUser) : null);
  const ready = localChecked && fbChecked;

  /* 1 — local session cookie (primary identity) */
  useEffect(() => {
    let cancelled = false;
    apiFetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d?.user) return;
        const u = d.user as Profile;
        setLocalUser({ uid: u.id, email: u.email, name: u.name, photo: u.photo, provider: "password" });
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLocalChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /* 2 — Firebase (Google) identity, if present on this device */
  useEffect(
    () =>
      onAuthStateChanged(auth, (u) => {
        setFbUser(u);
        setFbChecked(true);
        if (!u) return;
      }),
    [],
  );

  /* profile (plan / trial / account info) for the active identity */
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
    else setProfile(null);
  }, [user, refreshProfile]);

  /* keep exactly ONE identity active: taking over revokes the other */
  const takeover = useCallback(async (newUser: NexusUser) => {
    if (newUser.provider === "password") {
      try {
        if (fbUser) await fbSignOut(auth);
      } catch {
        /* best effort */
      }
      setLocalUser(newUser);
    } else {
      try {
        await apiFetch("/api/auth/logout", { method: "POST" });
      } catch {
        /* best effort */
      }
      setLocalUser(null);
      setFbUser((cur) => cur ?? null);
    }
  }, [fbUser]);

  const value = useMemo<AuthCtx>(
    () => ({
      user,
      ready,
      profile,
      refreshProfile,
      signUpLocal: async (d) => {
        const res = await postJson("/api/auth/signup", { ...d, terms: true });
        const u = res.user as NexusUser;
        setLocalUser(u);
        void refreshProfile();
      },
      signInLocal: async (email, password) => {
        const res = await postJson("/api/auth/login", { email, password });
        const u = res.user as NexusUser;
        setLocalUser(u);
        void refreshProfile();
      },
      signInGoogle: async () => {
        const cred = await signInWithPopup(auth, googleProvider);
        const u = fbToNexus(cred.user);
        await takeover(u);
        void refreshProfile();
      },
      signOut: async () => {
        try {
          await apiFetch("/api/auth/logout", { method: "POST" });
        } catch {
          /* best effort */
        }
        setLocalUser(null);
        try {
          await fbSignOut(auth); // safe even when no Firebase user is active
        } catch {
          /* best effort */
        }
        setProfile(null);
      },
      updateProfile: async (patch) => {
        const r = await apiFetch("/api/auth/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (r.ok) {
          const d = (await r.json()) as { user: Profile };
          setProfile(d.user);
          if (localUser) setLocalUser({ ...localUser, name: d.user.name ?? localUser.name });
        }
      },
    }),
    [user, ready, profile, refreshProfile, localUser, fbUser, takeover],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
