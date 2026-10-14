'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Shell } from '@/components/Shell'
import { useApp } from '@/components/AppProvider'
import { fetchAll, getSupabase } from '@/lib/supabase'
import { byNumber, toCsv } from '@/lib/logic'
import { downloadText } from '@/lib/download'
import type { Entrant, Injury, Stage } from '@/lib/types'

const fmt = (iso: string) => new Date(iso).toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
// <input type="datetime-local"> wants local time as YYYY-MM-DDTHH:mm
const localNow = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16) }
const people = (e: Entrant) => [e.primary_name, e.secondary_name].filter(Boolean).join(' / ')

function Content() {
  const { event, canMedical } = useApp()
  const [bikes, setBikes] = useState<Entrant[]>([])
  const [stages, setStages] = useState<Stage[]>([])
  const [injuries, setInjuries] = useState<Injury[]>([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')

  // form
  const [number, setNumber] = useState('')
  const [stageId, setStageId] = useState('')
  const [when, setWhen] = useState(localNow())
  const [description, setDescription] = useState('')
  const [outcome, setOutcome] = useState('')
  const [suspend, setSuspend] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!event) return
    setLoading(true)
    try {
      const sb = getSupabase()
      const [entrants, st, inj] = await Promise.all([
        fetchAll<Entrant>('entrants', event.id),
        sb.from('stages').select('*').eq('event_id', event.id).order('sequence_number'),
        fetchAll<Injury>('injuries', event.id, '*', 'occurred_at'),
      ])
      if (st.error) throw st.error
      setBikes(entrants.filter(e => e.entrant_type === 'bike').sort(byNumber))
      setStages((st.data ?? []) as Stage[])
      setInjuries(inj.sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at)))
    } catch (e) { setMsg((e as Error).message) }
    setLoading(false)
  }, [event])
  useEffect(() => { if (canMedical) void load() }, [load, canMedical])

  const byId = useMemo(() => new Map(bikes.map(b => [b.id, b])), [bikes])
  const stageName = useMemo(() => new Map(stages.map(s => [s.id, s.name])), [stages])
  const picked = useMemo(() => bikes.find(b => b.competition_number.toLowerCase() === number.trim().toLowerCase()), [bikes, number])
  const suspended = useMemo(() => bikes.filter(b => b.status === 'medical_suspended'), [bikes])
  const canSuspendPicked = picked && (picked.status === 'active' || picked.status === 'medical_suspended')

  if (!canMedical) {
    return <div className="card warn"><h2>Medical staff only</h2><p>Your login doesn’t have access to injury records. Ask an admin for the medical role.</p></div>
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!event || !picked) return
    setBusy(true); setMsg('')
    const sb = getSupabase()
    const { error } = await sb.from('injuries').insert({
      event_id: event.id, entrant_id: picked.id, stage_id: stageId || null,
      occurred_at: new Date(when).toISOString(), description: description.trim(),
      outcome: outcome.trim() || null, suspended: suspend,
    })
    if (error) { setBusy(false); setMsg(`Not saved: ${error.message}`); return }
    if (suspend) {
      const { error: rpcErr } = await sb.rpc('set_medical_suspension', { p_entrant: picked.id, p_suspend: true, p_note: note.trim() || null })
      if (rpcErr) {
        setBusy(false)
        setMsg(`Injury saved, but the suspension FAILED: ${rpcErr.message}. Use “Suspend” again from the log or tell Control.`)
        void load(); return
      }
    }
    setBusy(false)
    setNumber(''); setStageId(''); setDescription(''); setOutcome(''); setSuspend(false); setNote(''); setWhen(localNow())
    setMsg(suspend ? `Saved. #${picked.competition_number} is now suspended and blocked from scanning.` : 'Injury saved.')
    void load()
  }

  async function reinstate(b: Entrant) {
    if (!confirm(`Reinstate #${b.competition_number} ${b.primary_name}? They will be able to scan again.`)) return
    const { error } = await getSupabase().rpc('set_medical_suspension', { p_entrant: b.id, p_suspend: false, p_note: null })
    if (error) setMsg(error.message); else { setMsg(`#${b.competition_number} reinstated.`); void load() }
  }

  async function editNote(b: Entrant) {
    const n = prompt(`Note shown to ALL staff next to #${b.competition_number} (no medical details):`, b.status_note ?? '')
    if (n === null) return
    const { error } = await getSupabase().rpc('set_medical_suspension', { p_entrant: b.id, p_suspend: true, p_note: n })
    if (error) setMsg(error.message); else void load()
  }

  async function suspendFromLog(inj: Injury) {
    const b = byId.get(inj.entrant_id)
    if (!b) return
    const n = prompt(`Suspend #${b.competition_number} ${b.primary_name}? They'll be blocked from scanning.\nNote shown to ALL staff (no medical details):`, 'See Control')
    if (n === null) return
    const sb = getSupabase()
    const { error } = await sb.rpc('set_medical_suspension', { p_entrant: b.id, p_suspend: true, p_note: n })
    if (error) { setMsg(error.message); return }
    await sb.from('injuries').update({ suspended: true }).eq('id', inj.id)
    void load()
  }

  async function editOutcome(inj: Injury) {
    const o = prompt('Outcome / follow-up:', inj.outcome ?? '')
    if (o === null) return
    const { error } = await getSupabase().from('injuries').update({ outcome: o.trim() || null }).eq('id', inj.id)
    if (error) setMsg(error.message); else void load()
  }

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1>Medical</h1>
        <button className="link" onClick={() => load()}>{loading ? 'Loading…' : 'Refresh'}</button>
      </div>
      <p className="muted small">Injury details here are visible only to medical and admin logins. Everyone else only sees that a bike is suspended, plus the short note you choose to show.</p>
      {msg && <div className={`banner ${/fail|not saved|error|only/i.test(msg) ? 'bad' : 'ok'}`}>{msg}</div>}

      <form className="card" onSubmit={save}>
        <h2>Record an injury (bikes)</h2>
        <div className="row">
          <label>Bike number
            <input list="bikes" value={number} onChange={e => setNumber(e.target.value)} required style={{ width: 130 }} autoComplete="off" />
            <datalist id="bikes">{bikes.map(b => <option key={b.id} value={b.competition_number}>{people(b)}</option>)}</datalist>
          </label>
          <label>When<input type="datetime-local" value={when} onChange={e => setWhen(e.target.value)} required /></label>
          <label>Stage
            <select value={stageId} onChange={e => setStageId(e.target.value)}>
              <option value="">(not on a stage / unknown)</option>
              {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
        </div>
        {number.trim() && (picked
          ? <p><b>#{picked.competition_number} {people(picked)}</b> <span className="muted">· {picked.class_name ?? ''} {picked.vehicle_description ?? ''}</span>{' '}
              {picked.status !== 'active' && <span className={`pill ${picked.status === 'medical_suspended' ? 'bad' : 'warn'}`}>{picked.status.replace('_', ' ')}</span>}</p>
          : <p className="bad-text">No bike with number “{number}”.</p>)}
        <label>What happened / injury<textarea value={description} onChange={e => setDescription(e.target.value)} required style={{ fontFamily: 'inherit', fontSize: '1rem' }} /></label>
        <label>Outcome / treatment (optional)<input value={outcome} onChange={e => setOutcome(e.target.value)} placeholder="e.g. treated on scene, transported to hospital" /></label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--ink)', fontSize: '1rem' }}>
          <input type="checkbox" checked={suspend} onChange={e => setSuspend(e.target.checked)} disabled={!canSuspendPicked} style={{ width: 'auto', margin: 0 }} />
          <b>Medically suspend this rider</b><span className="muted small">— blocks them at every scan station</span>
        </label>
        {picked && !canSuspendPicked && <p className="muted small">Can’t suspend a {picked.status.replace('_', ' ')} entrant.</p>}
        {suspend && (
          <label>Note shown to ALL staff (no medical details)
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="See Control" />
          </label>
        )}
        <button className="primary" disabled={busy || !picked}>{busy ? 'Saving…' : suspend ? 'Save injury & suspend' : 'Save injury'}</button>
      </form>

      <div className="card">
        <h2>Currently suspended <span className={`pill ${suspended.length ? 'bad' : 'ok'}`}>{suspended.length}</span></h2>
        {suspended.length === 0 ? <p className="muted">No bikes are suspended.</p> : (
          <div className="tablewrap"><table>
            <thead><tr><th>No.</th><th>Name</th><th>Note (all staff)</th><th /></tr></thead>
            <tbody>{suspended.map(b => (
              <tr key={b.id}>
                <td className="num">{b.competition_number}</td><td>{people(b)}</td><td>{b.status_note}</td>
                <td className="row"><button onClick={() => editNote(b)}>Edit note</button><button className="primary" onClick={() => reinstate(b)}>Reinstate</button></td>
              </tr>))}
            </tbody></table></div>
        )}
      </div>

      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>Injury log <span className="pill">{injuries.length}</span></h2>
          <button disabled={!injuries.length} onClick={() => downloadText('injury-log.csv', toCsv([
            ['Time', 'Number', 'Name', 'Stage', 'Injury', 'Outcome', 'Suspended'],
            ...injuries.map(i => { const b = byId.get(i.entrant_id); return [fmt(i.occurred_at), b?.competition_number, b && people(b), i.stage_id ? stageName.get(i.stage_id) : '', i.description, i.outcome, i.suspended ? 'yes' : ''] }),
          ]))}>Export CSV</button>
        </div>
        {injuries.length === 0 ? <p className="muted">No injuries recorded.</p> : (
          <div className="tablewrap"><table>
            <thead><tr><th>When</th><th>No.</th><th>Rider</th><th>Stage</th><th>Injury</th><th>Outcome</th><th /></tr></thead>
            <tbody>{injuries.map(i => {
              const b = byId.get(i.entrant_id)
              return (
                <tr key={i.id}>
                  <td className="muted">{fmt(i.occurred_at)}</td>
                  <td className="num">{b?.competition_number}</td><td>{b && people(b)}</td>
                  <td>{i.stage_id ? stageName.get(i.stage_id) : ''}</td>
                  <td style={{ minWidth: 180 }}>{i.description}</td>
                  <td>{i.outcome}{i.suspended && <div><span className="pill bad">led to suspension</span></div>}</td>
                  <td className="row">
                    <button onClick={() => editOutcome(i)}>Edit outcome</button>
                    {b && b.status === 'active' && <button className="danger" onClick={() => suspendFromLog(i)}>Suspend</button>}
                  </td>
                </tr>)
            })}</tbody></table></div>
        )}
      </div>
    </>
  )
}

export default function Page() { return <Shell needEvent><Content /></Shell> }
