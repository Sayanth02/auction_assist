-- ================================================================
-- Migration 0005: Update default_base_price default to 100
-- ================================================================

ALTER TABLE public.settings 
  ALTER COLUMN default_base_price SET DEFAULT 100;

UPDATE public.settings 
SET default_base_price = 100 
WHERE id = 1 AND (default_base_price IS NULL OR default_base_price = 1);

