"use client";

import { useEffect, useState } from "react";
import { Database, Eraser, HardDrive } from "lucide-react";
import { Row, SettingsFrame } from "@/components/settings-ui";

export default function StoragePage() {
  const [size, setSize] = useState<string>("…");
  const [done, setDone] = useState(false);

  const measure = async () => {
    try {
      const est = await navigator.storage?.estimate?.();
      const mb = (est?.usage ?? 0) / 1048576;
      setSize(mb < 0.1 ? "أقل من 0.1 MB" : `${mb.toFixed(1)} MB`);
    } catch {
      setSize("—");
    }
  };
  useEffect(() => { void measure(); }, []);

  const clearCache = async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch {}
    setDone(true);
    void measure();
  };

  const clearPrefs = () => {
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith("barq_"))
        .forEach((k) => localStorage.removeItem(k));
    } catch {}
    setDone(true);
  };

  return (
    <SettingsFrame title="التخزين">
      <Row icon={HardDrive} title="المساحة المستخدمة" desc={`${size} على هذا الجهاز`} />
      <button type="button" onClick={clearCache} className="w-full text-start">
        <Row icon={Eraser} title="مسح الذاكرة المؤقتة" desc="يحذف ملفات التحميل السريع. يبقى حسابك ومحادثاتك." />
      </button>
      <button type="button" onClick={clearPrefs} className="w-full text-start">
        <Row icon={Database} title="إعادة ضبط تفضيلات التطبيق" desc="النموذج المختار والإشعارات وغيرها. لا يسجّل خروجك." />
      </button>
      {done && <p className="text-center text-sm font-bold text-brand-300">تم بنجاح ✓</p>}
    </SettingsFrame>
  );
}
