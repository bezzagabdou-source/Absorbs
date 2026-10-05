/** Theme helpers: "dark" (Electric Gold, default) and "orange-claude" (light peach). */
export type ThemeId = "dark" | "orange-claude";
export const THEME_KEY = "barq_theme";
const META_COLOR: Record<ThemeId, string> = { dark: "#030712", "orange-claude": "#fffaf5" };

export function readTheme(): ThemeId {
  try {
    return localStorage.getItem(THEME_KEY) === "orange-claude" ? "orange-claude" : "dark";
  } catch {
    return "dark";
  }
}

export function applyTheme(theme: ThemeId, persist = true): void {
  const root = document.documentElement;
  if (theme === "orange-claude") root.setAttribute("data-theme", "orange-claude");
  else root.removeAttribute("data-theme");
  document.body.classList.toggle("bg-orange-animated", theme === "orange-claude");
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }
  meta.content = META_COLOR[theme];
  if (persist) {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* private mode */
    }
  }
  window.dispatchEvent(new CustomEvent("barq:theme", { detail: theme }));
}

/** Runs before first paint (inlined in <head>) so there is no dark flash. */
export const THEME_BOOT_SCRIPT = `try{if(localStorage.getItem('${THEME_KEY}')==='orange-claude'){document.documentElement.setAttribute('data-theme','orange-claude');document.addEventListener('DOMContentLoaded',function(){document.body.classList.add('bg-orange-animated');var m=document.querySelector('meta[name=theme-color]');if(m)m.setAttribute('content','${META_COLOR["orange-claude"]}')})}}catch(e){}`;
