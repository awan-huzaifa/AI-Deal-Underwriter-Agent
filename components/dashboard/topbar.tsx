"use client";

import { usePathname } from "next/navigation";
import { Bell } from "lucide-react";

const pageTitles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/dashboard/deals": "Deals",
  "/dashboard/analytics": "Analytics",
  "/dashboard/settings": "Settings",
};

export function Topbar({ userEmail }: { userEmail: string }) {
  const pathname = usePathname();
  const title = pageTitles[pathname] ?? "Dashboard";
  const initial = userEmail.charAt(0).toUpperCase();

  return (
    <header className="h-16 shrink-0 flex items-center justify-between px-6 lg:px-10 border-b border-edge bg-surface">
      <h1 className="text-white font-semibold text-[15px]">{title}</h1>

      <div className="flex items-center gap-2">
        <button
          className="w-8 h-8 flex items-center justify-center rounded-lg text-muted hover:text-white hover:bg-white/[0.04] transition-colors"
          aria-label="Notifications"
        >
          <Bell size={15} strokeWidth={2} />
        </button>

        <div className="w-8 h-8 bg-brand rounded-full flex items-center justify-center ml-1">
          <span className="text-white text-[11px] font-bold">{initial}</span>
        </div>
      </div>
    </header>
  );
}
