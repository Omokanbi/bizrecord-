# Supabase setup for BizRecord

Shop records are stored in Supabase. The old `my-shop-demo-v1` browser data is removed and is not migrated. Supabase Auth keeps its session in the current browser tab's `sessionStorage`; business records are not stored in browser storage.

1. In your Supabase project, enable Email sign-in.
2. Run `supabase/schema.sql` in the Supabase SQL Editor. It creates the `shop_records` table, owner-scoped row-level security policies, and the authenticated-only save function.
3. In Replit Secrets, set:
   - `VITE_SUPABASE_URL` — the project's URL.
   - `VITE_SUPABASE_ANON_KEY` — its public anon/publishable key. Do not use the service-role key in the browser.
4. In Supabase Auth URL Configuration, set the BizRecord app's published URL as the Site URL and allow the Replit preview URL for email-confirmation redirects.
5. Restart the My Shop workflow, create an account, and verify a product persists after refresh. A second account should see its own empty shop, not the first account's records.

The app intentionally shows a setup error rather than falling back to demo or local storage if the Supabase table or policies are missing. Employee invitations and shared owner/employee access are not part of this user-scoped version.
