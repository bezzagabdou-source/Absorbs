"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Loader2, Plus, UsersRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/providers/auth-provider";
import { useToast } from "@/components/ui/feedback";
import { EmptyState, FullPageLoader } from "@/components/ui/feedback";
import { cn, isSchemaMissing } from "@/lib/utils";
import type { Group } from "@/lib/types";

/** Communities hub: discover groups, join/leave, create your own. */
export default function GroupsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", emoji: "🇩🇿", wilaya: "", description: "" });

  const load = async () => {
    if (!user) return;
    const [{ data: gs, error }, { data: mine }] = await Promise.all([
      supabase.from("groups").select("*").order("created_at", { ascending: true }),
      supabase.from("group_members").select("group_id").eq("user_id", user.id),
    ]);
    if (error) {
      if (isSchemaMissing(error)) setUnavailable(true);
      setLoading(false);
      return;
    }
    const joinedSet = new Set(((mine ?? []) as { group_id: string }[]).map((m) => m.group_id));
    const withCounts = await Promise.all(
      ((gs ?? []) as Group[]).map(async (g) => {
        const { count } = await supabase.from("group_members").select("*", { count: "exact", head: true }).eq("group_id", g.id);
        return { ...g, member_count: count ?? 0, joined: joinedSet.has(g.id) };
      }),
    );
    setGroups(withCounts.sort((a, b) => (b.member_count ?? 0) - (a.member_count ?? 0)));
    setLoading(false);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const toggleJoin = async (group: Group) => {
    if (!user) return;
    setBusyId(group.id);
    if (group.joined) {
      await supabase.from("group_members").delete().eq("group_id", group.id).eq("user_id", user.id);
      setGroups((prev) => prev.map((g) => (g.id === group.id ? { ...g, joined: false, member_count: Math.max(0, (g.member_count ?? 1) - 1) } : g)));
    } else {
      const { error } = await supabase.from("group_members").insert({ group_id: group.id, user_id: user.id });
      if (!error) {
        setGroups((prev) => prev.map((g) => (g.id === group.id ? { ...g, joined: true, member_count: (g.member_count ?? 0) + 1 } : g)));
        toast(`انضممت إلى ${group.name} 🎉`);
      }
    }
    setBusyId(null);
  };

  const createGroup = async () => {
    if (!user || !form.name.trim()) return;
    setBusyId("new");
    const { data, error } = await supabase
      .from("groups")
      .insert({ name: form.name.trim(), emoji: form.emoji || "🇩🇿", wilaya: form.wilaya.trim() || null, description: form.description.trim() || null, created_by: user.id })
      .select("*")
      .single();
    setBusyId(null);
    if (error || !data) return toast("تعذّر إنشاء المجموعة", "error");
    await supabase.from("group_members").insert({ group_id: (data as Group).id, user_id: user.id, role: "admin" });
    setCreating(false);
    setForm({ name: "", emoji: "🇩🇿", wilaya: "", description: "" });
    toast("تم إنشاء مجموعتك 🎉");
    void load();
  };

  if (loading) return <FullPageLoader label="جارٍ تحميل المجتمعات…" />;
  if (unavailable) {
    return (
      <EmptyState icon={<UsersRound className="h-6 w-6" />} title="المجتمعات تُفعَّل قريبًا" description="نفّذ upgrade-v3.sql في Supabase SQL Editor لتفعيل المجموعات والريلز والدعوات.">
        <Link href="/feed" className="btn-primary rounded-full px-5 py-2.5 text-sm font-bold text-white">عودة للخلاصة</Link>
      </EmptyState>
    );
  }

  return (
    <div className="animate-fade-up space-y-4">
      <div className="flex items-start justify-between gap-3 px-1">
        <div>
          <h1 className="flex items-center gap-2 text-[22px] font-black text-white">
            <UsersRound className="h-6 w-6 text-emerald-300" /> مجتمعات Dz connect
          </h1>
          <p className="mt-1 text-sm text-white/50">ولايات واهتمامات تجمع الجزائريين — انضم وانشر داخل مجتمعك.</p>
        </div>
        <button onClick={() => setCreating((c) => !c)} className="btn-primary flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-bold text-white">
          <Plus className="h-4 w-4" /> مجموعة
        </button>
      </div>

      {creating && (
        <section className="glass animate-fade-up space-y-2.5 rounded-[26px] p-4">
          <div className="flex gap-2">
            <input value={form.emoji} onChange={(e) => setForm({ ...form, emoji: e.target.value.slice(0, 4) })} className="input-glass w-16 rounded-2xl px-3 py-2.5 text-center text-lg" aria-label="إيموجي المجموعة" />
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value.slice(0, 50) })} placeholder="اسم المجموعة *" className="input-glass min-w-0 flex-1 rounded-2xl px-3.5 py-2.5 text-sm text-white" />
          </div>
          <input value={form.wilaya} onChange={(e) => setForm({ ...form, wilaya: e.target.value.slice(0, 30) })} placeholder="الولاية (اختياري)" className="input-glass w-full rounded-2xl px-3.5 py-2.5 text-sm text-white" />
          <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value.slice(0, 160) })} placeholder="وصف قصير للمجموعة…" rows={2} className="input-glass w-full resize-none rounded-2xl px-3.5 py-2.5 text-sm text-white" />
          <button onClick={() => void createGroup()} disabled={!form.name.trim() || busyId === "new"} className="btn-primary w-full rounded-full py-2.5 text-sm font-bold text-white disabled:opacity-40">
            {busyId === "new" ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "إنشاء المجموعة"}
          </button>
        </section>
      )}

      <div className="stagger space-y-2.5">
        {groups.map((group) => (
          <article key={group.id} className="glass flex items-center gap-3 rounded-[24px] p-3.5">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] bg-gradient-to-br from-emerald-400/25 to-cyan-500/20 text-2xl ring-1 ring-white/10">
              {group.emoji}
            </span>
            <Link href={`/groups/${group.id}`} className="min-w-0 flex-1">
              <span className="block truncate font-bold text-white">{group.name}</span>
              <span className="mt-0.5 block truncate text-xs text-white/45">
                {group.member_count ?? 0} عضو{group.wilaya ? ` · ${group.wilaya}` : ""}
                {group.description ? ` · ${group.description}` : ""}
              </span>
            </Link>
            <button
              onClick={() => void toggleJoin(group)}
              disabled={busyId === group.id}
              className={cn(
                "shrink-0 rounded-full px-4 py-2 text-[13px] font-bold transition active:scale-95 disabled:opacity-50",
                group.joined ? "bg-white/[0.07] text-white/70 ring-1 ring-white/10" : "btn-primary text-white",
              )}
            >
              {busyId === group.id ? <Loader2 className="h-4 w-4 animate-spin" /> : group.joined ? "انضممت ✓" : "انضم"}
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}
