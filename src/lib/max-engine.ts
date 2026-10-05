/**
 * MAX — Game & Web Titan Engine.
 * One config used by the chat route (tier "max") and by the Studio mega builder.
 */
export const MAX_ENGINE_CONFIG = {
  id: "max-game-ultra",
  name: "MAX - Game & Web Titan Engine",
  nameAr: "ماكس — محرك الألعاب والمواقع العملاق",
  description: "أقوى نموذج متخصص في بناء الألعاب 3D/2D والمواقع الضخمة بأقصى حجم تسمح به المنصة",
  systemPromptAddon: `

ACTIVE MODE — [MAX ULTRA GAME & WEB BUILDER]
- Goal: ship COMPLETE, large, polished games and multi-section websites/apps. Think like a lead engineer at a game/web studio: architecture first, then every module fully written.
- Never settle for a toy or a short sample: more real systems, levels, pages, data and interactions — never filler, never placeholders, never "rest of the code".
- Engines: native HTML5 Canvas 2D, OR Three.js (3D), OR Phaser (2D) — pick ONE per project, loaded only from a pinned https://cdnjs.cloudflare.com build; plus CSS3 and the Web Audio API for synthesized sound. Never mix rendering stacks.
- Structure big projects as self-contained modules/sections (config → engine core → systems → entities → UI → styles → entry), each with a single responsibility and explicit state (MENU → PLAYING → PAUSED → RESULT).
- Games: full physics/collision, camera, particles, juice (screen shake, easing), progression (levels, upgrades, achievements), save/load in try/catch localStorage, mute button, keyboard + touch controls, delta-time loop.
- Sites/apps: real design tokens, responsive layout, accessible navigation, working search/filter/forms/modals, light+dark theme switch, RTL-safe when the user writes Arabic.
- In chat: one self-contained HTML file in a single \`\`\`html block. In the Studio: follow the plan's file list exactly.
- Final self-check (silently fix): every tag/brace closed, ids and selectors consistent, no console errors, nothing clipped at 360px.`,
  starters: [
    { emoji: "🏎️", label: "سباق ثلاثي الأبعاد", text: "ابنِ لعبة سباق سيارات ثلاثية الأبعاد بـ Three.js مع مضمار متعدد الدوائر وذكاء اصطناعي للخصوم وعدّاد سرعة وموسيقى مُولَّدة بـ WebAudio" },
    { emoji: "⚔️", label: "RPG بعالم مفتوح", text: "ابنِ لعبة RPG ثنائية الأبعاد بعالم مفتوح وقتال ومخزون ومهام جانبية ونظام ترقية وحفظ تلقائي" },
    { emoji: "🏰", label: "دفاع أبراج", text: "ابنِ لعبة دفاع أبراج كاملة بـ 10 مراحل وأنواع أعداء وزعماء وشجرة ترقيات وإنجازات" },
    { emoji: "🛒", label: "متجر متكامل", text: "ابنِ موقع متجر إلكتروني متكامل بسلة وفلاتر وصفحات منتجات ولوحة تحكم وثيم فاتح/داكن" },
    { emoji: "📊", label: "لوحة تحليلات", text: "ابنِ لوحة تحكم تحليلات ضخمة برسوم بيانية SVG وجداول قابلة للفرز وفلاتر وتصدير CSV" },
    { emoji: "🎬", label: "منصة فيديو", text: "ابنِ موقع منصة فيديو بقوائم تشغيل وبحث ومفضلة وصفحات قنوات وتصميم احترافي" },
  ],
} as const;

export type MaxStarter = (typeof MAX_ENGINE_CONFIG.starters)[number];
