# Player Auction App

A live auction app for a local football tournament.

**Stack:** Next.js 15 (App Router) · TypeScript · Tailwind CSS · Supabase (Postgres, Auth, Realtime, Storage) · Vercel

---

## Quick start

### 1. Clone & install
```bash
npm install
```

### 2. Set up Supabase
1. Create a new project at [supabase.com](https://supabase.com)
2. In the SQL editor, run the migration:
   ```
   supabase/migrations/0001_initial_schema.sql
   ```
3. Enable email auth in **Authentication → Providers → Email**
4. Create your admin user in **Authentication → Users → Add user**

### 3. Configure environment variables
```bash
cp .env.example .env.local
```
Edit `.env.local` and fill in your Supabase project URL and anon key
(found in **Project Settings → API**).

### 4. Run the dev server
```bash
npm run dev
```

---

## Project structure

```
src/
  app/           # Next.js App Router pages (to be built)
  lib/
    supabase/
      client.ts      # Browser Supabase client
      server.ts      # Server Supabase client (Server Components / Actions)
      middleware.ts  # Session refresh helper
      types.ts       # TypeScript types mirroring the DB schema
  middleware.ts  # Next.js middleware — refreshes auth session

supabase/
  migrations/
    0001_initial_schema.sql   # Tables + RLS policies
```

---

## Build order (see PLAN.md § 7)

- [x] Step 1 — Scaffold, Supabase connection, tables, RLS
- [x] Step 2 — Admin login, Settings / Teams / Players screens
- [x] Step 3 — Auction RPC functions with rule checks
- [x] Step 4 — Auction console
- [x] Step 5 — Display screen and teams board (Realtime)
- [ ] Step 6 — CSV export, reset, polish
