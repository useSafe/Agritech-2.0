-- Sample Test Data for GIS Pages
-- This script inserts sample pinmarks and farm boundaries for testing
-- Run this AFTER running postgis_setup.sql

-- ============================================
-- 1. INSERT SAMPLE PINMARKS (GPS Points)
-- ============================================

-- Sample pinmark in Jasaan, Misamis Oriental (approximate coordinates)
INSERT INTO pinmark_locations (location, location_name, notes)
VALUES
  (ST_SetSRID(ST_MakePoint(124.9475, 8.6694), 4326), 'Jasaan Town Center', 'Near Municipal Hall'),
  (ST_SetSRID(ST_MakePoint(124.9512, 8.6721), 4326), 'Upper Jasaan Purok 5', 'Residential area'),
  (ST_SetSRID(ST_MakePoint(124.9438, 8.6667), 4326), 'Lower Jasaan Purok 1', 'Near coastline'),
  (ST_SetSRID(ST_MakePoint(124.9501, 8.6703), 4326), 'Agricultural Area 1', 'Rice fields'),
  (ST_SetSRID(ST_MakePoint(124.9489, 8.6680), 4326), 'Agricultural Area 2', 'Corn fields');

-- ============================================
-- 2. INSERT SAMPLE FARM BOUNDARIES (Polygons)
-- ============================================

-- Sample rectangular farm boundary 1 (approximately 1 hectare)
INSERT INTO farm_boundaries (boundary, notes)
VALUES
  (
    ST_SetSRID(
      ST_GeomFromText('POLYGON((
        124.9500 8.6700,
        124.9510 8.6700,
        124.9510 8.6710,
        124.9500 8.6710,
        124.9500 8.6700
      ))'),
      4326
    ),
    'Test Farm 1 - Rectangular plot'
  );

-- Sample farm boundary 2 (approximately 2 hectares)
INSERT INTO farm_boundaries (boundary, notes)
VALUES
  (
    ST_SetSRID(
      ST_GeomFromText('POLYGON((
        124.9520 8.6680,
        124.9540 8.6680,
        124.9540 8.6700,
        124.9520 8.6700,
        124.9520 8.6680
      ))'),
      4326
    ),
    'Test Farm 2 - Larger plot'
  );

-- Sample irregular farm boundary 3
INSERT INTO farm_boundaries (boundary, notes)
VALUES
  (
    ST_SetSRID(
      ST_GeomFromText('POLYGON((
        124.9450 8.6650,
        124.9460 8.6650,
        124.9465 8.6660,
        124.9460 8.6665,
        124.9450 8.6663,
        124.9450 8.6650
      ))'),
      4326
    ),
    'Test Farm 3 - Irregular shape'
  );

-- Sample farm boundary 4 (smaller plot)
INSERT INTO farm_boundaries (boundary, notes)
VALUES
  (
    ST_SetSRID(
      ST_GeomFromText('POLYGON((
        124.9480 8.6720,
        124.9490 8.6720,
        124.9490 8.6728,
        124.9480 8.6728,
        124.9480 8.6720
      ))'),
      4326
    ),
    'Test Farm 4 - Small plot near road'
  );

-- ============================================
-- 3. VERIFY DATA WAS INSERTED
-- ============================================

-- Check pinmarks (should show 5 rows)
SELECT 
  id,
  location_name,
  ST_Y(location::geometry) as latitude,
  ST_X(location::geometry) as longitude,
  notes
FROM pinmark_locations
ORDER BY created_at DESC;

-- Check farm boundaries with calculated areas (should show 4 rows)
SELECT 
  id,
  notes,
  area_hectares,
  perimeter_meters,
  ST_AsText(boundary) as boundary_wkt
FROM farm_boundaries
ORDER BY created_at DESC;

-- ============================================
-- 4. EXPECTED RESULTS
-- ============================================

/*
After running this script, you should see:

1. Set Pinmark Info Page:
   - 5 blue pinmarks on the map around Jasaan area
   - All unassigned (no registrant data attached)
   
2. Set Farm Parcel Info Page:
   - 4 blue polygon boundaries around Jasaan area
   - All unassigned (no farm parcel data attached)
   - Each polygon shows auto-calculated area in hectares

NEXT STEPS:
1. Navigate to /set-pinmark-info
2. Click on a blue pinmark
3. Attach it to a registrant
4. Pinmark turns green

1. Navigate to /set-farm-parcel-info
2. Click on a blue polygon
3. See the auto-calculated area
4. Attach it to a farm parcel
5. Polygon turns green
*/

-- ============================================
-- 5. CLEANUP (Optional - Run to remove test data)
-- ============================================

-- Uncomment these lines to delete test data:
-- DELETE FROM pinmark_locations WHERE notes LIKE '%Test%' OR notes LIKE '%Sample%';
-- DELETE FROM farm_boundaries WHERE notes LIKE '%Test%' OR notes LIKE '%Sample%';
