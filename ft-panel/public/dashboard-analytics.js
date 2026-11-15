/* تحليلات مباشرة: نشاط 7 أيام، المتصدرون بالنقاط، حالة الطلبات، مع تحديث تلقائي. */
let AN_TIMER = null;
function anBars(days, key, color, label) {
  const rows = [...days].reverse();
  const max = Math.max(1, ...rows.map(r => Number(r[key]) || 0));
  const w = 300, h = 120, gap = 8, bw = (w - gap * (rows.length - 1)) / Math.max(1, rows.length);
  const bars = rows.map((r, i) => {
    const v = Number(r[key]) || 0, bh = Math.max(2, Math.round((v / max) * (h - 28)));
    const x = Math.round(i * (bw + gap));
    return `<rect x='${x}' y='${h - 16 - bh}' width='${Math.round(bw)}' height='${bh}' rx='5' fill='${color}'/><text x='${Math.round(x + bw / 2)}' y='${h - 3}' font-size='9' text-anchor='middle' fill='#5d6f82'>${esc(String(r.day || '').slice(-2))}</text><text x='${Math.round(x + bw / 2)}' y='${h - 19 - bh}' font-size='9' text-anchor='middle' fill='#0f2036'>${v}</text>`;
  }).join('');
  return `<div class='card'><h3>${esc(label)}</h3><svg viewBox='0 0 ${w} ${h}' width='100%' role='img' aria-label='${esc(label)}'>${bars}</svg></div>`;
}
async function loadAnalytics(silent) {
  const el = $('#t-analytics');
  if (!silent) el.innerHTML = "<p class='mute'>جارٍ تحميل التحليلات…</p>";
  clearTimeout(AN_TIMER);
  try {
    const [stats, reqs] = await Promise.all([botView('stats'), botView('requests').catch(() => ({ requests: [] }))]);
    const a = stats.activity || {}, days = a.days || [], top = stats.top || [];
    const counts = {};
    for (const r of reqs.requests || []) counts[r.status || 'unknown'] = (counts[r.status || 'unknown'] || 0) + 1;
    const names = { pending: 'قيد الانتظار', approved: 'مقبول', rejected: 'مرفوض', delivered: 'مُسلَّم', unknown: 'غير محدد' };
    const tiles = [['متصل الآن', a.activeOnline], ['نشطون اليوم', a.activeToday], ['رسائل اليوم', a.messagesToday], ['زيارات اليوم', a.visitsToday], ['نشطون 7 أيام', a.active7], ['إجمالي الرسائل', a.messagesTotal]];
    el.innerHTML = `<div class='agent-toolbar'><button class='sm' id='an-refresh'>تحديث</button><button class='sm' id='an-csv'>تصدير المتصدرين CSV</button><span class='pill'>تحديث تلقائي كل 30 ثانية</span></div>
    <div class='cc-grid'>${tiles.map(t => `<div class='cc-tile'><small>${esc(t[0])}</small><b>${esc(t[1] ?? 0)}</b></div>`).join('')}</div>
    <div class='cc-actions'>${anBars(days, 'active', '#2f6bff', 'النشطون يومياً')}${anBars(days, 'messages', '#12a05f', 'الرسائل يومياً')}</div>
    <div class='card'><h3>🏆 المتصدرون بالنقاط</h3>${top.length ? top.map((r, i) => `<div class='cc-user'><b>${i + 1}</b>${ccAvatar(r.userId, r.name || r.userId)}<div><b>${esc(r.name || r.userId)}</b><small>${esc(r.userId)}</small></div><span class='pill'>${esc(r.points)} نقطة</span></div>`).join('') : "<p class='mute'>لا بيانات بعد.</p>"}</div>
    <div class='card'><h3>📨 حالة الطلبات (آخر 100)</h3>${Object.keys(counts).length ? Object.entries(counts).map(([k, v]) => `<span class='pill' style='margin:3px'>${esc(names[k] || k)}: ${v}</span>`).join('') : "<p class='mute'>لا طلبات.</p>"}</div>`;
    $('#an-refresh').onclick = () => loadAnalytics();
    $('#an-csv').onclick = () => {
      const csv = 'rank,userId,points\n' + top.map((r, i) => `${i + 1},${String(r.userId).replace(/[^0-9A-Za-z_-]/g, '')},${Number(r.points) || 0}`).join('\n');
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); link.download = 'ft-top-balances.csv'; link.click();
    };
    if (typeof ccPhotos === 'function') ccPhotos(el);
    AN_TIMER = setTimeout(() => { if (!$('#t-analytics').hidden) loadAnalytics(true); }, 30000);
  } catch (e) { el.innerHTML = `<p class='err'>${esc(e.message)}</p><button class='sm' data-act='connect-settings'>إعداد ربط البوت</button>`; }
}
LOAD.analytics = loadAnalytics;
