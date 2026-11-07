"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * Bounces the browser sign-in result back into the Android app.
 *
 * The deep link carries a 120-second, single-use code — never a session token —
 * so an intercepted link is useless after it is redeemed once or after it expires.
 */
export function AppReturn({ code }: { code: string }) {
  const [href] = useState(() => `dzexchange://auth?code=${encodeURIComponent(code)}`);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => { window.location.href = href; }, 400);
    // If the app opened, this page stays in the background — no manual step needed.
    const onHide = () => setDismissed(true);
    document.addEventListener("visibilitychange", onHide);
    return () => { clearTimeout(timer); document.removeEventListener("visibilitychange", onHide); };
  }, [href]);

  return (
    <div className="app-return">
      <a className="button-dark full-width" href={href}>Ouvrir DZ Exchange</a>
      {!dismissed && <p className="auth-legal">La session est transférée automatiquement.</p>}
      <p className="auth-legal"><Link href="/">Continuer sur le site</Link></p>
    </div>
  );
}
