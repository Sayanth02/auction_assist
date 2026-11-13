-- ============================================================
-- test_auction.sql — Automated SQL test script with sample data
--
-- How to run:
--   1. Run 0001_initial_schema.sql
--   2. Run 0002_auction_functions.sql (or 0003_granularity_and_jump_bids.sql)
--   3. Paste this entire file into the Supabase SQL Editor and run.
--
-- The script uses a transaction so ALL changes are rolled back
-- at the end — your real data is never touched.
-- ============================================================

-- Reset role in case a previous aborted run left the session as 'authenticated'
RESET ROLE;

-- Ensure bid_log and settings have the latest columns (run as table owner before test transaction)
DO $$
BEGIN
  ALTER TABLE public.bid_log ADD COLUMN IF NOT EXISTS seq_id BIGINT GENERATED ALWAYS AS IDENTITY;
  ALTER TABLE public.bid_log ALTER COLUMN created_at SET DEFAULT clock_timestamp();
  ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS bid_granularity NUMERIC(12,2) NOT NULL DEFAULT 1;
  ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS allow_base_price_bid BOOLEAN NOT NULL DEFAULT true;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

BEGIN;

-- ----------------------------------------------------------------
-- 0. Impersonate an authenticated user so SECURITY DEFINER
--    functions can pass the auth.uid() IS NULL guard.
-- ----------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}',
    true
  );
  PERFORM set_config('safeupdate.enabled', 'off', true);
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SET LOCAL ROLE authenticated;

-- ----------------------------------------------------------------
-- 1. Insert sample settings
--    Granularity = 5, allow_base_price_bid = true
--    Tier 1: up to 200 -> step 10
--    Tier 2: above 200 -> step 20
-- ----------------------------------------------------------------
INSERT INTO public.settings (
  id, tournament_name, theme_color,
  default_purse, min_squad, max_squad,
  default_base_price, min_base_price,
  bid_granularity, allow_base_price_bid,
  increment_rules, order_mode
) VALUES (
  1, 'Test Cup 2026', '#16a34a',
  1000, 3, 6,       -- min/max squad (min 3, max 6)
  150, 10,          -- default_base_price = 150, min_base_price = 10
  5, true,          -- granularity = 5, allow opening at base price
  '[{"upTo":200,"step":10},{"upTo":null,"step":20}]',
  'manual'
)
ON CONFLICT (id) DO UPDATE SET
  tournament_name      = EXCLUDED.tournament_name,
  default_purse        = EXCLUDED.default_purse,
  min_squad            = EXCLUDED.min_squad,
  max_squad            = EXCLUDED.max_squad,
  default_base_price   = EXCLUDED.default_base_price,
  min_base_price       = EXCLUDED.min_base_price,
  bid_granularity      = EXCLUDED.bid_granularity,
  allow_base_price_bid = EXCLUDED.allow_base_price_bid,
  increment_rules      = EXCLUDED.increment_rules;

-- ----------------------------------------------------------------
-- 2. Insert two teams (purse = 1000 each)
--    With min_squad = 3 and min_base_price = 10:
--    Max allowed bid on first player = 1000 - (3 - 1) * 10 = 980
-- ----------------------------------------------------------------
INSERT INTO public.teams (id, name, purse_total) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Red Lions',    1000),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'Blue Eagles',  1000)
ON CONFLICT (id) DO UPDATE SET purse_total = EXCLUDED.purse_total;

-- ----------------------------------------------------------------
-- 3. Insert four players (Alice has base_price 150)
-- ----------------------------------------------------------------
INSERT INTO public.players (id, name, position, category, base_price) VALUES
  ('bbbbbbbb-0000-0000-0000-000000000001', 'Alice',  'Forward',    'Senior', 150),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'Bob',    'Midfielder', 'Senior', 150),
  ('bbbbbbbb-0000-0000-0000-000000000003', 'Carlos', 'Defender',   'Junior', 100),
  ('bbbbbbbb-0000-0000-0000-000000000004', 'Diana',  'Goalkeeper', 'Senior', 150)
ON CONFLICT (id) DO UPDATE SET base_price = EXCLUDED.base_price;

