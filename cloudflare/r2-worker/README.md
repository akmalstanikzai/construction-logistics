# Private investor NID documents on Cloudflare R2

The browser never receives R2 credentials. This Worker checks the caller's Supabase Auth token, checks investor access through Supabase RLS, and reads/writes NID PDFs through a private R2 bucket binding.

The current deployment is `https://asma-afghan-investor-documents.asma-afghan-0b6224dd.workers.dev`. Its R2 bucket is `asma-afghan-investor-nics`, and the app's local `.env.local` points to this Worker.

## 1. Deploy the Supabase migration

Apply the SQL migrations in filename order with the Supabase CLI. If using the SQL Editor, run migrations 001, 003, and 004 for a new project. If you already applied 001 through 003, run only 004 now:

1. `supabase/migrations/202611070001_investors.sql` creates the investor tables and the `create_investor` transaction function.
2. `supabase/migrations/202611070002_investor_staff_access.sql` previously required staff approval.
3. `supabase/migrations/202611070003_authenticated_investor_access.sql` supersedes that restriction and allows every authenticated user to view and add investors and attach NID PDFs.
4. `supabase/migrations/202611070004_fix_create_investor_contacts.sql` fixes the `create_investor` function used by the add investor form.

The staff list from migration 002 is no longer checked after migration 003. Users only need to sign in through Supabase Auth. If the app should be invite-only, turn off **Allow new users to sign up** in Supabase Auth settings and invite users through **Authentication → Users**.

## 2. Create a private R2 bucket

In Cloudflare Dashboard, open **R2 Object Storage** and create a bucket named `asma-afghan-investor-nics` (or update `bucket_name` in `wrangler.toml` to your chosen name). Keep public access disabled. The app accesses it only through the Worker binding.

## 3. Configure and deploy the Worker

For a fresh Cloudflare account, install Wrangler if needed. From the project root (`~/Desktop/construction`), use the config path on every command:

```sh
npx wrangler login
npx wrangler deploy --config cloudflare/r2-worker/wrangler.toml
npx wrangler secret put SUPABASE_URL --config cloudflare/r2-worker/wrangler.toml
npx wrangler secret put SUPABASE_PUBLISHABLE_KEY --config cloudflare/r2-worker/wrangler.toml
```

You can also `cd cloudflare/r2-worker` first and omit `--config`. The secret commands prompt for values in the terminal; enter them there and do not paste them into chat. Wrangler deploys a new Worker version when a secret is set. For the current deployment, both secrets are already configured.

For `SUPABASE_URL`, use the project URL from the Supabase dashboard. For `SUPABASE_PUBLISHABLE_KEY`, use the same publishable key used by the Vite app (`VITE_SUPABASE_PUBLISHABLE_KEY`). The Worker uses it only as the Supabase API key; it is not an R2 credential.

Set `APP_ORIGINS` in `wrangler.toml` to a comma-separated list of exact frontend origins, with no trailing slashes. It includes common local Vite origins. Add your production app origin before using the Worker from production, then run `npx wrangler deploy --config cloudflare/r2-worker/wrangler.toml` again.

Wrangler prints the Worker URL after deployment.

## 4. Connect the Vite app to the Worker

Add the Worker URL to the app's local `.env.local` if it is not already set:

```dotenv
VITE_R2_WORKER_URL=https://asma-afghan-investor-documents.asma-afghan-0b6224dd.workers.dev
```

For a hosted frontend, add the same variable to its build environment, then rebuild/redeploy the frontend. Restart Vite after editing `.env.local`.

## 5. CORS and file restrictions

Browser requests go to the Worker, which returns CORS headers only for its configured `APP_ORIGINS`. R2 is accessed server-side through the binding, so the bucket does not need browser CORS rules. The Worker accepts only authenticated requests, PDF content with a `%PDF-` signature, and files up to 10 MB. It serves downloads as attachments and disables caching. If a document upload fails after an investor record is saved, use **Attach NID** on that record to retry without creating a duplicate investor.
