"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";

export function DownloadPDFButton({ dealId }: { dealId: string }) {
  const [loading, setLoading] = useState(false);

  async function handleDownload() {
    setLoading(true);
    try {
      const res = await fetch(`/api/deals/${dealId}/pdf`);
      if (!res.ok) throw new Error("Failed to generate PDF");

      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");

      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="(.+?)"/);
      a.download = match?.[1] ?? "deal-report.pdf";
      a.href = url;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleDownload}
      disabled={loading}
      className="flex items-center gap-1.5 bg-card border border-edge hover:border-brand text-muted hover:text-white text-[13px] font-medium px-3 py-2 rounded-lg transition-colors disabled:opacity-50 print:hidden"
    >
      {loading
        ? <><Loader2 size={14} className="animate-spin" />Generating…</>
        : <><Download size={14} />Download PDF</>
      }
    </button>
  );
}
