'use client'
// FILE LOCATION IN GITHUB: app/medical/board/page.tsx  (opens at /medical/board)
// Medical team view: shows ONLY riders/drivers with Rider status = Medical.
// Read-only. Uses the app's login + selected event. Refreshes every 10 seconds.

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { Shell } from '@/components/Shell'
import { useApp } from '@/components/AppProvider'
import { getSupabase } from '@/lib/supabase'

const REFRESH_SECONDS = 10

interface Checkpoint { id: string; code: string; name: string; sequence_no: number }
interface Unit { id: string; unit_code: string; unit_type: string }
interface Entrant {
  id: string
  entrant_type: string | null
  competition_number: string | null
  primary_name: string | null
  secondary_name: string | null
  class_name: string | null
}
interface Medical {
  id: string
  entrant_id: string
  checkpoint_id: string | null
  location_notes: string | null
  recovery_status: string
  assigned_unit_id: string | null
  priority: string
  reported_at: string
  notes: string | null
  updated_at: string
}

const PRIORITY_ORDER: Record<string, number> = { URGENT: 0, HIGH: 1, NORMAL: 2 }
const PRIORITY_COLOUR: Record<string, string> = { URGENT: '#b91c1c', HIGH: '#dc2626', NORMAL: '#ea580c' }

const label = (v: string | null | undefined) =>
  !v ? 'Unknown' : v.toLowerCase().split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')

