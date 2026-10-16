"use client";

/**
 * NEXUS ATLAS — مزوّد الإعدادات (v18)
 * ---------------------------------------------------------------------------
 * Reads the huge preference object from localStorage on first paint, syncs it
 * with the server (barq.atlas_prefs) when the user is signed in, and turns the
 * appearance/voice/AI choices into real CSS variables + document attributes.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  ACCENTS,
  DEFAULT_PREFS,
  loadPrefsLocal,
  normalizePrefs,
  patchPrefs,
  savePrefsLocal,
  type AtlasPrefs,
} from "@/lib/prefs";
import { THEMES } from "@/lib/theme";

type PrefsApi = {
  prefs: AtlasPrefs;
  ready: boolean;
  set: (patch: unknown) => void;
  reset: () => Promise<void>;
  toggle: (path: string) => void;
  syncedAt: string | null;
};

const Ctx = createContext<PrefsApi | null>(null);

export function usePrefs(): PrefsApi {
  const c = useContext(Ctx);
  if (c) return c;
  return {
    prefs: DEFAULT_PREFS,
    ready: true,
    set: () => undefined,
    reset: async () => undefined,
    toggle: () => undefined,
    syncedAt: null,
  };
}

/** Applies appearance prefs to <html> as attributes + CSS variables. */
function applyToDocument(p: AtlasPrefs): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const accent = ACCENTS[p.appearance.accent] ?? ACCENTS.violet;

  // theme: resolve to one of the ATLAS looks (lumen is the default light)
  const wanted = p.appearance.theme;
  const systemDark = typeof window !== "undefined" && !!window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  const theme =
    wanted === "system"
      ? (systemDark ? "noctis" : "lumen")
      : wanted === "light"
        ? "lumen"
        : wanted === "dark"
          ? "noctis"
          : wanted === "midnight"
            ? "midnight"
            : wanted === "aurora"
              ? "aurora"
              : "lumen";
  const isDark = THEMES.find((t) => t.id === theme)?.dark ?? false;
  root.setAttribute("data-theme", theme);
  root.classList.toggle("dark", isDark);
  root.setAttribute("data-density", p.appearance.density);
  root.setAttribute("data-accent", p.appearance.accent);
  root.setAttribute("data-wallpaper", p.appearance.wallpaper);
  root.classList.toggle("no-animations", !p.appearance.animations || p.appearance.reducedMotion);
  root.classList.toggle("no-particles", !p.appearance.particles);
  root.classList.toggle("no-glass", !p.appearance.glass);
  root.classList.toggle("no-glow", !p.appearance.glow);
  root.classList.toggle("a11y-contrast", p.a11y.highContrast);
  root.classList.toggle("a11y-large", p.a11y.largeTargets);
  root.classList.toggle("a11y-dyslexic", p.a11y.dyslexicFont);

  root.style.setProperty("--nx-accent-from", accent.from);
  root.style.setProperty("--nx-accent-to", accent.to);
  root.style.setProperty("--nx-accent-ring", accent.ring);
  root.style.setProperty("--nx-font-scale", String(p.appearance.fontScale));
  root.style.fontSize = `${(16 * p.appearance.fontScale).toFixed(2)}px`;

  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = THEMES.find((t) => t.id === theme)?.meta ?? "#fffaf5";
}

export function PrefsProvider({ children }: { children: ReactNode }) {
  const { authFetch, user } = useAuth();
  const [prefs, setPrefs] = useState<AtlasPrefs>(DEFAULT_PREFS);
  const [ready, setReady] = useState(false);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const dirty = useRef<number | null>(null);
  const pulled = useRef<string>("");

  /* first paint: localStorage, then the server copy wins if it is newer */
  useEffect(() => {
    const local = loadPrefsLocal();
    setPrefs(local);
    applyToDocument(local);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!user?.uid || !ready) return;
    if (pulled.current === user.uid) return;
    pulled.current = user.uid;
    let alive = true;
    authFetch("/api/prefs")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { prefs?: AtlasPrefs } | null) => {
        if (!alive || !j?.prefs) return;
        const merged = normalizePrefs(j.prefs);
        setPrefs(merged);
        savePrefsLocal(merged);
        applyToDocument(merged);
        setSyncedAt(new Date().toISOString());
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [user?.uid, ready, authFetch]);

  const push = useCallback(
    (next: AtlasPrefs) => {
      savePrefsLocal(next);
      applyToDocument(next);
      if (!user?.uid || !next.privacy.cloudSync) return;
      if (dirty.current) window.clearTimeout(dirty.current);
      dirty.current = window.setTimeout(() => {
        authFetch("/api/prefs", { method: "POST", body: JSON.stringify({ prefs: next }) })
          .then((r) => {
            if (r.ok) setSyncedAt(new Date().toISOString());
          })
          .catch(() => undefined);
      }, 700);
    },
    [authFetch, user?.uid]
  );

  const set = useCallback(
    (patch: unknown) => {
      setPrefs((cur) => {
        const next = patchPrefs(cur, patch);
        push(next);
        return next;
      });
    },
    [push]
  );

  const toggle = useCallback(
    (path: string) => {
      setPrefs((cur) => {
        const [g, k] = path.split(".");
        const group = (cur as unknown as Record<string, Record<string, unknown>>)[g];
        if (!group || !(k in group) || typeof group[k] !== "boolean") return cur;
        const next = patchPrefs(cur, { [path]: !group[k] });
        push(next);
        return next;
      });
    },
    [push]
  );

  const reset = useCallback(async () => {
    setPrefs(DEFAULT_PREFS);
    savePrefsLocal(DEFAULT_PREFS);
    applyToDocument(DEFAULT_PREFS);
    if (user?.uid) {
      try {
        await authFetch("/api/prefs", { method: "DELETE" });
        setSyncedAt(new Date().toISOString());
      } catch {
        /* offline is fine */
      }
    }
  }, [authFetch, user?.uid]);

  /* other components (theme card, palette) can announce a change directly */
  useEffect(() => {
    const onPrefs = () => {
      const local = loadPrefsLocal();
      setPrefs(local);
      applyToDocument(local);
    };
    window.addEventListener("barq:prefs", onPrefs);
    window.addEventListener("storage", onPrefs);
    return () => {
      window.removeEventListener("barq:prefs", onPrefs);
      window.removeEventListener("storage", onPrefs);
    };
  }, []);

  /* follow the OS theme when the user chose "system" */
  useEffect(() => {
    if (prefs.appearance.theme !== "system" || typeof window === "undefined") return;
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mq) return;
    const onChange = () => applyToDocument(prefs);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, [prefs]);

  const value = useMemo<PrefsApi>(() => ({ prefs, ready, set, reset, toggle, syncedAt }), [prefs, ready, set, reset, toggle, syncedAt]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
