import { requireAdmin } from "@/lib/auth";
import { listRecentUsers, usersCount } from "@/lib/users";
import { dateText } from "../ui";

export const dynamic = "force-dynamic";

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireAdmin();
  const { q } = await searchParams;
  const [users, total] = await Promise.all([listRecentUsers(400), usersCount()]);
  const query = (q || "").trim().toLowerCase();
  const filtered = query
    ? users.filter(
        (u) =>
          u.id.includes(query) ||
          u.firstName.toLowerCase().includes(query) ||
          u.username.toLowerCase().includes(query),
      )
    : users;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>المستخدمون</h1>
          <p className="muted">
            إجمالي {total} مستخدم — يُعرض آخر {users.length}.
          </p>
        </div>
        <form className="row" method="get">
          <input
            type="text"
            name="q"
            defaultValue={q || ""}
            placeholder="ابحث بالاسم أو الآي دي أو اليوزر"
            style={{ width: 260 }}
          />
          <button className="btn btn-ghost btn-sm" type="submit">
            بحث
          </button>
        </form>
      </div>

      <div className="card">
        {filtered.length === 0 ? (
          <p className="muted">لا يوجد مستخدمون مطابقون.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>الاسم</th>
                  <th>اليوزر</th>
                  <th>الآي دي</th>
                  <th>تاريخ الدخول</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((user, index) => (
                  <tr key={user.id}>
                    <td className="muted">{index + 1}</td>
                    <td>{user.firstName}</td>
                    <td className="small">
                      {user.username ? (
                        <a href={`https://t.me/${user.username}`} target="_blank" rel="noreferrer">
                          @{user.username}
                        </a>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td className="mono small">
                      <a href={`tg://user?id=${user.id}`}>{user.id}</a>
                    </td>
                    <td className="small muted">{dateText(user.joinedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
