"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RotateCcw } from "lucide-react";
import { reloadOnceForChunkError } from "@/components/chunk-guard";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
    // an old deployment's JS files are gone: one automatic reload fixes it
    reloadOnceForChunkError(`${error?.name ?? ""} ${error?.message ?? ""}`);
  }, [error]);
  return (
    <div className="grid min-h-[100dvh] place-items-center px-6 text-center">
      <div className="max-w-sm">
        <p className="text-5xl">⚡</p>
        <h1 className="mt-4 text-xl font-black text-white">صار خلل بسيط</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          لا تقلق، بياناتك محفوظة. جرّب مرة أخرى أو ارجع للرئيسية.
        </p>
        <div className="mt-7 flex justify-center gap-2.5">
          <button type="button" onClick={reset} className="btn-primary px-6 py-3 text-sm">
            <RotateCcw className="h-4 w-4" />
            إعادة المحاولة
          </button>
          <Link href="/app" className="btn-ghost px-6 py-3 text-sm">
            الرئيسية
          </Link>
        </div>
      </div>
    </div>
  );
}
