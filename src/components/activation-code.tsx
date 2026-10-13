"use client";

import { useState } from "react";
import { Check, KeyRound } from "lucide-react";
import { apiFetch, useAuth } from "@/lib/auth-context";
import { PrimaryButton } from "@/components/ui";

const MSG: Record<string, string> = {
  INVALID_CODE: "الكود غير صحيح.",
  USED: "هذا الكود مستعمل من قبل.",
  RATE: "محاولات كثيرة — انتظر دقيقة.",
  UNAUTHENTICATED: "سجّل الدخول أولًا.",
};

/** Redeems an activation code through /api/billing/redeem. */
export function ActivationCode() {
  const { profile, refreshProfile } = useAuth();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const redeem = async () => {
    if (!code.trim()) return;
    setBusy(true);
    setNote(null);
    try {
      const r = await apiFetch("/api/billing/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const d = (await r.json().catch(() => ({}))) as { ok?: boolean; days?: number; code?: string };
      if (r.ok && d.ok) {
        setNote({ ok: true, text: `تم التفعيل — Pro لمدة ${d.days} يومًا.` });
        setCode("");
        await refreshProfile();
      } else setNote({ ok: false, text: MSG[d.code ?? ""] ?? "تعذّر التفعيل. حاول لاحقًا." });
    } catch {
      setNote({ ok: false, text: "تحقّق من اتصال الإنترنت." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="glass rounded-2xl p-4">
      <div className="mb-2 flex items-center gap-2 text-[13px] font-bold">
        <KeyRound className="size-4 text-(--gold)" />
        كود التفعيل
        {profile?.paidPro && (
          <span className="ms-auto flex items-center gap-1 text-[11px] font-semibold text-emerald-400">
            <Check className="size-3" /> Pro نشط
          </span>
        )}
      </div>
      <div className="flex gap-2" dir="ltr">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === "Enter" && void redeem()}
          placeholder="BQXXXXXXXX"
          maxLength={40}
          className="glass min-w-0 flex-1 rounded-xl px-3 py-2 text-sm tracking-widest outline-none focus:ring-2 focus:ring-(--gold)/40"
        />
        <PrimaryButton loading={busy} onClick={() => void redeem()} className="px-4! py-2!">
          تفعيل
        </PrimaryButton>
      </div>
      {note && <p className={`mt-2 text-[12px] ${note.ok ? "text-emerald-400" : "text-red-400"}`}>{note.text}</p>}
    </div>
  );
}
