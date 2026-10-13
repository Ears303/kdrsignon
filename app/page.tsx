'use client'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { Shell } from '@/components/Shell'
import { useApp } from '@/components/AppProvider'
import { getSupabase } from '@/lib/supabase'
import type { Entrant, Stage } from '@/lib/types'

function Content() {
  const app = useApp()
  const { event } = app
  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const [stages, setStages] = useState<Stage[]>([])
  const [counts, setCounts] = useState({ bike: 0, car: 0 })
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    if (!event) return
    const sb = getSupabase()
    const [s, e] = await Promise.all([
      sb.from('stages').select('*').eq('event_id', event.id).order('sequence_number'),
      sb.from('entrants').select('entrant_type').eq('event_id', event.id).eq('status', 'active').limit(5000),
    ])
    setStages((s.data ?? []) as Stage[])
    const rows = (e.data ?? []) as Pick<Entrant, 'entrant_type'>[]
    setCounts({ bike: rows.filter(r => r.entrant_type === 'bike').length, car: rows.filter(r => r.entrant_type === 'car').length })
  }, [event])
  useEffect(() => { void load() }, [load])

  async function create(e: React.FormEvent) {
    e.preventDefault()
    setMsg('')
    const { data, error } = await getSupabase().from('events')
      .insert({ name: name.trim(), event_date: date || null, status: 'active' }).select('id').single()
    if (error) { setMsg(error.message); return }
    setName(''); setDate('')
    await app.refreshEvents()
    app.setEventId(data.id)
  }

  async function toggleStage(s: Stage) {
    const { error } = await getSupabase().from('stages').update({ enabled: !s.enabled }).eq('id', s.id)
    if (error) setMsg(error.message); else void load()
  }

  return (
    <>
      <div className="card">
        <h1>Event</h1>
        {app.events.length > 0 ? (
          <label>Current event
            <select value={event?.id ?? ''} onChange={e => app.setEventId(e.target.value)}>
              {app.events.map(ev => <option key={ev.id} value={ev.id}>{ev.name}{ev.event_date ? ` · ${ev.event_date}` : ''}</option>)}
            </select>
          </label>
        ) : <p className="muted">No events yet.</p>}
      </div>

      {event && (
        <>
          <div className="stats">
            <div className="stat"><b>{counts.bike}</b><span>active bike entrants</span></div>
            <div className="stat"><b>{counts.car}</b><span>active car entrants</span></div>
          </div>
          {counts.bike + counts.car === 0 && (
            <div className="card warn">No entrants yet. {app.canManage ? <>Import them on the <Link href="/entrants">Entrants</Link> page.</> : 'Ask control to import them.'}</div>
          )}
          <div className="card">
            <h2>Stages</h2>
            <p className="muted small">Disabled stages are hidden from the scan station and reports.</p>
            <div className="row">
              {stages.map(s => (
                <button key={s.id} className={s.enabled ? 'primary' : ''} disabled={!app.canManage} onClick={() => toggleStage(s)}>
                  {s.name}{s.enabled ? '' : ' (off)'}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {app.canManage && (
        <form className="card" onSubmit={create}>
          <h2>New event</h2>
          <div className="row">
            <label className="grow">Name<input value={name} onChange={e => setName(e.target.value)} required placeholder="KDR 2026" /></label>
            <label>Date<input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
          </div>
          <button className="primary">Create event</button>
          <p className="muted small">Prologue, Lap 1, Lap 2 and Lap 3 are created automatically.</p>
        </form>
      )}
      {msg && <p className="bad-text">{msg}</p>}
    </>
  )
}

export default function Page() { return <Shell><Content /></Shell> }
