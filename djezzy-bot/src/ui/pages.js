/**
 * صفحات HTML الخاصة بالبوت — مبنية بـ CSS/SVG خالص (بدون أي معرّفات إيموجي
 * خارجية وبدون ملفات ثابتة):
 *
 *   /app     — لوحة أزرار ملوّنة (أزرق/أخضر/أحمر) تتصل بالمحرّك مباشرة
 *   /emojis  — معرض إيموجيات متحركة مصنوعة يدوياً بـ HTML/CSS
 */

const SHELL = ({ title, body, extraStyle = '' }) => `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
 :root{--bg:#0b1020;--card:#141b33;--line:#24304f;--text:#e8ecf5;--muted:#93a0bd;
  --blue:#2563eb;--blue-2:#1d4ed8;--green:#16a34a;--green-2:#15803d;--red:#dc2626;--red-2:#b91c1c}
 *{box-sizing:border-box}
 body{font-family:system-ui,"Segoe UI",Tahoma,sans-serif;background:
  radial-gradient(1200px 600px at 80% -10%,#1b2a5e 0%,transparent 60%),
  radial-gradient(900px 500px at -10% 110%,#123524 0%,transparent 55%),var(--bg);
  color:var(--text);margin:0;padding:28px 16px 60px;line-height:1.7;min-height:100vh}
 .wrap{max-width:680px;margin:0 auto}
 h1{font-size:24px;margin:0 0 4px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
 .sub{color:var(--muted);font-size:14px;margin-bottom:20px}
 .chips{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0 22px}
 .chip{background:var(--card);border:1px solid var(--line);border-radius:999px;
  padding:5px 12px;font-size:13px;color:var(--muted)}
 .chip b{color:var(--text)}
 .grid{display:grid;gap:12px}
 .btn{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;
  border:0;border-radius:14px;padding:15px 18px;font-size:16px;font-weight:700;cursor:pointer;
  color:#fff;transition:transform .12s ease,filter .12s ease,box-shadow .12s ease;
  box-shadow:0 6px 18px rgba(0,0,0,.28);text-decoration:none;text-align:center}
 .btn:hover{filter:brightness(1.08);transform:translateY(-2px)}
 .btn:active{transform:translateY(0) scale(.99)}
 .btn.blue{background:linear-gradient(180deg,var(--blue),var(--blue-2))}
 .btn.green{background:linear-gradient(180deg,var(--green),var(--green-2))}
 .btn.red{background:linear-gradient(180deg,var(--red),var(--red-2))}
 .btn.ghost{background:#1b2444;border:1px solid var(--line);color:var(--text);box-shadow:none}
 .btn[disabled]{opacity:.55;cursor:not-allowed;transform:none!important}
 .section{background:var(--card);border:1px solid var(--line);border-radius:18px;
  padding:18px;margin-top:18px}
 .section h2{font-size:17px;margin:0 0 12px;display:flex;align-items:center;gap:8px}
 .offer{display:flex;justify-content:space-between;align-items:center;gap:10px;
  background:#101731;border:1px solid var(--line);border-radius:12px;padding:11px 13px;margin:8px 0}
 .offer .info{font-size:14px}
 .offer .price{color:#93c5fd;font-weight:800;white-space:nowrap;font-size:13px}
 .offer button{border:0;border-radius:10px;padding:9px 14px;font-weight:700;cursor:pointer;
  background:linear-gradient(180deg,var(--blue),var(--blue-2));color:#fff;font-size:13px}
 .toast{position:fixed;bottom:18px;left:50%;transform:translateX(-50%) translateY(120px);
  background:#0f172a;border:1px solid var(--line);color:var(--text);border-radius:12px;
  padding:12px 18px;font-size:14px;opacity:0;transition:.25s;max-width:92vw;z-index:50}
 .toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
 .toast.ok{border-color:#16a34a}.toast.err{border-color:#dc2626}
 footer{color:var(--muted);font-size:12.5px;text-align:center;margin-top:26px}
 ${extraStyle}
</style></head><body><div class="wrap">${body}</div>
<div class="toast" id="toast"></div>
</body></html>`;