const ago = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min`
  return `${Math.floor(m / 60)} h ${m % 60} min`
}

const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })

function Content() {
  const { event } = useApp()
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [medicals, setMedicals] = useState<Medical[]>([])
  const [entrants, setEntrants] = useState<Entrant[]>([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')
  const [updated, setUpdated] = useState<Date | null>(null)

  const load = useCallback(async (silent = false) => {
    if (!event) return
    if (!silent) setLoading(true)
    try {
      const sb = getSupabase()
      const [cps, uns, meds] = await Promise.all([
        sb.from('course_checkpoints').select('id,code,name,sequence_no').eq('event_id', event.id).eq('active', true).order('sequence_no'),
        sb.from('course_units').select('id,unit_code,unit_type').eq('event_id', event.id),
        sb.from('course_recoveries')
          .select('id,entrant_id,checkpoint_id,location_notes,recovery_status,assigned_unit_id,priority,reported_at,notes,updated_at')
          .eq('event_id', event.id)
          .eq('accountability_status', 'MEDICAL')
          .neq('recovery_status', 'CLOSED'),
      ])
      const err = cps.error || uns.error || meds.error
      if (err) throw err
      const list = (meds.data ?? []) as Medical[]

      let ents: Entrant[] = []
      if (list.length) {
        const e = await sb.from('entrants')
          .select('id,entrant_type,competition_number,primary_name,secondary_name,class_name')
          .in('id', list.map(m => m.entrant_id))
        if (e.error) throw e.error
        ents = (e.data ?? []) as Entrant[]
      }

      setCheckpoints((cps.data ?? []) as Checkpoint[])
      setUnits((uns.data ?? []) as Unit[])
      setMedicals(list)
      setEntrants(ents)
      setUpdated(new Date())
      setMsg('')
    } catch (err) {
      setMsg((err as Error).message)
    }
    setLoading(false)
  }, [event])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    const t = setInterval(() => { void load(true) }, REFRESH_SECONDS * 1000)
    return () => clearInterval(t)
  }, [load])

  const cpIndex = useMemo(() => new Map(checkpoints.map((c, i) => [c.id, i])), [checkpoints])
  const cpById = useMemo(() => new Map(checkpoints.map(c => [c.id, c])), [checkpoints])
  const unitById = useMemo(() => new Map(units.map(u => [u.id, u])), [units])
  const entById = useMemo(() => new Map(entrants.map(e => [e.id, e])), [entrants])

  // most urgent first, then longest waiting
  const sorted = useMemo(() => [...medicals].sort((a, b) =>
    (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9) ||
    new Date(a.reported_at).getTime() - new Date(b.reported_at).getTime()
  ), [medicals])

  const lastIndex = Math.max(checkpoints.length - 1, 1)
  const pct = (i: number) => (i / lastIndex) * 100

  // how many medicals at each checkpoint (to stack markers)
  const stackCount = new Map<string, number>()

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1 style={{ margin: 0 }}>🩺 Medical board</h1>
        <span>
          <span className={`pill ${medicals.length ? 'bad' : 'ok'}`}>
            {medicals.length} active medical{medicals.length === 1 ? '' : 's'}
          </span>{' '}
          <span className="muted small">
            {updated ? `Updated ${updated.toLocaleTimeString('en-AU')}` : ''} · every {REFRESH_SECONDS}s
          </span>{' '}
          <button onClick={() => void load()}>Refresh</button>
        </span>
      </div>

      {msg && <p className="bad-text">{msg}</p>}
      {loading && <p className="muted small">Loading…</p>}

      {/* ===== COURSE MAP ===== */}
      <div className="card">
        <h2>Where</h2>
        {checkpoints.length < 2 ? (
          <p className="muted">No course checkpoints set up for this event.</p>
        ) : (
          <div style={st.scroll}>
            <div style={st.track}>
              <div style={st.inner}>
                <div style={st.line} />
                {checkpoints.map((c, i) => {
                  const hasMedical = medicals.some(m => m.checkpoint_id === c.id)
                  return (
                    <div key={c.id} style={{ ...st.cp, left: `${pct(i)}%` }}>
                      <div style={{ ...st.dot, background: hasMedical ? '#dc2626' : '#94a3b8' }} />
                      <strong style={{ fontSize: 11 }}>{c.code}</strong>
                    </div>
                  )
                })}

                {sorted.map(m => {
                  const idx = m.checkpoint_id ? cpIndex.get(m.checkpoint_id) : undefined
                  const key = m.checkpoint_id ?? 'none'
                  const stack = stackCount.get(key) ?? 0
                  stackCount.set(key, stack + 1)
                  const ent = entById.get(m.entrant_id)
                  const colour = PRIORITY_COLOUR[m.priority] ?? '#dc2626'
                  return (
                    <div
                      key={m.id}
                      style={{ ...st.marker, left: `${pct(idx ?? 0)}%`, top: 150 + stack * 64, borderColor: colour }}
                    >
                      <div style={{ ...st.cross, background: colour }}>+</div>
                      <div>
                        <strong>#{ent?.competition_number ?? '?'}</strong>
                        <div style={{ fontSize: 10, color: colour, fontWeight: 800 }}>
                          {label(m.priority)} · {ago(m.reported_at)}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ===== DETAIL CARDS ===== */}
      <div className="card">
        <h2>What</h2>
        {!loading && sorted.length === 0 && <p className="muted">No active medicals 🎉</p>}

        {sorted.map(m => {
          const ent = entById.get(m.entrant_id)
          const cp = m.checkpoint_id ? cpById.get(m.checkpoint_id) : undefined
          const unit = m.assigned_unit_id ? unitById.get(m.assigned_unit_id) : undefined
          const colour = PRIORITY_COLOUR[m.priority] ?? '#dc2626'
          return (
            <div key={m.id} className="card" style={{ margin: '8px 0', borderLeft: `6px solid ${colour}` }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span style={{ fontSize: 20 }}>
                  <strong>#{ent?.competition_number ?? '?'}</strong> {ent?.primary_name ?? 'Unknown'}
                  {ent?.secondary_name ? <span className="muted small"> / {ent.secondary_name}</span> : null}
                </span>
                <span>
                  <span className="pill bad">{label(m.priority)}</span>{' '}
                  <span className="pill">{label(ent?.entrant_type)}</span>
                </span>
              </div>

              <p style={{ fontSize: 18, margin: '8px 0' }}>
                📍 <strong>{cp ? `${cp.code} – ${cp.name}` : 'Location unknown'}</strong>
                {m.location_notes ? ` · ${m.location_notes}` : ''}
              </p>

              {m.notes && <p style={{ whiteSpace: 'pre-wrap', margin: '6px 0' }}>📝 {m.notes}</p>}

              <p className="muted small" style={{ margin: 0 }}>
                Reported {clock(m.reported_at)} · waiting {ago(m.reported_at)}
                {ent?.class_name ? ` · Class ${ent.class_name}` : ''}
                {' · '}{unit ? `Unit assigned: ${unit.unit_code}` : 'No unit assigned'}
                {' · '}Recovery: {label(m.recovery_status)}
              </p>
            </div>
          )
        })}
      </div>

      <p className="muted small">
        Shows items where Rider status is set to <strong>Medical</strong> in course control. When the rider is changed to
        Returned / Accounted For, they drop off this board.
      </p>
    </>
  )
}

const st: Record<string, CSSProperties> = {
  scroll: { overflowX: 'auto' },
  track: { position: 'relative', minWidth: 1200, height: 360 },
  inner: { position: 'absolute', left: 50, right: 50, top: 0, bottom: 0 },
  line: { position: 'absolute', left: 0, right: 0, top: 68, height: 6, borderRadius: 6, background: '#cbd5e1' },
  cp: { position: 'absolute', top: 58, width: 60, marginLeft: -30, textAlign: 'center', zIndex: 2 },
  dot: { width: 22, height: 22, margin: '0 auto 4px', border: '4px solid #fff', borderRadius: '50%', boxShadow: '0 0 0 2px #475569' },
  marker: {
    position: 'absolute', transform: 'translateX(-50%)', display: 'flex', gap: 8, alignItems: 'center',
    minWidth: 120, padding: 8, background: '#fff', border: '2px solid', borderRadius: 10,
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 3,
  },
  cross: {
    display: 'grid', placeItems: 'center', width: 28, height: 28, flexShrink: 0,
    borderRadius: 6, color: '#fff', fontWeight: 900, fontSize: 20,
  },
}

export default function Page() { return <Shell needEvent><Content /></Shell> }
// END OF FILE