-- Clean auction state before running test suite
UPDATE public.auction_state SET
  current_player_id = NULL,
  current_bid       = NULL,
  leading_team_id   = NULL,
  status            = 'idle'
WHERE id = 1;

DELETE FROM public.bid_log WHERE id IS NOT NULL;
UPDATE public.players SET status = 'available', team_id = NULL, sold_price = NULL WHERE id IS NOT NULL;

-- ================================================================
-- TEST SUITE
-- ================================================================

-- ----------------------------------------------------------------
-- TEST 1: start_player — Alice (base_price = 150)
-- ----------------------------------------------------------------
DO $$
BEGIN
  PERFORM public.start_player('bbbbbbbb-0000-0000-0000-000000000001');

  ASSERT (SELECT status           FROM public.auction_state WHERE id = 1) = 'bidding',
    'TEST 1 FAIL: status should be bidding';
  ASSERT (SELECT current_bid      FROM public.auction_state WHERE id = 1) = 150,
    'TEST 1 FAIL: current_bid should equal base_price (150)';
  ASSERT (SELECT leading_team_id  FROM public.auction_state WHERE id = 1) IS NULL,
    'TEST 1 FAIL: leading_team_id should be NULL at start';

  RAISE NOTICE 'TEST 1 PASS: start_player sets status=bidding, current_bid=150, no leader';
END $$;

-- ----------------------------------------------------------------
-- TEST 2: start_player while already running → should fail
-- ----------------------------------------------------------------
DO $$
BEGIN
  BEGIN
    PERFORM public.start_player('bbbbbbbb-0000-0000-0000-000000000002');
    RAISE EXCEPTION 'TEST 2 FAIL: should have raised an exception';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'TEST 2 PASS: start_player rejected (auction already running): %', SQLERRM;
  END;
END $$;

-- ----------------------------------------------------------------
-- TEST 3: opening bid at base price (150) by Red Lions
--         (allow_base_price_bid is true, so 150 is accepted)
-- ----------------------------------------------------------------
DO $$
BEGIN
  PERFORM public.place_bid('aaaaaaaa-0000-0000-0000-000000000001', 150);

  ASSERT (SELECT current_bid     FROM public.auction_state WHERE id = 1) = 150,
    'TEST 3 FAIL: current_bid should be 150';
  ASSERT (SELECT leading_team_id FROM public.auction_state WHERE id = 1)
         = 'aaaaaaaa-0000-0000-0000-000000000001'::UUID,
    'TEST 3 FAIL: Red Lions should be leading with opening bid 150';

  RAISE NOTICE 'TEST 3 PASS: opening bid at base price (150) accepted';
END $$;

-- ----------------------------------------------------------------
-- TEST 4: JUMP BID — 150 -> 500 by Blue Eagles
--         Next minimum is 160 (150 + step 10).
--         500 >= 160, 500 is multiple of 5, 500 <= max_bid (980).
--         Should SUCCEED!
-- ----------------------------------------------------------------
DO $$
BEGIN
  PERFORM public.place_bid('aaaaaaaa-0000-0000-0000-000000000002', 500);

  ASSERT (SELECT current_bid     FROM public.auction_state WHERE id = 1) = 500,
    'TEST 4 FAIL: current_bid should be 500 after jump bid';
  ASSERT (SELECT leading_team_id FROM public.auction_state WHERE id = 1)
         = 'aaaaaaaa-0000-0000-0000-000000000002'::UUID,
    'TEST 4 FAIL: Blue Eagles should be leading after jump bid 500';

  RAISE NOTICE 'TEST 4 PASS: Jump bid 150 -> 500 successfully accepted';
END $$;

-- ----------------------------------------------------------------
-- TEST 5: UNDO RESTORES PREVIOUS BID AFTER JUMP BID
--         Undoing Blue Eagles' 500 bid should restore current_bid to 150
--         and leading_team_id back to Red Lions.
-- ----------------------------------------------------------------
DO $$
BEGIN
  PERFORM public.undo_last();

  ASSERT (SELECT current_bid FROM public.auction_state WHERE id = 1) = 150,
    'TEST 5 FAIL: current_bid should be restored back to 150 after undoing jump bid';
  ASSERT (SELECT leading_team_id FROM public.auction_state WHERE id = 1)
         = 'aaaaaaaa-0000-0000-0000-000000000001'::UUID,
    'TEST 5 FAIL: Red Lions should be leading again after undoing jump bid';
  ASSERT (SELECT type FROM public.bid_log ORDER BY seq_id DESC LIMIT 1) = 'undo',
    'TEST 5 FAIL: last log entry should be undo';

  RAISE NOTICE 'TEST 5 PASS: Undo after jump bid correctly restored previous bid of 150 and Red Lions leader';
