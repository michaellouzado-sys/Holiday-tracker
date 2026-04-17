# Holiday Tracker — Setup Guide

## What you need
- Node.js 18+ installed (https://nodejs.org)
- A Supabase account (https://supabase.com) — free tier is fine
- A Vercel account (https://vercel.com) — free tier is fine
- Git installed

---

## Step 1 — Create the Supabase database

1. Log in to https://supabase.com and create a new project (pick any name, e.g. "holiday-tracker").
2. Once the project is ready, go to **SQL Editor** (left sidebar).
3. Paste and run this SQL:

```sql
create table app_data (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Allow anyone with the anon key to read and write this table.
-- The app is shared between you and your wife with no login required.
alter table app_data enable row level security;

create policy "Allow full access to all"
  on app_data
  for all
  using (true)
  with check (true);
```4. Go to **Project Settings → API** (left sidebar).
5. Copy:
   - **Project URL** — looks like `https://abcdefgh.supabase.co`
   - **anon / public key** — a long JWT string

https://mucatufswcpbwcgapxss.supabase.co
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im11Y2F0dWZzd2NwYndjZ2FweHNzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0MTUxNDQsImV4cCI6MjA5MTk5MTE0NH0.lNwu4W2o9xGv7rc9ntD1n1Gyfy-r31BkQxSQ2ETHIHk

VITE_ANTHROPIC_API_KEY=sk-ant-your-key-here

---

## Step 2 — Set up the project locally

```bash
# 1. Install dependencies
npm install

# 2. Create your local env file
cp .env.example .env.local
```

Open `.env.local` and paste your Supabase values:

```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

```bash
# 3. Run locally to test
npm run dev
```

Open http://localhost:5173 — you should see the app. Add a holiday to confirm Supabase is connected.

---

## Step 3 — Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
```

Create a new repository on https://github.com (can be private), then:

```bash
git remote add origin https://github.com/YOUR_USERNAME/holiday-tracker.git
git branch -M main
git push -u origin main
```

---

## Step 4 — Deploy to Vercel

1. Go to https://vercel.com and click **Add New → Project**.
2. Import your GitHub repository.
3. Vercel will auto-detect it as a Vite project — no build settings needed.
4. Before deploying, click **Environment Variables** and add:
   - `VITE_SUPABASE_URL` → your Supabase project URL
   - `VITE_SUPABASE_ANON_KEY` → your Supabase anon key
5. Click **Deploy**.

After ~30 seconds you'll have a live URL like `https://holiday-tracker-abc.vercel.app`.
Send that URL to your wife — you both use the same URL and share the same data.

---

## Upgrading the app in future

When you get updated code from Claude:

1. Replace the files in your project (typically just `src/App.jsx`).
2. Commit and push to GitHub — Vercel deploys automatically.

**Your data is safe** — it lives in Supabase independently of the code.
Vercel only deploys new code; it never touches your database.

---

## Optional: give the app a custom domain

In Vercel → your project → **Settings → Domains**, you can add any domain you own
(e.g. `holidays.yourdomain.com`).

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Blank page after deploy | Check Vercel build logs; usually a missing env variable |
| "Missing env variables" error | Make sure both `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set in Vercel |
| Changes don't save | Open browser console — look for Supabase errors. Check RLS policy was created. |
| Data not shared between devices | Both devices must use the exact same URL |
