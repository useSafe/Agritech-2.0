-- ============================================
-- AgriGIS Portal - PostGIS Setup Script
-- ============================================
-- Purpose: Initialize PostGIS extension and create spatial tables
-- for QGIS integration with pinmarks and farm polygons
--
-- IMPORTANT: Run this script in your Supabase SQL Editor
-- ============================================

-- Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- TABLE: pinmark_locations
-- ============================================
-- Stores GPS pinmarks created in QGIS
-- Each pinmark can be associated with a registrant
CREATE TABLE IF NOT EXISTS public.pinmark_locations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  registrant_id UUID REFERENCES public.registrants(id) ON DELETE SET NULL,
  location GEOMETRY(Point, 4326) NOT NULL,
  location_name TEXT,
  annotation_data JSONB DEFAULT '{}',
  notes TEXT,
  created_by BIGINT REFERENCES public.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add spatial index for performance
CREATE INDEX IF NOT EXISTS idx_pinmark_locations_geom 
ON public.pinmark_locations USING GIST(location);

-- Add regular indexes
CREATE INDEX IF NOT EXISTS idx_pinmark_locations_registrant 
ON public.pinmark_locations(registrant_id);

-- Add comments
COMMENT ON TABLE public.pinmark_locations IS 'GPS pinmarks created in QGIS, associated with farmer/fisherfolk locations';
COMMENT ON COLUMN public.pinmark_locations.location IS 'Point geometry in WGS84 (EPSG:4326)';
COMMENT ON COLUMN public.pinmark_locations.annotation_data IS 'Additional metadata from QGIS annotation';

-- ============================================
-- TABLE: farm_boundaries
-- ============================================
-- Stores farm polygon boundaries created in QGIS
-- Each polygon can be associated with a farm parcel
CREATE TABLE IF NOT EXISTS public.farm_boundaries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  farm_parcel_id UUID REFERENCES public.farm_parcels(id) ON DELETE SET NULL,
  boundary GEOMETRY(Polygon, 4326) NOT NULL,
  area_hectares NUMERIC,
  perimeter_meters NUMERIC,
  annotation_data JSONB DEFAULT '{}',
  notes TEXT,
  created_by BIGINT REFERENCES public.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add spatial index for performance
CREATE INDEX IF NOT EXISTS idx_farm_boundaries_geom 
ON public.farm_boundaries USING GIST(boundary);

-- Add regular indexes
CREATE INDEX IF NOT EXISTS idx_farm_boundaries_parcel 
ON public.farm_boundaries(farm_parcel_id);

-- Add comments
COMMENT ON TABLE public.farm_boundaries IS 'Farm polygon boundaries created in QGIS';
COMMENT ON COLUMN public.farm_boundaries.boundary IS 'Polygon geometry in WGS84 (EPSG:4326)';
COMMENT ON COLUMN public.farm_boundaries.area_hectares IS 'Auto-calculated area in hectares from polygon geometry';
COMMENT ON COLUMN public.farm_boundaries.perimeter_meters IS 'Auto-calculated perimeter in meters';

-- ============================================
-- FUNCTION: Auto-calculate area and perimeter
-- ============================================
CREATE OR REPLACE FUNCTION public.calculate_farm_geometry()
RETURNS TRIGGER AS $$
BEGIN
  -- Calculate area in hectares (ST_Area returns square meters for geography)
  -- 1 hectare = 10,000 square meters
  NEW.area_hectares = ROUND((ST_Area(NEW.boundary::geography) / 10000)::numeric, 4);
  
  -- Calculate perimeter in meters
  NEW.perimeter_meters = ROUND(ST_Perimeter(NEW.boundary::geography)::numeric, 2);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-calculate on insert/update
DROP TRIGGER IF EXISTS trigger_calculate_farm_geometry ON public.farm_boundaries;
CREATE TRIGGER trigger_calculate_farm_geometry
BEFORE INSERT OR UPDATE ON public.farm_boundaries
FOR EACH ROW EXECUTE FUNCTION public.calculate_farm_geometry();

-- ============================================
-- FUNCTION: Update updated_at timestamp
-- ============================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add updated_at triggers
DROP TRIGGER IF EXISTS trigger_pinmark_locations_updated_at ON public.pinmark_locations;
CREATE TRIGGER trigger_pinmark_locations_updated_at
BEFORE UPDATE ON public.pinmark_locations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_farm_boundaries_updated_at ON public.farm_boundaries;
CREATE TRIGGER trigger_farm_boundaries_updated_at
BEFORE UPDATE ON public.farm_boundaries
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- ALTER EXISTING TABLES: Add spatial columns
-- ============================================

-- Add location point to registrants table (optional - for backward compatibility)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'registrants' 
    AND column_name = 'location_point'
  ) THEN
    ALTER TABLE public.registrants 
    ADD COLUMN location_point GEOMETRY(Point, 4326);
    
    CREATE INDEX idx_registrants_location_point 
    ON public.registrants USING GIST(location_point);
    
    COMMENT ON COLUMN public.registrants.location_point IS 'Optional: GPS location point from pinmark';
  END IF;
