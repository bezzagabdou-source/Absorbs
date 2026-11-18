/**
 * animated-emoji.ts — إيموجيات متحركة بـ HTML/CSS/SVG (بدون أي مكتبة خارجية).
 * تُستخدم داخل لوحة التحكم وفي أي صفحة ويب. الرمز نفسه يُمكن نسخه ولصقه في أي HTML.
 *
 * ملاحظة صادقة: تيليجرام لا يقبل إيموجي متحرك داخل نص الرسالة إلا إذا كان البوت
 * مملوكاً لحساب Premium أو يوزرنيم مشترى من Fragment (custom_emoji).
 * لذلك: الرسائل تستخدم إيموجي عادي، والحركة تُعرض في اللوحة/الصفحات،
 * ويمكن ربط حزمة إيموجي متحرك من صفحة «إيموجي متحرك» لتعمل داخل الأزرار أيضاً.
 */

export type AnimatedEmoji = { id: string; name: string; label: string; html: string };

export const ANIMATED_EMOJI_CSS = `
.ae-emoji{display:inline-block;width:1.15em;height:1.15em;vertical-align:-0.18em;line-height:0}
.ae-big{width:64px;height:64px}
.ae-bounce{animation:ae-bounce 1.5s ease-in-out infinite;transform-origin:50% 90%}
@keyframes ae-bounce{0%,100%{transform:translateY(0) scale(1)}45%{transform:translateY(-9%) scale(1.04)}60%{transform:translateY(0) scale(.97)}}
.ae-float{animation:ae-float 3s ease-in-out infinite}
@keyframes ae-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-9%)}}
.ae-spin{animation:ae-spin 6s linear infinite;transform-origin:50% 50%}
@keyframes ae-spin{to{transform:rotate(360deg)}}
.ae-pulse{animation:ae-pulse 1.6s ease-in-out infinite;transform-origin:50% 50%}
@keyframes ae-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.1)}}
.ae-heartbeat{animation:ae-heartbeat 1.1s ease-in-out infinite;transform-origin:50% 55%}
@keyframes ae-heartbeat{0%,100%{transform:scale(1)}18%{transform:scale(1.16)}34%{transform:scale(.97)}52%{transform:scale(1.1)}}
.ae-swing{animation:ae-swing 2.1s ease-in-out infinite;transform-origin:50% 12%}
@keyframes ae-swing{0%,100%{transform:rotate(-11deg)}50%{transform:rotate(11deg)}}
.ae-flicker{animation:ae-flicker 1.1s ease-in-out infinite;transform-origin:50% 100%}
@keyframes ae-flicker{0%,100%{transform:scale(1,1) translateY(0)}35%{transform:scale(.94,1.09) translateY(-2%)}70%{transform:scale(1.05,.93) translateY(1%)}}
.ae-spark{animation:ae-spark 1.8s ease-in-out infinite;transform-origin:50% 50%}
@keyframes ae-spark{0%,100%{opacity:.25;transform:scale(.7)}50%{opacity:1;transform:scale(1.15)}}
.ae-rise{animation:ae-rise 2.4s ease-in-out infinite}
@keyframes ae-rise{0%{opacity:0;transform:translateY(6px)}30%{opacity:1}100%{opacity:0;transform:translateY(-16px)}}
.ae-shine{animation:ae-shine 2.6s linear infinite}
@keyframes ae-shine{0%{transform:translateX(-140%)}55%,100%{transform:translateX(140%)}}
.ae-tilt{animation:ae-tilt 2.4s ease-in-out infinite;transform-origin:50% 85%}
@keyframes ae-tilt{0%,100%{transform:rotate(-7deg)}50%{transform:rotate(7deg)}}
.ae-glow{animation:ae-glow 2s ease-in-out infinite}
@keyframes ae-glow{0%,100%{filter:drop-shadow(0 0 0 rgba(250,204,21,0))}50%{filter:drop-shadow(0 0 6px rgba(250,204,21,.85))}}
@media (prefers-reduced-motion: reduce){.ae-emoji *{animation:none!important}}
`.trim();

const wrap = (body: string, cls = ""): string =>
  `<svg class="ae-emoji ${cls}" viewBox="0 0 64 64" role="img" aria-hidden="true">${body}</svg>`;

