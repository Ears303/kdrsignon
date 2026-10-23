'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Shell } from '@/components/Shell'
import { useApp } from '@/components/AppProvider'
import { fetchAll, getSupabase } from '@/lib/supabase'
import { toCsv } from '@/lib/logic'
import { downloadText } from '@/lib/download'
import type { Entrant } from '@/lib/types'

// Edit this list to change the note categories.
const CATEGORIES = ['General', 'Incident', 'Protest', 'Penalty', 'Scrutineering', 'Other']
const BUCKET = 'note-photos'

interface Note {
  id: string
  event_id: string
  entrant_id: string | null
  category: string
  note: string
  status: 'open' | 'closed'
  attachment_path: string | null
  created_by_email: string | null
  created_at: string
}

const label = (e: Entrant) =>
  `#${e.competition_number} ${[e.primary_name, e.secondary_name].filter(Boolean).join(' / ')} (${e.entrant_type})`

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-AU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

function Content() {
  const { event, session } = useApp()
  const [notes, setNotes] = useState<Note[]>([])
  const [entrants, setEntrants] = useState<Entrant[]>([])
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')

  // new note form
  const [category, setCategory] = useState(CATEGORIES[0])
  const [text, setText] = useState('')
  const [entrantSearch, setEntrantSearch] = useState('')
  const [entrantId, setEntrantId] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [fileKey, setFileKey] = useState(0)
  const [saving, setSaving] = useState(false)

  // list filters
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'closed'>('all')
  const [catFilter, setCatFilter] = useState('all')
  const [q, setQ] = useState('')

  const load = useCallback(async () => {
    if (!event) return
    setLoading(true)
    setMsg('')
    try {
      const sb = getSupabase()
      const [list, ents] = await Promise.all([
        sb.from('official_notes').select('*').eq('event_id', event.id).order('created_at', { ascending: false }).limit(1000),
        fetchAll<Entrant>('entrants', event.id),
      ])
      if (list.error) throw list.error
      const rows = (list.data ?? []) as Note[]
      setNotes(rows)
      setEntrants(ents)
      const paths = rows.map(n => n.attachment_path).filter((p): p is string => !!p)
      if (paths.length) {
        const { data: signed } = await sb.storage.from(BUCKET).createSignedUrls(paths, 3600)
        const m: Record<string, string> = {}
        signed?.forEach(s => { if (s.path && s.signedUrl) m[s.path] = s.signedUrl })
        setUrls(m)
      } else setUrls({})
    } catch (e) {
      setMsg((e as Error).message)
    }
    setLoading(false)
  }, [event])
  useEffect(() => { void load() }, [load])

  const entrantById = useMemo(() => new Map(entrants.map(e => [e.id, e])), [entrants])

  const matches = useMemo(() => {
    const s = entrantSearch.trim().toLowerCase()
    if (!s) return []
    return entrants.filter(e => label(e).toLowerCase().includes(s)).slice(0, 15)
  }, [entrants, entrantSearch])

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    return notes.filter(n => {
      if (statusFilter !== 'all' && n.status !== statusFilter) return false
      if (catFilter !== 'all' && n.category !== catFilter) return false
      if (!s) return true
      const e = n.entrant_id ? entrantById.get(n.entrant_id) : undefined
      return [n.note, n.category, n.created_by_email ?? '', e ? label(e) : ''].some(v => v.toLowerCase().includes(s))
    })
  }, [notes, statusFilter, catFilter, q, entrantById])

  const openCount = notes.filter(n => n.status === 'open').length

  async function add(ev: React.FormEvent) {
    ev.preventDefault()
    if (!event || !text.trim()) return
    setSaving(true)
    setMsg('')
    try {
      const sb = getSupabase()
      let path: string | null = null
      if (file) {
        if (file.size > 10 * 1024 * 1024) throw new Error('The photo is too large (maximum 10 MB).')
        const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        path = `${event.id}/${Date.now()}-${safe}`
        const up = await sb.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined })
        if (up.error) throw up.error
      }
      const { error } = await sb.from('official_notes').insert({
        event_id: event.id,
        entrant_id: entrantId || null,
        category,
        note: text.trim(),
        attachment_path: path,
        created_by_email: session?.user.email ?? null,
      })
      if (error) throw error
      setText(''); setEntrantSearch(''); setEntrantId(''); setFile(null); setFileKey(k => k + 1)
      await load()
    } catch (err) {
      setMsg((err as Error).message)
    }
    setSaving(false)
  }

  async function setStatus(n: Note, status: 'open' | 'closed') {
    const { error } = await getSupabase().from('official_notes')
      .update({ status, updated_at: new Date().toISOString() }).eq('id', n.id)
    if (error) setMsg(error.message)
    else setNotes(list => list.map(x => (x.id === n.id ? { ...x, status } : x)))
  }

  async function edit(n: Note) {
    const t = prompt('Edit note', n.note)
    if (t === null || !t.trim() || t.trim() === n.note) return
    const { error } = await getSupabase().from('official_notes')
      .update({ note: t.trim(), updated_at: new Date().toISOString() }).eq('id', n.id)
    if (error) setMsg(error.message)
    else setNotes(list => list.map(x => (x.id === n.id ? { ...x, note: t.trim() } : x)))
  }

  async function remove(n: Note) {
    if (!confirm('Delete this note? This cannot be undone.')) return
    const sb = getSupabase()
    const { error } = await sb.from('official_notes').delete().eq('id', n.id)
    if (error) { setMsg(error.message); return }
    if (n.attachment_path) await sb.storage.from(BUCKET).remove([n.attachment_path])
    setNotes(list => list.filter(x => x.id !== n.id))
  }

  function exportCsv() {
    downloadText('official-notes.csv', toCsv([
      ['Time', 'Category', 'Status', 'Entrant', 'Note', 'By', 'Photo'],
      ...shown.map(n => {
        const e = n.entrant_id ? entrantById.get(n.entrant_id) : undefined
        return [new Date(n.created_at).toLocaleString('en-AU'), n.category, n.status, e ? label(e) : '', n.note, n.created_by_email, n.attachment_path ? 'yes' : '']
      }),
    ]))
  }

  return (
    <>
      <h1>Official notes</h1>

      <form className="card" onSubmit={add}>
        <h2>Add a note</h2>
        <div className="row">
          <label>Category
            <select value={category} onChange={e => setCategory(e.target.value)}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="grow">Entrant (optional) — search number or name
            <input
              value={entrantSearch}
              onChange={e => { setEntrantSearch(e.target.value); setEntrantId('') }}
              placeholder="e.g. 660 or Smith"
            />
          </label>
        </div>
        {entrantSearch.trim() && !entrantId && (
          matches.length === 0 ? <p className="muted small">No entrant matches.</p> : (
            <select size={Math.min(matches.length, 6)} value="" onChange={e => {
              const picked = entrants.find(x => x.id === e.target.value)
              if (picked) { setEntrantId(picked.id); setEntrantSearch(label(picked)) }
            }}>
              {matches.map(e => <option key={e.id} value={e.id}>{label(e)}</option>)}
            </select>
          )
        )}
        {entrantId && <p className="small">Linked to: <b>{entrantSearch}</b>{' '}
          <button type="button" className="link" onClick={() => { setEntrantId(''); setEntrantSearch('') }}>Clear</button></p>}

        <label>Note
          <textarea value={text} onChange={e => setText(e.target.value)} rows={4} required placeholder="What happened, what was decided…" />
        </label>
        <label>Photo (optional)
          <input key={fileKey} type="file" accept="image/*" onChange={e => setFile(e.target.files?.[0] ?? null)} />
        </label>
        <button className="primary" disabled={saving || !text.trim() || !event}>{saving ? 'Saving…' : 'Add note'}</button>
      </form>

      {msg && <p className="bad-text">{msg}</p>}

      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div className="seg">
            {(['all', 'open', 'closed'] as const).map(s => (
              <button key={s} className={statusFilter === s ? 'on' : ''} onClick={() => setStatusFilter(s)}>
                {s.toUpperCase()}{s === 'open' ? ` (${openCount})` : ''}
              </button>
            ))}
          </div>
          <select value={catFilter} onChange={e => setCatFilter(e.target.value)} style={{ width: 'auto', margin: 0 }}>
            <option value="all">All categories</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <input className="grow" placeholder="Search notes, entrants, people…" value={q} onChange={e => setQ(e.target.value)} />
          <button onClick={exportCsv} disabled={!shown.length}>Export CSV</button>
          <button onClick={() => void load()}>Refresh</button>
        </div>
        <p className="muted small">{loading ? 'Loading…' : `${shown.length} of ${notes.length}`}</p>

        {shown.map(n => {
          const e = n.entrant_id ? entrantById.get(n.entrant_id) : undefined
          const url = n.attachment_path ? urls[n.attachment_path] : undefined
          return (
            <div key={n.id} className="card" style={{ margin: '8px 0' }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span>
                  <span className="pill warn">{n.category}</span>{' '}
                  <span className={`pill ${n.status === 'open' ? 'bad' : 'ok'}`}>{n.status}</span>
                </span>
                <span className="muted small">{when(n.created_at)}{n.created_by_email ? ` · ${n.created_by_email}` : ''}</span>
              </div>
              {e && <p style={{ margin: '6px 0 0' }}><b>{label(e)}</b></p>}
              <p style={{ whiteSpace: 'pre-wrap', margin: '6px 0' }}>{n.note}</p>
              {url && (
                <a href={url} target="_blank" rel="noopener noreferrer">
                  <img src={url} alt="Note photo" style={{ maxWidth: 220, maxHeight: 160, borderRadius: 8, display: 'block', marginBottom: 8 }} />
                </a>
              )}
              {n.attachment_path && !url && <p className="muted small">Photo attached (loading…)</p>}
              <div className="row">
                {n.status === 'open'
                  ? <button className="primary" onClick={() => setStatus(n, 'closed')}>Close</button>
                  : <button onClick={() => setStatus(n, 'open')}>Reopen</button>}
                <button onClick={() => edit(n)}>Edit</button>
                <button className="danger" onClick={() => remove(n)}>Delete</button>
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}

export default function Page() { return <Shell needEvent><Content /></Shell> }
