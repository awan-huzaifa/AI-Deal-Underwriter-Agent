"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Building2,
  BarChart2,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { signOut } from "@/app/actions/auth";

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Deals", href: "/dashboard/deals", icon: Building2 },
  { label: "Analytics", href: "/dashboard/analytics", icon: BarChart2 },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-[220px] shrink-0 flex flex-col bg-sidebar border-r border-edge h-full">

      {/* Logo */}
      <div className="h-16 flex items-center px-5 border-b border-edge shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-brand rounded-lg flex items-center justify-center shrink-0 shadow shadow-brand/40">
            <span className="text-white font-bold text-xs">D</span>
          </div>
          <span className="text-white font-semibold text-[13px] tracking-wide">Deal UW</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 space-y-0.5" aria-label="Main navigation">
        {navItems.map(({ label, href, icon: Icon }) => {
          const active =
            href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(href);

          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "relative flex items-center gap-3 mx-2 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-colors",
                active
                  ? "bg-white/[0.06] text-white"
                  : "text-muted hover:bg-white/[0.04] hover:text-white"
              )}
            >
              {active && (
                <span className="absolute -left-2 top-[7px] bottom-[7px] w-[3px] bg-brand rounded-r-full" />
              )}
              <Icon size={15} strokeWidth={2} className="shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Sign out */}
      <div className="p-2 border-t border-edge shrink-0">
        <form action={signOut}>
          <button
            type="submit"
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium text-muted hover:bg-white/[0.04] hover:text-white transition-colors"
          >
            <LogOut size={15} strokeWidth={2} className="shrink-0" />
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
