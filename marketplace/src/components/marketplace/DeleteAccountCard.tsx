"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Icon } from "./Icon";
import { useI18n } from "@/lib/i18n/client";
import { useMarketplace } from "./marketplace-provider";
import { apiFetch } from "@/lib/api-client";

/**
 * In-app account deletion (required by Google Play and offered here so the web
 * app and the Android app behave the same). Two explicit steps, then a password
 * confirmation for accounts that have one.
 */
export function DeleteAccountCard({ onError }: { onError: (error: unknown) => void }) {
  const { t } = useI18n(); const router = useRouter(); const { user, refreshSession, notify } = useMarketplace();
  const [stage, setStage] = useState<"idle" | "confirm" | "password">("idle");
  const [password, setPassword] = useState(""); const [busy, setBusy] = useState(false);
  if (!user) return null;
  const remove = async (withPassword?: string) => {
    setBusy(true); onError(null);
    try {
      await apiFetch("/api/account", { method: "DELETE", json: { confirm: "DELETE", ...(withPassword ? { password: withPassword } : {}) } });
      refreshSession(); notify(t("accountDeleted")); router.push("/"); router.refresh();
    } catch (cause) { onError(cause); setStage("confirm"); }
    finally { setBusy(false); }
  };
  return <div className="settings-card danger-card">
    <h3><Icon name="info" size={17} />{t("accountDeleteTitle")}</h3>
    <p>{t("accountDeleteHint")}</p>
    {stage === "idle" && <button className="button-outline danger" disabled={busy} onClick={() => setStage("confirm")}>{t("accountDeleteCta")}</button>}
    {stage === "confirm" && <div className="danger-actions">
      <p className="danger-warning">{t("accountDeleteWarning")}</p>
      <div>
        <button className="button-outline" disabled={busy} onClick={() => setStage("idle")}>{t("cancel")}</button>
        <button className="button-dark danger" disabled={busy} onClick={() => setStage("password")}>{t("accountDeleteContinue")}</button>
      </div>
    </div>}
    {stage === "password" && <form className="stack-form danger-actions" onSubmit={(event) => { event.preventDefault(); void remove(password); }}>
      <label>{t("accountDeletePassword")}<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" dir="ltr" /></label>
      <small>{t("accountDeletePasswordHint")}</small>
      <div>
        <button type="button" className="button-outline" disabled={busy} onClick={() => setStage("confirm")}>{t("cancel")}</button>
        <button className="button-dark danger" disabled={busy}>{t(busy ? "loading" : "accountDeleteConfirm")}</button>
      </div>
    </form>}
    <Link className="subtle-link" href="/account-deletion">{t("accountDeletePolicy")}</Link>
  </div>;
}
