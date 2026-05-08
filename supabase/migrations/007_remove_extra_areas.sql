-- Remove all areas except المعصرة, كفر علو, الصف
-- Run once in the Supabase SQL editor

DO $$
DECLARE
  extra_area_ids uuid[];
  area_case_ids  uuid[];
BEGIN
  -- Collect IDs of all areas that should be removed
  SELECT ARRAY(
    SELECT id FROM areas
    WHERE name NOT IN ('المعصرة', 'كفر علو', 'الصف')
  ) INTO extra_area_ids;

  IF array_length(extra_area_ids, 1) IS NULL THEN
    RAISE NOTICE 'No extra areas found — nothing to delete.';
    RETURN;
  END IF;

  -- Collect case IDs belonging to those areas
  SELECT ARRAY(SELECT id FROM cases WHERE area_id = ANY(extra_area_ids))
    INTO area_case_ids;

  -- 1. advance_payments linked to those cases
  IF array_length(area_case_ids, 1) IS NOT NULL THEN
    DELETE FROM advance_payments  WHERE case_id = ANY(area_case_ids);
    DELETE FROM monthly_adjustments WHERE case_id = ANY(area_case_ids);
    DELETE FROM sponsorships       WHERE case_id = ANY(area_case_ids);
    DELETE FROM cases              WHERE id      = ANY(area_case_ids);
  END IF;

  -- 2. disbursements and settlement_reports for those areas
  DELETE FROM disbursements       WHERE area_id = ANY(extra_area_ids);
  DELETE FROM settlement_reports  WHERE area_id = ANY(extra_area_ids);

  -- 3. Finally remove the areas themselves
  DELETE FROM areas WHERE id = ANY(extra_area_ids);

  RAISE NOTICE 'Deleted % area(s) and % case(s).',
    array_length(extra_area_ids, 1),
    COALESCE(array_length(area_case_ids, 1), 0);
END $$;
