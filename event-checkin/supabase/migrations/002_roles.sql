-- 002: roles, tighter row-level security, default stages, recorded_by defaults.
-- Run AFTER 001_initial.sql.

-- ---------------------------------------------------------------- roles
create type app_role as enum ('admin', 'control', 'scanner', 'viewer');

create table user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role app_role not null,
  created_at timestamptz not null default now()
);
alter table user_roles enable row level security;

-- security definer so policies can check roles without recursing into user_roles' own RLS
create or replace function has_role(variadic allowed app_role[])
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from user_roles where user_id = auth.uid() and role = any(allowed));
$$;
revoke all on function has_role(app_role[]) from public;
grant execute on function has_role(app_role[]) to authenticated;

-- ---------------------------------------------------------------- replace the starter's "any signed-in user" policies
drop policy "authenticated events"   on events;
drop policy "authenticated entrants" on entrants;
drop policy "authenticated stages"   on stages;
drop policy "authenticated briefings" on briefing_attendance;
drop policy "authenticated scans"    on stage_scans;
drop policy "authenticated results"  on stage_results;

-- user_roles: you can see your own role; admins manage everyone
create policy "own role"      on user_roles for select to authenticated using (user_id = auth.uid());
create policy "admin read"    on user_roles for select to authenticated using (has_role('admin'));
create policy "admin write"   on user_roles for all    to authenticated using (has_role('admin')) with check (has_role('admin'));

-- setup data (events, entrants, stages): everyone with a role reads; admin/control write
do $$
declare t text;
begin
  foreach t in array array['events', 'entrants', 'stages'] loop
    execute format($f$create policy "%1$s read" on %1$I for select to authenticated
                      using (has_role('admin','control','scanner','viewer'))$f$, t);
    execute format($f$create policy "%1$s write" on %1$I for all to authenticated
                      using (has_role('admin','control')) with check (has_role('admin','control'))$f$, t);
  end loop;

  -- recorded data (briefing, scans, results): scanners may add, and undo only their own rows
  foreach t in array array['briefing_attendance', 'stage_scans', 'stage_results'] loop
    execute format($f$create policy "%1$s read" on %1$I for select to authenticated
                      using (has_role('admin','control','scanner','viewer'))$f$, t);
    execute format($f$create policy "%1$s insert" on %1$I for insert to authenticated
                      with check (has_role('admin','control','scanner'))$f$, t);
    execute format($f$create policy "%1$s control update" on %1$I for update to authenticated
                      using (has_role('admin','control')) with check (has_role('admin','control'))$f$, t);
    execute format($f$create policy "%1$s delete" on %1$I for delete to authenticated
                      using (has_role('admin','control') or (has_role('scanner') and recorded_by = auth.uid()))$f$, t);
  end loop;
end $$;

-- who recorded it, filled in by the database so it can't be spoofed by omission
alter table briefing_attendance alter column recorded_by set default auth.uid();
alter table stage_scans         alter column recorded_by set default auth.uid();
alter table stage_results       alter column recorded_by set default auth.uid();

-- ---------------------------------------------------------------- default stages for every new event
create or replace function seed_default_stages()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into stages (event_id, name, sequence_number) values
    (new.id, 'Prologue', 1), (new.id, 'Lap 1', 2), (new.id, 'Lap 2', 3), (new.id, 'Lap 3', 4);
  return new;
end;
$$;
create trigger events_seed_stages after insert on events
  for each row execute function seed_default_stages();

-- stages for events that already exist (idempotent)
insert into stages (event_id, name, sequence_number)
select e.id, s.name, s.n
from events e
cross join (values ('Prologue', 1), ('Lap 1', 2), ('Lap 2', 3), ('Lap 3', 4)) as s(name, n)
where not exists (select 1 from stages x where x.event_id = e.id);

-- ---------------------------------------------------------------- make the first admin
-- 1. In Supabase: Authentication > Users > Add user (email + password).
-- 2. Then run this with your email:
--
--   insert into user_roles (user_id, role)
--   select id, 'admin' from auth.users where email = 'you@example.com'
--   on conflict (user_id) do update set role = 'admin';
