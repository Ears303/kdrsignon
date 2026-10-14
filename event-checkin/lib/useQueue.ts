'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { getSupabase } from './supabase'

export type QueueTable = 'briefing_attendance' | 'stage_scans' | 'stage_results'
export interface QueueItem {
  qid: string
  table: QueueTable
  row: Record<string, unknown> & { event_id: string }
}
export interface FailedItem { item: QueueItem; message: string }

const KEY = 'kdr:queue'
const FAILED_KEY = 'kdr:queue-failed'

function read<T>(key: string): T[] {
  try { return JSON.parse(localStorage.getItem(key) ?? '[]') as T[] } catch { return [] }
}
function write(key: string, v: unknown) {
  try { localStorage.setItem(key, JSON.stringify(v)) } catch {}
}
export const readQueue = () => read<QueueItem>(KEY)

// Network failures from supabase-js carry no Postgres error code; expired-token (PGRST30x) is also worth retrying.
const retryable = (code?: string) => !code || code.startsWith('PGRST30')

/**
 * Every scan goes through here: stored locally first, then sent. If the network drops the scans
 * stay queued (and survive a page reload) and are sent as soon as it's back.
 */
export function useQueue(onFailed?: () => void) {
  const items = useRef<QueueItem[]>([])
  const flushing = useRef(false)
  const [pending, setPending] = useState(0)
  const [failed, setFailed] = useState<FailedItem[]>([])
  const [online, setOnline] = useState(true)
  const onFailedRef = useRef(onFailed)
  onFailedRef.current = onFailed

  const sync = useCallback(() => { write(KEY, items.current); setPending(items.current.length) }, [])

  const flush = useCallback(async () => {
    if (flushing.current) return
    flushing.current = true
    try {
      while (items.current.length) {
        const it = items.current[0]
        const { error } = await getSupabase().from(it.table).insert(it.row)
        items.current = items.current.filter(x => x.qid !== it.qid)
        if (!error || error.code === '23505') { sync(); continue } // saved, or already there
        if (retryable(error.code)) { items.current.unshift(it); sync(); setOnline(false); return }
        const f = [...read<FailedItem>(FAILED_KEY), { item: it, message: error.message }]
        write(FAILED_KEY, f); setFailed(f); sync()
      }
      setOnline(true)
    } catch {
      setOnline(false)
    } finally {
      flushing.current = false
    }
  }, [sync])

  useEffect(() => {
    items.current = read<QueueItem>(KEY)
    setPending(items.current.length)
    setFailed(read<FailedItem>(FAILED_KEY))
    void flush()
    const t = setInterval(() => { void flush() }, 8000)
    const on = () => { void flush() }
    window.addEventListener('online', on)
    return () => { clearInterval(t); window.removeEventListener('online', on) }
  }, [flush])

  const enqueue = useCallback((table: QueueTable, row: QueueItem['row']) => {
    const qid = crypto.randomUUID()
    items.current.push({ qid, table, row })
    sync()
    void flush()
    return qid
  }, [flush, sync])

  /** Remove a not-yet-sent item. Returns false if it had already been sent. */
  const cancel = useCallback((qid: string) => {
    const had = items.current.some(x => x.qid === qid)
    if (had) { items.current = items.current.filter(x => x.qid !== qid); sync() }
    return had
  }, [sync])

  const dismissFailed = useCallback(() => {
    write(FAILED_KEY, []); setFailed([]); onFailedRef.current?.()
  }, [])

  return { pending, failed, online, enqueue, cancel, flush, dismissFailed }
}
