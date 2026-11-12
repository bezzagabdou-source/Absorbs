"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import type { AuthChangeEvent } from "@supabase/auth-js";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";

interface AuthContextValue {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  loading: boolean;
  profileMissing: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  profile: null,
  session: null,
  loading: true,
  profileMissing: false,
  refreshProfile: async () => {},
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileMissing, setProfileMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const fetchingFor = useRef<string | null>(null);

  const loadProfile = useCallback(
    async (userId: string) => {
      if (fetchingFor.current === userId && profile) return;
      fetchingFor.current = userId;
      const { data } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
      if (data) {
        setProfile(data as Profile);
        setProfileMissing(false);
      } else {
        // Trigger in schema.sql normally creates the row at signup; if the user
        // confirmed their email later, retry once (trigger may have just run).
        const retry = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
        if (retry.data) {
          setProfile(retry.data as Profile);
          setProfileMissing(false);
        } else {
          setProfileMissing(true);
        }
      }
    },
    [supabase, profile],
  );

  const refreshProfile = useCallback(async () => {
    const userId = session?.user?.id;
    if (!userId) return;
    fetchingFor.current = null;
    const { data } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
    if (data) {
      setProfile(data as Profile);
      setProfileMissing(false);
    }
  }, [supabase, session?.user?.id]);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(async ({ data }: { data: { session: Session | null } }) => {
      if (!mounted) return;
      setSession(data.session);
      if (data.session?.user) await loadProfile(data.session.user.id);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event: AuthChangeEvent, nextSession: Session | null) => {
      if (!mounted) return;
      setSession(nextSession);
      if (nextSession?.user) {
        await loadProfile(nextSession.user.id);
      } else {
        setProfile(null);
        setProfileMissing(false);
        fetchingFor.current = null;
      }
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase, loadProfile]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setSession(null);
    window.location.href = "/login";
  }, [supabase]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      profile,
      session,
      loading,
      profileMissing,
      refreshProfile,
      signOut,
    }),
    [session, profile, loading, profileMissing, refreshProfile, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
