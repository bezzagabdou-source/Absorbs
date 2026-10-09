/**
 * Nexus AI v15 — "Lumen" is the one and only look: a luxurious, airy light theme.
 *
 * The dark theme was removed on purpose (product decision): one polished surface
 * beats two half-polished ones. These helpers stay so every old import keeps
 * compiling, they simply always resolve to Lumen.
 */
export type ThemeId = "lumen";
export const THEME_KEY = "nexus_theme_v4";
const META_COLOR = "#f7f8fc";

export function readTheme(): ThemeId {
  return "lumen";
}

export function applyTheme(_theme: ThemeId = "lumen", persist = true): void {
  const root = document.documentElement;
  root.setAttribute("data-theme", "lumen");
  root.classList.remove("dark");
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }
  meta.content = META_COLOR;
  if (persist) {
    try {
      localStorage.setItem(THEME_KEY, "lumen");
    } catch {
      /* private mode */
    }
  }
  window.dispatchEvent(new CustomEvent("barq:theme", { detail: "lumen" }));
}

/** Runs before first paint (inlined in <head>) so there is never a flash. */
export const THEME_BOOT_SCRIPT = `try{document.documentElement.setAttribute('data-theme','lumen');document.documentElement.classList.remove('dark');}catch(e){}`;
