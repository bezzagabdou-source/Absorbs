"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/providers/auth-provider";

/** Live "online now" set powered by Supabase Realtime Presence (no tables needed). */
export function useOnlineUsers(): Set<string> {
  const { user } = useAuth();
  const supabaseRef = useRef(createClient());
  const [online, setOnline] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;
    const supabase = supabaseRef.current;
    const channel = supabase.channel("dz-online", { config: { presence: { key: user.id } } });
    channel
      .on("presence", { event: "sync" }, () => {
        setOnline(new Set(Object.keys(channel.presenceState())));
      })
      .subscribe(async (status: string) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ user_id: user.id, online_at: new Date().toISOString() });
        }
      });
    return () => {
      void channel.untrack();
      supabase.removeChannel(channel);
    };
  }, [user]);

  return online;
}
