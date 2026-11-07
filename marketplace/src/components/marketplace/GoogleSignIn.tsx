"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./Icon";
import { apiFetch } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n/client";
import { useMarketplace } from "./marketplace-provider";
import { googleEnabled, googleErrorCode, signInWithGoogle } from "@/lib/firebase-client";

/** Adds a tiny UA marker so the site knows it is running inside the Android shell. */
export const isAndroidApp = () => typeof navigator !== "undefined" && /DZExchangeApp/i.test(navigator.userAgent);

export function GoogleSignIn({ onError }: { onError: (code: string | null) => void }) {
  const { t } = useI18n(); const router = useRouter(); const { refreshSession, notify } = useMarketplace();
  const [available, setAvailable] = useState(false); const [busy, setBusy] = useState(false);
  const [handoff, setHandoff] = useState<string | null>(null);
  useEffect(() => {
    setAvailable(googleEnabled());
    const url = new URL(window.location.href);
    setHandoff(url.searchParams.get("handoff") === "1" ? url.searchParams.get("next") : null);
  }, []);
  if (!available) return null;

  const start = async () => {
    setBusy(true); onError(null);
    // Google's OAuth screen cannot be shown inside the Android WebView, so the
    // app bounces this URL to the real browser, which signs in and comes back
    // through the dzexchange:// deep link.
    if (isAndroidApp() && !handoff) { window.location.assign("/login?handoff=1"); return; }
    try {
      const outcome = await signInWithGoogle();
      if ("redirecting" in outcome) return;
      await apiFetch("/api/auth/google", { method: "POST", json: { idToken: outcome.idToken } });
      refreshSession(); notify(t("authSuccess"));
      // Inside the app the browser session is handed back through a deep link.
      if (handoff) window.location.replace(handoff);
      else { router.push("/dashboard"); router.refresh(); }
    } catch (cause) { onError(googleErrorCode(cause)); }
    finally { setBusy(false); }
  };

  return <>
    <div className="auth-divider"><span>{t("orContinueWith")}</span></div>
    <button type="button" className="google-button" onClick={() => void start()} disabled={busy} aria-label={t("googleSignIn")}>
      <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true"><path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h11.8c-.5 2.7-2 5-4.4 6.5v5.4h7.1c4.2-3.8 6.6-9.4 6.6-15.9z"/><path fill="#34A853" d="M24 46c6 0 11-2 14.6-5.4l-7.1-5.4c-2 1.3-4.5 2.1-7.5 2.1-5.8 0-10.7-3.9-12.5-9.2H4.2v5.6C7.8 41.1 15.3 46 24 46z"/><path fill="#FBBC05" d="M11.5 28.1c-.5-1.4-.7-2.8-.7-4.1s.3-2.8.7-4.1v-5.6H4.2C2.8 17.1 2 20.4 2 24s.8 6.9 2.2 9.7l7.3-5.6z"/><path fill="#EA4335" d="M24 10.8c3.3 0 6.2 1.1 8.5 3.3l6.3-6.3C35 4.3 30 2 24 2 15.3 2 7.8 6.9 4.2 14.3l7.3 5.6C13.3 14.7 18.2 10.8 24 10.8z"/></svg>
      {t(busy ? "loading" : "googleSignIn")}
      <Icon name="arrow" className="directional" size={15} />
    </button>
    {isAndroidApp() && !handoff && <p className="auth-legal"><Icon name="info" size={13} />{t("googleBrowserHint")}</p>}
  </>;
}
