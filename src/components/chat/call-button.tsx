"use client";

import { cn } from "@/lib/utils";

/** Voice-call button: a waveform inside a soft glowing pill (idle: gentle wave, in a call: lively wave + ring). */
export function CallButton({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label="مكالمة صوتية"
      title="مكالمة صوتية مباشرة مع Nexus AI"
      className={cn("call-btn grid h-9 w-9 shrink-0 place-items-center rounded-full transition active:scale-90", active && "call-btn-live")}
    >
      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden>
        {[3, 7.5, 12, 16.5, 21].map((x, i) => (
          <rect key={x} className="call-bar" x={x - 1.1} y="6" width="2.2" height="12" rx="1.1" fill="currentColor" style={{ animationDelay: `${i * 0.12}s` }} />
        ))}
      </svg>
    </button>
  );
}
