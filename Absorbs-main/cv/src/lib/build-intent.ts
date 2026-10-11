/**
 * ONE source of truth for "the user asked to BUILD something" (game / site / app / system / script).
 * Shared by the server (engine choice) and the client (when the code box is allowed to appear),
 * so the two can never disagree again.
 *
 * Pure string logic, no imports: safe in the browser and on the server.
 */

const NOUN =
  /(لعب[ةه]|العاب|ألعاب|\bgame|موقع|مواقع|\bsite\b|website|web ?app|landing|صفح[ةه] (هبوط|ويب)|تطبيق|\bapp\b|dashboard|لوح[ةه] (تحكم|قيادة)|متجر|\bstore\b|portfolio|بوت|\bbot\b|extension|إضاف[ةه]|html|نظام|system)/i;

const VERB =
  /(اصنع|اصنعلي|صنع|اعمل|سو[يّ]|صمم|برمج|ابن[يِ]|انشئ|أنشئ|طور|ط[وّ]ر|create|build|make|develop|design|generate|بغيت|ابغى|أبغى|أريد|اريد|نحب|حاب|حبيت|دير(لي)?|ندير|درلي|ديرولي|سوي|سولي|اصنعها|برمجلي)/i;

const CODE_WRITE = /(اكتب|write|اعطني|أعطني|عطيني).{0,40}(كود|code|script|سكريبت|سكربت|برنامج|program)/i;

/** A bare game wish ("لعبة ثعبان", "game flappy bird", "العاب سيارات") with no question in it = build it. */
const GAME_NOUN_FIRST = /^(?:\S{0,12}\s+)?(?:لعب[ةه]|العاب|ألعاب|game|games|jeu)(?![\p{L}])/iu;
const QUESTION_MARK = /[?؟]/;
const QUESTION_WORD = /(?:^|\s)(?:ما|ماهي|ماهو|كيف|كيفاش|لماذا|علاش|شرح|معنى|تعريف|what|how|why|who|explain|define)(?![\p{L}])|أفضل|احسن|اشهر|ترتيب/iu;
const GAME_WORD = /لعب[ةه]|العاب|ألعاب|\bgames?\b|\bjeux?\b/i;
/** a question ABOUT games ("كيف أصنع لعبة؟", "ما هي أفضل لعبة؟") is answered in text, not built */
const isGameQuestion = (t: string) => GAME_WORD.test(t) && (QUESTION_MARK.test(t) || QUESTION_WORD.test(t));

/** "build me a game / site / app / system / script" */
export function isBuildRequest(text: string): boolean {
  const t = (text || "").trim();
  if (isGameQuestion(t)) return false;
  if (t.length >= 6 && t.length < 80 && GAME_NOUN_FIRST.test(t)) return true;
  if (t.length < 12) return false;
  return (NOUN.test(t) && VERB.test(t)) || CODE_WRITE.test(t);
}