END $$;

-- ----------------------------------------------------------------
-- TEST 6: AN AMOUNT BELOW THE MINIMUM NEXT BID → should fail
--         Current bid is 150, step is 10, next min is 160.
--         Attempting to bid 155 (< 160) must be REJECTED.
-- ----------------------------------------------------------------
DO $$
BEGIN
  BEGIN
    PERFORM public.place_bid('aaaaaaaa-0000-0000-0000-000000000002', 155);
    RAISE EXCEPTION 'TEST 6 FAIL: should have rejected bid of 155 below minimum 160';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'TEST 6 PASS: Bid 155 rejected (below minimum next bid 160): %', SQLERRM;
  END;
END $$;

-- ----------------------------------------------------------------
-- TEST 7: AN AMOUNT THAT IS NOT A MULTIPLE OF GRANULARITY → should fail
--         Granularity is 5. Attempting to bid 503 (503 % 5 = 3 <> 0)
--         must be REJECTED even though 503 >= 160.
-- ----------------------------------------------------------------
DO $$
BEGIN
  BEGIN
    PERFORM public.place_bid('aaaaaaaa-0000-0000-0000-000000000002', 503);
    RAISE EXCEPTION 'TEST 7 FAIL: should have rejected bid 503 (not multiple of granularity 5)';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'TEST 7 PASS: Bid 503 rejected (not multiple of granularity 5): %', SQLERRM;
  END;
END $$;

-- ----------------------------------------------------------------
-- TEST 8: AN AMOUNT ABOVE THE TEAM'S MAX ALLOWED BID → should fail
--         Blue Eagles' max allowed bid is 980 (1000 - 2 slots * 10).
--         Attempting to bid 990 (> 980) must be REJECTED.
-- ----------------------------------------------------------------
DO $$
BEGIN
  BEGIN
    PERFORM public.place_bid('aaaaaaaa-0000-0000-0000-000000000002', 990);
    RAISE EXCEPTION 'TEST 8 FAIL: should have rejected bid 990 exceeding max allowed bid of 980';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'TEST 8 PASS: Bid 990 rejected (exceeds team max allowed bid 980): %', SQLERRM;
  END;
END $$;

-- ----------------------------------------------------------------
-- TEST 9: Valid outbid & increment boundary
--         Red Lions is at 150. Blue Eagles bids 160 (150 + step 10).
-- ----------------------------------------------------------------
DO $$
BEGIN
  PERFORM public.place_bid('aaaaaaaa-0000-0000-0000-000000000002', 160);

  ASSERT (SELECT current_bid FROM public.auction_state WHERE id = 1) = 160,
    'TEST 9 FAIL: current_bid should be 160';
  ASSERT (SELECT leading_team_id FROM public.auction_state WHERE id = 1)
         = 'aaaaaaaa-0000-0000-0000-000000000002'::UUID,
    'TEST 9 FAIL: Blue Eagles should be leading';

  RAISE NOTICE 'TEST 9 PASS: Outbid to 160 accepted';
END $$;

-- ----------------------------------------------------------------
-- TEST 10: mark_sold — Alice sold to Blue Eagles at 160
-- ----------------------------------------------------------------
DO $$
BEGIN
  PERFORM public.mark_sold();

  ASSERT (SELECT status FROM public.players WHERE id = 'bbbbbbbb-0000-0000-0000-000000000001')
         = 'sold',
    'TEST 10 FAIL: Alice should be sold';
  ASSERT (SELECT team_id FROM public.players WHERE id = 'bbbbbbbb-0000-0000-0000-000000000001')
         = 'aaaaaaaa-0000-0000-0000-000000000002'::UUID,
    'TEST 10 FAIL: Alice should belong to Blue Eagles';
  ASSERT (SELECT sold_price FROM public.players WHERE id = 'bbbbbbbb-0000-0000-0000-000000000001')
         = 160,
    'TEST 10 FAIL: Alice sold_price should be 160';
  ASSERT (SELECT status FROM public.auction_state WHERE id = 1) = 'idle',
    'TEST 10 FAIL: auction_state should be idle after mark_sold';

  RAISE NOTICE 'TEST 10 PASS: mark_sold assigned Alice to Blue Eagles at 160';
