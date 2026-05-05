// Run with: node --env-file=.env.local scripts/test-axesso.mjs
// Change TEST_ADDRESS to any real address you want to look up.

const TEST_ADDRESS = "4410 NW 174th Dr, Miami Gardens, FL 33055";

const API_KEY = process.env.AXESSO_API_KEY;
if (!API_KEY || API_KEY === "your_axesso_api_key") {
  console.error("ERROR: Set a real AXESSO_API_KEY in .env.local first.");
  process.exit(1);
}

const BASE_URL = "https://api.axesso.de/zil";

const url = new URL(`${BASE_URL}/search-by-address`);
url.searchParams.set("address", TEST_ADDRESS);

console.log("→ GET", url.toString());
console.log();

const res = await fetch(url.toString(), {
  method: "GET",
  headers: {
    "axesso-api-key": API_KEY,
    "Cache-Control": "no-cache",
  },
});

console.log(`← ${res.status} ${res.statusText}`);
console.log();

if (!res.ok) {
  const text = await res.text();
  console.error("Response body:", text);
  process.exit(1);
}

const data = await res.json();

// ── Raw API response ──────────────────────────────────────────────────────────
//console.log("═══════════════════════ RAW RESPONSE ═══════════════════════");
//console.log(JSON.stringify(data, null, 2));

// ── Mapped PropertyDetails ────────────────────────────────────────────────────
const mapped = {
  listingtype: data.adTargets.listtp,
  zpid: data.zpid,
  address: data.address?.streetAddress,
  city: data.adTargets?.city,
  state: data.adTargets?.state,
  zip: data.adTargets?.zip,
  beds: Number(data.adTargets?.bd),
  baths: Number(data.adTargets?.ba),
  sqft:  data.adTargets?.sqft,
  lotSizeSqft: data.resoFacts?.lotSize,
  yearBuilt: data.resoFacts?.yearBuilt,
  propertyType: data.homeType || data.adTargets?.proptp,
  constructionMaterials: data.resoFacts?.constructionMaterials ?? [],
  cooling: data.resoFacts?.cooling ?? [],
  heating: data.resoFacts?.heating ?? [],
  flooring: data.resoFacts?.flooring ?? [],
  roofType: data.resoFacts?.roofType ?? null,
  stories: data.resoFacts?.stories ?? null,
  hasPrivatePool: data.resoFacts?.hasPrivatePool ?? false,
  homeStatus: data.homeStatus,
  daysOnZillow: data.daysOnZillow ?? null,
  priceHistory: (data.priceHistory ?? []).map((item) => ({
    date: item.date,
    price: item.price,
    pricePerSqft: item.pricePerSquareFoot,
    event: item.event,
  })),
  isBankOwned: data.foreclosureTypes?.isBankOwned ?? false,
  isPreforeclosure: data.foreclosureTypes?.isPreforeclosure ?? false,
  isAnyForeclosure: data.foreclosureTypes?.isAnyForeclosure ?? false,
  isFSBO: data.listing_sub_type?.is_FSBO ?? false,
  taxAssessedValue: data.resoFacts?.taxAssessedValue ?? null,
  zestimate: Number(data.adTargets?.zestimate) || null,
  lastSalePrice: null,
  lastSaleDate: null,
  photos: data.originalPhotos
    ?.map((p) => p.mixedSources?.jpeg?.[0]?.url ?? p.url)
    .filter(Boolean)
    .slice(0, 10) ?? [],
  neighborhood: data.address?.neighborhood ?? data.adTargets?.hood,
  subdivision: data.address?.subdivision ?? null,
};

//console.log(data.adTargets.sqft);
console.log("══════════════════ MAPPED PropertyDetails ══════════════════");
console.log(JSON.stringify(mapped, null, 2));
