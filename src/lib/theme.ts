/**
 * Nexus AI v18 ATLAS — نظام السمة
 * ---------------------------------------------------------------------------
 * Lumen remains the default and the most polished surface. ATLAS adds three
 * optional looks (Noctis / Midnight / Aurora) plus a selectable accent colour.
 * Everything is driven by `data-theme` + `data-accent` on <html> and by three
 * CSS variables (--nx-accent-from/-to/-ring) that every new v18 surface uses.
 */
export type ThemeId = "lumen" | "noctis" | "midnight" | "aurora";
export type AccentId = "violet" | "gold" | "aqua" | "emerald" | "rose" | "amber" | "ice";

export const THEME_KEY = "nexus_theme_v4";
/** must stay in sync with src/lib/prefs.ts */
export const ATLAS_PREFS_KEY = "nexus:atlas-prefs:v18";
const LEGACY_PREFS_KEY = "barq.atlas_prefs";

export const THEMES: { id: ThemeId; name: string; dark: boolean; meta: string }[] = [
  { id: "lumen", name: "Lumen — فاتح فاخر", dark: false, meta: "#fffaf5" },
  { id: "noctis", name: "Noctis — داكن دافئ", dark: true, meta: "#141311" },
  { id: "midnight", name: "Midnight — أسود عميق", dark: true, meta: "#07070a" },
  { id: "aurora", name: "Aurora — شفق حي", dark: true, meta: "#0d0b1a" },
];

export const ACCENTS: Record<AccentId, { from: string; to: string; ring: string; name: string }> = {
  violet: { from: "#8b5cf6", to: "#22d3ee", ring: "#a78bfa", name: "بنفسجي كهربائي" },
  gold: { from: "#f5c451", to: "#b8860b", ring: "#f5c451", name: "ذهبي فاخر" },
  aqua: { from: "#06b6d4", to: "#3b82f6", ring: "#22d3ee", name: "سماوي" },
  emerald: { from: "#10b981", to: "#0ea5e9", ring: "#34d399", name: "زمردي" },
  rose: { from: "#f43f5e", to: "#a855f7", ring: "#fb7185", name: "وردي" },
  amber: { from: "#f59e0b", to: "#ef4444", ring: "#fbbf24", name: "عنبري" },
  ice: { from: "#e0f2fe", to: "#93c5fd", ring: "#bfdbfe", name: "جليدي" },
};

const isTheme = (v: unknown): v is ThemeId => typeof v === "string" && THEMES.some((t) => t.id === v);
const isAccent = (v: unknown): v is AccentId => typeof v === "string" && v in ACCENTS;

/** Reads the stored ATLAS appearance prefs (any key the app ever used). */
export function readAtlasAppearance(): { theme: ThemeId; accent: AccentId } {
  const fallback = { theme: "lumen" as ThemeId, accent: "gold" as AccentId };
  if (typeof window === "undefined") return fallback;
  try {
    for (const key of [ATLAS_PREFS_KEY, LEGACY_PREFS_KEY]) {
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const p = JSON.parse(raw) as { appearance?: { theme?: unknown; accent?: unknown } };
      const a = p?.appearance ?? {};
      return {
        theme: isTheme(a.theme) ? a.theme : fallback.theme,
        accent: isAccent(a.accent) ? a.accent : fallback.accent,
      };
    }
  } catch {
    /* private mode */
  }
  return fallback;
}

export function readTheme(): ThemeId {
  return readAtlasAppearance().theme;
}

export function applyTheme(theme: ThemeId = readTheme(), persist = true): void {
  const root = document.documentElement;
  const { accent } = readAtlasAppearance();
  const t = THEMES.find((x) => x.id === theme) ?? THEMES[0];
  root.setAttribute("data-theme", t.id);
  root.classList.toggle("dark", t.dark);
  applyAccentVars(root, accent);

  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }
  meta.content = t.meta;

  if (persist) {
    try {
      localStorage.setItem(THEME_KEY, t.id);
      const raw = localStorage.getItem(ATLAS_PREFS_KEY);
      const p = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      p.appearance = { ...((p.appearance as Record<string, unknown>) ?? {}), theme: t.id, accent };
      localStorage.setItem(ATLAS_PREFS_KEY, JSON.stringify(p));
    } catch {
      /* private mode */
    }
  }
  window.dispatchEvent(new CustomEvent("barq:theme", { detail: t.id }));
}

export function applyAccentVars(root: HTMLElement | null | undefined, accent: AccentId): void {
  const el = root ?? (typeof document !== "undefined" ? document.documentElement : null);
  if (!el) return;
  const a = ACCENTS[accent] ?? ACCENTS.gold;
  el.style.setProperty("--nx-accent-from", a.from);
  el.style.setProperty("--nx-accent-to", a.to);
  el.style.setProperty("--nx-accent-ring", a.ring);
  el.setAttribute("data-accent", accent);
}

/** Runs before first paint (inlined in <head>) so there is never a flash. */
export const THEME_BOOT_SCRIPT = `(function(){try{
var K="${ATLAS_PREFS_KEY}",L="${LEGACY_PREFS_KEY}",R=document.documentElement,t="lumen",a="gold";
var A={violet:["#8b5cf6","#22d3ee","#a78bfa"],gold:["#f5c451","#b8860b","#f5c451"],aqua:["#06b6d4","#3b82f6","#22d3ee"],emerald:["#10b981","#0ea5e9","#34d399"],rose:["#f43f5e","#a855f7","#fb7185"],amber:["#f59e0b","#ef4444","#fbbf24"],ice:["#e0f2fe","#93c5fd","#bfdbfe"]};
var T=["lumen","noctis","midnight","aurora"];
for(var i=0;i<2;i++){var raw=localStorage.getItem(i?L:K);if(!raw)continue;var ap=(JSON.parse(raw)||{}).appearance||{};if(T.indexOf(ap.theme)>-1)t=ap.theme;if(A[ap.accent]){a=ap.accent;}break;}
R.setAttribute("data-theme",t);R.setAttribute("data-accent",a);R.classList.toggle("dark",t!=="lumen");
var c=A[a];R.style.setProperty("--nx-accent-from",c[0]);R.style.setProperty("--nx-accent-to",c[1]);R.style.setProperty("--nx-accent-ring",c[2]);
var m=document.querySelector('meta[name="theme-color"]');if(m)m.content=t==="lumen"?"#fffaf5":"#141311";
}catch(e){}})();`;
