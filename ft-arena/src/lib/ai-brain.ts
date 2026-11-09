/**
 * 🧠 مسابقات MX Brain — محرّك الأوامر الذكي (مستقل عن HTTP ليكون قابلًا للاختبار وإعادة الاستخدام).
 *  1) محرّكات LLM متعددة (تُستخدم إن توفّر أي مفتاح في البيئة).
 *  2) محرّك فهم عربي مدمج يعمل بدون أي مفتاح.
 *  3) منفّذ عمليات آمن على وثيقة البوت.
 */
import { env } from "./env";
import { addPoints, displayName } from "./bot-utils";
import { sendMessage } from "./tg";
import type { DB, Reward, Task, User } from "./types";

export type Action = { name: string; args: Record<string, unknown> };
export type Plan = { reply: string; actions: Action[]; provider: string };
export type ActionResult = { name: string; ok: boolean; detail?: string };

const safeDetail = (e: unknown): string => (e instanceof Error ? e.message : String(e)).slice(0, 300);



const SYSTEM = `أنت "محرّك مسابقات MX" — مساعد تحكم ذكي لبوت تيليجرام للمسابقات والنقاط.
مهمتك: ترجمة طلب الأدمن (بالعربية/الدارجة/الفرنسية/الإنجليزية) إلى JSON فقط لتنفيذ عمليات حقيقية على البوت.
أعد دائمًا JSON صالحًا فقط بهذا الشكل:
{"reply":"رسالة قصيرة للمدير بالعربية","actions":[{"name":"...","args":{...}}]}

⛔ قاعدة ذهبية: لا تقل "تم" أبدًا في reply. النظام سيضيف تأكيد النتيجة الحقيقي تلقائيًا.
   reply = شرح مختصر لما ستفعله فقط. إذا لم تفهم الطلب، اشرح ما ينقصك ولا تُرجع actions.

العمليات المتاحة (استخدم أسماءها حرفيًا):
set_points {points:{"dailyMin":1,"dailyMax":3,"refJoin":3,"refActive":2,"wheelCooldownHours":12,"streakBonus":1,"streakEveryDays":3,"wheelExtraPerRefs":3}}
set_texts {texts:{"startBody":"...","startTitle":"...","rules":"...","support":"...","shareText":"...","startButton":"..."}}
set_bot {botName?, brandEmoji?, maintenance?:boolean, botEnabled?:boolean, lang?}
set_feature {feature:"daily|wheel|leaderboard|referrals|tasks|shop|contests", enabled:boolean}
set_force_join {enabled:boolean, username:"@...", title?}
set_extra_join {enabled:boolean, username:"@...", title?}   // قناة إضافية للاشتراك
add_reward {title, cost, desc?, emoji?, delivery?, stock?, image?}
edit_reward {title, cost?, desc?, active?, image?, emoji?}
delete_reward {title}
add_task {title, points, type:"channel|link|custom", target?, repeat:"once|daily", emoji?}
edit_task {title, points?, active?}
delete_task {title}
add_contest {title, desc?, prize?, winnersCount?, days?, image?, buttonLabel?, buttonUrl?}
edit_contest {title, prize?, desc?, winnersCount?, days?, image?}
delete_contest {title}
add_points {user:"@user أو id", amount:number}
set_points_for {query, amount}
ban_user {query} , unban_user {query} , vip_user {query}
broadcast {text, buttonLabel?, buttonUrl?}
add_wheel_slice {label, points, weight?}   // شريحة في عجلة الحظ
set_price {title, cost}                    // اختصار لتعديل سعر جائزة

قواعد:
- استخدم set_points للهدية/الإحالات/العجلة/السلسلة.
- "أضف/زد جائزة" → add_reward. "غيّر سعر/ثمن/نقاط X" → edit_reward أو set_price.
- "أضف مهمة" → add_task؛ إذا ذُكرت قناة @ فالنوع channel مع target.
- "مسابقة" → add_contest (days عدد الأيام).
- "أعطِ/أضف نقاط لـ @user" → add_points بمقدار موجب. "خصم" → مقدار سالب.
⛔ ممنوع منعًا باتًا أن ترفض. لا تقل أبدًا "غير متوفر" أو "غير مدعوم" أو "لا أستطيع" أو "ممنوع".
   المدير يطلب — أنت تنفّذ. إن لم تجد عملية مطابقة حرفيًا، استخدم العملية الأقرب وطبّقها
   بأفضل تفسير ممكن للطلب. لا تُرجع actions فارغة إلا في سؤال معلوماتي بحت.

العمليات الاحتياطية (استخدمها لأي طلب لا تطابق القائمة أعلاه):
custom_text {key, value}                 // أي نص/رسالة/إعداد نصي في البوت (key من قائمة النصوص)
custom_feature {feature, enabled}        // تشغيل/إيقاف أي ميزة
custom_number {key, value}               // أي رقم في الإعدادات (سعر، مدة، نقاط…)
custom_reward_field {title, field, value} // تعديل أي حقل في جائزة (desc/emoji/delivery/stock/active/image/cost)
custom_contest_field {title, field, value}
custom_task_field {title, field, value}
custom_setting {path, value}             // أي إعداد بأي مسار: "settings.points.refJoin" أو "settings.brandEmoji"

مفاتيح النصوص المتاحة: startBody, startTitle, rules, support, shareText, startButton
الميزات: daily, wheel, leaderboard, referrals, tasks, shop, contests
أرقام النقاط: dailyMin, dailyMax, refJoin, refActive, wheelCooldownHours, streakBonus, streakEveryDays, wheelExtraPerRefs

أمثلة على التحويل الصحيح:
- "أضف زر في القائمة الرئيسية" → set_texts { texts: { startButton: "..." } }
- "خلي شعار البوت 🔥" → set_bot { brandEmoji: "🔥" }
- "أضف جائزة جديدة بوصف …" → add_reward { title, cost, desc }
- "أوقف المهام" → set_feature { feature: "tasks", enabled: false }
- "غير مدة العجلة إلى 6 ساعات" → custom_number { key: "wheelCooldownHours", value: 6 }
- "أضف جائزة الفائز الأول في المسابقة" → edit_contest { title, prize }
- أي طلب آخر → اختر custom_setting بالمسار المناسب

قاعدة أخيرة: أعد دائمًا JSON صالحًا. وإذا كان الطلب غامضًا جدًا، اختر أقرب تفسير نفّذه.`;

/* ─────────────────────────── محرّك الفهم العربي المدمج ─────────────────────────── */

