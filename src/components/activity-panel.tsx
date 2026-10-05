"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Wifi, WifiOff, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

type AiState = "checking" | "up" | "down";

interface NetworkInformationLike {
  effectiveType?: string;
  downlink?: number;
}

function speedLabel(ms: number | null): { text: string; tone: string } {
  if (ms === null) return { text: "—", tone: "text-slate-400" };
  if (ms < 300) return { text: "سريع جدًا", tone: "text-emerald-400" };
  if (ms < 900) return { text: "جيد", tone: "text-brand-300" };
  return { text: "بطيء", tone: "text-amber-400" };
}

export function ActivityPanel() {
  const [ai, setAi] = useState<AiState>("checking");
  const [latency, setLatency] = useState<number | null>(null);
  const [online, setOnline] = useState<boolean>(true);
  const [net, setNet] = useState<NetworkInformationLike | null>(null);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [busy, setBusy] = useState(false);

  const check = useCallback(async (): Promise<void> => {
    setBusy(true);
    const started = performance.now();
    try {
      const res = await fetch("/api/ai/status", { cache: "no-store" });
      setLatency(Math.round(performance.now() - started));
      setAi(res.ok ? "up" : "down");
    } catch {
      setLatency(null);
      setAi("down");
    } finally {
      setOnline(navigator.onLine);
      const conn = (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
      setNet(conn ? { effectiveType: conn.effectiveType, downlink: conn.downlink } : null);
      setCheckedAt(new Date());
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void check();
    const timer = window.setInterval(() => void check(), 30_000);
    const on = (): void => setOnline(true);
    const off = (): void => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, [check]);

  const speed = speedLabel(latency);
  const aiText = ai === "checking" ? "جارٍ الفحص…" : ai === "up" ? "يعمل" : "غير متاح حاليًا";

  return (
    <div className="mt-6 space-y-4" aria-live="polite">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-ink-800 p-4">
          <p className="text-xs text-slate-400">الذكاء الاصطناعي</p>
          <p
            className={cn(
              "mt-1 flex items-center gap-2 text-lg font-bold",
              ai === "up" && "text-emerald-400",
              ai === "down" && "text-rose-400",
              ai === "checking" && "text-slate-300"
            )}
          >
            <span
              className={cn(
                "h-2.5 w-2.5 rounded-full",
                ai === "up" ? "bg-emerald-400" : ai === "down" ? "bg-rose-400" : "bg-slate-500"
              )}
              aria-hidden
            />
            {aiText}
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-ink-800 p-4">
          <p className="text-xs text-slate-400">زمن الاستجابة</p>
          <p className="mt-1 flex items-center gap-2 text-lg font-bold text-white">
            <Zap className="h-4 w-4 text-brand-400" aria-hidden />
            {latency === null ? "—" : `${latency} ms`}
          </p>
          <p className={cn("text-sm font-semibold", speed.tone)}>{speed.text}</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-ink-800 p-4">
          <p className="text-xs text-slate-400">اتصالك</p>
          <p className="mt-1 flex items-center gap-2 text-lg font-bold text-white">
            {online ? (
              <Wifi className="h-4 w-4 text-emerald-400" aria-hidden />
            ) : (
              <WifiOff className="h-4 w-4 text-rose-400" aria-hidden />
            )}
            {online ? "متصل" : "غير متصل"}
          </p>
          {net?.effectiveType ? (
            <p className="text-sm text-slate-400">
              {net.effectiveType.toUpperCase()}
              {typeof net.downlink === "number" ? ` · ${net.downlink} Mb/s` : ""}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-400">
          {checkedAt ? `آخر فحص: ${checkedAt.toLocaleTimeString("ar-DZ")}` : "لم يتم الفحص بعد"}
        </p>
        <button
          type="button"
          onClick={() => void check()}
          disabled={busy}
          className="btn-ghost inline-flex items-center gap-2 !px-4 !py-2 text-sm disabled:opacity-60"
        >
          <RefreshCw className={cn("h-4 w-4", busy && "animate-spin")} aria-hidden />
          إعادة الفحص
        </button>
      </div>
    </div>
  );
}
