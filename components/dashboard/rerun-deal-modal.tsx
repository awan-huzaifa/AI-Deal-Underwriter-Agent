"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { X, Loader2, CheckCircle2, AlertCircle, RefreshCw, Upload, Plus, ChevronDown } from "lucide-react";
import type { ConditionGrade, ExtraItem, UploadedPhoto, NormalizedComp, ManualComp, CompCategory } from "@/lib/types";

// ── Constants ─────────────────────────────────────────────────────────────────

type State =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "success" }
  | { phase: "error"; message: string };

const CONDITION_OPTIONS: { value: ConditionGrade; label: string }[] = [
  { value: "excellent", label: "Excellent — Fully Renovated / Turnkey" },
  { value: "good",      label: "Good — Minor Cosmetic Updates Needed" },
  { value: "fair",      label: "Fair — Moderate Repairs Needed" },
  { value: "poor",      label: "Poor — Major Repairs Needed" },
];

const COMP_TYPE_OPTIONS: { value: CompCategory | ""; label: string }[] = [
  { value: "",          label: "— Let Claude decide —" },
  { value: "arv",       label: "ARV Comp" },
  { value: "turnkey",   label: "Turnkey" },
  { value: "as_is",     label: "As-Is" },
  { value: "cash_sale", label: "Cash Sale" },
];

const CONSTRUCTION_OPTIONS = [
  "", "Wood Frame", "Brick", "Concrete Block", "Stone", "Stucco", "Metal",
];

const DEFAULT_EXTRA_ITEMS: ExtraItem[] = [
  { label: "Entire Roof Replacement",       cost: 15_000, checked: false },
  { label: "HVAC Replacement",              cost: 10_000, checked: false },
  { label: "Entire Plumbing Replacement",   cost:  7_000, checked: false },
  { label: "Entire Electrical Replacement", cost:  7_000, checked: false },
  { label: "Light Foundation",              cost:  7_500, checked: false },
  { label: "Heavy Foundation",              cost: 15_000, checked: false },
];

const MAX_PHOTOS = 35;

// ── Types ─────────────────────────────────────────────────────────────────────

interface ManualCompForm {
  id: string;
  address: string;
  compType: string;
  salePrice: string;
  saleDate: string;
  beds: string;
  baths: string;
  sqft: string;
  lotSizeSqft: string;
  yearBuilt: string;
  constructionType: string;
  expanded: boolean;
}

