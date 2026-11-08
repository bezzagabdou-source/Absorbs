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
- إذا طلب المستخدم شيئًا غير موجود في القائمة، لا تخترع عملية — قل في reply ما هو غير مدعوم.`;

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

export function localPlan(prompt: string): Plan {
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
  if (/(بث|اذاعه|إذاعة|broadcast|ارسل للجميع|أرسل للجميع)/.test(p)) {
    const m = prompt.match(/(?:بث|اذاعه|إذاعة|broadcast|ارسل للجميع|أرسل للجميع)\s*:?\s*(.+)/i);
    if (m) {
      actions.push({ name: "broadcast", args: { text: m[1].trim() } });
      reply.push("أرسلت البث لكل الأعضاء.");
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
        reply.push(`حذفت الجائزة «${name}».`);
      }
    }
    if (/(احذف|امسح|الغي|شيل|delete|remove)/.test(p) && /(مهمه|مهمة|task)/.test(p)) {
      const name = prompt.split(/(?:مهمه|مهمة|task)/i).pop()?.replace(/^[:\s]+/, "").trim() ?? "";
      if (name.length > 1) {
        actions.push({ name: "delete_task", args: { title: name } });
        reply.push(`حذفت المهمة «${name}».`);
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
      reply.push(`حذف المسابقة «${name}».`);
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

  // شريحة عجلة
  if (/(عجله|عجلة|wheel)/.test(p) && /(اضف|أضف|add|شريحه|شريحة)/.test(p) && nums.length) {
    if (!actions.some((a) => a.name === "add_wheel_slice")) {
      actions.push({ name: "add_wheel_slice", args: { label: `${nums[0]} نقطة`, points: nums[0] } });
      reply.push(`أضفت شريحة ${nums[0]} نقطة إلى العجلة.`);
    }
  }

  const text =
    reply.length > 0
      ? reply.join("\n")
      : "فهمت طلبك لكن لم أجد عملية مطابقة. جرّب مثلًا: «الهدية اليومية من 2 إلى 4 نقاط» أو «أضف جائزة PlayStation بسعر 40» أو «بث: مسابقة جديدة غدًا».";
  return { reply: text, actions, provider: "builtin-ar" };
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
          const before = db.tasks.length;
          const score = (t: string) => {
            const T = t.toLowerCase();
            const K = q.toLowerCase();
            if (!K) return 0;
            if (T === K) return 4;
            if (T.includes(K) || K.includes(T)) return 3;
            const words = K.split(/\s+/).filter((w) => w.length > 2);
            const hits = words.filter((w) => T.includes(w)).length;
            return hits ? (hits / Math.max(1, words.length)) * 2 : 0;
          };
          const best = db.tasks.map((t) => ({ t, s: score(t.title) })).sort((a, b) => b.s - a.s)[0];
          if (best && best.s >= 1.2) {
            db.tasks = db.tasks.filter((x) => x.id !== best.t.id);
            out.push({ name: a.name, ok: true, detail: best.t.title });
          } else {
            out.push({
              name: a.name,
              ok: false,
              detail: `لم أجد مهمة مطابقة${q ? ` لـ «${q}»` : ""}`,
            });
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
          let sent = 0;
          for (let i = 0; i < targets.length; i += 20) {
            const slice = targets.slice(i, i + 20);
            await Promise.all(
              slice.map(async (u) => {
                const markup =
                  args.buttonLabel && args.buttonUrl
                    ? { inline_keyboard: [[{ text: String(args.buttonLabel), url: String(args.buttonUrl) }]] }
                    : undefined;
                const res = await sendMessage(u.id, String(args.text ?? ""), markup);
                if (res) sent += 1;
              })
            );
            if (i + 20 < targets.length) await new Promise((r) => setTimeout(r, 800));
          }
          out.push({ name: a.name, ok: true, detail: `${sent}/${targets.length}` });
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
          const t =
            db.tasks.find((x) => x.title.includes(String(args.title ?? ""))) ??
            db.tasks.find((x) => x.id === args.title);
          if (!t) {
            out.push({ name: a.name, ok: false, detail: "المهمة غير موجودة" });
            break;
          }
          if (args.points !== undefined) t.points = Math.max(1, Number(args.points));
          if (args.active !== undefined) t.active = Boolean(args.active);
          out.push({ name: a.name, ok: true, detail: t.title });
          break;
        }
        case "set_price": {
          const r = matchReward(db.rewards, String(args.title ?? ""));
          if (!r) {
            out.push({ name: a.name, ok: false, detail: "الجائزة غير موجودة" });
            break;
          }
          r.cost = Math.max(1, Number(args.cost ?? r.cost));
          out.push({ name: a.name, ok: true, detail: `${r.title} → ${r.cost}` });
          break;
        }
        case "edit_contest": {
          const c =
            db.contests.find((x) => x.title.includes(String(args.title ?? ""))) ??
            db.contests.find((x) => x.id === args.title);
          if (!c) {
            out.push({ name: a.name, ok: false, detail: "المسابقة غير موجودة" });
            break;
          }
          if (args.prize !== undefined) c.prize = String(args.prize);
          if (args.desc !== undefined) c.desc = String(args.desc);
          if (args.winnersCount !== undefined) c.winnersCount = Math.max(1, Number(args.winnersCount));
          if (args.days !== undefined) c.endsAt = new Date(Date.now() + Math.max(1, Number(args.days)) * 86400_000).toISOString();
          if (args.image !== undefined) c.image = String(args.image || "");
          out.push({ name: a.name, ok: true, detail: c.title });
          break;
        }
        case "delete_contest": {
          const q = String(args.title ?? "").trim();
          const before = db.contests.length;
          const norm2 = (v: string) => v.toLowerCase().replace(/[\s_\-]+/g, "");
          const K = norm2(q);
          let hit = db.contests.filter((c) => K && (norm2(c.title).includes(K) || K.includes(norm2(c.title))));
          if (!hit.length && K) {
            const w = q.split(/\s+/).filter((x) => x.length > 2);
            hit = db.contests.filter((c) => w.some((x) => norm2(c.title).includes(norm2(x))));
          }
          if (hit.length) db.contests = db.contests.filter((c) => !hit.some((h) => h.id === c.id));
          out.push({
            name: a.name,
            ok: db.contests.length < before,
            detail: hit.length ? hit.map((c) => c.title).join(", ") : `لم أجد مسابقة «${q}»`,
          });
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
        default:
          out.push({ name: a.name, ok: false, detail: "عملية غير معروفة" });
      }
    } catch (e) {
      out.push({ name: a.name, ok: false, detail: safeDetail(e) });
    }
  }
  return out;
}


export async function planPrompt(db: DB, prompt: string): Promise<Plan & { builtin: boolean }> {
  let plan: Plan | null = null;
  if (db.settings.ai.enabled) plan = await askLLM(db, prompt);
  if (plan) {
    if (plan.actions.length === 0) {
      const local = localPlan(prompt);
      if (local.actions.length > 0) {
        return { ...local, reply: `${plan.reply}\n${local.reply}`, provider: `${plan.provider}+builtin`, builtin: true };
      }
    }
    return { ...plan, builtin: false };
  }
  return { ...localPlan(prompt), builtin: true };
}

export async function runActions(db: DB, actions: Action[]): Promise<ActionResult[]> {
  return runActionsImpl(db, actions);
}

