-- ============================================================
-- Migration: 0005_fix_safeupdate_permission.sql
-- Fixes permission denied to set parameter "safeupdate.enabled"
-- by wrapping the safeupdate call in an EXCEPTION block.
-- ============================================================

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
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.undo_last() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.undo_last() TO authenticated;

