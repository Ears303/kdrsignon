'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Shell } from '@/components/Shell'
import { useApp } from '@/components/AppProvider'
import { getSupabase } from '@/lib/supabase'
import { decideScan, type Mode } from '@/lib/logic'
import { findByLicence, findEntrants } from '@/lib/lookup'
import { signal } from '@/lib/feedback'
import { readQueue, useQueue, type QueueTable } from '@/lib/useQueue'
import { useEventData } from '@/lib/useEventData'
import type { Entrant, EntrantType, EventData, Method, ScanPoint } from '@/lib/types'

interface Station { type: EntrantType; mode: Mode; stageId: string | null }
interface Feedback {
  tone: 'ok' | 'warn' | 'bad'
  big: string
  what: string
  who?: string
  sub?: string
  confirm?: { entrant: Entrant; message: string; method: Method }
}
interface Recent {
  key: string
  qid: string
  table: QueueTable
  entrant: Entrant
  label: string
  at: string
  stageId?: string
  point?: ScanPoint
}

const STATION_KEY = 'kdr:station'
const MODES: { id: Mode; label: string }[] = [
  { id: 'briefing', label: 'Briefing' }, { id: 'sight_out', label: 'Sight lap out' }, { id: 'sight_in', label: 'Sight lap in' },
  { id: 'start', label: 'Start' }, { id: 'finish', label: 'Finish' }, { id: 'dnf', label: 'DNF' },
]
const isSight = (m: Mode) => m === 'sight_out' || m === 'sight_in'
const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
const who = (e: Entrant) => [e.primary_name, e.secondary_name].filter(Boolean).join(' / ')
const licenceOf = (e: Entrant) => (e as Entrant & { ridernet_id?: string | null }).ridernet_id ?? ''

function overlayPending(eventId: string) {
  return (d: EventData): EventData => {
    const items = readQueue().filter(i => i.row.event_id === eventId)
    const out = { ...d, briefing: [...d.briefing], scans: [...d.scans], results: [...d.results] }
    for (const i of items) {
      const r = i.row as Record<string, string>
      if (i.table === 'briefing_attendance') out.briefing.push({ entrant_id: r.entrant_id, stage_id: r.stage_id, attended_at: r.attended_at })
      else if (i.table === 'stage_scans') out.scans.push({ entrant_id: r.entrant_id, stage_id: r.stage_id, point: r.point as ScanPoint, scanned_at: r.scanned_at })
      else out.results.push({ entrant_id: r.entrant_id, stage_id: r.stage_id, status: 'dnf', reason: r.reason ?? null, recorded_at: r.recorded_at })
    }
    return out
  }
}

function Camera({ onCode, onError }: { onCode: (code: string) => void; onError: (msg: string) => void }) {
  const cb = useRef(onCode); cb.current = onCode
  const eb = useRef(onError); eb.current = onError
  useEffect(() => {
    let scanner: import('html5-qrcode').Html5Qrcode | null = null
    let cancelled = false
    let wake: WakeLockSentinel | null = null
    let last = { code: '', at: 0 }
    ;(async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode')
        if (cancelled) return
        scanner = new Html5Qrcode('reader', { verbose: false, experimentalFeatures: { useBarCodeDetectorIfSupported: true } } as never)
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: (w, h) => { const s = Math.floor(Math.min(w, h) * 0.8); return { width: s, height: Math.floor(s * 0.7) } } },
          text => {
            const now = Date.now()
            if (text === last.code && now - last.at < 3000) return // same code still in view
            last = { code: text, at: now }
            cb.current(text)
          },
          () => {},
        )
        try { wake = (await navigator.wakeLock?.request('screen')) ?? null } catch {}
      } catch (e) {
        eb.current(`Camera unavailable: ${(e as Error).message ?? e}. Camera needs HTTPS and permission.`)
      }
    })()
    return () => {
      cancelled = true
      try { void wake?.release() } catch {}
      const s = scanner
      if (s) s.stop().then(() => s.clear()).catch(() => {})
    }
  }, [])
  return <div id="reader" />
}

