-- ============================================================
-- Migration: 0004_branding_storage.sql
-- Creates the public 'branding' storage bucket for tournament logos
-- with proper public read and authenticated management policies.
-- ============================================================

RESET ROLE;

-- 1. Create the public 'branding' bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('branding', 'branding', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 2. Allow public read access to all files in 'branding'
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Public Access on branding'
  ) THEN
    CREATE POLICY "Public Access on branding"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'branding');
  END IF;
END $$;

-- 3. Allow authenticated users to upload to 'branding'
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Authenticated upload on branding'
  ) THEN
    CREATE POLICY "Authenticated upload on branding"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'branding');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Authenticated update on branding'
  ) THEN
    CREATE POLICY "Authenticated update on branding"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (bucket_id = 'branding');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Authenticated delete on branding'
  ) THEN
    CREATE POLICY "Authenticated delete on branding"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (bucket_id = 'branding');
  END IF;
END $$;

