-- Remove المقطم and أماكن أخرى — keep only الصف, كفر علو, المعصرة
-- Run this once in the Supabase SQL editor

DO $$
DECLARE
  extra_areas uuid[] := ARRAY[
    'f5b4937c-d18b-d3a2-fda1-2cf3c86c4324'::uuid,  -- أماكن أخرى
    'a6ace484-f4d7-ca78-6efe-6c32d3b38e11'::uuid   -- المقطم
  ];
  area_case_ids uuid[];
BEGIN
  -- Collect case IDs for the areas being removed
  SELECT ARRAY(SELECT id FROM cases WHERE area_id = ANY(extra_areas))
    INTO area_case_ids;

  -- 1. advance_payments linked to those cases
  DELETE FROM advance_payments  WHERE case_id = ANY(area_case_ids);

  -- 2. monthly_adjustments linked to those cases
  DELETE FROM monthly_adjustments WHERE case_id = ANY(area_case_ids);

  -- 3. sponsorships linked to those cases
  DELETE FROM sponsorships WHERE case_id = ANY(area_case_ids);

  -- 4. disbursements for those areas
  DELETE FROM disbursements WHERE area_id = ANY(extra_areas);

  -- 5. settlement_reports for those areas
  DELETE FROM settlement_reports WHERE area_id = ANY(extra_areas);

  -- 6. cases themselves
  DELETE FROM cases WHERE area_id = ANY(extra_areas);

  -- 7. finally the areas
  DELETE FROM areas WHERE id = ANY(extra_areas);

  RAISE NOTICE 'Removed % cases and both extra areas.', array_length(area_case_ids, 1);
END $$;
