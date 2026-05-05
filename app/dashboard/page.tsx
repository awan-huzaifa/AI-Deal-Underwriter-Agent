import { createClient } from "@/lib/supabase/server";
import { Building2, DollarSign, TrendingUp, CheckCircle2, AlertCircle, XCircle } from "lucide-react";
import { NewDealModal } from "@/components/dashboard/new-deal-modal";
import Link from "next/link";
import { cleanupStuckDeals } from "@/app/actions/deals";

function fmt(n: number | null | undefined) {
  if (n == null) return "—";
  return "$" + Math.round(n).toLocaleString();
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

function RecommendationBadge({ value }: { value: string | null }) {
  if (!value) return <span className="text-muted text-[11px]">—</span>;
  const map: Record<string, { style: string; icon: React.ReactNode }> = {
    pursue:    { style: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", icon: <CheckCircle2 size={11} /> },
    negotiate: { style: "bg-amber-500/10 text-amber-400 border-amber-500/20",      icon: <AlertCircle size={11} /> },
    pass:      { style: "bg-red-500/10 text-red-400 border-red-500/20",            icon: <XCircle size={11} /> },
  };
  const { style, icon } = map[value] ?? map.negotiate;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border capitalize ${style}`}>
      {icon}{value}
    </span>
  );
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    completed: "bg-emerald-400",
    pending:   "bg-amber-400",
    failed:    "bg-red-400",
  };
  return <span className={`inline-block w-1.5 h-1.5 rounded-full ${colors[status] ?? "bg-muted"}`} />;
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  await cleanupStuckDeals();

  const handle = user?.email?.split("@")[0] ?? "there";

  const { data: deals } = await supabase
    .from("deals")
    .select("id, address, status, recommendation, arv_low, arv_high, max_offer, created_at")
    .order("created_at", { ascending: false });

  const rows = deals ?? [];
  const recent = rows.slice(0, 5);

  const totalDeals     = rows.length;
  const completedDeals = rows.filter((d) => d.status === "completed");
  const portfolioValue = completedDeals.reduce((sum, d) => sum + (d.max_offer ?? 0), 0);
  const pursueCount    = completedDeals.filter((d) => d.recommendation === "pursue").length;
  const pursueRate     = completedDeals.length > 0
    ? Math.round((pursueCount / completedDeals.length) * 100)
    : null;

  return (
    <div className="space-y-6 max-w-6xl mx-auto w-full">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-white font-semibold text-lg">Welcome back, {handle}</h2>
          <p className="text-muted text-sm mt-0.5">Here&apos;s what&apos;s happening with your deals.</p>
        </div>
        <NewDealModal
          trigger={
            <button className="flex items-center gap-1.5 bg-brand hover:bg-brand-hover text-white text-[13px] font-semibold px-4 py-2.5 rounded-lg transition-colors shrink-0">
              <span className="text-base leading-none">+</span>
              New Deal
            </button>
          }
        />
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-card border border-edge rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <span className="text-muted text-[11px] font-semibold uppercase tracking-wider">Total Deals</span>
            <div className="w-7 h-7 bg-brand/10 rounded-lg flex items-center justify-center">
              <Building2 size={13} className="text-brand" strokeWidth={2} />
            </div>
          </div>
          <p className="text-white text-2xl font-semibold leading-none">{totalDeals}</p>
          {completedDeals.length > 0 && (
            <p className="text-muted text-[11px] mt-1.5">{completedDeals.length} completed</p>
          )}
        </div>

        <div className="bg-card border border-edge rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <span className="text-muted text-[11px] font-semibold uppercase tracking-wider">Pipeline Value</span>
            <div className="w-7 h-7 bg-brand/10 rounded-lg flex items-center justify-center">
              <DollarSign size={13} className="text-brand" strokeWidth={2} />
            </div>
          </div>
          <p className="text-white text-2xl font-semibold leading-none">
            {portfolioValue > 0 ? fmt(portfolioValue) : "—"}
          </p>
          {portfolioValue > 0 && (
            <p className="text-muted text-[11px] mt-1.5">Sum of max offers</p>
          )}
        </div>

        <div className="bg-card border border-edge rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <span className="text-muted text-[11px] font-semibold uppercase tracking-wider">Pursue Rate</span>
            <div className="w-7 h-7 bg-brand/10 rounded-lg flex items-center justify-center">
              <TrendingUp size={13} className="text-brand" strokeWidth={2} />
            </div>
          </div>
          <p className="text-white text-2xl font-semibold leading-none">
            {pursueRate != null ? `${pursueRate}%` : "—"}
          </p>
          {pursueRate != null && (
            <p className="text-muted text-[11px] mt-1.5">{pursueCount} of {completedDeals.length} deals</p>
          )}
        </div>

        <div className="bg-card border border-edge rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <span className="text-muted text-[11px] font-semibold uppercase tracking-wider">Pending</span>
            <div className="w-7 h-7 bg-brand/10 rounded-lg flex items-center justify-center">
              <span className="w-2 h-2 rounded-full bg-amber-400 block" />
            </div>
          </div>
          <p className="text-white text-2xl font-semibold leading-none">
            {rows.filter((d) => d.status === "pending").length}
          </p>
          <p className="text-muted text-[11px] mt-1.5">In progress</p>
        </div>
      </div>

      {/* Recent Deals */}
      <div className="bg-card border border-edge rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-edge">
          <h3 className="text-white font-medium text-[13px]">Recent Deals</h3>
          {rows.length > 0 && (
            <Link href="/dashboard/deals" className="text-brand text-[12px] font-medium hover:text-brand-hover transition-colors">
              View all
            </Link>
          )}
        </div>

        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <div className="w-12 h-12 bg-brand/10 rounded-xl flex items-center justify-center mb-4">
              <Building2 size={20} className="text-brand" strokeWidth={1.5} />
            </div>
            <p className="text-white font-medium text-sm mb-1.5">No deals yet</p>
            <p className="text-muted text-[13px] mb-6 max-w-[300px] leading-relaxed">
              Add a property address and let AI generate a full underwriting analysis in seconds.
            </p>
            <NewDealModal
              trigger={
                <button className="flex items-center gap-1.5 bg-brand hover:bg-brand-hover text-white text-[13px] font-semibold px-4 py-2.5 rounded-lg transition-colors">
                  <span>+</span>
                  Create your first deal
                </button>
              }
            />
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-edge">
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-muted uppercase tracking-wider">Address</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted uppercase tracking-wider">Recommendation</th>
                <th className="text-right px-4 py-3 text-[11px] font-semibold text-muted uppercase tracking-wider">Max Offer</th>
                <th className="text-right px-5 py-3 text-[11px] font-semibold text-muted uppercase tracking-wider">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-edge">
              {recent.map((deal) => (
                <tr key={deal.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-5 py-3.5">
                    <Link href={`/dashboard/deals/${deal.id}`} className="flex items-center gap-2 group">
                      <StatusDot status={deal.status} />
                      <p className="text-white text-[13px] font-medium leading-snug group-hover:text-brand transition-colors">{deal.address}</p>
                    </Link>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="text-muted text-[12px] capitalize">{deal.status}</span>
                  </td>
                  <td className="px-4 py-3.5">
                    <RecommendationBadge value={deal.recommendation} />
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <span className="text-brand text-[13px] font-semibold">{fmt(deal.max_offer)}</span>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <span className="text-muted text-[12px]">{fmtDate(deal.created_at)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