/* ============================ إيموجيات متحركة (HTML/CSS) ============================ */
const EMOJI_STYLE = `
.eg{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:14px}
.em{background:#101731;border:1px solid var(--line);border-radius:16px;padding:18px 10px 12px;
 text-align:center;position:relative;overflow:hidden}
.em .art{width:74px;height:74px;margin:0 auto 8px;position:relative}
.em .lbl{font-size:13px;color:var(--muted)}
 /* 🎁 صندوق الهدية */
 .gift .box{position:absolute;bottom:6px;left:12px;width:50px;height:38px;border-radius:6px;
  background:linear-gradient(180deg,#f87171,#dc2626);box-shadow:inset 0 -6px 0 rgba(0,0,0,.15)}
 .gift .box::after{content:"";position:absolute;top:0;bottom:0;left:21px;width:8px;background:#fde68a}
 .gift .lid{position:absolute;bottom:44px;left:8px;width:58px;height:14px;border-radius:5px;
  background:linear-gradient(180deg,#fca5a5,#ef4444);transform-origin:center bottom;
  animation:lid 2.4s ease-in-out infinite}
 .gift .bow{position:absolute;bottom:54px;left:28px;width:18px;height:14px;border-radius:50% 50% 40% 40%;
  background:#fde68a;animation:lid 2.4s ease-in-out infinite}
 @keyframes lid{0%,60%,100%{transform:translateY(0) rotate(0)}70%{transform:translateY(-14px) rotate(-7deg)}
  80%{transform:translateY(-4px) rotate(5deg)}}
 /* 🔥 اللهب */
 .fire .flame{position:absolute;bottom:8px;left:20px;width:34px;height:46px;border-radius:50% 50% 45% 45%;
  background:radial-gradient(circle at 50% 78%,#fde047 0%,#f97316 45%,#ef4444 80%);
  clip-path:polygon(50% 0,72% 28%,86% 58%,74% 92%,50% 100%,26% 92%,14% 58%,28% 28%);
  transform-origin:50% 100%;animation:flick .55s ease-in-out infinite alternate}
 .fire .flame.b{width:22px;height:30px;left:26px;bottom:8px;background:radial-gradient(circle at 50% 80%,#fff7ae,#fde047 60%,#f97316);
  animation-duration:.4s;opacity:.9}
 @keyframes flick{from{transform:scale(1) rotate(-3deg)}to{transform:scale(1.08,1.14) rotate(3deg)}}
 /* 🚀 الصاروخ */
 .rocket .body{position:absolute;left:26px;top:6px;width:24px;height:44px;border-radius:50% 50% 35% 35%;
  background:linear-gradient(180deg,#e2e8f0,#94a3b8);animation:hover 1.6s ease-in-out infinite}
 .rocket .body::after{content:"";position:absolute;top:10px;left:7px;width:10px;height:10px;border-radius:50%;background:#38bdf8;
  box-shadow:inset 0 0 0 2px #0b1020}
 .rocket .fin{position:absolute;bottom:16px;left:16px;width:12px;height:16px;background:#ef4444;
  clip-path:polygon(0 100%,100% 0,100% 100%);animation:hover 1.6s ease-in-out infinite}
 .rocket .fin.r{left:46px;transform:scaleX(-1)}
 .rocket .flame{position:absolute;bottom:0;left:29px;width:16px;height:20px;border-radius:0 0 50% 50%;
  background:linear-gradient(180deg,#fbbf24,#f97316 60%,transparent);animation:burn .3s linear infinite}
 @keyframes hover{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
 @keyframes burn{from{transform:scaleY(1);opacity:1}to{transform:scaleY(.7);opacity:.6}}
 /* 📶 إشارات */
 .sig{display:flex;align-items:flex-end;gap:5px;justify-content:center;height:56px;padding-top:8px}
 .sig i{width:10px;border-radius:3px;background:linear-gradient(180deg,#4ade80,#16a34a);
  animation:bars 1.2s ease-in-out infinite}
 .sig i:nth-child(1){height:14px;animation-delay:0s}
 .sig i:nth-child(2){height:24px;animation-delay:.15s}
 .sig i:nth-child(3){height:36px;animation-delay:.3s}
 .sig i:nth-child(4){height:48px;animation-delay:.45s}
 @keyframes bars{0%,100%{filter:brightness(1);transform:scaleY(1)}50%{filter:brightness(1.5);transform:scaleY(.86)}}
 /* 💰 العملة */
 .coin{position:absolute;left:24px;top:10px;width:28px;height:28px;border-radius:50%;
  background:radial-gradient(circle at 35% 30%,#fde68a,#f59e0b 70%,#b45309);
  display:flex;align-items:center;justify-content:center;font-weight:900;color:#78350f;font-size:15px;
  box-shadow:0 0 0 3px #f59e0b55;animation:spin 2.2s linear infinite}
 @keyframes spin{0%{transform:rotateY(0) translateY(0)}50%{transform:rotateY(180deg) translateY(-6px)}
  100%{transform:rotateY(360deg) translateY(0)}}
 /* ✅ علامة الصح */
 .ok{position:absolute;inset:8px;border-radius:50%;background:linear-gradient(180deg,#22c55e,#16a34a);
  display:flex;align-items:center;justify-content:center;animation:pop 2s ease-in-out infinite}
 .ok svg{width:34px;height:34px}
 .ok path{stroke:#fff;stroke-width:5;fill:none;stroke-linecap:round;stroke-linejoin:round;
  stroke-dasharray:40;stroke-dashoffset:40;animation:draw 2s ease-in-out infinite}
 @keyframes pop{0%,100%{transform:scale(1)}50%{transform:scale(1.07)}}
 @keyframes draw{0%{stroke-dashoffset:40}45%,100%{stroke-dashoffset:0}}
 /* ⏳ الساعة */
 .hg{position:absolute;left:22px;top:8px;width:30px;height:44px;animation:turn 3s ease-in-out infinite;transform-origin:center}
 .hg .top,.hg .bot{position:absolute;left:0;width:30px;height:20px;
  background:linear-gradient(180deg,#93c5fd,#3b82f6);clip-path:polygon(0 0,100% 0,70% 100%,30% 100%)}
 .hg .bot{bottom:0;clip-path:polygon(30% 0,70% 0,100% 100%,0 100%);background:linear-gradient(180deg,#fbbf24,#d97706)}
 .hg .sand{position:absolute;left:9px;top:18px;width:12px;height:8px;background:#fde68a;
  clip-path:polygon(0 0,100% 0,50% 100%);animation:sand 3s linear infinite}
 @keyframes turn{0%,40%{transform:rotate(0)}60%,100%{transform:rotate(180deg)}}
 @keyframes sand{0%{transform:scaleY(1);opacity:1}90%{transform:scaleY(.2);opacity:.4}100%{opacity:0}}
 /* 🎉 الاحتفال */
 .party i{position:absolute;width:8px;height:8px;border-radius:2px;opacity:0;animation:conf 1.8s linear infinite}
 .party i:nth-child(1){left:14px;background:#f87171;animation-delay:0s}
 .party i:nth-child(2){left:30px;background:#60a5fa;animation-delay:.3s}
 .party i:nth-child(3){left:46px;background:#fde047;animation-delay:.6s}
 .party i:nth-child(4){left:22px;background:#4ade80;animation-delay:.9s}
 .party i:nth-child(5){left:40px;background:#c084fc;animation-delay:1.2s}
 .party .hat{position:absolute;bottom:10px;left:24px;width:26px;height:34px;
  background:conic-gradient(from 200deg,#f87171,#fde047,#60a5fa,#f87171);
  clip-path:polygon(50% 0,100% 100%,0 100%)}
 @keyframes conf{0%{top:6px;opacity:0;transform:rotate(0)}15%{opacity:1}
  100%{top:64px;opacity:0;transform:rotate(320deg)}}
 /* ⭐ النجمة */
 .star{position:absolute;inset:6px;background:#fbbf24;
  clip-path:polygon(50% 0,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%);
  animation:twinkle 1.8s ease-in-out infinite}
 @keyframes twinkle{0%,100%{transform:scale(1) rotate(0);filter:brightness(1)}
  50%{transform:scale(1.12) rotate(8deg);filter:brightness(1.35)}}
`;

