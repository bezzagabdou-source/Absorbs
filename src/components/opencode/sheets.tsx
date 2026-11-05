"use client";

import {
  Check,
  Clock,
  Cpu,
  ExternalLink,
  FolderGit2,
  MessageSquare,
  Plus,
  RefreshCw,
  RotateCw,
  Search,
  Server,
  ShieldCheck,
  ShieldAlert,
  Sparkles,
  Trash2,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { ModelInfo, ServerStatus, Session } from "@/lib/opencode/types";
import {
  Badge,
  IconButton,
  Sheet,
  Spinner,
  cn,
  formatContext,
  formatRelative,
} from "./ui";

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export function SessionsSheet({
  open,
  onClose,
  sessions,
  activeId,
  loading,
  onSelect,
  onNew,
  onDelete,
}: {
  open: boolean;
  onClose: () => void;
  sessions: Session[];
  activeId: string | null;
  loading: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}) {
  const [confirmId, setConfirmId] = useState<string | null>(null);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="المحادثات"
      subtitle={`${sessions.length} جلسة على السيرفر`}
      footer={
        <button
          type="button"
          onClick={onNew}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-br from-[#e8946f] to-[#c4623f] px-3 py-2.5 text-[12px] font-semibold text-white shadow-lg shadow-orange-950/20 transition hover:brightness-110"
        >
          <Plus className="size-4" />
          محادثة جديدة
        </button>
      }
    >
      {loading && sessions.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-10 text-[11px] text-slate-500">
          <Spinner className="size-4" /> جارٍ تحميل الجلسات…
        </div>
      ) : sessions.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <MessageSquare className="size-6 text-slate-600" />
          <p className="text-[12px] text-slate-400">لا توجد جلسات بعد</p>
          <p className="text-[10.5px] text-slate-600">ابدأ محادثة جديدة من الزر أدناه</p>
        </div>
      ) : (
        <ul className="space-y-1.5">
          {sessions.map((session) => {
            const active = session.id === activeId;
            const name = session.title?.trim() || "محادثة جديدة";
            const directory = session.directory?.split("/").filter(Boolean).pop();
            return (
              <li key={session.id}>
                <div
                  className={cn(
                    "group flex items-center gap-2 rounded-xl border px-2.5 py-2 transition",
                    active
                      ? "border-cyan-400/25 bg-cyan-400/[0.06]"
                      : "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onSelect(session.id)}
                    className="min-w-0 flex-1 text-start"
                  >
                    <div className="flex items-center gap-1.5">
                      {active && <span className="size-1.5 shrink-0 rounded-full bg-cyan-400" />}
                      <p
                        className={cn(
                          "truncate text-[12px] font-medium",
                          active ? "text-cyan-100" : "text-slate-200",
                        )}
                      >
                        {name}
                      </p>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[9.5px] text-slate-500">
                      <span className="inline-flex items-center gap-0.5">
                        <Clock className="size-2.5" />
                        {formatRelative(session.time?.updated)}
                      </span>
                      {directory && (
                        <span className="inline-flex min-w-0 items-center gap-0.5">
                          <FolderGit2 className="size-2.5 shrink-0" />
                          <span className="truncate">{directory}</span>
                        </span>
                      )}
                      <span dir="ltr" className="truncate font-mono text-[8.5px] text-slate-600">
                        {session.id}
                      </span>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirmId === session.id) {
                        onDelete(session.id);
                        setConfirmId(null);
                      } else {
                        setConfirmId(session.id);
                      }
                    }}
                    title={confirmId === session.id ? "اضغط مرة أخرى للحذف" : "حذف الجلسة"}
                    aria-label="حذف الجلسة"
                    className={cn(
                      "inline-flex size-7 shrink-0 items-center justify-center rounded-lg transition",
                      confirmId === session.id
                        ? "bg-rose-500/20 text-rose-300"
                        : "text-slate-600 hover:bg-rose-500/10 hover:text-rose-300",
                    )}
                  >
                    {confirmId === session.id ? (
                      <Check className="size-3.5" />
                    ) : (
                      <Trash2 className="size-3.5" />
                    )}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

export function ModelsSheet({
  open,
  onClose,
  models,
  connected,
  selected,
  loading,
  error,
  onSelect,
  onRefresh,
}: {
  open: boolean;
  onClose: () => void;
  models: ModelInfo[];
  connected: string[];
  selected: { providerID: string; modelID: string } | null;
  loading: boolean;
  error?: string;
  onSelect: (model: { providerID: string; modelID: string } | null) => void;
  onRefresh: () => void;
}) {
  const [query, setQuery] = useState("");
  const connectedSet = useMemo(() => new Set(connected), [connected]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return models;
    return models.filter((model) =>
      `${model.name} ${model.providerName} ${model.modelID} ${model.providerID}`
        .toLowerCase()
        .includes(needle),
    );
  }, [models, query]);

  const groups = useMemo(() => {
    const map = new Map<string, { name: string; models: ModelInfo[] }>();
    for (const model of filtered) {
      const key = model.providerID;
      if (!map.has(key)) {
        map.set(key, { name: model.providerName, models: [] });
      }
      map.get(key)!.models.push(model);
    }
    return [...map.entries()].sort(([a], [b]) => {
      const aConnected = connectedSet.has(a) ? 0 : 1;
      const bConnected = connectedSet.has(b) ? 0 : 1;
      return aConnected - bConnected;
    });
  }, [filtered, connectedSet]);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="النموذج"
      subtitle="اختر نموذجاً لهذه المحادثة — أو اتركه تلقائياً"
      footer={
        <button
          type="button"
          onClick={() => onSelect(null)}
          className={cn(
            "inline-flex w-full items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-[12px] font-medium transition",
            selected === null
              ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-100"
              : "border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.06]",
          )}
        >
          {selected === null ? <Check className="size-4" /> : <Cpu className="size-4" />}
          تلقائي (افتراضي السيرفر)
        </button>
      }
    >
      <div className="sticky top-0 z-10 -mx-1 bg-[#0c0d12]/95 px-1 pb-2 backdrop-blur">
        <div className="relative">
          <Search className="pointer-events-none absolute inset-y-0 right-2.5 my-auto size-3.5 text-slate-500" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ابحث عن نموذج أو مزود…"
            className="w-full rounded-xl border border-white/10 bg-black/25 py-2 pe-8 ps-3 text-[12px] text-slate-200 placeholder:text-slate-600 focus:border-cyan-400/30 focus:outline-none"
          />
        </div>
        <div className="mt-1.5 flex items-center justify-between gap-2 px-0.5">
          <p className="text-[9.5px] text-slate-500">
            {filtered.length} نموذج
            {connected.length > 0 && ` · متصل: ${connected.join(", ")}`}
          </p>
          <button
            type="button"
            onClick={onRefresh}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[9.5px] text-slate-500 transition hover:bg-white/[0.05] hover:text-slate-300"
          >
            <RefreshCw className="size-2.5" /> تحديث
          </button>
        </div>
      </div>

      {loading && models.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-10 text-[11px] text-slate-500">
          <Spinner className="size-4" /> جارٍ تحميل النماذج…
        </div>
      ) : error && models.length === 0 ? (
        <div className="rounded-xl border border-rose-400/20 bg-rose-500/[0.06] p-3 text-[11px] leading-5 text-rose-200">
          {error}
        </div>
      ) : groups.length === 0 ? (
        <div className="py-10 text-center text-[11px] text-slate-500">لا توجد نتائج مطابقة</div>
      ) : (
        <div className="space-y-3">
          {groups.map(([providerID, group]) => (
            <div key={providerID}>
              <div className="sticky top-[70px] z-[5] -mx-1 flex items-center gap-1.5 bg-[#0c0d12]/95 px-1 py-1 backdrop-blur">
                <span className="text-[10px] font-semibold text-slate-300">{group.name}</span>
                {connectedSet.has(providerID) && <Badge tone="emerald">متصل</Badge>}
                <span className="text-[9px] text-slate-600">{group.models.length}</span>
              </div>
              <ul className="space-y-1">
                {group.models.map((model) => {
                  const active =
                    selected?.providerID === model.providerID &&
                    selected?.modelID === model.modelID;
                  return (
                    <li key={`${model.providerID}/${model.modelID}`}>
                      <button
                        type="button"
                        onClick={() => onSelect({ providerID: model.providerID, modelID: model.modelID })}
                        className={cn(
                          "flex w-full items-start gap-2 rounded-xl border px-2.5 py-2 text-start transition",
                          active
                            ? "border-cyan-400/30 bg-cyan-400/[0.07]"
                            : "border-white/[0.05] bg-white/[0.015] hover:bg-white/[0.04]",
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1">
                            <span
                              className={cn(
                                "truncate text-[11.5px] font-medium",
                                active ? "text-cyan-100" : "text-slate-200",
                              )}
                            >
                              {model.name}
                            </span>
                            {model.isDefault && <Badge tone="cyan">افتراضي</Badge>}
                            {model.free && <Badge tone="emerald">مجاني</Badge>}
                            {model.reasoning && <Badge tone="violet">تفكير</Badge>}
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[9px] text-slate-500">
                            <span dir="ltr" className="font-mono">
                              {model.modelID}
                            </span>
                            {model.contextLimit && (
                              <span>· سياق {formatContext(model.contextLimit)}</span>
                            )}
                            {model.toolcall && <span>· أدوات</span>}
                          </div>
                        </div>
                        {active && <Check className="mt-0.5 size-3.5 shrink-0 text-cyan-300" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Server info
// ---------------------------------------------------------------------------

export function InfoSheet({
  open,
  onClose,
  status,
  sessionId,
  modelLabel,
  sseState,
  restarting,
  onRestart,
  onRefresh,
  onCopy,
}: {
  open: boolean;
  onClose: () => void;
  status: ServerStatus | null;
  sessionId: string | null;
  modelLabel: string;
  sseState: "connecting" | "live" | "offline";
  restarting: boolean;
  onRestart: () => void;
  onRefresh: () => void;
  onCopy: () => void;
}) {
  const connected = status?.connected ?? false;
  const rows: { label: string; value: string; mono?: boolean }[] = [
    { label: "المنفذ", value: status?.baseUrl || "—", mono: true },
    { label: "الإصدار", value: status?.version ? `v${status.version}` : "—" },
    { label: "المشروع", value: status?.project || "—", mono: true },
    { label: "الجلسات", value: String(status?.sessions ?? 0) },
    { label: "الجلسة الحالية", value: sessionId || "—", mono: true },
    { label: "النموذج", value: modelLabel, mono: true },
  ];

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="حالة السيرفر"
      subtitle="OpenCode Server + Next.js proxy"
      footer={
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onRefresh}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-[11.5px] font-medium text-slate-300 transition hover:bg-white/[0.06]"
          >
            <RefreshCw className="size-3.5" /> فحص الحالة
          </button>
          <button
            type="button"
            onClick={onCopy}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-[11.5px] font-medium text-slate-300 transition hover:bg-white/[0.06]"
          >
            نسخ المعلومات
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        <div
          className={cn(
            "rounded-2xl border p-3",
            connected
              ? "border-emerald-400/20 bg-emerald-500/[0.05]"
              : "border-rose-400/20 bg-rose-500/[0.05]",
          )}
        >
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "flex size-8 items-center justify-center rounded-xl",
                connected
                  ? "bg-emerald-400/10 text-emerald-300"
                  : "bg-rose-400/10 text-rose-300",
              )}
            >
              <Server className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-semibold text-white">
                {connected ? "السيرفر متصل" : "السيرفر غير متصل"}
              </p>
              <p className="truncate text-[10px] text-slate-500">
                {connected
                  ? `آخر فحص ${formatRelative(Date.parse(status?.checkedAt ?? ""))}`
                  : status?.error || "شغّل السيرفر ثم أعد الفحص"}
              </p>
            </div>
            {connected ? (
              <Wifi className="size-4 text-emerald-400" />
            ) : (
              <WifiOff className="size-4 text-rose-400" />
            )}
          </div>
          {!connected && (
            <button
              type="button"
              onClick={onRestart}
              disabled={restarting}
              className="mt-2.5 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-3 py-2 text-[11.5px] font-semibold text-emerald-200 transition hover:bg-emerald-400/15 disabled:opacity-50"
            >
              {restarting ? <Spinner className="size-3.5" /> : <RotateCw className="size-3.5" />}
              {restarting ? "جارٍ إعادة التشغيل…" : "إعادة تشغيل السيرفر"}
            </button>
          )}
        </div>

        <div className="overflow-hidden rounded-2xl border border-white/[0.07]">
          {rows.map((row, index) => (
            <div
              key={row.label}
              className={cn(
                "flex items-start justify-between gap-3 px-3 py-2",
                index > 0 && "border-t border-white/[0.05]",
              )}
            >
              <span className="shrink-0 text-[10.5px] text-slate-500">{row.label}</span>
              <span
                dir={row.mono ? "ltr" : "rtl"}
                className={cn(
                  "min-w-0 break-all text-end text-[10.5px] text-slate-300",
                  row.mono && "font-mono text-[10px]",
                )}
              >
                {row.value}
              </span>
            </div>
          ))}
          <div className="flex items-center justify-between gap-3 border-t border-white/[0.05] px-3 py-2">
            <span className="text-[10.5px] text-slate-500">قناة الأحداث</span>
            <span className="inline-flex items-center gap-1 text-[10.5px] text-slate-300">
              {sseState === "live" ? (
                <>
                  <span className="size-1.5 rounded-full bg-emerald-400" /> مباشرة
                </>
              ) : sseState === "connecting" ? (
                <>
                  <Spinner className="size-3" /> جارٍ الاتصال
                </>
              ) : (
                <>
                  <span className="size-1.5 rounded-full bg-rose-400" /> غير متصلة
                </>
              )}
            </span>
          </div>
        </div>

        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3">
          <div className="flex items-center gap-1.5">
            {status?.hasAuth ? (
              <ShieldCheck className="size-3.5 text-emerald-400" />
            ) : (
              <ShieldAlert className="size-3.5 text-amber-400" />
            )}
            <p className="text-[11px] font-medium text-slate-200">
              {status?.hasAuth ? "السيرفر محمي بـ Basic Auth" : "السيرفر غير محمي بكلمة مرور"}
            </p>
          </div>
          <p className="mt-1 text-[10px] leading-5 text-slate-500">
            {status?.hasAuth
              ? "كلمة المرور محفوظة في .opencode/server-auth.json (داخل الحاوية) ولا تُرسل إلى المتصفح."
              : "شغّل سكربت التشغيل لتوليد كلمة مرور وحماية المنفذ 4000."}
          </p>
        </div>

        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3">
          <div className="flex items-center gap-1.5">
            <Sparkles className="size-3.5 text-cyan-300" />
            <p className="text-[11px] font-medium text-slate-200">من الهاتف</p>
          </div>
          <p className="mt-1 text-[10px] leading-5 text-slate-500">
            افتح رابط المنفذ 3000 (Dashboard) من Codespaces وأضفه إلى الشاشة الرئيسية. هذه الواجهة
            تتحدث مع السيرفر عبر proxy داخلي، لذلك لا تحتاج لفتح المنفذ 4000 في المتصفح.
          </p>
          <a
            href="https://opencode.ai/docs/server/"
            target="_blank"
            rel="noreferrer noopener"
            className="mt-2 inline-flex items-center gap-1 text-[10px] font-medium text-cyan-300 hover:text-cyan-200"
          >
            توثيق OpenCode Server <ExternalLink className="size-2.5" />
          </a>
        </div>

        <div className="flex items-center gap-1.5">
          <IconButton label="إعادة تشغيل السيرفر" variant="solid" onClick={onRestart} disabled={restarting}>
            <RotateCw className={cn("size-4", restarting && "animate-spin")} />
          </IconButton>
          <p className="text-[10px] leading-4 text-slate-600">
            إعادة التشغيل توقف السيرفر ثم تشغّله من جديد مع نفس كلمة المرور.
          </p>
        </div>
      </div>
    </Sheet>
  );
}
