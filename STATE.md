# Deal UW — Session State

Last updated: 2026-05-13

## What This Is

AI-powered real estate underwriting platform. User submits a property address → system pulls live data from Axesso API → runs 3 Claude AI calls → calculates ARV, repair costs, max offer → saves full report to Supabase → displays deal detail page with PDF export.

---

## Current Status: Feature-Complete MVP

All core features are built and working. No TODO comments in codebase. The platform is in a clean, deployable state.

---

## What's Been Built

### Authentication
- Email/password login & signup (`/auth/login`, `/auth/signup`)
- Password reset flow exists in files (`/auth/forgot-password`, `/auth/reset-password`) but UI is hidden — "Forgot password?" link removed from login page, forgot-password page renders null. Files intact for future use.
- OAuth callback handler (`/auth/callback`)
- Middleware auth guard on all `/dashboard/**` routes
- Sign out server action

### Core AI Pipeline (`/api/underwrite`)
Pipeline runs 13 steps. Accepts optional `dealId` for re-runs (replaces existing deal in place):

1. Auth check
2. Axesso: fetch subject property details (beds, baths, sqft, photos, zestimate, etc.)
   - **Guard:** immediately throws `"Property not found"` if `zpid` or `address` is null — prevents pipeline from running on invalid/garbage addresses
3. Axesso: fetch sold comps by zpid
4. Normalize comps — **no hard fail if empty, continues with flags**
5. Claude Call 1: Assess property condition from photos + grade → score (1–10), summary, line items
   - Accepts optional user-uploaded photos (`propertyPhotos[]`); if provided, skips Axesso photos entirely
   - System prompt instructs Claude to prefer agent notes over public records data on any conflict
6. Calculate repair costs (grade × sqft × market multiplier + extra items)
7. Calculate ARV adjustments (pool +$30k, garage +$15k, premium construction +$17.5k, parking +$10k)
8. Claude Call 2: Validate & categorize comps into `arv`, `turnkey`, or `as_is` — **skipped if no comps**
9. Calculate ARV:
   - Normal: avg $/sqft from arv-category comps × sqft + adjustment
   - Fallback 1: Zestimate used if no ARV comps exist (flag: `no_comps_arv_from_zestimate` or `no_arv_comps_arv_from_zestimate`)
   - Fallback 2: ARV = 0 if no comps AND no Zestimate (flag: `arv_unavailable`) — pipeline still completes
10. Calculate max offer: (ARV × 0.92) − repairs − tiered investor profit
11. Claude Call 3: Generate full report (executive summary, narratives, red/green flags, recommendation, confidence)
    - Instructed to cap confidence at 5 and recommend pass/negotiate when ARV is zestimate-based
    - Instructed to set confidence = 1 and recommend pass when `arv_unavailable`
12. Save to Supabase (`underwriting_reports` table)
13. Update deal status → completed, return full report

**Investor Profit Tiers:**
- ARV ≥ $500k → $50k profit
- ARV $350k–$500k → $40k profit
- ARV < $350k → $30k profit

**Repair Cost Base Rates (× sqft × market multiplier):**
- Excellent: $0–$15/sqft
- Good: $25–$35/sqft
- Fair: $40–$50/sqft
- Poor: $55–$65/sqft

### Re-run Feature
- "Re-run" button on deal detail page (only shown when a completed report exists)
- Opens `RerunDealModal` — same form as New Deal, pre-filled with existing condition/multiplier/extra items, address locked
- On submit: deletes old `underwriting_reports` row, resets deal to pending, reruns full pipeline against same `dealId`
- On success: `router.refresh()` reloads the page with fresh data, URL unchanged
- Comp type dropdown default label: "— Let AI decide —"

**Existing comps panel (re-run only):**
- Shows all comps from the previous run with their address, sale price, $/sqft, and category badge
- User can deselect any comp to exclude it from the re-run
- Selected comps are sent as `baseComps` — Axesso `searchSimilarSolds` is skipped entirely, categories reset to null so Claude re-evaluates them
- If all comps are deselected, pipeline fetches fresh comps from Axesso

**Manual comps (re-run only):**
- User can add their own comps via "Add Comp" button
- Each manual comp form: address (required), comp type dropdown (`arv`/`turnkey`/`as_is` or "Let AI decide"), sale price, sale date, beds, baths, sqft, lot size, year built, construction type
- If `salePrice` + `sqft` are both provided → built directly from user data, no Axesso call
- If either is missing → `resolveManualComp` calls `searchProperty(address)` on Axesso to fill in the gaps
- If comp type is set by user → category is locked, bypasses Claude Call 2 categorization entirely
- If comp type is blank → category is null, goes through Claude Call 2 like any other comp
- Manual comps are merged with base comps before Claude Call 2