export function emojisPage({ publicUrl = '' } = {}) {
  const items = [
    { cls: 'gift', art: '<div class="lid"></div><div class="bow"></div><div class="box"></div>', lbl: '🎁 هدية' },
    { cls: 'fire', art: '<div class="flame"></div><div class="flame b"></div>', lbl: '🔥 عرض ساخن' },
    { cls: 'rocket', art: '<div class="body"></div><div class="fin"></div><div class="fin r"></div><div class="flame"></div>', lbl: '🚀 تفعيل' },
    { cls: 'sig', art: '<div class="sig"><i></i><i></i><i></i><i></i></div>', lbl: '📶 إشارة' },
    { cls: 'coin', art: '<div class="coin">دج</div>', lbl: '💰 رصيد' },
    { cls: 'ok', art: '<div class="ok"><svg viewBox="0 0 40 40"><path d="M9 21l8 8 15-17"/></svg></div>', lbl: '✅ تم' },
    { cls: 'hg', art: '<div class="hg"><div class="top"></div><div class="sand"></div><div class="bot"></div></div>', lbl: '⏳ انتظار' },
    { cls: 'party', art: '<div class="party"><div class="hat"></div><i></i><i></i><i></i><i></i><i></i></div>', lbl: '🎉 نجاح' },
    { cls: 'star', art: '<div class="star"></div>', lbl: '⭐ مميز' },
  ];

  const body = `
 <h1>🖼️ إيموجيات متحركة <span style="font-size:14px;color:var(--muted)">— مصنوعة بـ HTML/CSS خالص</span></h1>
 <p class="sub">بدون أي معرّفات (IDs) خارجية — كل حركة CSS/SVG من داخل الصفحة. تُستخدم في لوحة الويب وصفحات البوت.</p>
 <div class="eg">
  ${items.map((item) => `<div class="em"><div class="art ${item.cls}">${item.art}</div><div class="lbl">${item.lbl}</div></div>`).join('\n  ')}
 </div>
 <div class="section" style="text-align:center">
  <a class="btn blue" href="${publicUrl}/app">⬅ العودة إلى لوحة الأزرار</a>
 </div>
 <footer>بوت جيزي — إيموجيات أصلية بدون custom_emoji_id</footer>`;

  return SHELL({ title: 'إيموجيات متحركة — بوت جيزي', body, extraStyle: EMOJI_STYLE });
}

