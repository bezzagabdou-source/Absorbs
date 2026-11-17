"use client";

import { useState } from "react";
import { Badge, Btn, Card, Empty, Spinner, dateTime, useApi } from "@/components/ui";

type Log = {
  id: number;
  level: string;
  action: string;
  actor: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
};

const LEVELS = [
  { key: "all", label: "الكل" },
  { key: "success", label: "🟢 نجاح" },
  { key: "info", label: "⚪️ معلومة" },
  { key: "warn", label: "🟡 تحذير" },
  { key: "error", label: "🔴 خطأ" },
];

const TONE: Record<string, "emerald" | "red" | "amber" | "slate"> = {
  success: "emerald",
  error: "red",
  warn: "amber",
  info: "slate",
};

export default function LogsPage(): React.ReactElement {
  const [level, setLevel] = useState("all");
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useApi<{ ok: boolean; rows: Log[]; total: number; limit: number }>(
    `logs?level=${level}&page=${page}&limit=40`,
  );

  const rows = data?.rows ?? [];
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / (data?.limit ?? 40)));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-emerald-950">سجل النشاطات</h1>
          <p className="mt-1 text-xs text-emerald-900/65">كل عملية في المتجر مسجّلة هنا (طلبات، تعديلات، دخول، ذكاء اصطناعي…)</p>
        </div>
        <Btn variant="ghost" onClick={reload}>
          🔄 تحديث
        </Btn>
      </div>

      <Card>
        <div className="flex flex-wrap gap-2">
          {LEVELS.map((l) => (
            <button
              key={l.key}
              onClick={() => {
                setLevel(l.key);
                setPage(1);
              }}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                level === l.key ? "bg-emerald-500 text-black" : "border border-emerald-900/10 bg-white/70 text-emerald-900/85 hover:bg-white/85"
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>

        {loading && !data ? (
          <Spinner />
        ) : error ? (
          <p className="py-6 text-sm text-rose-600">{error}</p>
        ) : rows.length === 0 ? (
          <Empty icon="📜" title="لا سجلات" />
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="data">
              <thead>
                <tr>
                  <th>الحدث</th>
                  <th>المستوى</th>
                  <th>الفاعل</th>
                  <th>التفاصيل</th>
                  <th>التاريخ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((l) => (
                  <tr key={l.id}>
                    <td className="whitespace-nowrap font-mono text-[0.72rem] text-emerald-700">{l.action}</td>
                    <td>
                      <Badge tone={TONE[l.level] ?? "slate"}>{l.level}</Badge>
                    </td>
                    <td className="text-xs text-emerald-900/65">{l.actor ?? "—"}</td>
                    <td className="max-w-[26rem] truncate text-[0.68rem] text-emerald-900/55" dir="ltr">
                      {l.details ? JSON.stringify(l.details) : "—"}
                    </td>
                    <td className="whitespace-nowrap text-[0.66rem] text-emerald-900/55">{dateTime(l.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pages > 1 && (
          <div className="mt-4 flex items-center justify-center gap-2">
            <Btn variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              ← السابق
            </Btn>
            <span className="text-xs text-emerald-900/65">
              {page} / {pages}
            </span>
            <Btn variant="ghost" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
              التالي →
            </Btn>
          </div>
        )}
      </Card>
    </div>
  );
}
