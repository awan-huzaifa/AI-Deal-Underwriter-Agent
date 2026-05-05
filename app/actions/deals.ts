"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function cleanupStuckDeals() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("deals")
    .update({ status: "failed", error_message: "Pipeline timed out — marked failed automatically" })
    .eq("user_id", user.id)
    .eq("status", "pending")
    .lt("created_at", new Date(Date.now() - 10 * 60 * 1000).toISOString());
}

export async function deleteDeal(dealId: string) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  await supabase.from("underwriting_reports").delete().eq("deal_id", dealId);
  await supabase.from("deals").delete().eq("id", dealId).eq("user_id", user.id);

  revalidatePath("/dashboard/deals");
}

export async function deleteDeals(dealIds: string[]) {
  if (!dealIds.length) return;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  await supabase.from("underwriting_reports").delete().in("deal_id", dealIds);
  await supabase.from("deals").delete().in("id", dealIds).eq("user_id", user.id);

  revalidatePath("/dashboard/deals");
}
