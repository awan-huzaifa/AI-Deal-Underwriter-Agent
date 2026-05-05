# Deal UW — Real Estate Underwriting Platform

AI-powered tool for underwriting real estate deals.

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15, App Router, React 19 |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS v4, shadcn/ui components |
| Database / Auth | Supabase (PostgreSQL + Row Level Security) |
| AI | Anthropic Claude API (`ANTHROPIC_API_KEY`) |
| External Data | Axesso API for market comps (`AXESSO_API_KEY`) |

## Project Structure

```
/
├── app/
│   ├── layout.tsx              # Root layout
│   ├── page.tsx                # Root → redirects to /dashboard or /auth/login
│   ├── globals.css             # Tailwind + global styles
│   ├── auth/
│   │   ├── login/page.tsx      # Login form (client component)
│   │   ├── signup/page.tsx     # Signup form (client component)
│   │   └── callback/route.ts   # OAuth / magic-link exchange
│   └── dashboard/
│       └── page.tsx            # Protected dashboard (server component)
├── lib/
│   ├── utils.ts                # cn() helper (clsx + tailwind-merge)
│   └── supabase/
│       ├── client.ts           # Browser Supabase client (use in Client Components)
│       └── server.ts           # Server Supabase client (use in Server Components / Route Handlers)
├── components/
│   └── ui/                     # shadcn/ui primitives go here
├── middleware.ts               # Auth guard: protects /dashboard, redirects /auth when logged in
├── .env.local                  # Local secrets — never commit
├── .env.example                # Committed placeholder for env vars
└── CLAUDE.md                   # This file
```

## Auth Flow

1. `/` → reads Supabase session → redirects to `/dashboard` (authed) or `/auth/login`
2. Login/Signup → Supabase Auth → success redirects to `/dashboard`
3. Email confirmation → `/auth/callback` → exchanges code → redirects to `/dashboard`
4. `middleware.ts` enforces auth on every `/dashboard/**` route server-side

## Environment Variables

```bash
NEXT_PUBLIC_SUPABASE_URL=        # Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=   # Supabase anon/public key
ANTHROPIC_API_KEY=               # Claude API key
AXESSO_API_KEY=                  # Axesso real estate data API
```

## Key Conventions

- **Server vs Client Supabase**: import from `@/lib/supabase/server` in Server Components and Route Handlers; import from `@/lib/supabase/client` in `"use client"` components.
- **Path alias**: `@/` maps to the project root (configured in `tsconfig.json`).
- **shadcn/ui**: Components live in `components/ui/`. Add new ones with `npx shadcn@latest add <component>`.
- **Protected routes**: Any route under `/dashboard` requires authentication — enforced in `middleware.ts`.

## Running Locally

```bash
# 1. Fill in .env.local with real values
# 2. Start dev server
npm run dev
```
