import Anthropic from "@anthropic-ai/sdk";
import type {
  PropertyDetails,
  NormalizedComp,
  ConditionAssessment,
  CompValidation,
  UnderwritingReport,
  ReportGenerationInput,
  CompCategory,
  ConditionGrade,
  DealRecommendation,
  UploadedPhoto,
} from "@/lib/types";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MODEL: Anthropic.Model = "claude-opus-4-7";

function extractJSON(text: string): string {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  return match ? match[1] : text.trim();
}

type Base64Source = {
  type: "base64";
  media_type: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
  data: string;
};

async function fetchImageAsBase64(url: string): Promise<Base64Source | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const contentType = (res.headers.get("content-type") ?? "image/jpeg").split(";")[0].trim();
    const validTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    const media_type = (validTypes.includes(contentType) ? contentType : "image/jpeg") as Base64Source["media_type"];
    const data = Buffer.from(await res.arrayBuffer()).toString("base64");
    return { type: "base64", media_type, data };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CLAUDE CALL 1  (STEP 6)
// ─────────────────────────────────────────────────────────────────────────────
export async function assessPropertyCondition(
  property: PropertyDetails,
  conditionGrade: ConditionGrade,
  uploadedPhotos?: UploadedPhoto[]
): Promise<ConditionAssessment> {
  const system = `You are an experienced real estate inspector. Analyze the property photos and any agent notes provided.
Return ONLY valid JSON — no markdown, no explanation — with this exact schema:
{
  "score": <integer 1–10>,
  "summary": "<string>",
  "lineItems": [{ "category": "<string>", "notes": "<string>" }]
}

Describe what you observe in each visible area: kitchen, bathrooms, flooring, HVAC, roof, exterior, and any other notable areas.
Do NOT assign a repair tier or estimate costs — only provide qualitative observations.
score is an overall condition score from 1 (severely distressed) to 10 (fully renovated/like new).

IMPORTANT — data conflicts: The property details (beds, baths, sqft, year built, condition grade, etc.) come from public records which are often inaccurate. If the agent notes provide different values for any of these fields, always trust and use the agent notes over the public records data. Reflect the agent-provided information in your assessment.`;

  let imageBlocks: Anthropic.ImageBlockParam[];
  let photoSource: string;

  if (uploadedPhotos && uploadedPhotos.length > 0) {
    imageBlocks = uploadedPhotos.map((photo) => ({
      type: "image" as const,
      source: {
        type: "base64" as const,
        media_type: photo.mediaType,
        data: photo.data,
      },
    }));
    photoSource = `user-uploaded (${imageBlocks.length} photos)`;
  } else {
    imageBlocks = (
      await Promise.all(
        property.photos.map(async (url) => {
          const source = await fetchImageAsBase64(url);
          if (!source) return null;
          return { type: "image" as const, source } as Anthropic.ImageBlockParam;
        })
      )
    ).filter((b) => b !== null) as Anthropic.ImageBlockParam[];
    photoSource = `axesso (${imageBlocks.length} of ${property.photos.length} urls)`;
  }

  const textBlock1: Anthropic.TextBlockParam = {
    type: "text",
    text: `Address: ${property.address}\nBeds: ${property.beds} | Baths: ${property.baths} | Sqft: ${property.sqft}\nYear built: ${property.yearBuilt} | Type: ${property.propertyType}`,
  };
  const textBlock2: Anthropic.TextBlockParam = {
    type: "text",
    text: `The agent has assessed this property as: ${conditionGrade} condition.\nValidate this assessment based on what you see in the photos. If you observe something significantly different, flag it clearly.${property.notes ? `\n\nAgent notes: ${property.notes}` : ""}\n\nReturn JSON only.`,
  };

  const userContent: Anthropic.MessageParam["content"] = [
    textBlock1,
    ...imageBlocks,
    textBlock2,
  ];

  console.log("\n" + "═".repeat(60));
  console.log("CLAUDE CALL 1 — assessPropertyCondition");
  console.log("═".repeat(60));
  console.log("[CALL 1] SYSTEM PROMPT:\n", system);
  console.log("[CALL 1] USER TEXT BLOCK 1:\n", textBlock1.text);
  console.log("[CALL 1] USER TEXT BLOCK 2:\n", textBlock2.text);
  console.log(`[CALL 1] PHOTO SOURCE: ${photoSource}`);
  console.log("[CALL 1] MODEL:", MODEL, "| max_tokens: 2048");

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system,
    messages: [{ role: "user", content: userContent }],
  });

  const text = (response.content[0] as Anthropic.TextBlock).text;
  console.log("[CALL 1] RAW RESPONSE:\n", text);
  console.log("[CALL 1] USAGE:", JSON.stringify(response.usage));

  const parsed = JSON.parse(extractJSON(text)) as { score: number; summary: string; lineItems: { category: string; notes: string }[] };
  console.log("[CALL 1] PARSED OUTPUT:", JSON.stringify(parsed, null, 2));

  return { score: parsed.score, summary: parsed.summary, lineItems: parsed.lineItems };
}

