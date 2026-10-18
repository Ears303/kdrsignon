'use client'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { getSupabase, isConfigured } from '@/lib/supabase'
import type { EntrantType, EventRow, Role } from '@/lib/types'
import type { Mode } from '@/lib/logic'

export type VehicleScope = 'both' | 'bike' | 'car'

interface Ctx {
  ready: boolean
  session: Session | null
  role: Role | null
  scope: VehicleScope // which vehicle types this person may work with
  events: EventRow[]
  event: EventRow | null
  setEventId: (id: string) => void
  refreshEvents: () => Promise<void>
  canManage: boolean // admin or control
  canRecord: boolean // may open the scan page: admin, control, scanner or dnf_entry
  canDnf: boolean // may record a DNF: admin, control or dnf_entry
  canMedical: boolean // admin or medical
  canReview: boolean // may review scrutineering forms: admin, control or scrutineer
  canReports: boolean // may see reports: admin, control, viewer or medical
  canEntrants: boolean // may see the entrant list: admin, control or viewer
  scanTypes: EntrantType[] // vehicle types the scan page offers
  scanModes: Mode[] // scan modes the scan page offers
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
  const [scope, setScope] = useState<VehicleScope>('both')
  const [events, setEvents] = useState<EventRow[]>([])
  const [eventId, setEventIdState] = useState<string | null>(null)

  const loadRole = useCallback(async (s: Session | null) => {
    if (!s) { setRole(null); setScope('both'); return }
    const sb = getSupabase()
    // vehicle_scope is added by the database migration; if it is not there yet, fall back to role only
    let res: any = await sb.from('user_roles').select('role,vehicle_scope').eq('user_id', s.user.id).maybeSingle()
    if (res.error) res = await sb.from('user_roles').select('role').eq('user_id', s.user.id).maybeSingle()
    setRole((res.data?.role as Role) ?? null)
    const sc = res.data?.vehicle_scope
    setScope(sc === 'bike' || sc === 'car' ? sc : 'both')
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

  // kept as stable arrays so pages can depend on them without re-running effects
  const scanTypes = useMemo<EntrantType[]>(() => (scope === 'both' ? ['bike', 'car'] : [scope]), [scope])
  const scanModes = useMemo<Mode[]>(() => {
    if (role === 'admin' || role === 'control') return ['briefing', 'start', 'finish', 'dnf']
    if (role === 'scanner') return ['briefing', 'start', 'finish'] // sign-in only
    if (role === 'dnf_entry') return ['dnf']
    return []
  }, [role])

  const is = (...r: Role[]) => !!role && r.includes(role)

  const value: Ctx = {
    ready, session, role, scope, events, event, setEventId, refreshEvents,
    canManage: is('admin', 'control'),
    canRecord: is('admin', 'control', 'scanner', 'dnf_entry'),
    canDnf: is('admin', 'control', 'dnf_entry'),
    canMedical: is('admin', 'medical'),
    canReview: is('admin', 'control', 'scrutineer'),
    canReports: is('admin', 'control', 'viewer', 'medical'),
    canEntrants: is('admin', 'control', 'viewer'),
    scanTypes, scanModes,
    signOut: async () => { await getSupabase().auth.signOut(); setRole(null); setScope('both'); setEvents([]) },
  }
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>
}
