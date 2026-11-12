"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, Gift, Share2, Trophy } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/providers/auth-provider";
import { useToast } from "@/components/ui/feedback";

/** Viral invite card: personal link, points balance, invited friends count. */
export function InviteCard({ compact = false }: { compact?: boolean }) {
  const { profile } = useAuth();
  const { toast } = useToast();
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;
  const [invitedCount, setInvitedCount] = useState(0);
  const [points, setPoints] = useState<number | null>(null);

  useEffect(() => {
    if (!profile) return;
    supabase
      .from("profiles")
      .select("points")
      .eq("id", profile.id)
      .maybeSingle()
      .then(({ data }: { data: { points?: number } | null }) => setPoints(data?.points ?? 0));
    supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("invited_by", profile.id)
      .then(({ count }: { count: number | null }) => setInvitedCount(count ?? 0));
  }, [supabase, profile]);

  if (!profile?.invite_code) return null;
  const link = `${typeof window !== "undefined" ? window.location.origin : ""}/signup?ref=${profile.invite_code}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast("تم نسخ رابط دعوتك — شاركه واربح 25 نقطة عن كل صديق 🎁");
    } catch {
      toast("تعذّر النسخ", "error");
    }
  };

  const share = async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: "Dz connect",
          text: "انضم إلى Dz connect 🇩🇿 — منصة جزائرية: منشورات، قصص، مكالمات وذكاء اصطناعي! سجّل من رابطي:",
          url: link,
        });
      } else await copy();
    } catch {}
  };

  return (
    <section className="glass animate-fade-up relative overflow-hidden rounded-[28px] p-4">
      <div className="pointer-events-none absolute -top-12 start-8 h-32 w-32 rounded-full bg-amber-400/20 blur-[50px]" />
      <div className="relative">
        <h2 className="flex items-center gap-2 font-black text-slate-900">
          <Gift className="h-5 w-5 text-amber-600" /> ادعُ أصدقاءك واربح نقاطًا
        </h2>
        <p className="mt-1 text-[13px] leading-6 text-slate-900/55">
          كل صديق يسجّل من رابطك = <b className="text-amber-600">+25 نقطة</b> لك و+10 له. النقاط ترفع ترتيبك في لوحة الشرف 🏆
        </p>
        {!compact && (
          <div className="mt-3 flex items-center gap-2 rounded-2xl bg-[#171038]/30 px-3 py-2 ring-1 ring-slate-900/[0.07]" dir="ltr">
            <span className="min-w-0 flex-1 truncate text-left text-xs text-violet-600">{link}</span>
            <button onClick={() => void copy()} aria-label="نسخ رابط الدعوة" className="shrink-0 rounded-full bg-slate-900/[0.07] p-2 text-slate-900/80 transition hover:bg-slate-900/15">
              <Copy className="h-4 w-4" />
            </button>
          </div>
        )}
        <div className="mt-3 flex items-center gap-2">
          <button onClick={() => void share()} className="btn-primary flex items-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-bold text-slate-900">
            <Share2 className="h-4 w-4" /> مشاركة الرابط
          </button>
          <span className="ms-auto flex items-center gap-3 text-xs font-bold">
            <span className="flex items-center gap-1 text-amber-600">
              <Trophy className="h-4 w-4" /> {points ?? "…"} نقطة
            </span>
            <span className="text-slate-900/50">{invitedCount} صديق انضم</span>
          </span>
        </div>
      </div>
    </section>
  );
}
