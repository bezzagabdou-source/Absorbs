"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { z } from "zod";
import type { ReferenceData } from "@/lib/marketplace-data";
import { useApi } from "@/hooks/use-api";
import type { SessionUser } from "@/lib/auth/session";
type Theme = "light" | "dark" | "amoled";
type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
type ContextValue = { favorites: string[]; toggleFavorite: (id: string) => void; isFavorite: (id: string) => boolean; theme: Theme; setTheme: (theme: Theme) => void; notify: (message: string) => void; installAvailable: boolean; installApp: () => Promise<boolean>; toast: string | null; reference: ReferenceData; user: SessionUser | null; authLoading: boolean; refreshSession: () => void; demo: boolean };
const MarketplaceContext = createContext<ContextValue | null>(null);
const subscribePreferences = (callback: () => void) => { window.addEventListener("dz-storage", callback); window.addEventListener("storage", callback); return () => { window.removeEventListener("dz-storage", callback); window.removeEventListener("storage", callback); }; };
function readFavorites() { try { return z.array(z.uuid()).max(48).parse(JSON.parse(localStorage.getItem("dz-favorites") ?? "[]")); } catch { return []; } }
function readTheme(): Theme { try { const value = localStorage.getItem("dz-theme"); return value === "dark" || value === "amoled" ? value : "light"; } catch { return "light"; } }
export function MarketplaceProvider({ children, reference }: { children: ReactNode; reference: ReferenceData }) {
  const favoritesSnapshot = useSyncExternalStore(subscribePreferences, () => localStorage.getItem("dz-favorites") ?? "[]", () => "[]");
  const favorites = useMemo(() => { try { return z.array(z.uuid()).max(48).parse(JSON.parse(favoritesSnapshot)); } catch { return []; } }, [favoritesSnapshot]);
  const theme = useSyncExternalStore(subscribePreferences, readTheme, () => "light" as Theme);
  const [toast, setToast] = useState<string | null>(null); const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const { data: session, loading: authLoading, refresh: refreshSession } = useApi<{ user: SessionUser | null; demo: boolean }>("/api/auth/session");
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  useEffect(() => {
    if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => undefined);
    const onInstall = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallPromptEvent); };
    window.addEventListener("beforeinstallprompt", onInstall);
    return () => { window.removeEventListener("beforeinstallprompt", onInstall); };
  }, []);
  useEffect(() => { if (!toast) return; const timeout = setTimeout(() => setToast(null), 3500); return () => clearTimeout(timeout); }, [toast]);
  const toggleFavorite = useCallback((id: string) => { const current = readFavorites(); try { localStorage.setItem("dz-favorites", JSON.stringify(current.includes(id) ? current.filter((v) => v !== id) : [...current, id].slice(-48))); window.dispatchEvent(new Event("dz-storage")); } catch { setToast("Storage unavailable"); } }, []);
  const setTheme = useCallback((value: Theme) => { try { localStorage.setItem("dz-theme", value); window.dispatchEvent(new Event("dz-storage")); } catch { /* private browsing */ } }, []);
  const installApp = useCallback(async () => { if (!installPrompt) return false; await installPrompt.prompt(); const choice = await installPrompt.userChoice; setInstallPrompt(null); return choice.outcome === "accepted"; }, [installPrompt]);
  const value = useMemo(() => ({ favorites, toggleFavorite, isFavorite: (id: string) => favorites.includes(id), theme, setTheme, notify: setToast, installAvailable: Boolean(installPrompt), installApp, toast, reference, user: session?.user ?? null, authLoading, refreshSession, demo: session?.demo ?? false }), [favorites, toggleFavorite, theme, setTheme, installPrompt, installApp, toast, reference, session, authLoading, refreshSession]);
  return <MarketplaceContext.Provider value={value}>{children}</MarketplaceContext.Provider>;
}
export function useMarketplace() { const context = useContext(MarketplaceContext); if (!context) throw new Error("MarketplaceProvider missing"); return context; }
