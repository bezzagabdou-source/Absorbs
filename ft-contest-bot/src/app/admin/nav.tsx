"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/admin", label: "لوحة المعلومات", icon: "📊" },
  { href: "/admin/contests", label: "المسابقات", icon: "🏆" },
  { href: "/admin/group", label: "المجموعة وأسرع ضيف", icon: "🏃" },
  { href: "/admin/users", label: "المستخدمون", icon: "👥" },
  { href: "/admin/referrals", label: "الإحالات", icon: "🔗" },
  { href: "/admin/rewards", label: "النقاط والجوائز", icon: "🛒" },
  { href: "/admin/claims", label: "الجوائز المسلّمة", icon: "🎁" },
  { href: "/admin/stats", label: "الإحصائيات", icon: "📈" },
  { href: "/admin/broadcast", label: "بث رسالة", icon: "📣" },
  { href: "/admin/ai", label: "المساعد الذكي", icon: "🤖" },
  { href: "/admin/settings", label: "الإعدادات والبوت", icon: "⚙️" },
];

export default function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="nav">
      {ITEMS.map((item) => {
        const active =
          item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
        return (
          <Link key={item.href} href={item.href} className={active ? "active" : undefined}>
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