interface Props {
  dealId: string;
  address: string;
  initialCondition: ConditionGrade;
  initialMultiplier: number;
  initialCheckedItems: { label: string; cost: number }[];
  initialInvestorProfitPct: number;
  initialAssignmentFee: number;
  existingComps: NormalizedComp[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildInitialItems(checkedItems: { label: string; cost: number }[]): ExtraItem[] {
  return DEFAULT_EXTRA_ITEMS.map((item) => {
    const found = checkedItems.find((c) => c.label === item.label);
    return found ? { ...item, cost: found.cost, checked: true } : item;
  });
}

function newCompForm(): ManualCompForm {
  return {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2),
    address: "", compType: "", salePrice: "", saleDate: "",
    beds: "", baths: "", sqft: "", lotSizeSqft: "",
    yearBuilt: "", constructionType: "", expanded: false,
  };
}

function fmt(n: number) {
  return "$" + Math.round(n).toLocaleString();
}

function catBadge(cat: string | null) {
  if (!cat) return null;
  const map: Record<string, string> = {
    arv:       "bg-brand/10 text-brand border-brand/20",
    turnkey:   "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    as_is:     "bg-amber-500/10 text-amber-400 border-amber-500/20",
    cash_sale: "bg-violet-500/10 text-violet-400 border-violet-500/20",
  };
  const labels: Record<string, string> = { arv: "ARV", turnkey: "Turnkey", as_is: "As-Is", cash_sale: "Cash" };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border ${map[cat] ?? ""}`}>
      {labels[cat] ?? cat}
    </span>
  );
}

async function compressImage(file: File): Promise<UploadedPhoto> {
  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      const MAX_DIM = 1024;
      let { width, height } = img;
      if (width > height && width > MAX_DIM) { height = Math.round(height * MAX_DIM / width); width = MAX_DIM; }
      else if (height > width && height > MAX_DIM) { width = Math.round(width * MAX_DIM / height); height = MAX_DIM; }
      else if (width > MAX_DIM) { height = Math.round(height * MAX_DIM / width); width = MAX_DIM; }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(objectUrl);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.75);
      resolve({ data: dataUrl.split(",")[1], mediaType: "image/jpeg" });
    };
    img.src = objectUrl;
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export function RerunDealModal({
  dealId, address, initialCondition, initialMultiplier, initialCheckedItems,
  initialInvestorProfitPct, initialAssignmentFee, existingComps,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  // Core inputs
  const [notes, setNotes] = useState("");
  const [condition, setCondition] = useState<ConditionGrade>(initialCondition);
  const [marketMultiplier, setMarketMultiplier] = useState(initialMultiplier);
  const [investorProfitPct, setInvestorProfitPct] = useState(Math.round(initialInvestorProfitPct * 100));
  const [assignmentFee, setAssignmentFee] = useState(initialAssignmentFee);
  const [extraItems, setExtraItems] = useState<ExtraItem[]>(() => buildInitialItems(initialCheckedItems));
  const [propertyPhotos, setPropertyPhotos] = useState<UploadedPhoto[]>([]);

  // Comp management
  const [compIncluded, setCompIncluded] = useState<boolean[]>(() => existingComps.map(() => true));
  const [manualComps, setManualComps] = useState<ManualCompForm[]>([]);

  const [state, setState] = useState<State>({ phase: "idle" });

  function reset() {
    setNotes("");
    setCondition(initialCondition);
    setMarketMultiplier(initialMultiplier);
    setInvestorProfitPct(Math.round(initialInvestorProfitPct * 100));
    setAssignmentFee(initialAssignmentFee);
    setExtraItems(buildInitialItems(initialCheckedItems));
    setPropertyPhotos([]);
    setCompIncluded(existingComps.map(() => true));
    setManualComps([]);
    setState({ phase: "idle" });
  }

  // Extra items
  function toggleItem(i: number) {
    setExtraItems((prev) => prev.map((item, idx) => idx === i ? { ...item, checked: !item.checked } : item));
  }
  function updateItemCost(i: number, raw: string) {
    const cost = parseInt(raw.replace(/[^0-9]/g, ""), 10) || 0;
    setExtraItems((prev) => prev.map((item, idx) => idx === i ? { ...item, cost } : item));
  }

  // Photos
  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    const compressed = await Promise.all(files.slice(0, MAX_PHOTOS - propertyPhotos.length).map(compressImage));
    setPropertyPhotos((prev) => [...prev, ...compressed]);
  }
  function removePhoto(i: number) {
    setPropertyPhotos((prev) => prev.filter((_, idx) => idx !== i));
  }

  // Existing comps
  function toggleComp(i: number) {
    setCompIncluded((prev) => prev.map((v, idx) => idx === i ? !v : v));
  }

  // Manual comps
  function addManualComp() {
    setManualComps((prev) => [...prev, newCompForm()]);
  }
  function removeManualComp(id: string) {
    setManualComps((prev) => prev.filter((c) => c.id !== id));
  }
  function updateComp(id: string, field: keyof ManualCompForm, value: string | boolean) {
    setManualComps((prev) => prev.map((c) => c.id === id ? { ...c, [field]: value } : c));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState({ phase: "loading" });

    const baseComps = existingComps.filter((_, i) => compIncluded[i]);

    const manualCompsPayload: ManualComp[] = manualComps
      .filter((c) => c.address.trim())
      .map((c) => ({
        address: c.address.trim(),
        ...(c.compType         ? { compType: c.compType as CompCategory }        : {}),
        ...(c.salePrice        ? { salePrice: parseInt(c.salePrice.replace(/[^0-9]/g, ""), 10) }  : {}),
        ...(c.saleDate         ? { saleDate: c.saleDate }                         : {}),
        ...(c.beds             ? { beds: parseFloat(c.beds) }                     : {}),
        ...(c.baths            ? { baths: parseFloat(c.baths) }                   : {}),
        ...(c.sqft             ? { sqft: parseInt(c.sqft.replace(/[^0-9]/g, ""), 10) }            : {}),
        ...(c.lotSizeSqft      ? { lotSizeSqft: parseInt(c.lotSizeSqft.replace(/[^0-9]/g, ""), 10) } : {}),
        ...(c.yearBuilt        ? { yearBuilt: parseInt(c.yearBuilt, 10) }         : {}),
        ...(c.constructionType ? { constructionType: c.constructionType }         : {}),
      }));

    try {
      const res = await fetch("/api/underwrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dealId,
          address,
          notes: notes.trim() || undefined,
          condition,
          marketMultiplier,
          investorProfitPct: investorProfitPct / 100,
          assignmentFee,
          extraItems,
          baseComps,
          manualComps: manualCompsPayload.length > 0 ? manualCompsPayload : undefined,
          propertyPhotos: propertyPhotos.length > 0 ? propertyPhotos : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setState({ phase: "error", message: data.error ?? "Something went wrong." });
        return;
      }
      setState({ phase: "success" });
      setOpen(false);
      router.refresh();
    } catch {
      setState({ phase: "error", message: "Network error — please try again." });
    }
  }

  const disabled = state.phase === "loading";
  const includedCount = compIncluded.filter(Boolean).length;

  return (
    <Dialog.Root open={open} onOpenChange={(next) => { setOpen(next); if (!next) reset(); }}>
      <Dialog.Trigger asChild>
        <button className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 hover:border-amber-500/50 text-[12px] font-semibold transition-colors print:hidden">
          <RefreshCw size={13} />
          Re-run
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40" />
        <Dialog.Content className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-3xl bg-card border border-edge rounded-2xl shadow-2xl focus:outline-none flex flex-col max-h-[90vh]">

          {/* Header */}
          <div className="flex items-center justify-between px-6 pt-6 pb-4 shrink-0">
            <div>
              <Dialog.Title className="text-white font-semibold text-base">Re-run Underwriting</Dialog.Title>
              <p className="text-muted text-[12px] mt-0.5 truncate max-w-sm">{address}</p>
            </div>
            <Dialog.Close asChild>
              <button className="text-muted hover:text-white transition-colors"><X size={18} /></button>
            </Dialog.Close>
          </div>

          {/* Success */}
          {state.phase === "success" && (
            <div className="flex flex-col items-center text-center py-10 px-6 gap-3">
              <CheckCircle2 size={40} className="text-brand" strokeWidth={1.5} />
              <p className="text-white font-medium">Re-run complete</p>
              <p className="text-muted text-sm">Report updated with fresh analysis.</p>
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

                {/* Address (locked) — full width */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-muted uppercase tracking-wider">Property Address</label>
                  <input type="text" value={address} readOnly
                    className="w-full bg-surface/50 border border-edge rounded-lg px-3.5 py-2.5 text-muted text-sm focus:outline-none cursor-not-allowed"
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
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-semibold text-muted uppercase tracking-wider">Investor Profit</label>
                        <span className="text-brand text-[13px] font-semibold tabular-nums">{investorProfitPct}%</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <input type="range" min={1} max={40} step={1} value={investorProfitPct}
                          onChange={(e) => setInvestorProfitPct(parseInt(e.target.value, 10))}
                          disabled={disabled} className="flex-1 accent-brand disabled:opacity-50"
                        />
                        <div className="flex items-center bg-surface border border-edge rounded-lg overflow-hidden">
                          <input type="number" min={1} max={40} value={investorProfitPct}
                            onChange={(e) => setInvestorProfitPct(Math.max(1, Math.min(40, parseInt(e.target.value, 10) || 15)))}
                            disabled={disabled}
                            className="w-12 bg-transparent px-2 py-1.5 text-white text-[13px] text-right focus:outline-none disabled:opacity-50 tabular-nums"
                          />
                          <span className="text-muted text-[12px] pr-2">%</span>
                        </div>
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
                          <div key={item.label} className="flex items-center gap-2.5">
                            <input type="checkbox" id={`rerun-item-${i}`} checked={item.checked}
                              onChange={() => toggleItem(i)} disabled={disabled}
                              className="w-4 h-4 accent-brand shrink-0 disabled:opacity-50"
                            />
                            <label htmlFor={`rerun-item-${i}`} className={`flex-1 text-[13px] cursor-pointer select-none ${item.checked ? "text-white" : "text-muted"}`}>
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
                        ))}
                      </div>
                    </div>

                    {/* Notes */}
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-semibold text-muted uppercase tracking-wider">
                        Notes <span className="normal-case text-muted/60 tracking-normal font-normal">(optional)</span>
                      </label>
                      <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
                        placeholder="Updated observations, new info from site visit..."
                        rows={4} disabled={disabled}
                        className="w-full bg-surface border border-edge rounded-lg px-3.5 py-2.5 text-white text-sm placeholder:text-muted focus:outline-none focus:border-brand transition-colors resize-none disabled:opacity-50"
                      />
                    </div>
                  </div>
                </div>

                {/* ── Existing Comps ──────────────────────────────────────── */}
                {existingComps.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-semibold text-muted uppercase tracking-wider">Comps from Previous Run</label>
                      <span className="text-muted text-[11px]">{includedCount} / {existingComps.length} included</span>
                    </div>
                    <div className="space-y-1.5">
                      {existingComps.map((comp, i) => (
                        <label
                          key={i}
                          className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                            compIncluded[i]
                              ? "bg-surface border-edge"
                              : "bg-transparent border-edge/40 opacity-50"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={compIncluded[i]}
                            onChange={() => toggleComp(i)}
                            disabled={disabled}
                            className="w-4 h-4 accent-brand shrink-0 disabled:opacity-50"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-[12px] truncate leading-snug">{comp.address}</p>
                            <p className="text-muted text-[11px] mt-0.5">
                              {comp.beds}bd / {comp.baths}ba · {comp.sqft?.toLocaleString()} sqft · {fmt(comp.salePrice)}
                            </p>
                          </div>
                          {catBadge(comp.category)}
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── Add Your Own Comps ──────────────────────────────────── */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-semibold text-muted uppercase tracking-wider">Add Your Own Comps</label>
                    {manualComps.length > 0 && (
                      <span className="text-muted text-[11px]">{manualComps.length} added</span>
                    )}
                  </div>

                  {manualComps.map((comp) => (
                    <div key={comp.id} className="bg-surface border border-edge rounded-lg p-3 space-y-2.5">

                      {/* Address row */}
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          placeholder="Full address (required)"
                          value={comp.address}
                          onChange={(e) => updateComp(comp.id, "address", e.target.value)}
                          disabled={disabled}
                          className="flex-1 bg-transparent border-b border-edge text-white text-[13px] placeholder:text-muted/50 focus:outline-none focus:border-brand pb-1 transition-colors disabled:opacity-50"
                        />
                        <button
                          type="button"
                          onClick={() => removeManualComp(comp.id)}
                          disabled={disabled}
                          className="text-muted hover:text-red-400 transition-colors disabled:opacity-50 shrink-0"
                        >
                          <X size={14} />
                        </button>
                      </div>

                      {/* Toggle details */}
                      <button
                        type="button"
                        onClick={() => updateComp(comp.id, "expanded", !comp.expanded)}
                        disabled={disabled}
                        className="flex items-center gap-1 text-[11px] text-brand hover:text-brand/80 transition-colors disabled:opacity-50"
                      >
                        <ChevronDown size={12} className={`transition-transform ${comp.expanded ? "rotate-180" : ""}`} />
                        {comp.expanded ? "Hide details" : "Fill in details"}
                        {!comp.expanded && <span className="text-muted normal-case font-normal">(or we'll look up via address)</span>}
                      </button>

                      {comp.expanded && (
                        <div className="space-y-2.5 pt-1 border-t border-edge">

                          {/* Type */}
                          <div>
                            <label className="text-[10px] text-muted uppercase tracking-wider">Comp Type</label>
                            <select
                              value={comp.compType}
                              onChange={(e) => updateComp(comp.id, "compType", e.target.value)}
                              disabled={disabled}
                              className="mt-1 w-full bg-card border border-edge rounded px-2.5 py-1.5 text-white text-[12px] focus:outline-none focus:border-brand appearance-none disabled:opacity-50"
                            >
                              {COMP_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                          </div>

                          {/* Price + Date */}
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[10px] text-muted uppercase tracking-wider">Price Sold</label>
                              <div className="mt-1 flex items-center bg-card border border-edge rounded overflow-hidden focus-within:border-brand transition-colors">
                                <span className="text-muted text-[12px] pl-2">$</span>
                                <input
                                  type="text"
                                  placeholder="0"
                                  value={comp.salePrice}
                                  onChange={(e) => updateComp(comp.id, "salePrice", e.target.value.replace(/[^0-9]/g, ""))}
                                  disabled={disabled}
                                  className="flex-1 bg-transparent px-1.5 py-1.5 text-white text-[12px] focus:outline-none disabled:opacity-50 tabular-nums"
                                />
                              </div>
                            </div>
                            <div>
                              <label className="text-[10px] text-muted uppercase tracking-wider">Last Sold Date</label>
                              <input
                                type="date"
                                value={comp.saleDate}
                                onChange={(e) => updateComp(comp.id, "saleDate", e.target.value)}
                                disabled={disabled}
                                className="mt-1 w-full bg-card border border-edge rounded px-2.5 py-1.5 text-white text-[12px] focus:outline-none focus:border-brand transition-colors disabled:opacity-50"
                              />
                            </div>
                          </div>

                          {/* Beds / Baths / Sqft */}
                          <div className="grid grid-cols-3 gap-2">
                            {(["beds", "baths", "sqft"] as const).map((field) => (
                              <div key={field}>
                                <label className="text-[10px] text-muted uppercase tracking-wider capitalize">{field}</label>
                                <input
                                  type="text"
                                  placeholder="—"
                                  value={comp[field]}
                                  onChange={(e) => updateComp(comp.id, field, e.target.value.replace(/[^0-9.]/g, ""))}
                                  disabled={disabled}
                                  className="mt-1 w-full bg-card border border-edge rounded px-2.5 py-1.5 text-white text-[12px] focus:outline-none focus:border-brand transition-colors disabled:opacity-50 tabular-nums"
                                />
                              </div>
                            ))}
                          </div>

                          {/* Lot Size / Year Built */}
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[10px] text-muted uppercase tracking-wider">Lot Size (sqft)</label>
                              <input
                                type="text"
                                placeholder="—"
                                value={comp.lotSizeSqft}
                                onChange={(e) => updateComp(comp.id, "lotSizeSqft", e.target.value.replace(/[^0-9]/g, ""))}
                                disabled={disabled}
                                className="mt-1 w-full bg-card border border-edge rounded px-2.5 py-1.5 text-white text-[12px] focus:outline-none focus:border-brand transition-colors disabled:opacity-50 tabular-nums"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] text-muted uppercase tracking-wider">Year Built</label>
                              <input
                                type="text"
                                placeholder="—"
                                value={comp.yearBuilt}
                                onChange={(e) => updateComp(comp.id, "yearBuilt", e.target.value.replace(/[^0-9]/g, ""))}
                                disabled={disabled}
                                className="mt-1 w-full bg-card border border-edge rounded px-2.5 py-1.5 text-white text-[12px] focus:outline-none focus:border-brand transition-colors disabled:opacity-50 tabular-nums"
                              />
                            </div>
                          </div>

                          {/* Construction Type */}
                          <div>
                            <label className="text-[10px] text-muted uppercase tracking-wider">Construction Type</label>
                            <select
                              value={comp.constructionType}
                              onChange={(e) => updateComp(comp.id, "constructionType", e.target.value)}
                              disabled={disabled}
                              className="mt-1 w-full bg-card border border-edge rounded px-2.5 py-1.5 text-white text-[12px] focus:outline-none focus:border-brand appearance-none disabled:opacity-50"
                            >
                              {CONSTRUCTION_OPTIONS.map((o) => <option key={o} value={o}>{o || "— None —"}</option>)}
                            </select>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={addManualComp}
                    disabled={disabled}
                    className="flex items-center gap-1.5 w-full justify-center py-2 border border-dashed border-edge rounded-lg text-muted hover:text-white hover:border-brand/50 text-[12px] transition-colors disabled:opacity-50"
                  >
                    <Plus size={13} />
                    Add Comp
                  </button>
                </div>

                {/* Property Photos */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-semibold text-muted uppercase tracking-wider">
                      Property Photos <span className="normal-case text-muted/60 tracking-normal font-normal">(optional)</span>
                    </label>
                    {propertyPhotos.length > 0 && <span className="text-muted text-[11px]">{propertyPhotos.length}/{MAX_PHOTOS}</span>}
                  </div>
                  {propertyPhotos.length > 0 && (
                    <div className="grid grid-cols-5 gap-2">
                      {propertyPhotos.map((photo, i) => (
                        <div key={i} className="relative aspect-square rounded-lg overflow-hidden bg-surface border border-edge group">
                          <img src={`data:${photo.mediaType};base64,${photo.data}`} alt="" className="w-full h-full object-cover" />
                          <button type="button" onClick={() => removePhoto(i)} disabled={disabled}
                            className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity disabled:hidden">
                            <X size={16} className="text-white" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {propertyPhotos.length < MAX_PHOTOS && (
                    <label className={`flex items-center justify-center gap-2 w-full border border-dashed border-edge rounded-lg py-3 transition-colors ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:border-brand/50 hover:bg-brand/5"}`}>
                      <Upload size={14} className="text-muted" />
                      <span className="text-muted text-[12px]">{propertyPhotos.length === 0 ? "Upload your own photos" : "Add more"}</span>
                      <input type="file" accept="image/*" multiple disabled={disabled} onChange={handlePhotoUpload} className="hidden" />
                    </label>
                  )}
                  {propertyPhotos.length > 0 && <p className="text-muted/60 text-[11px]">These will be used instead of listing photos from Zillow.</p>}
                </div>

              </div>

              {/* Submit */}
              <div className="px-6 py-4 border-t border-edge shrink-0">
                <button type="submit" disabled={disabled}
                  className="w-full flex items-center justify-center gap-2 bg-brand hover:bg-brand-hover disabled:opacity-50 disabled:cursor-not-allowed text-white text-[13px] font-semibold py-2.5 rounded-lg transition-colors"
                >
                  {disabled ? <><Loader2 size={15} className="animate-spin" />Re-running...</> : "Re-run Underwriting"}
                </button>
              </div>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
