"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Brain, Crown, Loader2, Plus, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useCredits } from "@/components/app/app-shell";
import { SettingsFrame } from "@/components/settings-ui";

type Mem = { id: string; content: string; source: string; createdAt: string };

export default function MemoryPage() {
  const { authFetch } = useAuth();
  const { profile } = useCredits();
  const isPro = profile?.plan === "pro";
  const [items, setItems] = useState<Mem[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await authFetch("/api/memory");
      if (r.ok) setItems(((await r.json()) as { memories: Mem[] }).memories);
    } catch {
      /* offline */
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    void load();
  }, [load]);

  const add = async () => {
    const content = text.trim();
    if (content.length < 3 || busy) return;
    setBusy(true);
    setMsg("");
    try {
      const r = await authFetch("/api/memory", { method: "POST", body: JSON.stringify({ content }) });
      if (r.ok) {
        const d = (await r.json()) as { memory: Mem };
        setItems((l) => [d.memory, ...l]);
        setText("");
      } else if (r.status === 409) setMsg("الذاكرة ممتلئة (60 معلومة). احذف بعضها أولًا.");
      else setMsg("تعذّر الحفظ، حاول مرة أخرى.");
    } catch {
      setMsg("تعذّر الحفظ، تحقق من الاتصال.");
    }
    setBusy(false);
  };

  const remove = async (id: string) => {
    setItems((l) => l.filter((m) => m.id !== id));
    await authFetch(`/api/memory?id=${id}`, { method: "DELETE" }).catch(() => undefined);
  };

  const wipe = async () => {
    if (!confirm("سيتم مسح كل ما يتذكره Nexus AI v8.4 عنك. متأكد؟")) return;
    setItems([]);
    await authFetch("/api/memory?all=1", { method: "DELETE" }).catch(() => undefined);
  };

  return (
    <SettingsFrame title="ذاكرة Nexus AI v8.4">
      <p className="text-sm leading-relaxed text-slate-400">
        اكتب هنا ما تريد أن يتذكره Nexus AI v8.4 في <b className="text-slate-200">كل محادثة</b> (اسمك، مشروعك، لغتك البرمجية، أسلوبك المفضل…).
        يمكنك أيضًا قول «تذكّر أن …» داخل المحادثة وسيحفظه تلقائيًا.
      </p>

      {!isPro && (
        <div className="glass flex items-center gap-3 rounded-2xl border-amber-300/25 p-4">
          <Crown className="h-6 w-6 shrink-0 text-amber-300" />
          <p className="flex-1 text-sm font-bold text-amber-100">الذاكرة طويلة المدى ميزة في Nexus AI v8.4 Pro.</p>
          <Link href="/app/upgrade" className="btn-primary px-4 py-2 text-xs">
            ترقية
          </Link>
        </div>
      )}

      <div className="glass rounded-2xl p-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, 400))}
          rows={2}
          placeholder="مثال: أبرمج بـ Next.js وأفضّل الشروحات المختصرة"
          className="block w-full resize-none bg-transparent p-2 text-[16px] leading-relaxed text-slate-100 outline-none placeholder:text-slate-500"
        />
        <div className="flex items-center justify-between px-1 pt-1">
          <span className="text-[11px] font-bold tabular-nums text-slate-500">{text.length}/400</span>
          <button
            type="button"
            onClick={() => void add()}
            disabled={busy || text.trim().length < 3}
            className="btn-primary px-5 py-2 text-sm disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            حفظ
          </button>
        </div>
      </div>
      {msg && <p className="text-center text-sm font-bold text-rose-300">{msg}</p>}

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="shimmer-line h-14 rounded-2xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="glass rounded-2xl p-8 text-center text-sm text-slate-400">
          <Brain className="mx-auto mb-2 h-7 w-7 text-brand-300" />
          لا توجد ذكريات بعد.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((m) => (
            <li key={m.id} className="glass flex items-start gap-3 rounded-2xl p-3.5">
              <Brain className="mt-0.5 h-4.5 w-4.5 shrink-0 text-amber-300" />
              <p className="min-w-0 flex-1 break-words text-sm leading-relaxed text-slate-200">{m.content}</p>
              <button
                type="button"
                onClick={() => void remove(m.id)}
                aria-label="حذف"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-500 transition hover:bg-rose-500/15 hover:text-rose-300"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {items.length > 0 && (
        <button type="button" onClick={() => void wipe()} className="w-full text-center text-xs font-bold text-rose-300/80 hover:text-rose-300">
          مسح كل الذاكرة
        </button>
      )}
    </SettingsFrame>
  );
}
