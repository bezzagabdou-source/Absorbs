import { getStoreData } from "@/lib/server/store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(await getStoreData(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Store data error", error);
    return Response.json({ error: "تعذر تحميل بيانات المتجر" }, { status: 500 });
  }
}
