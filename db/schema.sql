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
