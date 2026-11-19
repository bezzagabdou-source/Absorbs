"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const CONSENT = "mediators_analytics_consent";
const VISITOR = "mediators_visitor_id";

export default function VisitorTracker() {
  const pathname = usePathname();
  const [choice, setChoice] = useState<string | null>(null);

  useEffect(() => {
    setChoice(localStorage.getItem(CONSENT));
  }, []);

  useEffect(() => {
    if (choice !== "yes") return;
    let visitorId = localStorage.getItem(VISITOR);
    if (!visitorId) {
      visitorId = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(VISITOR, visitorId);
    }
    fetch("/api/visitors", {
      method: "POST", keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visitorId, path: pathname || "/", userAgent: navigator.userAgent, referrer: document.referrer ? new URL(document.referrer).origin : "" }),
    }).catch(() => {});
  }, [choice, pathname]);

  if (choice !== null || typeof window === "undefined") return null;
  const choose = (value: "yes" | "no") => {
    localStorage.setItem(CONSENT, value);
    setChoice(value);
  };
  return <aside dir="rtl" style={{ position: "fixed", zIndex: 1000, insetInline: 16, bottom: 16, maxWidth: 620, marginInline: "auto", padding: "18px 20px", borderRadius: 22, background: "#fff", color: "#173b2d", boxShadow: "0 18px 55px #12482c35", border: "1px solid #dceee2", fontFamily: "system-ui" }}>
    <strong>🍪 خصوصيتك تهمنا</strong>
    <p style={{ margin: "8px 0 14px", lineHeight: 1.7, fontSize: 14 }}>بموافقتك نسجل معرّفاً عشوائياً للمتصفح والصفحات التي تزورها وإحصاء الزيارات، دون حفظ عنوان IP. مستخدمو البوت يظهرون بشكل منفصل عند الضغط على /start.</p>
    <div style={{ display: "flex", gap: 10 }}>
      <button onClick={() => choose("yes")} style={{ border: 0, borderRadius: 999, background: "#138a51", color: "white", padding: "10px 18px", fontWeight: 800, cursor: "pointer" }}>موافق</button>
      <button onClick={() => choose("no")} style={{ border: "1px solid #d6e6dc", borderRadius: 999, background: "#f6faf7", color: "#365346", padding: "10px 18px", fontWeight: 700, cursor: "pointer" }}>لا شكراً</button>
    </div>
  </aside>;
}
