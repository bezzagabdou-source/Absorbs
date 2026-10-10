"use client";

import { useEffect, useState } from "react";
import { Bell, Coins, Crown } from "lucide-react";
import { Row, SettingsFrame, Switch } from "@/components/settings-ui";
import { enableHourlyNotifications, disableHourlyNotifications } from "@/components/pwa";
import { testNotification, requestPermission, enablePush, permissionState } from "@/lib/notify";
import { useAuth } from "@/lib/auth-context";

function useFlag(key: string, def: boolean) {
  const [v, setV] = useState(def);
  useEffect(() => {
    try {
      const s = localStorage.getItem(key);
      if (s !== null) setV(s === "1");
    } catch {}
  }, [key]);
  const set = (n: boolean) => {
    setV(n);
    try { localStorage.setItem(key, n ? "1" : "0"); } catch {}
  };
  return [v, set] as const;
}

export default function NotificationsPage() {
  const { authFetch } = useAuth();
  const [perm, setPerm] = useState<string>("default");
  const [tested, setTested] = useState<string>("");
  const [credits, setCredits] = useFlag("barq_notify_credits", true);
  const [offers, setOffers] = useFlag("barq_notify_offers", false);

  useEffect(() => {
    if (typeof Notification !== "undefined") setPerm(Notification.permission);
  }, []);

  const ask = async () => {
    // v15: ask, then subscribe to real push when the server has VAPID keys.
    // If it does not, the local service-worker tier still delivers.
    await requestPermission();
    await enablePush(authFetch).catch(() => ({ ok: false }));
    await enableHourlyNotifications();
    setPerm(String(permissionState()));
  };

  /** Fires a real notification right now so the user can SEE it works. */
  const runTest = async () => {
    await requestPermission();
    const r = await testNotification();
    setPerm(String(permissionState()));
    setTested(
      r.tier === "sw" || r.tier === "page"
        ? "وصل إشعار حقيقي ✅"
        : r.tier === "toast"
          ? "المتصفح رافض الإشعارات — وصلك تنبيه داخل التطبيق ✅"
          : "ما نجّمناش نبعثو. فعّل الإذن من إعدادات المتصفح."
    );
  };
  const [hourly, setHourlyState] = useState(false);
  useEffect(() => {
    try { setHourlyState(localStorage.getItem("nexus_push") === "1"); } catch {}
  }, []);
  const toggleHourly = async (on: boolean) => {
    setHourlyState(on);
    if (on) {
      const ok = await enableHourlyNotifications();
      if (!ok) setHourlyState(false);
      if (typeof Notification !== "undefined") setPerm(Notification.permission);
    } else await disableHourlyNotifications();
  };

  const label =
    perm === "granted" ? "مفعّلة على هذا الجهاز" : perm === "denied" ? "محجوبة من إعدادات المتصفح" : "غير مفعّلة بعد";

  return (
    <SettingsFrame title="الإشعارات">
      <button
        type="button"
        onClick={() => void runTest()}
        className="mb-3 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-[13.5px] font-semibold text-slate-200 transition hover:border-brand-400/50"
      >
        جرّب إشعار دابا
      </button>
      {tested && <p className="mb-3 text-[12.5px] text-emerald-300">{tested}</p>}
      <Row
        icon={Bell}
        title="إشعارات الجهاز"
        desc={label}
        action={
          perm === "default" ? (
            <button type="button" onClick={ask} className="btn-primary px-4 py-2 text-xs">تفعيل</button>
          ) : undefined
        }
      />
      <Row icon={Bell} title="تذكير كل ساعة" desc="إشعار كل ساعة يدعوك لاستخدام Nexus بسرعة" action={<Switch on={hourly && perm === "granted"} onChange={toggleHourly} label="تذكير كل ساعة" />} />
      <Row icon={Coins} title="تذكير النقاط اليومية" desc="ننبّهك عند تجدد نقاطك المجانية" action={<Switch on={credits} onChange={setCredits} label="تذكير النقاط" />} />
      <Row icon={Crown} title="عروض Pro" desc="خصومات وميزات جديدة في v6" action={<Switch on={offers} onChange={setOffers} label="عروض Pro" />} />
    </SettingsFrame>
  );
}
