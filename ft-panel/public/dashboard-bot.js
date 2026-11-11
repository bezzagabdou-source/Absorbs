/* الإدارة الفعلية لـ FT-bot؛ بياناتها منفصلة عن Redis الخاص باللوحة القديمة. */
let BOT_TAB = 'overview';
let BOT_CATALOG = { rewards: [], contests: [], sections: [] };
let BOT_USERS = [];
let BOT_ORIGIN = '';
let BOT_EDIT = null;
const BOT_TABS = [
  ['overview', 'نظرة عامة'], ['rewards', 'الجوائز'], ['contests', 'المسابقات'],
  ['users', 'الأعضاء'], ['requests', 'الطلبات'], ['settings', 'الإعدادات'], ['log', 'السجل'],
];
const botView = (view, id) => api('bot_view', { view, id });
const botOp = (op, input) => api('bot_manage', { op, input });
const yes = value => value ? 'مفعّل' : 'متوقف';
const selectOption = (value, label, selected) => `<option value='${esc(value)}' ${value === selected ? 'selected' : ''}>${esc(label)}</option>`;
const checked = value => value ? 'checked' : '';
async function botOrigin() {
  if (!BOT_ORIGIN) BOT_ORIGIN = (await api('bot_connection')).origin;
  return BOT_ORIGIN;
}
function thumb(kind, item) {
  if (!item?.hasImage || !BOT_ORIGIN) return '';
  const resource = kind === 'reward' ? 'rewards' : 'contests';
  return `<img class='bot-thumb' src='${esc(BOT_ORIGIN)}/api/${resource}/${encodeURIComponent(item.id)}/image?v=${Date.now()}' alt='صورة ${esc(item.title)}' loading='lazy'>`;
}
async function loadBot() {
  const el = $('#t-bot');
  const selected = BOT_TAB;
  el.innerHTML = `<div class='bot-heading'><div><h3>إدارة FT-bot الفعلي</h3><small>هذه البيانات مستقلة عن بيانات اللوحة القديمة.</small></div><button class='sm' data-act='bot-refresh'>تحديث</button></div><div class='bot-tabs'>${BOT_TABS.map(([id, label]) => `<button class='${id === selected ? 'on' : ''}' data-act='bot-tab' data-v='${id}'>${label}</button>`).join('')}</div><div id='bot-content'><p class='mute'>جارٍ التحميل…</p></div>`;
  const content = $('#bot-content');
  try {
    if (selected === 'overview') {
      const [data, activity] = await Promise.all([botView('overview'), botView('stats')]);
      const stats = data.stats || {}, act = activity.activity || {};
      content.innerHTML = `<div class='grid'>${[
        ['المستخدمون', stats.users], ['الجوائز', stats.rewards], ['جوائز مفعّلة', stats.activeRewards],
        ['محظورون', stats.banned], ['نشطون اليوم', act.activeToday], ['رسائل اليوم', act.messagesToday],
      ].map(([label, value]) => `<div class='stat'><b>${esc(value ?? 0)}</b><span>${label}</span></div>`).join('')}</div>
      <div class='card'><h3>حالة البوت</h3><small>النقاط: ${yes(data.points?.enabled)} · الاشتراك الإجباري: ${yes(data.settings?.requireJoin)} · الصيانة: ${yes(data.settings?.maintenanceMode)}</small><small>نقاط الإحالة: ${esc(data.points?.perJoin ?? 0)} · المجموعة: ${esc(data.group?.title || 'غير محددة')}</small><small>إحصاءات النشاط من البوت الفعلي، والترتيب يعرض رصيد متجره.</small></div>
      <div class='acts wrap'><button class='sm' data-act='bot-tab' data-v='rewards'>إدارة الجوائز</button><button class='sm' data-act='bot-tab' data-v='contests'>إدارة المسابقات</button><button class='sm' data-act='bot-tab' data-v='requests'>عرض الطلبات</button><button class='sm' data-act='bot-referrals'>الإحالات</button></div>`;
    } else if (selected === 'rewards' || selected === 'contests') {
      const [data] = await Promise.all([botView('catalog'), botOrigin()]);
      BOT_CATALOG = data;
      const kind = selected === 'rewards' ? 'reward' : 'contest';
      const items = data[selected] || [];
      content.innerHTML = `<button class='btn full' data-act='bot-add' data-kind='${kind}'>+ إضافة ${kind === 'reward' ? 'جائزة' : 'مسابقة'}</button>` + (items.length ? items.map(item => `
        <div class='item bot-item'>${thumb(kind, item)}<div class='bot-item-main'><b>${kind === 'reward' ? esc(item.emoji || '🎁') + ' ' : ''}${esc(item.title)}</b><small>${kind === 'reward'
          ? `${esc(item.cost)} نقطة · المخزون ${item.stock == null ? 'غير محدود' : esc(item.stock)} · ${yes(item.active)}`
          : `الهدف ${esc(item.target)} · ${esc({ active: 'نشطة', draft: 'مسودة', ended: 'منتهية' }[item.status] || item.status)} · ${item.mode === 'group' ? 'مجموعة' : 'إحالة'}`}</small><small>${item.hasImage ? 'لديها صورة' : 'بدون صورة'} · ${esc(item.id)}</small></div>
        <div class='acts wrap'><button class='sm' data-act='bot-edit' data-kind='${kind}' data-id='${esc(item.id)}'>تعديل وصورة</button>${kind === 'reward' ? `<button class='sm' data-act='bot-toggle' data-kind='reward' data-id='${esc(item.id)}' data-v='${item.active ? '0' : '1'}'>${item.active ? 'إيقاف' : 'تفعيل'}</button>` : `<button class='sm' data-act='bot-leaderboard' data-id='${esc(item.id)}'>الترتيب</button>`}<button class='sm red' data-act='bot-delete' data-kind='${kind}' data-id='${esc(item.id)}'>حذف</button></div></div>`).join('') : `<p class='mute'>لا توجد ${kind === 'reward' ? 'جوائز' : 'مسابقات'}.</p>`) + `<div id='bot-leaderboard'></div>`;
    } else if (selected === 'users') {
      const data = await botView('users');
      BOT_USERS = data.users || [];
      content.innerHTML = `<div class='card'><h3>أعضاء FT-bot</h3><small>القائمة والتصدير لآخر 100 عضو فقط. يمكن البحث عن أي معرف مسجّل.</small><form id='bot-user-search' class='bar'><input id='bot-user-query' placeholder='معرّف أو اسم أو @username'><button class='btn'>بحث</button></form><button class='sm' data-act='bot-export'>تصدير آخر 100 بصيغة CSV</button></div><div id='bot-user-results'></div>`;
      renderBotUsers(BOT_USERS);
    } else if (selected === 'requests') {
      const data = await botView('requests');
      const requests = data.requests || [];
      content.innerHTML = `<p class='scope-note'>آخر 100 طلب في متجر FT-bot. رفض الطلب المعلّق يعيد نقاطه.</p>` + (requests.length ? requests.map(r => `<div class='item col'><div><b>${esc(r.emoji)} ${esc(r.rewardTitle)}</b><small>${esc(r.userName)} · ${esc(r.userId)} · ${esc(r.cost)} نقطة · <em class='st ${esc(r.status)}'>${esc(ST[r.status] || r.status)}</em></small></div>${r.status === 'pending' ? `<div class='acts wrap'><button class='sm ok' data-act='bot-request' data-id='${esc(r.id)}' data-v='approved'>موافقة</button><button class='sm red' data-act='bot-request' data-id='${esc(r.id)}' data-v='rejected'>رفض وإرجاع النقاط</button></div>` : ''}</div>`).join('') : `<p class='mute'>لا توجد طلبات.</p>`);
    } else if (selected === 'settings') {
      const data = await botView('overview');
      const s = data.settings || {}, p = data.points || {}, g = data.group || {};
      content.innerHTML = `<form id='bot-settings-form' class='card'><h3>إعدادات FT-bot</h3>
        <label>يوزر المالك<input id='bs-owner' maxlength='32' value='${esc(s.ownerUsername || '')}'></label>
        <label>يوزر الدعم<input id='bs-support' maxlength='32' value='${esc(s.supportUsername || '')}'></label>
        <label>رسالة الترحيب<textarea id='bs-welcome' rows='4' required maxlength='3500'>${esc(s.welcomeText || '')}</textarea></label>
        <label>القوانين<textarea id='bs-rules' rows='4' required maxlength='3500'>${esc(s.rulesText || '')}</textarea></label>
        <label>قنوات الاشتراك الإجباري، قناة في كل سطر<textarea id='bs-channels' rows='4'>${esc((s.requiredChannels || []).join('\n'))}</textarea></label>
        <label class='chk'><input id='bs-gate' type='checkbox' ${checked(s.requireJoin)}> اشتراك القنوات إجباري</label>
        <label class='chk'><input id='bs-maintenance' type='checkbox' ${checked(s.maintenanceMode)}> وضع الصيانة</label>
        <label class='chk'><input id='bs-ai' type='checkbox' ${checked(s.aiEnabled)}> مساعد البوت مفعّل</label>
        <label class='chk'><input id='bs-auto' type='checkbox' ${checked(s.autoApproveJoins)}> قبول طلبات المجموعة تلقائياً</label>
        <label>هدف المجموعة الافتراضي<input id='bs-target' type='number' min='1' max='1000000' value='${esc(s.groupTarget || 20)}' required></label>
        <button class='btn'>حفظ إعدادات البوت</button></form>
        <form id='bot-points-form' class='card'><h3>نقاط متجر FT-bot</h3><small>تختلف عن نظام نقاط مراحل الدعوات القديم.</small>
        <label class='chk'><input id='bp-enabled' type='checkbox' ${checked(p.enabled)}> نظام نقاط المتجر مفعّل</label>
        <label>نقاط لكل إحالة جديدة<input id='bp-join' type='number' min='0' max='1000' value='${esc(p.perJoin ?? 0)}' required></label>
        <label>نقاط التفعيل<input id='bp-activated' type='number' min='0' max='1000' value='${esc(p.perActivated ?? 0)}' required></label>
        <label>الهدية اليومية الدنيا<input id='bp-min' type='number' min='0' max='1000' value='${esc(p.dailyMin ?? 0)}' required></label>
        <label>الهدية اليومية القصوى<input id='bp-max' type='number' min='0' max='1000' value='${esc(p.dailyMax ?? 0)}' required></label>
        <label>مقدمة المتجر<textarea id='bp-intro' rows='3' maxlength='2000'>${esc(p.shopIntro || '')}</textarea></label><button class='btn'>حفظ النقاط</button></form>
        <form id='bot-group-form' class='card'><h3>ربط مجموعة FT-bot</h3><label>معرّف المجموعة أو @username<input id='bg-id' value='${esc(g.chatId || '')}' required></label><label>اسم المجموعة<input id='bg-title' maxlength='100' value='${esc(g.title || '')}'></label><button class='btn'>حفظ المجموعة</button></form>
        <form id='bot-broadcast-form' class='card'><h3>بث لكل أعضاء FT-bot</h3><small>لكل المسجلين عند البدء مع استبعاد المحظورين. الإرسال على دفعات؛ أبقِ الصفحة مفتوحة أو استأنف لاحقاً.</small><textarea id='bb-text' rows='4' maxlength='4000' required placeholder='نص الرسالة'></textarea><button class='btn'>بدء البث بعد التأكيد</button> <button type='button' class='sm' data-act='bot-broadcast-latest'>حالة واستئناف آخر بث</button></form>`;
    } else if (selected === 'log') {
      const data = await botView('log');
      content.innerHTML = `<p class='scope-note'>آخر عمليات إدارة FT-bot المسجّلة.</p>` + ((data.log || []).length ? data.log.map(item => `<div class='item'><div><b>${esc(item.detail)}</b><small>${esc(item.op)} · ${item.at ? esc(new Date(item.at).toLocaleString('ar-DZ')) : ''}</small></div></div>`).join('') : `<p class='mute'>السجل فارغ.</p>`);
    }
  } catch (error) {
    content.innerHTML = `<p class='err'>${esc(error.message)}</p><button class='sm' data-act='connect-settings'>إعداد ربط البوت</button>`;
  }
}
LOAD.bot = loadBot;

