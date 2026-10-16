/**
 * Public NEXUS CODE — the same studio as /app/code, but open without an account
 * so a visitor can watch a complete project being written before signing up.
 * Guests get the full build + inline preview; saving to the vault needs a login.
 */
import Studio from "@/app/app/code/page";

export const metadata = {
  title: "NEXUS CODE — استوديو البناء الضخم",
  description: "اكتب وصف المنتج، والمحرّك يكتب المشروع كاملًا: صفحات، بيانات، وحدات، تصميم، معاينة مباشرة ورابط.",
};

export default function PublicCodePage() {
  return <Studio />;
}