// ─────────────────────────────────────────────────────────────────────────────
// CLAUDE CALL 2  (STEP 8)
// ─────────────────────────────────────────────────────────────────────────────
export async function validateAndCategorizeComps(
  comps: NormalizedComp[],
  subject: PropertyDetails,
  conditionGrade: ConditionGrade
): Promise<CompValidation> {
  const system = `You are a senior real estate appraiser. Categorize each comparable sale provided.
Return ONLY valid JSON — no markdown, no explanation — with this exact schema:
{
  "validatedComps": [{ "compIndex": <integer>, "category": "arv" | "turnkey" | "as_is" | "cash_sale" }],
  "rejectedComps": [{ "compIndex": <integer>, "reason": "<string>" }],
  "analystNotes": "<string>"
}

compIndex is the Comp # number shown in the input (1-based).

Category definitions:
- arv: renovated/updated sale — good comparable to post-repair ARV
- turnkey: move-in ready but not fully renovated
- as_is: sold in distressed/unrepaired condition
- cash_sale: likely investor/cash transaction, may not reflect retail value

Reject comps that are not single-family, are condos/townhomes, or are clearly non-arms-length.`;

  const subjectBlock: Anthropic.TextBlockParam = {
    type: "text",
    text: `Subject: ${subject.address} | ${subject.beds}bd/${subject.baths}ba | ${subject.sqft} sqft | Built ${subject.yearBuilt} | ${subject.propertyType}\nSubject condition (user selected): ${conditionGrade}\nContext: This property needs comps that reflect its POST-REPAIR value. ARV comps must be fully renovated properties — not just move-in ready.${subject.notes ? `\nAgent notes: ${subject.notes}` : ""}\n\nCategorize each comp below. Reject any non-arms-length sales.`,
  };

  const compBlockArrays = await Promise.all(
    comps.map(async (c, i) => {
      const textBlock: Anthropic.TextBlockParam = {
        type: "text",
        text: `Comp #${i + 1}: ${c.address} | $${c.salePrice.toLocaleString()} | $${Math.round(c.pricePerSqft)}/sqft | ${c.sqft} sqft | ${c.beds}bd/${c.baths}ba | sold ${c.saleDate}`,
      };
      const photoBlocks = (
        await Promise.all(
          c.photos.map(async (url) => {
            const source = await fetchImageAsBase64(url);
            if (!source) return null;
            return { type: "image" as const, source } as Anthropic.ImageBlockParam;
          })
        )
      ).filter((b) => b !== null) as Anthropic.ImageBlockParam[];
      return [textBlock, ...photoBlocks] as Anthropic.ContentBlockParam[];
    })
  );
  const compBlocks = compBlockArrays.flat();

  console.log("\n" + "═".repeat(60));
  console.log("CLAUDE CALL 2 — validateAndCategorizeComps");
  console.log("═".repeat(60));
  console.log("[CALL 2] SYSTEM PROMPT:\n", system);
  console.log("[CALL 2] SUBJECT BLOCK:\n", subjectBlock.text);
  console.log(`[CALL 2] TOTAL COMPS SENT: ${comps.length}`);
  comps.forEach((c, i) => {
    console.log(`[CALL 2] COMP #${i + 1}:`, {
      address: c.address,
      salePrice: c.salePrice,
      pricePerSqft: Math.round(c.pricePerSqft),
      sqft: c.sqft,
      beds: c.beds,
      baths: c.baths,
      saleDate: c.saleDate,
      photoCount: c.photos.length,
      photoUrls: c.photos,
    });
  });
  console.log("[CALL 2] MODEL:", MODEL, "| max_tokens: 2048");

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system,
    messages: [{ role: "user", content: [subjectBlock, ...compBlocks] }],
  });

  const text = (response.content[0] as Anthropic.TextBlock).text;
  console.log("[CALL 2] RAW RESPONSE:\n", text);
  console.log("[CALL 2] USAGE:", JSON.stringify(response.usage));

  const parsed = JSON.parse(extractJSON(text)) as {
    validatedComps: { compIndex: number; category: CompCategory }[];
    rejectedComps: { compIndex: number; reason: string }[];
    analystNotes: string;
  };
  console.log("[CALL 2] PARSED OUTPUT:", JSON.stringify(parsed, null, 2));

  const rejectedIndices = new Set(parsed.rejectedComps.map((r) => r.compIndex));

  const validatedComps: NormalizedComp[] = comps
    .map((c, i) => {
      const compIndex = i + 1;
      if (rejectedIndices.has(compIndex)) return null;
      const match = parsed.validatedComps.find((v) => v.compIndex === compIndex);
      return { ...c, category: match?.category ?? null };
    })
    .filter((c): c is NormalizedComp => c !== null);

  console.log("[CALL 2] FINAL VALIDATED COMPS:", JSON.stringify(
    validatedComps.map((c) => ({ address: c.address, category: c.category, salePrice: c.salePrice, pricePerSqft: c.pricePerSqft })),
    null, 2
  ));
  console.log("[CALL 2] REJECTED COMPS:", JSON.stringify(parsed.rejectedComps, null, 2));
  console.log("[CALL 2] ANALYST NOTES:", parsed.analystNotes);

  return {
    validatedComps,
    rejectedComps: parsed.rejectedComps,
    analystNotes: parsed.analystNotes,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CLAUDE CALL 3  (STEP 10)
// ─────────────────────────────────────────────────────────────────────────────
export async function generateUnderwritingReport(
  input: ReportGenerationInput
): Promise<UnderwritingReport> {
  const system = `You are a senior underwriter at a real estate investment firm. Synthesize the deal data and generate a comprehensive underwriting narrative.
Return ONLY valid JSON — no markdown, no explanation — with this exact schema:
{
  "executiveSummary": "<string>",
  "propertyNarrative": "<string>",
  "marketNarrative": "<string>",
  "redFlags": ["<string>"],
  "greenFlags": ["<string>"],
  "recommendation": "pursue" | "negotiate" | "pass",
  "confidenceScore": <integer 1–10>,
  "additionalFlags": ["<string>"]
}

Recommendation criteria:
- pursue: max offer covers repairs + investor profit with comfortable margin
- negotiate: deal works but offer needs to come down or numbers are tight
- pass: deal does not work at current numbers or risk is too high

Investor profit minimums:
- ARV above $500k → $50,000 minimum
- ARV $350k–$500k → $40,000 minimum
- ARV below $350k → $30,000 minimum

Always flag if any of the following are present:
no central HVAC, aluminum windows, no permits pulled, tenant occupied, public records sqft differs from actual sqft, foundation issues, comps located outside the immediate neighborhood.

If the workflow flags include "no_comps_arv_from_zestimate" or "no_comps_arv_from_zestimate": the ARV is based solely on the Zestimate, not comparable sales. Make this prominent in your executiveSummary and propertyNarrative. Lower your confidenceScore accordingly (cap at 5) and flag this as a red flag. Recommend "negotiate" or "pass" unless the numbers are exceptionally strong.
If the workflow flags include "arv_unavailable": no comparable sales or Zestimate were available. ARV cannot be determined. Set confidenceScore to 1, recommendation to "pass", and make clear in executiveSummary that the deal cannot be underwritten without ARV data. Focus your assessment on the property condition only.`;

  const arvComps = input.validatedComps.filter((c) => c.category === "arv");
  const turnkeyComps = input.validatedComps.filter((c) => c.category === "turnkey");
  const asIsComps = input.validatedComps.filter((c) => c.category === "as_is");
  const cashComps = input.validatedComps.filter((c) => c.category === "cash_sale");

  const bundle = {
    property: input.property,
    conditionGrade: input.conditionGrade,
    marketMultiplier: input.marketMultiplier,
    condition: input.condition,
    repairs: input.repairs,
    arv: input.arv,
    financials: input.financials,
    arvComps,
    turnkeyComps,
    asIsComps,
    cashComps,
    flags: input.flags,
    ...(input.property.notes ? { agentNotes: input.property.notes } : {}),
  };

  console.log("\n" + "═".repeat(60));
  console.log("CLAUDE CALL 3 — generateUnderwritingReport");
  console.log("═".repeat(60));
  console.log("[CALL 3] SYSTEM PROMPT:\n", system);
  console.log("[CALL 3] INPUT BUNDLE:\n", JSON.stringify(bundle, null, 2));
  console.log("[CALL 3] COMP BREAKDOWN → arv:", arvComps.length, "| turnkey:", turnkeyComps.length, "| as_is:", asIsComps.length, "| cash_sale:", cashComps.length);
  console.log("[CALL 3] MODEL:", MODEL, "| max_tokens: 4096");

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system,
    messages: [{ role: "user", content: JSON.stringify(bundle) }],
  });

  const text = (response.content[0] as Anthropic.TextBlock).text;
  console.log("[CALL 3] RAW RESPONSE:\n", text);
  console.log("[CALL 3] USAGE:", JSON.stringify(response.usage));

  const claudeOutput = JSON.parse(extractJSON(text)) as {
    executiveSummary: string;
    propertyNarrative: string;
    marketNarrative: string;
    redFlags: string[];
    greenFlags: string[];
    recommendation: DealRecommendation;
    confidenceScore: number;
    additionalFlags?: string[];
  };
  console.log("[CALL 3] PARSED OUTPUT:", JSON.stringify(claudeOutput, null, 2));

  const finalReport: UnderwritingReport = {
    address: input.property.address,
    generatedAt: new Date().toISOString(),
    property: input.property,
    soldComps: input.validatedComps,
    condition: input.condition,
    repairs: input.repairs,
    arv: input.arv,
    financials: input.financials,
    flags: [...input.flags, ...(claudeOutput.additionalFlags ?? [])],
    executiveSummary: claudeOutput.executiveSummary,
    propertyNarrative: claudeOutput.propertyNarrative,
    marketNarrative: claudeOutput.marketNarrative,
    redFlags: claudeOutput.redFlags,
    greenFlags: claudeOutput.greenFlags,
    recommendation: claudeOutput.recommendation,
    confidenceScore: claudeOutput.confidenceScore,
  };

  console.log("[CALL 3] FINAL REPORT FLAGS:", finalReport.flags);
  console.log("[CALL 3] RECOMMENDATION:", finalReport.recommendation, "| CONFIDENCE:", finalReport.confidenceScore);

  return finalReport;
}
