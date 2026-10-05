/**
 * Chat modes behind the "+" tools menu. Shared by the client (labels, placeholders) and the server (system addons).
 * Honest by design: video and music are built as real, playable HTML/WebAudio programs, not fake clips.
 */

export type ChatModeId = "video" | "music" | "canvas" | "research" | "guided";

export interface ChatMode {
  id: ChatModeId;
  label: string;
  sub: string;
  placeholder: string;
  /** appended to the system prompt on the server */
  addon: string;
  /** these modes need the full team / long output, so the server treats them as hard tasks */
  hard: boolean;
}

export const CHAT_MODES: readonly ChatMode[] = [
  {
    id: "video",
    label: "الفيديوهات",
    sub: "مشاهد متحركة بالكود مع صوت وتحكم كامل",
    placeholder: "صف الفيديو: الفكرة، المدة، الأجواء…",
    hard: true,
    addon: `

VIDEO STUDIO MODE
There is no camera-realistic video model here, so build a REAL animated video as ONE self-contained HTML file in a single \`\`\`html block: a timeline of 4-8 scenes (Canvas 2D or SVG + CSS), cinematic transitions, animated typography and captions in the user's language, a generated soundtrack and sound effects with Web Audio (start audio only after the first tap), a poster screen with a big play button, and a control bar (play / pause / restart / seek bar / fullscreen). Total length matches the request (default 30-45 s). Fluid 60 fps with requestAnimationFrame and delta time, responsive from 360px up, rich layered visuals (gradients, particles, parallax), no external assets. Say in ONE short sentence before the code that it is an interactive animated video.`,
  },
  {
    id: "music",
    label: "موسيقى",
    sub: "مقطوعات مولّدة بالكود قابلة للتشغيل والتحميل",
    placeholder: "صف المقطوعة: النمط، المزاج، السرعة…",
    hard: true,
    addon: `

MUSIC STUDIO MODE
Compose REAL music as ONE self-contained HTML file in a single \`\`\`html block using Web Audio only: a scheduler with look-ahead, a chord progression and melody that fit the requested genre and mood, drums (kick / snare / hats synthesised from noise and oscillators), bass, pads and lead with envelopes, reverb (convolver built from noise), tempo / key / volume controls, a live visualiser (analyser + canvas), play / stop, and a "download WAV" button that renders the track offline with OfflineAudioContext and encodes a 16-bit WAV in plain JavaScript. Audio starts only after a tap. Loop-friendly structure with intro, build, drop and outro. Say in ONE short sentence before the code that the track is generated live in the browser.`,
  },
  {
    id: "canvas",
    label: "Canvas",
    sub: "الترميز أو الكتابة أو إنشاء الشرائح",
    placeholder: "ماذا نبني في اللوحة؟ كود، مستند، عرض شرائح…",
    hard: true,
    addon: `

CANVAS MODE
Deliver the work as ONE complete, polished artifact the user can open and edit: code, a web page or app as a single \`\`\`html block; a document as clean Markdown; a slide deck as a self-contained HTML presentation with next / previous navigation and keyboard arrows. On later edits keep every name, token and structure and change only what was asked, then return the whole updated artifact. Keep commentary to two lines at most.`,
  },
  {
    id: "research",
    label: "Deep Research",
    sub: "تقارير مفصّلة بمحاور وأدلة ومقارنات",
    placeholder: "ما الموضوع الذي تريد بحثه بعمق؟",
    hard: true,
    addon: `

DEEP RESEARCH MODE
Work like a research analyst. Silently split the topic into 5-8 sub-questions, cover each from several angles (definitions, history, evidence, competing views, numbers, risks, practical implications), then write a long, structured report: executive summary, key findings, a comparison table where it helps, a section on uncertainties and disagreements, concrete recommendations, and a closing list of "what to verify next". You cannot browse the live web in this mode, so rely on established knowledge, flag anything that may have changed recently, and never invent sources, quotes, links or statistics: when unsure, say so plainly.`,
  },
  {
    id: "guided",
    label: "التعلّم الموجّه",
    sub: "مساعدة تفصيلية خطوة بخطوة",
    placeholder: "ماذا تريد أن تتعلم؟ وما مستواك الحالي؟",
    hard: false,
    addon: `

GUIDED LEARNING MODE
Teach step by step. First, in one line, state the learner's apparent level and the goal. Then give ONE small lesson at a time: a plain explanation, one concrete example, then ONE question or mini-exercise, and wait for the answer before moving on. Correct mistakes kindly and explain why. After every few steps recap in two lines. Adapt speed and difficulty to the answers. If the Algerian curriculum is mentioned, follow it. Never dump the whole topic at once.`,
  },
];

export function chatModeById(id: unknown): ChatMode | undefined {
  return CHAT_MODES.find((m) => m.id === id);
}
