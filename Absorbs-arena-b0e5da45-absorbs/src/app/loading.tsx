import { Logo } from "@/components/logo";

/** Shown while any route loads — never a white page. */
export default function Loading() {
  return (
    <div className="grid min-h-[100dvh] place-items-center">
      <div className="flex flex-col items-center gap-5">
        <div className="relative grid h-20 w-20 place-items-center">
          <span className="absolute inset-0 animate-ping rounded-full bg-brand-400/20" />
          <span
            className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-amber-300 border-e-brand-300"
            style={{ animationDuration: "1.2s" }}
          />
          <Logo size={44} withText={false} />
        </div>
        <p className="text-sm font-bold text-slate-400">جارٍ التحميل…</p>
      </div>
    </div>
  );
}
