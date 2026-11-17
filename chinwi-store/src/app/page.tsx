import { redirect } from "next/navigation";
import { getSetting } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * لا يوجد موقع مصغّر: الجذر يحوّل مباشرة إلى البوت.
 * لوحة التحكم تبقى على /admin كما هي.
 */
export default async function Home(): Promise<void> {
  let bot = "chinwistorebot";
  try {
    const saved = await getSetting<string>("bot_username");
    if (saved) bot = saved;
  } catch {
    /* قاعدة البيانات غير متصلة → نستخدم اليوزرنيم الافتراضي */
  }
  redirect(`https://t.me/${bot}`);
}