END $$;

-- Add boundary polygon to farm_parcels table (optional - for backward compatibility)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'farm_parcels' 
    AND column_name = 'boundary_polygon'
  ) THEN
    ALTER TABLE public.farm_parcels 
    ADD COLUMN boundary_polygon GEOMETRY(Polygon, 4326);
    
    CREATE INDEX idx_farm_parcels_boundary_polygon 
    ON public.farm_parcels USING GIST(boundary_polygon);
    
    COMMENT ON COLUMN public.farm_parcels.boundary_polygon IS 'Optional: Farm boundary polygon';
  END IF;
END $$;

-- Add calculated_area_ha column to farm_parcels
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'farm_parcels' 
    AND column_name = 'calculated_area_ha'
  ) THEN
    ALTER TABLE public.farm_parcels 
    ADD COLUMN calculated_area_ha NUMERIC;
    
    COMMENT ON COLUMN public.farm_parcels.calculated_area_ha IS 'Auto-calculated area from GIS polygon (overrides manual total_farm_area_ha)';
  END IF;
END $$;

-- ============================================
-- HELPER VIEWS: Useful spatial queries
-- ============================================

-- View: Registrants with their pinmark locations
CREATE OR REPLACE VIEW public.vw_registrants_with_locations AS
SELECT 
  r.id,
  r.reference_no,
  r.first_name,
  r.surname,
  r.registry,
  pl.id AS pinmark_id,
  pl.location,
  ST_X(pl.location::geometry) AS longitude,
  ST_Y(pl.location::geometry) AS latitude,
  pl.location_name,
  pl.created_at AS location_created_at
FROM public.registrants r
LEFT JOIN public.pinmark_locations pl ON r.id = pl.registrant_id
WHERE r.deleted_at IS NULL;

-- View: Farm parcels with their boundaries and calculated areas
CREATE OR REPLACE VIEW public.vw_farm_parcels_with_boundaries AS
SELECT 
  fp.id AS parcel_id,
  fp.registrant_id,
  r.reference_no,
  r.first_name,
  r.surname,
  fp.farm_location,
  fp.total_farm_area_ha AS registered_area_ha,
  fb.id AS boundary_id,
  fb.boundary,
  fb.area_hectares AS gis_calculated_area_ha,
  fb.perimeter_meters,
  CASE 
    WHEN fb.area_hectares IS NOT NULL AND fp.total_farm_area_ha IS NOT NULL 
    THEN ROUND(ABS(fb.area_hectares - fp.total_farm_area_ha)::numeric, 4)
    ELSE NULL
  END AS area_difference_ha,
  fb.created_at AS boundary_created_at
FROM public.farm_parcels fp
INNER JOIN public.registrants r ON fp.registrant_id = r.id
LEFT JOIN public.farm_boundaries fb ON fp.id = fb.farm_parcel_id
WHERE r.deleted_at IS NULL;

-- ============================================
-- SAMPLE SPATIAL QUERIES (for reference)
-- ============================================

-- Find all pinmarks within 1km of a point
-- SELECT * FROM pinmark_locations 
-- WHERE ST_DWithin(
--   location::geography, 
--   ST_SetSRID(ST_MakePoint(125.0000, 9.5000), 4326)::geography,
--   1000
-- );

-- Find all farm boundaries that intersect with a given area
-- SELECT * FROM farm_boundaries 
-- WHERE ST_Intersects(
--   boundary,
--   ST_SetSRID(ST_MakePolygon(ST_GeomFromText('LINESTRING(...)')), 4326)
-- );

-- Calculate distance between two pinmarks
-- SELECT ST_Distance(
--   (SELECT location FROM pinmark_locations WHERE id = 'uuid1')::geography,
--   (SELECT location FROM pinmark_locations WHERE id = 'uuid2')::geography
-- ) AS distance_meters;

-- ============================================
-- GRANT PERMISSIONS (adjust as needed)
-- ============================================

-- Grant access to authenticated users (Supabase default)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pinmark_locations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.farm_boundaries TO authenticated;
GRANT SELECT ON public.vw_registrants_with_locations TO authenticated;
GRANT SELECT ON public.vw_farm_parcels_with_boundaries TO authenticated;

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- Verify PostGIS is enabled
-- SELECT PostGIS_Version();

-- Check if tables were created
-- SELECT table_name FROM information_schema.tables 
-- WHERE table_schema = 'public' 
-- AND table_name IN ('pinmark_locations', 'farm_boundaries');

-- Check spatial indexes
-- SELECT indexname, tablename FROM pg_indexes 
-- WHERE tablename IN ('pinmark_locations', 'farm_boundaries')
-- AND indexname LIKE '%geom%';

COMMIT;
