# Deal UW — Session State

Last updated: 2026-05-05

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
3. Axesso: fetch sold comps by zpid
4. Normalize comps — **no hard fail if empty, continues with flags**
5. Claude Call 1: Assess property condition from photos + grade → score (1–10), summary, line items
   - Accepts optional user-uploaded photos (`propertyPhotos[]`); if provided, skips Axesso photos entirely
   - System prompt instructs Claude to prefer agent notes over public records data on any conflict
6. Calculate repair costs (grade × sqft × market multiplier + extra items)
7. Calculate ARV adjustments (pool +$30k, garage +$15k, premium construction +$17.5k, parking +$10k)
8. Claude Call 2: Validate & categorize comps — **skipped if no comps**
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
- `rerun-deal-modal.tsx` — Same form as above, address locked, pre-filled from existing report, passes `dealId`
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
