"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Plus, UserPlus, FileText } from "lucide-react";

const NAV = [
  { href: "/",        label: "الرئيسية", Icon: LayoutDashboard },
  { href: "/collect", label: "تحصيل",    Icon: Plus },
  { href: "/register",label: "تسجيل",    Icon: UserPlus },
  { href: "/settle",  label: "تسوية",    Icon: FileText },
];

export function BottomNav() {
  const path = usePathname();
  return (
    <nav className="bottom-nav">
      {NAV.map(({ href, label, Icon }) => {
        const active = path === href;
        return (
          <Link key={href} href={href} className={`bottom-nav-item${active ? " active" : ""}`}>
            <Icon size={22} strokeWidth={active ? 2.5 : 1.8} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
