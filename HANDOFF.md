# Handoff — read this first if you're picking up this project fresh

This file exists so a new Claude Code session (or a human) can get oriented
without re-deriving everything from scratch. If you're an AI assistant reading
this at the start of a session, read this whole file before doing anything else.

## What this project is

`README.md` covers the app itself (a hotel compliance/maintenance tracker).
This file covers *state* — what's been done, what's live, what's still open.

## Current state (as of this handoff)

- **Live and deployed**: https://compliance-ledger.onrender.com, also reachable at
  the custom domain https://buttcheekslibrary.com (GoDaddy DNS → Render, cert
  issued) — a real Render web service, auto-deploying on every push to `main`
  on GitHub (`github.com/mckml69/TKDH`).
- **Real per-user password authentication** is built and working (`server/auth.js`,
  `/api/auth/*` routes in `server/index.js`) — replacing the original prototype's
  "pick your name" sign-in. See `server/README.md` → "Locked out?" if you need to
  reset a password without a working login.
- **The frontend and backend are combined into one deployable service.** Express
  serves the built Vite frontend directly (see the bottom of `server/index.js`) —
  there's no separate frontend host. `render.yaml` is the deploy blueprint.
- **Report branding** (logo, business name, address, registration number, footer)
  is built and applies to every exported report — see `src/components/settings/Branding.jsx`.
- **The Fire Log weekly export** matches the customer's actual paper form
  (`Fire Weekly Compliance Sheet.xls`), Monday-first per the app's own internal
  week logic — not Sunday-first like the original paper form.
- **Attachments are stored in Cloudflare R2**, not base64-in-database — the four
  `R2_*` env vars are set on Render and live uploads/downloads are confirmed
  working end to end. See `server/README.md` → "Attachments / object storage"
  for how the dual-mode (R2 vs. legacy base64) fallback works, and `server/r2.js`.
  One gotcha hit and fixed along the way: the AWS SDK v3 client's default
  flexible-checksum headers aren't compatible with R2 and made every
  upload/download fail with no useful error until checksum calculation/validation
  was explicitly set to `"WHEN_REQUIRED"` in the S3Client config.

## Things fixed along the way, worth knowing about

The original handover package (see `README.md`'s own "What's new in this
rebuild" section) had several latent bugs from the split — missing imports that
silently broke exports and the Home dashboard. These are all fixed now, but if
something *else* throws `"X is not defined"` in the browser console, check the
import line at the top of that file first — it's happened enough times in this
codebase that it's the first thing worth ruling out.

A blanket CSS rule (`.app, .app * { color:#1C1F24; }` in `src/styles/global.css`)
overrides color on every single element, including SVG icons that use
`currentColor`. If something renders in the wrong color on a dark background,
this is almost certainly why — the fix pattern is giving that specific element
its own explicit `color` rule with higher specificity (see `.app svg` a few
lines below it for the precedent).

## Known open items, roughly in priority order

1. **Database migration** — the backend still uses the simple `kv_store` table,
   not the relational schema in `server/db/schema.sql`. Real, scoped, deliberately
   deferred work — see `server/README.md`.
2. **Automated tests** — a first Vitest suite exists (`src/lib/helpers.test.js`,
   run via `npm test`) covering the pure date/status/validation functions in
   `helpers.js`. Everything else (search/haystack functions, the Fire Log export
   machinery, the server routes, the UI) still has no automated coverage — this
   was a deliberately small first slice, not the whole job.
3. **Cosmetic, unsolved**: on one specific machine (this session's user, on a
   different computer than wherever you're reading this), sidebar icons render
   as invisible/black despite every diagnostic (computed CSS, DevTools, hardware
   acceleration, Night Light, zoom level, incognito) confirming the actual color
   value is correct. Deprioritized as a one-machine rendering quirk rather than
   a real app bug — see conversation history if you want the full diagnostic
   trail, but don't spend much time on it unless it starts happening elsewhere.

## Getting set up on a new machine

```bash
git clone https://github.com/mckml69/TKDH.git
cd TKDH
npm install
cp .env.example .env              # VITE_STORAGE_MODE=local is fine for a first look
cd server
npm install
cp .env.example .env
cd ..
npm run dev                        # http://localhost:5173, local-storage mode
```

To develop against the real backend instead of local-storage mode:
`.env` → `VITE_STORAGE_MODE=api`, then `cd server && npm start` (separately) —
see the root `README.md` Quickstart for the full local dev flow.

**Do not commit `.env`, `server/.env`, or `server/data.sqlite`** — all gitignored
on purpose. `server/data.sqlite` in particular is a *local* database; it has
nothing to do with the production data living on Render's persistent disk.
