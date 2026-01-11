-- Add farm_image_url column to farm_boundaries table
-- This column will store the URL of farm images uploaded from Set Farm Parcels page

DO $$
BEGIN
    -- Add farm_image_url column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'farm_boundaries' 
        AND column_name = 'farm_image_url'
    ) THEN
        ALTER TABLE farm_boundaries 
        ADD COLUMN farm_image_url TEXT;
        
        RAISE NOTICE 'Added farm_image_url column to farm_boundaries table';
    ELSE
        RAISE NOTICE 'farm_image_url column already exists in farm_boundaries table';
    END IF;
END $$;

-- Add comment to document the column
COMMENT ON COLUMN farm_boundaries.farm_image_url IS 'URL to farm image uploaded from Set Farm Parcels page';
