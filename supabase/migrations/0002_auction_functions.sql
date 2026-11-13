-- ============================================================
-- Migration: 0002_auction_functions.sql
-- Six atomic RPC functions that enforce all auction rules.
-- Run AFTER 0001_initial_schema.sql.
-- ============================================================

-- Ensure bid_log has monotonic sequence and real-time clock timestamp
-- (Safe to run whether table is brand new or already exists)
ALTER TABLE public.bid_log ADD COLUMN IF NOT EXISTS seq_id BIGINT GENERATED ALWAYS AS IDENTITY;
ALTER TABLE public.bid_log ALTER COLUMN created_at SET DEFAULT clock_timestamp();
CREATE INDEX IF NOT EXISTS idx_bid_log_seq ON public.bid_log(seq_id DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'bid_log'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.bid_log;
  END IF;
END $$;

-- ============================================================
-- HELPER: compute the correct next-bid increment for a given
-- current bid value, using the increment_rules JSONB array.
-- Returns the minimum legal amount the NEXT bid must be >= .
-- ============================================================
CREATE OR REPLACE FUNCTION public.next_min_bid(p_current NUMERIC)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_rules        JSONB;
  v_rule         JSONB;
  v_up_to        NUMERIC;
  v_step         NUMERIC;
  v_granularity  NUMERIC;
  v_res          NUMERIC;
BEGIN
  SELECT increment_rules, COALESCE(bid_granularity, 1)
  INTO v_rules, v_granularity
  FROM public.settings WHERE id = 1;

  FOR v_rule IN SELECT * FROM jsonb_array_elements(v_rules)
  LOOP
    v_up_to := CASE WHEN (v_rule->>'upTo') IS NULL THEN NULL
                    ELSE (v_rule->>'upTo')::NUMERIC END;
    v_step  := (v_rule->>'step')::NUMERIC;

    -- This rule applies when upTo IS NULL (catch-all) OR current_bid < upTo
    IF v_up_to IS NULL OR p_current < v_up_to THEN
      v_res := p_current + v_step;
      IF v_granularity > 0 AND MOD(v_res, v_granularity) <> 0 THEN
        v_res := CEIL(v_res / v_granularity) * v_granularity;
      END IF;
      RETURN v_res;
    END IF;
  END LOOP;

  v_res := p_current + 1;
  IF v_granularity > 0 AND MOD(v_res, v_granularity) <> 0 THEN
    v_res := CEIL(v_res / v_granularity) * v_granularity;
  END IF;
  RETURN v_res;
END;
$$;


-- ============================================================
-- HELPER: max bid a team is allowed to place for the current
-- player in auction.
--
-- Formula (PLAN.md §5):
--   purse_remaining
--     − max(0, min_squad − (squad_size_after_this_player)) × min_base_price
--
-- "squad_size_after_this_player" = current squad size + 1  (the player
-- being auctioned will count toward this team's squad if they win).
-- ============================================================
CREATE OR REPLACE FUNCTION public.team_max_bid(p_team_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_purse_remaining NUMERIC;
  v_squad_size      INTEGER;
  v_min_squad       INTEGER;
  v_max_squad       INTEGER;
  v_min_base_price  NUMERIC;
  v_slots_needed    INTEGER;
BEGIN
  -- Purse remaining = purse_total minus sum of sold prices
  SELECT
    t.purse_total - COALESCE(SUM(p.sold_price), 0)
  INTO v_purse_remaining
  FROM public.teams t
  LEFT JOIN public.players p ON p.team_id = t.id AND p.status = 'sold'
  WHERE t.id = p_team_id
  GROUP BY t.purse_total;

  -- Current squad size (sold players only)
  SELECT COUNT(*) INTO v_squad_size
  FROM public.players
  WHERE team_id = p_team_id AND status = 'sold';

  SELECT min_squad, max_squad, min_base_price
  INTO   v_min_squad, v_max_squad, v_min_base_price
  FROM   public.settings WHERE id = 1;

  -- Block if squad already full
  IF v_squad_size >= v_max_squad THEN
    RETURN 0;
  END IF;

  -- Slots still needed AFTER winning this player
  v_slots_needed := GREATEST(0, v_min_squad - (v_squad_size + 1));

  RETURN v_purse_remaining - (v_slots_needed * v_min_base_price);
END;
$$;


-- ============================================================
-- 1. start_player(player_id UUID)
-- ============================================================
CREATE OR REPLACE FUNCTION public.start_player(p_player_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_state  public.auction_state%ROWTYPE;
  v_player public.players%ROWTYPE;
BEGIN
  -- Verify caller is authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_state  FROM public.auction_state WHERE id = 1 FOR UPDATE;
  SELECT * INTO v_player FROM public.players       WHERE id = p_player_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Player % not found', p_player_id;
  END IF;
  IF v_state.status <> 'idle' THEN
    RAISE EXCEPTION 'Auction is already running (status: %)', v_state.status;
  END IF;
  IF v_player.status <> 'available' THEN
    RAISE EXCEPTION 'Player is not available (status: %)', v_player.status;
  END IF;

  UPDATE public.auction_state SET
    current_player_id = p_player_id,
    current_bid       = v_player.base_price,
    leading_team_id   = NULL,
    status            = 'bidding',
    updated_at        = NOW()
  WHERE id = 1;
END;
$$;


-- ============================================================
-- 2. place_bid(team_id UUID, amount NUMERIC)
-- ============================================================
CREATE OR REPLACE FUNCTION public.place_bid(p_team_id UUID, p_amount NUMERIC)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_state        public.auction_state%ROWTYPE;
  v_settings     public.settings%ROWTYPE;
  v_min_next     NUMERIC;
  v_max_bid      NUMERIC;
  v_granularity  NUMERIC;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_state    FROM public.auction_state WHERE id = 1 FOR UPDATE;
  SELECT * INTO v_settings FROM public.settings      WHERE id = 1;

  IF v_state.status <> 'bidding' THEN
    RAISE EXCEPTION 'No active auction (status: %)', v_state.status;
  END IF;

  -- Compute minimum legal next bid (respects allow_base_price_bid on opening bid)
  IF v_state.leading_team_id IS NULL AND v_settings.allow_base_price_bid THEN
    v_min_next := v_state.current_bid;
  ELSE
    v_min_next := public.next_min_bid(v_state.current_bid);
  END IF;

  v_granularity := COALESCE(v_settings.bid_granularity, 1);

  IF v_granularity > 0 AND MOD(v_min_next, v_granularity) <> 0 THEN
    v_min_next := CEIL(v_min_next / v_granularity) * v_granularity;
  END IF;

  -- 1. Must be at or above the minimum next bid
  IF p_amount < v_min_next THEN
    RAISE EXCEPTION 'Bid ₹% is below the minimum next bid of ₹%', p_amount, v_min_next;
  END IF;

  -- 2. Must be a multiple of bid_granularity
  IF v_granularity > 0 AND MOD(p_amount, v_granularity) <> 0 THEN
    RAISE EXCEPTION 'Bid ₹% must be a multiple of bid granularity %', p_amount, v_granularity;
  END IF;

  -- 3. Team must be able to afford the bid
  v_max_bid := public.team_max_bid(p_team_id);
  IF p_amount > v_max_bid THEN
    RAISE EXCEPTION 'Bid ₹% exceeds this team''s max allowed bid of ₹%', p_amount, v_max_bid;
  END IF;

  -- Update auction state
  UPDATE public.auction_state SET
    current_bid     = p_amount,
    leading_team_id = p_team_id,
    updated_at      = NOW()
  WHERE id = 1;

  -- Append to bid log
  INSERT INTO public.bid_log (player_id, team_id, amount, type)
  VALUES (v_state.current_player_id, p_team_id, p_amount, 'bid');
END;
$$;


-- ============================================================
-- 3. mark_sold()
-- ============================================================
CREATE OR REPLACE FUNCTION public.mark_sold()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_state public.auction_state%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_state FROM public.auction_state WHERE id = 1 FOR UPDATE;

  IF v_state.status <> 'bidding' THEN
    RAISE EXCEPTION 'No active auction';
  END IF;
  IF v_state.leading_team_id IS NULL THEN
    RAISE EXCEPTION 'No bids placed yet — cannot mark sold';
  END IF;

  -- Assign player to winning team
  UPDATE public.players SET
    status     = 'sold',
    team_id    = v_state.leading_team_id,
    sold_price = v_state.current_bid
  WHERE id = v_state.current_player_id;

  -- Write log
  INSERT INTO public.bid_log (player_id, team_id, amount, type)
  VALUES (v_state.current_player_id, v_state.leading_team_id, v_state.current_bid, 'sold');

  -- Reset auction state
  UPDATE public.auction_state SET
    current_player_id = NULL,
    current_bid       = NULL,
    leading_team_id   = NULL,
    status            = 'idle',
    updated_at        = NOW()
  WHERE id = 1;
END;
$$;


-- ============================================================
-- 4. mark_unsold()
-- ============================================================
CREATE OR REPLACE FUNCTION public.mark_unsold()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_state public.auction_state%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_state FROM public.auction_state WHERE id = 1 FOR UPDATE;

  IF v_state.status <> 'bidding' THEN
    RAISE EXCEPTION 'No active auction';
  END IF;

  -- Mark player as unsold
  UPDATE public.players SET status = 'unsold'
  WHERE id = v_state.current_player_id;

  -- Write log
  INSERT INTO public.bid_log (player_id, team_id, amount, type)
  VALUES (v_state.current_player_id, NULL, NULL, 'unsold');

  -- Reset auction state
  UPDATE public.auction_state SET
    current_player_id = NULL,
    current_bid       = NULL,
    leading_team_id   = NULL,
    status            = 'idle',
    updated_at        = NOW()
  WHERE id = 1;
END;
$$;


-- ============================================================
-- 5. undo_last()
-- Reverses the most recent meaningful action in bid_log.
-- - type='bid'    → remove that bid row; restore prior bid/leader
-- - type='sold'   → un-sell the player; restore auction to bidding
-- - type='unsold' → un-unsold the player; restore auction to bidding
-- Writes a type='undo' row to record the action.
-- ============================================================
CREATE OR REPLACE FUNCTION public.undo_last()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_last      public.bid_log%ROWTYPE;
  v_prev      public.bid_log%ROWTYPE;
  v_state     public.auction_state%ROWTYPE;
  v_base_price NUMERIC;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Safely disable safeupdate if active, ignoring permission errors
  BEGIN
    PERFORM set_config('safeupdate.enabled', 'off', true);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- Get the last non-undo log entry
  SELECT * INTO v_last
  FROM public.bid_log
  WHERE type <> 'undo'
  ORDER BY seq_id DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nothing to undo';
  END IF;

  SELECT * INTO v_state FROM public.auction_state WHERE id = 1 FOR UPDATE;

  -- Write the undo record first (before we change anything)
  INSERT INTO public.bid_log (player_id, team_id, amount, type)
  VALUES (v_last.player_id, v_last.team_id, v_last.amount, 'undo');

  IF v_last.type = 'bid' THEN
    -- Remove the last bid row
    DELETE FROM public.bid_log WHERE id = v_last.id;

    -- Find the previous bid for this player (if any)
    SELECT * INTO v_prev
    FROM public.bid_log
    WHERE player_id = v_last.player_id
      AND type = 'bid'
      AND id <> v_last.id
    ORDER BY seq_id DESC
    LIMIT 1;

    IF FOUND THEN
      -- Restore to that bid
      UPDATE public.auction_state SET
        current_bid     = v_prev.amount,
        leading_team_id = v_prev.team_id,
        updated_at      = NOW()
      WHERE id = 1;
    ELSE
      -- No previous bids — restore to base price, no leader
      SELECT base_price INTO v_base_price
      FROM public.players WHERE id = v_last.player_id;

      UPDATE public.auction_state SET
        current_bid     = v_base_price,
        leading_team_id = NULL,
        updated_at      = NOW()
      WHERE id = 1;
    END IF;

  ELSIF v_last.type = 'sold' THEN
    -- Remove the sold log row
    DELETE FROM public.bid_log WHERE id = v_last.id;

    -- Un-sell the player
    UPDATE public.players SET
      status     = 'available',
      team_id    = NULL,
      sold_price = NULL
    WHERE id = v_last.player_id;

    -- Find the last bid before the sold event for this player
    SELECT * INTO v_prev
    FROM public.bid_log
    WHERE player_id = v_last.player_id
      AND type = 'bid'
    ORDER BY seq_id DESC
    LIMIT 1;

    IF FOUND THEN
      UPDATE public.auction_state SET
        current_player_id = v_last.player_id,
        current_bid       = v_prev.amount,
        leading_team_id   = v_prev.team_id,
        status            = 'bidding',
        updated_at        = NOW()
      WHERE id = 1;
    ELSE
      -- No bids before the sold — restore to base price
      SELECT base_price INTO v_base_price
      FROM public.players WHERE id = v_last.player_id;

      UPDATE public.auction_state SET
        current_player_id = v_last.player_id,
        current_bid       = v_base_price,
        leading_team_id   = NULL,
        status            = 'bidding',
        updated_at        = NOW()
      WHERE id = 1;
    END IF;

  ELSIF v_last.type = 'unsold' THEN
    -- Remove the unsold log row
    DELETE FROM public.bid_log WHERE id = v_last.id;

    -- Mark player available again
    UPDATE public.players SET status = 'available'
    WHERE id = v_last.player_id;

    -- Restore auction state
    SELECT base_price INTO v_base_price
    FROM public.players WHERE id = v_last.player_id;

    -- Check if there were bids before the unsold
    SELECT * INTO v_prev
    FROM public.bid_log
    WHERE player_id = v_last.player_id
      AND type = 'bid'
    ORDER BY seq_id DESC
    LIMIT 1;

    UPDATE public.auction_state SET
      current_player_id = v_last.player_id,
      current_bid       = CASE WHEN FOUND THEN v_prev.amount ELSE v_base_price END,
      leading_team_id   = CASE WHEN FOUND THEN v_prev.team_id ELSE NULL END,
      status            = 'bidding',
      updated_at        = NOW()
    WHERE id = 1;

  ELSE
    RAISE EXCEPTION 'Cannot undo action of type: %', v_last.type;
  END IF;
END;
$$;


-- ============================================================
-- 6. reset_auction()
-- Clears all results and the bid log. Keeps teams and players.
-- ============================================================
CREATE OR REPLACE FUNCTION public.reset_auction()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Temporarily disable safeupdate if the extension is active in the session
  BEGIN
    PERFORM set_config('safeupdate.enabled', 'off', true);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- Reset all players to available, clear auction results
  UPDATE public.players SET
    status     = 'available',
    team_id    = NULL,
    sold_price = NULL
  WHERE status <> 'available' OR team_id IS NOT NULL OR sold_price IS NOT NULL;

  -- Clear bid log
  DELETE FROM public.bid_log
  WHERE id IS NOT NULL;

  -- Reset auction state
  UPDATE public.auction_state SET
    current_player_id = NULL,
    current_bid       = NULL,
    leading_team_id   = NULL,
    status            = 'idle',
    updated_at        = NOW()
  WHERE id = 1;
END;
$$;


-- ============================================================
-- SECURITY: RPC functions run with SECURITY DEFINER so they
-- can bypass RLS while still enforcing auth.uid() checks
-- manually inside each function.
-- Grant EXECUTE to authenticated users only.
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.start_player(UUID)         FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.place_bid(UUID, NUMERIC)   FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_sold()                FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_unsold()              FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.undo_last()                FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reset_auction()            FROM PUBLIC;

GRANT  EXECUTE ON FUNCTION public.start_player(UUID)         TO authenticated;
GRANT  EXECUTE ON FUNCTION public.place_bid(UUID, NUMERIC)   TO authenticated;
GRANT  EXECUTE ON FUNCTION public.mark_sold()                TO authenticated;
GRANT  EXECUTE ON FUNCTION public.mark_unsold()              TO authenticated;
GRANT  EXECUTE ON FUNCTION public.undo_last()                TO authenticated;
GRANT  EXECUTE ON FUNCTION public.reset_auction()            TO authenticated;

-- Helper functions are internal only (called by the above)
REVOKE EXECUTE ON FUNCTION public.next_min_bid(NUMERIC) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.team_max_bid(UUID)    FROM PUBLIC;

