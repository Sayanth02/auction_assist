-- ============================================================
-- Migration: 0003_granularity_and_jump_bids.sql
-- Adds bid_granularity and allow_base_price_bid to settings.
-- Updates next_min_bid, place_bid (to support jump bids with granularity),
-- and ensures undo_last properly handles jump bids.
-- ============================================================

-- Ensure role is table owner (postgres)
RESET ROLE;

-- Safely disable safeupdate if active
DO $$
BEGIN
  PERFORM set_config('safeupdate.enabled', 'off', true);
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- 1. Add columns to public.settings if not already present
DO $$
BEGIN
  ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS bid_granularity NUMERIC(12,2) NOT NULL DEFAULT 1;
  ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS allow_base_price_bid BOOLEAN NOT NULL DEFAULT true;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- 2. Update next_min_bid helper function
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

-- 3. Update place_bid function to accept any jump amount at or above next_min_bid that satisfies granularity
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

-- 4. Update undo_last to safely disable safeupdate and restore prior bid after jump bids
CREATE OR REPLACE FUNCTION public.undo_last()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_last       public.bid_log%ROWTYPE;
  v_prev       public.bid_log%ROWTYPE;
  v_state      public.auction_state%ROWTYPE;
  v_base_price NUMERIC;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Safely disable safeupdate if active
  PERFORM set_config('safeupdate.enabled', 'off', true);

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
  END IF;
END;
$$;

