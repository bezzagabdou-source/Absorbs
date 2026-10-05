"use client";

import { useEffect, useState } from "react";
import { Bell, Coins, Crown } from "lucide-react";
import { Row, SettingsFrame, Switch } from "@/components/settings-ui";

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
  const [perm, setPerm] = useState<string>("default");
  const [credits, setCredits] = useFlag("barq_notify_credits", true);
  const [offers, setOffers] = useFlag("barq_notify_offers", false);

  useEffect(() => {
    if (typeof Notification !== "undefined") setPerm(Notification.permission);
  }, []);

  const ask = async () => {
    if (typeof Notification === "undefined") return;
    setPerm(await Notification.requestPermission());
  };

  const label =
    perm === "granted" ? "مفعّلة على هذا الجهاز" : perm === "denied" ? "محجوبة من إعدادات المتصفح" : "غير مفعّلة بعد";

  return (
    <SettingsFrame title="الإشعارات">
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
      <Row icon={Coins} title="تذكير النقاط اليومية" desc="ننبّهك عند تجدد نقاطك المجانية" action={<Switch on={credits} onChange={setCredits} label="تذكير النقاط" />} />
      <Row icon={Crown} title="عروض Pro" desc="خصومات وميزات جديدة في v6" action={<Switch on={offers} onChange={setOffers} label="عروض Pro" />} />
    </SettingsFrame>
  );
}
