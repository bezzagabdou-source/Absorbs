"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { Icon } from "./Icon";
import { Modal, ErrorNotice } from "./ui";
import { useI18n } from "@/lib/i18n/client";
import { useMarketplace } from "./marketplace-provider";
import { apiFetch } from "@/lib/api-client";
import type { AiAssistOutput } from "@/features/ai/schema";
type AssistResult = AiAssistOutput & { source?: "ai" | "offline"; provider?: string };
const suggestions = ["search", "listing", "safety"] as const;
export function AiAssistant({ onClose, initialMode = "search" }: { onClose: () => void; initialMode?: "listing" | "search" | "safety" }) {
  const { t, locale } = useI18n(); const { user } = useMarketplace();
  const [mode, setMode] = useState(initialMode); const [prompt, setPrompt] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState<unknown>(null); const [result, setResult] = useState<AssistResult | null>(null);
  const [engine, setEngine] = useState<{ configured: boolean; provider: string | null; model: string | null } | null>(null);
  useEffect(() => { let alive = true; apiFetch<{ configured: boolean; provider: string | null; model: string | null }>("/api/ai/status").then((status) => { if (alive) setEngine(status); }).catch(() => undefined); return () => { alive = false; }; }, []);
  const [engineLabel, setEngineLabel] = useState<string>("");
  useEffect(() => { if (!engine) return; setEngineLabel(engine.configured ? `${t("aiLiveEngine")} · ${engine.provider ?? ""}${engine.model ? ` · ${engine.model}` : ""}` : t("aiOfflineEngine")); }, [engine, t]);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (busy || !user) return; setBusy(true); setError(null); setResult(null);
    try { setResult(await apiFetch<AssistResult>("/api/ai/assist", { method: "POST", json: { mode, prompt: prompt.trim(), locale } })); }
    catch (cause) { setError(cause); }
    finally { setBusy(false); }
  };
  const label = result?.source === "offline" ? t("aiOfflineResult") : result?.provider ? result.provider : t("aiResult");
  return <Modal title={t("aiTitle")} onClose={onClose} className="ai-dialog">
    <div className="ai-intro"><span><Icon name="sparkles" size={22} /></span><p>{t("aiHint")}</p></div>
    {!user ? <div className="empty-results"><Icon name="lock" size={24} /><p>{t("aiLoginHint")}</p><Link className="button-dark" href="/login">{t("login")}</Link></div> : <>
      {/* Diagnostics line: only meaningful when the deployment has a provider key.
          Without one it would tell store reviewers the assistant is switched off. */}
      {engine?.configured && <p className="ai-engine">{engineLabel}</p>}
      <form className="stack-form" onSubmit={submit}>
        <div className="ai-modes" role="group" aria-label={t("aiMode")}>{suggestions.map((value) => <button type="button" key={value} aria-pressed={mode === value} className={mode === value ? "selected" : ""} onClick={() => { setMode(value); setResult(null); }}>{t(value === "search" ? "aiSearch" : value === "listing" ? "aiListing" : "aiSafety")}</button>)}</div>
        <label>{t("aiPrompt")}<textarea required minLength={3} maxLength={1200} rows={4} value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={t(mode === "listing" ? "aiListingPlaceholder" : mode === "safety" ? "aiSafetyPlaceholder" : "aiSearchPlaceholder")} /></label>
        <ErrorNotice error={error} />
        <button className="button-dark full-width" disabled={busy || prompt.trim().length < 3}><Icon name="sparkles" size={17} />{t(busy ? "aiThinking" : "aiAsk")}</button>
      </form>
    </>}
    {result && <section className="ai-result" aria-live="polite"><h3>{label}</h3>
      {result.title && <p><b>{result.title}</b></p>}
      {result.description && <p className="preserve-text">{result.description}</p>}
      {result.keywords.length > 0 && <div className="ai-keywords">{result.keywords.map((keyword) => <Link key={keyword} href={`/explore?q=${encodeURIComponent(keyword)}`} onClick={onClose}>{keyword}</Link>)}</div>}
      <p className="preserve-text">{result.advice}</p>
      {result.description && <button className="button-outline" onClick={() => { void navigator.clipboard.writeText(`${result.title ?? ""}\n\n${result.description ?? ""}`).then(() => onClose()); }}>{t("aiCopy")}</button>}
    </section>}
    <p className="ai-disclaimer"><Icon name="shield" size={14} />{t("aiDisclaimer")}</p>
  </Modal>;
}
