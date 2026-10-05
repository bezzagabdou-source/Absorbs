"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useCredits } from "@/components/app/app-shell";
import { ProActivation } from "@/components/pro-activation";

/** Event fired right after a code is redeemed / a payment succeeds. */
export const PRO_ACTIVATED_EVENT = "barq:pro-activated";
export const PRO_SHOW_TOUR_EVENT = "barq:pro-tour";

/**
 * Mounted once inside the app shell. Shows the legendary activation screen:
 *  - right after a successful activation (event),
 *  - the first time a Pro account opens v8 on this device,
 *  - on demand ("show me v8 Pro" button).
 */
export function ProWelcomeGate() {
  const { user } = useAuth();
  const { profile } = useCredits();
  const [open, setOpen] = useState(false);
  const [fresh, setFresh] = useState(true);
  const shown = useRef(false);
  const uid = user?.uid ?? "";

  const key = `barq_v8_welcome_${uid}`;

  const close = useCallback(() => {
    setOpen(false);
    try {
      localStorage.setItem(key, "1");
    } catch {
      /* private mode */
    }
  }, [key]);

  useEffect(() => {
    const onAct = () => {
      setFresh(true);
      setOpen(true);
    };
    const onTour = () => {
      setFresh(false);
      setOpen(true);
    };
    window.addEventListener(PRO_ACTIVATED_EVENT, onAct);
    window.addEventListener(PRO_SHOW_TOUR_EVENT, onTour);
    return () => {
      window.removeEventListener(PRO_ACTIVATED_EVENT, onAct);
      window.removeEventListener(PRO_SHOW_TOUR_EVENT, onTour);
    };
  }, []);

  // first time this Pro account is seen on this device
  useEffect(() => {
    if (shown.current || !uid || profile?.plan !== "pro") return;
    shown.current = true;
    try {
      if (localStorage.getItem(key) === "1") return;
    } catch {
      return;
    }
    setFresh(true);
    setOpen(true);
  }, [uid, profile?.plan, key]);

  return <ProActivation open={open} onClose={close} fresh={fresh} />;
}
