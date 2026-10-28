'use client'
// FILE LOCATION IN GITHUB: replace your existing race control log page
// (the page.tsx you pasted, e.g. app/race-control/page.tsx).
// Race control log and course control now sit on ONE page:
//   wide screen  -> side by side (log left, course control right)
//   tablet/phone -> stacked, with quick-jump buttons at the top
// The race control log code is unchanged apart from the layout wrapper.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Shell } from '@/components/Shell'
import { useApp } from '@/components/AppProvider'
import { getSupabase } from '@/lib/supabase'
import { toCsv } from '@/lib/logic'
import { downloadText } from '@/lib/download'
import type { Stage } from '@/lib/types'
import { CourseControlPanel } from '@/components/CourseControlPanel'

interface Caller { id: string; name: string; sort_order: number }
interface Entry {
  id: string
  event_id: string
  stage_id: string | null
  logged_at: string
  caller: string
  location: string | null
  message: string
  action_taken: string | null
  status: 'open' | 'closed'
  closed_at: string | null
  closed_by_email: string | null
  created_by_email: string | null
}

const NEW_CALLER = '__new__'

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-AU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

// how long an item has been waiting, e.g. "12 min" or "1 h 5 min"
const ago = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min`
  return `${Math.floor(m / 60)} h ${m % 60} min`
}

function RaceLog() {
  const { event, session } = useApp()
  const [entries, setEntries] = useState<Entry[]>([])
  const [callers, setCallers] = useState<Caller[]>([])
  const [stages, setStages] = useState<Stage[]>([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')

  // new entry form
  const [caller, setCaller] = useState('')
  const [stageId, setStageId] = useState('')
  const [location, setLocation] = useState('')
  const [message, setMessage] = useState('')
  const [loggedAt, setLoggedAt] = useState('')
  const [saving, setSaving] = useState(false)

  // list filters
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'closed'>('open')
  const [callerFilter, setCallerFilter] = useState('all')
  const [q, setQ] = useState('')

  const load = useCallback(async (silent = false) => {
    if (!event) return
    if (!silent) setLoading(true)
    try {
      const sb = getSupabase()
      const [e, c, s] = await Promise.all([
        sb.from('race_control_log').select('*').eq('event_id', event.id).order('logged_at', { ascending: false }).limit(2000),
        sb.from('race_control_callers').select('*').order('sort_order').order('name'),
        sb.from('stages').select('*').eq('event_id', event.id).order('sequence_number'),
      ])
      if (e.error) throw e.error
      if (c.error) throw c.error
      setEntries((e.data ?? []) as Entry[])
      setCallers((c.data ?? []) as Caller[])
      setStages((s.data ?? []) as Stage[])
      setMsg('')
    } catch (err) {
      setMsg((err as Error).message)
    }
    setLoading(false)
  }, [event])

  useEffect(() => { void load() }, [load])
  // keep everyone in control looking at the same list
  useEffect(() => {
    const t = setInterval(() => { void load(true) }, 15000)
    return () => clearInterval(t)
  }, [load])

  // pick the first caller once the list has loaded
  useEffect(() => {
    if (!caller && callers.length) setCaller(callers[0].name)
  }, [callers, caller])

  const stageName = useMemo(() => new Map(stages.map(s => [s.id, s.name])), [stages])
  const openCount = entries.filter(n => n.status === 'open').length

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    return entries.filter(n => {
      if (statusFilter !== 'all' && n.status !== statusFilter) return false
      if (callerFilter !== 'all' && n.caller !== callerFilter) return false
      if (!s) return true
      return [n.message, n.caller, n.location ?? '', n.action_taken ?? '', n.stage_id ? (stageName.get(n.stage_id) ?? '') : '']
        .some(v => v.toLowerCase().includes(s))
    })
  }, [entries, statusFilter, callerFilter, q, stageName])

  async function onCallerChange(v: string) {
    if (v !== NEW_CALLER) { setCaller(v); return }
    const name = prompt('New caller name (e.g. Marshal post 7)')?.trim()
    if (!name) return
    const existing = callers.find(c => c.name.toLowerCase() === name.toLowerCase())
    if (existing) { setCaller(existing.name); return }
    const { error } = await getSupabase().from('race_control_callers').insert({ name, sort_order: 100 })
    if (error) { setMsg(error.message); return }
    await load(true)
    setCaller(name)
  }

  async function add(ev: React.FormEvent) {
    ev.preventDefault()
    if (!event || !message.trim() || !caller) return
    setSaving(true)
    setMsg('')
    const { error } = await getSupabase().from('race_control_log').insert({
      event_id: event.id,
      stage_id: stageId || null,
      caller,
      location: location.trim() || null,
      message: message.trim(),
      logged_at: loggedAt ? new Date(loggedAt).toISOString() : new Date().toISOString(),
      created_by_email: session?.user.email ?? null,
    })
    if (error) setMsg(error.message)
    else { setMessage(''); setLocation(''); setLoggedAt(''); await load(true) }
    setSaving(false)
  }

  async function closeItem(n: Entry) {
    const action = prompt('Action taken (optional):', n.action_taken ?? '')
    if (action === null) return
    const patch = {
      status: 'closed' as const,
      action_taken: action.trim() || null,
      closed_at: new Date().toISOString(),
      closed_by_email: session?.user.email ?? null,
      updated_at: new Date().toISOString(),
    }
    const { error } = await getSupabase().from('race_control_log').update(patch).eq('id', n.id)
    if (error) setMsg(error.message)
    else setEntries(list => list.map(x => (x.id === n.id ? { ...x, ...patch } : x)))
  }

  async function reopen(n: Entry) {
    const patch = { status: 'open' as const, closed_at: null, closed_by_email: null, updated_at: new Date().toISOString() }
    const { error } = await getSupabase().from('race_control_log').update(patch).eq('id', n.id)
    if (error) setMsg(error.message)
    else setEntries(list => list.map(x => (x.id === n.id ? { ...x, ...patch } : x)))
  }

  async function edit(n: Entry) {
    const t = prompt('Edit the entry', n.message)
    if (t === null || !t.trim() || t.trim() === n.message) return
    const { error } = await getSupabase().from('race_control_log')
      .update({ message: t.trim(), updated_at: new Date().toISOString() }).eq('id', n.id)
    if (error) setMsg(error.message)
    else setEntries(list => list.map(x => (x.id === n.id ? { ...x, message: t.trim() } : x)))
  }

  async function remove(n: Entry) {
    if (!confirm('Delete this entry? This cannot be undone.')) return
    const { error } = await getSupabase().from('race_control_log').delete().eq('id', n.id)
    if (error) setMsg(error.message)
    else setEntries(list => list.filter(x => x.id !== n.id))
  }

  function exportCsv() {
    downloadText('race-control-log.csv', toCsv([
      ['Time', 'Lap', 'Caller', 'Location', 'Message', 'Status', 'Action taken', 'Closed at', 'Closed by', 'Logged by'],
      ...shown.map(n => [
        new Date(n.logged_at).toLocaleString('en-AU'), n.stage_id ? stageName.get(n.stage_id) : '', n.caller, n.location,
        n.message, n.status, n.action_taken, n.closed_at ? new Date(n.closed_at).toLocaleString('en-AU') : '',
        n.closed_by_email, n.created_by_email,
      ]),
    ]))
  }

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1 style={{ margin: 0 }}>Race control log</h1>
        <span className={`pill ${openCount ? 'bad' : 'ok'}`}>{openCount} outstanding</span>
      </div>

      <form className="card" onSubmit={add}>
        <h2>New entry</h2>
        <div className="row">
          <label>Call from
            <select value={caller} onChange={e => void onCallerChange(e.target.value)}>
              {callers.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
              <option value={NEW_CALLER}>➕ Add new caller…</option>
            </select>
          </label>
          <label>Lap
            <select value={stageId} onChange={e => setStageId(e.target.value)}>
              <option value="">—</option>
              {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className="grow">Location (optional)
            <input value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Post 7, creek crossing" />
          </label>
          <label>Time (blank = now)
            <input type="datetime-local" value={loggedAt} onChange={e => setLoggedAt(e.target.value)} />
          </label>
        </div>
        <label>Message
          <textarea value={message} onChange={e => setMessage(e.target.value)} rows={3} required placeholder="What was called in, and what needs doing…" />
        </label>
        <button className="primary" disabled={saving || !message.trim() || !caller || !event}>{saving ? 'Saving…' : 'Log it'}</button>
      </form>

      {msg && <p className="bad-text">{msg}</p>}

      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div className="seg">
            {(['open', 'closed', 'all'] as const).map(s => (
              <button key={s} className={statusFilter === s ? 'on' : ''} onClick={() => setStatusFilter(s)}>
                {s.toUpperCase()}{s === 'open' ? ` (${openCount})` : ''}
              </button>
            ))}
          </div>
          <select value={callerFilter} onChange={e => setCallerFilter(e.target.value)} style={{ width: 'auto', margin: 0 }}>
            <option value="all">All callers</option>
            {callers.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
          <input className="grow" placeholder="Search the log…" value={q} onChange={e => setQ(e.target.value)} />
          <button onClick={exportCsv} disabled={!shown.length}>Export CSV</button>
          <button onClick={() => void load()}>Refresh</button>
        </div>
        <p className="muted small">{loading ? 'Loading…' : `${shown.length} of ${entries.length} · updates every 15 seconds`}</p>

        {shown.map(n => (
          <div key={n.id} className="card" style={{ margin: '8px 0', borderLeft: `4px solid ${n.status === 'open' ? '#dc2626' : '#16a34a'}` }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span>
                <span className="pill warn">{n.caller}</span>{' '}
                {n.stage_id && <span className="pill">{stageName.get(n.stage_id) ?? 'Lap'}</span>}{' '}
                <span className={`pill ${n.status === 'open' ? 'bad' : 'ok'}`}>{n.status}</span>
              </span>
              <span className="muted small">
                {when(n.logged_at)}{n.status === 'open' ? ` · open ${ago(n.logged_at)}` : ''}
              </span>
            </div>
            {n.location && <p className="small" style={{ margin: '6px 0 0' }}>📍 {n.location}</p>}
            <p style={{ whiteSpace: 'pre-wrap', margin: '6px 0' }}>{n.message}</p>
            {n.status === 'closed' && (
              <p className="small" style={{ margin: '0 0 6px' }}>
                ✓ Actioned{n.action_taken ? `: ${n.action_taken}` : ''}
                <span className="muted"> — {n.closed_at ? when(n.closed_at) : ''}{n.closed_by_email ? ` · ${n.closed_by_email}` : ''}</span>
              </p>
            )}
            <p className="muted small" style={{ margin: '0 0 8px' }}>Logged by {n.created_by_email ?? 'unknown'}</p>
            <div className="row">
              {n.status === 'open'
                ? <button className="primary" onClick={() => void closeItem(n)}>Close — actioned</button>
                : <button onClick={() => void reopen(n)}>Reopen</button>}
              <button onClick={() => void edit(n)}>Edit</button>
              <button className="danger" onClick={() => void remove(n)}>Delete</button>
            </div>
          </div>
        ))}
        {!loading && shown.length === 0 && <p className="muted">{statusFilter === 'open' ? 'Nothing outstanding 🎉' : 'No entries.'}</p>}
      </div>
    </>
  )
}

/* ------------------------------------------------------------
   COMBINED PAGE: race control log + course control
   ------------------------------------------------------------ */

function Content() {
  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <>
      {/* quick jump - mainly for tablets/phones where the two halves stack */}
      <div className="row" style={{ position: 'sticky', top: 0, zIndex: 20, background: 'inherit', padding: '6px 0' }}>
        <button onClick={() => jump('race-log')}>📋 Race log</button>
        <button onClick={() => jump('course-control')}>🏍️ Course control</button>
        <a href="/course-track" target="_blank" rel="noreferrer">
          <button type="button">🗺️ Course board ↗</button>
        </a>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(480px, 1fr))',
          gap: 16,
          alignItems: 'start',
        }}
      >
        <section id="race-log" style={{ minWidth: 0 }}>
          <RaceLog />
        </section>
        <section id="course-control" style={{ minWidth: 0 }}>
          <CourseControlPanel />
        </section>
      </div>
    </>
  )
}

export default function Page() { return <Shell needEvent><Content /></Shell> }
// END OF FILE
