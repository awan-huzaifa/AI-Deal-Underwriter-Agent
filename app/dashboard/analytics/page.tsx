import { createClient } from "@/lib/supabase/server";
import { BarChart2, DollarSign, TrendingUp, Wrench, MapPin } from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number | null) {
  if (n == null) return "—";
  return "$" + Math.round(n).toLocaleString();
}

function avg(arr: number[]): number | null {
  if (!arr.length) return null;
  return arr.reduce((s, n) => s + n, 0) / arr.length;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-4">
      <h3 className="text-white font-semibold text-[15px]">{title}</h3>
      {sub && <p className="text-muted text-[13px] mt-0.5">{sub}</p>}
    </div>
  );
}

function MetricCard({
  label, value, sub, icon: Icon,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
}) {
  return (
    <div className="bg-card border border-edge rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <span className="text-muted text-[11px] font-semibold uppercase tracking-wider">{label}</span>
        <div className="w-7 h-7 bg-brand/10 rounded-lg flex items-center justify-center">
          <Icon size={13} className="text-brand" strokeWidth={2} />
        </div>
      </div>
      <p className="text-white text-2xl font-semibold leading-none">{value}</p>
      {sub && <p className="text-muted text-[11px] mt-1.5">{sub}</p>}
    </div>
  );
}

function EmptySection({ message }: { message: string }) {
  return (
    <div className="bg-card border border-edge rounded-xl flex items-center justify-center py-14">
      <div className="text-center">
        <BarChart2 size={28} className="text-muted mx-auto mb-3" strokeWidth={1.5} />
        <p className="text-muted text-[13px]">{message}</p>
      </div>
    </div>
  );
}

