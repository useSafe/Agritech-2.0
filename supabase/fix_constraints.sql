-- Allow farm_parcel_id to be NULL in farm_boundaries table to support detachment
ALTER TABLE farm_boundaries ALTER COLUMN farm_parcel_id DROP NOT NULL;

-- Also check pinmark_locations just in case
ALTER TABLE pinmark_locations ALTER COLUMN registrant_id DROP NOT NULL;
