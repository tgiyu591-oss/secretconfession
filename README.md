# Hush

A small confession website with private-by-link sharing. Confessions and optional sender names are saved in Supabase. Each confession gets a random, hard-to-guess link; anyone with that link can read it.

## Connect your Supabase project

1. Create a project in the [Supabase dashboard](https://supabase.com/dashboard).
2. In the project's SQL Editor, run the contents of [`supabase/schema.sql`](./supabase/schema.sql). This creates the `confessions` table and enables row-level security without public access policies.
3. In Project Settings → API, copy the Project URL and a server-side secret key. A legacy `service_role` key also works.
4. Copy `.env.example` to `.env` and replace the placeholders:

   ```text
   SUPABASE_URL=https://your-project-id.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your-server-only-secret-key
   PORT=3000
   ```

   Never put the secret/service-role key in browser code, commit it, or share it publicly. `.env` is excluded from Git.

## Run locally

Requires Node.js 22.13 or later.

```powershell
npm start
```

Open <http://localhost:3000>. The server connects directly to your Supabase project; it does not use local SQLite.

Run the tests with:

```powershell
npm test
```

## Sharing with someone

The link created in the app uses the address where the app is running. A `localhost` link only works on your own computer. To share links with someone elsewhere, deploy the app to a public HTTPS host, configure `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` as server-side environment variables there, and run the SQL schema in your Supabase project.

## Privacy

There is no public feed or login. The link is the only access control: anyone it is shared with can read the confession. Confession text is stored in your Supabase project. Only deploy somewhere you trust, use HTTPS, and avoid including passwords or other highly sensitive information. Notes do not currently expire or have a delete feature.
