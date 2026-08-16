-- Compliance Ledger — reference database schema (PostgreSQL 14+)
--
-- This maps directly onto the JSON shapes the frontend already works with (see
-- src/lib/constants.js and the JSDoc-style comments in each hook under src/hooks/).
-- Records vary a lot by category/mode (recurring check vs. incident vs. training
-- certificate etc.), so rather than one column per possible field, `records` keeps
-- the fields every record shares as real columns and puts the mode-specific fields
-- (temperatureC, actionTaken, expiryDate, and so on) in a single JSONB column. That
-- keeps the schema honest about what's actually structural vs. what's per-template
-- detail, and means adding a new record template later doesn't need a migration.
--
-- Every table that the app can archive/restore has `archived` + `archived_at`.
-- Every table that the app tracks history for has a matching row in `history`
-- rather than embedding history in the entity itself — this is the real,
-- queryable version of the in-memory `history` arrays the frontend builds today.

CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- for gen_random_uuid()

-- ---------------------------------------------------------------------------
-- USERS — no passwords by design (see README "Authentication" section).
-- This table exists so the app can attribute every action to a real person;
-- it is not, on its own, an access-control boundary. Add real auth (password
-- hash + session/JWT) before this goes anywhere production-facing.
-- ---------------------------------------------------------------------------
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  role          TEXT NOT NULL CHECK (role IN ('Employee', 'General Manager')),
  tags          TEXT[] DEFAULT '{}',
  archived      BOOLEAN NOT NULL DEFAULT false,
  archived_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- ROOMS
