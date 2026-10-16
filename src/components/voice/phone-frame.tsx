"use client";

/**
 * NEXUS v19 — الهيكل الواقعي للهاتف
 * ---------------------------------------------------------------------------
 * A real device, not a rectangle: titanium chassis with side buttons, a live
 * status bar (real clock, signal, wifi, real battery level when the browser
 * exposes it), a Dynamic Island that expands while Nexus speaks, a home
 * indicator, and a glass glare. On a phone the chassis disappears and the call
 * fills the screen edge-to-edge — exactly like a native call app.
 */
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type Battery = { level: number; charging: boolean } | null;

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

/** Real battery level when the browser supports the Battery API. */
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

export function PhoneFrame({
  children,
  live,
  seconds,
  label,
  className,
}: {
  children: ReactNode;
  /** true while audio is playing / the mic is hot — the island reacts to it */
  live: boolean;
  seconds: number;
  /** short state text shown inside the island */
  label: string;
  className?: string;
}) {
  const clock = useClock();
  const battery = useBattery();
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
          {/* status bar */}
          <div className="pf-status" aria-hidden>
            <span className="pf-clock" dir="ltr">
              {clock}
            </span>
            <span className="pf-status-r">
              <svg width="18" height="12" viewBox="0 0 18 12" fill="currentColor">
                <rect x="0" y="8" width="3" height="4" rx="1" />
                <rect x="4.6" y="6" width="3" height="6" rx="1" />
                <rect x="9.2" y="3.4" width="3" height="8.6" rx="1" />
                <rect x="13.8" y="0.6" width="3" height="11.4" rx="1" opacity=".45" />
              </svg>
              <svg width="16" height="12" viewBox="0 0 16 12" fill="none" stroke="currentColor" strokeWidth="1.4">
                <path d="M1 4.2a10 10 0 0 1 14 0" strokeLinecap="round" />
                <path d="M3.6 6.8a6.4 6.4 0 0 1 8.8 0" strokeLinecap="round" />
                <circle cx="8" cy="9.6" r="1.1" fill="currentColor" stroke="none" />
              </svg>
              <span className="pf-batt">
                <span className="pf-batt-shell">
                  <span className="pf-batt-fill" style={{ width: `${battery ? Math.max(6, battery.level) : 78}%` }} data-low={battery && battery.level <= 20 ? "1" : "0"} />
                </span>
                <span className="pf-batt-tip" />
                {battery && <span className="pf-batt-n">{battery.charging ? "⚡" : ""}{battery.level}%</span>}
              </span>
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
