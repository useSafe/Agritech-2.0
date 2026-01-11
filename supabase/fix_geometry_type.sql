-- Fix Geometry Type Mismatch
-- The farm_boundaries table uses MultiPolygon (from QGIS), but farm_parcels.boundary_polygon was likely created as POLYGON.
-- This script alters the column to accept any geometry type, or specifically MultiPolygon.

-- 1. Alter farm_parcels.boundary_polygon to type GEOMETRY (flexible)
-- We use USING to cast existing data if any (though likely empty or compatible)
ALTER TABLE farm_parcels 
ALTER COLUMN boundary_polygon TYPE geometry(Geometry, 4326) 
USING ST_SetSRID(boundary_polygon::geometry, 4326);

-- 2. Also ensure pinmark_locations is flexible (just in case)
ALTER TABLE registrants 
ALTER COLUMN location_point TYPE geometry(Geometry, 4326) 
USING ST_SetSRID(location_point::geometry, 4326);

-- 3. Verify the changes (optional)
-- SELECT column_name, udt_name FROM information_schema.columns WHERE table_name = 'farm_parcels' AND column_name = 'boundary_polygon';
