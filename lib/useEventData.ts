'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchAll, getSupabase } from './supabase'
import type { BriefingRow, EventData, Entrant, ResultRow, ScanRow, Stage } from './types'

export const EMPTY: EventData = { entrants: [], stages: [], briefing: [], scans: [], results: [] }
const cacheKey = (id: string) => `kdr:data:${id}`

export type LoadState = 'loading' | 'ready' | 'cached' | 'error'

/**
 * Loads everything for an event. If the network is down it falls back to the last copy saved on this
 * device (so a scan station that was loaded once keeps working). `overlay` lets the caller layer
 * not-yet-sent scans on top of what the server returned.
 */
export function useEventData(eventId: string | null, overlay?: (d: EventData) => EventData) {
  const [data, setData] = useState<EventData>(EMPTY)
  const [state, setState] = useState<LoadState>('loading')
  const [error, setError] = useState('')
  const overlayRef = useRef(overlay)
  overlayRef.current = overlay

  const load = useCallback(async (silent = false) => {
    if (!eventId) return
    const apply = (d: EventData) => setData(overlayRef.current ? overlayRef.current(d) : d)
    try {
      const sb = getSupabase()
      const [entrants, stagesRes, briefing, scans, results] = await Promise.all([
        fetchAll<Entrant>('entrants', eventId),
        sb.from('stages').select('*').eq('event_id', eventId).order('sequence_number'),
        fetchAll<BriefingRow>('briefing_attendance', eventId, 'entrant_id,attended_at'),
        fetchAll<ScanRow>('stage_scans', eventId, 'entrant_id,stage_id,point,scanned_at'),
        fetchAll<ResultRow>('stage_results', eventId, 'entrant_id,stage_id,status,reason,recorded_at'),
      ])
      if (stagesRes.error) throw stagesRes.error
      const d: EventData = { entrants, stages: (stagesRes.data ?? []) as Stage[], briefing, scans, results }
      try { localStorage.setItem(cacheKey(eventId), JSON.stringify(d)) } catch {}
      apply(d)
      setState('ready'); setError('')
    } catch (e) {
      // a background refresh that fails keeps what's on screen; the cache could be older than that
      if (silent) return
      let cached: EventData | null = null
      try { cached = JSON.parse(localStorage.getItem(cacheKey(eventId)) ?? 'null') } catch {}
      if (cached) { apply(cached); setState('cached') }
      else { setState('error'); setError((e as Error).message) }
    }
  }, [eventId])

  useEffect(() => { setState('loading'); setData(EMPTY); void load() }, [load])

  return { data, setData, state, error, reload: load }
}
