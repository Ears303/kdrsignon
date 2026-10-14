# Event Check-In

Next.js + Supabase app for running a car/bike event: briefing attendance, start/finish scanning per stage,
DNFs, and live "who's missing" reports.

## What it does

| Page | What you do there |
|---|---|
| **Event** | Pick or create the event. Prologue, Lap 1–3 are created automatically; switch stages on/off. |
| **Entrants** | Import from CSV/Excel paste, add one by hand, mark withdrawn / DNS, search. |
| **Labels** | Print QR labels (one per entrant) containing the scan code. |
| **Medical** | *Medical and admin logins only.* Log bike injuries and medically suspend / reinstate riders. |
| **Scan** | The station screen. Pick **Bike/Car**, **Briefing / Start / Finish / DNF** and the **stage**, then scan with the phone camera, a Bluetooth/USB hand scanner, or type the number + Enter. |
| **Reports** | Per type and stage: on course (started, not finished), not started, not at briefing, DNFs. Export any list to CSV. Auto-refreshes every 20 s. |

Scan station behaviour:
- Big green/amber/red result with the entrant's number and name, plus a beep/vibration.
- Duplicate scans are flagged and not saved twice. Scanning a car at a bike station is rejected.
- Withdrawn/DNS entrants, or scanning someone already DNF'd, asks "Record anyway?".
- A finish with no start scan is saved, with a warning.
- **Undo** on the recent list (scanners can undo their own; control/admin any).
- The method (camera / scanner / manual) is stored with each record.
- The entrant list is cached on the device, and scans are queued locally if the signal drops, then upload automatically.
  This only works while the page stays open — see *Limitations*.

## Setup

1. **Supabase project** → SQL Editor → run, in order:
   `supabase/migrations/001_initial.sql`, then `002_roles.sql`, then `003_medical.sql`.
   (If a file errors with "already exists", it has already been run — skip it and run the next one.)
2. **Authentication → Providers → Email**: turn **off** "Allow new users to sign up" (only people you add can log in).
3. **Authentication → Users → Add user** for yourself (email + password), then in the SQL Editor make yourself admin:
   ```sql
   insert into user_roles (user_id, role)
   select id, 'admin' from auth.users where email = 'you@example.com'
   on conflict (user_id) do update set role = 'admin';
   ```
4. Copy `.env.example` → `.env.local` and fill in the project URL and publishable (anon) key from Project Settings → API.
5. `npm install` then `npm run dev` → http://localhost:3000
6. **Deploy**: push to GitHub, import into Vercel, add the same two env vars, deploy. Vercel gives you HTTPS, which the phone camera requires.

### Roles
Add other people the same way (create the user, then insert a `user_roles` row):

| Role | Can |
|---|---|
| `admin` | everything, including granting roles |
| `control` | manage events/entrants/stages, record and delete any scan |
| `scanner` | record scans, undo their own |
| `viewer` | read-only, reports |
| `medical` | read-only on event data and reports, plus the **Medical** page: injury log, suspend / reinstate bikes. Cannot record scans or edit entrants |

Only `medical` and `admin` can see injury records or change a suspension. To give someone the medical role:
```sql
insert into user_roles (user_id, role)
select id, 'medical' from auth.users where email = 'doctor@example.com'
on conflict (user_id) do update set role = 'medical';
```

A signed-in user with no role sees nothing and is told to ask an admin.

## Medical suspensions (bikes only)
- Medical logs an injury on the **Medical** page. Ticking **Medically suspend this rider** blocks that bike at every
  scan station (briefing, start, finish, DNF) — the scanner shows a red **MEDICALLY SUSPENDED** screen with no override.
- The block is enforced by the database as well as the app, so a phone with out-of-date data still can't record the scan.
  Scan stations refresh their entrant list every 30 s, so a new suspension reaches phones within about half a minute.
- Injury details (description, outcome) are visible **only** to medical and admin. Everyone else sees just *suspended* plus a short
  note chosen by medical (e.g. "See Control"). Keep medical details out of that note.
- Only medical/admin can suspend or reinstate; control and scanners can't. Cars can't be suspended.
- Suspended riders are listed on **Reports** and are not counted as missing/outstanding.

## Using it on the day

1. Before the event: create the event, import entrants, print labels (or just use competition numbers).
2. Each marshal opens the site on their phone, picks their station once (it's remembered), and scans.
3. Control watches **Reports → on course** to see who hasn't come through.
4. Test the camera on the actual phones/lighting before the day. Printed QR codes at ~3 cm+ scan reliably.

### CSV format
```
Type,Number,Name,Co-driver,Class,Vehicle,Rego,Scan code
bike,12,Jane Citizen,,Open,Yamaha MT-07,1ABC234,
car,5,John Smith,Sam Jones,Club,Datsun 1600,1XYZ987,
```
Only Number and Name are required. If there's no Type column, choose a default type in the importer.
Scan code defaults to `B12` / `C5`. Re-importing updates entrants matched on type + number. Existing barcode
numbers can go in the Scan code column.

## Development
```
npm run dev        # dev server
npm run typecheck  # tsc
npm test           # unit tests for CSV import, scan rules and report maths (lib/logic.test.ts)
npm run build
```
Scan rules and report calculations live in `lib/logic.ts` (pure functions, tested). The database rules are in the two migrations.

## Limitations / next steps
- **Offline**: there's no service worker, so a scan page that is *already open* keeps working through a signal drop and
  uploads later, but reloading or opening the site fresh with no signal won't load it. Open the scan page before heading to a dead spot.
- Timestamps are phone clock time — fine for attendance, not for race timing. Make sure phones are on automatic time.
- Reports refresh every 20 s rather than live-pushing (Supabase Realtime could be added).
- Roles are managed in SQL; there's no user-management screen.
- Uses the starter's existing schema unchanged (002 only adds tables/policies/triggers).
