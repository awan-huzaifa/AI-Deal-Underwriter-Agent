import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { searchProperty, searchSimilarSolds } from "@/lib/axesso";
import { calcRepairCosts, calcARV, calcMaxOffer, calcARVAdjustments } from "@/lib/calculations";
import {
  assessPropertyCondition,
  validateAndCategorizeComps,
  generateUnderwritingReport,
} from "@/lib/claude";
import type {
  NormalizedComp,
  ARVResult,
  ConditionGrade,
  UnderwriteRequest,
  UnderwriteResponse,
  UnderwriteErrorResponse,
} from "@/lib/types";

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  // ── Auth guard ──────────────────────────────────────────────────────────────
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json<UnderwriteErrorResponse>(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  // ── Parse + validate body ───────────────────────────────────────────────────
  let body: UnderwriteRequest;
  try {
    body = (await request.json()) as UnderwriteRequest;
  } catch {
    return NextResponse.json<UnderwriteErrorResponse>(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const address = body.address?.trim();
  if (!address) {
    return NextResponse.json<UnderwriteErrorResponse>(
      { error: "address is required" },
      { status: 400 }
    );
  }

  const validGrades: ConditionGrade[] = ["excellent", "good", "fair", "poor"];
  if (!validGrades.includes(body.condition)) {
    return NextResponse.json<UnderwriteErrorResponse>(
      { error: "condition must be excellent, good, fair, or poor" },
      { status: 400 }
    );
  }

  const notes            = body.notes?.trim() || undefined;
  const condition        = body.condition;
  const marketMultiplier = typeof body.marketMultiplier === "number" ? body.marketMultiplier : 1.0;
  const extraItems       = Array.isArray(body.extraItems) ? body.extraItems : [];
  const rerunDealId      = typeof body.dealId === "string" ? body.dealId : null;
  const propertyPhotos   = Array.isArray(body.propertyPhotos) && body.propertyPhotos.length > 0
    ? body.propertyPhotos
    : undefined;

  // Track deal ID so the catch block can mark it failed
  let dealId: string | null = null;

  try {
    // ── STEP 1: Create new deal OR reset existing deal for re-run ───────────
    if (rerunDealId) {
      const { data: existing, error: verifyErr } = await supabase
        .from("deals")
        .select("id")
        .eq("id", rerunDealId)
        .eq("user_id", user.id)
        .single();

      if (verifyErr || !existing) {
        return NextResponse.json<UnderwriteErrorResponse>({ error: "Deal not found" }, { status: 404 });
      }

      await supabase.from("underwriting_reports").delete().eq("deal_id", rerunDealId);
      await supabase.from("deals").update({
        status: "pending",
        recommendation: null,
        arv_low: null,
        arv_high: null,
        max_offer: null,
        error_message: null,
      }).eq("id", rerunDealId);

      dealId = rerunDealId;
    } else {
      const { data: deal, error: createError } = await supabase
        .from("deals")
        .insert({ user_id: user.id, address, status: "pending" })
        .select("id")
        .single();

      if (createError || !deal) {
        throw new Error(`Failed to create deal record: ${createError?.message}`);
      }
      dealId = deal.id as string;
    }

    // ── STEP 2: Axesso — searchProperty (subject property details) ──────────
    const property = await searchProperty(address);
    if (notes) property.notes = notes;
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("[STEP 2] PROPERTY", JSON.stringify(property, null, 2));

    // ── STEP 3: Axesso — searchSimilarSolds (sold comps) ────────────────────
    const soldComps = await searchSimilarSolds(String(property.zpid));
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`[STEP 3] SOLD COMPS (${soldComps.length})`, JSON.stringify(soldComps, null, 2));

    // ── STEP 5: Normalize comps ──────────────────────────────────────────────
    const normalizedComps: NormalizedComp[] = soldComps.map((comp) => ({
      ...comp,
      category: null,
    }));
    const workflowFlags: string[] = [];
    if (soldComps.length === 0) workflowFlags.push("no_comps_available");
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("[STEP 5] USER INPUTS → condition:", condition, "| multiplier:", marketMultiplier, "| extraItems:", JSON.stringify(extraItems));

    // ── STEP 6: Claude Call 1 — Property condition assessment (photos + notes) ─
    const conditionAssessment = await assessPropertyCondition(property, condition, propertyPhotos);
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("[STEP 6] CLAUDE CALL 1 — CONDITION ASSESSMENT", JSON.stringify(conditionAssessment, null, 2));

    // ── STEP 7: Calculate repair costs from user-selected condition grade ─────
    const arvAdjustment = calcARVAdjustments(property);
    const repairCosts   = calcRepairCosts(condition, property.sqft, marketMultiplier, extraItems);
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("[STEP 7] ARV ADJUSTMENT:", arvAdjustment);
    console.log("[STEP 7] REPAIR COSTS", JSON.stringify(repairCosts, null, 2));

    // ── STEP 8: Claude Call 2 — Comp validation and categorization ───────────
    // Skipped when no comps exist
    let validatedComps: NormalizedComp[] = [];
    let compValidation: { validatedComps: NormalizedComp[]; rejectedComps: { compIndex: number; reason: string }[]; analystNotes: string };

    if (normalizedComps.length > 0) {
      compValidation = await validateAndCategorizeComps(normalizedComps, property, condition);
      validatedComps = compValidation.validatedComps;
      console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("[STEP 8] CLAUDE CALL 2 — COMP CATEGORIZATION");
      console.log("  Analyst notes:", compValidation.analystNotes);
      console.log("  Rejected:", JSON.stringify(compValidation.rejectedComps));
      console.log("  Validated comps:", JSON.stringify(validatedComps.map(c => ({ address: c.address, category: c.category, pricePerSqft: c.pricePerSqft })), null, 2));
    } else {
      compValidation = { validatedComps: [], rejectedComps: [], analystNotes: "No comparable sales available for this property." };
      console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("[STEP 8] SKIPPED — no comps to categorize");
    }

    // ── STEP 9: Calculate ARV, net sales price, max offer ────────────────────
    // When no ARV-category comps exist, fall back to Zestimate as ARV basis
    const hasArvComps = validatedComps.some((c) => c.category === "arv");

    let arvResult: ARVResult;
    if (hasArvComps) {
      arvResult = calcARV(validatedComps, property.sqft, arvAdjustment);
    } else if (property.zestimate) {
      const zestimate = property.zestimate;
      const avgPricePerSqft = property.sqft > 0 ? Math.round(zestimate / property.sqft) : 0;
      arvResult = {
        arv: zestimate,
        arvLow:  zestimate * 0.97,
        arvHigh: zestimate * 1.03,
        avgPricePerSqft,
        compsUsed: 0,
        methodology: "simple-average",
      };
      workflowFlags.push(soldComps.length === 0 ? "no_comps_arv_from_zestimate" : "no_arv_comps_arv_from_zestimate");
      console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("[STEP 9] NO ARV COMPS — using Zestimate as ARV:", zestimate);
    } else {
      // No comps and no Zestimate — proceed with ARV unknown, Claude will flag it
      arvResult = { arv: 0, arvLow: 0, arvHigh: 0, avgPricePerSqft: 0, compsUsed: 0, methodology: "simple-average" };
      workflowFlags.push("arv_unavailable");
      console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("[STEP 9] NO ARV COMPS AND NO ZESTIMATE — ARV set to 0, flagged as unavailable");
    }

    const maxOfferResult = calcMaxOffer(arvResult.arv, repairCosts);
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("[STEP 9] ARV RESULT", JSON.stringify(arvResult, null, 2));
    console.log("[STEP 9] MAX OFFER RESULT", JSON.stringify(maxOfferResult, null, 2));

    // ── STEP 10: Claude Call 3 — Final underwriting report ───────────────────
    const report = await generateUnderwritingReport({
      property,
      conditionGrade: condition,
      marketMultiplier,
      condition: conditionAssessment,
      repairs: repairCosts,
      arv: arvResult,
      validatedComps,
      financials: maxOfferResult,
      flags: workflowFlags,
    });
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("[STEP 10] CLAUDE CALL 3 — FINAL REPORT");
    console.log("  Recommendation:", report.recommendation, "| Confidence:", report.confidenceScore);
    console.log("  Executive summary:", report.executiveSummary);
    console.log("  Red flags:", report.redFlags);
    console.log("  Green flags:", report.greenFlags);
    console.log("  Full report:", JSON.stringify(report, null, 2));

    // ── STEP 11: Save completed report to underwriting_reports ──────────────
    const { error: reportError } = await supabase
      .from("underwriting_reports")
      .insert({
        deal_id: dealId,
        user_id: user.id,
        address: property.address,
        beds: property.beds,
        baths: property.baths,
        sqft: Number(property.sqft),
        year_built: property.yearBuilt,
        condition: condition,
        arv_low: arvResult.arvLow,
        arv_high: arvResult.arvHigh,
        avg_price_per_sqft: arvResult.avgPricePerSqft,
        net_sales_price: maxOfferResult.netSalesPrice,
        repair_cost_low: repairCosts.low,
        repair_cost_high: repairCosts.high,
        investor_profit: maxOfferResult.investorProfit,
        max_offer_low: maxOfferResult.maxOfferLow,
        max_offer_high: maxOfferResult.maxOfferHigh,
        property_data: property,
        comps: validatedComps,
        calculations: { arvResult, repairCosts, maxOfferResult },
        ai_assessment: {
          conditionAssessment,
          analystNotes: compValidation.analystNotes,
          executiveSummary: report.executiveSummary,
          propertyNarrative: report.propertyNarrative,
          marketNarrative: report.marketNarrative,
          redFlags: report.redFlags,
          greenFlags: report.greenFlags,
        },
        flags: report.flags,
        recommendation: report.recommendation,
        confidence: String(report.confidenceScore),
        summary: report.executiveSummary,
      });

    if (reportError) {
      throw new Error(`Failed to save report: ${reportError.message}`);
    }

    // ── STEP 12: Update deal status to completed ─────────────────────────────
    const { error: dealUpdateError } = await supabase
      .from("deals")
      .update({
        status: "completed",
        recommendation: report.recommendation,
        arv_low: arvResult.arvLow,
        arv_high: arvResult.arvHigh,
        max_offer: maxOfferResult.maxOfferLow,
      })
      .eq("id", dealId);

    if (dealUpdateError) {
      throw new Error(`Failed to update deal status: ${dealUpdateError.message}`);
    }

    // ── STEP 13: Return final report to frontend ─────────────────────────────
    return NextResponse.json<UnderwriteResponse>({ dealId: dealId!, report });

  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";

    // Mark deal failed — fire-and-forget so we return promptly
    if (dealId) {
      await supabase
        .from("deals")
        .update({ status: "failed" })
        .eq("id", dealId)
        .then(() => void 0);
    }

    console.error(`[underwrite] deal=${dealId ?? "none"} error:`, err);

    return NextResponse.json<UnderwriteErrorResponse>(
      { error: message, ...(dealId && { dealId }) },
      { status: 500 }
    );
  }
}
