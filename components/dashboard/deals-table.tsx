"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Search, AlertTriangle, Loader2 } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { deleteDeal, deleteDeals } from "@/app/actions/deals";

type Deal = {
  id: string;
  address: string;
  status: string;
  recommendation: string | null;
  arv_low: number | null;
  arv_high: number | null;
  max_offer: number | null;
  created_at: string;
};

type StatusFilter = "all" | "completed" | "failed" | "pending";

function fmt(n: number | null) {
  if (n == null) return "—";
  return "$" + Math.round(n).toLocaleString();
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending:   "bg-amber-500/10 text-amber-400 border-amber-500/20",
    completed: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    failed:    "bg-red-500/10 text-red-400 border-red-500/20",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border ${styles[status] ?? styles.pending}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function RecommendationBadge({ value }: { value: string | null }) {
  if (!value) return <span className="text-muted text-[12px]">—</span>;
  const styles: Record<string, string> = {
    pursue:    "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    negotiate: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    pass:      "bg-red-500/10 text-red-400 border-red-500/20",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border capitalize ${styles[value] ?? ""}`}>
      {value}
    </span>
  );
}

// ── Delete dialog (single or bulk) ────────────────────────────────────────────

function DeleteDialog({
  targets,
  open,
  onClose,
}: {
  targets: Deal[];
  open: boolean;
  onClose: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const isBulk = targets.length > 1;

  function handleConfirm() {
    startTransition(async () => {
      if (isBulk) {
        await deleteDeals(targets.map((d) => d.id));
      } else if (targets[0]) {
        await deleteDeal(targets[0].id);
      }
      onClose();
    });
  }

  return (
    <Dialog.Root open={open} onOpenChange={(v) => { if (!v && !isPending) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40" />
        <Dialog.Content className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm bg-card border border-edge rounded-2xl shadow-2xl focus:outline-none p-6">

          <div className="flex flex-col items-center text-center gap-3 mb-5">
            <div className="w-11 h-11 rounded-full bg-red-500/10 flex items-center justify-center">
              <AlertTriangle size={20} className="text-red-400" strokeWidth={1.5} />
            </div>
            <div>
              <Dialog.Title className="text-white font-semibold text-[15px]">
                {isBulk ? `Delete ${targets.length} Deals` : "Delete Deal"}
              </Dialog.Title>
              <Dialog.Description className="text-muted text-[13px] mt-1 leading-relaxed">
                {isBulk
                  ? `This will permanently delete ${targets.length} deals and their reports. This cannot be undone.`
                  : "This will permanently delete the deal and its report. This cannot be undone."}
              </Dialog.Description>
            </div>
          </div>

          {/* Single — show address pill */}
          {!isBulk && targets[0] && (
            <div className="bg-surface border border-edge rounded-lg px-4 py-2.5 mb-6 text-center">
              <p className="text-white text-[13px] font-medium truncate">{targets[0].address}</p>
            </div>
          )}

          {/* Bulk — show scrollable address list */}
          {isBulk && (
            <div className="bg-surface border border-edge rounded-lg mb-6 max-h-36 overflow-y-auto divide-y divide-edge">
              {targets.map((d) => (
                <p key={d.id} className="px-4 py-2 text-white text-[12px] truncate">{d.address}</p>
              ))}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={isPending}
              className="flex-1 py-2.5 rounded-lg border border-edge text-white text-[13px] font-medium hover:bg-white/[0.04] transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={isPending}
              className="flex-1 py-2.5 rounded-lg bg-red-500 hover:bg-red-600 text-white text-[13px] font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isPending
                ? <><Loader2 size={14} className="animate-spin" />Deleting…</>
                : isBulk ? `Delete ${targets.length}` : "Delete"
              }
            </button>
          </div>

        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ── Main table ────────────────────────────────────────────────────────────────

export function DealsTable({ deals }: { deals: Deal[] }) {
  const router = useRouter();
  const [filter, setFilter]       = useState<StatusFilter>("all");
  const [search, setSearch]       = useState("");
  const [selected, setSelected]   = useState<Set<string>>(new Set());
  const [deleteTargets, setDeleteTargets] = useState<Deal[]>([]);

  const filtered = deals
    .filter((d) => filter === "all" || d.status === filter)
    .filter((d) => d.address.toLowerCase().includes(search.toLowerCase()));

  const filteredIds    = filtered.map((d) => d.id);
  const allSelected    = filteredIds.length > 0 && filteredIds.every((id) => selected.has(id));
  const someSelected   = filteredIds.some((id) => selected.has(id));
  const selectedInView = filtered.filter((d) => selected.has(d.id));

  function toggleAll() {
    if (allSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        filteredIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelected((prev) => new Set([...prev, ...filteredIds]));
    }
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
  }

  return (
    <>
      <DeleteDialog
        targets={deleteTargets}
        open={deleteTargets.length > 0}
        onClose={() => { setDeleteTargets([]); clearSelection(); }}
      />

      <div className="space-y-3">

        {/* Filter bar */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
            <input
              type="text"
              placeholder="Search by address…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); clearSelection(); }}
              className="w-full bg-card border border-edge text-white text-[13px] rounded-lg pl-8 pr-3 py-2 outline-none focus:border-brand transition-colors placeholder:text-muted"
            />
          </div>
          <select
            value={filter}
            onChange={(e) => { setFilter(e.target.value as StatusFilter); clearSelection(); }}
            className="bg-card border border-edge text-white text-[13px] rounded-lg px-3 py-2 outline-none focus:border-brand transition-colors ml-auto"
          >
            <option value="all">All</option>
            <option value="completed">Completed</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
          </select>
        </div>

        {/* Bulk action bar */}
        {someSelected && (
          <div className="flex items-center justify-between bg-brand/10 border border-brand/20 rounded-xl px-4 py-2.5">
            <span className="text-brand text-[13px] font-medium">
              {selectedInView.length} deal{selectedInView.length !== 1 ? "s" : ""} selected
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={clearSelection}
                className="text-muted hover:text-white text-[13px] transition-colors px-2 py-1"
              >
                Clear
              </button>
              <button
                onClick={() => setDeleteTargets(selectedInView)}
                className="flex items-center gap-1.5 bg-red-500 hover:bg-red-600 text-white text-[13px] font-semibold px-3 py-1.5 rounded-lg transition-colors"
              >
                <Trash2 size={13} />
                Delete selected
              </button>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="bg-card border border-edge rounded-xl overflow-hidden">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-muted text-[13px]">
              No {filter !== "all" ? filter : ""} deals found.
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-edge">
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected; }}
                      onChange={toggleAll}
                      className="w-4 h-4 accent-brand rounded"
                    />
                  </th>
                  <th className="text-left px-3 py-3 text-[11px] font-semibold text-muted uppercase tracking-wider">Address</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted uppercase tracking-wider">Recommendation</th>
                  <th className="text-right px-4 py-3 text-[11px] font-semibold text-muted uppercase tracking-wider">ARV Range</th>
                  <th className="text-right px-4 py-3 text-[11px] font-semibold text-muted uppercase tracking-wider">Max Offer</th>
                  <th className="text-right px-4 py-3 text-[11px] font-semibold text-muted uppercase tracking-wider">Date</th>
                  <th className="px-5 py-3 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-edge">
                {filtered.map((deal) => {
                  const isSelected = selected.has(deal.id);
                  return (
                    <tr
                      key={deal.id}
                      onClick={() => router.push(`/dashboard/deals/${deal.id}`)}
                      className={`transition-colors cursor-pointer ${isSelected ? "bg-brand/[0.04]" : "hover:bg-white/[0.02]"}`}
                    >
                      <td className="px-4 py-4 w-10" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleOne(deal.id)}
                          className="w-4 h-4 accent-brand rounded"
                        />
                      </td>
                      <td className="px-3 py-4">
                        <p className="text-white text-[13px] font-medium leading-snug">{deal.address}</p>
                        <p className="text-muted text-[11px] mt-0.5 font-mono">{deal.id.slice(0, 8)}…</p>
                      </td>
                      <td className="px-4 py-4"><StatusBadge status={deal.status} /></td>
                      <td className="px-4 py-4"><RecommendationBadge value={deal.recommendation} /></td>
                      <td className="px-4 py-4 text-right">
                        {deal.arv_low && deal.arv_high ? (
                          <span className="text-white text-[13px] font-medium">
                            {fmt(deal.arv_low)} — {fmt(deal.arv_high)}
                          </span>
                        ) : (
                          <span className="text-muted text-[12px]">—</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <span className="text-brand text-[13px] font-semibold">{fmt(deal.max_offer)}</span>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <span className="text-muted text-[12px]">{fmtDate(deal.created_at)}</span>
                      </td>
                      <td className="px-5 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => setDeleteTargets([deal])}
                          className="p-1.5 rounded-md text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
