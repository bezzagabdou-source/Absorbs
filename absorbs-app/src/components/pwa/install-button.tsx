"use client";

import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** Beautiful "Install app" card — uses beforeinstallprompt, with iOS instructions fallback. */
export function InstallButton({ variant = "card" }: { variant?: "card" | "row" }) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setInstalled(standalone);
    setIsIOS(/iphone|ipad|ipod/i.test(window.navigator.userAgent));
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed || dismissed || (!deferred && !isIOS)) return null;

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    if (choice.outcome === "accepted") setInstalled(true);
    setDeferred(null);
  };

  if (variant === "row") {
    return (
      <button
        onClick={install}
        className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-start text-sm text-white/85 transition hover:bg-white/[0.05]"
      >
        <Download className="h-5 w-5 text-teal-200" />
        تثبيت التطبيق على الجهاز
      </button>
    );
  }

  return (
    <div className="glass relative overflow-hidden rounded-[28px] p-4">
      <div className="pointer-events-none absolute -top-10 -start-10 h-32 w-32 rounded-full bg-emerald-500/30 blur-3xl" />
      <button onClick={() => setDismissed(true)} aria-label="إغلاق" className="absolute end-3 top-3 text-white/40 transition hover:text-white">
        <X className="h-4 w-4" />
      </button>
      <div className="relative flex items-center gap-3">
        <span className="logo-mark h-12 w-12 shrink-0 rounded-2xl text-lg">A</span>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-white">ثبّت تطبيق DZ CONNECT</p>
          <p className="text-xs leading-5 text-white/55">
            {isIOS && !deferred
              ? "من متصفح سفاري: زر المشاركة ثم «إضافة إلى الشاشة الرئيسية»"
              : "تجربة أسرع بملء الشاشة، تعمل حتى بدون إنترنت"}
          </p>
        </div>
        {deferred ? (
          <button onClick={install} className="btn-primary shrink-0 rounded-full px-4 py-2 text-sm font-bold text-white">
            تثبيت
          </button>
        ) : (
          <Share className="h-5 w-5 shrink-0 text-teal-200" />
        )}
      </div>
    </div>
  );
}
