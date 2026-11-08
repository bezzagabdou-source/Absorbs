/** تصدير نسخة احتياطية كاملة (JSON) أو CSV للمستخدمين. */
import { guard, bad } from "@/lib/api";
import { loadDB } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const g = await guard();
  if (g) return g;
  const db = await loadDB();
  const url = new URL(req.url);
  const format = url.searchParams.get("format") ?? "json";
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");

  if (format === "csv") {
    const rows = [
      ["id", "name", "username", "points", "earned", "spent", "refs", "refsActive", "joined", "lastSeen", "banned", "vip"],
      ...Object.values(db.users).map((u) => [
        u.id,
        [u.firstName, u.lastName].filter(Boolean).join(" "),
        u.username ?? "",
        u.points,
        u.totalEarned,
        u.totalSpent,
        u.refCount,
        u.refActive,
        u.joinedAt,
        u.lastSeenAt,
        u.banned ? "1" : "0",
        u.vip ? "1" : "0",
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    return new Response("\uFEFF" + csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="mx-users-${stamp}.csv"`,
      },
    });
  }

  if (format !== "json") return bad("format غير مدعوم");
  return new Response(JSON.stringify(db, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="mx-backup-${stamp}.json"`,
    },
  });
}