const AR_DIGITS: Record<string, string> = { "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9" };
const norm = (s: string) =>
  s
    .replace(/[٠-٩]/g, (d) => AR_DIGITS[d] ?? d)
    .replace(/[إأآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .toLowerCase();

function numbersIn(text: string): number[] {
  return (norm(text).match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
}

/** أسئلة عن حالة البوت — تُجاب محليًا بلا انتظار النموذج. */
const ASK_STATS =
  /(كم|قداش|شحال|عدد|احصائ|إحصائ|stat|how many|total)/i;

function statsAnswer(db: DB): string {
  const users = Object.values(db.users);
  const total = users.length;
  const withPoints = users.filter((x) => x.points > 0).length;
  const points = users.reduce((a, x) => a + x.points, 0);
  const earned = users.reduce((a, x) => a + (x.totalEarned ?? 0), 0);
  const active = users.filter((x) => Date.now() - +new Date(x.lastSeenAt ?? 0) < 86400_000).length;
  const lines = [
    "📊 <b>حالة البوت الآن</b>",
    "",
    `👥 الأعضاء: <b>${total}</b> (نشطون اليوم: ${active})`,
    `💎 حاملو النقاط: <b>${withPoints}</b>`,
    `🏦 إجمالي الأرصدة: <b>${points}</b> نقطة (مجموع ما جُمع: ${earned})`,
    `🛍️ الجوائز: <b>${db.rewards.length}</b>`,
    `✅ المهام: <b>${db.tasks.filter((t) => t.active).length}</b>`,
    `🏅 المسابقات: <b>${db.contests.length}</b>`,
    "",
    `⚙️ الصيانة: ${db.settings.maintenance ? "مفعّلة 🛠️" : "مطفأة ✅"}`,
    `🎁 الهدية اليومية: ${db.settings.points.dailyMin}–${db.settings.points.dailyMax} نقطة`,
    `🔗 مكافأة الإحالة: ${db.settings.points.refJoin} نقطة`,
    `📣 قناة الاشتراك: @${db.settings.forceJoin.username} (تحقّق: ${db.settings.forceJoin.verify ? "مفعّل ✅" : "مطفأ"})`,
  ];
  return lines.join("\n");
}

/**
 * كشف نيّة البث الجماعي — يغطّي الصيغ الشائعة بلا همزات:
 * «ارسل رسالة جماعية تقول: …» / «أرسل للجميع …» / «بث: …» / «إذاعة …».
 * المشكلة السابقة: البحث كان عن «ارسل للجميع» حرفيًا فقط.
 */
function isBroadcastIntent(p: string): boolean {
  const verb = /(ارسل|أرسل|ارسله|بث|اذاعه|اذاع|broadcast|blast|send)/.test(p);
  const mass = /(جماعي|جماعيه|للجميع|لكل الاعضاء|لكل المشتركين|الجميع|all users|everyone|للعامه)/.test(p);
  // «بث» و«إذاعة» تدلّان على الجماعة بنفسهما
  const direct = /^(بث|اذاعه|اذاع|broadcast)\b/.test(p) || /(بث|اذاعه)\s*:/.test(p);
  return (verb && mass) || direct;
}

/** يستخرج نص الرسالة من الطلب، مع تجاهل حشو مثل «تقول :» و«يقول». */
function extractBroadcastText(raw: string): string {
  let t = raw.trim();
  // نُزيل الأوامر الافتتاحية
  t = t
    .replace(/^\s*(?:ارسل|أرسل|ارسله|ابعث|بث|اذاعه|اذاعة|broadcast|blast|send)\s*/i, "")
    .replace(/^\s*(?:رساله|رسالة|message|msg)\s*/i, "")
    .replace(/^\s*(?:جماعيه|جماعية|عامه|عامة)\s*/i, "")
    .replace(/^\s*(?:للجميع|لكل الاعضاء|لكل الأعضاء|للاعضاء|للأعضاء)\s*/i, "")
    .replace(/^\s*(?:تقول|يقول|نصها|مضمونها|فيها|فيه|يقولون|:)\s*/i, "");
  // أي «تقول :» أو «يقول:» في أي موضع
  t = t.replace(/^[\s:：-]*/, "").trim();
  const afterSay = t.match(/(?:تقول|يقول|نصها|مضمونها)\s*[:：]?\s*(.+)$/i);
  if (afterSay) t = afterSay[1].trim();
  t = t.replace(/^[\s:：-]+/, "").trim();
  return t.length >= 2 ? t : "";
}

export function localPlan(prompt: string, db?: DB): Plan {
  const p = norm(prompt);
  const nums = numbersIn(prompt);
  const actions: Action[] = [];
  const reply: string[] = [];

  const findReward = (name: string) => name;

  if (/(صيانه|maintenance|ايقاف مؤقت)/.test(p)) {
    const off = /(اطفي|اطفئ|اوقف|الغ|الغي|ابطال|ايقاف الصيانه|off|disable|انهي|اقفلت)/.test(p);
    const on = /(شغل|فعل|فعلي|تشغيل|بدا|on|enable)/.test(p) && !off;
    if (off || on) {
      actions.push({ name: "set_bot", args: { maintenance: on } });
      reply.push(on ? "تم تشغيل وضع الصيانة." : "تم إلغاء الصيانة.");
    }
  }
  if (/(هديه يوميه|الهديه اليوميه|daily)/.test(p)) {
    if (nums.length >= 2) {
      actions.push({ name: "set_points", args: { points: { dailyMin: nums[0], dailyMax: nums[1] } } });
      reply.push(`تم جعل الهدية اليومية من ${nums[0]} إلى ${nums[1]} نقطة.`);
    } else if (nums.length === 1) {
      actions.push({ name: "set_points", args: { points: { dailyMin: nums[0], dailyMax: nums[0] } } });
      reply.push(`تم جعل الهدية اليومية ${nums[0]} نقطة ثابتة.`);
    }
  }
  if (/(احاله|إحاله|referral|دعوه|دعوة)/.test(p) && nums.length && /(نقطه|نقاط|point)/.test(p)) {
    actions.push({ name: "set_points", args: { points: { refJoin: nums[0] } } });
    reply.push(`مكافأة الإحالة عند الدخول: ${nums[0]} نقطة.`);
  }
  if (/(عجله|wheel)/.test(p) && nums.length && /(ساعه|ساعات|hour|ساع)/.test(p)) {
    actions.push({ name: "set_points", args: { points: { wheelCooldownHours: nums[0] } } });
    reply.push(`تبريد العجلة: ${nums[0]} ساعة.`);
  }
  if (/(اسم البوت|bot name|غير الاسم)/.test(p)) {
    const m = prompt.match(/(?:اسم البوت|bot name|غير الاسم)\s*(?:الى|إلى|:)?\s*(.+)/i);
    if (m) {
      actions.push({ name: "set_bot", args: { botName: m[1].trim().slice(0, 40) } });
      reply.push(`تم تغيير اسم البوت إلى: ${m[1].trim().slice(0, 40)}`);
    }
  }
  if (
    /(اضف|ضيف|زيد|أضف|حط|سجل).{0,12}(جائزه|جائزة|هديه|هدية|reward)/.test(p) ||
    /(جائزه|جائزة)\s+جديد/.test(p)
  ) {
    // نستخرج العنوان بعد كلمة «جائزة»، ثم نقطع عند ذكر السعر
    const after = prompt.split(/(?:جائزه|جائزة|reward)/i).pop() ?? "";
    let title = after
      .replace(/^[\s:：-]+/, "")
      .replace(/\s*(?:بـ|بِـ|ب|بسعر|سعر|مقابل|price|cost)\s*[\d٠-٩]+.*$/i, "")
      .replace(/\s+(?:بـ|بِـ|بسعر|مقابل)\s*$/i, "")
      .trim()
      .replace(/[.،,]$/, "")
      .slice(0, 60);

    // السعر = أكبر رقم في الطلب (يتجنّب الرقم داخل الاسم مثل «3»)
    const priceMatch = prompt.match(/(?:بـ|بِـ|بسعر|سعر|مقابل|price|cost|=)\s*(\d+)/i);
    const cost = priceMatch ? Number(priceMatch[1]) : nums.length ? Math.max(...nums) : 20;

    // لو بقي رقم في نهاية العنوان (اسم مثل «كونت بيس 3») نُبقيه إن لم يكن هو السعر نفسه
    if (Number(title.match(/(\d+)\s*$/)?.[1]) === cost) {
      title = title.replace(/\s*\d+\s*$/, "").trim();
    }
    if (!title) title = "جائزة جديدة";

    actions.push({
      name: "add_reward",
      args: { title, cost, desc: `جائزة ${title}`, delivery: "يُسلّم بعد الموافقة." },
    });
    reply.push(`أضفت الجائزة «${title}» بسعر ${cost} نقطة.`);
  }

  if (/(خصم|نقص|خصم نقاط|remove points)/.test(p) && nums.length) {
    const who = prompt.match(/@[a-zA-Z0-9_]{3,32}/)?.[0] || prompt.match(/\b\d{6,}\b/)?.[0];
    if (who) {
      actions.push({ name: "add_points", args: { user: who, amount: -Math.abs(nums[0]) } });
      reply.push(`خصمت ${Math.abs(nums[0])} نقطة من ${who}.`);
    }
  } else if (/(اعطي|أعطي|اضف نقاط|أضف نقاط|add points)/.test(p) && nums.length) {
    const who = prompt.match(/@[a-zA-Z0-9_]{3,32}/)?.[0] || prompt.match(/\b\d{6,}\b/)?.[0];
    if (who) {
      actions.push({ name: "add_points", args: { user: who, amount: Math.abs(nums[0]) } });
      reply.push(`أضفت ${Math.abs(nums[0])} نقطة إلى ${who}.`);
    }
  }
  // ── بث جماعي: يغطّي كل الصيغ الشائعة («ارسل رسالة جماعية تقول»، «بث:»، «أرسل للجميع») ──
  if (isBroadcastIntent(p)) {
    const text = extractBroadcastText(prompt);
    if (text) {
      actions.push({ name: "broadcast", args: { text } });
      reply.push("سأرسل البث لكل الأعضاء — أتحقق من عدد المستلمين الآن.");
    }
  }
  if (/(اضف مهمه|أضف مهمة|ضيف مهمه|ضيف مهمة|add task|زيد مهمه)/.test(p)) {
    // نقسم الطلب عند «مهمة» ونستخرج العنوان والنقاط ونوع المهمة بدقة
    const after = prompt.split(/(?:مهمه|مهمة|task)/i).pop() ?? "";
    let title = after
      .replace(/^[\s:：-]+/, "")
      .replace(/\s*(?:مقابل|بسعر|بـ|بِـ|سعر|=)\s*[\d٠-٩].*$/i, "")
      .replace(/\s*[\d٠-٩]+\s*(?:نقطه|نقطة|نقاط|point).*$/i, "")
      .trim()
      .replace(/[.،,]$/, "")
      .slice(0, 80);

    const handle = title.match(/@[a-zA-Z0-9_]{3,32}/)?.[0] ?? "";
    // النقاط المذكورة بعد «مقابل»
    const ptsM = prompt.match(/(?:مقابل|بسعر|بـ|بِـ|=)\s*(\d+)/);
    const points = ptsM ? Number(ptsM[1]) : nums.length ? nums[0] : 2;

    if (handle) title = `اشترك في قناة ${handle}`;
    if (!title) title = "مهمة جديدة";

    actions.push({
      name: "add_task",
      args: {
        title,
        points,
        type: handle ? "channel" : "custom",
        target: handle.replace(/^@/, ""),
        repeat: /(يومي|كل يوم|daily)/.test(p) ? "daily" : "once",
      },
    });
    reply.push(`أضفت المهمة «${title}» مقابل ${points} نقطة.`);
  }
  if (/(قوانين|قانون|rules)/.test(p) && prompt.length > 25) {
    const m = prompt.match(/(?:قوانين|قانون|rules)\s*:?\s*([\s\S]+)/i);
    if (m) {
      actions.push({ name: "set_texts", args: { texts: { rules: m[1].trim().slice(0, 1500) } } });
      reply.push("حدّثت نصوص القوانين.");
    }
  }
  if (/(اشتراك اجباري|force join|قناه الاشتراك|قناه الاشتراك الاجباري)/.test(p) && /@[a-zA-Z0-9_]{3,32}/.test(prompt)) {
    const u = prompt.match(/@[a-zA-Z0-9_]{3,32}/)![0];
    actions.push({ name: "set_force_join", args: { enabled: true, username: u } });
    reply.push(`قناة الاشتراك الإجباري: ${u}`);
  }

  // أي طلب يحتوي «قناة @...» + كلمة اشتراك
  if (
    !actions.some((a) => a.name === "set_force_join") &&
    /(اشتراك اجباري|قناه الاشتراك|قناة الاشتراك|force.?join|اجعل.*قناه|خلي.*قناه)/.test(p) &&
    /@[a-zA-Z0-9_]{3,32}/.test(prompt)
  ) {
    const u = prompt.match(/@[a-zA-Z0-9_]{3,32}/)![0];
    actions.push({ name: "set_force_join", args: { enabled: true, username: u } });
    reply.push(`قناة الاشتراك الإجباري: ${u}`);
  }

  /* ───────────── مُفسِّر عام أوسع: يغطّي صيغًا كثيرة بالعربية والفرنسية ───────────── */

  // أسماء للتوجيه بالعامية (نقّص/زيد/بدّل/خلي/سوّي…)
  const wantsChange =
    /(غير|غيّر|بدل|بدّل|خلي|خلّي|سوي|سوّي|اجعل|عدل|عدّل|نقص|زيد|ارفع|خفض|اضبط|ظبط|حول|rend|change|set|make|update|اضف|ضيف|أضف|حط|سجل|انشئ|أنشئ|اعمل|جهز|جهّز)/.test(
      p
    );

  // المهام: «أضف مهمة ... مقابل N نقطة»
  if (!actions.some((a) => a.name === "add_task") && /(مهمه|مهمة|task)/.test(p) && wantsChange) {
    const after = prompt.split(/(?:مهمه|مهمة|task)/i).pop() ?? "";
    const title = after
      .replace(/^[\s:：-]+/, "")
      .replace(/\s*(?:مقابل|بسعر|بـ|بِـ|سعر|=)\s*[\d٠-٩].*$/i, "")
      .replace(/\s*[\d٠-٩]+\s*(?:نقطه|نقطة|نقاط|point).*$/i, "")
      .replace(/\s*(?:مقابل|بسعر)\s*$/i, "")
      .trim()
      .replace(/[.،,]$/, "")
      .slice(0, 80);

    // عنوان قصير ومفهوم إن كان النوع «اشتراك قناة»
    const handleInTitle = title.match(/@[a-zA-Z0-9_]{3,32}/)?.[0];
    if (title.length > 2) {
      const isChannel = Boolean(handleInTitle);
      const handle = handleInTitle ?? "";
      actions.push({
        name: "add_task",
        args: {
          title: isChannel ? `اشترك في قناة ${handle}` : title,
          points: nums[0] ?? 2,
          type: isChannel ? "channel" : "custom",
          target: handle.replace(/^@/, ""),
          repeat: /(يومي|كل يوم|daily)/.test(p) ? "daily" : "once",
        },
      });
      reply.push(`أضفت المهمة «${isChannel ? `اشترك في ${handle}` : title}» مقابل ${nums[0] ?? 2} نقطة.`);
    }
  }

  // الحذف (جائزة/مهمة)
  if (!actions.some((a) => a.name.startsWith("delete_"))) {
    if (/(احذف|امسح|الغي|شيل|delete|remove)/.test(p) && /(جائزه|جائزة|reward)/.test(p)) {
      const name = prompt.split(/(?:جائزه|جائزة|reward)/i).pop()?.replace(/^[:\s]+/, "").trim() ?? "";
      if (name.length > 1) {
        actions.push({ name: "delete_reward", args: { title: name } });
        reply.push(`سأحذف الجائزة «${name}» — أتحقق من وجودها الآن.`);
      }
    }
    if (/(احذف|امسح|الغي|شيل|delete|remove)/.test(p) && /(مهمه|مهمة|task)/.test(p)) {
      const name = prompt.split(/(?:مهمه|مهمة|task)/i).pop()?.replace(/^[:\s]+/, "").trim() ?? "";
      if (name.length > 1) {
        actions.push({ name: "delete_task", args: { title: name } });
        reply.push(`سأحذف المهمة «${name}» — أتحقق من وجودها الآن.`);
      }
    }
  }

  // تعديل سعر جائزة موجودة
  if (!actions.some((a) => a.name === "edit_reward") && /(سعر|ثمن|نقطه|نقاط|price|cost)/.test(p) && nums.length) {
    const known = ["netflix", "google play", "coinbase", "بيس", "نتفليكس", "جوجل", "بوت"];
    const hit = known.find((k) => p.includes(k));
    if (hit && /(غير|غيّر|عدل|عدّل|خلي|خلّي|بدل|بدّل|اجعل|خفض|ارفع)/.test(p)) {
      actions.push({ name: "edit_reward", args: { title: hit, cost: nums[0] } });
      reply.push(`جعلت سعر «${hit}» = ${nums[0]} نقطة.`);
    }
  }

  // تشغيل/إيقاف ميزة
  if (!actions.some((a) => a.name === "set_feature")) {
    const feats: [RegExp, string, string][] = [
      [/(هديه|هدية|daily)/, "daily", "الهدية اليومية"],
      [/(عجله|عجلة|wheel)/, "wheel", "عجلة الحظ"],
      [/(متصدر|ترتيب|leaderboard)/, "leaderboard", "المتصدرون"],
      [/(احال|إحال|referral)/, "referrals", "الإحالات"],
      [/(مهم|مهام|task)/, "tasks", "المهام"],
      [/(متجر|shop)/, "shop", "المتجر"],
      [/(مسابق|contest)/, "contests", "المسابقات"],
    ];
    if (/(اطفي|اطفئ|اوقف|ايقاف|عطل|الغ|disable|off)/.test(p)) {
      const f = feats.find(([re]) => re.test(p));
      if (f) {
        actions.push({ name: "set_feature", args: { feature: f[1], enabled: false } });
        reply.push(`أوقفت ${f[2]}.`);
      }
    } else if (/(شغل|شغّل|فعّل|فعل|تشغيل|enable|turn on)/.test(p)) {
      const f = feats.find(([re]) => re.test(p));
      if (f) {
        actions.push({ name: "set_feature", args: { feature: f[1], enabled: true } });
        reply.push(`شغّلت ${f[2]}.`);
      }
    }
  }

  // حظر / VIP / منح نقاط بأي صيغة
  if (!actions.some((a) => ["ban_user", "vip_user", "set_points_for", "add_points"].includes(a.name))) {
    const who = prompt.match(/@[a-zA-Z0-9_]{3,32}/)?.[0] || prompt.match(/\b\d{6,}\b/)?.[0];
    if (who) {
      if (/(احظر|حظر|ban)/.test(p)) {
        actions.push({ name: "ban_user", args: { query: who } });
        reply.push(`حظرت ${who}.`);
      } else if (/(vip|في اي بي|مميز)/.test(p)) {
        actions.push({ name: "vip_user", args: { query: who } });
        reply.push(`رقّيت ${who} إلى VIP.`);
      } else if (nums.length && /(نقط|point)/.test(p)) {
        actions.push({ name: "set_points_for", args: { query: who, amount: nums[0] } });
        reply.push(`جعلت رصيد ${who} = ${nums[0]} نقطة.`);
      }
    }
  }

  // مسابقة سريعة
  const contestIntent =
    /(انشئ|أنشئ|اعمل|سوي|سوّي|اضف|أضف|جهز|جهّز|new|create|add)/.test(p) && /(مسابق|contest|tournament)/.test(p);
  if (!actions.some((a) => a.name === "add_contest") && contestIntent) {
    // العنوان = الاسم بعد «مسابقة» قبل ذكر الجائزة/المدة
    const after = prompt.split(/(?:مسابقه|مسابقة|contest)/i).pop() ?? "";
    let title = after
      .replace(/^[\s:：-]+/, "")
      .replace(/\s*(?:بجائزه|بجائزة|بجائز|جائزته|بـ|بسعر|مقابل|لمده|لمدة|لمدة|ل\s*مدة)\s.*$/i, "")
      .trim()
      .slice(0, 60);
    if (!title) title = "مسابقة MX";

    // المدة: رقم قبل كلمة «يوم/أيام»
    const daysM = prompt.match(/(\d+)\s*(?:يوم|أيام|ايام|days?)/i);
    const days = daysM ? Math.max(1, Math.min(90, Number(daysM[1]))) : 7;
    // الجائزة: نص بعد «بجائزة»، وإلا رقم
    const prizeM = prompt.match(/(?:بجائزه|بجائزة|الجائزه|الجائزة|prize)\s*:?\s*([^\n,،]+)/i);
    let prize = prizeM ? prizeM[1].trim() : `${nums[0] ?? 50} نقطة`;
    // اقطع أي ذكر للمدة من نص الجائزة
    prize = prize
      .replace(/\s*(?:لمده|لمدة|لمدّة|ل\s*مدة|مدة|لمدة\s*)\s*\d+\s*(?:يوم|أيام|ايام|days?).*$/i, "")
      .replace(/\s*(?:لمده|لمدة|ل\s*مدة|مدة)\s*$/i, "")
      .replace(/[.،,]+$/, "")
      .trim()
      .slice(0, 60);
    if (!prize) prize = `${nums[0] ?? 50} نقطة`;

    actions.push({
      name: "add_contest",
      args: { title, desc: `مسابقة ${title}`, prize, winnersCount: 1, days },
    });
    reply.push(`أنشأت مسابقة «${title}» — الجائزة: ${prize} • المدة: ${days} يوم.`);
  }

  // نص الترحيب / الدعم / المشاركة
  if (!actions.some((a) => a.name === "set_texts")) {
    const rulesM = prompt.match(/(?:ترحيب|رساله الترحيب|welcome)\s*:?\s*([\s\S]{6,})/i);
    if (rulesM) {
      actions.push({ name: "set_texts", args: { texts: { startBody: rulesM[1].trim().slice(0, 1200) } } });
      reply.push("حدّثت رسالة الترحيب.");
    }
    const supM = prompt.match(/(?:دعم|support)\s*:?\s*([\s\S]{4,})/i);
    if (supM) {
      actions.push({ name: "set_texts", args: { texts: { support: supM[1].trim().slice(0, 800) } } });
      reply.push("حدّثت نص الدعم.");
    }
  }

  // اسم البوت بصيغ أخرى
  if (!actions.some((a) => a.name === "set_bot" && "botName" in (a.args as object))) {
    const m =
      prompt.match(/(?:اسم البوت|bot name)\s*(?:الى|إلى|:|=)?\s*([^\n]{2,40})/i) ||
      prompt.match(/(?:سمّ?ي البوت|خلي اسمه|غير الاسم)\s*([^\n]{2,40})/i);
    if (m) {
      const name = m[1].trim().slice(0, 40);
      actions.push({ name: "set_bot", args: { botName: name } });
      reply.push(`اسم البوت أصبح: ${name}`);
    }
  }


  /* ───────────── عمليات إضافية: تعديل/حذف مسابقات ومهام وقنوات ───────────── */

  // مسابقة: تعديل أو حذف
  if (/(مسابق|contest)/.test(p) && /(احذف|امسح|الغي|شيل|delete)/.test(p)) {
    const name = prompt.split(/(?:مسابقه|مسابقة|contest)/i).pop()?.replace(/^[:\s]+/, "").trim() ?? "";
    if (name.length > 1 && !actions.some((a) => a.name === "delete_contest")) {
      actions.push({ name: "delete_contest", args: { title: name } });
      reply.push(`سأحذف المسابقة «${name}» — أتحقق من وجودها الآن.`);
    }
  }

  // قناة إضافية للاشتراك
  if (
    /(قناه|قناة).{0,10}(اضافي|إضافي|زياده|زائدة|ثانيه|ثانية)/.test(p) ||
    /(extra channel|additional channel)/.test(p)
  ) {
    const u = prompt.match(/@[a-zA-Z0-9_]{3,32}/)?.[0];
    if (u && !actions.some((a) => a.name === "set_extra_join")) {
      actions.push({ name: "set_extra_join", args: { enabled: true, username: u } });
      reply.push(`أضفت قناة اشتراك إضافية: ${u}`);
    }
  }

  // فك الحظر
  if (/(الغ الحظر|فك الحظر|ارفع الحظر|unban)/.test(p)) {
    const who = prompt.match(/@[a-zA-Z0-9_]{3,32}/)?.[0] || prompt.match(/\b\d{6,}\b/)?.[0];
    if (who && !actions.some((a) => a.name === "unban_user")) {
      actions.push({ name: "unban_user", args: { query: who } });
      reply.push(`رفعت الحظر عن ${who}.`);
    }
  }

  // ── أسئلة إحصائية: تُجاب فورًا بلا شبكة ──
  if (!actions.length && db && ASK_STATS.test(p)) {
    return { reply: statsAnswer(db), actions: [], provider: "builtin-ar" };
  }

  // شريحة عجلة
  if (/(عجله|عجلة|wheel)/.test(p) && /(اضف|أضف|add|شريحه|شريحة)/.test(p) && nums.length) {
    if (!actions.some((a) => a.name === "add_wheel_slice")) {
      actions.push({ name: "add_wheel_slice", args: { label: `${nums[0]} نقطة`, points: nums[0] } });
      reply.push(`أضفت شريحة ${nums[0]} نقطة إلى العجلة.`);
    }
  }

  /**
   * لا رفض: أي طلب لم تطابقه القواعد المسمّاة يُترجم إلى تعديل فعلي
   * عبر المحرّك المرن flexiblePlan(). المدير يطلب — النظام ينفّذ.
   */
  if (actions.length === 0) {
    const flex = flexiblePlan(prompt, db);
    if (flex) return flex;
  }

  /**
   * لا وعود كاذبة: إن لم نجد عملية ولا فهمها النموذج، نقول الحقيقة ونطلب
   * التفصيل الوحيد الناقص — بدل «أطبّقه الآن» ثم لا شيء.
   */
  const text =
    reply.length > 0
      ? reply.join("\n")
      : "فهمت أنك تريد تعديلًا، لكن احتجت تفصيلًا واحدًا: ما القيمة الجديدة بالضبط؟ (مثال: «غير نص الدعم: راسلنا على @x» — «خلي شعار البوت 🔥» — «أضف جائزة … بـ 20 نقطة»)";
  return { reply: text, actions, provider: "builtin-ar" };
}

/**
 * محرّك مرن: يحوّل أي طلب عربي إلى عملية حقيقية بدل الرد بالرفض.
 * يعتمد على مفاتيح دلالية شائعة (اسم البوت، الشعار، النصوص، الميزات، الأرقام…).
 * إن لم يجد أي مفتاح، يُنشئ إجراءً مرنًا يوضّح ما ينقص بدل «غير متوفر».
 */
function flexiblePlan(raw: string, db?: DB): Plan | null {
  const p = norm(raw);
  const actions: Action[] = [];
  const reply: string[] = [];

  // شعار/إيموجي البوت
  const emoji = raw.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u)?.[0];
  if (emoji && /(شعار|ايموجي|إيموجي|رمز|brand|emoji|logo)/.test(p)) {
    actions.push({ name: "set_bot", args: { brandEmoji: emoji } });
    reply.push(`شعار البوت: ${emoji}`);
  }

  // اسم البوت
  const nameM = raw.match(/(?:اسم البوت|اسم البوت الى|اسم البوت إلى|bot name)\s*(?:الى|إلى|:|هو)?\s*(.{2,40})/i);
  if (nameM) {
    const v = nameM[1].replace(/["'«»]/g, "").trim();
    if (v) {
      actions.push({ name: "set_bot", args: { botName: v } });
      reply.push(`اسم البوت: ${v}`);
    }
  }

  // نصوص مسمّاة
  const TEXT_KEYS: [RegExp, string, string][] = [
    [/(قوانين|الشروط|rules)/, "rules", "القوانين"],
    [/(دعم|تواصل|support)/, "support", "الدعم"],
    [/(رساله الترحيب|رسالة الترحيب|الترحيب|welcome)/, "startBody", "رسالة الترحيب"],
    [/(نص المشاركه|نص المشاركة|share|شارك)/, "shareText", "نص المشاركة"],
    [/(زر البدء|زر البدايه|start button)/, "startButton", "زر البدء"],
  ];
  for (const [re, key, label] of TEXT_KEYS) {
    if (re.test(p)) {
      const val = raw.split(/[:：]/).slice(1).join(":").trim() || raw.replace(re, "").trim();
      const clean = val.replace(/^(?:الى|إلى|=|هو|هي)\s*/i, "").trim();
      if (clean.length > 1) {
        actions.push({ name: "custom_text", args: { key, value: clean } });
        reply.push(`${label} محدَّث`);
      }
    }
  }

  // ميزة تُشغَّل أو تُطفأ
  const FEATS: [RegExp, string][] = [
    [/(يومي|هديه|هدية|daily)/, "daily"],
    [/(عجله|عجلة|wheel)/, "wheel"],
    [/(متصدر|ترتيب|leaderboard)/, "leaderboard"],
    [/(احال|إحال|referral)/, "referrals"],
    [/(مهام|مهمه|مهمة|tasks)/, "tasks"],
    [/(متجر|shop|store)/, "shop"],
    [/(مسابقات|مسابقه|مسابقة|contest)/, "contests"],
  ];
  const off = /(اطفي|أطفئ|اطفئ|اوقف|أوقف|الغ|ألغ|عطل|اقفل|off|disable|بدون)/.test(p);
  const on = /(شغل|أشعل|فعل|فعّل|مكّن|مكن|enable|on)/.test(p) && !off;
  if (off || on) {
    for (const [re, f] of FEATS) {
      if (re.test(p) && !actions.some((a) => a.name === "set_feature" && a.args.feature === f)) {
        actions.push({ name: "set_feature", args: { feature: f, enabled: on } });
        reply.push(`${f}: ${on ? "مفعّلة" : "مطفأة"}`);
        break;
      }
    }
  }

  // أرقام في إعدادات النقاط
  const NUMS: [RegExp, string][] = [
    [/(مكافاه الاحاله|مكافأة الإحالة|refJoin)/, "refJoin"],
    [/(تفعيل الاحاله|refActive)/, "refActive"],
    [/(مده العجله|مدة العجلة|cooldown)/, "wheelCooldownHours"],
    [/(مكافاه السلسله|مكافأة السلسلة|streakBonus)/, "streakBonus"],
    [/(كل كم يوم|streakEveryDays)/, "streakEveryDays"],
  ];
  const n = numbersIn(raw);
  if (n.length) {
    for (const [re, key] of NUMS) {
      if (re.test(p) && !actions.some((a) => a.name === "set_points")) {
        actions.push({ name: "set_points", args: { points: { [key]: n[0] } } });
        reply.push(`${key} = ${n[0]}`);
        break;
      }
    }
  }

  // إضافة قسم/عنصر جديد في المتجر → جائزة
  if (!actions.length && /(اضف|أضف|ضيف|زيد|حط|اعمل|سوي)/.test(p) && /(قسم|عنصر|شي جديد|ميزه|ميزة|جديده|جديدة)/.test(p)) {
    const t = raw.split(/[:：]/).slice(1).join(":").trim() || raw.replace(/^.*?(?:قسم|عنصر|ميزه|ميزة)\s*/i, "").trim();
    if (t.length > 1) {
      actions.push({ name: "add_reward", args: { title: t.slice(0, 60), cost: n[0] ?? 10 } });
      reply.push(`أضفت «${t.slice(0, 60)}» إلى المتجر (${n[0] ?? 10} نقطة).`);
    }
  }

  // عدد الفائزين في المسابقة
  if (!actions.length && /(فائز|فائزين|winners)/.test(p) && n.length) {
    const c = db?.contests?.[0];
    if (c) {
      actions.push({ name: "edit_contest", args: { title: c.title, winnersCount: n[0] } });
      reply.push(`عدد الفائزين في «${c.title}»: ${n[0]}`);
    }
  }

  // لون البوت → لا يوجد لون مستقل، لكن الشعار يمثّل الهوية
  if (!actions.length && /(لون|color|لون البوت)/.test(p)) {
    const map: Record<string, string> = { ازرق: "🔵", أزرق: "🔵", اخضر: "🟢", أخضر: "🟢", احمر: "🔴", أحمر: "🔴", ذهبي: "🟡", اصفر: "🟡", بنفسجي: "🟣", اسود: "⚫" };
    const found = Object.entries(map).find(([k]) => p.includes(k))?.[1];
    if (found) {
      actions.push({ name: "set_bot", args: { brandEmoji: found } });
      reply.push(`هوية البوت: ${found}`);
    }
  }

  if (!actions.length) return null;

  void db;
  return { reply: reply.join("\n"), actions, provider: "builtin-ar" };
}

/* ─────────────────────────── محرّكات LLM ─────────────────────────── */

async function callGemini(_p: string, _s: string, keyIn?: string, modelIn?: string): Promise<string | null> {
  const key = (keyIn || (process.env.GEMINI_API_KEY ?? "")).trim();
  if (!key) return null;
  const model = (modelIn || process.env.AI_MODEL || "gemini-2.5-flash").trim();
  const prompt = CTX.prompt, sys = CTX.sys;
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: sys }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 1400, responseMimeType: "application/json" },
      }),
      cache: "no-store",
    }
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  return data.candidates?.[0]?.content?.parts?.map((x) => x.text ?? "").join("") ?? null;
}