### User Photo Upload
- Optional photo upload in both New Deal and Re-run modals (max 10 images)
- Client-side compression via Canvas API: max 1024px, JPEG at 0.75 quality (~80–150KB per image)
- Sent as base64 in POST body (`propertyPhotos: { data, mediaType }[]`)
- If uploaded: Claude Call 1 uses these photos only, ignores Axesso property photos
- If not uploaded: Axesso photos used as before (comps always use Axesso regardless)
- `next.config.ts` body size limit set to 20MB for server actions

### Dashboard Pages
- `/dashboard` — Stats cards (total deals, pipeline value, pursue rate, pending) + recent deals table
- `/dashboard/deals` — Full deals table with search, status filter, bulk delete
- `/dashboard/deals/[id]` — Deal detail: financials, condition, repairs, comps, narratives, flags, Re-run button
- `/dashboard/analytics` — Avg ARV/offer/repairs/profit, city breakdown, condition breakdown

### Components
- `new-deal-modal.tsx` — Address, condition dropdown, market multiplier slider, extra repair items, photo upload, notes
- `rerun-deal-modal.tsx` — Address locked, pre-filled from existing report; includes existing comps panel (toggle comps in/out), manual comp addition, photo upload; passes `dealId` + `baseComps` + `manualComps`
- `deals-table.tsx` — Search, filter, bulk select + delete
- `sidebar.tsx` — Nav (Dashboard, Deals, Analytics) — Settings removed
- `topbar.tsx` — Page title, notifications (UI only), user avatar
- `print-button.tsx` — `window.print()` trigger
- `download-pdf-button.tsx` — Fetches `/api/deals/[id]/pdf`, downloads file

### PDF Export
- `lib/pdf/deal-pdf.tsx` — Full deal report as PDF via @react-pdf/renderer
- Header, financials grid, condition assessment, repairs breakdown, comps table, narratives, flags, footer
- Also: browser print-to-PDF via CSS print media query

### Data Layer
- Supabase PostgreSQL with RLS (Row Level Security) by user_id
- `deals` table: id, user_id, address, status, recommendation, arv_low, arv_high, max_offer, error_message, created_at, updated_at
- `underwriting_reports` table: full JSONB storage of property_data, comps, calculations, ai_assessment

---

### Comp Categories
Three categories only: `arv`, `turnkey`, `as_is`. `cash_sale` was removed — from `CompCategory` type, Claude Call 2 prompt schema, Call 3 bundle, rerun modal dropdown, and both badge maps (modal + deal detail page).

### UI & UX Updates (2026-05-13)

**Notes pre-fill on re-run:** Notes from the original run are pre-filled in the re-run modal (`initialNotes` prop passed from `prop.notes` on deal detail page). User can edit, append, or clear before resubmitting.

**Investor profit default:** Changed from 15% to 20% in New Deal modal. Fallback in deal detail page remains 0.15 (for old reports only).

**Investor profit slider removed:** Both New Deal and Re-run modals — replaced with a plain number input + `%` suffix.

**Condition dropdown pricing:** Labels now include per-sqft repair ranges, e.g. `Excellent (Fully Renovated / Turnkey) — $0–$15/sqft`.

**Poor condition disclaimer:** A separator + amber warning appears between standard repair items (0–3) and infrastructure items (4+) when condition is set to Poor. Warns that the base rate already covers gut renovation costs. Appears in both modals.

**New repair items:** Septic Tank Replacement ($15K) and Well Replacement ($10K) added to `DEFAULT_EXTRA_ITEMS` in both modals (indices 6–7, after foundation items). No calculation changes needed — `calcRepairCosts` sums all checked items generically.

**Modal widths:** Both New Deal and Re-run modals expanded to `max-w-4xl`. Re-run further expanded to `max-w-6xl` to accommodate the editable comps table.

### Editable Comps on Re-run (2026-05-13)

