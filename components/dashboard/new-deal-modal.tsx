"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { X, Loader2, CheckCircle2, AlertCircle, Upload } from "lucide-react";
import type { ConditionGrade, ExtraItem, UploadedPhoto } from "@/lib/types";

// ── Types ─────────────────────────────────────────────────────────────────────

type State =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "success"; dealId: string }
  | { phase: "error"; message: string };

const CONDITION_OPTIONS: { value: ConditionGrade; label: string }[] = [
  { value: "excellent", label: "Excellent (Fully Renovated / Turnkey) — $0–$15/sqft" },
  { value: "good",      label: "Good (Minor Cosmetic Updates Needed) — $25–$35/sqft" },
  { value: "fair",      label: "Fair (Moderate Repairs Needed) — $40–$50/sqft" },
  { value: "poor",      label: "Poor (Major Repairs Needed) — $55–$65/sqft" },
];

const DEFAULT_EXTRA_ITEMS: ExtraItem[] = [
  { label: "Entire Roof Replacement",       cost: 15_000, checked: false },
  { label: "HVAC Replacement",              cost: 10_000, checked: false },
  { label: "Entire Plumbing Replacement",   cost:  7_000, checked: false },
  { label: "Entire Electrical Replacement", cost:  7_000, checked: false },
  { label: "Light Foundation",              cost:  7_500, checked: false },
  { label: "Heavy Foundation",              cost: 15_000, checked: false },
  { label: "Septic Tank Replacement",       cost: 15_000, checked: false },
  { label: "Well Replacement",              cost: 10_000, checked: false },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtCost(n: number) {
  return "$" + n.toLocaleString();
}

const MAX_PHOTOS = 35;

async function compressImage(file: File): Promise<UploadedPhoto> {
  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      const MAX_DIM = 1024;
      let { width, height } = img;
      if (width > height && width > MAX_DIM) {
        height = Math.round(height * MAX_DIM / width);
        width = MAX_DIM;
      } else if (height > width && height > MAX_DIM) {
        width = Math.round(width * MAX_DIM / height);
        height = MAX_DIM;
      } else if (width > MAX_DIM) {
        height = Math.round(height * MAX_DIM / width);
        width = MAX_DIM;
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(objectUrl);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.75);
      resolve({ data: dataUrl.split(",")[1], mediaType: "image/jpeg" });
    };
    img.src = objectUrl;
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export function NewDealModal({ trigger }: { trigger: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [condition, setCondition] = useState<ConditionGrade>("fair");
  const [marketMultiplier, setMarketMultiplier] = useState(1.0);
  const [investorProfitPct, setInvestorProfitPct] = useState(20);
  const [assignmentFee, setAssignmentFee] = useState(22_500);
  const [extraItems, setExtraItems] = useState<ExtraItem[]>(DEFAULT_EXTRA_ITEMS);
  const [propertyPhotos, setPropertyPhotos] = useState<UploadedPhoto[]>([]);
  const [state, setState] = useState<State>({ phase: "idle" });

  function reset() {
    setAddress("");
    setNotes("");
    setCondition("fair");
    setMarketMultiplier(1.0);
    setInvestorProfitPct(15);
    setAssignmentFee(22_500);
    setExtraItems(DEFAULT_EXTRA_ITEMS);
    setPropertyPhotos([]);
    setState({ phase: "idle" });
  }

  function toggleItem(i: number) {
    setExtraItems((prev) => prev.map((item, idx) => idx === i ? { ...item, checked: !item.checked } : item));
  }

  function updateItemCost(i: number, raw: string) {
    const cost = parseInt(raw.replace(/[^0-9]/g, ""), 10) || 0;
    setExtraItems((prev) => prev.map((item, idx) => idx === i ? { ...item, cost } : item));
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    const toProcess = files.slice(0, MAX_PHOTOS - propertyPhotos.length);
    const compressed = await Promise.all(toProcess.map(compressImage));
    setPropertyPhotos((prev) => [...prev, ...compressed]);
  }

  function removePhoto(i: number) {
    setPropertyPhotos((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!address.trim()) return;
    setState({ phase: "loading" });

    try {
      const res = await fetch("/api/underwrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: address.trim(),
          notes: notes.trim() || undefined,
          condition,
          marketMultiplier,
          investorProfitPct: investorProfitPct / 100,
          assignmentFee,
          extraItems,
          propertyPhotos: propertyPhotos.length > 0 ? propertyPhotos : undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setState({ phase: "error", message: data.error ?? "Something went wrong." });
        return;
      }

      setState({ phase: "success", dealId: data.dealId });
      router.push(`/dashboard/deals/${data.dealId}`);
    } catch {
      setState({ phase: "error", message: "Network error — please try again." });
    }
  }

  const disabled = state.phase === "loading";

  return (
    <Dialog.Root open={open} onOpenChange={(next) => { setOpen(next); if (!next) reset(); }}>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40" />
        <Dialog.Content className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-4xl bg-card border border-edge rounded-2xl shadow-2xl focus:outline-none flex flex-col max-h-[90vh]">

          {/* Header */}
          <div className="flex items-center justify-between px-6 pt-6 pb-4 shrink-0">
            <Dialog.Title className="text-white font-semibold text-base">New Deal</Dialog.Title>
            <Dialog.Close asChild>
              <button className="text-muted hover:text-white transition-colors"><X size={18} /></button>
            </Dialog.Close>
          </div>

          {/* Success */}
          {state.phase === "success" && (
            <div className="flex flex-col items-center text-center py-10 px-6 gap-3">
              <CheckCircle2 size={40} className="text-brand" strokeWidth={1.5} />
              <p className="text-white font-medium">Deal underwritten successfully</p>
              <p className="text-muted text-sm">Redirecting to report…</p>
            </div>
          )}

          {/* Error */}
          {state.phase === "error" && (
            <div className="flex flex-col items-center text-center py-10 px-6 gap-3">
              <AlertCircle size={40} className="text-red-400" strokeWidth={1.5} />
              <p className="text-white font-medium">Something went wrong</p>
              <p className="text-muted text-sm max-w-sm">{state.message}</p>
              <button onClick={() => setState({ phase: "idle" })} className="mt-2 bg-brand hover:bg-brand-hover text-white text-[13px] font-semibold px-5 py-2.5 rounded-lg transition-colors">
                Try again
              </button>
            </div>
          )}

          {/* Form */}
          {(state.phase === "idle" || state.phase === "loading") && (
            <form onSubmit={handleSubmit} className="flex flex-col min-h-0">
              <div className="overflow-y-auto px-6 pb-2 space-y-4">

                {/* Address — full width */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-muted uppercase tracking-wider">Property Address</label>
                  <input
                    type="text" value={address} onChange={(e) => setAddress(e.target.value)}
                    placeholder="123 Main St, Miami, FL 33101" required disabled={disabled}
                    className="w-full bg-surface border border-edge rounded-lg px-3.5 py-2.5 text-white text-sm placeholder:text-muted focus:outline-none focus:border-brand transition-colors disabled:opacity-50"
                  />
                </div>

                {/* 2-column main grid */}
                <div className="grid grid-cols-2 gap-6">

                  {/* ── Left: settings ── */}
                  <div className="space-y-4">

                    {/* Condition */}
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-semibold text-muted uppercase tracking-wider">Property Condition</label>
                      <select value={condition} onChange={(e) => setCondition(e.target.value as ConditionGrade)}
                        disabled={disabled}
                        className="w-full bg-surface border border-edge rounded-lg px-3.5 py-2.5 text-white text-sm focus:outline-none focus:border-brand transition-colors disabled:opacity-50 appearance-none"
                      >
                        {CONDITION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>

                    {/* Market Multiplier */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-semibold text-muted uppercase tracking-wider">Market Multiplier</label>
                        <span className="text-brand text-[13px] font-semibold tabular-nums">{marketMultiplier.toFixed(1)}×</span>
                      </div>
                      <input type="range" min={0.5} max={3.0} step={0.1} value={marketMultiplier}
                        onChange={(e) => setMarketMultiplier(parseFloat(e.target.value))}
                        disabled={disabled} className="w-full accent-brand disabled:opacity-50"
                      />
                      <div className="flex justify-between text-muted text-[10px]">
                        <span>0.5× Low-cost</span><span>3.0× High-end</span>
                      </div>
                    </div>

                    {/* Investor Profit */}
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-semibold text-muted uppercase tracking-wider">Investor Profit</label>
                      <div className="flex items-center bg-surface border border-edge rounded-lg overflow-hidden focus-within:border-brand transition-colors">
                        <input type="number" min={1} max={40} value={investorProfitPct}
                          onChange={(e) => setInvestorProfitPct(Math.max(1, Math.min(40, parseInt(e.target.value, 10) || 20)))}
                          disabled={disabled}
                          className="flex-1 bg-transparent px-3.5 py-2.5 text-white text-sm focus:outline-none disabled:opacity-50 tabular-nums"
                        />
                        <span className="text-muted text-[13px] pr-3.5">%</span>
                      </div>
                      <p className="text-muted text-[10px]">% of net sales price (ARV × 0.92)</p>
                    </div>

                    {/* Assignment Fee */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-semibold text-muted uppercase tracking-wider">Min. Assignment Fee</label>
                        <span className="text-brand text-[13px] font-semibold tabular-nums">${assignmentFee.toLocaleString()}</span>
                      </div>
                      <div className="flex items-center bg-surface border border-edge rounded-lg overflow-hidden focus-within:border-brand transition-colors">
                        <span className="text-muted text-[13px] pl-3">$</span>
                        <input type="text" value={assignmentFee.toLocaleString()}
                          onChange={(e) => { const v = parseInt(e.target.value.replace(/[^0-9]/g, ""), 10); setAssignmentFee(isNaN(v) ? 0 : v); }}
                          disabled={disabled}
                          className="flex-1 bg-transparent px-2 py-2.5 text-white text-sm focus:outline-none disabled:opacity-50 tabular-nums"
                        />
                      </div>
                      <p className="text-muted text-[10px]">Deducted from Max Offer (low &amp; high)</p>
                    </div>
                  </div>

                  {/* ── Right: repair items + notes ── */}
                  <div className="space-y-4">

                    {/* Extra Items */}
                    <div className="space-y-2">
                      <label className="text-[11px] font-semibold text-muted uppercase tracking-wider">Additional Repair Items</label>
                      <div className="space-y-1.5">
                        {extraItems.map((item, i) => (
                          <>
                            {i === 4 && (
                              <div key="foundation-separator" className="pt-1">
                                <div className="border-t border-edge" />
                                {condition === "poor" && (
                                  <p className="mt-2 text-[11px] text-amber-400/80 leading-snug">
                                    Poor condition already includes full gut costs above. Only check foundation if applicable — it is always additive regardless of condition.
                                  </p>
                                )}
                              </div>
                            )}
                            <div key={item.label} className="flex items-center gap-2.5">
                              <input type="checkbox" id={`item-${i}`} checked={item.checked}
                                onChange={() => toggleItem(i)} disabled={disabled}
                                className="w-4 h-4 accent-brand shrink-0 disabled:opacity-50"
                              />
                              <label htmlFor={`item-${i}`} className={`flex-1 text-[13px] cursor-pointer select-none ${item.checked ? "text-white" : "text-muted"}`}>
                                {item.label}
                              </label>
                              <div className="flex items-center">
                                <span className="text-muted text-[12px] mr-1">$</span>
                                <input type="text" value={item.cost.toLocaleString()}
                                  onChange={(e) => updateItemCost(i, e.target.value)}
                                  disabled={disabled || !item.checked}
                                  className="w-20 bg-surface border border-edge rounded px-2 py-1 text-white text-[12px] text-right focus:outline-none focus:border-brand transition-colors disabled:opacity-40 tabular-nums"
                                />
                              </div>
                            </div>
                          </>
                        ))}
                      </div>
                    </div>

                    {/* Notes */}
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-semibold text-muted uppercase tracking-wider">
                        Notes <span className="normal-case text-muted/60 tracking-normal font-normal">(optional)</span>
                      </label>
                      <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
                        placeholder="Tenant occupied, seller motivated, permit issues..."
                        rows={4} disabled={disabled}
                        className="w-full bg-surface border border-edge rounded-lg px-3.5 py-2.5 text-white text-sm placeholder:text-muted focus:outline-none focus:border-brand transition-colors resize-none disabled:opacity-50"
                      />
                    </div>
                  </div>
                </div>

                {/* Photos — full width */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-semibold text-muted uppercase tracking-wider">
                      Property Photos <span className="normal-case text-muted/60 tracking-normal font-normal">(optional)</span>
                    </label>
                    {propertyPhotos.length > 0 && <span className="text-muted text-[11px]">{propertyPhotos.length}/{MAX_PHOTOS}</span>}
                  </div>
                  {propertyPhotos.length > 0 && (
                    <div className="grid grid-cols-8 gap-2">
                      {propertyPhotos.map((photo, i) => (
                        <div key={i} className="relative aspect-square rounded-lg overflow-hidden bg-surface border border-edge group">
                          <img src={`data:${photo.mediaType};base64,${photo.data}`} alt="" className="w-full h-full object-cover" />
                          <button type="button" onClick={() => removePhoto(i)} disabled={disabled}
                            className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity disabled:hidden">
                            <X size={14} className="text-white" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {propertyPhotos.length < MAX_PHOTOS && (
                    <label className={`flex items-center justify-center gap-2 w-full border border-dashed border-edge rounded-lg py-2.5 transition-colors ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:border-brand/50 hover:bg-brand/5"}`}>
                      <Upload size={14} className="text-muted" />
                      <span className="text-muted text-[12px]">{propertyPhotos.length === 0 ? "Upload property photos" : "Add more"}</span>
                      <input type="file" accept="image/*" multiple disabled={disabled} onChange={handlePhotoUpload} className="hidden" />
                    </label>
                  )}
                  {propertyPhotos.length > 0 && <p className="text-muted/60 text-[11px]">These replace listing photos from Zillow.</p>}
                </div>
              </div>

              {/* Submit */}
              <div className="px-6 py-4 border-t border-edge shrink-0">
                <button
                  type="submit"
                  disabled={!address.trim() || disabled}
                  className="w-full flex items-center justify-center gap-2 bg-brand hover:bg-brand-hover disabled:opacity-50 disabled:cursor-not-allowed text-white text-[13px] font-semibold py-2.5 rounded-lg transition-colors"
                >
                  {disabled ? (
                    <><Loader2 size={15} className="animate-spin" />Underwriting deal...</>
                  ) : (
                    "Run Underwriting"
                  )}
                </button>
              </div>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
