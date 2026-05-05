# Deal UW — Real Estate Underwriting Platform                                                                                                                 

  An AI-powered tool for underwriting real estate investment deals. Submit a property address and get a full underwriting report in minutes — ARV, repair costs,   max offer, comp analysis, and a narrative recommendation powered by Claude AI.                                                                                                                                                                                                                                               
  ---                                                                                                                                                           

  ## What It Does

  1. User submits a property address with condition grade, market multiplier, and optional repair items
  2. System pulls live property data and sold comps from Axesso (Zillow data)
  3. Three Claude AI calls run in sequence:
     - **Call 1** — Analyzes property photos, assesses condition, validates user's grade
     - **Call 2** — Categorizes each comp (ARV / turnkey / as-is / cash sale), rejects non-arms-length sales
     - **Call 3** — Synthesizes everything into a full report with narratives, red/green flags, and a recommendation
  4. Financial calculations run deterministically (ARV, repair costs, max offer stack)
  5. Report is saved and displayed with PDF export

  ---

  ## Tech Stack

  | Layer | Technology |
  |---|---|
  | Framework | Next.js 15, App Router, React 19 |
  | Language | TypeScript (strict) |
  | Styling | Tailwind CSS v4, shadcn/ui |
  | Database / Auth | Supabase (PostgreSQL + Row Level Security) |
  | AI | Anthropic Claude API (`claude-opus-4-7`) |
  | External Data | Axesso API (Zillow property data + comps) |
  | PDF | @react-pdf/renderer |

  ---

  ## Project Structure

  /
  ├── app/
  │   ├── api/
  │   │   ├── underwrite/route.ts        # Main AI pipeline (13 steps)
  │   │   └── deals/[id]/pdf/route.tsx   # PDF generation endpoint
  │   ├── auth/
  │   │   ├── login/page.tsx
  │   │   ├── signup/page.tsx
  │   │   ├── forgot-password/page.tsx   # Hidden — work in progress
  │   │   ├── reset-password/page.tsx
  │   │   └── callback/route.ts
  │   ├── dashboard/
  │   │   ├── page.tsx                   # Stats + recent deals
  │   │   ├── layout.tsx
  │   │   ├── deals/page.tsx             # All deals table
  │   │   ├── deals/[id]/page.tsx        # Deal detail + re-run
  │   │   └── analytics/page.tsx
  │   └── actions/
  │       ├── auth.ts
  │       └── deals.ts
  ├── components/dashboard/
  │   ├── new-deal-modal.tsx             # Deal creation form
  │   ├── rerun-deal-modal.tsx           # Re-run form (pre-filled)
  │   ├── deals-table.tsx
  │   ├── sidebar.tsx
  │   ├── topbar.tsx
  │   ├── print-button.tsx
  │   └── download-pdf-button.tsx
  ├── lib/
  │   ├── claude.ts                      # 3 Claude API calls
  │   ├── calculations.ts                # ARV, repairs, max offer
  │   ├── axesso.ts                      # Property data API
  │   ├── types.ts                       # All TypeScript types
  │   ├── utils.ts
  │   ├── supabase/
  │   │   ├── client.ts
  │   │   └── server.ts
  │   └── pdf/deal-pdf.tsx
  └── middleware.ts                      # Auth guard

  ---

  ## Getting Started

  ### 1. Clone and install

  ```bash
  git clone <repo-url>
  cd deal-uw
  npm install

  2. Set up environment variables

  Copy .env.example to .env.local and fill in:

  NEXT_PUBLIC_SUPABASE_URL=        # Supabase project URL
  NEXT_PUBLIC_SUPABASE_ANON_KEY=   # Supabase anon/public key
  ANTHROPIC_API_KEY=               # Claude API key
  AXESSO_API_KEY=                  # Axesso real estate data API

  3. Set up Supabase

  Create two tables in your Supabase project:

  deals
  create table deals (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users not null,
    address text not null,
    status text not null default 'pending',
    recommendation text,
    arv_low numeric,
    arv_high numeric,
    max_offer numeric,
    error_message text,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
  );

  alter table deals enable row level security;
  create policy "Users can manage own deals" on deals
    for all using (auth.uid() = user_id);

  underwriting_reports
  create table underwriting_reports (
    id uuid primary key default gen_random_uuid(),
    deal_id uuid references deals not null,
    user_id uuid references auth.users not null,
    address text,
    beds int, baths int, sqft numeric, year_built int,
    condition text,
    arv_low numeric, arv_high numeric,
    avg_price_per_sqft numeric,
    net_sales_price numeric,
    repair_cost_low numeric, repair_cost_high numeric,
    investor_profit numeric,
    max_offer_low numeric, max_offer_high numeric,
    property_data jsonb,
    comps jsonb,
    calculations jsonb,
    ai_assessment jsonb,
    flags text[],
    recommendation text,
    confidence text,
    summary text,
    created_at timestamptz default now()
  );

  alter table underwriting_reports enable row level security;
  create policy "Users can manage own reports" on underwriting_reports
    for all using (auth.uid() = user_id);

  4. Run the dev server

  npm run dev

  Open http://localhost:3000.

  ---
  How the Underwriting Pipeline Works

  ARV Calculation

  Only comps categorized as arv (fully renovated) by Claude are used in the ARV calculation. Other categories (turnkey, as-is, cash sale) appear on the report  
  as reference only.

  ARV = avg $/sqft of arv-comps × subject sqft + feature adjustments

  Feature adjustments: pool (+$30k), garage (+$15k), premium construction/brick/stone (+$17.5k), off-street parking (+$10k)

  Max Offer Stack

  Net Sales Price  = ARV × 0.92
  Max Offer        = Net Sales Price − Repair Costs − Investor Profit

  Investor profit tiers: ARV ≥ $500k → $50k / ARV $350k–$500k → $40k / ARV < $350k → $30k

  Repair Cost Rates (per sqft × market multiplier)

  ┌───────────┬─────┬──────┐
  │   Grade   │ Low │ High │
  ├───────────┼─────┼──────┤
  │ Excellent │ $0  │ $15  │
  ├───────────┼─────┼──────┤
  │ Good      │ $25 │ $35  │
  ├───────────┼─────┼──────┤
  │ Fair      │ $40 │ $50  │
  ├───────────┼─────┼──────┤
  │ Poor      │ $55 │ $65  │
  └───────────┴─────┴──────┘

  No-Comps Handling

  The pipeline never hard-fails on missing comps:
  - No ARV comps → falls back to Zestimate as ARV
  - No comps and no Zestimate → ARV set to 0, flagged as arv_unavailable, report still generates with condition assessment

  User Photo Upload

  When creating or re-running a deal, users can upload up to 10 property photos. These are compressed client-side (max 1024px, JPEG 0.75 quality) and sent as   
  base64. If uploaded, Claude uses these instead of Zillow listing photos for the condition assessment.

  ---
  Key Conventions

  - Server vs Client Supabase: use @/lib/supabase/server in Server Components and Route Handlers; use @/lib/supabase/client in "use client" components
  - Protected routes: anything under /dashboard requires auth — enforced in middleware.ts
  - Re-runs: submitting a re-run with an existing dealId deletes the old report and replaces it in place — no history is kept
  - Notes priority: Claude Call 1 is instructed to prefer agent notes over public API data when there are conflicts (e.g. wrong bed/bath count in public        
  records)
