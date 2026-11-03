# BizRecord — My Shop

Mobile-first demo shop management for Nigerian small business owners and petty traders.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/my-shop test` — verify daily calculations and Supabase record mapping
- Required env: `DATABASE_URL` — Postgres connection string
- BizRecord Supabase setup: `artifacts/my-shop/SUPABASE_SETUP.md`; apply `artifacts/my-shop/supabase/schema.sql` to the Supabase project before account data can load

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

BizRecord / My Shop is a mobile-first shop-record app for Nigerian small businesses. When configured with Supabase, it uses Supabase Auth and a row-level-secured `shop_records` table to store each account's products, sales, expenses, daily reports, stock and credit records. Shop data is not stored in localStorage; the former demo key is removed. `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and the SQL setup in `artifacts/my-shop/SUPABASE_SETUP.md` are required before login and persistence work. Each login sees its own records; employee invitations, shared business access and employee monitoring are not implemented.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
