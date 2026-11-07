"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./Icon";
import { useI18n } from "@/lib/i18n/client";
import type { IconName } from "@/lib/marketplace-ui";
export function MobileDock() { const pathname = usePathname(); const { t } = useI18n(); const items: { href: string; label: string; icon: IconName; featured?: boolean }[] = [{ href: "/", label: t("home"), icon: "home" }, { href: "/explore", label: t("explore"), icon: "search" }, { href: "/dashboard?create=true", label: t("seller"), icon: "plusCircle", featured: true }, { href: "/chat", label: t("messages"), icon: "chat" }, { href: "/settings", label: t("profile"), icon: "user" }]; return <nav className="mobile-dock" aria-label={t("menu")}>{items.map((item) => <Link key={item.href} href={item.href} className={`${item.featured ? "dock-sell" : ""} ${pathname === item.href ? "current" : ""}`} aria-label={item.label}><span><Icon name={item.icon} size={item.featured ? 22 : 20} /></span><small>{item.label}</small></Link>)}</nav>; }
