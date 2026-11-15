/* مركز التحكم الشامل: كل أدوات المالك السريعة في صفحة واحدة (يستعمل نفس عمليات البوت المسموحة فقط). */
const CC_PHOTO_CACHE = {};
async function ccPhotos(root) {
  const ids = [...new Set([...root.querySelectorAll('[data-avatar-id]')].map(a => a.dataset.avatarId).filter(id => !CC_PHOTO_CACHE[id]))];
  const batches = [];
  for (let i = 0; i < ids.length; i += 8) batches.push(ids.slice(i, i + 8));
  const paint = () => root.querySelectorAll('[data-avatar-id]').forEach(a => {
    const photo = CC_PHOTO_CACHE[a.dataset.avatarId];
    if (!photo) return;
    const img = a.querySelector('img'); img.src = photo; img.hidden = false; a.querySelector('span').hidden = true;
  });
  paint();
  for (let i = 0; i < batches.length; i += 3) {
    await Promise.all(batches.slice(i, i + 3).map(async batch => {
      try { Object.assign(CC_PHOTO_CACHE, await api('referral_photos', { ids: batch })); paint(); } catch { /* initials stay */ }
    }));
  }
}
function ccAvatar(id, name) {
  const initial = esc(Array.from(String(name || '?').replace(/^@/, ''))[0] || '?');
  return `<div class='avatar' data-avatar-id='${esc(String(id))}'><img alt='' hidden><span>${initial}</span></div>`;
}
async function loadControl() {
  const el = $('#t-control');
  el.innerHTML = "<p class='mute'>جارٍ التحميل…</p>";
  let health = null, stats = null, error = '';
  try { health = await api('bot_health'); } catch (e) { error = e.message; }
  try { stats = (await botView('overview')).stats || null; } catch (e) { error = error || e.message; }
  const tiles = [
    ['الأعضاء', health ? health.users : (stats && stats.users) ?? '—'],
    ['التخزين', health && health.storage ? (health.storage.backend || health.storage) : '—'],
    ['تيليغرام', health && health.telegram ? (health.telegram.ok === false ? 'متوقف' : 'يعمل') : '—'],
    ['الجوائز', stats ? stats.rewards : '—'],
    ['جوائز مفعّلة', stats ? stats.activeRewards : '—'],
    ['النسخة', health && health.commit ? String(health.commit).slice(0, 7) : '—'],
  ];
  el.innerHTML = `${error ? `<p class='err'>${esc(error)}</p>` : ''}
  <div class='cc-grid'>${tiles.map(t => `<div class='cc-tile'><small>${esc(t[0])}</small><b>${esc(typeof t[1] === 'object' ? JSON.stringify(t[1]) : t[1])}</b></div>`).join('')}</div>
  <div class='cc-actions'>
    <form class='card' data-cc='message'><h3>✉️ رسالة لعضو</h3><label>معرّف العضو<input name='userId' inputmode='numeric' required></label><label>النص<textarea name='text' rows='3' maxlength='3500' required></textarea></label><button class='btn' type='submit'>إرسال</button></form>
    <form class='card' data-cc='points'><h3>⭐ تعديل نقاط</h3><label>معرّف العضو<input name='userId' inputmode='numeric' required></label><label>التغيير (+ أو −)<input name='delta' type='number' step='1' required></label><button class='btn' type='submit'>تطبيق</button></form>
    <form class='card' data-cc='ban'><h3>🚫 حظر / رفع حظر</h3><label>معرّف العضو<input name='userId' inputmode='numeric' required></label><div class='acts'><button class='btn' data-v='1' type='submit'>حظر</button><button class='sm' data-v='0' type='submit'>رفع الحظر</button></div></form>
    <form class='card' data-cc='broadcast'><h3>📣 بث للأعضاء</h3><label>النص<textarea name='text' rows='3' maxlength='3500' required></textarea></label><small>يُرسل لآخر 50 عضواً كحد أقصى، مع عدّاد نجاح وفشل.</small><button class='btn' type='submit'>بدء البث</button></form>
    <form class='card' data-cc='group'><h3>👥 مجموعة الانضمام</h3><label>معرّف المجموعة<input name='chatId' required></label><label>العنوان<input name='title'></label><button class='btn' type='submit'>حفظ</button></form>
    <form class='card' data-cc='refpoints'><h3>🔗 نقاط الإحالة</h3><label>نقاط كل عضو جديد<input name='perJoin' type='number' min='0' max='1000' required></label><button class='btn' type='submit'>حفظ</button></form>
  </div>
  <div class='card'><h3>🕘 آخر الأعضاء</h3><div id='cc-recent' class='cc-recent'><p class='mute'>جارٍ التحميل…</p></div></div>`;
  try {
    const data = await botView('users');
    const rows = (data.users || []).slice(0, 12);
    $('#cc-recent').innerHTML = rows.length ? rows.map(u => `<div class='cc-user'>${ccAvatar(u.id, u.firstName || u.username)}<div><b>${esc(u.firstName || 'عضو')}</b><small>${u.username ? '@' + esc(u.username) + ' · ' : ''}${esc(u.id)}</small></div><span class='pill'>${esc(u.points ?? 0)} نقطة</span></div>`).join('') : "<p class='mute'>لا أعضاء بعد.</p>";
    ccPhotos($('#cc-recent'));
  } catch (e) { $('#cc-recent').innerHTML = `<p class='err'>${esc(e.message)}</p>`; }
}
document.addEventListener('submit', async event => {
  const form = event.target.closest('form[data-cc]');
  if (!form) return;
  event.preventDefault();
  const f = Object.fromEntries(new FormData(form));
  const submitter = event.submitter;
  try {
    const kind = form.dataset.cc;
    if (kind === 'message') await botOp('send_message', { userId: f.userId.trim(), text: f.text });
    else if (kind === 'points') await botOp('user_points', { userId: f.userId.trim(), delta: Number(f.delta) });
    else if (kind === 'ban') {
      if (submitter?.dataset.v === '1' && !confirm('تأكيد حظر هذا العضو؟')) return;
      await botOp('user_ban', { userId: f.userId.trim(), banned: submitter?.dataset.v === '1' });
    }
    else if (kind === 'broadcast') {
      if (!confirm('تأكيد إرسال البث؟')) return;
      await botOp('broadcast_start', { text: f.text, jobId: requestId(), confirm: true });
    }
    else if (kind === 'group') await botOp('set_group', { chatId: f.chatId, title: f.title });
    else if (kind === 'refpoints') await api('referral_config_set', { perJoin: Number(f.perJoin) });
    toast('تم التنفيذ ✓');
  } catch (e) { toast(e.message || 'تعذّر التنفيذ', true); }
});
LOAD.control = loadControl;
