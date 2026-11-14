/**
 * 🛡️ نقطة الدخول للحراسة: Next.js كيتسّدعى `register()` مرة واحدة لكل نسخة.
 *
 * هادشي كيضمن أن أي `unhandledRejection` أو `uncaughtException` كيتسجّل في سجل
 * أخطاء اللوحة، والبوت ما كيطفيش بسبب خطأ واحد في تحديث أو نداء خارجي.
 *
 * ⚠️ ما كنديروش أي عمل ثقيل هنا (ولا نداء شبكة): Vercel كيستدعيها قبل كل طلب
 * في بعض الأحيان، ولازم تبقى سريعة.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { installProcessGuards } = await import("./src/lib/errors");
  installProcessGuards();
}
