'use client'
// FILE LOCATION IN GITHUB: components/CourseControlPanel.tsx
// Course control panel (sweep riders, course cars, sections, DNF/recoveries, phases).
// Shown on the race control page beside the log. Must sit inside <Shell> (uses useApp).

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useApp } from '@/components/AppProvider'
import { getSupabase } from '@/lib/supabase'

interface Checkpoint { id: string; code: string; sequence_no: number }
interface Phase { id: string; name: string; phase_type: string; sequence_no: number; status: string }
interface Unit { id: string; unit_code: string; display_name: string; unit_type: string; status: string }
interface Position {
  course_unit_id: string
  position_type: string
  last_checkpoint_id: string | null
  destination_checkpoint_id: string | null
}
interface Section {
  id: string
  from_checkpoint_id: string
  to_checkpoint_id: string
  sequence_no: number
  bike_sweep_status: string
  car_readiness_status: string
}
interface Entrant { id: string; entrant_type: string | null; competition_number: string | null; primary_name: string | null }
interface Recovery {
  id: string
  entrant_id: string
  checkpoint_id: string | null
  accountability_status: string
  recovery_status: string
  assigned_unit_id: string | null
  priority: string
  reported_at: string
}

const RECOVERY_STEPS = ['REQUIRED', 'ASSIGNED', 'LOCATED', 'RECOVERING', 'RECOVERED', 'RETURNED']
const ACCOUNTABILITY = ['UNKNOWN', 'ON_COURSE', 'LOCATED_SAFE', 'MEDICAL', 'RETURNED', 'ACCOUNTED_FOR']
const CAR_PHASES = ['COURSE_PREP', 'CAR_RACING', 'CAR_FINAL_CLEARANCE']
const STATUS_TIMESTAMP: Record<string, string> = {
  ASSIGNED: 'assigned_at',
  LOCATED: 'located_at',
  RECOVERED: 'recovered_at',
  RETURNED: 'returned_at',
  CLOSED: 'closed_at',
}

const label = (v: string | null | undefined) =>
  !v ? 'Unknown' : v.toLowerCase().split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')

