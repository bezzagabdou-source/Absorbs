"use client";

/**
 * NEXUS v20 — الهيكل الواقعي للهاتف (بلا أي مؤشر وهمي)
 * ---------------------------------------------------------------------------
 * A real device, not a rectangle: titanium chassis with side buttons, a status
 * bar that shows ONLY data the browser actually gives us, a Dynamic Island that
 * expands while Nexus speaks, a home indicator and a glass glare.
 *
 * Rule enforced here (v20): never lie.
 *  • battery      → rendered only if `navigator.getBattery()` really resolves;
 *                   there is no default percentage and no decorative shell.
 *  • network      → `navigator.onLine` (real) + `connection.effectiveType`
 *                   (real, when the browser exposes it). No painted signal bars.
 *  • mic / STT    → real `Permissions` state + real feature detection.
 *  • clock        → the device clock, refreshed every 15 s.
 * Everything else on the screen comes from the call itself (phase, mm:ss,
 * measured latency, engine, voice).
 */
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type Battery = { level: number; charging: boolean } | null;
type Net = { online: boolean; type: string } | null;
type MicState = "granted" | "denied" | "prompt" | "unknown";

function useClock(): string {
  const [t, setT] = useState(() => fmt(new Date()));
  useEffect(() => {
    const i = setInterval(() => setT(fmt(new Date())), 15_000);
    return () => clearInterval(i);
  }, []);
  return t;
}
function fmt(d: Date): string {
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

/** Real battery level — only when the browser supports the Battery API. */
function useBattery(): Battery {
  const [b, setB] = useState<Battery>(null);
  useEffect(() => {
    let alive = true;
    type BM = { level: number; charging: boolean; addEventListener: (t: string, f: () => void) => void };
    const nav = navigator as Navigator & { getBattery?: () => Promise<BM> };
    nav
      .getBattery?.()
      .then((bat) => {
        if (!alive) return;
        const read = () => setB({ level: Math.round((bat.level || 0) * 100), charging: !!bat.charging });
        read();
        bat.addEventListener("levelchange", read);
        bat.addEventListener("chargingchange", read);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  return b;
}

/** Real connectivity: online flag + effective connection type when exposed. */
function useNet(): Net {
  const [n, setN] = useState<Net>(null);
  useEffect(() => {
    const read = () => {
      const nav = navigator as Navigator & {
        connection?: { effectiveType?: string; downlink?: number; rtt?: number };
      };
      setN({
        online: navigator.onLine,
        type: nav.connection?.effectiveType ?? "",
      });
    };
    read();
    window.addEventListener("online", read);
    window.addEventListener("offline", read);
    return () => {
      window.removeEventListener("online", read);
      window.removeEventListener("offline", read);
    };
  }, []);
  return n;
}

/** Real microphone permission state (never guessed). */
function useMic(hot: boolean): MicState {
  const [s, setS] = useState<MicState>("unknown");
  useEffect(() => {
    let alive = true;
    const nav = navigator as Navigator & {
      permissions?: { query: (d: { name: string }) => Promise<{ state: string; addEventListener: (t: string, f: () => void) => void }> };
    };
    nav.permissions
      ?.query({ name: "microphone" })
      .then((p) => {
        if (!alive) return;
        const read = () => setS((p.state === "granted" || p.state === "denied" || p.state === "prompt" ? p.state : "unknown") as MicState);
        read();
        p.addEventListener?.("change", read);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [hot]);
  return s;
}

export function PhoneFrame({
  children,
  live,
  seconds,
  label,
  className,
  engine,
  latency,
  sttOk,
  ttsOk,
  voiceName,
}: {
  children: ReactNode;
  /** true while audio is playing / the mic is hot — the island reacts to it */
  live: boolean;
  seconds: number;
  /** short state text shown inside the island */
  label: string;
  className?: string;
  /** real engine label reported by the server (x-engine) — hidden when absent */
  engine?: string;
  /** real measured ms from "you stopped talking" to "first audio" */
  latency?: number | null;
  /** real feature detection, shown as-is */
  sttOk?: boolean;
  ttsOk?: boolean;
  /** the voice actually speaking right now */
  voiceName?: string;
}) {
  const clock = useClock();
  const battery = useBattery();
  const net = useNet();
  const mic = useMic(live);
  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");

  return (
    <div className={cn("pf-stage", className)}>
      <div className="pf-glow" aria-hidden />

      <div className="pf-device" data-live={live ? "1" : "0"}>
        {/* side buttons */}
        <span className="pf-btn pf-btn-silent" aria-hidden />
        <span className="pf-btn pf-btn-up" aria-hidden />
        <span className="pf-btn pf-btn-down" aria-hidden />
        <span className="pf-btn pf-btn-power" aria-hidden />

        <div className="pf-screen">
          {/* status bar — every item here is measured, nothing is painted for looks */}
          <div className="pf-status">
            <span className="pf-clock" dir="ltr">
              {clock}
            </span>
            <span className="pf-status-r">
              {net && (
                <span className="pf-chip" data-bad={net.online ? "0" : "1"} title={net.online ? "الاتصال شغال" : "ما كاينش اتصال"}>
                  <span className="pf-chip-dot" />
                  {net.online ? (net.type ? net.type.toUpperCase() : "متصل") : "بلا اتصال"}
                </span>
              )}
              {battery && (
                <span className="pf-chip" title="مستوى البطارية الحقيقي من المتصفح">
                  {battery.charging ? "⚡" : ""}
                  <span dir="ltr">{battery.level}%</span>
                </span>
              )}
            </span>
          </div>

          {/* dynamic island */}
          <div className="pf-island" data-live={live ? "1" : "0"} aria-hidden>
            <span className="pf-island-lens" />
            <span className="pf-island-mic" />
            <div className="pf-island-live">
              <span className="pf-wave">
                <i />
                <i />
                <i />
                <i />
                <i />
              </span>
              <span className="pf-island-t">{label}</span>
              <span className="pf-island-time" dir="ltr">
                {mm}:{ss}
              </span>
            </div>
          </div>

          {/* real capabilities strip */}
          <div className="pf-caps">
            <span className="pf-cap" data-on={mic === "granted" ? 1 : 0} data-bad={mic === "denied" ? 1 : 0}>
              مايك: {mic === "granted" ? "مسموح" : mic === "denied" ? "مرفوض" : mic === "prompt" ? "بانتظارك" : "غير معروف"}
            </span>
            <span className="pf-cap" data-on={sttOk ? 1 : 0} data-bad={sttOk ? 0 : 1}>
              تعرّف على الصوت: {sttOk ? "مدعوم" : "غير مدعوم"}
            </span>
            <span className="pf-cap" data-on={ttsOk ? 1 : 0} data-bad={ttsOk ? 0 : 1}>
              نطق: {ttsOk ? "مدعوم" : "غير مدعوم"}
            </span>
            {voiceName && <span className="pf-cap" data-on={1}>الصوت: {voiceName}</span>}
            {engine && <span className="pf-cap" data-on={1}>المحرّك: {engine}</span>}
            {typeof latency === "number" && latency > 0 && (
              <span className="pf-cap" data-on={1}>
                <span dir="ltr">{latency}ms</span> رد فعلي
              </span>
            )}
          </div>

          {/* the call UI */}
          <div className="pf-body">{children}</div>

          {/* home indicator + glass */}
          <span className="pf-home" aria-hidden />
          <span className="pf-glare" aria-hidden />
        </div>
      </div>
    </div>
  );
}
