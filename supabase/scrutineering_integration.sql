-- ============================================================
-- Link self-scrutineering to the existing entrants table
-- Safe to run more than once
-- ============================================================

-- 1. RideNet ID on entrants (your table does not have it yet)
ALTER TABLE public.entrants
ADD COLUMN IF NOT EXISTS ridernet_id text;

CREATE INDEX IF NOT EXISTS idx_entrants_ridernet
ON public.entrants (ridernet_id, competition_number);

-- 2. Submissions: link to entrant + match your entrant columns
ALTER TABLE public.scrutineering_submissions
ADD COLUMN IF NOT EXISTS entrant_id uuid REFERENCES public.entrants(id) ON DELETE RESTRICT;

ALTER TABLE public.scrutineering_submissions
ADD COLUMN IF NOT EXISTS vehicle_description text;

ALTER TABLE public.scrutineering_submissions
ADD COLUMN IF NOT EXISTS registration_number text;

-- Old make/model columns no longer required (your entrants use vehicle_description)
ALTER TABLE public.scrutineering_submissions
ALTER COLUMN machine_make DROP NOT NULL;

ALTER TABLE public.scrutineering_submissions
ALTER COLUMN machine_model DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_scrutineering_submissions_entrant
ON public.scrutineering_submissions (entrant_id);

-- 3. Make sure the hydration check exists
INSERT INTO public.scrutineering_checklist
(code, section, item_name, requirement, display_order, is_required, is_active)
VALUES
('HYDRATION', 'Rider Safety Equipment', 'Water / Hydration System',
 'Minimum 2 litre water container or CamelBak-type hydration system', 260, true, true)
ON CONFLICT (code) DO UPDATE SET
  section = EXCLUDED.section,
  item_name = EXCLUDED.item_name,
  requirement = EXCLUDED.requirement,
  display_order = EXCLUDED.display_order,
  is_required = true,
  is_active = true;

-- 4. Public form now goes through the app's server, not direct table access
DROP POLICY IF EXISTS "Public create submission" ON public.scrutineering_submissions;
DROP POLICY IF EXISTS "Public create check results" ON public.scrutineering_check_results;
