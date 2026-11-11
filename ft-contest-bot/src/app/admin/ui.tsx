export function Flash({ ok, err }: { ok?: string; err?: string }) {
  if (!ok && !err) return null;
  return (
    <>
      {ok ? <div className="alert alert-ok">✅ {ok}</div> : null}
      {err ? <div className="alert alert-err">⚠️ {err}</div> : null}
    </>
  );
}

export function StatusBadge({ status }: { status: string }) {
  if (status === "active") return <span className="badge badge-active">🟢 مفتوحة</span>;
  if (status === "ended") return <span className="badge badge-ended">🔴 منتهية</span>;
  return <span className="badge badge-draft">⚪️ مسودة</span>;
}

export function timeAgo(ts?: number): string {
  if (!ts) return "—";
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "الآن";
  if (minutes < 60) return `قبل ${minutes} دقيقة`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `قبل ${hours} ساعة`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `قبل ${days} يوم`;
  return new Date(ts).toLocaleDateString("ar");
}

export function dateText(ts?: number): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("ar-EG", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
