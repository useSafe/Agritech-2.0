-- Database Repair Script
-- Run this in Supabase SQL Editor to fix missing columns and resolve trigger errors

-- 1. Add missing 'updated_at' column to pinmark_locations if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pinmark_locations' AND column_name = 'updated_at') THEN
        ALTER TABLE pinmark_locations ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
END $$;

-- 2. Add missing 'updated_at' column to farm_boundaries if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'farm_boundaries' AND column_name = 'updated_at') THEN
        ALTER TABLE farm_boundaries ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
END $$;

-- 3. Add missing 'location_name' column to farm_boundaries if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'farm_boundaries' AND column_name = 'location_name') THEN
        ALTER TABLE farm_boundaries ADD COLUMN location_name TEXT;
    END IF;
END $$;

-- 4. Verify the triggers exist (optional check)
-- This just ensures the updated_at trigger has a target column now
