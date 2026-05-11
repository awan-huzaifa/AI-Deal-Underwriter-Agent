import type {
  ConditionGrade,
  ExtraItem,
  NormalizedComp,
  PropertyDetails,
  RepairCosts,
  ARVResult,
  MaxOfferResult,
} from "@/lib/types";

// ─── Constants ────────────────────────────────────────────────────────────────

const ARV_LOW_FACTOR = 0.97;
const ARV_HIGH_FACTOR = 1.03;
const NET_SALES_FACTOR = 0.92;
const CLOSING_COST_FACTOR = 0.02;
const REALTOR_FEE_FACTOR = 0.06;

const REPAIR_PER_SQFT: Record<ConditionGrade, { low: number; high: number }> = {
  excellent: { low: 0,  high: 15 },
  good:      { low: 25, high: 35 },
  fair:      { low: 40, high: 50 },
  poor:      { low: 55, high: 65 },
};

// ─────────────────────────────────────────────────────────────────────────────
// STEP 7 — Repair costs from user-selected condition grade
// ─────────────────────────────────────────────────────────────────────────────
export function calcRepairCosts(
  condition: ConditionGrade,
  sqft: number,
  marketMultiplier: number,
  extraItems: ExtraItem[]
): RepairCosts {
  const range = REPAIR_PER_SQFT[condition];

  console.log("\n" + "─".repeat(50));
  console.log("CALC — calcRepairCosts");
  console.log("─".repeat(50));
  console.log("[calcRepairCosts] INPUTS → condition:", condition, "| sqft:", sqft, "| marketMultiplier:", marketMultiplier);
  console.log("[calcRepairCosts] REPAIR RATE FOR CONDITION → low: $", range.low, "/sqft | high: $", range.high, "/sqft");
  console.log("[calcRepairCosts] ALL extraItems:", JSON.stringify(extraItems, null, 2));

  const baseLow  = Math.round(range.low  * sqft * marketMultiplier);
  const baseHigh = Math.round(range.high * sqft * marketMultiplier);

  console.log("[calcRepairCosts] BASE CALC → baseLow:", range.low, "×", sqft, "×", marketMultiplier, "=", baseLow);
  console.log("[calcRepairCosts] BASE CALC → baseHigh:", range.high, "×", sqft, "×", marketMultiplier, "=", baseHigh);

  const checkedExtraItems = extraItems
    .filter((item) => item.checked)
    .map(({ label, cost }) => ({ label, cost }));

  const extraItemsTotal = checkedExtraItems.reduce((sum, i) => sum + i.cost, 0);

  console.log("[calcRepairCosts] CHECKED EXTRA ITEMS:", JSON.stringify(checkedExtraItems, null, 2));
  console.log("[calcRepairCosts] extraItemsTotal:", extraItemsTotal);

  const result: RepairCosts = {
    condition,
    sqft,
    marketMultiplier,
    per_sqft_low:  range.low,
    per_sqft_high: range.high,
    baseLow,
    baseHigh,
    extraItemsTotal,
    low:  baseLow  + extraItemsTotal,
    high: baseHigh + extraItemsTotal,
    checkedExtraItems,
  };

  console.log("[calcRepairCosts] OUTPUT:", JSON.stringify(result, null, 2));

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// ARV adjustments — property features that add value above the comp average
// ─────────────────────────────────────────────────────────────────────────────
export function calcARVAdjustments(property: PropertyDetails): number {
  console.log("\n" + "─".repeat(50));
  console.log("CALC — calcARVAdjustments");
  console.log("─".repeat(50));
  console.log("[calcARVAdjustments] INPUTS → constructionMaterials:", property.constructionMaterials, "| hasPrivatePool:", property.hasPrivatePool, "| hasGarage:", property.hasGarage, "| hasOffStreetParking:", property.hasOffStreetParking);

  let adjustment = 0;

  const materials = property.constructionMaterials.map((m) => m.toLowerCase());
  const hasPremiumMaterial = materials.some((m) => m.includes("concrete") || m.includes("brick") || m.includes("stone"));
  if (hasPremiumMaterial) {
    adjustment += 17_500;
    console.log("[calcARVAdjustments] constructionMaterials match (concrete/brick/stone) → +$17,500");
  } else {
    console.log("[calcARVAdjustments] constructionMaterials no premium match → +$0");
  }

  if (property.hasPrivatePool) {
    adjustment += 30_000;
    console.log("[calcARVAdjustments] hasPrivatePool = true → +$30,000");
  } else {
    console.log("[calcARVAdjustments] hasPrivatePool = false → +$0");
  }

  if (property.hasGarage) {
    adjustment += 15_000;
    console.log("[calcARVAdjustments] hasGarage = true → +$15,000");
  } else {
    console.log("[calcARVAdjustments] hasGarage = false → +$0");
  }

  if (property.hasOffStreetParking) {
    adjustment += 10_000;
    console.log("[calcARVAdjustments] hasOffStreetParking = true → +$10,000");
  } else {
    console.log("[calcARVAdjustments] hasOffStreetParking = false → +$0");
  }

  console.log("[calcARVAdjustments] TOTAL ARV ADJUSTMENT: $" + adjustment.toLocaleString());

  return adjustment;
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 9a — Simple unweighted average ARV from 'arv'-category comps
// ─────────────────────────────────────────────────────────────────────────────
export function calcARV(
  comps: NormalizedComp[],
  subjectSqft: number,
  arvAdjustment = 0
): ARVResult {
  console.log("\n" + "─".repeat(50));
  console.log("CALC — calcARV");
  console.log("─".repeat(50));
  console.log("[calcARV] INPUTS → subjectSqft:", subjectSqft, "| arvAdjustment: $" + arvAdjustment.toLocaleString());
  console.log("[calcARV] ALL COMPS RECEIVED:", comps.length);
  comps.forEach((c, i) => {
    console.log(`[calcARV] comp #${i + 1}: ${c.address} | category: ${c.category} | $${c.pricePerSqft}/sqft | salePrice: $${c.salePrice.toLocaleString()}`);
  });

  const arvComps = comps.filter((c) => c.category === "arv");
  console.log("[calcARV] ARV-CATEGORY COMPS USED:", arvComps.length);
  arvComps.forEach((c, i) => {
    console.log(`[calcARV] arv comp #${i + 1}: ${c.address} | $${c.pricePerSqft}/sqft`);
  });

  if (arvComps.length === 0) {
    throw new Error(
      "No ARV comps available — comps must be categorized by Claude before calling calcARV"
    );
  }

  const avgPricePerSqft =
    arvComps.reduce((sum, c) => sum + c.pricePerSqft, 0) / arvComps.length;

  console.log("[calcARV] avgPricePerSqft:", avgPricePerSqft.toFixed(2), "( sum:", arvComps.reduce((s, c) => s + c.pricePerSqft, 0).toFixed(2), "/ count:", arvComps.length, ")");

  const arv = avgPricePerSqft * subjectSqft + arvAdjustment;

  console.log("[calcARV] ARV CALC →", avgPricePerSqft.toFixed(2), "×", subjectSqft, "+", arvAdjustment, "=", arv.toFixed(2));

  const result: ARVResult = {
    arv,
    arvLow:  arv * ARV_LOW_FACTOR,
    arvHigh: arv * ARV_HIGH_FACTOR,
    avgPricePerSqft,
    compsUsed: arvComps.length,
    methodology: "simple-average",
  };

  console.log("[calcARV] OUTPUT:", JSON.stringify(result, null, 2));

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 9b — Full offer stack from ARV + repair range
// ─────────────────────────────────────────────────────────────────────────────
export function calcMaxOffer(arv: number, repairs: RepairCosts, investorProfitPct = 0.15, assignmentFee = 22_500): MaxOfferResult {
  console.log("\n" + "─".repeat(50));
  console.log("CALC — calcMaxOffer");
  console.log("─".repeat(50));
  console.log("[calcMaxOffer] INPUTS → arv: $" + arv.toLocaleString() + " | repairs.low: $" + repairs.low.toLocaleString() + " | repairs.high: $" + repairs.high.toLocaleString() + " | investorProfitPct: " + (investorProfitPct * 100).toFixed(1) + "% | assignmentFee: $" + assignmentFee.toLocaleString());

  const netSalesPrice  = arv * NET_SALES_FACTOR;
  const closingCosts   = arv * CLOSING_COST_FACTOR;
  const realtorFees    = arv * REALTOR_FEE_FACTOR;
  const investorProfit = netSalesPrice * investorProfitPct;

  console.log("[calcMaxOffer] netSalesPrice:", arv, "×", NET_SALES_FACTOR, "=", netSalesPrice.toFixed(2));
  console.log("[calcMaxOffer] closingCosts:", arv, "×", CLOSING_COST_FACTOR, "=", closingCosts.toFixed(2));
  console.log("[calcMaxOffer] realtorFees:", arv, "×", REALTOR_FEE_FACTOR, "=", realtorFees.toFixed(2));
  console.log("[calcMaxOffer] investorProfit:", netSalesPrice.toFixed(2), "×", investorProfitPct, "=", investorProfit.toFixed(2));
  console.log("[calcMaxOffer] assignmentFee: $" + assignmentFee.toLocaleString());
  console.log("[calcMaxOffer] maxOfferLow:", netSalesPrice.toFixed(2), "-", repairs.high, "-", investorProfit.toFixed(2), "-", assignmentFee, "=", (netSalesPrice - repairs.high - investorProfit - assignmentFee).toFixed(2));
  console.log("[calcMaxOffer] maxOfferHigh:", netSalesPrice.toFixed(2), "-", repairs.low, "-", investorProfit.toFixed(2), "-", assignmentFee, "=", (netSalesPrice - repairs.low - investorProfit - assignmentFee).toFixed(2));

  const result: MaxOfferResult = {
    netSalesPrice,
    closingCosts,
    realtorFees,
    investorProfitPct,
    investorProfit,
    assignmentFee,
    maxOfferLow:  netSalesPrice - repairs.high - investorProfit - assignmentFee,
    maxOfferHigh: netSalesPrice - repairs.low  - investorProfit - assignmentFee,
  };

  console.log("[calcMaxOffer] OUTPUT:", JSON.stringify(result, null, 2));

  return result;
}
