"use client";
import { useState, useEffect, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Icon } from "./Icon";
import { useI18n } from "@/lib/i18n/client";
import { useMarketplace } from "./marketplace-provider";
import { apiFetch } from "@/lib/api-client";
import { ErrorNotice, Breadcrumbs } from "./ui";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { GoogleSignIn } from "./GoogleSignIn";
export function AuthScreen() {
  const [register, setRegister] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState<unknown>(null); const [googleError, setGoogleError] = useState<string | null>(null);
  const { t, locale } = useI18n(); const { demo, refreshSession, notify } = useMarketplace(); const router = useRouter();
  const params = useSearchParams();
  // When the browser flow was started by the Android app, finish by returning to it.
  const [next, setNext] = useState<string | null>(null);
  useEffect(() => { const value = params.get("handoff") === "1" ? params.get("next") : null; setNext(value && value.startsWith("/") && !value.startsWith("//") ? value : null); }, [params]);
  const afterAuth = () => { if (next) window.location.replace(next); else { router.push("/dashboard"); router.refresh(); } };
  const submit = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setError(null); setGoogleError(null); try { await apiFetch(`/api/auth/${register ? "register" : "login"}`, { method: "POST", json: { email: form.get("email"), password: form.get("password"), ...(register ? { displayName: form.get("displayName"), role: form.get("role"), locale } : {}) } }); refreshSession(); notify(t("authSuccess")); afterAuth(); } catch (cause) { setError(cause); } finally { setBusy(false); } };
  const preview = async (role: "buyer" | "seller") => { setBusy(true); setError(null); try { await apiFetch("/api/auth/demo", { method: "POST", json: { role } }); refreshSession(); router.push(role === "seller" ? "/dashboard" : "/explore"); router.refresh(); } catch (cause) { setError(cause); } finally { setBusy(false); } };
  return <main className="market-container auth-page"><Breadcrumbs current={t("login")} /><section className="auth-card"><span className="auth-emblem"><Icon name="shieldCheck" size={30} /></span><p className="section-kicker">DZ EXCHANGE</p><h1>{t("authTitle")}</h1><p>{t(register ? "authRegisterHint" : "authHint")}</p><LanguageSwitcher expanded />
    <GoogleSignIn onError={setGoogleError} />
    {googleError && <div className="notice error-notice" role="alert"><Icon name="info" size={17} /><div>{t(googleError as "google_failed")}</div></div>}
    <form onSubmit={submit} className="stack-form">{register && <><label>{t("displayName")}<input name="displayName" required minLength={2} maxLength={120} autoComplete="nickname" /></label><label>{t("account")}<select name="role" defaultValue="buyer"><option value="buyer">{t("buyer")}</option><option value="seller">{t("seller")}</option></select></label></>}<label>{t("email")}<input name="email" type="email" required maxLength={320} autoComplete="email" dir="ltr" /></label><label>{t("password")}<input name="password" type="password" required minLength={register ? 12 : 1} maxLength={128} autoComplete={register ? "new-password" : "current-password"} dir="ltr" /><small>{t("passwordHint")}</small></label><ErrorNotice error={error} /><button className="button-dark full-width" disabled={busy}>{t(busy ? "loading" : register ? "register" : "login")}<Icon name="arrow" className="directional" size={17} /></button></form>
    <p className="auth-legal"><Icon name="lock" size={13} /><Link href="/privacy">{t("privacyPolicy")}</Link> · <Link href="/terms">{t("termsOfUse")}</Link> · <Link href="/account-deletion">{t("deleteAccount")}</Link></p>
    <button className="subtle-link" onClick={() => { setRegister(!register); setError(null); }}>{t(register ? "authSwitchLogin" : "authSwitchRegister")}</button>
    {demo && <div className="demo-login"><small>{t("demoLoginHint")}</small><div><button className="button-outline" disabled={busy} onClick={() => void preview("buyer")}>{t("demoBuyer")}</button><button className="button-outline" disabled={busy} onClick={() => void preview("seller")}>{t("demoSeller")}</button></div></div>}
  </section></main>;
}
