# Asma Afghan

React/Vite investor register with Supabase Auth and database records. NID PDF or images and images are kept in a private Cloudflare R2 bucket and served through an authenticated Worker.

## Local setup

```sh
npm install
npm run dev
```

The local `.env` has `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. The ignored `.env.local` has `VITE_R2_WORKER_URL` (see `.env.example`). Restart Vite after changing either file.

Apply the SQL migrations in `supabase/migrations/` in filename order. Migration 003 grants investor access to every authenticated user, and migration 004 fixes investor creation. If you already applied the first three migrations, apply only `202611070004_fix_create_investor_contacts.sql` now. Cloudflare R2 setup and deployment details are in `cloudflare/r2-worker/README.md`.

## Current R2 connection

The app's local `.env.local` points to `https://asma-afghan-investor-documents.asma-afghan-0b6224dd.workers.dev`. The Worker is bound to the private `asma-afghan-investor-nics` bucket. Its `APP_ORIGINS` setting currently allows local Vite ports 5173 and 5174 on `localhost` and `127.0.0.1`. Add the production frontend origin in `cloudflare/r2-worker/wrangler.toml` and redeploy the Worker before using it from a hosted app.

## Deploy to Vercel

Import this repository into Vercel with the Vite framework preset. The build command is `npm run build` and the output directory is `dist`. `vercel.json` enables direct loading and refreshes of app routes.

In **Project Settings → Environment Variables**, set these for Production (and Preview if you use previews):

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
VITE_R2_WORKER_URL=https://asma-afghan-investor-documents.asma-afghan-0b6224dd.workers.dev
```

Use the Supabase project URL and publishable key from your own project. Vite embeds these values at build time, so redeploy after changing them. Never put a Supabase secret/service-role key in a `VITE_` variable.

After Vercel gives you a production URL, add its exact origin (for example, `https://your-project.vercel.app`) to `APP_ORIGINS` in `cloudflare/r2-worker/wrangler.toml`, then redeploy the Worker with `npx wrangler deploy --config cloudflare/r2-worker/wrangler.toml`. Include any custom domain origin you use. Without this step, investor records work but NID PDF or image requests from production are blocked by the Worker.

## Projects

Apply `supabase/migrations/202611080003_projects.sql` to create the projects and project document tables. The Projects page records name, code number, organization, location, price, dates, status, and note. Status can be updated after creation. Project attachments use the existing private R2 Worker and bucket; deploy the updated `cloudflare/r2-worker/src/index.js` before uploading or downloading project documents. Each attachment is limited to 10 MB. Supported formats are PDF, images, Word, Excel, and plain text.