export const ANIMATED_EMOJIS: AnimatedEmoji[] = [
  {
    id: "fire",
    name: "نار",
    label: "🔥",
    html: wrap(
      `<g class="ae-flicker"><path d="M32 5c5 11 15 15 15 28a15 15 0 1 1-30 0c0-8 5-11 8-18 3 6 5 7 8 9 2-7 0-13-1-19z" fill="#f97316"/><path d="M32 26c2 6 8 8 8 15a8 8 0 1 1-16 0c0-5 4-7 5-11 2 4 3 4 3-4z" fill="#fde047"/></g><circle class="ae-spark" cx="48" cy="16" r="3" fill="#fdba74"/>`,
    ),
  },
  {
    id: "star",
    name: "نجمة",
    label: "⭐️",
    html: wrap(
      `<g class="ae-spin"><path d="M32 6l7.6 15.9 17.4 2.4-12.7 12.2 3.1 17.3L32 45.6 16.6 53.8l3.1-17.3L7 24.3l17.4-2.4z" fill="#facc15"/></g><circle class="ae-spark" cx="50" cy="12" r="3.4" fill="#fef08a"/>`,
    ),
  },
  {
    id: "crown",
    name: "تاج",
    label: "👑",
    html: wrap(
      `<g class="ae-bounce"><path d="M9 45h46l-4-25-12 9-7-15-7 15-12-9z" fill="#fbbf24"/><rect x="9" y="46" width="46" height="8" rx="3" fill="#f59e0b"/></g><circle class="ae-spark" cx="32" cy="30" r="4" fill="#fef3c7"/>`,
    ),
  },
  {
    id: "gift",
    name: "هدية",
    label: "🎁",
    html: wrap(
      `<g class="ae-tilt"><rect x="12" y="28" width="40" height="28" rx="4" fill="#f43f5e"/><rect x="8" y="20" width="48" height="10" rx="3" fill="#fb7185"/><rect x="29" y="20" width="6" height="36" fill="#fde047"/><path d="M32 20c-8 0-12-4-9-8s9 0 9 8zm0 0c8 0 12-4 9-8s-9 0-9 8z" fill="#fde047"/></g>`,
    ),
  },
  {
    id: "rocket",
    name: "صاروخ",
    label: "🚀",
    html: wrap(
      `<g class="ae-float"><path d="M32 6c9 7 12 18 12 28l-6 8H26l-6-8c0-10 3-21 12-28z" fill="#e2e8f0"/><circle cx="32" cy="24" r="5" fill="#38bdf8"/><path d="M20 34l-8 9 10-1zM44 34l8 9-10-1z" fill="#ef4444"/></g><path class="ae-pulse" d="M32 44c3 5 3 11 0 16-3-5-3-11 0-16z" fill="#fb923c"/>`,
    ),
  },
  {
    id: "gem",
    name: "جوهرة",
    label: "💎",
    html: wrap(
      `<g><path d="M18 14h28l10 14-24 24L8 28z" fill="#22d3ee"/><path d="M18 14l6 14h16l6-14z" fill="#67e8f9"/><rect class="ae-shine" x="6" y="16" width="10" height="26" fill="rgba(255,255,255,.75)" transform="skewX(-18)"/></g>`,
    ),
  },
  {
    id: "coin",
    name: "عملة",
    label: "🪙",
    html: wrap(
      `<circle cx="32" cy="32" r="23" fill="#fbbf24"/><circle cx="32" cy="32" r="17" fill="#fde047"/><g class="ae-pulse"><text x="32" y="42" font-size="24" font-weight="900" text-anchor="middle" fill="#b45309">$</text></g>`,
    ),
  },
  {
    id: "bell",
    name: "جرس",
    label: "🔔",
    html: wrap(
      `<g class="ae-swing"><path d="M32 8a14 14 0 0 1 14 14v12l5 8H13l5-8V22A14 14 0 0 1 32 8z" fill="#fbbf24"/><circle cx="32" cy="50" r="6" fill="#f59e0b"/></g>`,
    ),
  },
  {
    id: "bolt",
    name: "برق",
    label: "⚡️",
    html: wrap(`<path class="ae-glow ae-pulse" d="M36 5L14 36h13l-5 23 24-32H33z" fill="#facc15"/>`),
  },
  {
    id: "heart",
    name: "قلب",
    label: "💖",
    html: wrap(
      `<g class="ae-heartbeat"><path d="M32 55S7 41 7 24a13 13 0 0 1 25-5 13 13 0 0 1 25 5c0 17-25 31-25 31z" fill="#f472b6"/><circle cx="22" cy="24" r="3.4" fill="#fbcfe8"/></g>`,
    ),
  },
  {
    id: "trophy",
    name: "كأس",
    label: "🏆",
    html: wrap(
      `<g class="ae-pulse"><path d="M20 10h24v14a12 12 0 0 1-24 0z" fill="#fbbf24"/><path d="M20 14h-8v6c0 6 4 9 9 9M44 14h8v6c0 6-4 9-9 9" stroke="#f59e0b" stroke-width="4" fill="none"/><rect x="28" y="34" width="8" height="12" fill="#f59e0b"/><rect x="18" y="46" width="28" height="8" rx="3" fill="#b45309"/></g><circle class="ae-spark" cx="52" cy="12" r="3" fill="#fef08a"/>`,
    ),
  },
  {
    id: "party",
    name: "احتفال",
    label: "🎉",
    html: wrap(
      `<g class="ae-bounce"><path d="M14 54L32 14l14 34z" fill="#f472b6"/><path d="M20 44h20" stroke="#fde047" stroke-width="4"/></g><circle class="ae-rise" cx="46" cy="20" r="3" fill="#38bdf8"/><circle class="ae-rise" cx="20" cy="18" r="3" fill="#facc15" style="animation-delay:.6s"/><circle class="ae-rise" cx="34" cy="10" r="3" fill="#34d399" style="animation-delay:1.1s"/>`,
    ),
  },
];

/** الإيموجي المتحرك بصيغة جاهزة للّصق في أي صفحة HTML */
export function animatedEmojiSnippet(id: string): string {
  const item = ANIMATED_EMOJIS.find((e) => e.id === id);
  if (!item) return "";
  return `<style>${ANIMATED_EMOJI_CSS}</style>\n${item.html}`;
}
