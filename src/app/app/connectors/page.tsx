"use client";

/**
 * Nexus AI v15 — Connectors.
 * One place to link the apps Nexus can act on. A connector whose server
 * credentials are missing shows as "غير مُهيّأ" instead of failing on click.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Link2, Loader2, Plug, Search, ShieldCheck, X } from "lucide-react";
import {
  CONNECTORS,
  CONNECTOR_CATEGORIES,
  loadConnectorStates,
  setConnectorState,
  type Connector,
  type ConnectorCategory,
  type ConnectorState,
  type ConnectorId,
} from "@/lib/connectors";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

export default function ConnectorsPage() {
  const { authFetch } = useAuth();
  const [states, setStates] = useState<Record<string, ConnectorState>>({});
  const [live, setLive] = useState<Record<string, boolean> | null>(null);
  const [busy, setBusy] = useState("");
  const [cat, setCat] = useState<ConnectorCategory | "الكل">("الكل");
  const [q, setQ] = useState("");
  const [sheet, setSheet] = useState<Connector | null>(null);

  useEffect(() => {
    setStates(loadConnectorStates());
  }, []);

  // v15.2: the OAuth popup posts back here when the round trip finishes.
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const m = e.data as { source?: string; data?: { ok?: boolean; id?: string; name?: string } };
      if (m?.source !== "nexus-connector" || !m.data?.ok || !m.data.id) return;
      setConnectorState(m.data.id as ConnectorId, { id: m.data.id as ConnectorId, linkedAt: Date.now() });
      setStates(loadConnectorStates());
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  useEffect(() => {
    let dead = false;
    void authFetch("/api/connectors")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { configured?: Record<string, boolean> } | null) => {
        if (!dead) setLive(j?.configured ?? {});
      })
      .catch(() => {
        if (!dead) setLive({});
      });
    return () => {
      dead = true;
    };
  }, [authFetch]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return CONNECTORS.filter(
      (c) =>
        (cat === "الكل" || c.category === cat) &&
        (!needle || c.name.toLowerCase().includes(needle) || c.blurb.includes(needle))
    );
  }, [cat, q]);

  const linkedCount = Object.keys(states).length;

  const toggle = useCallback(
    async (c: Connector) => {
      setBusy(c.id);
      try {
        if (states[c.id]) {
          setConnectorState(c.id, null);
          setStates(loadConnectorStates());
          return;
        }
        const r = await authFetch(`/api/connectors/${c.id}/start`, { method: "POST" });
        const j = (await r.json().catch(() => ({}))) as { url?: string; error?: string };
        if (j.url) {
          window.open(j.url, "_blank", "noopener,width=520,height=680");
          return;
        }
        // No server credentials: show the sheet explaining what is needed.
        setSheet(c);
      } finally {
        setBusy("");
      }
    },
    [authFetch, states]
  );

  return (
    <div className="v12-page v12-grain nx-wide px-4 pb-16 pt-5 sm:px-6">
      <div className="v12-sky" />

      <header className="v12-in mb-5">
        <div className="flex items-center gap-2.5">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--v12-card-2)] ring-1 ring-[var(--v12-line)]">
            <Plug className="h-5 w-5 text-[var(--v12-accent)]" />
          </span>
          <div>
            <h1 className="v12-display text-[clamp(24px,4.5vw,34px)]">الموصّلات</h1>
            <p className="text-[13.5px] text-[var(--v12-dim)]">
              {linkedCount > 0 ? `${linkedCount} مربوط` : "اربط تطبيقاتك باش نكسوس يخدم فيهم مباشرة"}
            </p>
          </div>
        </div>
      </header>

      <div className="v12-in mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto h-4 w-4 text-[var(--v12-faint)]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="دوّر على تطبيق…"
            className="w-full rounded-xl border border-[var(--v12-line)] bg-[var(--v12-card-2)] py-2.5 pe-3 ps-9 text-[14px] text-[var(--v12-text)] outline-none placeholder:text-[var(--v12-faint)] focus:border-[var(--v12-accent)]"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(["الكل", ...CONNECTOR_CATEGORIES] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCat(c)}
              className={cn("v12-chip !px-3 !py-1.5", cat === c && "!border-[var(--v12-accent)] !text-[var(--v12-text)]")}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="v12-in grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((c) => {
          const linked = Boolean(states[c.id]);
          const configured = live === null ? null : Boolean(live[c.id]);
          return (
            <div key={c.id} className="v12-card flex flex-col gap-3 p-3.5">
              <div className="flex items-start gap-3">
                <span className="nx-conn-ico" style={{ background: c.tone, color: c.tone === "#ffffff" || c.tone === "#f0f6fc" ? "#111" : "#fff" }}>
                  {c.mark}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-[14.5px] font-semibold text-[var(--v12-text)]">
                    {c.name}
                    {linked && <Check className="h-3.5 w-3.5 flex-none text-emerald-400" />}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-[12.5px] text-[var(--v12-dim)]">{c.blurb}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-1">
                {c.capabilities.slice(0, 3).map((cap) => (
                  <span key={cap} className="v12-chip !px-2 !py-0.5 !text-[10.5px]">
                    {cap}
                  </span>
                ))}
              </div>

              <button
                type="button"
                disabled={busy === c.id || configured === false}
                onClick={() => void toggle(c)}
                className={cn(
                  "v12-btn w-full !py-2.5 text-[13px]",
                  linked ? "" : "v12-btn-primary",
                  configured === false && "cursor-not-allowed opacity-45"
                )}
              >
                {busy === c.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : linked ? (
                  <X className="h-3.5 w-3.5" />
                ) : (
                  <Link2 className="h-3.5 w-3.5" />
                )}
                {configured === false ? "غير مُهيّأ" : linked ? "فكّ الربط" : "اربط"}
              </button>
            </div>
          );
        })}
      </div>

      <p className="v12-in mt-5 flex items-start gap-2 text-[12.5px] text-[var(--v12-faint)]">
        <ShieldCheck className="mt-0.5 h-4 w-4 flex-none" />
        الرموز تتخزّن مشفّرة على الخادم فقط — ما يوصلوش لمتصفحك ولا للنماذج. تقدر تفكّ أي ربط فأي وقت.
      </p>

      {sheet && (
        <div
          role="dialog"
          aria-modal
          className="fixed inset-0 z-[200] grid place-items-end bg-black/60 p-0 sm:place-items-center sm:p-6"
          onClick={() => setSheet(null)}
        >
          <div
            className="v12-card w-full max-w-md space-y-3 rounded-b-none p-5 sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <span className="nx-conn-ico" style={{ background: sheet.tone, color: "#fff" }}>
                {sheet.mark}
              </span>
              <h2 className="text-[16px] font-bold text-[var(--v12-text)]">{sheet.name}</h2>
            </div>
            <p className="text-[13.5px] text-[var(--v12-dim)]">
              هاد الموصّل محتاج بيانات اعتماد OAuth فالخادم. زيد{" "}
              <code className="rounded bg-black/30 px-1.5 py-0.5 text-[12px] text-[var(--v12-accent)]">{sheet.envKey}</code>{" "}
              (ومعاه الـsecret) فملف <code className="rounded bg-black/30 px-1.5 py-0.5 text-[12px]">.env</code> وأعد التشغيل.
            </p>
            <div>
              <p className="mb-1.5 text-[12px] font-semibold text-[var(--v12-faint)}">الصلاحيات المطلوبة</p>
              <div className="flex flex-wrap gap-1">
                {sheet.scopes.length ? (
                  sheet.scopes.map((s) => (
                    <span key={s} className="v12-chip !px-2 !py-0.5 !text-[10.5px]">
                      {s}
                    </span>
                  ))
                ) : (
                  <span className="text-[12.5px] text-[var(--v12-dim)]">رمز بوت فقط</span>
                )}
              </div>
            </div>
            <button type="button" onClick={() => setSheet(null)} className="v12-btn w-full !py-2.5">
              فهمت
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
