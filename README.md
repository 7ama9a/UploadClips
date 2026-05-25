# 7Upload — Gaming Clip Platform

Vanilla HTML/CSS/JS frontend with Node.js backend, Discord login, SQLite database, and real-time updates via Socket.io.

## Features

- **Arabic / English** — language switch in navbar (RTL for Arabic)
- **Dark theme default** — animated sun/moon toggle (light mode available)
- **Discord OAuth** — login; username + avatar top-right
- **Pages**: Home, Clips, Users, Upload, Profile (`#profile/user-id`)
- **Unlimited upload size** — videos stored on disk at original quality
- **Likes** — Instagram-style heart animation per clip
- **Views** — counted when opening a clip in the modal
- **Real-time** — new clips, likes, and views broadcast to all clients

## Setup (Supabase — recommended)

Full guide: **[SUPABASE-HOSTING.md](./SUPABASE-HOSTING.md)**

1. Create Supabase project → run `supabase/schema.sql` + storage policies
2. Enable Discord in Supabase Auth
3. Inject keys: `SUPABASE_URL` + `SUPABASE_ANON_KEY` → `node scripts/inject-supabase-config.js`
4. Run locally: `npm run serve` → **http://localhost:3000**
5. Deploy frontend on **Netlify** (env vars above)

### Legacy Express server (optional)

```bash
npm install
npm start
```

Uses `server.js` + SQLite — not needed if you use Supabase.

## Project structure

```
7UplodWeb/
  server.js          # API, Discord auth, uploads, Socket.io
  data/clips.db      # SQLite (auto-created)
  uploads/           # Video files
  public/
    index.html
    css/
    js/
```

## Free hosting (production)

| Guide | Platform |
|-------|----------|
| **[SUPABASE-HOSTING.md](./SUPABASE-HOSTING.md)** | **Supabase + Netlify** (default) |
| [HOSTING.md](./HOSTING.md) | Fly.io (legacy Express) |
| [NETLIFY-DEPLOY.md](./NETLIFY-DEPLOY.md) | Netlify + Render (legacy) |

## Notes

- For production, set `BASE_URL` to your domain and add the same URL in Discord OAuth redirects.
- Large files: ensure your reverse proxy (nginx, etc.) does not impose a body size limit.
- Videos use `object-fit: contain` so resolution is preserved in the player.