-- ---------------------------------------------------------------------------
CREATE TABLE rooms (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_number   TEXT NOT NULL,
  floor         TEXT,
  room_type     TEXT NOT NULL,
  notes         TEXT,
  tags          TEXT[] DEFAULT '{}',
  archived      BOOLEAN NOT NULL DEFAULT false,
  archived_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- CHECKPOINTS — physical locations for checks like Window Restriction that
-- deliberately are NOT always hotel rooms (corridors, reception, the bar,
-- communal bathrooms). Kept as its own register rather than folded into
-- rooms, since forcing "Reception" or "Bar" into the Room register would
-- corrupt what Rooms means everywhere else in the app.
-- ---------------------------------------------------------------------------
CREATE TABLE checkpoints (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  notes         TEXT,
  tags          TEXT[] DEFAULT '{}',
  archived      BOOLEAN NOT NULL DEFAULT false,
  archived_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- ASSETS
-- ---------------------------------------------------------------------------
CREATE TABLE assets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_code      TEXT NOT NULL,
  asset_type      TEXT NOT NULL,     -- matches ASSET_TYPES keys in constants.js
  category        TEXT NOT NULL,     -- fire | legionella | equipment | window_restriction (derived from asset_type)
  eligible_for    TEXT[] DEFAULT '{}', -- which check categories this asset can be logged against — see copyLifecycleFields in helpers.js
  name            TEXT,
  location        TEXT,
  room_id         UUID REFERENCES rooms(id) ON DELETE SET NULL,
  checkpoint_id   UUID REFERENCES checkpoints(id) ON DELETE SET NULL, -- window-restriction assets link here instead of room_id
  manufacturer    TEXT,
  model           TEXT,
  serial_number   TEXT,
  install_date    DATE,
  status          TEXT NOT NULL DEFAULT 'In Service',
  notes           TEXT,
  tags            TEXT[] DEFAULT '{}',
  replaces_asset_id       UUID REFERENCES assets(id) ON DELETE SET NULL, -- asset-replacement lifecycle: new asset points back at what it replaced
  superseded_by_asset_id  UUID REFERENCES assets(id) ON DELETE SET NULL, -- old asset points forward at its replacement
  decommission_reason     TEXT,
  decommission_date       DATE,
  archived        BOOLEAN NOT NULL DEFAULT false,
  archived_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_assets_checkpoint ON assets(checkpoint_id);

-- ---------------------------------------------------------------------------
-- CONTRACTORS & SUPPLIERS
-- ---------------------------------------------------------------------------
CREATE TABLE contractors (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name               TEXT NOT NULL,
  contact_name       TEXT,
  phone              TEXT,
  email              TEXT,
  insurance_expiry   DATE,
  notes              TEXT,
  tags               TEXT[] DEFAULT '{}',
  archived           BOOLEAN NOT NULL DEFAULT false,
  archived_at        TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- STAFF
-- ---------------------------------------------------------------------------
CREATE TABLE staff (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  role         TEXT,
  email        TEXT,
  phone        TEXT,
  start_date   DATE,
  notes        TEXT,
  tags         TEXT[] DEFAULT '{}',
  archived     BOOLEAN NOT NULL DEFAULT false,
  archived_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- CERTIFICATES — gas safety, EICR, insurance, and similar documents. Kept
-- separate from `records` because they're evidence documents with their own
-- expiry, not repeating checks (see CERT_TYPES in constants.js).
-- ---------------------------------------------------------------------------
CREATE TABLE certificates (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title          TEXT NOT NULL,
  cert_type      TEXT NOT NULL,     -- one of CERT_TYPES
  issuer         TEXT,
  contractor_id  UUID REFERENCES contractors(id) ON DELETE SET NULL,
  asset_id       UUID REFERENCES assets(id) ON DELETE SET NULL,
  coverage       TEXT,
  issue_date     DATE,
  expiry_date    DATE,
  notes          TEXT,
  tags           TEXT[] DEFAULT '{}',
  archived       BOOLEAN NOT NULL DEFAULT false,
  archived_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- REGULATORY VISITS — EHO / Fire Officer / other official inspections.
-- ---------------------------------------------------------------------------
CREATE TABLE regulatory_visits (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_type        TEXT NOT NULL,   -- one of VISIT_TYPES
  visit_date        DATE NOT NULL,
  officer_name      TEXT,
  authority         TEXT,
  outcome           TEXT NOT NULL,   -- one of VISIT_OUTCOMES
  findings          TEXT,
  actions_required  TEXT,
  follow_up_date    DATE,
  status            TEXT NOT NULL DEFAULT 'Open', -- Open | Closed
  notes             TEXT,
  tags              TEXT[] DEFAULT '{}',
  archived          BOOLEAN NOT NULL DEFAULT false,
  archived_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- RESPONSIBLE PERSON — a single settings row (the named person accountable
-- for fire/H&S compliance under UK regulations). Not a full entity, no history.
-- ---------------------------------------------------------------------------
CREATE TABLE responsible_person (
  id           SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1), -- singleton row
  name         TEXT,
  role         TEXT,
  phone        TEXT,
  email        TEXT,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO responsible_person (id) VALUES (1);

-- ---------------------------------------------------------------------------
-- RECORDS — the core compliance log: every inspection, check, repair,
-- training entry, pest report, deep clean, incident. `category` picks the
-- template (see TEMPLATES in constants.js); `fields` holds whatever is
-- specific to that template's mode (recurring/expiry/incident/maintenance/log).
-- ---------------------------------------------------------------------------
CREATE TABLE records (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category            TEXT NOT NULL,     -- fire | legionella | equipment | risk | training | pest | deep_clean | room_inspection |
                                          -- room_photo | maintenance | window_restriction |
                                          -- fire_daily | fire_weekly | fire_monthly | fire_periodic (Fire Log — dedicated entry screens, hidden from the general picker) |
                                          -- window_restriction_check (Window Restriction's fast tick-list — also hidden from the general picker)
  title               TEXT NOT NULL,
  location            TEXT,
  people              TEXT,              -- free-text "who" when not linked to a Staff/Contractor row
  notes               TEXT,
  note                TEXT,              -- Window Restriction check's own note field (which window, what's wrong on a Not OK)
  status              TEXT,              -- meaning depends on mode: Open/Awaiting/Resolved for maintenance, ok/not_ok for window checks, etc.
  flagged             BOOLEAN NOT NULL DEFAULT false,
  flag_description    TEXT,
  flag_resolved       BOOLEAN NOT NULL DEFAULT false,
  flag_resolved_notes TEXT,
  flag_resolved_date  DATE,
  resolved_notes      TEXT,
  resolved_date       DATE,
  asset_id            UUID REFERENCES assets(id) ON DELETE SET NULL,
  room_id             UUID REFERENCES rooms(id) ON DELETE SET NULL,
  checkpoint_id       UUID REFERENCES checkpoints(id) ON DELETE SET NULL, -- Window Restriction checks link here, one record per (checkpoint, month)
  contractor_id       UUID REFERENCES contractors(id) ON DELETE SET NULL,
  staff_id            UUID REFERENCES staff(id) ON DELETE SET NULL,
  -- Maintenance's "who was contacted vs who actually did the work" distinction — deliberately two
  -- separate pairs of columns, never collapsed into one, since a GM may call three contractors
  -- before someone actually shows up and the record has to keep both facts straight.
  awaiting_contractor_id   UUID REFERENCES contractors(id) ON DELETE SET NULL,
  awaiting_staff_id        UUID REFERENCES staff(id) ON DELETE SET NULL,
  resolved_contractor_id   UUID REFERENCES contractors(id) ON DELETE SET NULL,
  resolved_staff_id        UUID REFERENCES staff(id) ON DELETE SET NULL,
  linked_record_id    UUID REFERENCES records(id) ON DELETE SET NULL, -- e.g. the maintenance follow-up auto-created from a flagged/failed check
  linked_visit_id     UUID REFERENCES regulatory_visits(id) ON DELETE SET NULL,
  resolved_via_record_id UUID REFERENCES records(id) ON DELETE SET NULL, -- window checks only: which maintenance resolution flipped this back to OK
  period_key          TEXT,              -- Fire Log / Window Restriction: the period this record covers (YYYY-MM-DD for daily, YYYY-MM for monthly/window checks)
  periodic_item_key   TEXT,              -- Fire Log periodic events only (drills, authority visits) — which checklist item this is
  date_logged         DATE,
  locked_snapshot      JSONB,            -- frozen state captured the moment the period locked — see fireLogEnsureSnapshot / checkpointCheckEnsureSnapshot.
                                          -- The export always reads this over the live row once locked, except for the one sanctioned
                                          -- exception: a maintenance resolution flowing back via resolved_via_record_id.
  checks              JSONB,             -- Fire Log's per-item checklist state: { itemKey: { done, comments, ... } }
  fields              JSONB NOT NULL DEFAULT '{}', -- remaining mode-specific fields: lastCompleted, frequencyDays, expiryDate, dateReported,
                                          -- dateRaised, priority, temperatureC, readingType, detail, visitType, etc.
  tags                TEXT[] DEFAULT '{}',
  archived            BOOLEAN NOT NULL DEFAULT false,
  archived_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_records_category ON records(category);
CREATE INDEX idx_records_asset ON records(asset_id);
CREATE INDEX idx_records_room ON records(room_id);
CREATE INDEX idx_records_checkpoint ON records(checkpoint_id);
CREATE INDEX idx_records_contractor ON records(contractor_id);
CREATE INDEX idx_records_staff ON records(staff_id);
CREATE INDEX idx_records_archived ON records(archived);
CREATE INDEX idx_records_period ON records(category, period_key);
CREATE INDEX idx_records_fields_gin ON records USING GIN (fields);

-- The golden rule, enforced at the database level rather than trusted to the application alone:
-- Fire Log's daily/weekly/monthly checks get exactly one live record per period.
CREATE UNIQUE INDEX uniq_firelog_period ON records(category, period_key)
  WHERE category IN ('fire_daily', 'fire_weekly', 'fire_monthly') AND NOT archived;
-- Window Restriction: exactly one live record per (checkpoint, month).
CREATE UNIQUE INDEX uniq_window_check_period ON records(checkpoint_id, period_key)
  WHERE category = 'window_restriction_check' AND NOT archived;

-- ---------------------------------------------------------------------------
-- ATTACHMENTS — photos, voice notes, and files, on any entity above.
-- `storage_url` should point at real object storage (S3-compatible) in
-- production; the reference server in this package stores files on local
-- disk under /server/uploads for simplicity, which is NOT suitable beyond
-- a demo/single-instance deployment.
-- ---------------------------------------------------------------------------
CREATE TABLE attachments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type    TEXT NOT NULL,   -- 'record' | 'asset' | 'room' | 'checkpoint' | 'contractor' | 'staff' | 'certificate' | 'visit'
  entity_id      UUID NOT NULL,
  kind           TEXT NOT NULL DEFAULT 'file', -- 'photo' | 'voice' | 'file'
  name           TEXT NOT NULL,
  size_bytes     INTEGER NOT NULL,
  mime_type      TEXT,
  transcript     TEXT,            -- best-effort voice-note transcript, if the browser produced one
  storage_url    TEXT NOT NULL,
  uploaded_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_attachments_entity ON attachments(entity_type, entity_id);

-- ---------------------------------------------------------------------------
-- HISTORY — the immutable audit trail. Every create/edit/archive/restore and
-- every correction-request/resolve/dismiss becomes an append-only row here,
-- replacing the in-memory `history` array the prototype kept on each entity.
-- Never UPDATE or DELETE rows in this table from application code.
-- ---------------------------------------------------------------------------
CREATE TABLE history (
  id            BIGSERIAL PRIMARY KEY,
  entity_type   TEXT NOT NULL,    -- 'record' | 'asset' | 'room' | 'checkpoint' | 'contractor' | 'staff' | 'certificate' | 'visit' | 'user'
  entity_id     UUID NOT NULL,
  action        TEXT NOT NULL,    -- created | edited | archived | restored | correction-requested | correction-resolved | correction-dismissed
  by_user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  by_name       TEXT,             -- denormalised snapshot of the user's name at the time, so history reads correctly even if the user is later renamed/archived
  changes       JSONB,            -- [{ field, from, to }, ...] for 'edited' entries
  note          TEXT,             -- free-text note for correction requests/dismissals
  at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_history_entity ON history(entity_type, entity_id, at DESC);

-- ---------------------------------------------------------------------------
-- SESSIONS — placeholder for when real authentication is added (see README).
-- Not used by the reference server as shipped; the reference server trusts
-- an X-User-Id header for demo purposes only. Do not deploy that as-is.
-- ---------------------------------------------------------------------------
CREATE TABLE sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL
);
