'use client'
import { useEffect, useMemo, useState } from 'react'
import { Shell } from '@/components/Shell'
import { useApp } from '@/components/AppProvider'
import { getSupabase } from '@/lib/supabase'
import { useEventData } from '@/lib/useEventData'
import { computeReport, toCsv } from '@/lib/logic'
import { downloadText } from '@/lib/download'
import type { Entrant, EntrantType } from '@/lib/types'

const people = (e: Entrant) => [e.primary_name, e.secondary_name].filter(Boolean).join(' / ')

function List({ title, hint, rows, filename, extra, action }: {
  title: string; hint?: string; rows: Entrant[]; filename: string
  extra?: { head: string; cell: (e: Entrant) => React.ReactNode }
  action?: { label: string; run: (e: Entrant) => void }
}) {
  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>{title} <span className={`pill ${rows.length ? 'warn' : 'ok'}`}>{rows.length}</span></h2>
        <button disabled={!rows.length} onClick={() => downloadText(filename, toCsv([
          ['Number', 'Name', 'Class', 'Vehicle', 'Rego'],
          ...rows.map(e => [e.competition_number, people(e), e.class_name, e.vehicle_description, e.registration_number]),
        ]))}>Export CSV</button>
      </div>
      {hint && <p className="muted small">{hint}</p>}
      {rows.length === 0 ? <p className="muted">None 🎉</p> : (
        <div className="tablewrap">
          <table>
            <thead><tr><th>No.</th><th>Name</th><th>Class</th><th>Vehicle</th>{extra && <th>{extra.head}</th>}{action && <th />}</tr></thead>
            <tbody>
              {rows.map(e => (
                <tr key={e.id}>
                  <td className="num">{e.competition_number}</td><td>{people(e)}</td><td>{e.class_name}</td>
                  <td>{e.vehicle_description}{e.registration_number && <span className="muted small"> · {e.registration_number}</span>}</td>
                  {extra && <td>{extra.cell(e)}</td>}
                  {action && <td><button onClick={() => action.run(e)}>{action.label}</button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Content() {
  const { event, canManage, canRecord } = useApp()
  const { data, state, error, reload } = useEventData(event?.id ?? null)
  const [type, setType] = useState<EntrantType>('bike')
  const [stageId, setStageId] = useState('')
  const [msg, setMsg] = useState('')
  const [updated, setUpdated] = useState<Date | null>(null)

  useEffect(() => { const t = setInterval(() => { void reload() }, 20000); return () => clearInterval(t) }, [reload])
  useEffect(() => { if (state === 'ready') setUpdated(new Date()) }, [data, state])

  const stages = useMemo(() => data.stages.filter(s => s.enabled), [data.stages])
  const stage = stages.find(s => s.id === stageId) ?? stages[0]

  const rep = useMemo(() => stage ? computeReport({
    entrants: data.entrants, type, stageId: stage.id, briefing: data.briefing, scans: data.scans, results: data.results,
  }) : null, [data, type, stage])

  async function markDnf(e: Entrant) {
    if (!stage) return
    const reason = prompt(`Mark #${e.competition_number} ${e.primary_name} as DNF for ${stage.name}. Reason (optional):`)
    if (reason === null) return
    const { error: err } = await getSupabase().from('stage_results').insert({
      event_id: event!.id, entrant_id: e.id, stage_id: stage.id, status: 'dnf', reason: reason.trim() || null,
    })
    if (err) setMsg(err.message); else { setMsg(''); void reload() }
  }

  async function reinstate(e: Entrant) {
    if (!stage || !confirm(`Remove DNF for #${e.competition_number} ${e.primary_name}?`)) return
    const { data: gone, error: err } = await getSupabase().from('stage_results').delete()
      .eq('event_id', event!.id).eq('entrant_id', e.id).eq('stage_id', stage.id).select('id')
    if (err || !gone?.length) setMsg(err?.message ?? 'Could not remove (no permission?)'); else { setMsg(''); void reload() }
  }

  const pct = (n: number) => (rep && rep.total ? Math.round((n / rep.total) * 100) : 0)

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1>Reports</h1>
        <span className="muted small">{updated ? `Updated ${updated.toLocaleTimeString()}` : ''} · <button className="link" onClick={() => reload()}>Refresh</button></span>
      </div>
      {state === 'cached' && <div className="banner warn">Offline — showing the last saved data.</div>}
      {state === 'error' && <div className="banner bad">{error}</div>}
      <div className="card row">
        <div className="seg">{(['bike', 'car'] as const).map(t => <button key={t} className={type === t ? 'on' : ''} onClick={() => setType(t)}>{t.toUpperCase()}</button>)}</div>
        <div className="seg">{stages.map(s => <button key={s.id} className={stage?.id === s.id ? 'on' : ''} onClick={() => setStageId(s.id)}>{s.name}</button>)}</div>
      </div>
      {msg && <p className="bad-text">{msg}</p>}

      {!rep ? <p className="muted">No stages enabled.</p> : (
        <>
          <div className="stats">
            <div className="stat"><b>{rep.briefing.attended.length}/{rep.total}</b><span>briefed ({pct(rep.briefing.attended.length)}%)</span></div>
            <div className="stat"><b>{rep.start.done.length}</b><span>started {stage!.name}</span></div>
            <div className="stat"><b>{rep.finish.onCourse.length}</b><span>on course</span></div>
            <div className="stat"><b>{rep.finish.done.length}</b><span>finished</span></div>
            <div className="stat"><b>{rep.dnf.length}</b><span>DNF</span></div>
          </div>

          <List title="Missing — on course (started, not finished)" hint="Started this stage, no finish scan and not DNF. Chase these first."
            rows={rep.finish.onCourse} filename={`${type}-${stage!.name}-on-course.csv`}
            extra={{ head: 'Started', cell: e => { const s = data.scans.find(x => x.entrant_id === e.id && x.stage_id === stage!.id && x.point === 'start'); return s ? new Date(s.scanned_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '' } }}
            action={canRecord ? { label: 'Mark DNF', run: markDnf } : undefined} />

          <List title="Missing — not started" hint="Active entrants with no start scan (and no finish or DNF) for this stage."
            rows={rep.start.missing} filename={`${type}-${stage!.name}-not-started.csv`}
            action={canRecord ? { label: 'Mark DNF', run: markDnf } : undefined} />

          <List title="Missing — not at briefing" hint="Briefing applies to the whole event, not one stage."
            rows={rep.briefing.missing} filename={`${type}-briefing-missing.csv`} />

          <div className="card">
            <h2>DNF — {stage!.name} <span className="pill bad">{rep.dnf.length}</span></h2>
            {rep.dnf.length === 0 ? <p className="muted">None.</p> : (
              <div className="tablewrap"><table>
                <thead><tr><th>No.</th><th>Name</th><th>Reason</th><th>Time</th>{canManage && <th />}</tr></thead>
                <tbody>{rep.dnf.map(d => (
                  <tr key={d.entrant.id}>
                    <td className="num">{d.entrant.competition_number}</td><td>{people(d.entrant)}</td><td>{d.reason}</td>
                    <td className="muted">{new Date(d.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                    {canManage && <td><button onClick={() => reinstate(d.entrant)}>Remove DNF</button></td>}
                  </tr>))}
                </tbody></table></div>
            )}
          </div>
        </>
      )}
    </>
  )
}

export default function Page() { return <Shell needEvent><Content /></Shell> }