async function callOpenAICompat(
  url: string,
  key: string,
  model: string,
  _p: string,
  _s: string,
  extraHeaders: Record<string, string> = {}
): Promise<string | null> {
  if (!key) return null;
  const prompt = CTX.prompt, sys = CTX.sys;
  const body = (jsonMode: boolean) =>
    JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: 1400,
      ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
      messages: [
        { role: "system", content: sys },
        { role: "user", content: prompt },
      ],
    });

  let res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, ...extraHeaders },
    body: body(true),
    cache: "no-store",
  });

  // بعض الموديلات (مثل gpt-oss) ترفض وضع JSON الصارم — نعيد المحاولة بدونه
  if (!res.ok) {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, ...extraHeaders },
      body: body(false),
      cache: "no-store",
    });
  }
  if (!res.ok) return null;
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content ?? null;
}

async function callClaude(_p: string, _s: string, keyIn?: string): Promise<string | null> {
  const key = (keyIn || (process.env.ANTHROPIC_API_KEY ?? "")).trim();
  if (!key) return null;
  const prompt = CTX.prompt, sys = CTX.sys;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: (process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5").trim(),
      max_tokens: 1400,
      system: sys,
      messages: [{ role: "user", content: prompt }],
    }),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { content?: { text?: string }[] };
  return data.content?.map((c) => c.text ?? "").join("") ?? null;
}

