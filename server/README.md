# Compliance Ledger — reference server

A minimal Express + SQLite backend implementing exactly the contract the
frontend's `src/lib/storage/apiAdapter.js` expects. This exists so there's a
**real, tested, working** backend to point the frontend at — not just a
description of one.

## What this actually is

One table, `kv_store` (see `db.js`): `key`, `value` (a JSON string — the same
value the frontend already produces), `shared`. Four routes in `index.js`:

```
GET    /api/storage?prefix=x     list keys
GET    /api/storage/:key         read one
PUT    /api/storage/:key         write one   { value: "..." }
DELETE /api/storage/:key         delete one
```

This was verified with real HTTP requests during development (PUT → GET → list →
DELETE → GET-should-404), not just written and assumed to work.

## What this is *not*

It is **not** the schema in `db/schema.sql`. That file documents the properly
normalized relational schema — separate tables per entity, real foreign keys, an
append-only history table instead of embedding history in JSON, an attachments
table pointing at real object storage. This server doesn't use it yet.

Why ship both, then? Because building a full relational API layer (translating
every one of the ~15 hook operations into normalized reads/writes, handling the
JSONB `fields` column correctly per record category, migrating history into its
own table) is real, multi-day work — the honest thing to do was get *something*
real and working now, document the actual target schema clearly, and leave the
migration as a scoped, well-defined next step rather than either skipping the
database design entirely or claiming a shortcut was the real thing.

**Authentication** now exists (`auth.js` + the `/api/auth/*` routes in `index.js`):
per-person passwords (Node's built-in `scrypt`, never plaintext), httpOnly-cookie
sessions backed by a `sessions` table, and a `credentials` table kept deliberately
separate from the generic `kv_store` so a password hash can never be returned by
`GET /api/storage/:key`. `/api/storage/*` is open exactly like before *until* the
first account is bootstrapped (`POST /api/auth/bootstrap` — the frontend's sign-in
screen does this automatically the first time it loads against an empty server);
from that moment on, every request to `/api/storage/*` requires a valid session.

This does not cover: email-based password reset (see "Locked out?" below), or the
full relational migration described below — both are separate, intentionally
unstarted.

## Running it

```bash
npm install
cp .env.example .env
npm start          # http://localhost:4000
```

## Attachments / object storage

By default, attachments (photos, voice notes, files) are stored as base64 directly
in `kv_store`, same as every other value — simple, but not great at scale. Set the
four `R2_*` variables (see `.env.example`) to point attachments at a Cloudflare R2
bucket instead: `index.js` special-cases `attach-*` keys to upload/download real
bytes via `r2.js` (S3-compatible client) and leaves only a small `{ __r2__: true,
mime }` marker in `kv_store`, so it can tell at read-time whether to fetch from R2
or return the row directly. This means:

- All four `R2_*` vars must be set together, or none are used (falls back to the
  original base64-in-DB behavior — this is what local dev with no R2 credentials
  gets automatically).
- No migration script needed: attachments written *before* R2 was configured stay
  exactly as they are (full base64 in `kv_store`, no marker) and keep working
  unchanged; only new attachments go to R2 going forward.
- The bucket should stay **private** — this server fetches attachment bytes on the
  backend and returns them as a data URL, so there's no need for public bucket URLs
  or signed links.

## Locked out?

There's no email server in this stack, so "forgot password" doesn't send a reset
link. An Employee can always be helped by a General Manager (Users & Permissions →
the key icon on their row — no current password needed). If a General Manager is
locked out with nobody else to ask, run this directly on the machine hosting the
server (it talks straight to the database, no login required):

```bash
node reset-password.js someone@yourhotel.com newPassword123
# or: npm run reset-password -- someone@yourhotel.com newPassword123
```

This is the standard tradeoff for a self-hosted app with no email infrastructure:
whoever has terminal access to the server is the ultimate recovery path. It also
signs that account out everywhere, since an old session shouldn't outlive "I
forgot my password."

## Migrating to the real schema (next developer's task)

1. Stand up Postgres, run `db/schema.sql` against it.
2. Swap `better-sqlite3` for `pg` (or an ORM if you prefer — Prisma/Drizzle would
   both work well against this schema).
3. Replace the four generic `/api/storage/*` routes with real REST resources:
   `/api/records`, `/api/assets`, `/api/rooms`, etc. — each doing real
   `SELECT`/`INSERT`/`UPDATE` against its table instead of stuffing a whole array
   into one `kv_store` row.
4. The frontend hooks (`useLedger.js` etc.) currently expect `window.storage.get`
   to return one big JSON array per entity type. Either (a) keep that contract and
   have the new routes assemble/serialize the array server-side from normalized
   rows, which requires zero frontend changes, or (b) rewrite the hooks to call
   proper per-entity REST endpoints directly, which is more work but a cleaner
   long-term shape. (a) is the faster path if you want this shipped soon.
5. Move `history` writes into the real `history` table instead of a JSON column
   on each entity, and change `auditTrail.js`'s `computeUpsert`/`computeArchive`/
   `computeRestore` to call the API rather than building the array client-side.
