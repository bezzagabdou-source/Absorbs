"use client";

import { useEffect, useState, type ReactNode } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

declare global {
  interface Window {
    __barqPwaPrompt?: BeforeInstallPromptEvent | null;
  }
}

/** Registers the service worker and captures the install prompt. */
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    const onLoad = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    };
    window.addEventListener("load", onLoad);
    return () => window.removeEventListener("load", onLoad);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      window.__barqPwaPrompt = e as BeforeInstallPromptEvent;
      window.dispatchEvent(new CustomEvent("barq:pwa-ready"));
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  return null;
}

/** A button that triggers the PWA install prompt (hides itself if unsupported). */
export function InstallButton({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    if (window.__barqPwaPrompt) setAvailable(true);
    const ready = () => setAvailable(true);
    const installed = () => setAvailable(false);
    window.addEventListener("barq:pwa-ready", ready);
    window.addEventListener("appinstalled", installed);
    return () => {
      window.removeEventListener("barq:pwa-ready", ready);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);

  if (!available) return null;

  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        const prompt = window.__barqPwaPrompt;
        if (!prompt) return;
        await prompt.prompt();
        const choice = await prompt.userChoice;
        if (choice.outcome === "accepted") {
          window.__barqPwaPrompt = null;
          setAvailable(false);
        }
      }}
    >
      {children}
    </button>
  );
}
