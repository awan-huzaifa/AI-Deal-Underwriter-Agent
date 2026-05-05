import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, XCircle, AlertCircle, AlertTriangle } from "lucide-react";
import { PrintButton } from "@/components/dashboard/print-button";
import { DownloadPDFButton } from "@/components/dashboard/download-pdf-button";
import { RerunDealModal } from "@/components/dashboard/rerun-deal-modal";
import type { ConditionGrade } from "@/lib/types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined) {
  if (n == null) return "—";
  return "$" + Math.round(n).toLocaleString();
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });
}

// ── Badges ────────────────────────────────────────────────────────────────────

function RecommendationBadge({ value }: { value: string }) {
  const map: Record<string, { style: string; icon: React.ReactNode }> = {
    pursue:    { style: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", icon: <CheckCircle2 size={12} /> },
    negotiate: { style: "bg-amber-500/10 text-amber-400 border-amber-500/20",      icon: <AlertCircle size={12} /> },
    pass:      { style: "bg-red-500/10 text-red-400 border-red-500/20",            icon: <XCircle size={12} /> },
  };
  const { style, icon } = map[value] ?? map.negotiate;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[12px] font-semibold border capitalize ${style}`}>
      {icon}{value}
    </span>
  );
}

function ConditionBadge({ grade }: { grade: string }) {
  const map: Record<string, string> = {
    excellent: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    good:      "bg-brand/10 text-brand border-brand/20",
    fair:      "bg-amber-500/10 text-amber-400 border-amber-500/20",
    poor:      "bg-red-500/10 text-red-400 border-red-500/20",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[12px] font-semibold border capitalize ${map[grade] ?? map.fair}`}>
      {grade}
    </span>
  );
}

