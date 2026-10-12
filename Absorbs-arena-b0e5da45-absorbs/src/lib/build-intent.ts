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

/** "build me a game / site / app / system / script" */
export function isBuildRequest(text: string): boolean {
  const t = (text || "").trim();
  if (t.length < 12) return false;
  return (NOUN.test(t) && VERB.test(t)) || CODE_WRITE.test(t);
}
