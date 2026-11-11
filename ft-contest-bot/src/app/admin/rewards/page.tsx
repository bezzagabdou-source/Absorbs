import { requireAdmin } from "@/lib/auth";
import {
  balanceOf,
  ensureRewards,
  getJoinGroup,
  getPointsConfig,
  listRequests,
  topBalances,
  type Reward,
} from "@/lib/rewards";
import { listRecentUsers } from "@/lib/users";
import { Flash, dateText } from "../ui";
import {
  decideRewardForm,
  deleteRewardForm,
  grantPointsForm,
  savePointsConfigForm,
  saveRewardForm,
  setJoinGroupForm,
  setPointsForm,
} from "./rewards-actions";

export const dynamic = "force-dynamic";

export default async function RewardsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; err?: string; edit?: string }>;
}) {
  await requireAdmin();
  const { ok, err, edit } = await searchParams;

  const [rewards, cfg, requests, top, target, users] = await Promise.all([
    ensureRewards(),
    getPointsConfig(),
    listRequests(60),
    topBalances(12),
    getJoinGroup(),
    listRecentUsers(200),
  ]);

  const editing: Reward | undefined = edit ? rewards.find((r) => r.id === edit) : undefined;
  const pending = requests.filter((r) => r.status === "pending");
  const balances = await Promise.all(top.map((row) => balanceOf(row.userId)));
  const nameOf = (id: string) => {
    const u = users.find((x) => x.id === id);
    return u ? `${u.firstName}${u.username ? ` (@${u.username})` : ""}` : id;
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>النقاط والجوائز 🎁</h1>
          <p className="muted">
            نظام المتجر: كل عضو يجي من رابطك = نقاط، والنقاط تتبدل بجوائز بعد موافقتك.
          </p>
        </div>
      </div>
      <Flash ok={ok} err={err} />

      <div className="grid-2">
        {/* إعدادات النقاط */}
        <section className="card">
          <h2>⚙️ إعدادات النقاط</h2>
          <form action={savePointsConfigForm} className="form">
            <label className="switch">
              <input type="checkbox" name="enabled" defaultChecked={cfg.enabled} />
              <span>نظام النقاط مفعّل</span>
            </label>
            <label>
              نقاط كل عضو جديد (من رابط دعوة)
              <input type="number" name="perJoin" min={0} defaultValue={cfg.perJoin} />
            </label>
            <label>
              نقاط إضافية عند أول استعمال
              <input type="number" name="perActivated" min={0} defaultValue={cfg.perActivated} />
            </label>
            <div className="row">
              <label>
                هدية اليوم — من
                <input type="number" name="dailyMin" min={0} defaultValue={cfg.dailyMin} />
              </label>
              <label>
                إلى
                <input type="number" name="dailyMax" min={0} defaultValue={cfg.dailyMax} />
              </label>
            </div>
            <label>
              نص تشجيعي في المتجر
              <input type="text" name="shopIntro" defaultValue={cfg.shopIntro} />
            </label>
            <button className="btn" type="submit">
              💾 سجّل الإعدادات
            </button>
          </form>
        </section>

        {/* مجموعة الدخول */}
        <section className="card">
          <h2>🚪 مجموعة الدخول (رابط /join)</h2>
          <p className="muted">
            البوت يعطي كل عضو رابط دعوة خاص بيه، وبها تعرف شكون جاب شكون.
          </p>
          <p>
            الحالية: <b>{target ? `${target.title} — ${target.chatId}` : "ما فيه حتى مجموعة"}</b>
          </p>
          <form action={setJoinGroupForm} className="form">
            <label>
              آي دي المجموعة
              <input type="text" name="chatId" defaultValue={target?.chatId || ""} placeholder="-1001234567890" />
            </label>
            <label>
              الاسم (اختياري)
              <input type="text" name="title" defaultValue={target?.title || ""} />
            </label>
            <button className="btn btn-ghost" type="submit">
              🔗 ربط المجموعة
            </button>
          </form>
        </section>
      </div>

      {/* طلبات الجوائز */}
      <section className="card">
        <h2>📨 طلبات الجوائز ({pending.length} في الانتظار)</h2>
        {requests.length === 0 ? (
          <p className="muted">ما زال ما فيه حتى طلب.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>العضو</th>
                <th>الجائزة</th>
                <th>الثمن</th>
                <th>الحالة</th>
                <th>الوقت</th>
                <th>قرار</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id}>
                  <td>
                    {r.userName || r.userId}
                    <br />
                    <span className="muted small">{r.username ? `@${r.username}` : r.userId}</span>
                  </td>
                  <td>
                    {r.emoji} {r.rewardTitle}
                  </td>
                  <td>{r.cost}</td>
                  <td>
                    {r.status === "pending" ? "⏳ في الانتظار" : r.status === "approved" ? "✅ سلّمت" : "↩️ مرفوض"}
                  </td>
                  <td className="muted small">{dateText(r.at)}</td>
                  <td>
                    {r.status === "pending" ? (
                      <div className="row">
                        <form action={decideRewardForm}>
                          <input type="hidden" name="id" value={r.id} />
                          <input type="hidden" name="status" value="approved" />
                          <button className="btn btn-sm" type="submit">
                            ✅ سلّم
                          </button>
                        </form>
                        <form action={decideRewardForm}>
                          <input type="hidden" name="id" value={r.id} />
                          <input type="hidden" name="status" value="rejected" />
                          <button className="btn btn-sm btn-ghost" type="submit">
                            ↩️ رفض
                          </button>
                        </form>
                      </div>
                    ) : (
                      <span className="muted small">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* الجوائز */}
      <section className="card">
        <h2>🏷️ الجوائز</h2>
        <table className="table">
          <thead>
            <tr>
              <th></th>
              <th>الجائزة</th>
              <th>الثمن (نقطة)</th>
              <th>المخزون</th>
              <th>ظاهرة</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {[...rewards]
              .sort((a, b) => a.order - b.order)
              .map((r) => (
                <tr key={r.id}>
                  <td>{r.emoji}</td>
                  <td>
                    <b>{r.title}</b>
                    <br />
                    <span className="muted small">{r.desc}</span>
                  </td>
                  <td>{r.cost}</td>
                  <td>{r.stock === null ? "∞" : r.stock}</td>
                  <td>{r.active ? "✅" : "🚫"}</td>
                  <td>
                    <div className="row">
                      <a className="btn btn-sm btn-ghost" href={`/admin/rewards?edit=${r.id}`}>
                        ✏️ تعديل
                      </a>
                      <form action={deleteRewardForm}>
                        <input type="hidden" name="id" value={r.id} />
                        <button className="btn btn-sm btn-ghost" type="submit">
                          🗑
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>

        <h3>{editing ? `✏️ تعديل: ${editing.title}` : "➕ جائزة جديدة"}</h3>
        <form action={saveRewardForm} className="form">
          <input type="hidden" name="id" value={editing?.id || ""} />
          <div className="row">
            <label>
              إيموجي
              <input type="text" name="emoji" defaultValue={editing?.emoji || "🎁"} style={{ width: 80 }} />
            </label>
            <label>
              الاسم
              <input type="text" name="title" defaultValue={editing?.title || ""} required />
            </label>
            <label>
              الثمن (نقطة)
              <input type="number" name="cost" min={1} defaultValue={editing?.cost || 10} />
            </label>
          </div>
          <label>
            الوصف
            <input type="text" name="desc" defaultValue={editing?.desc || ""} />
          </label>
          <label>
            طريقة التسليم
            <input type="text" name="delivery" defaultValue={editing?.delivery || ""} placeholder="يتواصل معك المالك على الخاص" />
          </label>
          <div className="row">
            <label>
              المخزون (خالي = بلا حد)
              <input type="number" name="stock" min={0} defaultValue={editing?.stock ?? ""} />
            </label>
            <label>
              الترتيب
              <input type="number" name="order" min={1} defaultValue={editing?.order || rewards.length + 1} />
            </label>
            <label className="switch">
              <input type="checkbox" name="active" defaultChecked={editing ? editing.active : true} />
              <span>ظاهرة في البوت</span>
            </label>
          </div>
          <button className="btn" type="submit">
            💾 سجّل الجائزة
          </button>
        </form>
      </section>

      {/* الأرصدة */}
      <section className="card">
        <h2>💰 الأرصدة</h2>
        {top.length === 0 ? (
          <p className="muted">ما زال حتى واحد ما عندو نقاط.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>العضو</th>
                <th>النقاط</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {top.map((row, i) => (
                <tr key={row.userId}>
                  <td>
                    {["🥇", "🥈", "🥉"][i] || "▫️"} {nameOf(row.userId)}
                    <br />
                    <span className="muted small">{row.userId}</span>
                  </td>
                  <td>
                    <b>{balances[i]}</b>
                  </td>
                  <td>
                    <form action={setPointsForm} className="row">
                      <input type="hidden" name="userId" value={row.userId} />
                      <input
                        type="number"
                        name="points"
                        min={0}
                        defaultValue={balances[i]}
                        style={{ width: 90 }}
                      />
                      <button className="btn btn-sm btn-ghost" type="submit">
                        تعديل
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <h3>➕ زيد / نقص نقاط بآي دي</h3>
        <form action={grantPointsForm} className="row">
          <input type="text" name="userId" placeholder="آي دي المستخدم (123456789)" />
          <input type="number" name="amount" placeholder="مثال: 50 أو -10" />
          <button className="btn btn-ghost" type="submit">
            طبّق
          </button>
        </form>
      </section>
    </>
  );
}
