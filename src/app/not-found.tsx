import Link from "next/link";
import { Logo } from "@/components/logo";

export default function NotFound() {
  return (
    <div className="grid min-h-[100dvh] place-items-center px-6 text-center">
      <div className="max-w-sm">
        <div className="mb-6 flex justify-center">
          <Logo size={56} withText={false} />
        </div>
        <p className="text-6xl font-black tracking-tight text-brand-300">404</p>
        <h1 className="mt-3 text-xl font-black text-white">هذه الصفحة غير موجودة</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          ربما تغيّر الرابط أو حُذفت الصفحة. ارجع إلى برق وكمّل من حيث توقفت.
        </p>
        <Link href="/app" className="btn-primary mt-7 px-7 py-3 text-sm">
          العودة إلى برق
        </Link>
      </div>
    </div>
  );
}
