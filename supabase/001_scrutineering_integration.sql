-- Adds the entrant link and ensures hydration is present.
alter table public.scrutineering_submissions
  add column if not exists entrant_id uuid references public.entrants(id) on delete restrict;

create index if not exists idx_scrutineering_submissions_entrant
  on public.scrutineering_submissions(entrant_id);

insert into public.scrutineering_checklist
(code,section,item_name,requirement,display_order,is_required,is_active)
values
('HYDRATION','Rider Safety Equipment','Water / Hydration System',
 'Minimum 2 litre water container or CamelBak-type hydration system',260,true,true)
on conflict (code) do update set
 section=excluded.section,item_name=excluded.item_name,requirement=excluded.requirement,
 display_order=excluded.display_order,is_required=true,is_active=true;

-- The browser uses Next.js API routes, not direct anonymous table access.
drop policy if exists "Public create submission" on public.scrutineering_submissions;
drop policy if exists "Public create check results" on public.scrutineering_check_results;