/* ============================ لوحة الأزرار (/app) ============================ */
export function appPage({ publicUrl = '', botUsername = '', mode = 'live', storage = 'memory', offers = [] } = {}) {
  const botLink = botUsername ? `https://t.me/${botUsername}` : publicUrl;
  const offerRows = offers
    .map(
      (offer) => `
  <div class="offer">
    <div class="info"><b>${offer.name}</b><br><span style="color:var(--muted);font-size:12.5px">${offer.detail || ''}</span></div>
    <div style="display:flex;gap:8px;align-items:center">
      <span class="price">${offer.price != null ? `${offer.price} دج` : ''}</span>
      <button data-code="${offer.code}">تفعيل</button>
    </div>
  </div>`,
    )
    .join('');

  const body = `
 <h1>🎮 بوت جيزي <span style="font-size:14px;color:var(--muted)">— لوحة الأزرار</span></h1>
 <p class="sub">أزرار حقيقية بخلفيات ملوّنة: <b style="color:#4ade80">🟢 أخضر = مجاني</b> ·
  <b style="color:#60a5fa">🔵 أزرق = مدفوع</b> · <b style="color:#f87171">🔴 أحمر = حذف</b></p>

 <div class="chips">
  <span class="chip">المحرّك: <b>${mode === 'live' ? '🟢 مباشر' : '🧪 محاكاة'}</b></span>
  <span class="chip">التخزين: <b>${storage}</b></span>
  <span class="chip">الحالة: <b id="health">…</b></span>
 </div>

 <div class="grid">
  <button class="btn green" data-action="claim-weekly">🎁 استلام هدية 2 جيجا الأسبوعية</button>
  <button class="btn green" data-action="claim-promo">🎀 هدية الجمعة / المناسبة (QR)</button>
  <button class="btn green" data-action="overview">🔄 فحص الرصيد وسجل الهدايا</button>
  <button class="btn blue" data-scroll="offers">🔵 تصفّح العروض المدفوعة</button>
  <a class="btn ghost" href="${publicUrl}/emojis">🖼️ إيموجيات متحركة</a>
  <button class="btn red" data-action="remove-account">🗑 حذف الرقم المربوط من البوت</button>
  <a class="btn ghost" href="${botLink}" target="_blank" rel="noopener">💬 فتح البوت في تيليجرام</a>
 </div>

 <div class="section" id="offers">
  <h2>🔵 العروض المدفوعة <span style="font-size:12px;color:var(--muted)">(تُخصم من الرصيد — تأكيد مزدوج)</span></h2>
  ${offerRows || '<p class="sub">لا توجد عروض.</p>'}
 </div>

 <div class="section">
  <h2>🟢 الهدايا المجانية</h2>
  <p class="sub" style="margin:0">🎁 2 جيجا كل أسبوع · 🎀 هدايا الجمعة والمناسبات عبر QR · 👥 بونص دعوة صديق —
  كلها مجانية 100% ولا تُخصم من رصيدك.</p>
 </div>

 <footer>لعمل الأزرار من داخل تيليجرام: افتح البوت ← 🌐 لوحة أزرار ملوّنة</footer>`;

  const script = `
 const toast = (msg, ok = true) => {
  const el = document.getElementById('toast');
  el.textContent = msg; el.className = 'toast show ' + (ok ? 'ok' : 'err');
  setTimeout(() => el.className = 'toast', 3200);
 };
 fetch('/health').then(r => r.json()).then(h => {
  document.getElementById('health').textContent = h.ok ? '🟢 تعمل' : '⚠️ إعدادات ناقصة';
 }).catch(() => { document.getElementById('health').textContent = '❌'; });

 const inTelegram = Boolean(window.Telegram && Telegram.WebApp && Telegram.WebApp.initData);
 if (inTelegram) { try { Telegram.WebApp.ready(); Telegram.WebApp.expand(); } catch (e) {} }

 async function callAction(action, extra = {}) {
  if (!inTelegram) { toast('افتح اللوحة من داخل البوت لتفعيل الأزرار', false); return; }
  toast('جارٍ التنفيذ…', true);
  try {
   const res = await fetch('/api/app/action', {
    method: 'POST',
    headers: {
     'Content-Type': 'application/json',
     'x-telegram-init-data': Telegram.WebApp.initData,
    },
    body: JSON.stringify({ action, ...extra }),
   });
   const data = await res.json().catch(() => ({}));
   if (!res.ok || data.ok === false) throw new Error(data.error || 'فشل الطلب');
   toast(data.message || '✅ تم', true);
  } catch (error) { toast(error.message || 'حدث خطأ', false); }
 }

 document.querySelectorAll('[data-action]').forEach(btn => {
  btn.addEventListener('click', () => {
   const action = btn.dataset.action;
   if (action === 'remove-account' && !confirm('حذف الرقم المربوط من البوت؟')) return;
   if (action === 'claim-weekly' || action === 'claim-promo') {
    if (!confirm('إرسال طلب حقيقي إلى جيزي؟')) return;
   }
   callAction(action);
  });
 });
 document.querySelectorAll('[data-scroll]').forEach(btn => {
  btn.addEventListener('click', () => document.getElementById(btn.dataset.scroll)?.scrollIntoView({ behavior: 'smooth' }));
 });
 document.querySelectorAll('#offers button[data-code]').forEach(btn => {
  btn.addEventListener('click', () => {
   const code = btn.dataset.code;
   if (!confirm('تفعيل هذا العرض قد يُخصم قيمته من رصيدك. متابعة؟')) return;
   callAction('activate-offer', { code });
  });
 });`;

  return SHELL({
    title: 'لوحة أزرار — بوت جيزي',
    body,
    extraStyle: EMOJI_STYLE + '\n.em{max-width:none}',
  }).replace('</body>', `<script>${script}</script></body>`);
}

export default { appPage, emojisPage };
