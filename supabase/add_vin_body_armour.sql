-- 1. VIN on each submission
ALTER TABLE public.scrutineering_submissions
ADD COLUMN IF NOT EXISTS vin text;

-- 2. Body armour check on the checklist
INSERT INTO public.scrutineering_checklist
(code, section, item_name, requirement, display_order, is_required, is_active)
VALUES
('BODY_ARMOUR', 'Rider Safety Equipment', 'Body Armour',
 'I have body armour which complies', 265, true, true)
ON CONFLICT (code) DO UPDATE SET
  section = EXCLUDED.section,
  item_name = EXCLUDED.item_name,
  requirement = EXCLUDED.requirement,
  display_order = EXCLUDED.display_order,
  is_required = true,
  is_active = true;