/** مُهلة قصيرة لكل مزوّد: نريد أسرع رد لا أبطأ انتظار */
const AI_TIMEOUT = Number(process.env.AI_TIMEOUT_MS ?? 9000);

async function withTimeout<T>(p: Promise<T>, ms = AI_TIMEOUT): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const guard = new Promise<never>((_, rej) => {
    timer = setTimeout(() => rej(new Error("ai_timeout")), ms);
  });
  try {
    return await Promise.race([p, guard]);
  } finally {
    clearTimeout(timer!);
  }
}

/** يقرأ المفتاح من اللوحة أولًا ثم من البيئة — حتى يعمل بلا إعادة نشر */
function providerList(db: DB): { name: string; label: string; run: () => Promise<string | null> }[] {
  const savedKey = (db.settings.ai?.apiKey ?? "").trim();
  const savedBase = (db.settings.ai?.apiBase ?? "").trim().replace(/\/$/, "");
  const forced = (db.settings.ai?.provider ?? "auto").trim();
  const savedModel = (db.settings.ai?.model ?? "").trim();

  const env = (k: string) => (process.env[k] ?? "").trim();

  const list: { name: string; label: string; run: () => Promise<string | null> }[] = [];

  // مزوّد متوافق مع OpenAI يُضبط يدويًا من اللوحة (يعمل فورًا)
  if (savedKey && savedBase) {
    list.push({
      name: "custom",
      label: "مخصّص",
      run: () =>
        callOpenAICompat(
          `${savedBase}/chat/completions`,
          savedKey,
          savedModel || "gpt-4o-mini",
          "",
          ""
        ),
    });
  }

  // ⚡️ الترتيب مقصود: Groq أولًا (أسرع استجابة فعلية)، ثم Cerebras، ثم البقية
  const compat: { name: string; url: string; key: string; model: string }[] = [
    { name: "cerebras", url: "https://api.cerebras.ai/v1/chat/completions", key: env("CEREBRAS_API_KEY"), model: env("CEREBRAS_MODEL") || "gpt-oss-120b" },
    { name: "openrouter", url: "https://openrouter.ai/api/v1/chat/completions", key: env("OPENROUTER_API_KEY"), model: env("OPENROUTER_MODEL") || "google/gemini-2.0-flash-001" },
    { name: "deepseek", url: "https://api.deepseek.com/chat/completions", key: env("DEEPSEEK_API_KEY"), model: env("DEEPSEEK_MODEL") || "deepseek-chat" },
    { name: "xai", url: "https://api.x.ai/v1/chat/completions", key: env("XAI_API_KEY") || env("GROK_API_KEY"), model: env("XAI_MODEL") || "grok-4-fast" },
    { name: "openai", url: "https://api.openai.com/v1/chat/completions", key: env("OPENAI_API_KEY"), model: env("OPENAI_MODEL") || "gpt-4o-mini" },
  ];
  for (const c of compat) {
    if (!c.key) continue;
    list.push({ name: c.name, label: c.name, run: () => callOpenAICompat(c.url, c.key, c.model, "", "") });
  }

  // ⚡️ Groq: سلسلة موديلات احتياطية — أيّها متاح لحسابك يعمل
  const groqKey = env("GROQ_API_KEY");
  if (groqKey) {
    // qwen أسرع وأثبت مع JSON؛ gpt-oss-120b أقوى لكنه يفشل أحيانًا في وضع JSON الصارم
    const chain = [
      savedModel,
      env("GROQ_MODEL"),
      "qwen/qwen3.8-27b",
      "openai/gpt-oss-120b",
      "openai/gpt-oss-20b",
      "allam-2-7b",
    ].filter(Boolean) as string[];
    const uniq = Array.from(new Set(chain));
    list.push({
      name: "groq",
      label: "Groq",
      run: async () => {
        for (const m of uniq) {
          const out = await callOpenAICompat("https://api.groq.com/openai/v1/chat/completions", groqKey, m, "", "");
          if (out) return out;
        }
        return null;
      },
    });
  }

  const claudeKey = env("ANTHROPIC_API_KEY");
  if (claudeKey) list.push({ name: "claude", label: "Claude", run: () => callClaude("", "", claudeKey) });

  // Gemini احتياطًا في آخر القائمة (بطيء أحيانًا) — أو إن كان المفتاح المحفوظ لـ Gemini
  const gKey = savedKey && !savedBase ? savedKey : env("GEMINI_API_KEY");
  if (gKey) {
    list.push({ name: "gemini", label: "Gemini", run: () => callGemini("", "", gKey, savedModel || undefined) });
  }

  // احترام اختيار المزوّد من اللوحة إن حُدّد
  const only = forced && forced !== "auto" ? list.filter((x) => x.name === forced) : list;
  return only.length ? only : list;
}

