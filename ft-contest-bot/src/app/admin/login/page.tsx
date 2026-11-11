import { redirect } from "next/navigation";
import { hasAdminPassword, isAuthenticated } from "@/lib/auth";
import { loginAction } from "../actions";
import { Flash } from "../ui";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; err?: string }>;
}) {
  if (await isAuthenticated()) redirect("/admin");
  const setup = !(await hasAdminPassword());
  const { ok, err } = await searchParams;

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="brand" style={{ marginBottom: 18 }}>
          <span className="brand-mark">🏆</span>
          <span>
            مسابقات FT
            <small>لوحة التحكم</small>
          </span>
        </div>

        <h1>{setup ? "إنشاء كلمة مرور الأدمن" : "تسجيل الدخول"}</h1>
        <p className="small">
          {setup
            ? "أول دخول — اختر كلمة مرور قوية للوحة التحكم. تُخزَّن مشفّرة (scrypt) ولا يمكن استرجاعها."
            : "ادخل بكلمة المرور الخاصة بك لإدارة البوت والمسابقات."}
        </p>

        <Flash ok={ok} err={err} />

        <form action={loginAction}>
          <label className="field">
            <span>كلمة المرور</span>
            <input
              type="password"
              name="password"
              required
              minLength={6}
              autoFocus
              placeholder="••••••••"
            />
          </label>

          {setup ? (
            <label className="field">
              <span>تأكيد كلمة المرور</span>
              <input type="password" name="confirm" required minLength={6} placeholder="••••••••" />
            </label>
          ) : null}

          <button className="btn btn-primary btn-block" type="submit">
            {setup ? "إنشاء ودخول" : "دخول"}
          </button>
        </form>

        <p className="small muted" style={{ marginTop: 16, textAlign: "center" }}>
          محمي بجلسة موقّعة (HMAC) — صالحة لمدة 7 أيام
        </p>
      </div>
    </div>
  );
}
