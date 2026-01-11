-- 1. Create the 'farm-photos' bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('farm-photos', 'farm-photos', true)
ON CONFLICT (id) DO NOTHING;

-- REMOVED: ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
-- (This command requires superuser permissions and is usually already enabled by default)

-- 2. Drop existing policies to avoid conflicts if re-running
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Public Upload" ON storage.objects;
DROP POLICY IF EXISTS "Public Update" ON storage.objects;
DROP POLICY IF EXISTS "Public Delete" ON storage.objects;

-- 3. Create Policies for Public Access
-- These policies allow anyone (public/anon) to fully manage files in the 'farm-photos' bucket.

-- Allow public read access
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
USING ( bucket_id = 'farm-photos' );

-- Allow public upload access
CREATE POLICY "Public Upload"
ON storage.objects FOR INSERT
WITH CHECK ( bucket_id = 'farm-photos' );

-- Allow public update access
CREATE POLICY "Public Update"
ON storage.objects FOR UPDATE
USING ( bucket_id = 'farm-photos' );

-- Allow public delete access
CREATE POLICY "Public Delete"
ON storage.objects FOR DELETE
USING ( bucket_id = 'farm-photos' );