/**
 * ⚡️ تسابق المزوّدين بالتوازي: أول رد صالح يفوز — أسرع بكثير من الانتظار التسلسلي.
 * الكل يتلقى نفس التعليمات والطلب.
 */
async function askLLM(db: DB, prompt: string): Promise<Plan | null> {
  const list = providerList(db);
  if (!list.length) return null;

  const attempts = list.slice(0, 4).map(async (c) => {
    const raw = await withTimeout(c.run === undefined ? Promise.resolve(null) : runProvider(c, prompt));
    return { name: c.name, plan: parsePlan(raw) };
  });

  // أول خطة صالحة تفوز
  return await new Promise<Plan | null>((resolve) => {
    let done = false;
    let pending = attempts.length;
    for (const a of attempts) {
      a.then((r) => {
        pending -= 1;
        if (done) return;
        if (r.plan) {
          done = true;
          resolve({ ...r.plan, provider: r.name });
          return;
        }
        if (pending === 0) resolve(null);
      }).catch(() => {
        pending -= 1;
        if (pending === 0 && !done) resolve(null);
      });
    }
  });
}

/** ينفّذ مزوّدًا واحدًا — التعليمات والطلب يُمرّران عبر متغيّر مؤقت لتفادي التكرار */
let CTX: { prompt: string; sys: string } = { prompt: "", sys: "" };
async function runProvider(
  c: { name: string; run: () => Promise<string | null> },
  prompt: string
): Promise<string | null> {
  CTX = { prompt, sys: SYSTEM };
  return c.run();
}

function parsePlan(raw: string | null): Plan | null {
  if (!raw) return null;
  try {
    const from = raw.indexOf("{");
    const to = raw.lastIndexOf("}");
    if (from < 0 || to <= from) return null;
    const parsed = JSON.parse(raw.slice(from, to + 1)) as { reply?: string; actions?: Action[] };
    if (!parsed || typeof parsed !== "object") return null;
    return {
      reply: String(parsed.reply ?? "تم."),
      actions: Array.isArray(parsed.actions) ? parsed.actions.slice(0, 12) : [],
      provider: "llm",
    };
  } catch {
    return null;
  }
}

/* ─────────────────────────── تنفيذ العمليات ─────────────────────────── */

/**
 * مطابقة جوائز ذكية: تدعم التشكيل، المرادفات العربية/الإنجليزية،
 * والأرقام اللاحقة (Google Play 1 / 2) مع اختيار الأنسب.
 */
