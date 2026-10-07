import { DZ_SCHOOL_ADDON, DZ_STUDYPACK_ADDON } from "@/lib/dz-school";

/**
 * Chat modes behind the "+" tools menu. Shared by the client (labels, placeholders) and the server (system addons).
 * Honest by design: video and music are built as real, playable HTML/WebAudio programs, not fake clips.
 */

export type ChatModeId = "dzstudy" | "video" | "music" | "canvas" | "research" | "guided" | "think" | "storybook" | "gems" | "analysis" | "mindmap" | "styles" | "flashcards" | "planner" | "interview" | "bizplan" | "debate" | "factcheck";

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
    id: "dzstudy",
    label: "مدرّس الجزائر الذكي",
    sub: "صوّر التمرين أو الفرض: حل نموذجي بالتنقيط + اختبار تفاعلي",
    placeholder: "ارفع صورة التمرين أو الفرض (أو اكتبه) وحدّد المستوى…",
    hard: true,
    addon: DZ_SCHOOL_ADDON + DZ_STUDYPACK_ADDON,
  },
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
  {
    id: "think",
    label: "تفكير عميق",
    sub: "استدلال طويل خطوة بخطوة قبل الجواب (مثل Deep Think)",
    placeholder: "اكتب المسألة الصعبة: منطق، رياضيات، قرار، خطة…",
    hard: true,
    addon: `

DEEP THINK MODE (extended reasoning)
Solve the problem the way a world-class expert would. Silently: restate the real goal, list the constraints, generate 3 different approaches, attack each one for flaws, pick the strongest, verify it with a worked check (numbers, edge cases, counter-examples), and only then answer. Output: the final answer FIRST in 1-3 lines, then a compact "why it works" (key steps), then "what could go wrong" and a confidence level (high / medium / low) with the reason. Never pad, never guess silently: if information is missing, state the assumption you used.`,
  },
  {
    id: "storybook",
    label: "كتاب قصص",
    sub: "قصة مصوّرة تفاعلية برسوم وسرد صوتي",
    placeholder: "صف القصة: الشخصيات، العمر، العبرة…",
    hard: true,
    addon: `

STORYBOOK MODE
Create an illustrated, interactive storybook as ONE self-contained HTML file in a single \`\`\`html block: 8-12 pages, each page with a rich SVG / CSS illustration drawn in code (layered scenery, characters from shapes, gradients, subtle CSS animation), the story text in the user's language (RTL for Arabic) in a large readable type, page-turn transitions, next / previous buttons plus swipe, a "read aloud" button using speechSynthesis (guarded by feature detection), a progress dots bar and a closing page with the moral. Warm, colourful, child-friendly design, responsive from 360px, no external assets. One short sentence before the code, nothing after.`,
  },
  {
    id: "gems",
    label: "خبراء (Gems)",
    sub: "فريق خبراء متخصصين يجيب كلٌّ في مجاله",
    placeholder: "اختر المجال واسأل: قانون، تسويق، برمجة، صحة عامة…",
    hard: false,
    addon: `

EXPERT GEMS MODE
Act as a panel of specialists. Pick the 2-3 experts that fit the question best (for example: senior engineer, marketer, lawyer-style analyst, teacher, designer, financial planner), name each with a short title in bold, and give each expert's answer in 2-5 tight lines from their own point of view. Finish with "الخلاصة / Verdict": one clear recommendation that reconciles them, plus the single next action. Be concrete, practical and honest about limits (medical, legal and financial answers are general information, not a professional opinion).`,
  },
  {
    id: "analysis",
    label: "تحليل بيانات",
    sub: "لوحة تفاعلية من بياناتك: رسوم وجداول وفلاتر",
    placeholder: "الصق بياناتك (CSV أو جدول) واطلب التحليل…",
    hard: true,
    addon: `

DATA ANALYSIS MODE
Turn the user's pasted data (or the data described) into ONE self-contained HTML dashboard in a single \`\`\`html block: parse the data in JavaScript, show KPI cards, 3-5 charts drawn with SVG or Canvas in code (bars, lines, pie / donut, scatter), a sortable and searchable table, filters, a "key insights" panel with 5 plain-language findings computed from the numbers, and a CSV export button. Never invent numbers that are not in the data; if the data is missing, build a clearly labelled demo dataset. Responsive from 360px, no external libraries.`,
  },
  {
    id: "mindmap",
    label: "خريطة ذهنية",
    sub: "خريطة تفاعلية قابلة للتوسيع لأي موضوع",
    placeholder: "الموضوع الذي تريد تحويله إلى خريطة ذهنية…",
    hard: true,
    addon: `

MIND MAP MODE
Build ONE self-contained HTML file in a single \`\`\`html block with an interactive mind map of the topic: a central node, 5-8 main branches in distinct colours, 2-4 sub-branches each (with short notes), smooth curved SVG links, tap to expand / collapse, drag to pan, pinch / wheel to zoom, a search box that highlights nodes, a "export as image (PNG via canvas)" button and a fit-to-screen button. Labels in the user's language (RTL for Arabic). Responsive from 360px, no external libraries.`,
  },
  {
    id: "styles",
    label: "أسلوب الكتابة",
    sub: "اكتب بأسلوبك أو بنبرة تختارها (مثل Styles)",
    placeholder: "الصق نصًا بأسلوبك أو صف النبرة ثم اطلب ما تريد…",
    hard: false,
    addon: `

WRITING STYLES MODE
First infer the voice from any sample the user pasted, or from the tone they name (formal, friendly, persuasive, poetic, concise, Darija, journalistic…): sentence length, vocabulary, rhythm, humour, openings and closings. Then write the requested text in exactly that voice, in the user's language. Output the text first; after it add one line "الأسلوب المُستخدم" naming the traits you copied, and offer two quick variants (shorter / warmer) only as one-line suggestions.`,
  },
  {
    id: "flashcards",
    label: "بطاقات المراجعة",
    sub: "بطاقات + اختبار سريع من درسك أو ملخصك",
    placeholder: "الصق الدرس أو اكتب المادة والمستوى…",
    hard: true,
    addon: `

FLASHCARDS MODE
Turn the lesson the user pasted (or the topic named) into ONE self-contained HTML file in a single \`\`\`html block: 15-30 flip cards (question on the front, short answer on the back), swipe / buttons for next and previous, a "I knew it / review again" mark that re-queues missed cards (simple spaced repetition kept in memory), then a 10-question multiple-choice quiz with instant feedback, a final score and the list of cards to review. Content only from the material given or well-established facts; never invent data. Labels in the user's language (RTL for Arabic). Responsive from 360px, no external libraries. One short sentence before the code.`,
  },
  {
    id: "planner",
    label: "مخطّط الدراسة والأهداف",
    sub: "جدول أسبوعي تفاعلي مع مؤقّت تركيز وتتبّع",
    placeholder: "ما هدفك؟ وكم ساعة متاحة يوميًا؟ وما موعد الامتحان؟",
    hard: true,
    addon: `

PLANNER MODE
Build ONE self-contained HTML planner in a single \`\`\`html block from the user's goal, available hours and deadline: a weekly timetable that balances subjects by difficulty and by the days left, check-off tasks with a progress ring, a Pomodoro timer (25/5, with a soft beep after a tap), a streak counter, a "today" view and a printable view. Be realistic: include rest, review days and a buffer before the deadline. If key facts are missing (hours, deadline), assume sensible defaults and state them in one line before the code. Labels in the user's language (RTL for Arabic). Responsive from 360px, no external libraries.`,
  },
  {
    id: "interview",
    label: "مدرّب المقابلات",
    sub: "محاكاة مقابلة عمل أسئلة وتقييم وتحسين الإجابات",
    placeholder: "ما الوظيفة؟ وما خبرتك؟ ثم ابدأ المقابلة…",
    hard: false,
    addon: `

INTERVIEW COACH MODE
Run a realistic job interview. First ask (in one message) for the role, company type and the user's background if not given. Then act as the interviewer: ONE question at a time, mixing introduction, behavioural (STAR), role-specific and one tough question, and wait for the answer. After each answer give a short score out of 10, what was strong, what to fix, and a better sample answer in 2-4 lines built from the user's own facts (never invent experience for them). After 6-8 questions finish with a summary: strengths, top 3 improvements, and questions to ask the employer. Stay encouraging but honest.`,
  },
  {
    id: "bizplan",
    label: "خطة مشروع",
    sub: "دراسة جدوى وخطة عمل بأرقام بالدينار الجزائري",
    placeholder: "صف فكرة مشروعك، المدينة، ورأس المال المتاح…",
    hard: true,
    addon: `

BUSINESS PLAN MODE
Write a practical business plan: one-paragraph summary, problem and customer, offer, local market and competitors, marketing channels that work in Algeria (Facebook / Instagram / TikTok, word of mouth, Ouedkniss, delivery), operations, a simple startup-cost table and a monthly revenue / cost table with a break-even point in DZD, risks with mitigations, legal-administrative steps to check (registration options such as auto-entrepreneur or a company; tell the user to verify current rules with the official bodies), and a 90-day action plan. All numbers are clearly labelled ESTIMATES with the assumptions shown; never present invented figures as facts. End with the 3 questions that most change the result.`,
  },
  {
    id: "debate",
    label: "المحاور الناقد",
    sub: "يختبر فكرتك: أقوى حجج الطرفين ونقاط الضعف",
    placeholder: "اكتب فكرتك أو قرارك لأختبره بحجج مضادة…",
    hard: false,
    addon: `

DEBATE PARTNER MODE
Stress-test the user's idea or decision. Output: 1) the idea restated fairly in one line; 2) the strongest case FOR it (3 points); 3) the strongest case AGAINST it (3 points, steel-manned, not strawmen); 4) the hidden assumptions it depends on; 5) a cheap test the user can run this week to find out who is right; 6) a verdict with a confidence level. Be direct and respectful, never flatter, and say plainly when the evidence is thin.`,
  },
  {
    id: "factcheck",
    label: "تدقيق المعلومات",
    sub: "يفحص ادعاءً أو خبرًا ويبيّن مدى الثقة بصراحة",
    placeholder: "الصق الخبر أو الادعاء المراد التحقق منه…",
    hard: false,
    addon: `

FACT-CHECK MODE
Break the pasted text into separate claims. For each claim give a verdict (صحيح / مضلّل / غير صحيح / لا يمكن التحقق) with a one-line reason and a confidence level, based only on established knowledge. You cannot browse the live web here: say so once, flag anything recent or fast-changing as "needs a live source", never invent sources, links, quotes or statistics, and finish with how the user can verify the claims (official sites, original documents, reverse image search). Explain red flags of misinformation seen in the text (emotional wording, missing source, old photo, cropped quote) without accusing anyone.`,
  },
];

export function chatModeById(id: unknown): ChatMode | undefined {
  return CHAT_MODES.find((m) => m.id === id);
}
