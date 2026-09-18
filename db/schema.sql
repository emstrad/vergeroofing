-- Idempotent. CI applies it on every merge to main, and applies it twice to
-- prove that. It only ever adds, so re-running cannot destroy data.
--
-- Apply a change here BEFORE merging the code that needs it: Vercel deploys on
-- the push and CI migrates a minute or two later, and in that gap new code runs
-- against the old table. On the lead endpoint that gap answers enquiries with a
-- 500.

CREATE TABLE IF NOT EXISTS leads (
  id            bigserial PRIMARY KEY,
  session_id    text        NOT NULL,
  stage         text        NOT NULL CHECK (stage IN ('partial', 'complete')),
  name          text,
  phone         text,
  email         text,
  postcode      text,
  -- Address fields are nullable because a partial never reaches step 3. The
  -- upsert coalesces them, so a partial flushing after a completion cannot
  -- blank the address the completion gave.
  address1      text,
  address2      text,
  town          text,
  property_type text,
  job_types     text[]      NOT NULL DEFAULT '{}',
  notes         text,
  -- Empty rather than null: every reader can then treat it as a list.
  files         text[]      NOT NULL DEFAULT '{}',
  is_insurance  boolean     NOT NULL DEFAULT false,
  channel       text,
  referrer      text,
  landing_page  text,
  device        text,
  utm           jsonb       NOT NULL DEFAULT '{}'::jsonb,
  -- sha256(ip + IP_SALT). The address itself is never stored, anywhere.
  ip_hash       text,
  user_agent    text,
  -- What happened to the email the browser was asked to send.
  notified_at   timestamptz,
  notify_error  text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- One row per (session_id, stage), so a partial flushing twice and a double
-- submit both land as one row rather than two enquiries for one person.
CREATE UNIQUE INDEX IF NOT EXISTS leads_session_stage_idx
  ON leads (session_id, stage);
CREATE INDEX IF NOT EXISTS leads_created_idx ON leads (created_at DESC);
CREATE INDEX IF NOT EXISTS leads_stage_created_idx ON leads (stage, created_at DESC);

CREATE TABLE IF NOT EXISTS events (
  id           bigserial PRIMARY KEY,
  session_id   text        NOT NULL,
  -- Constrained so an unknown event name cannot be stored: an open text column
  -- becomes a junk drawer and every metric then needs a manual allow-list.
  type         text        NOT NULL CHECK (type IN (
                 'page_view', 'form_start', 'form_step', 'form_error',
                 'form_submit', 'form_abandon', 'call_click', 'cta_click',
                 'upload', 'staff_login'
               )),
  detail       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  path         text,
  channel      text,
  referrer     text,
  device       text,
  utm          jsonb       NOT NULL DEFAULT '{}'::jsonb,
  ip_hash      text,
  -- Back-filled across the whole session when a complete lead is written, so
  -- an enquiry gets credited to the channel that produced it.
  lead_id      bigint REFERENCES leads (id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS events_session_idx ON events (session_id, created_at);
CREATE INDEX IF NOT EXISTS events_type_created_idx ON events (type, created_at DESC);
CREATE INDEX IF NOT EXISTS events_created_idx ON events (created_at DESC);

-- Per-person accounts are not wired up yet: the staff area takes one shared
-- code. The table and the create-user script exist now so moving to per-person
-- logins later is a route change rather than a migration.
CREATE TABLE IF NOT EXISTS staff_users (
  id            bigserial PRIMARY KEY,
  email         text        NOT NULL UNIQUE,
  name          text,
  -- argon2id, via @node-rs/argon2 for its prebuilt Lambda binaries: a native
  -- compile step in the deploy is a deploy that fails on someone else's
  -- toolchain.
  password_hash text        NOT NULL,
  active        boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);

-- Throttle counters live in the database, not in process memory: serverless
-- instances do not share memory, so an in-process counter is walked round by
-- spreading requests across cold starts.
CREATE TABLE IF NOT EXISTS rate_hits (
  id         bigserial PRIMARY KEY,
  bucket     text        NOT NULL,
  key        text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rate_hits_lookup_idx ON rate_hits (bucket, key, created_at DESC);

-- ---------------------------------------------------------------------------
-- The pipeline and the money
-- ---------------------------------------------------------------------------

-- Labels with no price. There is no rate card, because every job is quoted;
-- the type exists so the jobs list can be filtered and reported by it.
CREATE TABLE IF NOT EXISTS job_types (
  key      text PRIMARY KEY,
  label    text    NOT NULL,
  position int     NOT NULL DEFAULT 0,
  active   boolean NOT NULL DEFAULT true
);

INSERT INTO job_types (key, label, position) VALUES
  ('leak-repair', 'Leak or repair', 1),
  ('re-roof', 'Full re-roof', 2),
  ('flat-roof', 'Flat roof', 3),
  ('chimney-leadwork', 'Chimney and leadwork', 4),
  ('guttering-fascias', 'Guttering and fascias', 5),
  ('storm-damage', 'Storm damage', 6),
  ('maintenance', 'Maintenance', 7),
  ('commercial', 'Commercial', 8),
  ('other', 'Other', 9)
ON CONFLICT (key) DO NOTHING;

-- One row, id 1. The rates a NEW job takes; an existing job keeps its own.
CREATE TABLE IF NOT EXISTS job_settings (
  id               int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  tax_percent      numeric(5,2) NOT NULL DEFAULT 20,
  lead_fee_percent numeric(5,2) NOT NULL DEFAULT 15,
  lead_fee_to      text         NOT NULL DEFAULT 'scott',
  partners         text[]       NOT NULL DEFAULT ARRAY['tom','steve','ben','scott'],
  -- Null means the business has no standard deposit. Nothing derives a deposit
  -- from the price: that is a fixed-price convention and it does not survive
  -- contact with quoted work.
  deposit_percent  numeric(5,2),
  updated_at       timestamptz  NOT NULL DEFAULT now()
);

INSERT INTO job_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- One row per piece of work, from quote through to completion. One table
-- rather than a separate quotes table, so the client record, the photographs
-- and the address stay attached all the way through and nothing moves when a
-- quote is won.
CREATE TABLE IF NOT EXISTS jobs (
  id               bigserial PRIMARY KEY,
  lead_id          bigint REFERENCES leads (id) ON DELETE SET NULL,
  status           text NOT NULL DEFAULT 'quoted'
                     CHECK (status IN ('quoted','booked','completed','declined','cancelled')),
  job_type         text REFERENCES job_types (key),
  customer_name    text,
  phone            text,
  email            text,
  address1         text,
  address2         text,
  town             text,
  postcode         text,
  notes            text,
  worker           text,

  price_pence      bigint NOT NULL DEFAULT 0,
  -- Null means not known yet, which the card says out loud rather than
  -- treating as zero and reporting a margin nobody earned.
  materials_pence  bigint,

  quoted_on        date,
  quote_expires_on date,
  job_date         date,
  completed_on     date,
  -- From a short list, and the most valuable field in the database: without it
  -- there is no way to tell a price problem from a timing problem.
  declined_reason  text CHECK (declined_reason IN
                     ('price','timing','went-elsewhere','no-longer-needed','no-reply','other')),

  -- The rates the job was agreed at. Raising a percentage next month must not
  -- silently rewrite what everyone earned last month.
  tax_percent      numeric(5,2) NOT NULL DEFAULT 20,
  lead_fee_percent numeric(5,2) NOT NULL DEFAULT 15,
  lead_fee_to      text,
  partners         text[] NOT NULL DEFAULT ARRAY['tom','steve','ben','scott'],

  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS jobs_status_idx ON jobs (status, created_at DESC);
CREATE INDEX IF NOT EXISTS jobs_date_idx ON jobs (job_date);
CREATE INDEX IF NOT EXISTS jobs_lead_idx ON jobs (lead_id);

-- Payments are a list, not two tick boxes: a quoted trade takes a deposit,
-- sometimes a stage payment or two, then a balance, and the amounts are
-- whatever was agreed rather than half the price. Paid in full is therefore a
-- computed fact rather than a flag somebody remembers to set.
CREATE TABLE IF NOT EXISTS job_payments (
  id            bigserial PRIMARY KEY,
  job_id        bigint NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  amount_pence  bigint NOT NULL,
  paid_on       date   NOT NULL DEFAULT current_date,
  label         text   NOT NULL DEFAULT 'payment'
                  CHECK (label IN ('deposit','stage','balance','retention','payment')),
  note          text,
  -- Set when the row came from a matched bank line, so unmatching can remove
  -- exactly what matching created and nothing a person typed.
  bank_txn_id   bigint,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS job_payments_job_idx ON job_payments (job_id, paid_on);
CREATE UNIQUE INDEX IF NOT EXISTS job_payments_bank_idx
  ON job_payments (bank_txn_id) WHERE bank_txn_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Bank reconciliation
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS bank_statements (
  id          bigserial PRIMARY KEY,
  filename    text NOT NULL,
  rows_total  int  NOT NULL DEFAULT 0,
  rows_new    int  NOT NULL DEFAULT 0,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bank_transactions (
  id             bigserial PRIMARY KEY,
  statement_id   bigint REFERENCES bank_statements (id) ON DELETE CASCADE,
  -- The bank's own id where the export has one, otherwise date, amount,
  -- description and running balance hashed together, so overlapping months
  -- never double up.
  fingerprint    text NOT NULL UNIQUE,
  txn_date       date NOT NULL,
  description    text NOT NULL,
  -- Signed, and with any fee already folded in, so a line is the money that
  -- actually moved.
  amount_pence   bigint NOT NULL,
  balance_pence  bigint,
  category       text,
  -- 'auto' or 'manual'. A choice made by hand is never overwritten by a rule
  -- learned somewhere else.
  category_kind  text CHECK (category_kind IN ('auto','manual')),
  job_id         bigint REFERENCES jobs (id) ON DELETE SET NULL,
  job_kind       text CHECK (job_kind IN ('auto','manual')),
  -- Money out assigned to a job is a materials cost on that job.
  is_materials   boolean NOT NULL DEFAULT false,
  split_to       text[],
  split_kind     text CHECK (split_kind IN ('auto','manual')),
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bank_txn_date_idx ON bank_transactions (txn_date DESC);
CREATE INDEX IF NOT EXISTS bank_txn_statement_idx ON bank_transactions (statement_id);
CREATE INDEX IF NOT EXISTS bank_txn_job_idx ON bank_transactions (job_id);

-- What the page has learned. The key is the description with its numbers
-- stripped, so "TRAVIS PERKINS 1234" and "... 5678" share one rule.
CREATE TABLE IF NOT EXISTS bank_rules (
  key        text PRIMARY KEY,
  category   text,
  split_to   text[],
  job_id     bigint REFERENCES jobs (id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
