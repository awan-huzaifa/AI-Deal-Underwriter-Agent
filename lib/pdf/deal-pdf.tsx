import React from "react";
import {
  Document, Page, View, Text, StyleSheet,
} from "@react-pdf/renderer";

// ── Palette ───────────────────────────────────────────────────────────────────

const C = {
  brand:   "#0EA5E9",
  dark:    "#0F172A",
  muted:   "#64748B",
  border:  "#E2E8F0",
  surface: "#F8FAFC",
  white:   "#FFFFFF",
  emerald: "#10B981",
  amber:   "#F59E0B",
  red:     "#EF4444",
  emeraldBg: "#F0FDF4",
  amberBg:   "#FFFBEB",
  redBg:     "#FEF2F2",
  brandBg:   "#F0F9FF",
};

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  page:        { fontFamily: "Helvetica", backgroundColor: C.white, paddingTop: 40, paddingBottom: 50, paddingHorizontal: 40 },
  // Header
  header:      { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 24, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: C.border },
  logoBox:     { flexDirection: "row", alignItems: "center" },
  logoDot:     { width: 18, height: 18, backgroundColor: C.brand, borderRadius: 4, marginRight: 6 },
  logoText:    { fontSize: 13, fontFamily: "Helvetica-Bold", color: C.dark },
  headerMeta:  { fontSize: 9, color: C.muted, textAlign: "right" },
  // Title block
  address:     { fontSize: 18, fontFamily: "Helvetica-Bold", color: C.dark, marginBottom: 8 },
  badgeRow:    { flexDirection: "row", marginBottom: 20 },
  badge:       { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1, marginRight: 6, fontSize: 9, fontFamily: "Helvetica-Bold" },
  // Metric cards
  metricsRow:  { flexDirection: "row", marginBottom: 16 },
  metricCard:  { flex: 1, backgroundColor: C.surface, borderRadius: 8, borderWidth: 1, borderColor: C.border, padding: 10, marginRight: 8 },
  metricLast:  { marginRight: 0 },
  metricLabel: { fontSize: 7, fontFamily: "Helvetica-Bold", color: C.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 },
  metricValue: { fontSize: 13, fontFamily: "Helvetica-Bold", color: C.dark },
  metricSub:   { fontSize: 8, color: C.muted, marginTop: 2 },
  // Section header
  sectionTitle: { fontSize: 8, fontFamily: "Helvetica-Bold", color: C.muted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 },
  // Cards
  card:        { backgroundColor: C.surface, borderRadius: 8, borderWidth: 1, borderColor: C.border, padding: 12, marginBottom: 12 },
  // Text
  body:        { fontSize: 10, color: C.dark, lineHeight: 1.6 },
  bodyMuted:   { fontSize: 9, color: C.muted, lineHeight: 1.5 },
  // Two col
  row:         { flexDirection: "row" },
  col:         { flex: 1, marginRight: 12 },
  colLast:     { flex: 1 },
  // Grid item
  gridItem:    { marginBottom: 10 },
  gridLabel:   { fontSize: 8, color: C.muted, marginBottom: 2 },
  gridValue:   { fontSize: 10, fontFamily: "Helvetica-Bold", color: C.dark },
  // Divider
  divider:     { borderBottomWidth: 1, borderBottomColor: C.border, marginVertical: 10 },
  // Line item row
  lineItem:    { flexDirection: "row", marginBottom: 6 },
  lineLabel:   { fontSize: 9, fontFamily: "Helvetica-Bold", color: C.brand, width: 80 },
  lineNote:    { fontSize: 9, color: C.muted, flex: 1, lineHeight: 1.5 },
  // Table
  tableHeader: { flexDirection: "row", backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border, paddingVertical: 6, paddingHorizontal: 8 },
  tableRow:    { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: C.border, paddingVertical: 7, paddingHorizontal: 8 },
  // Flags
  flagRow:     { flexDirection: "row", flexWrap: "wrap" },
  flagPill:    { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1, marginRight: 5, marginBottom: 5, fontSize: 8 },
  // Footer
  footer:      { position: "absolute", bottom: 20, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: C.border, paddingTop: 8 },
  footerText:  { fontSize: 8, color: C.muted },
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined) {
  if (n == null) return "—";
  return "$" + Math.round(n).toLocaleString();
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function recommendationStyle(v: string) {
  if (v === "pursue")    return { color: C.emerald, backgroundColor: C.emeraldBg, borderColor: C.emerald };
  if (v === "negotiate") return { color: C.amber,   backgroundColor: C.amberBg,   borderColor: C.amber   };
  return                        { color: C.red,     backgroundColor: C.redBg,     borderColor: C.red     };
}

function conditionStyle(v: string) {
  if (v === "excellent") return { color: C.emerald, backgroundColor: C.emeraldBg, borderColor: C.emerald };
  if (v === "good")      return { color: C.brand,   backgroundColor: C.brandBg,   borderColor: C.brand   };
  if (v === "fair")      return { color: C.amber,   backgroundColor: C.amberBg,   borderColor: C.amber   };
  return                        { color: C.red,     backgroundColor: C.redBg,     borderColor: C.red     };
}

function flagStyle(flag: string) {
  const f = flag.toLowerCase();
  if (/verify|confirm|check/.test(f)) return { color: C.amber, backgroundColor: C.amberBg, borderColor: C.amber };
  if (/no |missing|unknown|risk|conflict/.test(f)) return { color: C.red, backgroundColor: C.redBg, borderColor: C.red };
  return { color: C.brand, backgroundColor: C.brandBg, borderColor: C.brand };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function GridItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.gridItem}>
      <Text style={s.gridLabel}>{label}</Text>
      <Text style={s.gridValue}>{value}</Text>
    </View>
  );
}

function RepairRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={[s.row, { marginBottom: 5 }]}>
      <Text style={[s.bodyMuted, { flex: 1 }]}>{label}</Text>
      <Text style={bold ? { fontSize: 10, fontFamily: "Helvetica-Bold", color: C.dark } : { fontSize: 10, color: C.dark }}>
        {value}
      </Text>
    </View>
  );
}

// ── Main Document ─────────────────────────────────────────────────────────────

export function DealPDF({ deal, report }: { deal: any; report: any }) {
  const ai      = report?.ai_assessment ?? {};
  const cond    = ai.conditionAssessment ?? {};
  const calc    = report?.calculations   ?? {};
  const repairs = calc.repairCosts       ?? {};
  const prop    = report?.property_data  ?? {};
  const comps: any[]   = report?.comps  ?? [];
  const flags: string[] = report?.flags ?? [];

  const arvMid      = ((report?.arv_low ?? 0) + (report?.arv_high ?? 0)) / 2;
  const offerMid    = ((report?.max_offer_low ?? 0) + (report?.max_offer_high ?? 0)) / 2;

  return (
    <Document
      title={`Deal Report — ${deal.address}`}
      author="Deal UW"
      creator="Deal UW"
    >
      <Page size="A4" style={s.page}>

        {/* ── HEADER ── */}
        <View style={s.header} fixed>
          <View style={s.logoBox}>
            <View style={s.logoDot} />
            <Text style={s.logoText}>Deal UW</Text>
          </View>
          <View>
            <Text style={s.headerMeta}>Underwriting Report</Text>
            <Text style={s.headerMeta}>Generated {fmtDate(new Date().toISOString())}</Text>
          </View>
        </View>

        {/* ── ADDRESS + BADGES ── */}
        <Text style={s.address}>{deal.address}</Text>
        <View style={s.badgeRow}>
          {report?.condition && (
            <Text style={[s.badge, conditionStyle(report.condition)]}>
              {report.condition.charAt(0).toUpperCase() + report.condition.slice(1)} Condition
            </Text>
          )}
          {deal.recommendation && (
            <Text style={[s.badge, recommendationStyle(deal.recommendation)]}>
              {deal.recommendation.charAt(0).toUpperCase() + deal.recommendation.slice(1)}
            </Text>
          )}
          {report?.confidence && (
            <Text style={[s.badge, { color: C.muted, backgroundColor: C.surface, borderColor: C.border }]}>
              {report.confidence}/10 Confidence
            </Text>
          )}
          <Text style={[s.badge, { color: C.muted, backgroundColor: C.surface, borderColor: C.border }]}>
            {fmtDate(deal.created_at)}
          </Text>
        </View>

        {/* ── FINANCIAL METRICS ── */}
        <View style={s.metricsRow}>
          <View style={s.metricCard}>
            <Text style={s.metricLabel}>ARV Range</Text>
            <Text style={s.metricValue}>{fmt(report?.arv_low)} — {fmt(report?.arv_high)}</Text>
            {report?.avg_price_per_sqft && (
              <Text style={s.metricSub}>Avg {fmt(report.avg_price_per_sqft)}/sqft</Text>
            )}
          </View>
          <View style={s.metricCard}>
            <Text style={s.metricLabel}>Max Offer</Text>
            <Text style={s.metricValue}>{fmt(report?.max_offer_low)} — {fmt(report?.max_offer_high)}</Text>
          </View>
          <View style={s.metricCard}>
            <Text style={s.metricLabel}>Repair Costs</Text>
            <Text style={s.metricValue}>{fmt(report?.repair_cost_low)} — {fmt(report?.repair_cost_high)}</Text>
          </View>
          <View style={[s.metricCard, s.metricLast]}>
            <Text style={s.metricLabel}>Net Sales Price</Text>
            <Text style={s.metricValue}>{fmt(report?.net_sales_price)}</Text>
            {report?.investor_profit && (
              <Text style={s.metricSub}>Profit target: {fmt(report.investor_profit)}</Text>
            )}
          </View>
        </View>

        {/* ── EXECUTIVE SUMMARY ── */}
        {ai.executiveSummary && (
          <View style={s.card}>
            <Text style={s.sectionTitle}>Executive Summary</Text>
            <Text style={s.body}>{ai.executiveSummary}</Text>
          </View>
        )}

        {/* ── TWO COLUMN: PROPERTY + CONDITION ── */}
        <View style={s.row}>

          {/* Left col */}
          <View style={s.col}>

            {/* Property details */}
            <View style={s.card}>
              <Text style={s.sectionTitle}>Property</Text>
              <View style={[s.row, { flexWrap: "wrap" }]}>
                <View style={{ width: "50%", paddingRight: 6 }}>
                  <GridItem label="Beds" value={String(report?.beds ?? "—")} />
                  <GridItem label="Baths" value={String(report?.baths ?? "—")} />
                  <GridItem label="Sqft" value={report?.sqft ? Number(report.sqft).toLocaleString() : "—"} />
                  <GridItem label="Year Built" value={String(report?.year_built ?? "—")} />
                </View>
                <View style={{ width: "50%" }}>
                  <GridItem label="Pool" value={prop.hasPrivatePool ? "Yes" : "No"} />
                  <GridItem label="Garage" value={prop.hasGarage ? "Yes" : "No"} />
                  {prop.zestimate && <GridItem label="Zestimate" value={fmt(prop.zestimate)} />}
                </View>
              </View>
              {prop.constructionMaterials?.length > 0 && (
                <>
                  <View style={s.divider} />
                  <GridItem label="Construction" value={prop.constructionMaterials.join(", ")} />
                </>
              )}
              {(prop.cooling?.length > 0 || prop.heating?.length > 0) && (
                <View style={s.row}>
                  {prop.cooling?.length > 0 && (
                    <View style={{ flex: 1, paddingRight: 6 }}>
                      <GridItem label="Cooling" value={prop.cooling.join(", ")} />
                    </View>
                  )}
                  {prop.heating?.length > 0 && (
                    <View style={{ flex: 1 }}>
                      <GridItem label="Heating" value={prop.heating.join(", ")} />
                    </View>
                  )}
                </View>
              )}
            </View>

            {/* Repair breakdown */}
            {repairs.condition && (
              <View style={s.card}>
                <Text style={s.sectionTitle}>Repair Breakdown</Text>
                <RepairRow label="Condition grade"    value={repairs.condition.charAt(0).toUpperCase() + repairs.condition.slice(1)} />
                <RepairRow label="Market multiplier"  value={`${repairs.marketMultiplier}×`} />
                <RepairRow label="Rate ($/sqft)"       value={`$${repairs.per_sqft_low} — $${repairs.per_sqft_high}`} />
                <RepairRow label="Base cost"           value={`${fmt(repairs.baseLow)} — ${fmt(repairs.baseHigh)}`} />
                {repairs.checkedExtraItems?.length > 0 && (
                  <>
                    <View style={s.divider} />
                    {repairs.checkedExtraItems.map((item: any, i: number) => (
                      <RepairRow key={i} label={item.label} value={fmt(item.cost)} />
                    ))}
                  </>
                )}
                <View style={s.divider} />
                <RepairRow label="Total repair range" value={`${fmt(repairs.low)} — ${fmt(repairs.high)}`} bold />
              </View>
            )}
          </View>

          {/* Right col */}
          <View style={s.colLast}>

            {/* Condition assessment */}
            {cond.score != null && (
              <View style={s.card}>
                <View style={[s.row, { justifyContent: "space-between", marginBottom: 8 }]}>
                  <Text style={s.sectionTitle}>Condition Assessment</Text>
                  <Text style={[s.badge, { fontSize: 8 }, conditionStyle(report?.condition ?? "fair")]}>
                    Score {cond.score}/10
                  </Text>
                </View>
                {cond.summary && <Text style={[s.body, { marginBottom: 8 }]}>{cond.summary}</Text>}
                {cond.lineItems?.length > 0 && (
                  <>
                    <View style={s.divider} />
                    {cond.lineItems.map((item: any, i: number) => (
                      <View key={i} style={s.lineItem}>
                        <Text style={s.lineLabel}>{item.category}</Text>
                        <Text style={s.lineNote}>{item.notes}</Text>
                      </View>
                    ))}
                  </>
                )}
              </View>
            )}

            {/* Red / green flags */}
            {(ai.redFlags?.length > 0 || ai.greenFlags?.length > 0) && (
              <View style={s.card}>
                {ai.greenFlags?.length > 0 && (
                  <>
                    <Text style={[s.sectionTitle, { color: C.emerald }]}>Green Flags</Text>
                    {ai.greenFlags.map((f: string, i: number) => (
                      <Text key={i} style={[s.bodyMuted, { marginBottom: 3 }]}>✓  {f}</Text>
                    ))}
                  </>
                )}
                {ai.redFlags?.length > 0 && (
                  <>
                    <Text style={[s.sectionTitle, { color: C.red, marginTop: ai.greenFlags?.length > 0 ? 8 : 0 }]}>Red Flags</Text>
                    {ai.redFlags.map((f: string, i: number) => (
                      <Text key={i} style={[s.bodyMuted, { marginBottom: 3 }]}>✗  {f}</Text>
                    ))}
                  </>
                )}
              </View>
            )}
          </View>
        </View>

        {/* ── COMPARABLE SALES ── */}
        {comps.length > 0 && (
          <View style={{ marginBottom: 12 }}>
            <Text style={s.sectionTitle}>Comparable Sales</Text>
            <View style={{ borderWidth: 1, borderColor: C.border, borderRadius: 8, overflow: "hidden" }}>
              <View style={s.tableHeader}>
                <Text style={{ flex: 3, fontSize: 8, fontFamily: "Helvetica-Bold", color: C.muted }}>Address</Text>
                <Text style={{ flex: 1, fontSize: 8, fontFamily: "Helvetica-Bold", color: C.muted, textAlign: "right" }}>Sale Price</Text>
                <Text style={{ flex: 1, fontSize: 8, fontFamily: "Helvetica-Bold", color: C.muted, textAlign: "right" }}>$/Sqft</Text>
                <Text style={{ width: 55, fontSize: 8, fontFamily: "Helvetica-Bold", color: C.muted, textAlign: "right" }}>Type</Text>
              </View>
              {comps.map((comp: any, i: number) => (
                <View key={i} style={[s.tableRow, i === comps.length - 1 ? { borderBottomWidth: 0 } : {}]}>
                  <View style={{ flex: 3 }}>
                    <Text style={{ fontSize: 9, color: C.dark }}>{comp.address}</Text>
                    <Text style={{ fontSize: 8, color: C.muted, marginTop: 1 }}>
                      {comp.beds}bd/{comp.baths}ba · {comp.sqft?.toLocaleString()} sqft · {comp.saleDate}
                    </Text>
                  </View>
                  <Text style={{ flex: 1, fontSize: 9, fontFamily: "Helvetica-Bold", color: C.dark, textAlign: "right" }}>{fmt(comp.salePrice)}</Text>
                  <Text style={{ flex: 1, fontSize: 9, color: C.muted, textAlign: "right" }}>{fmt(comp.pricePerSqft)}</Text>
                  <Text style={{ width: 55, fontSize: 8, color: C.brand, textAlign: "right", fontFamily: "Helvetica-Bold" }}>
                    {comp.category ? comp.category.replace("_", " ").toUpperCase() : "—"}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── NARRATIVES ── */}
        {ai.propertyNarrative && (
          <View style={s.card}>
            <Text style={s.sectionTitle}>Property Narrative</Text>
            <Text style={s.body}>{ai.propertyNarrative}</Text>
          </View>
        )}
        {ai.marketNarrative && (
          <View style={s.card}>
            <Text style={s.sectionTitle}>Market Narrative</Text>
            <Text style={s.body}>{ai.marketNarrative}</Text>
          </View>
        )}

        {/* ── WORKFLOW FLAGS ── */}
        {flags.length > 0 && (
          <View style={[s.card, { marginBottom: 0 }]}>
            <Text style={s.sectionTitle}>Workflow Flags</Text>
            <View style={s.flagRow}>
              {flags.map((f, i) => (
                <Text key={i} style={[s.flagPill, flagStyle(f)]}>
                  {f.replace(/_/g, " ")}
                </Text>
              ))}
            </View>
          </View>
        )}

        {/* ── FOOTER ── */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>Deal UW · {deal.address}</Text>
          <Text style={s.footerText} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>

      </Page>
    </Document>
  );
}
