'use client'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { getSupabase, isConfigured } from '@/lib/supabase'
import type { EventRow, Role } from '@/lib/types'

interface Ctx {
  ready: boolean
  session: Session | null
  role: Role | null
  events: EventRow[]
  event: EventRow | null
  setEventId: (id: string) => void
  refreshEvents: () => Promise<void>
  canManage: boolean // admin or control
  canRecord: boolean // admin, control or scanner
  canMedical: boolean // admin or medical
  signOut: () => Promise<void>
}

const AppCtx = createContext<Ctx | null>(null)
export const useApp = () => {
  const c = useContext(AppCtx)
  if (!c) throw new Error('useApp outside AppProvider')
  return c
}

const EVENT_KEY = 'kdr:eventId'

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false)
  const [session, setSession] = useState<Session | null>(null)
  const [role, setRole] = useState<Role | null>(null)
  const [events, setEvents] = useState<EventRow[]>([])
  const [eventId, setEventIdState] = useState<string | null>(null)

  const loadRole = useCallback(async (s: Session | null) => {
    if (!s) { setRole(null); return }
    const { data } = await getSupabase().from('user_roles').select('role').eq('user_id', s.user.id).maybeSingle()
    setRole((data?.role as Role) ?? null)
  }, [])

  const refreshEvents = useCallback(async () => {
    const { data } = await getSupabase().from('events').select('id,name,event_date,status').order('event_date', { ascending: false, nullsFirst: false })
    setEvents((data ?? []) as EventRow[])
  }, [])

  useEffect(() => {
    if (!isConfigured()) { setReady(true); return }
    try { setEventIdState(localStorage.getItem(EVENT_KEY)) } catch {}
    const sb = getSupabase()
    sb.auth.getSession().then(async ({ data }) => {
      setSession(data.session)
      await loadRole(data.session)
      setReady(true)
    })
    const { data: sub } = sb.auth.onAuthStateChange((_evt, s) => {
      setSession(s)
      // defer: calling supabase inside this callback can deadlock auth
      setTimeout(() => { void loadRole(s) }, 0)
    })
    return () => sub.subscription.unsubscribe()
  }, [loadRole])

  useEffect(() => { if (session && role) void refreshEvents() }, [session, role, refreshEvents])

  const setEventId = useCallback((id: string) => {
    setEventIdState(id)
    try { localStorage.setItem(EVENT_KEY, id) } catch {}
  }, [])

  const event = useMemo(
    () => events.find(e => e.id === eventId) ?? events[0] ?? null,
    [events, eventId],
  )

  const value: Ctx = {
    ready, session, role, events, event, setEventId, refreshEvents,
    canManage: role === 'admin' || role === 'control',
    canRecord: role === 'admin' || role === 'control' || role === 'scanner',
    canMedical: role === 'admin' || role === 'medical',
    signOut: async () => { await getSupabase().auth.signOut(); setRole(null); setEvents([]) },
  }
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>
}
