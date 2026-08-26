# Deploying Compliance Ledger

This walks through getting the app live on a real domain, end to end. It assumes
you've already read the "What's real vs. simulated" section in `README.md` —
real authentication ships with the app itself now (`server/auth.js`), nothing
extra to set up before deploying.

The shape of it: **one Render web service** runs the backend (Express + SQLite)
and also serves the built frontend itself (see `server/index.js`), so there's
only one thing to deploy and one URL. Your domain registrar (GoDaddy) only
needs to point DNS at that one service — it doesn't host anything itself.

## 1. Put the code on GitHub

Render deploys by watching a GitHub repo and redeploying on every push.

```bash
cd project
git init
git add .
git commit -m "Initial commit"
```

Then on github.com: New repository → give it a name → **don't** initialize it
with a README (you already have one) → follow the "push an existing
repository" instructions it shows you, e.g.:

```bash
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git
git branch -M main
git push -u origin main
```

## 2. Create the Render service

1. Sign up at render.com (free, no card needed to start).
2. New → **Blueprint** → connect your GitHub account → pick the repo you just pushed.
3. Render reads `render.yaml` at the repo root and pre-fills a web service named
   `compliance-ledger`, with a 1GB persistent disk for the SQLite database. Review
   it and click **Apply**.
4. First deploy takes a few minutes (installs dependencies, builds the frontend,
   starts the server). When it's done, Render gives you a URL like
   `https://compliance-ledger-xxxx.onrender.com` — open it and bootstrap your
   first General Manager account, exactly like you did locally.

## 3. Point your GoDaddy domain at it

1. In the Render dashboard for your service: **Settings → Custom Domains → Add
   Custom Domain**, enter your domain (e.g. `compliance.yourhotel.com` or the
   bare domain). Render shows you the exact DNS record it needs.
2. In GoDaddy: **My Products → DNS** for your domain, add the record Render
   showed you (usually a `CNAME` for a subdomain, or an `A`/`ALIAS` record for
   a bare domain — Render's instructions will say which).
3. Wait for DNS to propagate (minutes to a few hours). Render automatically
   issues a free HTTPS certificate for the domain once it verifies — no
   separate step needed.

## 4. If you ever get locked out

`server/reset-password.js` still works here — Render gives every service a
**Shell** tab in its dashboard (no SSH keys needed). Open it and run:

```bash
node reset-password.js someone@yourhotel.com newPassword123
```

See `server/README.md` → "Locked out?" for details.

## 5. Adding a second venue (e.g. a pub & kitchen the same GM is responsible for)

This same repo can run as a second, fully independent deployment — its own
database, its own accounts, nobody there can see this venue's data — with a
read-only, General-Manager-only pull of Maintenance/Pest issues and
"Whole building"-scoped Contractors/Certificates between the two. See
`src/App.jsx` (the switcher link), `src/hooks/useVenuePull.js`, and
`server/index.js`'s `/api/shared/pull` + `/api/venue-pull` for how it works.
Nothing here is active until you do this.

1. **Render dashboard → New → Web Service** (not Blueprint this time — Blueprint
   would try to manage the `compliance-ledger` name already used by your hotel
   service). Connect the same GitHub repo.
2. Give it a distinct name, e.g. `tkdh-pub` — this becomes its subdomain
   (`https://tkdh-pub.onrender.com`).
3. Build command: `npm install --include=dev && npm run build && cd server && npm install`
   Start command: `node server/index.js`
   (copy these straight from `render.yaml` — same as the hotel service).
4. Add a disk (Settings → Disks): a **different** name than the hotel's
   (e.g. `tkdh-pub-data`), mount path `/var/data`, 1GB. Skipping this loses the
   pub's database on every redeploy, same as it would for the hotel service.
5. Environment variables on **this new pub service**:
   ```
   NODE_ENV=production
   COOKIE_SECURE=true
   DATABASE_PATH=/var/data/data.sqlite
   VITE_STORAGE_MODE=api
   VITE_VENUE_NAME=TKDH Pub
   VITE_PUB_URL=<the hotel service's URL>
   VITE_PUB_VENUE_NAME=<whatever you want the hotel called here — the default "TKDH Pub" is wrong on this side>
   OTHER_VENUE_URL=<the hotel service's URL>
   SHARED_SYNC_SECRET=<make up a long random string>
   ```
6. Deploy, then open its URL and bootstrap the pub's own first General Manager
   account — same flow as the hotel, entirely separate database.
7. Go back to the **existing hotel service**'s Environment tab and add:
   ```
   VITE_PUB_URL=<the pub service's URL, from step 6>
   OTHER_VENUE_URL=<the pub service's URL>
   SHARED_SYNC_SECRET=<the exact same string you made up in step 5>
   ```
   Trigger a deploy (adding an env var normally does this automatically) —
   `VITE_PUB_URL` is baked into the frontend at build time, so it needs a real
   rebuild to take effect, not just a restart.
8. Reload the hotel site, signed in as General Manager — the sidebar switcher
   and "TKDH Pub issues" section on Home should now appear.

`SHARED_SYNC_SECRET` must be the exact same value on both services — that's
what lets each side prove to the other it's really the paired venue, not
anyone else's deployment of this same open-source app.

## Notes

- **The persistent disk matters.** Without it, the SQLite database would reset
  every time Render redeploys the service. The `render.yaml` blueprint already
  configures a 1GB disk mounted where `DATABASE_PATH` points — don't remove it.
- **Redeploying** happens automatically on every push to the branch you connected.
- This deploys the reference server as-is (`kv_store` backing store, not the
  relational schema in `server/db/schema.sql`) — see the main README's "Next
  steps" for that separate, larger piece of work.
