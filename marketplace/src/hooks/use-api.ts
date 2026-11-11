"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api-client";
export function useApi<T>(url: string | null, pollMs?: number) {
  const [data, setData] = useState<T | null>(null); const [error, setError] = useState<unknown>(null); const [loading, setLoading] = useState(Boolean(url)); const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    if (!url) return;
    const controller = new AbortController(); let disposed = false; let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async (initial = false) => {
      if (initial && !disposed) setLoading(true);
      try { const result = await apiFetch<T>(url, { signal: controller.signal }); if (!disposed) { setData(result); setError(null); } }
      catch (cause) { if (!disposed) setError(cause); }
      finally { if (!disposed) { setLoading(false); if (pollMs && document.visibilityState === "visible") timer = setTimeout(() => void load(), pollMs); } }
    };
    void load(true);
    return () => { disposed = true; controller.abort(); clearTimeout(timer); };
  }, [url, pollMs, version]);
  return { data, error, loading, refresh };
}
export function useDebounced<T>(value: T, delay = 220) { const [debounced, setDebounced] = useState(value); useEffect(() => { const timer = setTimeout(() => setDebounced(value), delay); return () => clearTimeout(timer); }, [value, delay]); return debounced; }
