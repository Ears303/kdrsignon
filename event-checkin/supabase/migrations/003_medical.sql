-- 003: medical role, injury log, and medical suspension (bikes only). Run AFTER 001 and 002.
--
--  * New role `medical`: sees and edits the injury log, and can suspend / reinstate bike entrants.
--  * Injury details live in `injuries`, readable ONLY by admin + medical logins.
--  * Everyone else only ever sees the suspension flag (and a short public note) on the entrant.
--  * A suspended entrant is blocked from briefing / start / finish scans in the app AND by the database.
--
-- Written so that nothing uses the two new enum values inside this same transaction.

alter type app_role add value if not exists 'medical';
alter type entrant_status add value if not exists 'medical_suspended';

-- short PUBLIC note shown to all staff, e.g. "See Control" (no medical details!)
alter table entrants add column if not exists status_note text;

-- Only bikes can be medically suspended.
alter table entrants drop constraint if exists medical_suspension_bikes_only;
alter table entrants add constraint medical_suspension_bikes_only
  check (status::text <> 'medical_suspended' or entrant_type::text = 'bike');

-- ------------------------------------------------------------ role helpers (text comparisons, so they don't depend on the new enum value)
create or replace function has_medical_access()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from user_roles where user_id = auth.uid() and role::text in ('admin', 'medical'));
$$;
create or replace function has_any_role()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from user_roles where user_id = auth.uid());
$$;
revoke all on function has_medical_access() from public;
revoke all on function has_any_role() from public;
grant execute on function has_medical_access() to authenticated;
grant execute on function has_any_role() to authenticated;

-- Anyone with any role may read event data (so a medical-only login can use Reports too).
do $$
declare t text;
begin
  foreach t in array array['events','entrants','stages','briefing_attendance','stage_scans','stage_results'] loop
    execute format('drop policy if exists "%1$s read" on %1$I', t);
    execute format('create policy "%1$s read" on %1$I for select to authenticated using (has_any_role())', t);
  end loop;
end $$;

-- ------------------------------------------------------------ injury log (restricted to admin + medical)
create table if not exists injuries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  entrant_id uuid not null references entrants(id) on delete cascade,
  stage_id uuid references stages(id) on delete set null,
  occurred_at timestamptz not null default now(),
  description text not null,
  outcome text,
  suspended boolean not null default false,
  recorded_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists injuries_event_idx on injuries(event_id, occurred_at);
alter table injuries enable row level security;
drop policy if exists "injuries medical" on injuries;
create policy "injuries medical" on injuries for all to authenticated
  using (has_medical_access()) with check (has_medical_access());

-- ------------------------------------------------------------ suspend / reinstate (medical + admin only)
create or replace function set_medical_suspension(p_entrant uuid, p_suspend boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not has_medical_access() then
    raise exception 'Only medical staff can change a medical suspension' using errcode = '42501';
  end if;
  update entrants
     set status = case when p_suspend then 'medical_suspended'::entrant_status else 'active'::entrant_status end,
         status_note = case when p_suspend then nullif(trim(p_note), '') else null end
   where id = p_entrant
     and entrant_type::text = 'bike'
     and (case when p_suspend then status::text in ('active', 'medical_suspended')
               else status::text = 'medical_suspended' end);
  if not found then
    raise exception 'Not a bike entrant that can be changed (suspending needs an active bike entrant; reinstating needs a suspended one)';
  end if;
end;
$$;
revoke all on function set_medical_suspension(uuid, boolean, text) from public;
grant execute on function set_medical_suspension(uuid, boolean, text) to authenticated;

-- Control/admin edit entrants directly, so stop that path being used to dodge the medical rules.
create or replace function guard_medical_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null  -- direct SQL / service connections are trusted
     and (old.status::text = 'medical_suspended') is distinct from (new.status::text = 'medical_suspended')
     and not has_medical_access() then
    raise exception 'Only medical staff can change a medical suspension' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists entrants_guard_medical on entrants;
create trigger entrants_guard_medical before update on entrants
  for each row execute function guard_medical_status();

-- ------------------------------------------------------------ database-level scan block
create or replace function block_suspended_entrants()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from entrants where id = new.entrant_id and status::text = 'medical_suspended') then
    raise exception 'Entrant is medically suspended - scan refused';
  end if;
  return new;
end;
$$;
drop trigger if exists briefing_block_suspended on briefing_attendance;
create trigger briefing_block_suspended before insert on briefing_attendance
  for each row execute function block_suspended_entrants();
drop trigger if exists scans_block_suspended on stage_scans;
create trigger scans_block_suspended before insert on stage_scans
  for each row execute function block_suspended_entrants();

-- ------------------------------------------------------------ give someone the medical role (after creating their user in Supabase):
--   insert into user_roles (user_id, role)
--   select id, 'medical' from auth.users where email = 'doctor@example.com'
--   on conflict (user_id) do update set role = 'medical';