function CategoryBadge({ cat }: { cat: string | null }) {
  if (!cat) return <span className="text-muted text-[11px]">—</span>;
  const map: Record<string, string> = {
    arv:       "bg-brand/10 text-brand border-brand/20",
    turnkey:   "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    as_is:     "bg-amber-500/10 text-amber-400 border-amber-500/20",
    cash_sale: "bg-violet-500/10 text-violet-400 border-violet-500/20",
  };
  const labels: Record<string, string> = {
    arv: "ARV", turnkey: "Turnkey", as_is: "As-Is", cash_sale: "Cash Sale",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border ${map[cat] ?? ""}`}>
      {labels[cat] ?? cat}
    </span>
  );
}

function flagStyle(flag: string) {
  const f = flag.toLowerCase();
  if (/verify|confirm|check/.test(f))
    return "bg-amber-500/10 text-amber-400 border-amber-500/20";
  if (/no |missing|unknown|risk|conflict/.test(f))
    return "bg-red-500/10 text-red-400 border-red-500/20";
  return "bg-brand/10 text-brand border-brand/20";
}

// ── Metric card ───────────────────────────────────────────────────────────────

function MetricCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-surface border border-edge rounded-xl p-4">
      <p className="text-muted text-[11px] font-semibold uppercase tracking-wider mb-2">{label}</p>
      <p className="text-white text-xl font-semibold leading-none">{value}</p>
      {sub && <p className="text-muted text-[11px] mt-1.5">{sub}</p>}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function DealDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: deal }, { data: report }] = await Promise.all([
    supabase.from("deals").select("*").eq("id", id).single(),
    supabase.from("underwriting_reports").select("*").eq("deal_id", id).single(),
  ]);

  if (!deal) notFound();

  const ai        = report?.ai_assessment as any ?? {};
  const condition = ai.conditionAssessment ?? {};
  const calc      = report?.calculations  as any ?? {};
  const repairs   = calc.repairCosts      ?? {};
  const prop      = report?.property_data as any ?? {};
  const comps: any[]  = report?.comps  ?? [];
  const flags: string[] = report?.flags ?? [];

  return (
    <div className="space-y-5 max-w-5xl mx-auto w-full">

      {/* Back + header */}
      <div>
        <Link href="/dashboard/deals" className="inline-flex items-center gap-1.5 text-muted hover:text-white text-[13px] transition-colors mb-4 print:hidden">
          <ArrowLeft size={14} />
          Back to Deals
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-white font-semibold text-lg leading-snug">{deal.address}</h2>
            <p className="text-muted text-sm mt-0.5">{fmtDate(deal.created_at)}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {report?.condition && <ConditionBadge grade={report.condition} />}
            {deal.recommendation && <RecommendationBadge value={deal.recommendation} />}
            {report?.confidence && (
              <span className="text-muted text-[12px] font-medium">
                {report.confidence}/10 confidence
              </span>
            )}
            {report && (
              <RerunDealModal
                dealId={id}
                address={deal.address}
                initialCondition={(report.condition as ConditionGrade) ?? "fair"}
                initialMultiplier={repairs.marketMultiplier ?? 1.0}
                initialCheckedItems={repairs.checkedExtraItems ?? []}
              />
            )}
            <DownloadPDFButton dealId={id} />
            <PrintButton />
          </div>
        </div>
      </div>

      {/* Financials grid */}
      {report && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MetricCard
            label="ARV Range"
            value={`${fmt(report.arv_low)} — ${fmt(report.arv_high)}`}
            sub={`Avg ${fmt(report.avg_price_per_sqft)}/sqft`}
          />
          <MetricCard
            label="Max Offer"
            value={`${fmt(report.max_offer_low)} — ${fmt(report.max_offer_high)}`}
          />
          <MetricCard
            label="Repair Costs"
            value={`${fmt(report.repair_cost_low)} — ${fmt(report.repair_cost_high)}`}
          />
          <MetricCard
            label="Net Sales Price"
            value={fmt(report.net_sales_price)}
            sub={`Investor profit: ${fmt(report.investor_profit)}`}
          />
        </div>
      )}

      {/* Executive summary */}
      {ai.executiveSummary && (
        <div className="bg-card border border-edge rounded-xl p-5">
          <p className="text-muted text-[11px] font-semibold uppercase tracking-wider mb-3">Executive Summary</p>
          <p className="text-white text-[13px] leading-relaxed">{ai.executiveSummary}</p>
        </div>
      )}

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Left column */}
        <div className="space-y-5">

          {/* Condition Assessment */}
          {condition.score != null && (
            <div className="bg-card border border-edge rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-muted text-[11px] font-semibold uppercase tracking-wider">Condition Assessment</p>
                <div className="flex items-center gap-2">
                  <span className="text-muted text-[12px]">Score {condition.score}/10</span>
                  {report?.condition && <ConditionBadge grade={report.condition} />}
                </div>
              </div>
              {condition.summary && (
                <p className="text-white text-[13px] leading-relaxed mb-4">{condition.summary}</p>
              )}
              {condition.lineItems?.length > 0 && (
                <div className="space-y-2.5 border-t border-edge pt-4">
                  {condition.lineItems.map((item: any, i: number) => (
                    <div key={i} className="flex gap-3 text-[12px]">
                      <span className="text-brand font-medium shrink-0 capitalize w-24">{item.category}</span>
                      <span className="text-muted leading-relaxed">{item.notes}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Repair Breakdown */}
          {repairs.condition && (
            <div className="bg-card border border-edge rounded-xl p-5">
              <p className="text-muted text-[11px] font-semibold uppercase tracking-wider mb-4">Repair Breakdown</p>
              <div className="space-y-2.5">
                <div className="flex justify-between text-[13px]">
                  <span className="text-muted">Condition grade</span>
                  <ConditionBadge grade={repairs.condition} />
                </div>
                <div className="flex justify-between text-[13px]">
                  <span className="text-muted">Market multiplier</span>
                  <span className="text-white font-medium">{repairs.marketMultiplier}×</span>
                </div>
                <div className="flex justify-between text-[13px]">
                  <span className="text-muted">Rate ($/sqft)</span>
                  <span className="text-white font-medium">${repairs.per_sqft_low} — ${repairs.per_sqft_high}</span>
                </div>
                <div className="flex justify-between text-[13px]">
                  <span className="text-muted">Base cost</span>
                  <span className="text-white font-medium">{fmt(repairs.baseLow)} — {fmt(repairs.baseHigh)}</span>
                </div>

                {repairs.checkedExtraItems?.length > 0 && (
                  <div className="border-t border-edge pt-2.5 mt-2.5 space-y-2">
                    <p className="text-muted text-[11px] font-semibold uppercase tracking-wider">Extra Items</p>
                    {repairs.checkedExtraItems.map((item: any, i: number) => (
                      <div key={i} className="flex justify-between text-[12px]">
                        <span className="text-muted">{item.label}</span>
                        <span className="text-white">{fmt(item.cost)}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex justify-between text-[13px] border-t border-edge pt-2.5 mt-1">
                  <span className="text-white font-semibold">Total Repair Range</span>
                  <span className="text-white font-semibold">{fmt(repairs.low)} — {fmt(repairs.high)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Property details */}
          {report && (
            <div className="bg-card border border-edge rounded-xl p-5">
              <p className="text-muted text-[11px] font-semibold uppercase tracking-wider mb-4">Property</p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-3">

                {/* Beds with warning */}
                <div>
                  <p className="text-muted text-[11px]">Beds</p>
                  <p className="text-white text-[13px] font-medium mt-0.5">{report.beds}</p>
                  {report.beds === 0 && (
                    <div className="flex items-start gap-1.5 mt-1.5">
                      <AlertTriangle size={11} className="text-amber-400 shrink-0 mt-0.5" />
                      <p className="text-amber-400 text-[11px] leading-relaxed">
                        Bedroom count unverified — public records may be inaccurate. Verify on site.
                      </p>
                    </div>
                  )}
                </div>

                <div>
                  <p className="text-muted text-[11px]">Baths</p>
                  <p className="text-white text-[13px] font-medium mt-0.5">{report.baths}</p>
                </div>
                <div>
                  <p className="text-muted text-[11px]">Sqft</p>
                  <p className="text-white text-[13px] font-medium mt-0.5">{Number(report.sqft).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-muted text-[11px]">Year Built</p>
                  <p className="text-white text-[13px] font-medium mt-0.5">{report.year_built ?? "—"}</p>
                </div>

                {prop.zestimate && (
                  <div>
                    <p className="text-muted text-[11px]">Zestimate</p>
                    <p className="text-white text-[13px] font-medium mt-0.5">{fmt(prop.zestimate)}</p>
                  </div>
                )}

                <div>
                  <p className="text-muted text-[11px]">Pool</p>
                  <p className={`text-[13px] font-medium mt-0.5 ${prop.hasPrivatePool ? "text-emerald-400" : "text-muted"}`}>
                    {prop.hasPrivatePool ? "Yes" : "No"}
                  </p>
                </div>
                <div>
                  <p className="text-muted text-[11px]">Garage</p>
                  <p className={`text-[13px] font-medium mt-0.5 ${prop.hasGarage ? "text-emerald-400" : "text-muted"}`}>
                    {prop.hasGarage ? "Yes" : "No"}
                  </p>
                </div>
              </div>

              {/* Construction materials */}
              {prop.constructionMaterials?.length > 0 && (
                <div className="mt-3 pt-3 border-t border-edge">
                  <p className="text-muted text-[11px] mb-1.5">Construction</p>
                  <p className="text-white text-[13px] font-medium">{prop.constructionMaterials.join(", ")}</p>
                </div>
              )}

              {/* Cooling + Heating */}
              {(prop.cooling?.length > 0 || prop.heating?.length > 0) && (
                <div className="mt-3 pt-3 border-t border-edge grid grid-cols-2 gap-x-6 gap-y-3">
                  {prop.cooling?.length > 0 && (
                    <div>
                      <p className="text-muted text-[11px] mb-1">Cooling</p>
                      <p className="text-white text-[13px] font-medium">{prop.cooling.join(", ")}</p>
                    </div>
                  )}
                  {prop.heating?.length > 0 && (
                    <div>
                      <p className="text-muted text-[11px] mb-1">Heating</p>
                      <p className="text-white text-[13px] font-medium">{prop.heating.join(", ")}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Red / green flags */}
          {(ai.redFlags?.length > 0 || ai.greenFlags?.length > 0) && (
            <div className="bg-card border border-edge rounded-xl p-5 space-y-4">
              {ai.greenFlags?.length > 0 && (
                <div>
                  <p className="text-emerald-400 text-[11px] font-semibold uppercase tracking-wider mb-2">Green Flags</p>
                  <ul className="space-y-1.5">
                    {ai.greenFlags.map((f: string, i: number) => (
                      <li key={i} className="flex gap-2 text-[12px] text-white">
                        <CheckCircle2 size={13} className="text-emerald-400 shrink-0 mt-0.5" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {ai.redFlags?.length > 0 && (
                <div>
                  <p className="text-red-400 text-[11px] font-semibold uppercase tracking-wider mb-2">Red Flags</p>
                  <ul className="space-y-1.5">
                    {ai.redFlags.map((f: string, i: number) => (
                      <li key={i} className="flex gap-2 text-[12px] text-white">
                        <XCircle size={13} className="text-red-400 shrink-0 mt-0.5" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-5">

          {/* Comps table */}
          {comps.length > 0 && (
            <div className="bg-card border border-edge rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-edge">
                <p className="text-muted text-[11px] font-semibold uppercase tracking-wider">Comparable Sales</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-edge">
                      <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-muted uppercase tracking-wider">Address</th>
                      <th className="text-right px-3 py-2.5 text-[10px] font-semibold text-muted uppercase tracking-wider">Price</th>
                      <th className="text-right px-3 py-2.5 text-[10px] font-semibold text-muted uppercase tracking-wider">$/Sqft</th>
                      <th className="text-right px-4 py-2.5 text-[10px] font-semibold text-muted uppercase tracking-wider">Type</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-edge">
                    {comps.map((comp: any, i: number) => (
                      <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                        <td className="px-4 py-3">
                          <p className="text-white text-[12px] leading-snug">{comp.address}</p>
                          <p className="text-muted text-[11px] mt-0.5">{comp.beds}bd/{comp.baths}ba · {comp.sqft?.toLocaleString()} sqft · {comp.saleDate}</p>
                        </td>
                        <td className="px-3 py-3 text-right text-white text-[12px] font-medium">{fmt(comp.salePrice)}</td>
                        <td className="px-3 py-3 text-right text-muted text-[12px]">{fmt(comp.pricePerSqft)}</td>
                        <td className="px-4 py-3 text-right"><CategoryBadge cat={comp.category} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Property narrative */}
          {ai.propertyNarrative && (
            <div className="bg-card border border-edge rounded-xl p-5">
              <p className="text-muted text-[11px] font-semibold uppercase tracking-wider mb-3">Property Narrative</p>
              <p className="text-white text-[13px] leading-relaxed">{ai.propertyNarrative}</p>
            </div>
          )}

          {/* Market narrative */}
          {ai.marketNarrative && (
            <div className="bg-card border border-edge rounded-xl p-5">
              <p className="text-muted text-[11px] font-semibold uppercase tracking-wider mb-3">Market Narrative</p>
              <p className="text-white text-[13px] leading-relaxed">{ai.marketNarrative}</p>
            </div>
          )}

          {/* Workflow flags */}
          {flags.length > 0 && (
            <div className="bg-card border border-edge rounded-xl p-5">
              <p className="text-muted text-[11px] font-semibold uppercase tracking-wider mb-3">Workflow Flags</p>
              <div className="flex flex-wrap gap-2">
                {flags.map((f, i) => (
                  <span key={i} className={`px-2.5 py-1 rounded-lg border text-[11px] font-medium ${flagStyle(f)}`}>
                    {f.replace(/_/g, " ")}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