function renderBotUsers(users) {
  const el = $('#bot-user-results');
  if (!el) return;
  el.innerHTML = users.length ? users.map(u => `<div class='card'><b>${esc(u.firstName || 'عضو')}</b><small>${u.username ? '@' + esc(u.username) + ' · ' : ''}${esc(u.id)} · ${u.banned ? 'محظور' : 'غير محظور'}</small><div class='big'>${esc(u.points ?? 0)} <span>نقطة</span></div><div class='acts wrap'><button class='sm' data-act='bot-points' data-id='${esc(u.id)}'>تغيير النقاط</button><button class='sm' data-act='bot-message' data-id='${esc(u.id)}'>رسالة</button><button class='sm ${u.banned ? '' : 'red'}' data-act='bot-ban' data-id='${esc(u.id)}' data-v='${u.banned ? '0' : '1'}'>${u.banned ? 'فك الحظر' : 'حظر'}</button></div></div>`).join('') : `<p class='mute'>لم يُعثر على أعضاء مطابقين.</p>`;
}
function botImageFields(kind, item) {
  return `<div class='card image-edit'><b>الصورة</b><small>JPG أو PNG أو WEBP أو GIF حتى 1.4 ميغا. إن لم تختَر صورة تُحفظ الحالية كما هي.</small>${thumb(kind, item)}<img id='bf-preview' class='bot-image-preview' alt='معاينة الصورة الجديدة' hidden><label>إضافة أو تغيير الصورة<input id='bf-file' type='file' accept='image/jpeg,image/png,image/webp,image/gif'></label>${item?.hasImage ? `<label class='chk'><input id='bf-remove' type='checkbox'> حذف الصورة الحالية</label>` : ''}</div>`;
}
function openBotEditor(kind, id) {
  const items = kind === 'reward' ? BOT_CATALOG.rewards : BOT_CATALOG.contests;
  const item = id ? items.find(x => x.id === id) : null;
  if (id && !item) return toast('العنصر غير موجود؛ حدّث القائمة', true);
  BOT_EDIT = { kind, id: id || '' };
  const p = item || {};
  const form = $('#bot-df');
  form.innerHTML = `<h2>${id ? 'تعديل' : 'إضافة'} ${kind === 'reward' ? 'جائزة FT-bot' : 'مسابقة FT-bot'}</h2>
    <label>الاسم<input id='bf-title' value='${esc(p.title || '')}' maxlength='100' required></label>` + (kind === 'reward' ? `
    <label>الإيموجي<input id='bf-emoji' value='${esc(p.emoji || '🎁')}' maxlength='16'></label>
    <label>السعر بالنقاط<input id='bf-cost' type='number' min='1' max='1000000' value='${esc(p.cost ?? 1)}' required></label>
    <label>الوصف<textarea id='bf-desc' rows='3' maxlength='2000'>${esc(p.desc || '')}</textarea></label>
    <label>المخزون (اتركه فارغاً لغير المحدود)<input id='bf-stock' type='number' min='0' max='1000000' value='${p.stock == null ? '' : esc(p.stock)}'></label>
    <label>القسم<select id='bf-section'>${selectOption('accounts', 'الحسابات', p.section || 'accounts')}${selectOption('points', 'النقاط', p.section || 'accounts')}${selectOption('services', 'الخدمات', p.section || 'accounts')}</select></label>
    <label>الترتيب<input id='bf-order' type='number' min='0' max='1000000' value='${esc(p.order ?? (BOT_CATALOG.rewards.length + 1))}' required></label>
    <label>طريقة التسليم<textarea id='bf-delivery' rows='2' maxlength='1000'>${esc(p.delivery || '')}</textarea></label>
    <label class='chk'><input id='bf-active' type='checkbox' ${checked(p.active !== false)}> الجائزة مفعّلة</label>` : `
    <label>الوصف<textarea id='bf-desc' rows='3' maxlength='2000'>${esc(p.description || '')}</textarea></label>
    <label>الهدف<input id='bf-target' type='number' min='1' max='1000000' value='${esc(p.target ?? 20)}' required></label>
    <label>الجائزة<input id='bf-prize' value='${esc(p.prize || '')}' maxlength='300'></label>
    <label>عدد الفائزين<input id='bf-winners' type='number' min='1' max='1000000' value='${esc(p.winners ?? 1)}' required></label>
    <label>النوع<select id='bf-mode'>${selectOption('referral', 'إحالات البوت', p.mode || 'referral')}${selectOption('group', 'المجموعة', p.mode || 'referral')}</select></label>
    <label>الحالة<select id='bf-status'>${selectOption('draft', 'مسودة', p.status || 'draft')}${selectOption('active', 'نشطة', p.status || 'draft')}${selectOption('ended', 'منتهية', p.status || 'draft')}</select></label>`)
    + botImageFields(kind, p) + `<div class='row'><button class='btn'>حفظ</button><button class='btn ghost' type='button' data-act='bot-cancel'>إلغاء</button></div>`;
  $('#bot-dlg').showModal();
}
async function readBotImage(file) {
  if (!file) return null;
  if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type) || file.size > 1400000) throw new Error('اختر صورة JPG أو PNG أو WEBP أو GIF لا تتجاوز 1.4 ميغا');
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('تعذّرت قراءة الصورة'));
    reader.readAsDataURL(file);
  });
}
function exportBotUsers() {
  const safeCell = value => {
    let text = String(value ?? '');
    if (/^\s*[=+\-@]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  };
  const rows = [['id', 'name', 'username', 'points', 'banned'], ...BOT_USERS.map(u => [u.id, u.firstName, u.username, u.points, u.banned])];
  const url = URL.createObjectURL(new Blob(['\ufeff' + rows.map(r => r.map(safeCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = 'ft-bot-recent-users.csv'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
document.addEventListener('click', async event => {
  const button = event.target.closest('[data-act]');
  if (!button) return;
  const action = button.dataset.act, id = button.dataset.id, kind = button.dataset.kind;
  if (!new Set(['open-bot', 'bot-tab', 'bot-refresh', 'bot-referrals', 'bot-add', 'bot-edit', 'bot-cancel', 'bot-export', 'bot-toggle', 'bot-delete', 'bot-leaderboard', 'bot-points', 'bot-ban', 'bot-message', 'bot-request', 'bot-broadcast-latest']).has(action)) return;
  try {
    if (action === 'bot-broadcast-latest') {
      const result = await botView('broadcast');
      if (!result.broadcast) return toast('لا يوجد بث سابق');
      broadcastProgress(result.broadcast);
      if (!result.broadcast.done) void resumeBroadcast(result.broadcast.jobId);
    } else if (action === 'open-bot') { BOT_TAB = 'overview'; show('bot'); }
    else if (action === 'bot-tab') { BOT_TAB = button.dataset.v; loadBot(); }
    else if (action === 'bot-refresh') loadBot();
    else if (action === 'bot-referrals') show('referrals');
    else if (action === 'bot-add') openBotEditor(kind, '');
    else if (action === 'bot-edit') openBotEditor(kind, id);
    else if (action === 'bot-cancel') $('#bot-dlg').close();
    else if (action === 'bot-export') exportBotUsers();
    else if (action === 'bot-toggle') {
      button.disabled = true;
      await botOp('reward_save', { id, reward: { active: button.dataset.v === '1' } });
      toast('تم تحديث حالة الجائزة'); await loadBot();
    } else if (action === 'bot-delete') {
      const question = kind === 'contest' ? 'حذف المسابقة نهائياً؟ سيُحذف مخزونها وترتيبها أيضاً.' : 'حذف جائزة البوت نهائياً؟';
      if (!confirm(question)) return;
      button.disabled = true;
      await botOp(kind + '_delete', { id, confirm: true });
      toast('تم الحذف من FT-bot'); await loadBot();
    } else if (action === 'bot-leaderboard') {
      button.disabled = true;
      const result = await botView('leaderboard', id);
      const rows = result.leaderboard || [];
      $('#bot-leaderboard').innerHTML = `<div class='card'><h3>ترتيب ${esc(result.contest?.title || '')}</h3>${rows.length ? rows.map((r, i) => `<div class='item'><div><b>${i + 1}. ${esc(r.name || r.id)}</b><small>${esc(r.id)}${r.username ? ' · @' + esc(r.username) : ''}</small></div><span class='num'>${esc(r.count)}</span></div>`).join('') : `<small>لا يوجد مشاركون بعد.</small>`}</div>`;
    } else if (action === 'bot-points') {
      const input = prompt('التغيير في الرصيد: رقم موجب للزيادة أو سالب للخصم');
      if (input === null || !input.trim()) return;
      const delta = Number(input);
      if (!Number.isSafeInteger(delta)) throw new Error('أدخل عدداً صحيحاً');
      button.disabled = true;
      const result = await botOp('user_points', { userId: id, delta });
      toast('رصيد FT-bot الآن ' + result.balance); await loadBot();
    } else if (action === 'bot-ban') {
      button.disabled = true;
      await botOp('user_ban', { userId: id, banned: button.dataset.v === '1' });
      toast('تم تحديث الحظر في FT-bot'); await loadBot();
    } else if (action === 'bot-message') {
      const text = prompt('نص الرسالة إلى هذا العضو');
      if (!text?.trim()) return;
      button.disabled = true;
      await botOp('send_message', { userId: id, text });
      toast('أُرسلت الرسالة عبر FT-bot');
    } else if (action === 'bot-request') {
      if (!confirm(button.dataset.v === 'rejected' ? 'رفض الطلب وإرجاع نقاطه؟' : 'قبول الطلب؟')) return;
      button.disabled = true;
      const result = await botOp('request_decide', { id, status: button.dataset.v });
      toast(result.notified ? 'تم تحديث الطلب وإشعار العضو' : 'تم تحديث الطلب؛ تعذّر إرسال الإشعار');
      await loadBot();
    }
  } catch (error) { toast(error.message, true); }
  finally { button.disabled = false; }
});
document.addEventListener('change', async event => {
  if (event.target.id !== 'bf-file') return;
  try {
    const image = await readBotImage(event.target.files?.[0]);
    const preview = $('#bf-preview');
    if (image) { preview.src = image; preview.hidden = false; if ($('#bf-remove')) $('#bf-remove').checked = false; }
    else { preview.removeAttribute('src'); preview.hidden = true; }
  } catch (error) { event.target.value = ''; const preview = $('#bf-preview'); if (preview) { preview.removeAttribute('src'); preview.hidden = true; } toast(error.message, true); }
});
document.addEventListener('submit', async event => {
  const form = event.target;
  if (!['bot-df', 'bot-user-search', 'bot-settings-form', 'bot-points-form', 'bot-group-form', 'bot-broadcast-form'].includes(form.id)) return;
  event.preventDefault();
  const button = form.querySelector('button[type=submit], button:not([type])');
  if (button) button.disabled = true;
  try {
    if (form.id === 'bot-df') {
      const { kind } = BOT_EDIT;
      // Validate the image before saving, to avoid creating an item that cannot receive it.
      const image = await readBotImage($('#bf-file').files?.[0]);
      const remove = !!$('#bf-remove')?.checked && !image;
      const payload = kind === 'reward' ? { title: $('#bf-title').value, emoji: $('#bf-emoji').value, cost: Number($('#bf-cost').value), desc: $('#bf-desc').value, stock: $('#bf-stock').value === '' ? null : Number($('#bf-stock').value), section: $('#bf-section').value, order: Number($('#bf-order').value), delivery: $('#bf-delivery').value, active: $('#bf-active').checked }
        : { title: $('#bf-title').value, description: $('#bf-desc').value, target: Number($('#bf-target').value), prize: $('#bf-prize').value, winners: Number($('#bf-winners').value), mode: $('#bf-mode').value, status: $('#bf-status').value };
      const saved = await botOp(kind + '_save', { id: BOT_EDIT.id || undefined, [kind]: payload });
      BOT_EDIT.id = saved[kind].id; // If image upload fails, retry edits the saved item rather than creating a duplicate.
      if (image || remove) {
        try { await api('bot_image', { kind, id: BOT_EDIT.id, dataUrl: image || '' }); }
        catch (error) { await loadBot(); throw new Error('حُفظت البيانات، لكن فشل حفظ الصورة: ' + error.message); }
      }
      $('#bot-dlg').close(); toast('تم الحفظ في FT-bot'); await loadBot();
    } else if (form.id === 'bot-user-search') {
      const query = $('#bot-user-query').value.trim().replace(/^@/, '');
      if (/^\d{1,20}$/.test(query)) renderBotUsers([(await botView('user', query)).user]);
      else renderBotUsers(BOT_USERS.filter(u => !query || String(u.firstName || '').toLowerCase().includes(query.toLowerCase()) || String(u.username || '').toLowerCase().includes(query.toLowerCase())));
    } else if (form.id === 'bot-settings-form') {
      const channels = $('#bs-channels').value.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
      await botOp('settings_save', { settings: { ownerUsername: $('#bs-owner').value, supportUsername: $('#bs-support').value, welcomeText: $('#bs-welcome').value, rulesText: $('#bs-rules').value, requiredChannels: channels, requireJoin: $('#bs-gate').checked, maintenanceMode: $('#bs-maintenance').checked, aiEnabled: $('#bs-ai').checked, autoApproveJoins: $('#bs-auto').checked, groupTarget: Number($('#bs-target').value) } });
      toast('حُفظت إعدادات FT-bot');
    } else if (form.id === 'bot-points-form') {
      await botOp('points_config', { points: { enabled: $('#bp-enabled').checked, perJoin: Number($('#bp-join').value), perActivated: Number($('#bp-activated').value), dailyMin: Number($('#bp-min').value), dailyMax: Number($('#bp-max').value), shopIntro: $('#bp-intro').value } });
      toast('حُفظت نقاط FT-bot');
    } else if (form.id === 'bot-group-form') {
      await botOp('set_group', { chatId: $('#bg-id').value, title: $('#bg-title').value });
      toast('حُفظت المجموعة');
    } else if (form.id === 'bot-broadcast-form') {
      if (localStorage.getItem(BROADCAST_KEY)) throw new Error('يوجد بث لم يكتمل؛ استأنفه أولاً قبل بدء بث جديد.');
      if (!confirm('بدء إرسال الرسالة إلى كل أعضاء FT-bot المسجلين، ما عدا المحظورين؟')) return;
      const jobId = requestId(), text = $('#bb-text').value;
      localStorage.setItem(BROADCAST_KEY, jobId);
      let result;
      try { result = await botOp('broadcast_start', { text, jobId, confirm: true }); }
      catch {
        // The first response may have been lost; the same ID cannot create a duplicate.
        try { result = await botOp('broadcast_start', { text, jobId, confirm: true }); }
        catch (error) { broadcastProgress({ jobId }, 'تعذّر تأكيد بدء البث: ' + error.message + '؛ راجع آخر بث قبل البدء مجدداً.'); throw error; }
      }
      broadcastProgress(result, 'بدأت مهمة البث');
      void resumeBroadcast(jobId);
    }
  } catch (error) { toast(error.message, true); }
  finally { if (button) button.disabled = false; }
});
