import { requireAdmin } from "@/lib/auth";
import { listClaims } from "@/lib/claims";
import { dateText } from "../ui";

export const dynamic = "force-dynamic";

export default async function ClaimsPage() {
  await requireAdmin();
  const claims = await listClaims(200);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>الجوائز المسلّمة</h1>
          <p className="muted">
            سجل كامل بكل حساب تم تسليمه — مفيد لو الفائز ضيّع بياناته أو حصل نزاع.
          </p>
        </div>
      </div>

      <div className="card">
        {claims.length === 0 ? (
          <p className="muted">لا توجد جوائز مسلّمة بعد.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>المستخدم</th>
                  <th>المسابقة</th>
                  <th>الإيميل</th>
                  <th>كلمة السر</th>
                  <th>الوقت</th>
                </tr>
              </thead>
              <tbody>
                {claims.map((claim, index) => (
                  <tr key={`${claim.contestId}-${claim.userId}`}>
                    <td className="muted">{index + 1}</td>
                    <td>
                      {claim.userName}
                      <div className="mono small muted">{claim.userId}</div>
                    </td>
                    <td>
                      {claim.contestTitle}
                      <div className="mono small muted">{claim.contestId}</div>
                    </td>
                    <td className="mono small">{claim.email}</td>
                    <td className="mono small">{claim.password}</td>
                    <td className="small muted">{dateText(claim.at)}</td>
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
