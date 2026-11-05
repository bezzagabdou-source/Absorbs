import Link from "next/link";
import { after } from "next/server";
import { currentOrigin, ensureBotReady } from "@/lib/botSetup";
import { isAuthenticated } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { storageInfo } from "@/lib/store";
import { logoutAction } from "./actions";
import AdminNav from "./nav";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const authed = await isAuthenticated();
  if (!authed) return <>{children}</>;

  const [settings, storage] = [await getSettings(), storageInfo()];
  const origin = await currentOrigin();
  after(async () => {
    await ensureBotReady({ origin }).catch(() => undefined);
  });

  return (
    <div className="admin-shell">
      <aside className="sidebar">
        <Link href="/admin" className="brand">
          <span className="brand-mark">🏆</span>
          <span>
            مسابقات FT
            <small>لوحة التحكم</small>
          </span>
        </Link>

        <AdminNav />

        <div className="sidebar-foot">
          <div className="small">
            🤖 البوت:{" "}
            {settings.botUsername ? (
              <a href={`https://t.me/${settings.botUsername}`} target="_blank" rel="noreferrer">
                @{settings.botUsername}
              </a>
            ) : (
              <span className="muted">غير مربوط</span>
            )}
          </div>
          <div className="small">
            💾 التخزين: <span className="muted">{storage.backend}</span>
          </div>
          {!storage.configured ? (
            <div className="small" style={{ color: "#ffd28a" }}>
              ⚠️ لا توجد قاعدة بيانات — البيانات مؤقتة
            </div>
          ) : null}
          <Link className="btn btn-ghost btn-sm" href="/" style={{ marginTop: 6 }}>
            🌐 الموقع العام
          </Link>
          <Link className="btn btn-ghost btn-sm" href="/status">
            🩺 تشخيص البوت
          </Link>
          <form action={logoutAction}>
            <button className="btn btn-danger btn-sm btn-block" type="submit">
              🚪 خروج
            </button>
          </form>
        </div>
      </aside>
      <main className="admin-main">{children}</main>
    </div>
  );
}
