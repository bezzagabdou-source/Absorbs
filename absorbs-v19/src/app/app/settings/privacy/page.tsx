"use client";

import { useState } from "react";
import { FileText, ShieldCheck, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Row, SettingsFrame } from "@/components/settings-ui";

export default function PrivacyPage() {
  const { authFetch } = useAuth();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const wipe = async () => {
    if (!confirm("سيتم حذف كل محادثاتك نهائيًا. متأكد؟")) return;
    setBusy(true);
    setMsg("");
    try {
      const r = await authFetch("/api/history");
      const d = await r.json();
      const list: { id: string | number }[] = d.conversations ?? d.items ?? (Array.isArray(d) ? d : []);
      await Promise.all(list.map((c) => authFetch(`/api/conversations/${c.id}`, { method: "DELETE" })));
      setMsg(`تم حذف ${list.length} محادثة ✓`);
    } catch {
      setMsg("تعذّر الحذف، حاول مرة أخرى.");
    }
    setBusy(false);
  };

  return (
    <SettingsFrame title="الخصوصية">
      <Row icon={ShieldCheck} title="سياسة الخصوصية" desc="كيف نحمي بياناتك" href="/privacy" />
      <Row icon={FileText} title="شروط الاستخدام" href="/terms" />
      <button type="button" onClick={wipe} disabled={busy} className="w-full text-start disabled:opacity-50">
        <Row danger icon={Trash2} title={busy ? "جارٍ الحذف…" : "حذف كل محادثاتي"} desc="لا يمكن التراجع عن هذا الإجراء." />
      </button>
      {msg && <p className="text-center text-sm font-bold text-brand-300">{msg}</p>}
    </SettingsFrame>
  );
}
