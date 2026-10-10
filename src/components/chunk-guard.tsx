"use client";

import { useEffect } from "react";

const KEY = "nexus_chunk_reload";
const CHUNK_RE = /ChunkLoadError|Loading chunk [\w-]+ failed|Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i;

/** Reloads the page ONCE (per minute) when a new deployment removed the old JS files — instead of a white screen. */
export function reloadOnceForChunkError(message: string): boolean {
  if (!CHUNK_RE.test(message)) return false;
  try {
    const last = Number(sessionStorage.getItem(KEY) || 0);
    if (Date.now() - last < 60_000) return false; // already tried: let the error page show
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    /* private mode: still try once */
  }
  window.location.reload();
  return true;
}

export function ChunkGuard() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => void reloadOnceForChunkError(`${e.message ?? ""} ${e.error?.name ?? ""}`);
    const onRejection = (e: PromiseRejectionEvent) => {
      const r = e.reason as { name?: string; message?: string } | string | undefined;
      void reloadOnceForChunkError(typeof r === "string" ? r : `${r?.name ?? ""} ${r?.message ?? ""}`);
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
