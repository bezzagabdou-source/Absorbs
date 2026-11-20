import { recordVisit } from "@/lib/server/store";

export async function POST() {
  try {
    await recordVisit();
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Visitor counter error", error);
    return Response.json({ error: "تعذر تسجيل الزيارة" }, { status: 500 });
  }
}
