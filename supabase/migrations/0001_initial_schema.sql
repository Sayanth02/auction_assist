-- ============================================================
-- Migration: 0001_initial_schema.sql
-- Player Auction App — tables + RLS
-- Run this in the Supabase SQL editor or via supabase db push
-- ============================================================

-- ----------------------------------------------------------------
-- 1. SETTINGS  (single-row table)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.settings (
  id                  INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),  -- enforces single row
  tournament_name     TEXT        NOT NULL DEFAULT 'My Tournament',
  logo_url            TEXT,
  theme_color         TEXT        NOT NULL DEFAULT '#16a34a',         -- tailwind green-600
  default_purse       NUMERIC(12,2) NOT NULL DEFAULT 100,
  min_squad           INTEGER     NOT NULL DEFAULT 11,
  max_squad           INTEGER     NOT NULL DEFAULT 18,
  default_base_price  NUMERIC(12,2) NOT NULL DEFAULT 1,
  min_base_price      NUMERIC(12,2) NOT NULL DEFAULT 1,
  bid_granularity     NUMERIC(12,2) NOT NULL DEFAULT 1,
  allow_base_price_bid BOOLEAN    NOT NULL DEFAULT true,
  -- e.g. [{"upTo":20,"step":1},{"upTo":null,"step":2}]
  increment_rules     JSONB       NOT NULL DEFAULT '[{"upTo":20,"step":1},{"upTo":null,"step":2}]',
  order_mode          TEXT        NOT NULL DEFAULT 'manual'
                        CHECK (order_mode IN ('manual','random')),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------
-- 2. TEAMS
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.teams (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  logo_url    TEXT,
  purse_total NUMERIC(12,2) NOT NULL DEFAULT 100,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------
-- 3. PLAYERS
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.players (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  position    TEXT,
  category    TEXT,
  base_price  NUMERIC(12,2) NOT NULL DEFAULT 1,
  photo_url   TEXT,
  status      TEXT        NOT NULL DEFAULT 'available'
                CHECK (status IN ('available','sold','unsold')),
  team_id     UUID        REFERENCES public.teams(id) ON DELETE SET NULL,
  sold_price  NUMERIC(12,2),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------
-- 4. AUCTION_STATE  (single-row table)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.auction_state (
  id                INTEGER     PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  current_player_id UUID        REFERENCES public.players(id) ON DELETE SET NULL,
  current_bid       NUMERIC(12,2),
  leading_team_id   UUID        REFERENCES public.teams(id) ON DELETE SET NULL,
  status            TEXT        NOT NULL DEFAULT 'idle'
                      CHECK (status IN ('idle','bidding')),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed the single-row tables so they always exist
INSERT INTO public.settings  (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.auction_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------
-- 5. BID_LOG
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bid_log (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  seq_id     BIGINT      GENERATED ALWAYS AS IDENTITY,
  player_id  UUID        NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  team_id    UUID        REFERENCES public.teams(id) ON DELETE SET NULL,
  amount     NUMERIC(12,2),
  type       TEXT        NOT NULL
               CHECK (type IN ('bid','sold','unsold','undo')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- ================================================================
-- ROW LEVEL SECURITY
-- ================================================================

-- Enable RLS on every table
ALTER TABLE public.settings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.players       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auction_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bid_log       ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------
-- Helper: is the current request from the authenticated admin?
-- We use a single Supabase Auth user. Any authenticated user is
-- treated as the admin (you can tighten this to a specific UID
-- later via: auth.uid() = '<your-admin-uuid>').
-- ----------------------------------------------------------------

-- settings ----------------------------------------------------
CREATE POLICY "Public can read settings"
  ON public.settings FOR SELECT
  USING (true);

CREATE POLICY "Admin can modify settings"
  ON public.settings FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- teams -------------------------------------------------------
CREATE POLICY "Public can read teams"
  ON public.teams FOR SELECT
  USING (true);

CREATE POLICY "Admin can modify teams"
  ON public.teams FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- players -----------------------------------------------------
CREATE POLICY "Public can read players"
  ON public.players FOR SELECT
  USING (true);

CREATE POLICY "Admin can modify players"
  ON public.players FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- auction_state -----------------------------------------------
CREATE POLICY "Public can read auction_state"
  ON public.auction_state FOR SELECT
  USING (true);

CREATE POLICY "Admin can modify auction_state"
  ON public.auction_state FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- bid_log -----------------------------------------------------
CREATE POLICY "Public can read bid_log"
  ON public.bid_log FOR SELECT
  USING (true);

CREATE POLICY "Admin can modify bid_log"
  ON public.bid_log FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ================================================================
-- INDEXES (useful for display and teams board queries)
-- ================================================================
CREATE INDEX IF NOT EXISTS idx_players_status  ON public.players(status);
CREATE INDEX IF NOT EXISTS idx_players_team_id ON public.players(team_id);
CREATE INDEX IF NOT EXISTS idx_bid_log_seq     ON public.bid_log(seq_id DESC);
CREATE INDEX IF NOT EXISTS idx_bid_log_player  ON public.bid_log(player_id, seq_id DESC);
CREATE INDEX IF NOT EXISTS idx_bid_log_team    ON public.bid_log(team_id,   seq_id DESC);

-- ================================================================
-- REALTIME
-- Enable Realtime publications for the tables that /display and
-- /teams need to subscribe to.
-- Run once; safe to re-run (IF NOT EXISTS is implicit for ALTER).
-- ================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.auction_state;
ALTER PUBLICATION supabase_realtime ADD TABLE public.players;
ALTER PUBLICATION supabase_realtime ADD TABLE public.teams;
ALTER PUBLICATION supabase_realtime ADD TABLE public.settings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.bid_log;

