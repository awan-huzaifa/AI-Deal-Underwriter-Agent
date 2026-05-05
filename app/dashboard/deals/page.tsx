import { createClient } from "@/lib/supabase/server";
import { Building2 } from "lucide-react";
import { NewDealModal } from "@/components/dashboard/new-deal-modal";
import { DealsTable } from "@/components/dashboard/deals-table";
import { cleanupStuckDeals } from "@/app/actions/deals";

export default async function DealsPage() {
  await cleanupStuckDeals();

  const supabase = await createClient();

  const { data: deals } = await supabase
    .from("deals")
    .select("id, address, status, recommendation, arv_low, arv_high, max_offer, created_at")
    .order("created_at", { ascending: false });

  const rows = deals ?? [];

  return (
    <div className="space-y-5 max-w-6xl mx-auto w-full">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-white font-semibold text-lg">Deals</h2>
          <p className="text-muted text-sm mt-0.5">{rows.length} deal{rows.length !== 1 ? "s" : ""} total</p>
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

      {/* Empty state */}
      {rows.length === 0 && (
        <div className="bg-card border border-edge rounded-xl flex flex-col items-center justify-center py-20 px-6 text-center">
          <div className="w-12 h-12 bg-brand/10 rounded-xl flex items-center justify-center mb-4">
            <Building2 size={20} className="text-brand" strokeWidth={1.5} />
          </div>
          <p className="text-white font-medium text-sm mb-1.5">No deals yet</p>
          <p className="text-muted text-[13px] mb-6 max-w-[300px] leading-relaxed">
            Run your first underwriting analysis to see results here.
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
      )}

      {/* Table */}
      {rows.length > 0 && <DealsTable deals={rows} />}
    </div>
  );
}