const ago = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min`
  return `${Math.floor(m / 60)} h ${m % 60} min`
}

const pillClass = (status: string) =>
  status === 'COMPLETE' || status === 'READY' ? 'ok'
    : status === 'ISSUE' ? 'bad'
      : status === 'IN_PROGRESS' || status === 'CHECKING' ? 'warn' : ''

export function CourseControlPanel() {
  const { event, session } = useApp()
  const who = session?.user.email ?? 'unknown'

  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([])
  const [phases, setPhases] = useState<Phase[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [sections, setSections] = useState<Section[]>([])
  const [recoveries, setRecoveries] = useState<Recovery[]>([])
  const [entrants, setEntrants] = useState<Entrant[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [okMsg, setOkMsg] = useState('')

  // unit form
  const [unitId, setUnitId] = useState('')
  const [destId, setDestId] = useState('')
  const [arriveId, setArriveId] = useState('')

  // new recovery form
  const [newNumber, setNewNumber] = useState('')
  const [newCp, setNewCp] = useState('')
  const [newAcc, setNewAcc] = useState('LOCATED_SAFE')
  const [newPriority, setNewPriority] = useState('NORMAL')
  const [newNotes, setNewNotes] = useState('')

  const load = useCallback(async (silent = false) => {
    if (!event) return
    if (!silent) setLoading(true)
    try {
      const sb = getSupabase()
      const id = event.id
      const [cps, phs, uns, pos, secs, recs, ents] = await Promise.all([
        sb.from('course_checkpoints').select('id,code,sequence_no').eq('event_id', id).eq('active', true).order('sequence_no'),
        sb.from('event_phases').select('id,name,phase_type,sequence_no,status').eq('event_id', id).order('sequence_no'),
        sb.from('course_units').select('id,unit_code,display_name,unit_type,status').eq('event_id', id).eq('active', true).order('unit_code'),
        sb.from('course_unit_positions').select('course_unit_id,position_type,last_checkpoint_id,destination_checkpoint_id').eq('event_id', id),
        sb.from('course_sections').select('id,from_checkpoint_id,to_checkpoint_id,sequence_no,bike_sweep_status,car_readiness_status').eq('event_id', id).order('sequence_no'),
        sb.from('course_recoveries').select('id,entrant_id,checkpoint_id,accountability_status,recovery_status,assigned_unit_id,priority,reported_at').eq('event_id', id).neq('recovery_status', 'CLOSED').order('reported_at'),
        sb.from('entrants').select('id,entrant_type,competition_number,primary_name').eq('event_id', id),
      ])
      const err = cps.error || phs.error || uns.error || pos.error || secs.error || recs.error || ents.error
      if (err) throw err
      setCheckpoints((cps.data ?? []) as Checkpoint[])
      setPhases((phs.data ?? []) as Phase[])
      setUnits((uns.data ?? []) as Unit[])
      setPositions((pos.data ?? []) as Position[])
      setSections((secs.data ?? []) as Section[])
      setRecoveries((recs.data ?? []) as Recovery[])
      setEntrants((ents.data ?? []) as Entrant[])
      setMsg('')
    } catch (err) {
      setMsg((err as Error).message)
    }
    setLoading(false)
  }, [event])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    const t = setInterval(() => { void load(true) }, 15000)
    return () => clearInterval(t)
  }, [load])

  const cpById = useMemo(() => new Map(checkpoints.map(c => [c.id, c])), [checkpoints])
  const unitById = useMemo(() => new Map(units.map(u => [u.id, u])), [units])
  const entrantById = useMemo(() => new Map(entrants.map(e => [e.id, e])), [entrants])
  const activePhase = phases.find(p => p.status === 'ACTIVE')
  const carMode = !!activePhase && CAR_PHASES.includes(activePhase.phase_type)
  const selectedUnit = unitById.get(unitId)
  const selectedPos = positions.find(p => p.course_unit_id === unitId)

  const positionText = (p: Position | undefined) => {
    if (!p) return 'Position unknown'
    const from = cpById.get(p.last_checkpoint_id ?? '')?.code ?? '?'
    const to = cpById.get(p.destination_checkpoint_id ?? '')?.code ?? '?'
    if (p.position_type === 'IN_TRANSIT') return `${from} → ${to}`
    if (p.position_type === 'CHECKPOINT') return `At ${from}`
    return 'Position unknown'
  }

  /* ---------- write helpers ---------- */

  async function run(action: () => Promise<void>, success: string) {
    if (!event) return
    setBusy(true)
    setMsg('')
    setOkMsg('')
    try {
      await action()
      setOkMsg(success)
      await load(true)
    } catch (err) {
      setMsg((err as Error).message)
    }
    setBusy(false)
  }

  const check = (res: { error: { message: string } | null }) => {
    if (res.error) throw new Error(res.error.message)
  }

  async function log(activity_type: string, details: string, extra: Record<string, string | null> = {}) {
    check(await getSupabase().from('course_unit_activity').insert({
      event_id: event!.id,
      activity_type,
      details: `${details} (by ${who})`,
      ...extra,
    }))
  }

  async function savePosition(id: string, position_type: string, last: string | null, dest: string | null) {
    check(await getSupabase().from('course_unit_positions').upsert({
      course_unit_id: id,
      event_id: event!.id,
      position_type,
      last_checkpoint_id: last,
      destination_checkpoint_id: dest,
      updated_at: new Date().toISOString(),
    }))
  }

  async function setUnitStatus(id: string, status: string) {
    check(await getSupabase().from('course_units').update({ status, updated_at: new Date().toISOString() }).eq('id', id))
  }

  // sections whose start checkpoint lies between two sequence numbers
  const sectionsBetween = (a: number, b: number) => {
    const [lo, hi] = a < b ? [a, b] : [b, a]
    return sections.filter(s => {
      const f = cpById.get(s.from_checkpoint_id)?.sequence_no ?? -1
      return f >= lo && f < hi
    })
  }

  /* ---------- unit actions ---------- */

  function depart() {
    if (!selectedUnit) { setMsg('Select a unit first.'); return }
    if (!destId) { setMsg('Select where the unit is heading.'); return }
    const from = selectedPos?.last_checkpoint_id ?? null
    if (!from) { setMsg('This unit has no last checkpoint yet. Use "Arrived at" first.'); return }
    const fromCode = cpById.get(from)?.code
    const toCode = cpById.get(destId)?.code
    const u = selectedUnit

    void run(async () => {
      await savePosition(u.id, 'IN_TRANSIT', from, destId)
      await setUnitStatus(u.id, 'IN_TRANSIT')
      const ids = sectionsBetween(cpById.get(from)!.sequence_no, cpById.get(destId)!.sequence_no).map(s => s.id)
      if (ids.length) {
        const sb = getSupabase()
        if (carMode) {
          check(await sb.from('course_sections').update({ car_readiness_status: 'CHECKING', course_prep_unit_id: u.id })
            .in('id', ids).eq('car_readiness_status', 'PENDING'))
        } else if (u.unit_type === 'SWEEP_RIDER') {
          check(await sb.from('course_sections').update({ bike_sweep_status: 'IN_PROGRESS', bike_sweep_unit_id: u.id })
            .in('id', ids).eq('bike_sweep_status', 'PENDING'))
        }
      }
      await log('DEPARTED', `${u.unit_code} departed ${fromCode} for ${toCode}`, { course_unit_id: u.id, checkpoint_id: from })
    }, `${u.unit_code} departed ${fromCode} → ${toCode}`)
  }

  function arrive() {
    if (!selectedUnit) { setMsg('Select a unit first.'); return }
    const at = arriveId || selectedPos?.destination_checkpoint_id
    if (!at) { setMsg('Select the checkpoint it arrived at.'); return }
    const atCode = cpById.get(at)?.code
    const from = selectedPos?.last_checkpoint_id ?? null
    const u = selectedUnit

    void run(async () => {
      await savePosition(u.id, 'CHECKPOINT', at, null)
      await setUnitStatus(u.id, 'AT_CHECKPOINT')

      // Sections travelled become swept / ready, unless an open recovery sits inside them.
      if (from && (carMode || u.unit_type === 'SWEEP_RIDER')) {
        const sb = getSupabase()
        const now = new Date().toISOString()
        for (const s of sectionsBetween(cpById.get(from)!.sequence_no, cpById.get(at)!.sequence_no)) {
          const f = cpById.get(s.from_checkpoint_id)?.sequence_no ?? -1
          const t = cpById.get(s.to_checkpoint_id)?.sequence_no ?? -1
          const openInside = recoveries.some(r => {
            const rs = cpById.get(r.checkpoint_id ?? '')?.sequence_no
            return rs !== undefined && rs > f && rs <= t
          })
          const patch = carMode
            ? (openInside ? { car_readiness_status: 'ISSUE' } : { car_readiness_status: 'READY', car_ready_at: now, course_prep_unit_id: u.id })
            : (openInside ? { bike_sweep_status: 'ISSUE' } : { bike_sweep_status: 'COMPLETE', bike_sweep_completed_at: now, bike_sweep_unit_id: u.id })
          check(await sb.from('course_sections').update(patch).eq('id', s.id))
        }
      }
      await log('ARRIVED', `${u.unit_code} arrived ${atCode}`, { course_unit_id: u.id, checkpoint_id: at })
    }, `${u.unit_code} arrived at ${atCode}`)
  }

  function changeUnitStatus(status: string) {
    if (!selectedUnit) { setMsg('Select a unit first.'); return }
    const u = selectedUnit
    void run(async () => {
      await setUnitStatus(u.id, status)
      await log('STATUS', `${u.unit_code} set to ${label(status)}`, { course_unit_id: u.id })
    }, `${u.unit_code} set to ${label(status)}`)
  }

  /* ---------- section actions ---------- */

  function setSection(s: Section, status: string) {
    const from = cpById.get(s.from_checkpoint_id)?.code
    const to = cpById.get(s.to_checkpoint_id)?.code
    const now = new Date().toISOString()
    const patch = carMode
      ? { car_readiness_status: status, car_ready_at: status === 'READY' ? now : null }
      : { bike_sweep_status: status, bike_sweep_completed_at: status === 'COMPLETE' ? now : null }
    void run(async () => {
      check(await getSupabase().from('course_sections').update({ ...patch, updated_at: now }).eq('id', s.id))
      await log('SECTION', `${from} → ${to} set to ${label(status)}`, { checkpoint_id: s.from_checkpoint_id })
    }, `${from} → ${to}: ${label(status)}`)
  }

  /* ---------- recovery actions ---------- */

  function addRecovery(ev: React.FormEvent) {
    ev.preventDefault()
    const num = newNumber.trim().toLowerCase()
    if (!num) { setMsg('Enter the competition number.'); return }
    if (!newCp) { setMsg('Select the location.'); return }
    const ent = entrants.find(e => (e.competition_number ?? '').toLowerCase() === num)
    if (!ent) { setMsg(`No entrant #${newNumber} found in this event.`); return }
    if (recoveries.some(r => r.entrant_id === ent.id)) { setMsg(`#${newNumber} already has an open recovery item.`); return }

    void run(async () => {
      const res = await getSupabase().from('course_recoveries').insert({
        event_id: event!.id,
        entrant_id: ent.id,
        checkpoint_id: newCp,
        accountability_status: newAcc,
        recovery_status: 'REQUIRED',
        priority: newPriority,
        notes: newNotes.trim() || null,
      }).select('id').single()
      check(res)
      await log('RECOVERY_REPORTED', `#${ent.competition_number} reported at ${cpById.get(newCp)?.code}`, {
        recovery_id: (res.data as { id: string }).id,
        checkpoint_id: newCp,
      })
      setNewNumber('')
      setNewNotes('')
    }, `Recovery opened for #${ent.competition_number}`)
  }

  function updateRecovery(r: Recovery, patch: Record<string, string | null>, text: string) {
    const ent = entrantById.get(r.entrant_id)
    void run(async () => {
      const now = new Date().toISOString()
      const full: Record<string, string | null> = { ...patch, updated_at: now }
      if (patch.recovery_status && STATUS_TIMESTAMP[patch.recovery_status]) full[STATUS_TIMESTAMP[patch.recovery_status]] = now
      check(await getSupabase().from('course_recoveries').update(full).eq('id', r.id))
      await log('RECOVERY', `#${ent?.competition_number ?? '?'}: ${text}`, {
        recovery_id: r.id,
        course_unit_id: patch.assigned_unit_id ?? r.assigned_unit_id,
      })
    }, `#${ent?.competition_number ?? '?'}: ${text}`)
  }

  function closeRecovery(r: Recovery) {
    const n = entrantById.get(r.entrant_id)?.competition_number ?? '?'
    // RCA control: DNF never closes an item. Needs positive accountability AND vehicle dealt with.
    if (!['RETURNED', 'ACCOUNTED_FOR'].includes(r.accountability_status)) {
      setMsg(`Cannot close #${n}: rider is not yet Returned / Accounted For.`); return
    }
    if (!['RECOVERED', 'RETURNED', 'NOT_REQUIRED'].includes(r.recovery_status)) {
      setMsg(`Cannot close #${n}: vehicle recovery is still ${label(r.recovery_status)}.`); return
    }
    if (!confirm(`Confirm #${n} is physically accounted for and close this item?`)) return
    updateRecovery(r, { recovery_status: 'CLOSED' }, 'closed - confirmed accounted for')
  }

  /* ---------- phase actions ---------- */

  function activatePhase(p: Phase) {
    if (!confirm(`Start phase "${p.name}"?${activePhase ? ` "${activePhase.name}" will be marked complete.` : ''}`)) return
    void run(async () => {
      const sb = getSupabase()
      const now = new Date().toISOString()
      if (activePhase && activePhase.id !== p.id) {
        check(await sb.from('event_phases').update({ status: 'COMPLETE', completed_at: now }).eq('id', activePhase.id))
      }
      check(await sb.from('event_phases').update({ status: 'ACTIVE', started_at: now, completed_at: null }).eq('id', p.id))
      await log('PHASE', `Phase started: ${p.name}`)
    }, `Active phase: ${p.name}`)
  }

  /* ---------- render ---------- */

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1 style={{ margin: 0 }}>Course control</h1>
        <span>
          <span className="pill">{activePhase?.name ?? 'No active phase'}</span>{' '}
          <span className={`pill ${recoveries.length ? 'bad' : 'ok'}`}>{recoveries.length} open recoveries</span>{' '}
          <a href="/course-track" target="_blank" rel="noreferrer">Course board ↗</a>
        </span>
      </div>

      {msg && <p className="bad-text">{msg}</p>}
      {okMsg && !msg && <p className="small">✓ {okMsg}</p>}
      {loading && <p className="muted small">Loading…</p>}

      {/* 1. UNITS */}
      <div className="card">
        <h2>1. Sweep riders &amp; course cars</h2>
        <div className="row">
          {units.map(u => {
            const sel = u.id === unitId
            return (
              <button
                key={u.id}
                className={sel ? 'primary' : ''}
                onClick={() => { setUnitId(u.id); setDestId(''); setArriveId('') }}
                style={{ textAlign: 'left', minWidth: 130 }}
              >
                <strong>{u.unit_type === 'SWEEP_RIDER' ? '🏍️' : '🚙'} {u.unit_code}</strong>
                <br /><span className="small">{positionText(positions.find(p => p.course_unit_id === u.id))}</span>
                <br /><span className="small">{label(u.status)}</span>
              </button>
            )
          })}
        </div>
        {!loading && units.length === 0 && <p className="muted">No course units set up for this event.</p>}

        {selectedUnit && (
          <div className="card" style={{ marginTop: 10 }}>
            <h2>{selectedUnit.display_name} · {positionText(selectedPos)}</h2>
            <div className="row">
              <label>Departed, heading to
                <select value={destId} onChange={e => setDestId(e.target.value)}>
                  <option value="">Select checkpoint</option>
                  {checkpoints.map(c => <option key={c.id} value={c.id}>{c.code}</option>)}
                </select>
              </label>
              <button className="primary" disabled={busy} onClick={depart}>Departed</button>
            </div>
            <div className="row">
              <label>Arrived at
                <select value={arriveId} onChange={e => setArriveId(e.target.value)}>
                  <option value="">
                    {selectedPos?.destination_checkpoint_id
                      ? `Destination (${cpById.get(selectedPos.destination_checkpoint_id)?.code})`
                      : 'Select checkpoint'}
                  </option>
                  {checkpoints.map(c => <option key={c.id} value={c.id}>{c.code}</option>)}
                </select>
              </label>
              <button className="primary" disabled={busy} onClick={arrive}>Arrived</button>
            </div>
            <div className="row">
              {['STANDBY', 'RECOVERING', 'RETURNING', 'UNAVAILABLE'].map(s => (
                <button key={s} disabled={busy} onClick={() => changeUnitStatus(s)}>{label(s)}</button>
              ))}
            </div>
            <p className="muted small">
              Arriving marks the sections travelled as {carMode ? 'Ready' : 'Swept'}. A section with an open recovery is marked Issue instead.
            </p>
          </div>
        )}
      </div>

      {/* 2. RECOVERIES */}
      <form className="card" onSubmit={addRecovery}>
        <h2>2. Report DNF / recovery</h2>
        <div className="row">
          <label>Comp #
            <input value={newNumber} onChange={e => setNewNumber(e.target.value)} placeholder="e.g. 47" />
          </label>
          <label>Location
            <select value={newCp} onChange={e => setNewCp(e.target.value)}>
              <option value="">Select</option>
              {checkpoints.map(c => <option key={c.id} value={c.id}>{c.code}</option>)}
            </select>
          </label>
          <label>Rider
            <select value={newAcc} onChange={e => setNewAcc(e.target.value)}>
              {ACCOUNTABILITY.map(a => <option key={a} value={a}>{label(a)}</option>)}
            </select>
          </label>
          <label>Priority
            <select value={newPriority} onChange={e => setNewPriority(e.target.value)}>
              {['NORMAL', 'HIGH', 'URGENT'].map(p => <option key={p} value={p}>{label(p)}</option>)}
            </select>
          </label>
          <label className="grow">Notes
            <input value={newNotes} onChange={e => setNewNotes(e.target.value)} placeholder="e.g. rider safe, bike remains" />
          </label>
        </div>
        <button className="primary" disabled={busy || !newNumber.trim() || !newCp}>Open recovery item</button>
      </form>

      <div className="card">
        <h2>Open recovery items</h2>
        {recoveries.length === 0 && <p className="muted">Nothing outstanding 🎉</p>}
        {recoveries.map(r => {
          const ent = entrantById.get(r.entrant_id)
          const idx = RECOVERY_STEPS.indexOf(r.recovery_status)
          const next = idx >= 0 && idx < RECOVERY_STEPS.length - 1 ? RECOVERY_STEPS[idx + 1] : null
          return (
            <div key={r.id} className="card" style={{ margin: '8px 0', borderLeft: `4px solid ${r.recovery_status === 'REQUIRED' ? '#dc2626' : '#d97706'}` }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span>
                  <strong>#{ent?.competition_number ?? '?'}</strong> {ent?.primary_name ?? ''}{' '}
                  <span className="pill">{label(ent?.entrant_type)}</span>{' '}
                  <span className="pill bad">{label(r.recovery_status)}</span>{' '}
                  {r.priority !== 'NORMAL' && <span className="pill warn">{label(r.priority)}</span>}
                </span>
                <span className="muted small">
                  {cpById.get(r.checkpoint_id ?? '')?.code ?? '?'} · open {ago(r.reported_at)}
                </span>
              </div>
              <div className="row">
                <label>Assigned unit
                  <select
                    value={r.assigned_unit_id ?? ''}
                    disabled={busy}
                    onChange={e => updateRecovery(
                      r,
                      {
                        assigned_unit_id: e.target.value || null,
                        ...(e.target.value && r.recovery_status === 'REQUIRED' ? { recovery_status: 'ASSIGNED' } : {}),
                      },
                      e.target.value ? `assigned to ${unitById.get(e.target.value)?.unit_code}` : 'unassigned',
                    )}
                  >
                    <option value="">Not assigned</option>
                    {units.map(u => <option key={u.id} value={u.id}>{u.unit_code}</option>)}
                  </select>
                </label>
                <label>Rider
                  <select
                    value={r.accountability_status}
                    disabled={busy}
                    onChange={e => updateRecovery(r, { accountability_status: e.target.value }, `rider ${label(e.target.value)}`)}
                  >
                    {ACCOUNTABILITY.map(a => <option key={a} value={a}>{label(a)}</option>)}
                  </select>
                </label>
                <label>Location
                  <select
                    value={r.checkpoint_id ?? ''}
                    disabled={busy}
                    onChange={e => updateRecovery(r, { checkpoint_id: e.target.value || null }, `moved to ${cpById.get(e.target.value)?.code}`)}
                  >
                    {checkpoints.map(c => <option key={c.id} value={c.id}>{c.code}</option>)}
                  </select>
                </label>
              </div>
              <div className="row">
                {next && (
                  <button className="primary" disabled={busy} onClick={() => updateRecovery(r, { recovery_status: next }, label(next))}>
                    → {label(next)}
                  </button>
                )}
                <button disabled={busy} onClick={() => updateRecovery(r, { recovery_status: 'NOT_REQUIRED' }, 'vehicle recovery not required')}>
                  No vehicle recovery
                </button>
                <button disabled={busy} onClick={() => closeRecovery(r)}>Close — accounted for</button>
              </div>
            </div>
          )
        })}
        <p className="muted small">
          Closing needs the rider Returned / Accounted For and the vehicle Recovered, Returned or Not Required.
        </p>
      </div>

      {/* 3. SECTIONS */}
      <div className="card">
        <h2>3. Course sections ({carMode ? 'car readiness' : 'bike sweep'})</h2>
        {sections.map(s => {
          const status = carMode ? s.car_readiness_status : s.bike_sweep_status
          const options = carMode ? ['PENDING', 'CHECKING', 'READY', 'ISSUE'] : ['PENDING', 'IN_PROGRESS', 'COMPLETE', 'ISSUE']
          return (
            <div key={s.id} className="row" style={{ borderTop: '1px solid #eee', padding: '6px 0' }}>
              <strong style={{ minWidth: 110 }}>
                {cpById.get(s.from_checkpoint_id)?.code} → {cpById.get(s.to_checkpoint_id)?.code}
              </strong>
              <span className={`pill ${pillClass(status)}`}>{label(status)}</span>
              {options.filter(o => o !== status).map(o => (
                <button key={o} disabled={busy} onClick={() => setSection(s, o)}>{label(o)}</button>
              ))}
            </div>
          )
        })}
      </div>

      {/* 4. PHASES */}
      <div className="card">
        <h2>4. Event phase</h2>
        <div className="row">
          {phases.map(p => (
            <button
              key={p.id}
              className={p.status === 'ACTIVE' ? 'primary' : ''}
              disabled={busy || p.status === 'ACTIVE'}
              onClick={() => activatePhase(p)}
            >
              {p.name} · {label(p.status)}
            </button>
          ))}
        </div>
        <p className="muted small">Starting a phase marks the current active phase complete.</p>
      </div>
    </>
  )
}

// END OF FILE
