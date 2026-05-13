// ─── Deal record ──────────────────────────────────────────────────────────────

export type DealStatus = "pending" | "completed" | "failed";

export interface Deal {
  id: string;
  user_id: string;
  address: string;
  status: DealStatus;
  report: UnderwritingReport | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Condition grade (user-selected) ─────────────────────────────────────────

export type ConditionGrade = "excellent" | "good" | "fair" | "poor";

export interface ExtraItem {
  label: string;
  cost: number;
  checked: boolean;
}

// ─── Axesso: Subject property ─────────────────────────────────────────────────

export interface PriceHistoryItem {
  date: string;
  price: number;
  pricePerSqft: number;
  event: string;
}

export interface PropertyDetails {
  zpid: number;
  listingType: string;
  address: string;
  notes?: string;
  city: string;
  state: string;
  zip: string;
  beds: number;
  baths: number;
  sqft: number;
  lotSizeSqft: number;
  yearBuilt: number;
  propertyType: string; // 'single-family' | 'condo' | 'multi-family' | etc.
  constructionMaterials: string[];
  cooling: string[];
  heating: string[];
  flooring: string[];
  roofType: string | null;
  stories: number | null;
  hasPrivatePool: boolean;
  hasGarage: boolean;
  hasOffStreetParking: boolean;
  homeStatus: string;
  daysOnZillow: number | null;
  priceHistory: PriceHistoryItem[];
  isBankOwned: boolean;
  isPreforeclosure: boolean;
  isAnyForeclosure: boolean;
  isFSBO: boolean;
  photos: string[]; // public image URLs — passed to Claude calls
  neighborhood: string | null;
  subdivision: string | null;
  zestimate: number | null;
  taxAssessedValue: number | null;
  lastSalePrice: number | null;
  lastSaleDate: string | null; // ISO date
}

// ─── Axesso: Sold comps ───────────────────────────────────────────────────────

export interface SoldComp {
  zpid: string;
  address: string;
  salePrice: number;
  saleDate: string; // ISO date
  beds: number;
  baths: number;
  sqft: number;
  lotSizeSqft: number;
  pricePerSqft: number;
  distanceMiles: number;
  propertyType: string;
  daysOnMarket: number | null;
  yearBuilt: number | null;
  photos: string[];
}

// ─── Axesso: Active listings ──────────────────────────────────────────────────

export interface ActiveListing {
  address: string;
  listPrice: number;
  listDate: string; // ISO date
  beds: number;
  baths: number;
  sqft: number;
  pricePerSqft: number;
  distanceMiles: number;
  daysOnMarket: number;
  yearBuilt: number | null;
  photos: string[];
}

// ─── Normalized / filtered comps ──────────────────────────────────────────────

// Assigned by Claude in Step 8. Only 'arv' comps are used in ARV calculation.
export type CompCategory = "arv" | "turnkey" | "as_is";

export interface NormalizedComp {
  address: string;
  salePrice: number;
  saleDate: string; // ISO date
  sqft: number;
  lotSizeSqft?: number;
  pricePerSqft: number;
  beds: number;
  baths: number;
  photos: string[];
  // Set by Claude (Step 8). null until categorization runs.
  category: CompCategory | null;
}

// ─── Claude Call 1: Property condition ────────────────────────────────────────

export interface ConditionLineItem {
  category: string;
  notes: string;
}

export interface ConditionAssessment {
  score: number; // 1–10 overall condition score
  summary: string;
  lineItems: ConditionLineItem[];
}

// ─── Repair costs (Step 7) ────────────────────────────────────────────────────

export interface RepairCosts {
  condition: ConditionGrade;
  sqft: number;
  marketMultiplier: number;
  per_sqft_low: number;
  per_sqft_high: number;
  baseLow: number;
  baseHigh: number;
  extraItemsTotal: number;
  low: number;  // baseLow + extraItemsTotal
  high: number; // baseHigh + extraItemsTotal
  checkedExtraItems: { label: string; cost: number }[];
}

// ─── Claude Call 2: Comp validation + categorization ─────────────────────────

export interface RejectedComp {
  compIndex: number;
  reason: string;
}

export interface CompValidation {
  // NormalizedComps with category populated. Turnkey/as_is shown as
  // reference on the report; only arv comps feed calcARV.
  validatedComps: NormalizedComp[];
  rejectedComps: RejectedComp[];
  analystNotes: string;
}

// ─── ARV result (Step 9a) ─────────────────────────────────────────────────────

export interface ARVResult {
  arv: number;
  arvLow: number; // arv × 0.97
  arvHigh: number; // arv × 1.03
  avgPricePerSqft: number; // simple average over arv-category, non-outlier comps
  compsUsed: number;
  methodology: "simple-average";
}

// ─── Max offer result (Step 9b) ───────────────────────────────────────────────

export interface MaxOfferResult {
  netSalesPrice: number; // ARV × 0.92
  closingCosts: number; // ARV × 0.02
  realtorFees: number; // ARV × 0.06
  investorProfitPct: number; // e.g. 0.15 = 15% of netSalesPrice
  investorProfit: number; // netSalesPrice × investorProfitPct
  assignmentFee: number; // minimum assignment fee, default 22500
  maxOfferLow: number; // netSalesPrice − repairs.high − investorProfit − assignmentFee
  maxOfferHigh: number; // netSalesPrice − repairs.low  − investorProfit − assignmentFee
}

// ─── Claude Call 3: Final underwriting report ─────────────────────────────────

export type DealRecommendation = "pursue" | "negotiate" | "pass";

export interface UnderwritingReport {
  address: string;
  generatedAt: string; // ISO datetime
  property: PropertyDetails;
  soldComps: NormalizedComp[];
  condition: ConditionAssessment;
  repairs: RepairCosts;
  arv: ARVResult;
  financials: MaxOfferResult;
  // Accumulated workflow + Claude flags.
  // Examples: 'sqft_range_expanded', 'distance_expanded', 'comp_older_6_months',
  //           'tenant_occupied', 'no_permits', 'major_road_comp', 'cross_arterial_comp'
  flags: string[];
  executiveSummary: string;
  propertyNarrative: string;
  marketNarrative: string;
  redFlags: string[];
  greenFlags: string[];
  recommendation: DealRecommendation;
  confidenceScore: number; // 1–10
}

// ─── Claude Call 3 input bundle ───────────────────────────────────────────────

export interface ReportGenerationInput {
  property: PropertyDetails;
  conditionGrade: ConditionGrade;
  marketMultiplier: number;
  condition: ConditionAssessment;
  repairs: RepairCosts;
  arv: ARVResult;
  validatedComps: NormalizedComp[];
  financials: MaxOfferResult;
  flags: string[];
}

// ─── API request / response ───────────────────────────────────────────────────

export interface UploadedPhoto {
  data: string; // base64, no data: prefix
  mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
}

export interface ManualComp {
  address: string;
  compType?: CompCategory;    // if set, category is pre-assigned and Claude skips it
  salePrice?: number;
  saleDate?: string;          // ISO date
  beds?: number;
  baths?: number;
  sqft?: number;
  lotSizeSqft?: number;
  yearBuilt?: number;
  constructionType?: string;
}

export interface UnderwriteRequest {
  address: string;
  notes?: string;
  condition: ConditionGrade;
  marketMultiplier: number;
  extraItems: ExtraItem[];
  investorProfitPct?: number;   // 0–1, defaults to 0.15
  assignmentFee?: number;       // defaults to 22500
  dealId?: string;              // present on re-run
  propertyPhotos?: UploadedPhoto[];
  baseComps?: NormalizedComp[]; // re-run: stored comps minus user-excluded ones
  manualComps?: ManualComp[];   // re-run: comps entered manually by user
  arvOverride?: { mode: "per_sqft" | "fixed"; value: number }; // re-run: bypass comp-based ARV
}

export interface UnderwriteResponse {
  dealId: string;
  report: UnderwritingReport;
}

export interface UnderwriteErrorResponse {
  error: string;
  dealId?: string;
}