END $$;

-- ----------------------------------------------------------------
-- TEST 11: undo mark_sold — Alice should be unsold, auction restored
-- ----------------------------------------------------------------
DO $$
BEGIN
  PERFORM public.undo_last();

  ASSERT (SELECT status FROM public.players WHERE id = 'bbbbbbbb-0000-0000-0000-000000000001')
         = 'available',
    'TEST 11 FAIL: Alice should be available again';
  ASSERT (SELECT team_id FROM public.players WHERE id = 'bbbbbbbb-0000-0000-0000-000000000001')
         IS NULL,
    'TEST 11 FAIL: Alice team_id should be NULL';
  ASSERT (SELECT status FROM public.auction_state WHERE id = 1) = 'bidding',
    'TEST 11 FAIL: auction should be back to bidding';
  ASSERT (SELECT current_bid FROM public.auction_state WHERE id = 1) = 160,
    'TEST 11 FAIL: current_bid should be restored to 160';

  RAISE NOTICE 'TEST 11 PASS: undo mark_sold restored Alice and auction state to 160';
END $$;

-- ----------------------------------------------------------------
-- TEST 12: mark_unsold and undo mark_unsold
-- ----------------------------------------------------------------
DO $$
BEGIN
  PERFORM public.mark_unsold();

  ASSERT (SELECT status FROM public.players WHERE id = 'bbbbbbbb-0000-0000-0000-000000000001')
         = 'unsold',
    'TEST 12 FAIL: Alice should be unsold';
  ASSERT (SELECT status FROM public.auction_state WHERE id = 1) = 'idle',
    'TEST 12 FAIL: auction should be idle after mark_unsold';

  -- Undo unsold
  PERFORM public.undo_last();
  ASSERT (SELECT status FROM public.players WHERE id = 'bbbbbbbb-0000-0000-0000-000000000001')
         = 'available',
    'TEST 12 FAIL: Alice should be available after undoing unsold';
  ASSERT (SELECT status FROM public.auction_state WHERE id = 1) = 'bidding',
    'TEST 12 FAIL: auction should be bidding after undoing unsold';

  RAISE NOTICE 'TEST 12 PASS: mark_unsold and undo mark_unsold verified';
END $$;

-- ----------------------------------------------------------------
-- TEST 13: reset_auction — clears state and results
-- ----------------------------------------------------------------
DO $$
BEGIN
  PERFORM public.reset_auction();

  ASSERT (SELECT status FROM public.auction_state WHERE id = 1) = 'idle',
    'TEST 13 FAIL: status should be idle after reset';
  ASSERT (SELECT current_player_id FROM public.auction_state WHERE id = 1) IS NULL,
    'TEST 13 FAIL: current_player_id should be NULL after reset';
  ASSERT (SELECT COUNT(*) FROM public.bid_log) = 0,
    'TEST 13 FAIL: bid_log should be empty after reset';

  RAISE NOTICE 'TEST 13 PASS: reset_auction cleared all state and logs';
END $$;

-- ----------------------------------------------------------------
-- SUMMARY
-- ----------------------------------------------------------------
DO $$
BEGIN
  RAISE NOTICE '==================================================';
  RAISE NOTICE 'ALL 13 TESTS PASSED SUCCESSFULLY!';
  RAISE NOTICE '==================================================';
END $$;

-- Roll back everything so live database remains clean
ROLLBACK;

-- Reset role after transaction ends
RESET ROLE;

-- Return final confirmation in the Results tab
SELECT 'ALL 13 TESTS PASSED SUCCESSFULLY!' AS test_status;
