"use client";
import { useEffect, useRef, type ReactNode } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n/client";
import { errorMessage, fieldErrors } from "@/lib/api-client";
import { Icon, type IconName } from "./Icon";
export function ErrorNotice({ error }: { error: unknown }) { const { t, locale } = useI18n(); if (!error) return null; const fields = fieldErrors(error, locale); return <div className="notice error-notice" role="alert"><Icon name="info" size={17} /><div>{errorMessage(error, locale)}{fields.map((field) => <small key={field}>{field}</small>)}</div></div>; }
export function Loading({ label }: { label?: string }) { const { t } = useI18n(); return <div className="loading-state" role="status"><span className="spinner" />{label ?? t("loading")}</div>; }
export function EmptyState({ icon = "box", title, hint, children }: { icon?: IconName; title: string; hint?: string; children?: ReactNode }) { return <div className="empty-results"><span><Icon name={icon} size={25} /></span><h3>{title}</h3>{hint && <p>{hint}</p>}{children}</div>; }
export function AuthGate({ seller = false }: { seller?: boolean }) { const { t } = useI18n(); return <EmptyState icon="lock" title={t(seller ? "sellerOnly" : "authRequired")} hint={t(seller ? "sellerOnlyHint" : "authHint")}><Link href="/login" className="button-dark">{t("login")}<Icon name="arrow" size={16} /></Link></EmptyState>; }
export function Modal({ title, onClose, children, className = "" }: { title: string; onClose: () => void; children: ReactNode; className?: string }) {
  const { t } = useI18n(); const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; const previous = document.activeElement as HTMLElement | null; dialog?.showModal(); const overflow = document.body.style.overflow; document.body.style.overflow = "hidden"; return () => { dialog?.close(); document.body.style.overflow = overflow; previous?.focus(); }; }, []);
  return <dialog ref={ref} className={`app-dialog ${className}`} aria-label={title} onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="dialog-inner"><div className="dialog-heading"><h2>{title}</h2><button className="header-icon" aria-label={t("close")} onClick={onClose}><Icon name="close" size={20} /></button></div>{children}</div></dialog>;
}
export function Breadcrumbs({ current }: { current: string }) { const { t } = useI18n(); return <div className="breadcrumbs"><Link href="/">{t("home")}</Link><Icon name="chevron" className="directional" size={13} /><span>{current}</span></div>; }
