"use client";

import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="flex items-center gap-1.5 bg-card border border-edge hover:border-brand text-muted hover:text-white text-[13px] font-medium px-3 py-2 rounded-lg transition-colors print:hidden"
    >
      <Printer size={14} />
      Export
    </button>
  );
}
