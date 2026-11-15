"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  BadgeCheck,
  BellRing,
  CheckCheck,
  Flame,
  Heart,
  MessageCircle,
  MessageSquareReply,
  UserPlus,
} from "lucide-react";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/queries";
import { isSchemaMissing, timeAgoAr } from "@/lib/utils";
import { useAuth } from "@/components/providers/auth-provider";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState, FullPageLoader } from "@/components/ui/feedback";
import type { AppNotification, NotificationType, Profile } from "@/lib/types";

const NOTIF_SEEN_KEY = "dzconnect-notif-seen";

interface LegacyItem {
  id: string;
  type: "like" | "comment" | "follow";
  actor: Profile | null;
  post_id: string | null;
  text: string | null;
  created_at: string;
}

export default function NotificationsPage() {
  const { user } = useAuth();
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;
  const [mode, setMode] = useState<"table" | "legacy">("table");
  const [items, setItems] = useState<AppNotification[]>([]);
  const [legacyItems, setLegacyItems] = useState<LegacyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);

  /* ── real notifications table (upgrade-v6.sql) with derived fallback ── */
  const loadTable = useCallback(async () => {
    if (!user) return;
    try {
      const rows = await fetchNotifications(supabase, user.id, 80);
      setItems(rows);
      setMode("table");
      return true;
    } catch (err) {
      if ((err as { code?: string })?.code === "SCHEMA_MISSING" || isSchemaMissing(err as { code?: string; message?: string })) {
        setMode("legacy");
        return false;
      }
      return false;
    }
  }, [supabase, user]);

  const loadLegacy = useCallback(async () => {
    if (!user) return;
    const { data: myPosts } = await supabase.from("posts").select("id").eq("author_id", user.id).limit(200);
    const postIds = ((myPosts ?? []) as { id: string }[]).map((p) => p.id);
    const [likes, comments, follows] = await Promise.all([
      postIds.length
        ? supabase
            .from("likes")
            .select("post_id, created_at, actor:profiles!likes_user_id_fkey ( id, username, display_name, avatar_url, is_verified )")
            .in("post_id", postIds)
            .neq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(40)
        : Promise.resolve({ data: [] }),
      postIds.length
        ? supabase
            .from("comments")
            .select("id, post_id, content, created_at, actor:profiles!comments_author_id_fkey ( id, username, display_name, avatar_url, is_verified )")
            .in("post_id", postIds)
            .neq("author_id", user.id)
            .order("created_at", { ascending: false })
            .limit(40)
        : Promise.resolve({ data: [] }),
      supabase
        .from("follows")
        .select("created_at, actor:profiles!follows_follower_id_fkey ( id, username, display_name, avatar_url, is_verified )")
        .eq("following_id", user.id)
        .order("created_at", { ascending: false })
        .limit(40),
    ]);
    const merged: LegacyItem[] = [
      ...(((likes.data ?? []) as unknown as Array<{ post_id: string; created_at: string; actor: Profile | null }>).map((l, i) => ({
        id: `like-${l.post_id}-${i}`,
        type: "like" as const,
        actor: l.actor,
        post_id: l.post_id,
        text: null,
        created_at: l.created_at,
      }))),
      ...(((comments.data ?? []) as unknown as Array<{ id: string; post_id: string; content: string; created_at: string; actor: Profile | null }>).map((c) => ({
        id: `comment-${c.id}`,
        type: "comment" as const,
        actor: c.actor,
        post_id: c.post_id,
        text: c.content,
        created_at: c.created_at,
      }))),
      ...(((follows.data ?? []) as unknown as Array<{ created_at: string; actor: Profile | null }>).map((f, i) => ({
        id: `follow-${i}-${f.created_at}`,
        type: "follow" as const,
        actor: f.actor,
        post_id: null,
        text: null,
        created_at: f.created_at,
      }))),
    ].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
    setLegacyItems(merged.slice(0, 60));
    try {
      localStorage.setItem(NOTIF_SEEN_KEY, new Date().toISOString());
    } catch {}
  }, [supabase, user]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const ok = await loadTable();
      if (!ok && !cancelled) await loadLegacy();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, user, loadTable, loadLegacy]);

  /* live: new notification lands in real time */
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("notifications-page")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `recipient_id=eq.${user.id}` },
        async (payload: RealtimePostgresChangesPayload<AppNotification>) => {
          const row = payload.new as AppNotification;
          const { data: actor } = row.actor_id
            ? await supabase.from("profiles").select("*").eq("id", row.actor_id).maybeSingle()
            : { data: null };
          setItems((prev) => (prev.some((n) => n.id === row.id) ? prev : [{ ...row, actor: (actor as Profile | null) ?? null }, ...prev]));
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, user]);

  const unreadCount = mode === "table" ? items.filter((n) => !n.read_at).length : 0;

  const markAll = async () => {
    if (!user || markingAll || unreadCount === 0) return;
    setMarkingAll(true);
    const now = new Date().toISOString();
    try {
      await markAllNotificationsRead(supabase, user.id);
      setItems((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: now })));
    } finally {
      setMarkingAll(false);
    }
  };

  const onOpen = (n: AppNotification) => {
    if (!n.read_at) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
      void markNotificationRead(supabase, n.id);
    }
  };

  const hrefFor = (n: AppNotification): string => {
    if (n.post_id) return `/post/${n.post_id}`;
    if (n.type === "message") return "/messages";
    if (n.actor?.username) return `/u/${n.actor.username}`;
    return "/notifications";
  };

  const meta = (type: NotificationType) => {
    switch (type) {
      case "like":
        return { label: "أعجب بمنشورك", icon: <Heart className="h-4 w-4 fill-rose-500 text-rose-500" />, tile: "bg-rose-500/12 ring-rose-400/30" };
      case "comment":
        return { label: "علّق على منشورك", icon: <MessageCircle className="h-4 w-4 text-sky-600" />, tile: "bg-sky-400/15 ring-sky-400/30" };
      case "reply":
        return { label: "ردّ على تعليقك", icon: <MessageSquareReply className="h-4 w-4 text-violet-600" />, tile: "bg-violet-400/15 ring-violet-400/30" };
      case "follow":
        return { label: "بدأ بمتابعتك", icon: <UserPlus className="h-4 w-4 text-indigo-600" />, tile: "bg-indigo-400/15 ring-indigo-400/30" };
      case "message":
        return { label: "أرسل لك رسالة", icon: <MessageCircle className="h-4 w-4 text-emerald-600" />, tile: "bg-emerald-400/15 ring-emerald-400/30" };
      case "reaction":
        return { label: "تفاعل مع منشورك", icon: <Flame className="h-4 w-4 text-amber-600" />, tile: "bg-amber-400/15 ring-amber-400/30" };
      case "verify":
        return { label: "تم توثيق حسابك", icon: <BadgeCheck className="h-4 w-4 fill-sky-400 text-sky-700" />, tile: "bg-sky-400/20 ring-sky-400/40" };
    }
  };

  return (
    <div className="space-y-4">
      <div className="animate-fade-up flex items-end justify-between gap-2 px-1 pt-1">
        <div>
          <h1 className="flex items-center gap-2 text-[22px] font-black text-slate-900">
            <BellRing className="h-6 w-6 text-indigo-600" /> الإشعارات
            {unreadCount > 0 && (
              <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 px-1.5 text-[11px] font-black text-white">
                {unreadCount}
              </span>
            )}
          </h1>
          <p className="mt-1 text-sm text-slate-900/55">كل تفاعلات أصدقائك معك — لحظيًا.</p>
        </div>
        {mode === "table" && unreadCount > 0 && (
          <button
            onClick={() => void markAll()}
            disabled={markingAll}
            className="glass flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-bold text-indigo-700 transition hover:bg-indigo-50 active:scale-95 disabled:opacity-60"
          >
            <CheckCheck className="h-4 w-4" /> {markingAll ? "لحظة…" : "قراءة الكل"}
          </button>
        )}
      </div>

      {mode === "legacy" && (
        <p className="rounded-2xl border border-amber-300/60 bg-amber-50 px-4 py-2.5 text-[11px] font-semibold leading-5 text-amber-800">
          وضع مبسّط — لإشعارات كاملة لحظية (ردود، رسائل، توثيق، تفاعلات) نفّذ <code>upgrade-v6.sql</code> في Supabase SQL Editor.
        </p>
      )}

      {loading ? (
        <FullPageLoader label="جارٍ تحميل الإشعارات…" />
      ) : mode === "table" ? (
        items.length === 0 ? (
          <EmptyState
            icon={<BellRing className="h-6 w-6" />}
            title="لا إشعارات بعد"
            description="عندما يعجب بك أحد، يعلّق على منشورك، يردّ على تعليقك أو يتابعك — سيظهر هنا فورًا."
          />
        ) : (
          <ul className="stagger space-y-2.5">
            {items.map((n) => {
              const m = meta(n.type);
              const unread = !n.read_at;
              return (
                <li key={n.id}>
                  <Link
                    href={hrefFor(n)}
                    onClick={() => onOpen(n)}
                    className={`glass flex items-center gap-3 rounded-[24px] p-3 transition hover:bg-slate-900/[0.05] active:scale-[0.99] ${
                      unread ? "ring-2 ring-indigo-400/40" : ""
                    }`}
                  >
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ring-1 ${m.tile}`}>{m.icon}</span>
                    {n.type === "verify" ? (
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-indigo-500 text-lg text-white">✔</span>
                    ) : (
                      <Avatar profile={n.actor ?? null} size="md" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm leading-6 text-slate-900/85">
                        {n.actor && <b className="text-slate-900">{n.actor.display_name}</b>} {m.label}
                        {n.type === "reaction" && n.body && <span className="ms-1">{n.body}</span>}
                      </span>
                      {n.body && (n.type === "comment" || n.type === "reply" || n.type === "message") && (
                        <span className="mt-0.5 block truncate text-[13px] text-slate-900/55">“{n.body}”</span>
                      )}
                      <span className="mt-0.5 block text-[11px] text-slate-900/40">{timeAgoAr(n.created_at)}</span>
                    </span>
                    {unread && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-indigo-500" aria-label="غير مقروء" />}
                  </Link>
                </li>
              );
            })}
          </ul>
        )
      ) : legacyItems.length === 0 ? (
        <EmptyState
          icon={<BellRing className="h-6 w-6" />}
          title="لا إشعارات بعد"
          description="عند إعجاب أحد بمنشوراتك أو تعليقه عليها أو متابعتك، سيظهر هنا فورًا."
        />
      ) : (
        <ul className="stagger space-y-2.5">
          {legacyItems.map((item) => {
            const m = meta(item.type);
            const href = item.post_id ? `/post/${item.post_id}` : item.actor ? `/u/${item.actor.username}` : "#";
            return (
              <li key={item.id}>
                <Link href={href} className="glass flex items-center gap-3 rounded-[24px] p-3 transition hover:bg-slate-900/[0.05] active:scale-[0.99]">
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ring-1 ${m.tile}`}>{m.icon}</span>
                  <Avatar profile={item.actor} size="md" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-slate-900/85">
                      <b className="text-slate-900">{item.actor?.display_name ?? "مستخدم"}</b> {m.label}
                    </span>
                    {item.text && <span className="mt-0.5 block truncate text-[13px] text-slate-900/55">“{item.text}”</span>}
                    <span className="mt-0.5 block text-[11px] text-slate-900/40">{timeAgoAr(item.created_at)}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
