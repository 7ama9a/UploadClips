# Deploy 7Upload on Supabase (+ Netlify)

Your app now runs on **Supabase** (database, Discord login, video storage, realtime).  
**Netlify** hosts the free public website URL you share with friends.

---

## Part 1 — Supabase setup (15 min)

### 1. Create project

1. [supabase.com](https://supabase.com) → **New project** (free).
2. Save **Project URL** and **anon public** key (Settings → API).

### 2. Run SQL

Dashboard → **SQL Editor** → New query → paste and **Run**:

1. [`supabase/schema.sql`](./supabase/schema.sql)

### 3. Storage bucket

1. **Storage** → **New bucket**
2. Name: `clips`
3. **Public bucket**: ON
4. SQL Editor → run [`supabase/storage-policies.sql`](./supabase/storage-policies.sql)

### 4. Enable Realtime

**Database** → **Replication** (or Publications) → enable for tables:

- `clips`
- `likes`
- `profiles`

(Or: SQL Editor → `alter publication supabase_realtime add table clips, likes, profiles;`)

### 5. Discord login

1. [Discord Developer Portal](https://discord.com/developers/applications) → OAuth2.
2. Supabase → **Authentication** → **Providers** → **Discord** → Enable.
3. Copy **Callback URL** from Supabase into Discord **Redirects** (Supabase gives you the URL).
4. Paste Discord **Client ID** + **Secret** into Supabase Discord provider.
5. **Authentication** → **URL configuration**:
   - **Site URL**: `http://localhost:3000` (for local test)
   - **Redirect URLs**: add:
     ```
     http://localhost:3000/**
     https://YOUR-SITE.netlify.app/**
     ```

---

## Part 2 — Local test

1. Edit `public/js/supabase-env.js` OR create `.env` and run:

```bash
# PowerShell
$env:SUPABASE_URL="https://xxxxx.supabase.co"
$env:SUPABASE_ANON_KEY="your_anon_key"
node scripts/inject-supabase-config.js
```

2. Serve the site (static server):

```bash
npx serve public -l 3000
```

3. Open `http://localhost:3000` → Login with Discord → Upload a clip.

---

## Part 3 — Deploy on Netlify (public URL)

### 1. Push to GitHub

Upload the project to a GitHub repository.

### 2. Import on Netlify

1. [netlify.com](https://netlify.com) → **Add new site** → **Import from Git**.
2. Build settings (from `netlify.toml`):
   - **Build command:** `node scripts/inject-supabase-config.js`
   - **Publish directory:** `public`

### 3. Environment variables (Netlify)

Site → **Site configuration** → **Environment variables**:

| Key | Value |
|-----|--------|
| `SUPABASE_URL` | `https://xxxxx.supabase.co` |
| `SUPABASE_ANON_KEY` | your anon public key |

### 4. Deploy

Deploy site → copy URL e.g. `https://sevenupload.netlify.app`

### 5. Update Supabase URLs

Supabase → **Authentication** → **URL configuration**:

- **Site URL**: `https://sevenupload.netlify.app`
- **Redirect URLs**: include `https://sevenupload.netlify.app/**`

---

## Share with friends

Send your **Netlify** link:

```
https://YOUR-SITE.netlify.app
```

No localhost, no PC needed — Supabase runs 24/7.

---

## Free tier limits

| Resource | Free limit |
|----------|------------|
| Storage | 1 GB (videos) |
| Database | 500 MB |
| Bandwidth | 5 GB / month |

Large clips fill storage quickly — consider a max file size later.

---

## Troubleshooting

| Problem | Fix |
|--------|-----|
| "Supabase not configured" | Set `SUPABASE_URL` + `SUPABASE_ANON_KEY` on Netlify, redeploy |
| Discord login fails | Site URL + Redirect URLs must match Netlify domain |
| Upload fails | Bucket `clips` is public; storage policies applied |
| Clips don’t update live | Enable Realtime replication on `clips`, `likes` |
| Videos don’t play | Bucket must be **public** |

---

## Old Express server

`server.js` is **not needed** for Supabase hosting. You can ignore `npm start` unless testing the legacy setup.