All comp fields are now editable in the Re-run modal "Comps" tab:
- **Fields:** address, category (dropdown), sale price, sqft, $/SF (brand-highlighted), beds, baths, lot size, sold date
- **$/SF logic:** Editing $/SF directly sets it. Editing sale price or sqft auto-recalculates $/SF. Whichever the investor touches last wins.
- **Category behavior:** User-set categories are respected (locked, bypass Claude Call 2). Blank ("Let AI decide") → null → Claude re-categorizes.
- **Pipeline fix:** Step 3 no longer resets all categories to null on re-run — preserves user-set values.
- **Submission:** Edited values in `editableComps` are serialized to `baseComps` including the investor's adjusted $/SF, which flows directly into `calcARV`.
- Previously added manual comps appear in the editable comps panel on subsequent re-runs (they're saved as `validatedComps` in the report).

**Lot size normalization:** `normalizeLotSize()` added to `lib/axesso.ts`. Axesso returns lot size in acres for some properties and sqft for others. Values < 100 are treated as acres and converted (× 43,560). Applied to both `searchProperty` and `searchSimilarSolds`. `lotSizeSqft?: number` added to `NormalizedComp`.

### ARV $/sqft Override on Re-run (2026-05-13)

Simple field in the Settings tab: investor types a $/sqft value (e.g. `170`) → pipeline uses `value × property.sqft + ARV adjustments` as ARV, bypassing comp-based calculation entirely. Leave blank to use comps as normal. Flags `arv_manual_per_sqft_override` pushed to Claude Call 3. State: `arvSqftOverride` string in re-run modal.

### Claude Call 2 Rejection Criteria Update (2026-05-13)

Rejection rules tightened: Claude now rejects a comp **only if** (1) property type doesn't match the subject, or (2) sale price is unrealistically far from the neighborhood range (e.g. $50K next to $300K comps). Distance, age of sale, and foreclosure/REO status are no longer rejection grounds.

### Re-run Modal Layout Overhaul (2026-05-13)

Re-run modal reorganized into **3 tabs** (Settings / Comps / Photos). Tab bar shows live counts (e.g. `Comps (2/3)`, `Photos (4)`). Resets to Settings tab on close.

**Settings tab layout:**
- Row 1 (`grid-cols-2`): Property Condition (full left half, text fully readable) | Market Multiplier slider (right)
- Row 2 (`grid-cols-3`): Investor Profit | Min. Assignment Fee | ARV $/sqft Override
- Below: Repair items in 2-col split (Standard Renovation left, Infrastructure right) + Notes

**Comps tab:** Editable existing comps + Add Your Own Comps.

**Photos tab:** Photo upload.

### Resilience & Bug Fixes (2026-05-12)

**Anthropic 529 overload retries:** `maxRetries: 5` on the Anthropic client (`lib/claude.ts`). Default was 2 — increased so transient overload errors retry with exponential backoff (~15s total window) before surfacing to the user.

**Invalid address guard:** After Step 2 (Axesso), pipeline immediately throws `"Property not found — please enter a valid property address."` if `property.zpid` or `property.address` is null. Previously a junk address like "123" would return HTTP 200 with empty fields and the pipeline would run all the way through to Claude Call 3 before failing.

**Failed deal row deduplication:** When submitting a new deal, Step 1 first checks for an existing `failed` row with the same `user_id + address`. If found, resets it to `pending` and reuses it instead of inserting a new row. Prevents accumulation of duplicate failed rows for the same address on repeated attempts.

---

## Known Gaps (Not Yet Built)

| Gap | Notes |
|-----|-------|
| Forgot password flow | Files exist, UI hidden — `app/auth/forgot-password/page.tsx` returns null, link removed from login |
| Notifications (bell icon) | UI-only, no functionality |
| Deal editing | Create, view, delete, re-run only — no field editing |
| Rate limiting on `/api/underwrite` | No throttle on AI calls |
| Email notifications on deal completion | Not wired up |
| CSV export | PDF only |
| Webhook retry if Axesso fails | Single attempt only |
| Integration/E2E tests | No test files exist |

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Framework | Next.js 15, App Router, React 19 |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS v4, shadcn/ui |
| Database/Auth | Supabase (PostgreSQL + RLS) |
| AI | Anthropic Claude API — model: claude-opus-4-7 |
| External Data | Axesso API (property details + sold comps) |
| PDF | @react-pdf/renderer |

---

## Key Files to Know

| File | What It Does |
|------|-------------|
| `app/api/underwrite/route.ts` | Main AI pipeline — the core of the app |
| `lib/claude.ts` | 3 Claude API calls (condition, comps, report) |
| `lib/calculations.ts` | ARV, repair costs, max offer math |
| `lib/axesso.ts` | External property data API wrapper |
| `lib/types.ts` | All TypeScript types incl. `UploadedPhoto` |
| `lib/pdf/deal-pdf.tsx` | PDF report renderer |
| `components/dashboard/new-deal-modal.tsx` | Deal creation form with photo upload |
| `components/dashboard/rerun-deal-modal.tsx` | Re-run form — pre-filled, replaces existing deal |
| `middleware.ts` | Auth guard |

---

## Environment Variables Required

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
ANTHROPIC_API_KEY
AXESSO_API_KEY
```

---

## What to Pick Up Next

No active work in progress. Candidates:
1. Forgot password flow — files ready, just needs UI restored and Supabase email template configured
2. Rate limiting on the underwrite endpoint
3. Deal editing capability
4. Notifications
