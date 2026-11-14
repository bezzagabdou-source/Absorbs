/* ✨ صفحة «الإيموجي»: خريطة الإيموجي المتحرك، الباقات، الوضع، ومؤشر الحالة — كلشي عبر /api/admin. */
let EMOJI_STATE = null;
let EMOJI_QUERY = '';
const emojiView = (q, limit) => api('emoji_view', { q, limit });
const emojiOp = (op, input) => api('emoji_op', { op, input: input || {} });
const capMark = value => value === true ? '✅' : value === false ? '❌' : '⏳';
const capWord = value => value === true ? 'يعمل' : value === false ? 'لا يعمل' : 'لم يُختبر بعد';
const EMOJI_MODES = [['animated', 'إيموجي متحرك'], ['stickers', 'ملصقات + تنسيق غني'], ['plain', 'عادي']];
const when = at => at ? new Date(at).toLocaleString('ar') : 'أبداً';

function emojiResult(html, bad) {
  const box = document.querySelector('#emoji-result');
  if (!box) return;
  box.hidden = false;
  box.className = 'card' + (bad ? ' bad' : '');
  box.innerHTML = html;
}
function renderEmoji() {
  const el = document.querySelector('#t-emoji'), s = EMOJI_STATE;
  if (!el || !s) return;
  const d = s.discovery || {}, c = s.counts || {}, caps = s.caps || {};
  el.innerHTML = `
    <div class='card' id='emoji-status'>
      <h3>مؤشر الحالة</h3>
      <div class='item'><div><b>${capMark(caps.text)} النص المتحرك</b><small>${esc(capWord(caps.text))}${caps.textNote ? ' — ' + esc(caps.textNote) : ''}</small></div></div>
      <div class='item'><div><b>${capMark(caps.button)} أيقونة الزر</b><small>${esc(capWord(caps.button))}${caps.buttonNote ? ' — ' + esc(caps.buttonNote) : ''}</small></div></div>
      <small>آخر فحص: ${esc(when(caps.checkedAt))}. الفحص يرسل رسالتين حقيقيتين إلى حساب الأدمين ويقرأ ردّ تيليجرام.</small>
      <div class='acts wrap'>
        <button class='sm ok' data-act='emoji-run' data-v='test_caps'>فحص الحالة الآن</button>
        <button class='sm' data-act='emoji-run' data-v='test_core'>اختبار الإيموجيات الأساسية</button>
        <button class='sm' data-act='emoji-run' data-v='test_fallback'>اختبار الاحتياط (ID خاطئ)</button>
        <button class='sm' data-act='emoji-run' data-v='snapshot'>إرسال الشاشات الرئيسية للأدمين</button>
        <button class='sm' data-act='emoji-run' data-v='samples'>عيّنة بث + رسالة فوز</button>
      </div>
    </div>
    <div id='emoji-result' class='card' hidden></div>
    <div class='card'>
      <h3>الوضع</h3>
      <small>«متحرك»: Custom Emoji في النص والأزرار مع رجوع تلقائي للعادي عند الرفض. «ملصقات»: ملصق متحرك قبل الرسائل المهمة + عناوين عريضة وأزرار ملوّنة. «عادي»: بلا أي إضافة.</small>
      <div class='acts wrap'>${EMOJI_MODES.map(([id, label]) => `<button class='sm ${s.mode === id ? 'ok' : ''}' data-act='emoji-mode' data-v='${id}'>${s.mode === id ? '● ' : ''}${esc(label)}</button>`).join('')}</div>
    </div>
    <div class='card'>
      <h3>الباقات (${esc(c.packs || 0)} إيموجي · ${esc(c.stickerPacks || 0)} ملصقات)</h3>
      <small>${esc(c.emojis || 0)} إيموجي في الخريطة (${esc(c.animated || 0)} متحرك، ${esc(c.tested || 0)} مجرَّب فعلياً) · ${esc(c.failedPacks || 0)} باقة مرفوضة من ${esc(d.total || s.candidates || 0)} مرشّحة · آخر اكتشاف: ${esc(when(d.finishedAt))}${d.lastError ? ' · خطأ: ' + esc(d.lastError) : ''}</small>
      <form id='emoji-add-form' class='bar'><input id='emoji-add-link' required maxlength='200' placeholder='https://t.me/addemoji/PackName' dir='ltr'><button class='btn'>إضافة باقة</button></form>
      <div class='acts wrap'><button class='sm' data-act='emoji-discover'>إعادة اكتشاف كل الباقات</button></div>
      <div id='emoji-progress'></div>
      <details><summary>الباقات المعتمدة (${(s.packs || []).length})</summary>
        ${(s.packs || []).map(p => `<div class='item'><div><b dir='ltr'>${esc(p.name)}</b><small>${esc(p.title)} · ${p.type === 'custom_emoji' ? 'إيموجي' : 'ملصقات'} · ${esc(p.count)} عنصر (${esc(p.animated)} متحرك) · مستعمل: ${esc(p.used)}</small></div><div class='acts'><button class='sm red' data-act='emoji-pack-del' data-id='${esc(p.name)}'>حذف</button></div></div>`).join('') || `<p class='mute'>لا توجد باقات بعد — اضغط «إعادة اكتشاف».</p>`}
      </details>
      ${(s.failed || []).length ? `<details><summary>باقات رفضها تيليجرام (${s.failed.length})</summary>${s.failed.map(f => `<div class='item'><div><b dir='ltr'>${esc(f.name)}</b><small dir='ltr'>${esc(f.error)}</small></div></div>`).join('')}</details>` : ''}
    </div>
    <div class='card'>
      <h3>خريطة الإيموجي</h3>
      <form id='emoji-search-form' class='bar'><input id='emoji-search' value='${esc(EMOJI_QUERY)}' placeholder='إيموجي أو اسم باقة أو ID'><button class='btn'>بحث</button></form>
      <small>المعروض ${(s.map || []).length} من ${esc(s.total || 0)}. ★ أساسي · ✔ مجرَّب · ✎ اختيار يدوي.</small>
      <div id='emoji-map'>${(s.map || []).map(r => `<div class='item col'><div><b>${esc(r.emoji)} ${r.core ? '★' : ''}${r.tested ? ' ✔' : ''}${r.manual ? ' ✎' : ''}</b><small dir='ltr'>${esc(r.id)} · ${esc(r.pack)}${r.anim ? '' : ' · static'}${(r.alts || []).length ? ' · +' + r.alts.length + ' alt' : ''}</small></div>
        <div class='acts wrap'><button class='sm ok' data-act='emoji-test' data-id='${esc(r.emoji)}'>اختبار</button>${(r.alts || []).map(a => `<button class='sm' data-act='emoji-set' data-id='${esc(r.emoji)}' data-v='${esc(a.id)}' title='${esc(a.pack)}'>بديل: ${esc(a.pack)}</button>`).join('')}<button class='sm' data-act='emoji-edit' data-id='${esc(r.emoji)}'>تعديل ID</button><button class='sm red' data-act='emoji-del' data-id='${esc(r.emoji)}'>حذف</button></div></div>`).join('') || `<p class='mute'>الخريطة فارغة.</p>`}</div>
    </div>`;
}
async function loadEmoji() {
  const el = document.querySelector('#t-emoji');
  if (!el) return;
  if (!EMOJI_STATE) el.innerHTML = "<p class='mute'>جارٍ تحميل الإيموجي…</p>";
  try {
    EMOJI_STATE = await emojiView(EMOJI_QUERY, 150);
    renderEmoji();
  } catch (error) {
    el.innerHTML = `<p class='err'>${esc(error.message)}</p><button class='sm' data-act='emoji-reload'>إعادة المحاولة</button>`;
  }
}
function describeEmojiRun(op, r) {
  if (r.error && !r.ok) return `<b>فشل</b><br><small dir='ltr'>${esc(r.error)}</small>`;
  if (op === 'test_caps') return `<b>نتيجة الفحص (الأدمين ${esc(r.admin)})</b><br>${capMark(r.text)} النص المتحرك — ${esc(r.textNote)}<br>${capMark(r.button)} أيقونة الزر — ${esc(r.buttonNote)}`;
  if (op === 'test_core') return `<b>الإيموجيات الأساسية</b><br>مقبولة: ${esc((r.tested || []).join(' ') || '—')}<br>غير متوفرة في أي باقة: ${esc((r.missing || []).join(' ') || '—')}${r.dropped ? '<br>⚠️ تيليجرام أسقط الإيموجي المتحرك من الرسالة (الحساب غير مؤهل).' : ''}${(r.rejected || []).length ? '<br>مرفوضة:<br>' + r.rejected.map(x => `${esc(x.emoji)} <small dir='ltr'>${esc(x.id)} — ${esc(x.error)}</small>`).join('<br>') : ''}`;
  if (op === 'test_one') return `<b>اختبار ${esc(r.id)}</b><br>${capMark(r.text)} النص المتحرك · ${capMark(r.button)} أيقونة الزر<br><small>أُرسلت للأدمين ${esc(r.admin)}</small>`;
  if (op === 'test_fallback') return `<b>اختبار الاحتياط</b><br>${r.delivered ? '✅ الرسالة وصلت' : '❌ لم تصل'} بعد ${esc(r.tries)} محاولة (الدرجة ${esc(r.levelUsed)})${(r.errors || []).length ? '<br>' + r.errors.map(x => `<small dir='ltr'>L${esc(x.level)}: ${esc(x.error)}</small>`).join('<br>') : '<br><small>تيليجرام لم يرجع خطأ.</small>'}`;
  if (op === 'snapshot') return `<b>الشاشات المرسلة للأدمين ${esc(r.admin)}</b><br>` + (r.screens || []).map(x => `${x.ok ? '✅' : '❌'} ${esc(x.title)} — ${(x.messages || []).map(m => `متحرك ${esc(m.accepted)}/${esc(m.animated)} · أيقونات ${esc(m.iconsAccepted)}/${esc(m.icons)} · درجة ${esc(m.level)}${m.firstError ? ` <small dir='ltr'>${esc(m.firstError)}</small>` : ''}`).join(' | ') || 'بلا إيموجي متحرك'}${x.error ? ` <small dir='ltr'>${esc(x.error)}</small>` : ''}`).join('<br>');
  if (op === 'samples') return `<b>العيّنات</b><br>${r.broadcast?.ok ? '✅' : '❌'} البث — متحرك ${esc(r.broadcast?.accepted ?? 0)}/${esc(r.broadcast?.animated ?? 0)} ${esc(r.broadcast?.error || '')}<br>${r.win?.ok ? '✅' : '❌'} رسالة الفوز — متحرك ${esc(r.win?.accepted ?? 0)}/${esc(r.win?.animated ?? 0)} ${esc(r.win?.error || '')}`;
  return esc(r.message || 'تم');
}
async function runEmojiDiscovery() {
  const progress = document.querySelector('#emoji-progress');
  let step = await emojiOp('discover', { restart: true });
  for (let i = 0; i < 40 && step && !step.done; i++) {
    if (progress) progress.innerHTML = `<small>جارٍ التحقق من الباقات… ${esc(step.cursor)}/${esc(step.total)} (مقبولة ${esc(step.verified)}، مرفوضة ${esc(step.failed)})</small>`;
    if (step.busy) await new Promise(resolve => setTimeout(resolve, 3000));
    step = await emojiOp('discover', {});
  }
  if (!step?.done) throw new Error(step?.error || 'الاكتشاف لم يكتمل؛ أعد المحاولة');
  toast(`اكتمل الاكتشاف: ${step.verified} باقة و${step.emojis} إيموجي`);
}
document.addEventListener('click', async event => {
  const button = event.target.closest('[data-act]');
  if (!button || !String(button.dataset.act).startsWith('emoji-')) return;
  const action = button.dataset.act, id = button.dataset.id, value = button.dataset.v;
  button.disabled = true;
  try {
    if (action === 'emoji-reload') return await loadEmoji();
    if (action === 'emoji-run') {
      emojiResult("<p class='mute'>جارٍ التنفيذ…</p>");
      const result = await emojiOp(value, {});
      await loadEmoji();
      emojiResult(describeEmojiRun(value, result), !result.ok);
    } else if (action === 'emoji-test') {
      const result = await emojiOp('test_one', { emoji: id });
      await loadEmoji();
      emojiResult(describeEmojiRun('test_one', result), !result.ok);
      document.querySelector('#emoji-result')?.scrollIntoView({ block: 'center' });
    } else if (action === 'emoji-mode') {
      const result = await emojiOp('mode', { mode: value });
      if (!result.ok) throw new Error(result.message || result.error);
      toast(result.message); await loadEmoji();
    } else if (action === 'emoji-discover') {
      if (!confirm('إعادة التحقق من كل الباقات عند تيليجرام؟ الخريطة الحالية تبقى فعّالة حتى ينتهي.')) return;
      await runEmojiDiscovery(); await loadEmoji();
    } else if (action === 'emoji-pack-del') {
      if (!confirm(`حذف الباقة ${id}؟ الإيموجيات المأخوذة منها تُستبدل ببدائل أو تعود عادية.`)) return;
      const result = await emojiOp('remove_pack', { name: id });
      if (!result.ok) throw new Error(result.message || result.error);
      toast(result.message); await loadEmoji();
    } else if (action === 'emoji-set' || action === 'emoji-edit') {
      const next = action === 'emoji-set' ? value : prompt(`custom_emoji_id الجديد لـ ${id} (يتحقق منه تيليجرام قبل الحفظ):`, '');
      if (!next) return;
      const result = await emojiOp('set_emoji', { emoji: id, id: String(next).trim() });
      if (!result.ok) throw new Error(result.message || result.error);
      toast(result.message); await loadEmoji();
    } else if (action === 'emoji-del') {
      if (!confirm(`حذف ${id} من الخريطة؟ سيظهر عادياً.`)) return;
      const result = await emojiOp('remove_emoji', { emoji: id });
      if (!result.ok) throw new Error(result.message || result.error);
      toast(result.message); await loadEmoji();
    }
  } catch (error) {
    toast(error.message, true);
  } finally {
    button.disabled = false;
  }
});
document.addEventListener('submit', async event => {
  if (event.target.id === 'emoji-add-form') {
    event.preventDefault();
    try {
      const result = await emojiOp('add_pack', { link: document.querySelector('#emoji-add-link').value.trim() });
      if (!result.ok) throw new Error(result.message || result.error);
      toast(result.message); await loadEmoji();
    } catch (error) { toast(error.message, true); }
  } else if (event.target.id === 'emoji-search-form') {
    event.preventDefault();
    EMOJI_QUERY = document.querySelector('#emoji-search').value.trim();
    await loadEmoji();
  }
});
TITLES.emoji = 'الإيموجي';
LOAD.emoji = loadEmoji;
