'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Shell } from '@/components/Shell'
import { useApp } from '@/components/AppProvider'
import { fetchAll, getSupabase } from '@/lib/supabase'
import { byNumber, CSV_TEMPLATE, csvToEntrants, defaultScanCode, normalizeCode, parseCsv, type ImportResult } from '@/lib/logic'
import { downloadText } from '@/lib/download'
import type { Entrant, EntrantStatus, EntrantType } from '@/lib/types'

function Content() {
  const { event, canManage } = useApp()
  const [entrants, setEntrants] = useState<Entrant[]>([])
  const [loading, setLoading] = useState(true)
  const [type, setType] = useState<EntrantType | 'all'>('all')
  const [q, setQ] = useState('')
  const [statusFilter, setStatusFilter] = useState<EntrantStatus | 'all'>('all')
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    if (!event) return
    setLoading(true)
    try { setEntrants(await fetchAll<Entrant>('entrants', event.id)) } catch (e) { setMsg((e as Error).message) }
    setLoading(false)
  }, [event])
  useEffect(() => { void load() }, [load])

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    return entrants
      .filter(e => (type === 'all' || e.entrant_type === type))
      .filter(e => statusFilter === 'all' || e.status === statusFilter)
      .filter(e => !s || [e.competition_number, e.primary_name, e.secondary_name, e.class_name, e.vehicle_description, e.registration_number, e.scan_code]
        .some(v => v?.toLowerCase().includes(s)))
      .sort((a, b) => a.entrant_type.localeCompare(b.entrant_type) || byNumber(a, b))
  }, [entrants, type, q, statusFilter])

  async function setStatus(e: Entrant, status: EntrantStatus) {
    const { error } = await getSupabase().from('entrants').update({ status, status_note: null }).eq('id', e.id)
    if (error) setMsg(error.message)
    else setEntrants(list => list.map(x => (x.id === e.id ? { ...x, status, status_note: null } : x)))
  }

  async function remove(e: Entrant) {
    if (!confirm(`Delete #${e.competition_number} ${e.primary_name}? This also deletes all of their scans.`)) return
    const { error } = await getSupabase().from('entrants').delete().eq('id', e.id)
    if (error) setMsg(error.message)
    else setEntrants(list => list.filter(x => x.id !== e.id))
  }

  return (
    <>
      <h1>Entrants</h1>
      {canManage && event && <Import eventId={event.id} onDone={load} />}
      {canManage && event && <AddOne eventId={event.id} onDone={load} />}
      <div className="card">
        <div className="row">
          <div className="seg">
            {(['all', 'bike', 'car'] as const).map(t => (
              <button key={t} className={type === t ? 'on' : ''} onClick={() => setType(t)}>{t.toUpperCase()}</button>
            ))}
          </div>
          <input className="grow" placeholder="Search number, name, class, rego…" value={q} onChange={e => setQ(e.target.value)} />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as EntrantStatus | 'all')} style={{ width: 'auto', margin: 0 }}>
            <option value="all">All statuses</option><option value="active">Active</option>
            <option value="medical_suspended">Medical suspended</option><option value="withdrawn">Withdrawn</option><option value="dns">DNS</option>
          </select>
        </div>
        <p className="muted small">{loading ? 'Loading…' : `${shown.length} of ${entrants.length}`}</p>
        {msg && <p className="bad-text">{msg}</p>}
        <div className="tablewrap">
          <table>
            <thead><tr><th>Type</th><th>No.</th><th>Name</th><th>Class</th><th>Vehicle</th><th>Scan code</th><th>Status</th>{canManage && <th />}</tr></thead>
            <tbody>
              {shown.map(e => (
                <tr key={e.id}>
                  <td>{e.entrant_type}</td>
                  <td className="num">{e.competition_number}</td>
                  <td>{e.primary_name}{e.secondary_name && <div className="muted small">{e.secondary_name}</div>}</td>
                  <td>{e.class_name}</td>
                  <td>{e.vehicle_description}{e.registration_number && <div className="muted small">{e.registration_number}</div>}</td>
                  <td><code>{e.scan_code}</code></td>
                  <td>
                    {canManage && e.status !== 'medical_suspended' ? (
                      <select value={e.status} onChange={ev => setStatus(e, ev.target.value as EntrantStatus)} style={{ width: 'auto', margin: 0, padding: '4px 6px' }}>
                        <option value="active">active</option><option value="withdrawn">withdrawn</option><option value="dns">DNS</option>
                      </select>
                    ) : <span className={`pill ${e.status === 'active' ? 'ok' : e.status === 'medical_suspended' ? 'bad' : 'warn'}`}>{e.status.replace('_', ' ')}</span>}
                    {e.status === 'medical_suspended' && <div className="small bad-text"><b>SUSPENDED</b>{e.status_note ? ` — ${e.status_note}` : ''}<br />Managed by medical</div>}
                  </td>
                  {canManage && <td><button className="danger" onClick={() => remove(e)}>Delete</button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

function Import({ eventId, onDone }: { eventId: string; onDone: () => void }) {
  const [text, setText] = useState('')
  const [defType, setDefType] = useState<EntrantType | ''>('')
  const [result, setResult] = useState<ImportResult | null>(null)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  function preview(t = text) {
    setMsg('')
    setResult(csvToEntrants(parseCsv(t), defType || null))
  }

  async function onFile(f: File | undefined) {
    if (!f) return
    const t = await f.text()
    setText(t); preview(t)
  }

  async function run() {
    if (!result?.entrants.length) return
    setBusy(true); setMsg('')
    const sb = getSupabase()
    const rows = result.entrants.map(e => ({ ...e, event_id: eventId }))
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await sb.from('entrants').upsert(rows.slice(i, i + 500), { onConflict: 'event_id,entrant_type,competition_number' })
      if (error) { setBusy(false); setMsg(`Stopped after ${i} rows: ${error.message}`); onDone(); return }
    }
    setBusy(false)
    setMsg(`Imported ${rows.length} entrants.`)
    setText(''); setResult(null)
    onDone()
  }

  return (
    <details className="card">
      <summary><b>Import from CSV / spreadsheet</b></summary>
      <p className="muted small">Columns: Type (car/bike), Number, Name, Co-driver, Class, Vehicle, Rego, Scan code. Only Number and Name are required; if there’s no Type column pick one below. Scan code defaults to B12 / C12. Re-importing updates existing entrants by type + number.</p>
      <div className="row">
        <button onClick={() => downloadText('entrants-template.csv', CSV_TEMPLATE)}>Download template</button>
        <input type="file" accept=".csv,.txt,.tsv" onChange={e => onFile(e.target.files?.[0])} style={{ width: 'auto' }} />
        <label style={{ margin: 0 }}>Default type
          <select value={defType} onChange={e => setDefType(e.target.value as EntrantType | '')}>
            <option value="">(use Type column)</option><option value="bike">bike</option><option value="car">car</option>
          </select>
        </label>
      </div>
      <label>…or paste rows (from Excel/Sheets)<textarea value={text} onChange={e => setText(e.target.value)} /></label>
      <button onClick={() => preview()} disabled={!text.trim()}>Preview</button>
      {result && (
        <div style={{ marginTop: 12 }}>
          <p><b>{result.entrants.length}</b> entrants ready to import{result.errors.length > 0 && <>, <b className="bad-text">{result.errors.length}</b> problem(s)</>}.</p>
          {result.errors.length > 0 && <ul className="bad-text small">{result.errors.slice(0, 20).map((e, i) => <li key={i}>{e}</li>)}{result.errors.length > 20 && <li>…and {result.errors.length - 20} more</li>}</ul>}
          <button className="primary" onClick={run} disabled={busy || !result.entrants.length}>{busy ? 'Importing…' : `Import ${result.entrants.length}`}</button>
        </div>
      )}
      {msg && <p>{msg}</p>}
    </details>
  )
}

function AddOne({ eventId, onDone }: { eventId: string; onDone: () => void }) {
  const [f, setF] = useState({ type: 'bike' as EntrantType, number: '', name: '', name2: '', cls: '', vehicle: '', rego: '' })
  const [msg, setMsg] = useState('')
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value })

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setMsg('')
    const number = f.number.trim()
    const { error } = await getSupabase().from('entrants').insert({
      event_id: eventId, entrant_type: f.type, competition_number: number,
      scan_code: normalizeCode(defaultScanCode(f.type, number)),
      primary_name: f.name.trim(), secondary_name: f.name2.trim() || null, class_name: f.cls.trim() || null,
      vehicle_description: f.vehicle.trim() || null, registration_number: f.rego.trim() || null,
    })
    if (error) { setMsg(error.code === '23505' ? 'That number or scan code already exists for this event.' : error.message); return }
    setF({ ...f, number: '', name: '', name2: '', cls: '', vehicle: '', rego: '' })
    setMsg('Added.')
    onDone()
  }

  return (
    <details className="card">
      <summary><b>Add one entrant</b></summary>
      <form onSubmit={submit}>
        <div className="row">
          <label>Type<select value={f.type} onChange={set('type')}><option value="bike">bike</option><option value="car">car</option></select></label>
          <label>Number<input value={f.number} onChange={set('number')} required style={{ width: 90 }} /></label>
          <label className="grow">Name<input value={f.name} onChange={set('name')} required /></label>
          <label className="grow">Co-driver / passenger<input value={f.name2} onChange={set('name2')} /></label>
        </div>
        <div className="row">
          <label>Class<input value={f.cls} onChange={set('cls')} /></label>
          <label className="grow">Vehicle<input value={f.vehicle} onChange={set('vehicle')} /></label>
          <label>Rego<input value={f.rego} onChange={set('rego')} /></label>
        </div>
        <button className="primary">Add</button> <span className="muted">{msg}</span>
      </form>
    </details>
  )
}

export default function Page() { return <Shell needEvent><Content /></Shell> }
