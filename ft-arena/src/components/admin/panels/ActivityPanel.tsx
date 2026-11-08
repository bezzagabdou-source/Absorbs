"use client";
import { useCallback, useEffect, useState } from "react";
import { Empty, Spinner, api, relTime, toast } from "../ui";

type A = { at: string; actor: string; title: string; detail?: string; icon?: string };
type L = { at: string; prompt: string; reply: string; provider: string; actions: { name: string; ok: boolean; detail?: string }[] };

const ACTOR: Record<string, string> = { admin: "الأدمن", bot: "البوت", ai: "الذكاء", system: "النظام", user: "مستخدم" };

export default function ActivityPanel() {
  const [activity, setActivity] = useState<A[]>([]);
  const [logs, setLogs] = useState<L[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const r = await api<{ activity: A[]; logs: L[] }>("/api/admin/activity");
      setActivity(r.activity);
      setLogs(r.logs);
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => void load(), [load]);

  return (
    <div className="col" style={{ gap: 12 }}>
      <div className="card row-between wrap" style={{ padding: 14 }}>
        <h3>📈 سجل النشاط الكامل</h3>
        <div className="row">
          {busy && <Spinner />}
          <button className="btn btn-ghost btn-sm" onClick={() => void load()}>🔄 تحديث</button>
          <button
            className="btn btn-danger btn-sm"
            onClick={async () => {
              if (!confirm("تفريغ كل السجل؟")) return;
              await api("/api/admin/activity", { op: "clear" });
              await load();
              toast("تم التفريغ", "ok");
            }}
          >
            🧹 تفريغ
          </button>
        </div>
      </div>

      <div className="grid split" data-split="1">
        <div className="card" style={{ padding: 14 }}>
          <h3 style={{ marginBottom: 10 }}>🛰️ الأحداث</h3>
          <div className="col" style={{ gap: 8, maxHeight: 560, overflow: "auto" }}>
            {activity.length ? (
              activity.map((a, i) => (
                <div key={i} className="row" style={{ gap: 10, alignItems: "flex-start" }}>
                  <span style={{ fontSize: 15, width: 20 }}>{a.icon ?? "•"}</span>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="row-between">
                      <span style={{ fontSize: 12.5, fontWeight: 700 }}>{a.title}</span>
                      <span className="badge badge-muted" style={{ fontSize: 9.5 }}>{ACTOR[a.actor] ?? a.actor}</span>
                    </div>
                    <div className="muted-2" style={{ fontSize: 10.5 }}>
                      {relTime(a.at)}{a.detail ? ` • ${a.detail}` : ""}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <Empty text="لا يوجد نشاط بعد." />
            )}
          </div>
        </div>

        <div className="card" style={{ padding: 14 }}>
          <h3 style={{ marginBottom: 10 }}>🧠 أوامر الذكاء</h3>
          <div className="col" style={{ gap: 8, maxHeight: 560, overflow: "auto" }}>
            {logs.length ? (
              logs.map((l, i) => (
                <div key={i} className="card-soft" style={{ padding: 9 }}>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>{l.prompt}</div>
                  <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>{l.reply.slice(0, 160)}</div>
                  <div className="row wrap" style={{ gap: 4, marginTop: 5 }}>
                    <span className="badge badge-blue" style={{ fontSize: 9 }}>{l.provider}</span>
                    {l.actions.map((a, j) => (
                      <span key={j} className={`badge ${a.ok ? "badge-green" : "badge-red"}`} style={{ fontSize: 9 }}>
                        {a.name}
                      </span>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <Empty text="لا توجد أوامر." />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
