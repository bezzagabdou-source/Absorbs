import type { ApiErrorBody } from "./marketplace-data";
import { translate, type TranslationKey } from "./i18n/dictionaries";
import type { Locale } from "./i18n/config";
export class ApiClientError extends Error {
  constructor(public code: string, public status: number, public fields: Record<string, string[]> = {}) { super(code); }
}
export async function apiFetch<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  let response: Response;
  try { response = await fetch(url, { ...rest, credentials: "same-origin", cache: "no-store", headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...rest.headers }, ...(json !== undefined ? { body: JSON.stringify(json) } : {}) }); }
  catch (error) { if (error instanceof DOMException && error.name === "AbortError") throw error; throw new ApiClientError("service_unavailable", 0); }
  const body = await response.json().catch(() => null) as (ApiErrorBody & T) | null;
  if (!response.ok) throw new ApiClientError(body?.error?.code ?? "unknown_error", response.status, body?.error?.fields);
  if (body === null) throw new ApiClientError("invalid_json", 500);
  return body;
}
export function errorMessage(error: unknown, locale: Locale): string {
  const code = error instanceof ApiClientError ? error.code : "unknown_error";
  return translate(locale, code as TranslationKey) === code ? translate(locale, "unknown_error") : translate(locale, code as TranslationKey);
}
export function fieldErrors(error: unknown, locale: Locale): string[] {
  if (!(error instanceof ApiClientError)) return [];
  return Object.entries(error.fields ?? {}).map(([field, messages]) => `${translate(locale, field as TranslationKey) === field ? field : translate(locale, field as TranslationKey)}: ${messages.map((m) => translate(locale, m as TranslationKey) === m ? translate(locale, "invalid_input") : translate(locale, m as TranslationKey)).join(", ")}`);
}