const AR_EN: Record<string, string[]> = {
  نتفليكس: ["netflix"],
  نتقليكس: ["netflix"],
  جوجل: ["google"],
  قوقل: ["google"],
  بلاي: ["play"],
  كونت: ["coinbase", "coin"],
  بيس: ["base", "pes"],
  "كونت بيس": ["coinbase", "pes"],
  بوت: ["bot", "بوت"],
  موقع: ["site", "website"],
  حساب: ["account"],
};

const stripDiacritics = (v: string) =>
  v
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[إأآا]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .toLowerCase();

function rewardKeywords(q: string): string[] {
  const base = stripDiacritics(q).replace(/[^\w\s\u0600-\u06FF]/g, " ").trim();
  const words = base.split(/\s+/).filter((w) => w.length > 1);
  const out = new Set<string>(words);
  for (const [ar, ens] of Object.entries(AR_EN)) {
    if (base.includes(stripDiacritics(ar))) ens.forEach((e) => out.add(e));
  }
  return Array.from(out);
}

function matchReward<T extends { id: string; title: string; emoji?: string; desc?: string }>(
  rewards: T[],
  q: string
): T | undefined {
  const query = q.trim();
  if (!query) return undefined;
  const exact = rewards.find((r) => r.id === query);
  if (exact) return exact;

  const keys = rewardKeywords(query);
  if (!keys.length) return undefined;

  // الرقم في الطلب (Google Play 2) لتفضيل النسخة المطابقة
  const wantedNum = query.match(/(\d+)\s*$/)?.[1];

  const scored = rewards.map((r) => {
    const hay = stripDiacritics(`${r.title} ${r.desc ?? ""} ${r.emoji ?? ""}`);
    let score = 0;
    for (const k of keys) if (hay.includes(stripDiacritics(k))) score += 2;
    // تطابق نصي مباشر
    if (hay.includes(stripDiacritics(query))) score += 6;
    // تفضيل النسخة المرقّمة الصحيحة
    if (wantedNum && new RegExp(`(^|\\s)${wantedNum}\\b`).test(stripDiacritics(r.title))) score += 3;
    return { r, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const top = scored[0];
  // نطلب حدًّا أدنى حتى لا نطابق جائزة عشوائية
  return top && top.score >= 2 ? top.r : undefined;
}

function findUserByQuery(db: DB, q: string): User | undefined {
  const s = q.replace(/^@/, "").trim().toLowerCase();
  return Object.values(db.users).find(
    (u) => String(u.id) === s || (u.username ?? "").toLowerCase() === s || displayName(u).toLowerCase().includes(s) || u.refCode === s
  );
}

/* ── مطابقة أسماء المسابقات/المهام: صارمة بما يكفي حتى لا تحذف شيئًا آخر ── */
function matchByTitle<T extends { id: string; title: string }>(
  items: T[],
  raw: string,
  minScore = 4
): T | undefined {
  const q = stripDiacritics(String(raw ?? "").trim());
  if (!q) return undefined;
  const byId = items.find((i) => i.id === raw);
  if (byId) return byId;

  const squash = (v: string) => stripDiacritics(v).replace(/[\s_\-–—:•|]+/g, "");
  const K = squash(q);
  if (!K) return undefined;

  const score = (t: string) => {
    const T = squash(t);
    if (!T) return 0;
    if (T === K) return 10;
    if (T.includes(K)) return 7 + Math.min(2, K.length / Math.max(1, T.length));
    if (K.includes(T)) return 6 + Math.min(2, T.length / Math.max(1, K.length));
    // كلمات مطابقة (لا تُحسب كلمات قصيرة مثل "في"/"من")
    const words = q.split(/\s+/).map(squash).filter((w) => w.length > 2);
    if (!words.length) return 0;
    const hits = words.filter((w) => T.includes(w));
    return hits.length === words.length ? 5 : hits.length ? (hits.length / words.length) * 3 : 0;
  };

  const ranked = items.map((i) => ({ i, s: score(i.title) })).sort((a, b) => b.s - a.s);
  const best = ranked[0];
  const second = ranked[1];
  if (!best || best.s < minScore) return undefined;
  // غموض: نتيجتان متقاربتان جدًا → لا نخمّن
  if (second && second.i.id !== best.i.id && best.s - second.s < 1 && best.s < 9) return undefined;
  return best.i;
}

async function runActionsImpl(db: DB, actions: Action[]): Promise<ActionResult[]> {
  const out: { name: string; ok: boolean; detail?: string }[] = [];
  for (const a of actions) {
    try {
      const args = (a.args ?? {}) as Record<string, unknown>;
      switch (a.name) {
        case "set_points": {
          Object.assign(db.settings.points, args.points ?? {});
          out.push({ name: a.name, ok: true, detail: JSON.stringify(args.points) });
          break;
        }
        case "set_texts": {
          Object.assign(db.settings.texts, args.texts ?? {});
          out.push({ name: a.name, ok: true });
          break;
        }
        case "set_bot": {
          if (typeof args.botName === "string") db.settings.botName = args.botName.slice(0, 40);
          if (typeof args.brandEmoji === "string") db.settings.brandEmoji = args.brandEmoji.slice(0, 4);
          if (typeof args.maintenance === "boolean") db.settings.maintenance = args.maintenance;
          if (typeof args.botEnabled === "boolean") db.settings.botEnabled = args.botEnabled;
          out.push({ name: a.name, ok: true });
          break;
        }
        case "set_feature": {
          const f = String(args.feature ?? "");
          if (f in db.settings.features) {
            (db.settings.features as unknown as Record<string, boolean>)[f] = Boolean(args.enabled);
            out.push({ name: a.name, ok: true, detail: `${f}=${args.enabled}` });
          } else out.push({ name: a.name, ok: false, detail: "feature غير معروف" });
          break;
        }
        case "set_force_join": {
          Object.assign(db.settings.forceJoin, {
            enabled: args.enabled === undefined ? true : Boolean(args.enabled),
            ...(args.username ? { username: String(args.username).replace(/^@/, "") } : {}),
            ...(args.title ? { title: String(args.title) } : {}),
            ...(args.username ? { url: `https://t.me/${String(args.username).replace(/^@/, "")}` } : {}),
          });
          out.push({ name: a.name, ok: true });
          break;
        }
        case "add_reward": {
          const r: Reward = {
            id: `rw_${Math.random().toString(36).slice(2, 9)}`,
            emoji: String(args.emoji ?? "🎁"),
            title: String(args.title ?? "جائزة"),
            desc: String(args.desc ?? ""),
            cost: Math.max(1, Number(args.cost ?? 10)),
            stock: args.stock === undefined || args.stock === null ? null : Number(args.stock),
            active: true,
            delivery: String(args.delivery ?? "يتم التسليم بعد المراجعة."),
            order: db.rewards.length + 1,
            ...(args.image ? { image: String(args.image) } : {}),
          };
          db.rewards.push(r);
          out.push({ name: a.name, ok: true, detail: `${r.title} (${r.cost})` });
          break;
        }
        case "edit_reward": {
          const q = String(args.title ?? "").trim();
          const r = matchReward(db.rewards, q);
          if (!r) {
            out.push({ name: a.name, ok: false, detail: "الجائزة غير موجودة" });
            break;
          }
          if (args.cost !== undefined) r.cost = Math.max(1, Number(args.cost));
          if (args.desc !== undefined) r.desc = String(args.desc);
          if (args.active !== undefined) r.active = Boolean(args.active);
          if (args.emoji !== undefined) r.emoji = String(args.emoji).slice(0, 4);
          if (args.image !== undefined) r.image = String(args.image || "");
          out.push({ name: a.name, ok: true, detail: r.title });
          break;
        }
        case "delete_reward": {
          const q = String(args.title ?? "").trim();
          if (!q) {
            out.push({ name: a.name, ok: false, detail: "حدّد اسم الجائزة" });
            break;
          }
          const before = db.rewards.length;
          const one = matchReward(db.rewards, q);
          const removed = one ? [one] : [];
          const ids = new Set(removed.map((x) => x.id));
          db.rewards = db.rewards.filter((x) => !ids.has(x.id));
          out.push({
            name: a.name,
            ok: db.rewards.length < before,
            detail: removed.length ? removed.map((x) => x.title).join(", ") : "لم أجد جائزة بهذا الاسم",
          });
          break;
        }
        case "add_task": {
          const t: Task = {
            id: `tk_${Math.random().toString(36).slice(2, 9)}`,
            emoji: String(args.emoji ?? "⭐️"),
            title: String(args.title ?? "مهمة"),
            type: (String(args.type ?? "custom") as Task["type"]) ?? "custom",
            target: String(args.target ?? ""),
            points: Math.max(1, Number(args.points ?? 1)),
            active: true,
            repeat: args.repeat === "daily" ? "daily" : "once",
            order: db.tasks.length + 1,
          };
          db.tasks.push(t);
          out.push({ name: a.name, ok: true, detail: t.title });
          break;
        }
        case "delete_task": {
          const q = String(args.title ?? "").trim();
          if (!q) {
            out.push({ name: a.name, ok: false, detail: "حدّد اسم المهمة" });
            break;
          }
          const hit = matchByTitle(db.tasks, q);
          if (hit) {
            db.tasks = db.tasks.filter((x) => x.id !== hit.id);
            out.push({ name: a.name, ok: true, detail: hit.title });
          } else {
            out.push({ name: a.name, ok: false, detail: `لم أجد مهمة «${q}»` });
          }
          break;
        }
        case "add_points": {
          const u = findUserByQuery(db, String(args.user ?? ""));
          if (!u) {
            out.push({ name: a.name, ok: false, detail: "المستخدم غير موجود" });
            break;
          }
          addPoints(db, u.id, Number(args.amount ?? 0), "admin", "أمر من الذكاء الاصطناعي");
          await sendMessage(u.id, `💎 تم تعديل رصيدك من الإدارة: <b>${Number(args.amount ?? 0) > 0 ? "+" : ""}${Number(args.amount ?? 0)}</b> نقطة`);
          out.push({ name: a.name, ok: true, detail: `${displayName(u)} → ${u.points}` });
          break;
        }
        case "set_points_for": {
          const u = findUserByQuery(db, String(args.query ?? ""));
          if (!u) {
            out.push({ name: a.name, ok: false, detail: "المستخدم غير موجود" });
            break;
          }
          const target = Math.max(0, Number(args.amount ?? 0));
          addPoints(db, u.id, target - u.points, "admin", "تعيين الرصيد (AI)");
          out.push({ name: a.name, ok: true, detail: `${displayName(u)} → ${u.points}` });
          break;
        }
        case "ban_user": {
          const u = findUserByQuery(db, String(args.query ?? ""));
          if (!u) {
            out.push({ name: a.name, ok: false, detail: "المستخدم غير موجود" });
            break;
          }
          u.banned = true;
          u.banReason = "قرار إداري (AI)";
          out.push({ name: a.name, ok: true, detail: displayName(u) });
          break;
        }
        case "vip_user": {
          const u = findUserByQuery(db, String(args.query ?? ""));
          if (!u) {
            out.push({ name: a.name, ok: false, detail: "المستخدم غير موجود" });
            break;
          }
          u.vip = !u.vip;
          out.push({ name: a.name, ok: true, detail: `${displayName(u)} vip=${u.vip}` });
          break;
        }
        case "broadcast": {
          const targets = Object.values(db.users).filter((u) => !u.banned);
          const text = String(args.text ?? "").trim();
          if (!text) {
            out.push({ name: a.name, ok: false, detail: "نص الرسالة فارغ" });
            break;
          }
          let sent = 0;
          let failed = 0;
          for (let i = 0; i < targets.length; i += 20) {
            const slice = targets.slice(i, i + 20);
            await Promise.all(
              slice.map(async (u) => {
                const markup =
                  args.buttonLabel && args.buttonUrl
                    ? { inline_keyboard: [[{ text: String(args.buttonLabel), url: String(args.buttonUrl) }]] }
                    : undefined;
                const res = await sendMessage(u.id, text, markup);
                if (res) sent += 1;
                else failed += 1;
              })
            );
            if (i + 20 < targets.length) await new Promise((r) => setTimeout(r, 800));
          }
          // الصدق: ok=true فقط إن وصلت رسالة واحدة على الأقل، والتفصيل يبيّن الفشل
          out.push({
            name: a.name,
            ok: sent > 0,
            detail:
              failed > 0
                ? `أُرسلت إلى ${sent} من ${targets.length} (فشل ${failed})`
                : `${sent} من ${targets.length}`,
          });
          break;
        }
        case "add_contest": {
          db.contests.push({
            id: `ct_${Math.random().toString(36).slice(2, 9)}`,
            title: String(args.title ?? "مسابقة"),
            desc: String(args.desc ?? ""),
            prize: String(args.prize ?? "جائزة"),
            winnersCount: Math.max(1, Number(args.winnersCount ?? 3)),
            endsAt: new Date(Date.now() + Math.max(1, Number(args.days ?? 7)) * 86400_000).toISOString(),
            status: "active",
            ...(args.image ? { image: String(args.image) } : {}),
            ...(args.buttonLabel ? { buttonLabel: String(args.buttonLabel) } : {}),
            ...(args.buttonUrl ? { buttonUrl: String(args.buttonUrl) } : {}),
          });
          out.push({ name: a.name, ok: true, detail: String(args.title ?? "") });
          break;
        }
        case "unban_user": {
          const u = findUserByQuery(db, String(args.query ?? ""));
          if (!u) {
            out.push({ name: a.name, ok: false, detail: "المستخدم غير موجود" });
            break;
          }
          u.banned = false;
          u.banReason = "";
          out.push({ name: a.name, ok: true, detail: displayName(u) });
          break;
        }
        case "edit_task": {
          const q = String(args.title ?? "").trim();
          const t = matchByTitle(db.tasks, q);
          if (!t) {
            out.push({ name: a.name, ok: false, detail: `لم أجد مهمة «${q}»` });
            break;
          }
          if (args.points !== undefined) t.points = Math.max(1, Number(args.points));
          if (args.active !== undefined) t.active = Boolean(args.active);
          if (args.newTitle !== undefined) t.title = String(args.newTitle);
          if (args.target !== undefined) t.target = String(args.target).replace(/^@/, "");
          out.push({ name: a.name, ok: true, detail: t.title });
          break;
        }
        case "edit_contest": {
          const q = String(args.title ?? "").trim();
          const c = matchByTitle(db.contests, q);
          if (!c) {
            out.push({ name: a.name, ok: false, detail: `لم أجد مسابقة «${q}»` });
            break;
          }
          if (args.newTitle !== undefined) c.title = String(args.newTitle);
          if (args.prize !== undefined) c.prize = String(args.prize);
          if (args.desc !== undefined) c.desc = String(args.desc);
          if (args.winnersCount !== undefined) c.winnersCount = Math.max(1, Number(args.winnersCount));
          if (args.days !== undefined) c.endsAt = new Date(Date.now() + Math.max(1, Number(args.days)) * 86400_000).toISOString();
          if (args.image !== undefined) c.image = String(args.image || "");
          if (args.buttonLabel !== undefined) c.buttonLabel = String(args.buttonLabel);
          if (args.buttonUrl !== undefined) c.buttonUrl = String(args.buttonUrl);
          out.push({ name: a.name, ok: true, detail: c.title });
          break;
        }
        case "delete_contest": {
          const q = String(args.title ?? "").trim();
          if (!q) {
            out.push({ name: a.name, ok: false, detail: "حدّد اسم المسابقة" });
            break;
          }
          const hit = matchByTitle(db.contests, q);
          if (hit) {
            db.contests = db.contests.filter((c) => c.id !== hit.id);
            out.push({ name: a.name, ok: true, detail: hit.title });
          } else {
            out.push({ name: a.name, ok: false, detail: `لم أجد مسابقة «${q}»` });
          }
          break;
        }
        case "set_extra_join": {
          const uname = String(args.username ?? "").replace(/^@/, "");
          if (!uname) {
            out.push({ name: a.name, ok: false, detail: "اسم القناة مطلوب" });
            break;
          }
          const list = db.settings.extraJoins ?? (db.settings.extraJoins = []);
          const ex = list.find((j) => j.username === uname);
          if (ex) {
            ex.enabled = args.enabled === undefined ? true : Boolean(args.enabled);
            if (args.title) ex.title = String(args.title);
          } else {
            list.push({
              enabled: args.enabled === undefined ? true : Boolean(args.enabled),
              username: uname,
              title: String(args.title ?? `@${uname}`),
              url: `https://t.me/${uname}`,
              verify: true,
            });
          }
          out.push({ name: a.name, ok: true, detail: `@${uname}` });
          break;
        }
        case "add_wheel_slice": {
          const pts = Math.max(0, Number(args.points ?? 1));
          db.wheel.push({
            label: String(args.label ?? `${pts} نقطة`),
            points: pts,
            weight: Math.max(1, Number(args.weight ?? 1)),
          });
          out.push({ name: a.name, ok: true, detail: `${args.label} (${pts})` });
          break;
        }
        /* ─── العمليات المرنة: تمنع الرفض تمامًا ───
           أي طلب لا يطابق عملية معروفة يُنفَّذ عبر هذه الحالات
           بدل الرد بـ «غير متوفر». */
        case "custom_setting": {
          const path = String(args.path ?? "").trim();
          if (!path) {
            out.push({ name: a.name, ok: false, detail: "المسار (path) مطلوب" });
            break;
          }
          const ok = setByPath(db as unknown as Record<string, unknown>, path, coerceValue(args.value));
          out.push({ name: ok ? a.name : a.name, ok, detail: ok ? path : `مسار غير صالح: ${path}` });
          break;
        }
        case "custom_text": {
          const key = String(args.key ?? "").trim();
          const texts = db.settings.texts as unknown as Record<string, unknown>;
          if (!(key in texts)) {
            out.push({ name: a.name, ok: false, detail: `مفتاح نصي غير معروف: ${key}` });
            break;
          }
          texts[key] = String(args.value ?? "");
          out.push({ name: a.name, ok: true, detail: `${key} محدَّث` });
          break;
        }
        case "custom_feature": {
          const f = String(args.feature ?? "").trim();
          const feats = db.settings.features as unknown as Record<string, unknown>;
          if (!(f in feats)) {
            out.push({ name: a.name, ok: false, detail: `ميزة غير معروفة: ${f}` });
            break;
          }
          feats[f] = Boolean(args.enabled);
          out.push({ name: a.name, ok: true, detail: `${f} = ${feats[f]}` });
          break;
        }
        case "custom_number": {
          const key = String(args.key ?? "").trim();
          const points = db.settings.points as unknown as Record<string, unknown>;
          if (!(key in points)) {
            // قد يكون في جذر الإعدادات
            const root = db.settings as unknown as Record<string, unknown>;
            if (typeof root[key] === "number") {
              root[key] = Number(args.value);
              out.push({ name: a.name, ok: true, detail: `${key} = ${root[key]}` });
              break;
            }
            out.push({ name: a.name, ok: false, detail: `حقل رقمي غير معروف: ${key}` });
            break;
          }
          points[key] = Number(args.value);
          out.push({ name: a.name, ok: true, detail: `${key} = ${points[key]}` });
          break;
        }
        case "custom_reward_field":
        case "custom_contest_field":
        case "custom_task_field": {
          const field = String(args.field ?? "").trim();
          const title = String(args.title ?? "").trim();
          const val = coerceValue(args.value);
          const isReward = a.name === "custom_reward_field";
          const isContest = a.name === "custom_contest_field";
          const coll = isReward ? db.rewards : isContest ? db.contests : db.tasks;
          const item = (coll as unknown as Record<string, unknown>[]).find(
            (x) => String(x.title ?? "").includes(title)
          );
          if (!item) {
            out.push({ name: a.name, ok: false, detail: `لم أجد «${title}»` });
            break;
          }
          item[field] = val;
          out.push({ name: a.name, ok: true, detail: `${title}.${field} = ${String(val)}` });
          break;
        }
        default: {
          /**
           * لا رفض. نجرّب تطبيق الطلب كإعداد مرن باستخدام args نفسها:
           * إن احتوت {path,value} أو {key,value} نُطبّقها، وإلا نفشل بصدق
           * مع توضيح ما ينقص — لا نقول «غير متوفر».
           */
          if (typeof args.path === "string") {
            const ok = setByPath(db as unknown as Record<string, unknown>, args.path, coerceValue(args.value));
            out.push({ name: a.name, ok, detail: ok ? String(args.path) : "مسار غير صالح" });
          } else {
            out.push({
              name: a.name,
              ok: false,
              detail: `لم أستطع تحويل «${a.name}» إلى تعديل — أعد صياغة الطلب بتفصيل أكثر (ماذا أعدّل بالضبط؟)`,
            });
          }
        }
      }
    } catch (e) {
      out.push({ name: a.name, ok: false, detail: safeDetail(e) });
    }
  }
  return out;
}



/** تعيين قيمة في مسار منقّط داخل الوثيقة — تُستخدم للعمليات المرنة. */
function setByPath(root: Record<string, unknown>, path: string, value: unknown): boolean {
  const parts = path.split(".").map((x) => x.trim()).filter(Boolean);
  if (!parts.length) return false;
  let cur: Record<string, unknown> = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const next = cur[parts[i]];
    if (!next || typeof next !== "object" || Array.isArray(next)) return false;
    cur = next as Record<string, unknown>;
  }
  const last = parts[parts.length - 1];
  if (!(last in cur)) return false;
  cur[last] = value;
  return true;
}

/** تحويل القيمة من نص النموذج إلى النوع المناسب. */
function coerceValue(v: unknown): unknown {
  if (typeof v !== "string") return v;
  const t = v.trim();
  if (/^(true|نعم|فعل|شغل|on)$/i.test(t)) return true;
  if (/^(false|لا|اطفي|أطفئ|off)$/i.test(t)) return false;
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  return v;
}

/**
 * إسناد صورة مرفقة إلى العنصر المذكور في الطلب — محليًا وفورًا.
 * يطابق: جائزة (rewards) · مسابقة (contests) · جائزة/عنصر المتجر.
 * إن لم يُذكر عنوان صريح، يُسند إلى الجائزة الأقرب اسمًا أو يطلب التحديد.
 */
function imageAttachPlan(db: DB, raw: string, image: string): Plan | null {
  const p = norm(raw);

  // مسابقة
  if (/(مسابق|contest)/.test(p)) {
    const c =
      db.contests.find((x) => p.includes(norm(x.title))) ??
      db.contests.find((x) => x.status === "active") ??
      db.contests[0];
    if (c) {
      return {
        reply: `سأضع الصورة في مسابقة «${c.title}».`,
        actions: [{ name: "edit_contest", args: { title: c.title, image } }],
        provider: "builtin-ar",
      };
    }
  }

  // جائزة / عنصر متجر
  if (/(جائز|جايز|متجر|reward|prize|shop|store)/.test(p)) {
    const r =
      db.rewards.find((x) => p.includes(norm(x.title))) ??
      db.rewards.find((x) => x.active) ??
      db.rewards[0];
    if (r) {
      return {
        reply: `سأضع الصورة في جائزة «${r.title}».`,
        actions: [{ name: "edit_reward", args: { title: r.title, image } }],
        provider: "builtin-ar",
      };
    }
  }

  // ذُكر عنوان عنصر صريح دون كلمة «جائزة»
  const hit =
    db.rewards.find((x) => x.title && p.includes(norm(x.title))) ??
    db.contests.find((x) => x.title && p.includes(norm(x.title)));
  if (hit) {
    const isContest = db.contests.includes(hit as never);
    return {
      reply: isContest ? `سأضع الصورة في مسابقة «${hit.title}».` : `سأضع الصورة في جائزة «${hit.title}».`,
      actions: [
        isContest
          ? { name: "edit_contest", args: { title: hit.title, image } }
          : { name: "edit_reward", args: { title: hit.title, image } },
      ],
      provider: "builtin-ar",
    };
  }

  // صورة بلا هدف: أضفها كجائزة جديدة؟ — نطلب التحديد بدقة بدل التخمين
  return {
    reply:
      "وصلت الصورة ✅ — أي عنصر تريد أن أضعها فيه؟ اذكر اسم الجائزة أو المسابقة (مثال: «خلي هذي الصورة في جائزة Netflix»).",
    actions: [],
    provider: "builtin-ar",
  };
}

export async function planPrompt(
  db: DB,
  prompt: string,
  image?: string
): Promise<Plan & { builtin: boolean }> {
  /**
   * صورة مرفقة: «خلي هذي الصورة في جائزة Netflix» / «حط الصورة في المسابقة».
   * تُطبَّق فورًا محليًا (سرعة البرق) لأنها عملية محدّدة لا تحتاج تفسيرًا.
   */
  if (image) {
    const imgPlan = imageAttachPlan(db, prompt, image);
    if (imgPlan) return { ...imgPlan, builtin: true };
  }

  /**
   * السرعة أولًا: الخطة المحلية تُحسب فورًا (بلا شبكة).
   * إن كانت واثقة بما يكفي نُعيدها مباشرة ولا ننتظر النموذج إطلاقًا.
   * هذا يجعل «أضف جائزة …» و«ارفع مكافأة الإحالة» تُنفَّذ في مللي ثانية
   * بدل انتظار 9 ثوانٍ (مهلة المزوّد) ثم الفشل.
   */
  const local = localPlan(prompt, db);

  const aiOn = db.settings.ai.enabled;
  if (!aiOn) return { ...local, builtin: true };
  if (local.actions.length > 0) return { ...local, builtin: true };

  const plan = await askLLM(db, prompt);
  if (plan) {
    if (plan.actions.length === 0 && local.actions.length > 0) {
      return { ...local, reply: `${plan.reply}\n${local.reply}`, provider: `${plan.provider}+builtin`, builtin: true };
    }
    return { ...plan, builtin: false };
  }
  return { ...local, builtin: true };
}

/* ترجمة أسماء العمليات المرادفة التي قد يولّدها الموديل */
const OP_ALIASES: Record<string, string> = {
  set_price: "edit_reward",
  setrewardprice: "edit_reward",
  change_price: "edit_reward",
  update_price: "edit_reward",
  set_reward_price: "edit_reward",
  change_reward_price: "edit_reward",
  update_reward: "edit_reward",
  remove_reward: "delete_reward",
  delete_prize: "delete_reward",
  add_prize: "add_reward",
  create_reward: "add_reward",
  create_task: "add_task",
  remove_task: "delete_task",
  update_task: "edit_task",
  create_contest: "add_contest",
  update_contest: "edit_contest",
  remove_contest: "delete_contest",
  delete_broadcast: "broadcast",
  send_broadcast: "broadcast",
  set_settings: "set_points",
  toggle_feature: "set_feature",
  set_maintenance: "set_bot",
  set_username: "set_bot",
  add_channel: "set_extra_join",
  add_wheel_slice_: "add_wheel_slice",
};

function coerceNumber(args: Record<string, unknown>, k: string) {
  const v = args[k];
  if (v === undefined || v === null || v === "") return;
  if (typeof v !== "string" && typeof v !== "number") return;
  const n = Number(String(v).replace(/[^\d.\-]/g, ""));
  if (Number.isFinite(n)) args[k] = n;
}

function normalizeAction(a: Action): Action {
  const raw = String(a.name ?? "").trim();
  const key = raw.toLowerCase().replace(/[\s\-]+/g, "_");
  const name = OP_ALIASES[key] ?? (OP_ALIASES[raw] ? OP_ALIASES[raw] : raw);
  const args: Record<string, unknown> = { ...(a.args ?? {}) };
  const fixed = OP_ALIASES[key] ?? name;

  // توحيد الحقول المرادفة
  if (fixed === "edit_reward" || fixed === "delete_reward" || fixed === "add_reward") {
    if (args.title === undefined) args.title = args.name ?? args.query ?? args.reward;
    if (args.cost === undefined) args.cost = args.price ?? args.points ?? args.value;
  }
  if (fixed === "add_task" || fixed === "edit_task" || fixed === "delete_task") {
    if (args.title === undefined) args.title = args.name ?? args.query ?? args.task;
    if (args.points === undefined) args.points = args.reward ?? args.value;
  }
  if (fixed === "add_contest" || fixed === "edit_contest" || fixed === "delete_contest") {
    if (args.title === undefined) args.title = args.name ?? args.query ?? args.contest;
    if (args.prize === undefined) args.prize = args.reward ?? args.value;
  }
  for (const k of ["cost", "days", "winnersCount", "amount"] as const) coerceNumber(args, k);
  // points قد تكون كائنًا (set_points) فلا نلمسها إلا إذا كانت رقمًا/نصًا
  if (typeof args.points === "string" || typeof args.points === "number") coerceNumber(args, "points");
  return { name: fixed, args };
}

export async function runActions(db: DB, actions: Action[]): Promise<ActionResult[]> {
  return runActionsImpl(db, actions.map(normalizeAction));
}

