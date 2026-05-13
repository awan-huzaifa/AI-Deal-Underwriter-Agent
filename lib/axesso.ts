import type { PropertyDetails, SoldComp } from "@/lib/types";

const API_KEY = process.env.AXESSO_API_KEY!;
const BASE_URL = "https://api.axesso.de/zil";

const defaultHeaders = {
  "axesso-api-key": API_KEY,
  "Cache-Control": "no-cache",
};

// Axesso returns lot size in acres for some properties and sqft for others.
// Values < 100 are treated as acres and converted; >= 100 are already sqft.
function normalizeLotSize(value: number | null | undefined): number | undefined {
  if (!value || value <= 0) return undefined;
  return value < 100 ? Math.round(value * 43_560) : Math.round(value);
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 2 helper
// ─────────────────────────────────────────────────────────────────────────────
export async function searchProperty(address: string): Promise<PropertyDetails> {
  const url = new URL(`${BASE_URL}/search-by-address`);
  url.searchParams.set("address", address);

  console.log("\n" + "═".repeat(60));
  console.log("AXESSO — searchProperty");
  console.log("═".repeat(60));
  console.log("[AXESSO searchProperty] REQUEST URL:", url.toString());
  console.log("[AXESSO searchProperty] INPUT address:", address);

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: defaultHeaders,
  });

  if (!res.ok) {
    throw new Error(`Axesso searchProperty failed: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  console.log("[AXESSO searchProperty] RAW RESPONSE:", JSON.stringify(data, null, 2));

  const property: PropertyDetails = {
    zpid: data.zpid,
    listingType: data.adTargets?.listtp,
    address: data.address?.streetAddress,
    city: data.adTargets?.city,
    state: data.adTargets?.state,
    zip: data.adTargets?.zip,
    beds: Number(data.adTargets?.bd),
    baths: Number(data.adTargets?.ba),
    sqft: Number(data.adTargets?.sqft),
    lotSizeSqft: normalizeLotSize(data.resoFacts?.lotSize),
    yearBuilt: data.resoFacts?.yearBuilt,
    propertyType: data.homeType || data.adTargets?.proptp,
    constructionMaterials: data.resoFacts?.constructionMaterials ?? [],
    cooling: data.resoFacts?.cooling ?? [],
    heating: data.resoFacts?.heating ?? [],
    flooring: data.resoFacts?.flooring ?? [],
    roofType: data.resoFacts?.roofType ?? null,
    stories: data.resoFacts?.stories ?? null,
    hasPrivatePool: data.resoFacts?.hasPrivatePool ?? false,
    hasGarage: data.resoFacts?.hasGarage ?? data.resoFacts?.hasAttachedGarage ?? false,
    hasOffStreetParking: data.resoFacts?.hasOpenParking ?? false,
    homeStatus: data.homeStatus,
    daysOnZillow: data.daysOnZillow ?? null,
    priceHistory: (data.priceHistory ?? []).map((item: any) => ({
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
    photos: data.originalPhotos?.map((p: any) => p.mixedSources?.jpeg?.[0]?.url ?? p.url).filter(Boolean).slice(0, 10) ?? [],
    neighborhood: data.address?.neighborhood ?? data.adTargets?.hood,
    subdivision: data.address?.subdivision ?? null,
  };

  console.log("[AXESSO searchProperty] MAPPED PROPERTY:", JSON.stringify(property, null, 2));
  console.log("[AXESSO searchProperty] KEY FIELDS → zpid:", property.zpid, "| sqft:", property.sqft, "| beds:", property.beds, "| baths:", property.baths, "| yearBuilt:", property.yearBuilt);
  console.log("[AXESSO searchProperty] ARV FACTORS → constructionMaterials:", property.constructionMaterials, "| hasPrivatePool:", property.hasPrivatePool, "| hasGarage:", property.hasGarage, "| hasOffStreetParking:", property.hasOffStreetParking);
  console.log("[AXESSO searchProperty] FORECLOSURE FLAGS → isBankOwned:", property.isBankOwned, "| isPreforeclosure:", property.isPreforeclosure, "| isAnyForeclosure:", property.isAnyForeclosure, "| isFSBO:", property.isFSBO);
  console.log("[AXESSO searchProperty] PHOTOS:", property.photos.length, "urls →", property.photos);

  return property;
}

// ─── fetchPropertyPhotos (private helper) ─────────────────────────────────────
async function fetchPropertyPhotos(zpid: string): Promise<string[]> {
  try {
    console.log(`[AXESSO fetchPropertyPhotos] Fetching photos for zpid: ${zpid}`);
    const res = await fetch(
      `${BASE_URL}/photos?zpid=${zpid}`,
      { headers: defaultHeaders }
    );
    if (!res.ok) {
      console.log(`[AXESSO fetchPropertyPhotos] zpid ${zpid} — response not ok: ${res.status}`);
      return [];
    }
    const data = await res.json();
    const photos = data.photos ?? [];
    const urls = photos
      .map((photo: any) => photo.mixedSources?.jpeg?.[0]?.url)
      .filter(Boolean)
      .slice(0, 10);
    console.log(`[AXESSO fetchPropertyPhotos] zpid ${zpid} — ${urls.length} photos fetched`);
    return urls;
  } catch (err) {
    console.log(`[AXESSO fetchPropertyPhotos] zpid ${zpid} — error:`, err);
    return [];
  }
}

// ─── searchSimilarSolds ───────────────────────────────────────────────────────
export async function searchSimilarSolds(zpid: string): Promise<SoldComp[]> {
  console.log("\n" + "═".repeat(60));
  console.log("AXESSO — searchSimilarSolds");
  console.log("═".repeat(60));
  console.log("[AXESSO searchSimilarSolds] INPUT zpid:", zpid);
  console.log("[AXESSO searchSimilarSolds] REQUEST URL:", `${BASE_URL}/similar-sold?zpid=${zpid}`);

  const res = await fetch(
    `${BASE_URL}/similar-sold?zpid=${zpid}`,
    { method: "GET", headers: defaultHeaders }
  );

  if (!res.ok) {
    throw new Error(`searchSimilarSolds failed: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  console.log("[AXESSO searchSimilarSolds] RAW RESPONSE:", JSON.stringify(data, null, 2));

  const results: any[] = data.results ?? [];
  console.log("[AXESSO searchSimilarSolds] TOTAL RESULTS FROM API:", results.length);

  const mapped: SoldComp[] = results
    .map((item: any) => {
      const p = item.property;
      const salePrice = p.price ?? 0;
      const sqft = p.livingAreaValue ?? 0;
      const saleDate = p.dateSold
        ? new Date(p.dateSold).toISOString().split("T")[0]
        : "";

      return {
        zpid: String(p.zpid),
        address: `${p.address?.streetAddress ?? ""}, ${p.address?.city ?? ""}, ${p.address?.state ?? ""} ${p.address?.zipcode ?? ""}`,
        salePrice,
        saleDate,
        beds: p.bedrooms ?? 0,
        baths: p.bathrooms ?? 0,
        sqft,
        lotSizeSqft: normalizeLotSize(p.lotAreaValue),
        pricePerSqft: sqft > 0 ? Math.round(salePrice / sqft) : 0,
        distanceMiles: p.distance ?? 0,
        propertyType: p.homeType ?? "",
        daysOnMarket: p.daysOnZillow ?? null,
        yearBuilt: null,
        photos: [],
      };
    });

  console.log("[AXESSO searchSimilarSolds] MAPPED COMPS (no filtering):", mapped.length, "comps");
  mapped.forEach((c, i) => {
    console.log(`[AXESSO searchSimilarSolds] COMP #${i + 1}:`, {
      zpid: c.zpid,
      address: c.address,
      salePrice: c.salePrice,
      saleDate: c.saleDate,
      sqft: c.sqft,
      pricePerSqft: c.pricePerSqft,
      beds: c.beds,
      baths: c.baths,
      distanceMiles: c.distanceMiles,
      propertyType: c.propertyType,
    });
  });

  const withPhotos = await Promise.all(
    mapped.map(async (comp) => {
      const photos = await fetchPropertyPhotos(comp.zpid);
      return { ...comp, photos };
    })
  );

  console.log("[AXESSO searchSimilarSolds] FINAL COMPS WITH PHOTOS:", withPhotos.length);
  withPhotos.forEach((c, i) => {
    console.log(`[AXESSO searchSimilarSolds] COMP #${i + 1} photos: ${c.photos.length} →`, c.photos);
  });

  return withPhotos;
}
