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
  ManualComp,
  UnderwriteRequest,
  UnderwriteResponse,
  UnderwriteErrorResponse,
} from "@/lib/types";

// ── Resolve a user-entered manual comp into a NormalizedComp ──────────────────
async function resolveManualComp(comp: ManualComp): Promise<NormalizedComp> {
  const hasSufficientData = comp.salePrice != null && comp.sqft != null && comp.sqft > 0;

  if (hasSufficientData) {
    const sqft = comp.sqft!;
    const salePrice = comp.salePrice!;
    return {
      address: comp.address,
      salePrice,
      saleDate: comp.saleDate ?? "",
      sqft,
      pricePerSqft: Math.round(salePrice / sqft),
      beds: comp.beds ?? 0,
      baths: comp.baths ?? 0,
      photos: [],
      category: comp.compType ?? null,
    };
  }

  // Address-only: call searchProperty to fill in property details
  try {
    const property = await searchProperty(comp.address);
    const lastSale = [...(property.priceHistory ?? [])]
      .filter((h) => h.event?.toLowerCase().includes("sold"))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

    const sqft = comp.sqft ?? property.sqft ?? 0;
    const salePrice = comp.salePrice ?? lastSale?.price ?? 0;
    return {
      address: comp.address,
      salePrice,
      saleDate: comp.saleDate ?? lastSale?.date ?? "",
      sqft,
      pricePerSqft: sqft > 0 ? Math.round(salePrice / sqft) : 0,
      beds: comp.beds ?? property.beds ?? 0,
      baths: comp.baths ?? property.baths ?? 0,
      photos: property.photos?.slice(0, 3) ?? [],
      category: comp.compType ?? null,
    };
  } catch {
    const sqft = comp.sqft ?? 0;
    const salePrice = comp.salePrice ?? 0;
    return {
      address: comp.address,
      salePrice,
      saleDate: comp.saleDate ?? "",
      sqft,
      pricePerSqft: sqft > 0 ? Math.round(salePrice / sqft) : 0,
      beds: comp.beds ?? 0,
      baths: comp.baths ?? 0,
      photos: [],
      category: comp.compType ?? null,
    };
  }
}

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

  const notes              = body.notes?.trim() || undefined;
  const condition          = body.condition;
  const marketMultiplier   = typeof body.marketMultiplier === "number" ? body.marketMultiplier : 1.0;
  const extraItems         = Array.isArray(body.extraItems) ? body.extraItems : [];
  const investorProfitPct  = typeof body.investorProfitPct === "number"
    ? Math.max(0.01, Math.min(0.99, body.investorProfitPct))
    : 0.15;
  const assignmentFee      = typeof body.assignmentFee === "number"
    ? Math.max(0, body.assignmentFee)
    : 22_500;
  const rerunDealId        = typeof body.dealId === "string" ? body.dealId : null;
  const propertyPhotos     = Array.isArray(body.propertyPhotos) && body.propertyPhotos.length > 0
    ? body.propertyPhotos
    : undefined;
  const baseComps          = rerunDealId && Array.isArray(body.baseComps) ? body.baseComps as NormalizedComp[] : null;
  const manualCompsInput   = Array.isArray(body.manualComps) ? body.manualComps as ManualComp[] : [];
  const arvOverride        = body.arvOverride?.mode && typeof body.arvOverride.value === "number" && body.arvOverride.value > 0
    ? body.arvOverride
    : null;

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
      // Reuse an existing failed row for the same address instead of creating a new one
      const { data: existingFailed } = await supabase
        .from("deals")
        .select("id")
        .eq("user_id", user.id)
        .eq("address", address)
        .eq("status", "failed")
        .limit(1)
        .single();

      if (existingFailed) {
        await supabase.from("deals").update({
          status: "pending",
          recommendation: null,
          arv_low: null,
          arv_high: null,
          max_offer: null,
          error_message: null,
        }).eq("id", existingFailed.id);
        dealId = existingFailed.id as string;
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
    }

    // ── STEP 2: Axesso — searchProperty (subject property details) ──────────
    const property = await searchProperty(address);
    if (!property.zpid || !property.address) {
      throw new Error("Property not found — please enter a valid property address.");
    }
    if (notes) property.notes = notes;
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("[STEP 2] PROPERTY", JSON.stringify(property, null, 2));

    // ── STEP 3: Comps — fetch from Axesso (fresh deal) or reuse stored (re-run) ─
    let normalizedComps: NormalizedComp[];
    let compsFetchedFresh = false;

    if (baseComps !== null) {
      // Re-run: skip Axesso — use the stored comps the user chose to keep.
      // Preserve user-set categories (locked); null means "let Claude decide".
      normalizedComps = baseComps.map((c) => ({ ...c }));
      console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log(`[STEP 3] RE-RUN — skipping searchSimilarSolds, using ${normalizedComps.length} stored base comps`);
    } else {
      const soldComps = await searchSimilarSolds(String(property.zpid));
      normalizedComps = soldComps.map((comp) => ({ ...comp, category: null as NormalizedComp["category"] }));
      compsFetchedFresh = true;
      console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log(`[STEP 3] FRESH — fetched ${soldComps.length} comps from Axesso`, JSON.stringify(soldComps, null, 2));
    }

    // ── STEP 4: Resolve manual comps ─────────────────────────────────────────
    const resolvedManualComps: NormalizedComp[] = manualCompsInput.length > 0
      ? await Promise.all(manualCompsInput.map(resolveManualComp))
      : [];
    if (resolvedManualComps.length > 0) {
      console.log(`[STEP 4] MANUAL COMPS resolved (${resolvedManualComps.length}):`, JSON.stringify(resolvedManualComps.map(c => ({ address: c.address, category: c.category, salePrice: c.salePrice })), null, 2));
    }

    // ── STEP 5: Merge + split for Claude ─────────────────────────────────────
    const allComps = [...normalizedComps, ...resolvedManualComps];
    // Comps where user pre-assigned a category bypass Claude entirely
    const lockedComps  = allComps.filter((c) => c.category !== null);
    const compsForClaude = allComps.filter((c) => c.category === null);

    const workflowFlags: string[] = [];
    if (allComps.length === 0) workflowFlags.push("no_comps_available");
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`[STEP 5] allComps: ${allComps.length} | forClaude: ${compsForClaude.length} | locked: ${lockedComps.length}`);
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
    // Only comps with category=null go to Claude. Locked comps (user-specified
    // type) are merged back in after without Claude touching their category.
    let validatedComps: NormalizedComp[] = [];
    let compValidation: { validatedComps: NormalizedComp[]; rejectedComps: { compIndex: number; reason: string }[]; analystNotes: string };

    if (compsForClaude.length > 0) {
      compValidation = await validateAndCategorizeComps(compsForClaude, property, condition);
      validatedComps = [...compValidation.validatedComps, ...lockedComps];
      console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("[STEP 8] CLAUDE CALL 2 — COMP CATEGORIZATION");
      console.log("  Analyst notes:", compValidation.analystNotes);
      console.log("  Rejected:", JSON.stringify(compValidation.rejectedComps));
      console.log("  Claude-validated:", compValidation.validatedComps.length, "| locked:", lockedComps.length);
      console.log("  All validated comps:", JSON.stringify(validatedComps.map(c => ({ address: c.address, category: c.category, pricePerSqft: c.pricePerSqft })), null, 2));
    } else if (lockedComps.length > 0) {
      // All comps were user-specified — skip Claude Call 2 entirely
      validatedComps = lockedComps;
      compValidation = { validatedComps: lockedComps, rejectedComps: [], analystNotes: "All comps were user-specified with locked categories." };
      console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("[STEP 8] SKIPPED — all comps are user-locked");
    } else {
      compValidation = { validatedComps: [], rejectedComps: [], analystNotes: "No comparable sales available for this property." };
      console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("[STEP 8] SKIPPED — no comps to categorize");
    }

    // ── STEP 9: Calculate ARV, net sales price, max offer ────────────────────
    // When no ARV-category comps exist, fall back to Zestimate as ARV basis
    const hasArvComps = validatedComps.some((c) => c.category === "arv");

    let arvResult: ARVResult;
    if (arvOverride) {
      const arv = arvOverride.mode === "per_sqft"
        ? arvOverride.value * property.sqft + arvAdjustment
        : arvOverride.value;
      const avgPricePerSqft = arvOverride.mode === "per_sqft"
        ? arvOverride.value
        : (property.sqft > 0 ? Math.round(arv / property.sqft) : 0);
      arvResult = {
        arv,
        arvLow:  arv * 0.97,
        arvHigh: arv * 1.03,
        avgPricePerSqft,
        compsUsed: 0,
        methodology: "simple-average",
      };
      workflowFlags.push(arvOverride.mode === "per_sqft" ? "arv_manual_per_sqft_override" : "arv_manual_fixed_override");
      console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log(`[STEP 9] MANUAL ARV OVERRIDE — mode: ${arvOverride.mode} | value: ${arvOverride.value} | arv: ${arv}`);
    } else if (hasArvComps) {
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
      workflowFlags.push(allComps.length === 0 ? "no_comps_arv_from_zestimate" : "no_arv_comps_arv_from_zestimate");
      console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("[STEP 9] NO ARV COMPS — using Zestimate as ARV:", zestimate);
    } else {
      // No comps and no Zestimate — proceed with ARV unknown, Claude will flag it
      arvResult = { arv: 0, arvLow: 0, arvHigh: 0, avgPricePerSqft: 0, compsUsed: 0, methodology: "simple-average" };
      workflowFlags.push("arv_unavailable");
      console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("[STEP 9] NO ARV COMPS AND NO ZESTIMATE — ARV set to 0, flagged as unavailable");
    }

    const maxOfferResult = calcMaxOffer(arvResult.arv, repairCosts, investorProfitPct, assignmentFee);
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
