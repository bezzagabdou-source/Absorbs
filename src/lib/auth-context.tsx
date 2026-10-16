"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { User as FirebaseUser, Auth, AuthProvider, UserCredential, Unsubscribe } from "firebase/auth";

/* Firebase (Google sign-in) is OPTIONAL and heavy (~400KB) — it is loaded lazily
   in the background, so the first paint and local accounts never wait for it. */
type FirebaseMod = {
  auth: Auth;
  googleProvider: AuthProvider;
  onAuthStateChanged: (a: Auth, cb: (u: FirebaseUser | null) => void) => Unsubscribe;
  signInWithPopup: (a: Auth, p: AuthProvider) => Promise<UserCredential>;
  signOut: (a: Auth) => Promise<void>;
};
function loadFirebase(): Promise<FirebaseMod> {
  return (async () => {
    const [authMod, fb] = await Promise.all([import("firebase/auth"), import("@/lib/firebase")]);
    return {
      auth: fb.auth,
      googleProvider: fb.googleProvider,
      onAuthStateChanged: authMod.onAuthStateChanged,
      signInWithPopup: authMod.signInWithPopup,
      signOut: authMod.signOut,
    };
  })();
}

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
  const [localChecked, setLocalChecked] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);

  const user = localUser ?? (fbUser ? fbToNexus(fbUser) : null);
  /* ready = local session resolved. Firebase (optional Google session) is checked
     in the background and never blocks the UI. */
  const ready = localChecked;

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

  /* 2 — Firebase (Google) identity, if present on this device — background, lazy */
  useEffect(() => {
    let cancelled = false;
    let unsub: (() => void) | undefined;
    void loadFirebase()
      .then((fb) => {
        if (cancelled) return;
        unsub = fb.onAuthStateChanged(fb.auth, (u) => {
          if (!cancelled) setFbUser(u);
        });
      })
      .catch(() => undefined); /* Firebase optional — local accounts unaffected */
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, []);

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
      if (fbUser) {
        try {
          const fb = await loadFirebase();
          await fb.signOut(fb.auth);
        } catch {
          /* best effort */
        }
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
        const fb = await loadFirebase();
        const cred = await fb.signInWithPopup(fb.auth, fb.googleProvider);
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
        void loadFirebase()
          .then((fb) => fb.signOut(fb.auth)) // safe even when no Firebase user is active
          .catch(() => undefined);
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
