"use client";

import { useEffect, useState } from "react";
import { Loader2, UserRoundX, UsersRound, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { fetchFollowList } from "@/lib/queries";
import { useAuth } from "@/components/providers/auth-provider";
import { UserRow } from "@/components/social/user-actions";
import type { Profile } from "@/lib/types";

/** Instagram-style bottom sheet listing a profile's followers or following. */
export function FollowListModal({
  profileId,
  username,
  kind,
  onClose,
}: {
  profileId: string;
  username: string;
  kind: "followers" | "following";
  onClose: () => void;
}) {
  const { user } = useAuth();
  const [people, setPeople] = useState<Profile[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    fetchFollowList(supabase, profileId, kind)
      .then((list) => {
        if (!cancelled) setPeople(list);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [profileId, kind]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={kind === "followers" ? "المتابعون" : "أتابعهم"}>
      <button className="absolute inset-0 bg-[#070714]/60 backdrop-blur-[3px]" aria-label="إغلاق" onClick={onClose} />
      <div className="glass-strong animate-fade-up relative flex max-h-[82dvh] w-full max-w-[480px] flex-col overflow-hidden rounded-t-[28px] sm:rounded-[28px]">
        <div className="flex items-center justify-between border-b border-slate-900/[0.06] px-5 py-3.5">
          <p className="flex items-center gap-2 text-base font-black text-slate-900">
            <UsersRound className="h-5 w-5 text-violet-600" />
            {kind === "followers" ? `متابعو @${username}` : `من يتابع @${username}`}
            {people && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-black text-violet-700">{people.length}</span>}
          </p>
          <button onClick={onClose} aria-label="إغلاق" className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-900/5 active:scale-90">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 space-y-2 overflow-y-auto p-4">
          {people === null ? (
            error ? (
              <p className="py-10 text-center text-sm font-semibold text-red-500">تعذّر تحميل القائمة — تحقق من الاتصال.</p>
            ) : (
              <p className="flex items-center justify-center gap-2 py-10 text-sm font-semibold text-slate-500">
                <Loader2 className="h-5 w-5 animate-spin" /> جارٍ التحميل…
              </p>
            )
          ) : people.length === 0 ? (
            <p className="flex flex-col items-center gap-2 py-10 text-center text-sm font-semibold text-slate-500">
              <UserRoundX className="h-8 w-8 text-slate-400" />
              {kind === "followers" ? "لا متابعون بعد — كن أول من يتابع!" : "لا يتابع أحدًا بعد."}
            </p>
          ) : (
            people.map((person) => <UserRow key={person.id} person={person} />)
          )}
        </div>
      </div>
    </div>
  );
}