function Content() {
  const { event, scanTypes, scanModes } = useApp()
  const eventId = event?.id ?? null
  const overlay = useMemo(() => (eventId ? overlayPending(eventId) : undefined), [eventId])
  const { data, setData, state, error, reload } = useEventData(eventId, overlay)
  const queue = useQueue(() => { void reload() })

  // pick up changes made by control (e.g. a new medical suspension) without anyone having to reload
  useEffect(() => {
    const t = setInterval(() => { void reload(true) }, 30000)
    return () => clearInterval(t)
  }, [reload])

  const [station, setStation] = useState<Station>({ type: 'bike', mode: 'start', stageId: null })
  const [code, setCode] = useState('')
  const [reason, setReason] = useState('')
  const [fb, setFb] = useState<Feedback | null>(null)
  const [choices, setChoices] = useState<{ list: Entrant[]; method: Method } | null>(null)
  const [recent, setRecent] = useState<Recent[]>([])
  const [camera, setCamera] = useState(false)
  const [sound, setSound] = useState(true)
  const [undoMsg, setUndoMsg] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const firstKey = useRef(0)

  // restore the saved station setup
  useEffect(() => {
    try { const s = JSON.parse(localStorage.getItem(STATION_KEY) ?? 'null'); if (s) setStation(s) } catch {}
  }, [])
  // keep the station inside what this person's role allows (e.g. a saved CAR station on a bike-only login)
  useEffect(() => {
    setStation(s => {
      const type = scanTypes.includes(s.type) ? s.type : (scanTypes[0] ?? s.type)
      const mode = scanModes.includes(s.mode) ? s.mode : (scanModes[0] ?? s.mode)
      return type === s.type && mode === s.mode ? s : { ...s, type, mode }
    })
  }, [scanTypes, scanModes])
  const update = (patch: Partial<Station>) => setStation(s => {
    const n = { ...s, ...patch }
    try { localStorage.setItem(STATION_KEY, JSON.stringify(n)) } catch {}
    return n
  })

  const stages = useMemo(() => data.stages.filter(s => s.enabled).sort((a, b) => a.sequence_number - b.sequence_number), [data.stages])
  const stage = stages.find(s => s.id === station.stageId) ?? stages[0] ?? null
  // every mode (briefing, start, finish, DNF) now belongs to a specific stage: Prologue, Lap 1, Lap 2, Lap 3
  const needsStage = true

  // sight lap scans (out / in) are for bikes in the Prologue only
  const sightOk = station.type === 'bike' && (stage?.name ?? '').trim().toLowerCase() === 'prologue'
  useEffect(() => {
    if (isSight(station.mode) && !sightOk) {
      setStation(s => ({ ...s, mode: scanModes.find(m => !isSight(m)) ?? 'start' }))
    }
  }, [sightOk, station.mode, scanModes])

  // ---- progress counter for the current station
  const progress = useMemo(() => {
    const ofType = data.entrants.filter(e => e.entrant_type === station.type && e.status === 'active')
    const ids = new Set(ofType.map(e => e.id))
    let done = 0
    if (stage && station.mode === 'briefing') done = data.briefing.filter(b => b.stage_id === stage.id && ids.has(b.entrant_id)).length
    else if (stage && station.mode === 'dnf') done = data.results.filter(r => r.stage_id === stage.id && r.status === 'dnf' && ids.has(r.entrant_id)).length
    else if (stage) done = data.scans.filter(s => s.stage_id === stage.id && s.point === station.mode && ids.has(s.entrant_id)).length
    return { done, total: ofType.length }
  }, [data, station.type, station.mode, stage])

  const focusInput = useCallback(() => { if (!camera) inputRef.current?.focus() }, [camera])
  useEffect(() => { focusInput() }, [focusInput, station, state])

  // ---- record
  const commit = useCallback((entrant: Entrant, method: Method, warning?: string) => {
    if (!eventId) return
    const now = new Date().toISOString()
    const mode = station.mode
    let table: QueueTable, row: Record<string, unknown> & { event_id: string }, label: string
    if (mode === 'briefing') {
      table = 'briefing_attendance'
      row = { event_id: eventId, entrant_id: entrant.id, stage_id: stage!.id, attended_at: now, method }
      label = `Briefing · ${stage!.name}`
      setData(d => ({ ...d, briefing: [...d.briefing, { entrant_id: entrant.id, stage_id: stage!.id, attended_at: now }] }))
    } else if (mode === 'dnf') {
      table = 'stage_results'
      row = { event_id: eventId, entrant_id: entrant.id, stage_id: stage!.id, status: 'dnf', reason: reason.trim() || null, recorded_at: now }
      label = `DNF · ${stage!.name}`
      setData(d => ({ ...d, results: [...d.results, { entrant_id: entrant.id, stage_id: stage!.id, status: 'dnf', reason: reason.trim() || null, recorded_at: now }] }))
    } else {
      table = 'stage_scans'
      row = { event_id: eventId, entrant_id: entrant.id, stage_id: stage!.id, point: mode, scanned_at: now, method }
      label = `${mode === 'sight_out' ? 'Sight lap out' : mode === 'sight_in' ? 'Sight lap in' : mode === 'start' ? 'Start' : 'Finish'} · ${stage!.name}`
      setData(d => ({ ...d, scans: [...d.scans, { entrant_id: entrant.id, stage_id: stage!.id, point: mode, scanned_at: now }] }))
    }
    const qid = queue.enqueue(table, row)
    setRecent(r => [{ key: qid, qid, table, entrant, label, at: now, stageId: stage?.id, point: mode === 'briefing' || mode === 'dnf' ? undefined : mode }, ...r].slice(0, 20))
    const verb = mode === 'briefing' ? 'BRIEFING OK' : mode === 'dnf' ? 'DNF RECORDED' : mode === 'sight_out' ? 'SIGHT LAP OUT' : mode === 'sight_in' ? 'SIGHT LAP IN' : mode === 'start' ? 'START RECORDED' : 'FINISH RECORDED'
    setFb({
      tone: warning ? 'warn' : 'ok', big: `#${entrant.competition_number}`, what: verb,
      who: who(entrant),
      sub: warning ?? [entrant.class_name, entrant.vehicle_description].filter(Boolean).join(' · '),
    })
    signal(warning ? 'warn' : 'ok', sound)
  }, [eventId, station.mode, stage, reason, queue, setData, sound])

  // ---- run the existing checks (suspension, wrong type, duplicate, etc.)
  const handle = useCallback((entrants: Entrant[], c: string, method: Method, shown: string) => {
    const d = decideScan({
      entrants, code: c, stationType: station.type, mode: station.mode, stageId: stage?.id ?? null,
      recorded: { briefing: data.briefing, scans: data.scans, results: data.results },
    })
    switch (d.kind) {
      case 'not_found':
        setFb({ tone: 'bad', big: '?', what: 'NOT FOUND', sub: `No entrant matches “${shown}”` }); signal('bad', sound); break
      case 'blocked':
        setFb({
          tone: 'bad', big: `#${d.entrant.competition_number}`, what: 'MEDICALLY SUSPENDED', who: who(d.entrant),
          sub: `DO NOT ALLOW THROUGH — refer to Control.${d.note ? ` Note: ${d.note}` : ''}`,
        })
        signal('bad', sound); setTimeout(() => signal('bad', sound), 500); break
      case 'wrong_type':
        setFb({ tone: 'bad', big: `#${d.entrant.competition_number}`, what: `WRONG TYPE — this is a ${d.entrant.entrant_type.toUpperCase()}`, who: who(d.entrant), sub: `This station is set to ${station.type.toUpperCase()}` }); signal('bad', sound); break
      case 'duplicate':
        setFb({ tone: 'warn', big: `#${d.entrant.competition_number}`, what: `ALREADY SCANNED`, who: who(d.entrant), sub: `${d.what} at ${time(d.at)}` }); signal('warn', sound); break
      case 'confirm':
        setFb({ tone: 'bad', big: `#${d.entrant.competition_number}`, what: 'CHECK BEFORE RECORDING', who: who(d.entrant), sub: d.message, confirm: { entrant: d.entrant, message: d.message, method } }); signal('bad', sound); break
      case 'record':
        commit(d.entrant, method, d.warning)
    }
  }, [stage, data, station.type, station.mode, commit, sound])

  // one known entrant: pass only that entrant through the existing checks
  const runFor = useCallback((e: Entrant, method: Method, shown: string) => {
    setChoices(null)
    handle([e], String(e.competition_number), method, shown)
  }, [handle])

  // from the "Which entrant?" list: record this one but keep the list open for the others
  const pick = useCallback((e: Entrant, method: Method, shown: string) => {
    handle([e], String(e.competition_number), method, shown)
  }, [handle])

  const submit = useCallback((raw: string, method: Method) => {
    const c = raw.trim()
    if (!c) return
    setChoices(null)
    if (needsStage && !stage) { setFb({ tone: 'bad', big: '!', what: 'NO STAGE SELECTED' }); signal('bad', sound); return }

    // Briefing: licence (RidernetID) first. Everywhere: number, RidernetID, scan code or name.
    let matches: Entrant[] = station.mode === 'briefing' ? findByLicence(data.entrants, c) : []
    if (!matches.length) matches = findEntrants(data.entrants, c).map(h => h.entrant)

    // Co-drivers share a race number as 660_1, 660_2 ... so typing 660 lists them all
    const q = c.toUpperCase()
    const sharing = data.entrants.filter(e => {
      const n = e.competition_number.toUpperCase()
      return e.entrant_type === station.type && (n === q || n.startsWith(q + '_'))
    })
    if (sharing.length > 1) matches = sharing

    // same number in bike and car: keep the one for this station
    if (matches.length > 1) {
      const ofType = matches.filter(e => e.entrant_type === station.type)
      if (ofType.length === 1) matches = ofType
    }

    if (matches.length === 1) { runFor(matches[0], method, c); return }
    if (matches.length > 1) {
      setChoices({ list: matches.slice(0, 10), method })
      setFb({ tone: 'warn', big: String(matches.length), what: 'MORE THAN ONE MATCH', sub: 'Pick the right entrant below' })
      signal('warn', sound)
      return
    }
    // nothing found by the lookup: fall back to the original matching
    handle(data.entrants, c, method, c)
  }, [needsStage, stage, data.entrants, station.type, station.mode, runFor, handle, sound])

  const submitRef = useRef(submit); submitRef.current = submit
  const onCamera = useCallback((text: string) => submitRef.current(text, 'camera'), [])

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!firstKey.current && e.key.length === 1) firstKey.current = performance.now()
    if (e.key === 'Enter') {
      e.preventDefault()
      const len = code.trim().length
      const ms = firstKey.current ? performance.now() - firstKey.current : 9999
      // a hand scanner "types" the whole code almost instantly; a person doesn't
      const method: Method = len >= 3 && ms / len < 60 ? 'scanner' : 'manual'
      firstKey.current = 0
      submit(code, method)
      setCode('')
    }
  }

  async function undo(r: Recent) {
    setUndoMsg('')
    const wasQueued = queue.cancel(r.qid)
    if (!wasQueued) {
      const sb = getSupabase()
      let q = sb.from(r.table).delete().eq('event_id', eventId!).eq('entrant_id', r.entrant.id)
      if (r.stageId) q = q.eq('stage_id', r.stageId)
      if (r.point) q = q.eq('point', r.point)
      const { data: gone, error: err } = await q.select('id')
      if (err || !gone?.length) { setUndoMsg(err?.message ?? 'Could not undo — it may have been recorded by someone else. Ask control.'); return }
    }
    setData(d => ({
      ...d,
      briefing: r.table === 'briefing_attendance' ? d.briefing.filter(b => !(b.entrant_id === r.entrant.id && b.stage_id === r.stageId)) : d.briefing,
      scans: r.table === 'stage_scans' ? d.scans.filter(s => !(s.entrant_id === r.entrant.id && s.stage_id === r.stageId && s.point === r.point)) : d.scans,
      results: r.table === 'stage_results' ? d.results.filter(x => !(x.entrant_id === r.entrant.id && x.stage_id === r.stageId)) : d.results,
    }))
    setRecent(list => list.filter(x => x.key !== r.key))
    setFb(null)
  }

  const modeLabel = MODES.find(m => m.id === station.mode)?.label ?? station.mode
  const heading = `${station.type.toUpperCase()} · ${needsStage ? (stage?.name ?? '—').toUpperCase() + ' · ' : ''}${modeLabel.toUpperCase()}`
  // has this entrant already been recorded for the current mode and stage?
  const isRecorded = (e: Entrant) => {
    if (!stage) return false
    if (station.mode === 'briefing') return data.briefing.some(b => b.entrant_id === e.id && b.stage_id === stage.id)
    if (station.mode === 'dnf') return data.results.some(r => r.entrant_id === e.id && r.stage_id === stage.id && r.status === 'dnf')
    return data.scans.some(s => s.entrant_id === e.id && s.stage_id === stage.id && s.point === station.mode)
  }
  const placeholder = station.mode === 'briefing'
    ? 'Scan licence, or type RidernetID / number / name + Enter'
    : 'Scan, or type number / RidernetID / name + Enter'

  return (
    <>
      {state === 'cached' && <div className="banner warn">Offline — using the entrant list saved on this device. Scans are queued and will upload when you’re back online.</div>}
      {state === 'error' && <div className="banner bad">Couldn’t load event data: {error} <button className="link" onClick={() => reload()}>Retry</button></div>}
      {!queue.online && queue.pending > 0 && <div className="banner warn">No connection — {queue.pending} scan{queue.pending > 1 ? 's' : ''} waiting to upload. Keep this page open.</div>}
      {queue.online && queue.pending > 0 && <div className="banner ok">Uploading {queue.pending}…</div>}
      {queue.failed.length > 0 && (
        <div className="banner bad">
          {queue.failed.length} scan(s) were rejected by the server: {queue.failed[0].message}. You may not have permission to record.{' '}
          <button className="link" onClick={queue.dismissFailed}>Dismiss &amp; refresh</button>
        </div>
      )}

      <div className="card">
        <div className="row" style={{ marginBottom: 10 }}>
          <div className="seg">
            {(['bike', 'car'] as const).filter(t => scanTypes.includes(t)).map(t => <button key={t} className={station.type === t ? 'on' : ''} onClick={() => update({ type: t })}>{t.toUpperCase()}</button>)}
          </div>
          <div className="seg">
            {MODES.filter(m => scanModes.includes(m.id) && (!isSight(m.id) || sightOk)).map(m => <button key={m.id} className={station.mode === m.id ? 'on' : ''} onClick={() => update({ mode: m.id })}>{m.label}</button>)}
          </div>
        </div>
        {needsStage && (
          <div className="seg" style={{ marginBottom: 10 }}>
            {stages.map(s => <button key={s.id} className={stage?.id === s.id ? 'on' : ''} onClick={() => update({ stageId: s.id })}>{s.name}</button>)}
          </div>
        )}
        <div className="station">{heading}</div>
        <p className="muted small" style={{ margin: '0 0 8px' }}>
          Recorded: <b>{progress.done}</b> of {progress.total} active {station.type} entrants
          {' · '}
          <button className="link" onClick={() => setSound(s => !s)}>{sound ? 'Sound on' : 'Sound off'}</button>
          {' · '}
          <button className="link" onClick={() => reload(true)}>Refresh data</button>
        </p>

        {station.mode === 'dnf' && (
          <label>Reason (optional, applies to the next DNFs)<input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. mechanical, crash, retired" /></label>
        )}

        <input
          ref={inputRef} className="scanin" value={code} onChange={e => setCode(e.target.value)} onKeyDown={onKey}
          onBlur={() => setTimeout(focusInput, 150)}
          placeholder={placeholder} autoComplete="off" autoCapitalize="characters" autoCorrect="off" spellCheck={false}
          disabled={state === 'loading'}
        />
        <div className="row" style={{ marginTop: 8 }}>
          <button className="primary" onClick={() => { submit(code, 'manual'); setCode('') }} disabled={!code.trim()}>Record</button>
          <button onClick={() => setCamera(c => !c)}>{camera ? 'Close camera' : 'Use camera'}</button>
        </div>
        {camera && <Camera onCode={onCamera} onError={msg => { setCamera(false); setFb({ tone: 'bad', big: '!', what: 'CAMERA', sub: msg }) }} />}
      </div>

      {fb && (
        <div className={`result ${fb.tone}`} role="status" aria-live="polite">
          <div className="big">{fb.big}</div>
          <div className="what">{fb.what}</div>
          {fb.who && <div className="who2">{fb.who}</div>}
          {fb.sub && <div className="small" style={{ marginTop: 4 }}>{fb.sub}</div>}
          {fb.confirm && (
            <div className="row" style={{ justifyContent: 'center', marginTop: 12 }}>
              <button className="primary" onClick={() => { commit(fb.confirm!.entrant, fb.confirm!.method, fb.confirm!.message) }}>Record anyway</button>
              <button onClick={() => setFb(null)}>Cancel</button>
            </div>
          )}
        </div>
      )}

      {choices && (
        <div className="card">
          <h2>Which entrant?</h2>
          <div className="tablewrap">
            <table>
              <tbody>
                {choices.list.map(e => (
                  <tr key={e.id}>
                    <td className="num">#{e.competition_number}</td>
                    <td>{who(e)}</td>
                    <td>{e.entrant_type.toUpperCase()}</td>
                    <td className="muted">{licenceOf(e)}</td>
                    <td><button className="primary" disabled={isRecorded(e)} onClick={() => pick(e, choices.method, String(e.competition_number))}>{isRecorded(e) ? 'Recorded ✓' : 'Select'}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="primary" onClick={() => { setChoices(null); setFb(null) }}>Done</button>
        </div>
      )}

      {recent.length > 0 && (
        <div className="card">
          <h2>Recent (this session)</h2>
          {undoMsg && <p className="bad-text">{undoMsg}</p>}
          <div className="tablewrap">
            <table>
              <tbody>
                {recent.map(r => (
                  <tr key={r.key}>
                    <td className="num">#{r.entrant.competition_number}</td>
                    <td>{r.entrant.primary_name}</td>
                    <td>{r.label}</td>
                    <td className="muted">{time(r.at)}</td>
                    <td><button onClick={() => undo(r)}>Undo</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  )
}

export default function Page() { return <Shell needEvent><Content /></Shell> }
