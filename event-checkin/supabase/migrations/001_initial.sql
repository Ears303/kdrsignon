create extension if not exists pgcrypto;
create type entrant_type as enum ('car','bike');
create type entrant_status as enum ('active','withdrawn','dns');
create type scan_point as enum ('start','finish');
create type result_status as enum ('finished','dnf');
create type recording_method as enum ('camera','scanner','manual');

create table events (id uuid primary key default gen_random_uuid(), name text not null, event_date date, status text not null default 'draft', created_at timestamptz not null default now());
create table entrants (id uuid primary key default gen_random_uuid(), event_id uuid not null references events(id) on delete cascade, entrant_type entrant_type not null, competition_number text not null, scan_code text not null, primary_name text not null, secondary_name text, class_name text, vehicle_description text, registration_number text, status entrant_status not null default 'active', created_at timestamptz not null default now(), unique(event_id, entrant_type, competition_number), unique(event_id, scan_code));
create table stages (id uuid primary key default gen_random_uuid(), event_id uuid not null references events(id) on delete cascade, name text not null, sequence_number integer not null, enabled boolean not null default true, unique(event_id,name), unique(event_id,sequence_number));
create table briefing_attendance (id uuid primary key default gen_random_uuid(), event_id uuid not null references events(id) on delete cascade, entrant_id uuid not null references entrants(id) on delete cascade, attended_at timestamptz not null default now(), recorded_by uuid references auth.users(id), method recording_method not null default 'camera', notes text, unique(event_id, entrant_id));
create table stage_scans (id uuid primary key default gen_random_uuid(), event_id uuid not null references events(id) on delete cascade, entrant_id uuid not null references entrants(id) on delete cascade, stage_id uuid not null references stages(id) on delete cascade, point scan_point not null, scanned_at timestamptz not null default now(), recorded_by uuid references auth.users(id), method recording_method not null default 'camera', notes text, unique(event_id, entrant_id, stage_id, point));
create table stage_results (id uuid primary key default gen_random_uuid(), event_id uuid not null references events(id) on delete cascade, entrant_id uuid not null references entrants(id) on delete cascade, stage_id uuid not null references stages(id) on delete cascade, status result_status not null, recorded_at timestamptz not null default now(), recorded_by uuid references auth.users(id), reason text, unique(event_id, entrant_id, stage_id));

create index entrants_event_type_idx on entrants(event_id, entrant_type);
create index scans_event_stage_point_idx on stage_scans(event_id, stage_id, point);

alter table events enable row level security; alter table entrants enable row level security; alter table stages enable row level security; alter table briefing_attendance enable row level security; alter table stage_scans enable row level security; alter table stage_results enable row level security;
create policy "authenticated events" on events for all to authenticated using (true) with check (true);
create policy "authenticated entrants" on entrants for all to authenticated using (true) with check (true);
create policy "authenticated stages" on stages for all to authenticated using (true) with check (true);
create policy "authenticated briefings" on briefing_attendance for all to authenticated using (true) with check (true);
create policy "authenticated scans" on stage_scans for all to authenticated using (true) with check (true);
create policy "authenticated results" on stage_results for all to authenticated using (true) with check (true);