const CONDITION_ORDER = ["excellent", "good", "fair", "poor"] as const;
const CONDITION_STYLES: Record<string, { bar: string; badge: string; label: string }> = {
  excellent: { bar: "bg-emerald-500",  badge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", label: "Excellent" },
  good:      { bar: "bg-brand",        badge: "bg-brand/10 text-brand border-brand/20",                   label: "Good"      },
  fair:      { bar: "bg-amber-500",    badge: "bg-amber-500/10 text-amber-400 border-amber-500/20",       label: "Fair"      },
  poor:      { bar: "bg-red-500",      badge: "bg-red-500/10 text-red-400 border-red-500/20",             label: "Poor"      },
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function AnalyticsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: rows } = await supabase
    .from("underwriting_reports")
    .select("condition, arv_low, arv_high, repair_cost_low, repair_cost_high, max_offer_low, max_offer_high, investor_profit, property_data")
    .eq("user_id", user!.id);

  const reports = rows ?? [];
  const hasData = reports.length > 0;

  // ── Financial aggregates ──────────────────────────────────────────────────

  const arvMids        = reports.map((r) => ((r.arv_low ?? 0) + (r.arv_high ?? 0)) / 2);
  const maxOfferMids   = reports.map((r) => ((r.max_offer_low ?? 0) + (r.max_offer_high ?? 0)) / 2);
  const repairMids     = reports.map((r) => ((r.repair_cost_low ?? 0) + (r.repair_cost_high ?? 0)) / 2);
  const investorProfits = reports.map((r) => r.investor_profit ?? 0).filter((n) => n > 0);

  const avgARV            = avg(arvMids);
  const avgMaxOffer       = avg(maxOfferMids);
  const avgRepairCost     = avg(repairMids);
  const avgInvestorProfit = avg(investorProfits);

  // ── Market / city aggregates ──────────────────────────────────────────────

  const cityMap = new Map<string, { count: number; arvSum: number }>();
  const zipMap  = new Map<string, number>();

  reports.forEach((r, i) => {
    const prop = r.property_data as any;
    const city = prop?.city?.trim() || "Unknown";
    const zip  = prop?.zip?.trim()  || "Unknown";
    const arv  = arvMids[i];

    if (!cityMap.has(city)) cityMap.set(city, { count: 0, arvSum: 0 });
    cityMap.get(city)!.count++;
    cityMap.get(city)!.arvSum += arv;

    zipMap.set(zip, (zipMap.get(zip) ?? 0) + 1);
  });

  const cityStats = Array.from(cityMap.entries())
    .map(([city, { count, arvSum }]) => ({ city, count, avgARV: arvSum / count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const maxCityCount = cityStats[0]?.count ?? 1;

  // ── Condition aggregates ──────────────────────────────────────────────────

  const conditionStats = CONDITION_ORDER.map((grade) => {
    const subset = reports.filter((r) => r.condition === grade);
    const repairs = subset.map((r) => ((r.repair_cost_low ?? 0) + (r.repair_cost_high ?? 0)) / 2);
    return {
      grade,
      count: subset.length,
      avgRepair: avg(repairs),
    };
  });

  const maxConditionCount = Math.max(...conditionStats.map((c) => c.count), 1);

  // ── Repair cost by condition (for market insights) ────────────────────────

  const repairByCondition = conditionStats.filter((c) => c.count > 0);
  const maxRepair = Math.max(...repairByCondition.map((c) => c.avgRepair ?? 0), 1);

  return (
    <div className="space-y-8 max-w-6xl mx-auto w-full">

      {/* Page header */}
      <div>
        <h2 className="text-white font-semibold text-lg">Analytics</h2>
        <p className="text-muted text-sm mt-0.5">
          {hasData
            ? `Insights across ${reports.length} completed deal${reports.length !== 1 ? "s" : ""}`
            : "Complete your first deal to see analytics"}
        </p>
      </div>

      {/* ── FINANCIAL OVERVIEW ─────────────────────────────────────────────── */}
      <section>
        <SectionHeader
          title="Financial Overview"
          sub="Averages across all completed deals"
        />
        {!hasData ? (
          <EmptySection message="No completed deals yet" />
        ) : (
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            <MetricCard
              label="Avg ARV"
              value={fmt(avgARV)}
              sub="After-repair value"
              icon={TrendingUp}
            />
            <MetricCard
              label="Avg Max Offer"
              value={fmt(avgMaxOffer)}
              sub="Low–high midpoint"
              icon={DollarSign}
            />
            <MetricCard
              label="Avg Repair Cost"
              value={fmt(avgRepairCost)}
              sub="Low–high midpoint"
              icon={Wrench}
            />
            <MetricCard
              label="Avg Investor Profit"
              value={fmt(avgInvestorProfit)}
              sub="Target minimum"
              icon={BarChart2}
            />
          </div>
        )}
      </section>

      {/* ── MARKET INSIGHTS ────────────────────────────────────────────────── */}
      <section>
        <SectionHeader
          title="Market Insights"
          sub="Deal volume and ARV by city, repair cost by condition"
        />
        {!hasData ? (
          <EmptySection message="No market data yet" />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

            {/* Cities table */}
            <div className="bg-card border border-edge rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3.5 border-b border-edge">
                <MapPin size={13} className="text-brand" />
                <p className="text-white text-[13px] font-medium">Most Analyzed Cities</p>
              </div>
              {cityStats.length === 0 ? (
                <p className="text-muted text-[13px] text-center py-10">No city data available</p>
              ) : (
                <div className="divide-y divide-edge">
                  {cityStats.map(({ city, count, avgARV: cityAvgARV }) => (
                    <div key={city} className="px-5 py-3.5 flex items-center gap-4">
                      {/* Bar */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-white text-[13px] font-medium truncate">{city}</span>
                          <span className="text-muted text-[11px] ml-2 shrink-0">
                            {count} deal{count !== 1 ? "s" : ""}
                          </span>
                        </div>
                        <div className="h-1.5 bg-surface rounded-full overflow-hidden">
                          <div
                            className="h-full bg-brand rounded-full transition-all"
                            style={{ width: `${(count / maxCityCount) * 100}%` }}
                          />
                        </div>
                      </div>
                      {/* Avg ARV */}
                      <div className="text-right shrink-0 w-24">
                        <p className="text-white text-[13px] font-semibold">{fmt(cityAvgARV)}</p>
                        <p className="text-muted text-[10px]">avg ARV</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Avg repair cost by condition */}
            <div className="bg-card border border-edge rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3.5 border-b border-edge">
                <Wrench size={13} className="text-brand" />
                <p className="text-white text-[13px] font-medium">Avg Repair Cost by Condition</p>
              </div>
              {repairByCondition.length === 0 ? (
                <p className="text-muted text-[13px] text-center py-10">No data yet</p>
              ) : (
                <div className="divide-y divide-edge">
                  {repairByCondition.map(({ grade, count, avgRepair }) => {
                    const style = CONDITION_STYLES[grade];
                    const pct = avgRepair ? (avgRepair / maxRepair) * 100 : 0;
                    return (
                      <div key={grade} className="px-5 py-3.5">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border ${style.badge}`}>
                              {style.label}
                            </span>
                            <span className="text-muted text-[12px]">{count} deal{count !== 1 ? "s" : ""}</span>
                          </div>
                          <span className="text-white text-[13px] font-semibold">{fmt(avgRepair)}</span>
                        </div>
                        <div className="h-1.5 bg-surface rounded-full overflow-hidden">
                          <div
                            className={`h-full ${style.bar} rounded-full transition-all`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {/* ── CONDITION BREAKDOWN ────────────────────────────────────────────── */}
      <section>
        <SectionHeader
          title="Condition Breakdown"
          sub="Deal count and average repair cost per condition grade selected"
        />
        {!hasData ? (
          <EmptySection message="No condition data yet" />
        ) : (
          <div className="bg-card border border-edge rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-edge">
                  <th className="text-left px-5 py-3 text-[11px] font-semibold text-muted uppercase tracking-wider">Condition</th>
                  <th className="text-right px-5 py-3 text-[11px] font-semibold text-muted uppercase tracking-wider">Deals</th>
                  <th className="text-right px-5 py-3 text-[11px] font-semibold text-muted uppercase tracking-wider">Avg Repair Cost</th>
                  <th className="px-5 py-3 w-48 text-[11px] font-semibold text-muted uppercase tracking-wider">Share</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-edge">
                {conditionStats.map(({ grade, count, avgRepair }) => {
                  const style = CONDITION_STYLES[grade];
                  const pct = (count / maxConditionCount) * 100;
                  return (
                    <tr key={grade} className={count === 0 ? "opacity-40" : ""}>
                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[12px] font-semibold border ${style.badge}`}>
                          {style.label}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <span className="text-white text-[13px] font-semibold">{count}</span>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <span className="text-white text-[13px] font-semibold">{fmt(avgRepair)}</span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="h-2 bg-surface rounded-full overflow-hidden">
                          <div
                            className={`h-full ${style.bar} rounded-full transition-all`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

    </div>
  );
}
