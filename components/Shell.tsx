'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { useApp } from './AppProvider'
import { isConfigured } from '@/lib/supabase'

const NAV = [
  { href: '/', label: 'Event' },
  { href: '/scan', label: 'Scan' },
  { href: '/reports', label: 'Reports' },
  { href: '/entrants', label: 'Entrants' },
  { href: '/labels', label: 'Labels' },
  { href: '/medical', label: 'Medical', medical: true },
  { href: '/tech-inspection', label: 'Tech Inspection' },
]

export function Shell({ children, needEvent = false }: { children: React.ReactNode; needEvent?: boolean }) {
  const app = useApp()
  const router = useRouter()
  const path = usePathname()

  useEffect(() => { if (app.ready && !app.session && isConfigured()) router.replace('/login') }, [app.ready, app.session, router])

  if (!isConfigured()) {
    return (
      <div className="wrap"><div className="card bad">
        <h2>Supabase isn’t configured</h2>
        <p>Copy <code>.env.example</code> to <code>.env.local</code> and set <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code>. On Vercel, add them under Project → Settings → Environment Variables, then redeploy.</p>
      </div></div>
    )
  }
  if (!app.ready || !app.session) return <div className="wrap muted">Loading…</div>

  return (
    <>
      <header className="top">
        <nav>
          {NAV.filter(n => !('medical' in n) || app.canMedical).map(n => (
            {n.href}{n.label}</Link>
          ))}
        </nav>
        <div className="who">
          {app.event && <span className="evt">{app.event.name}</span>}
          <span className="role">{app.role ?? 'no role'}</span>
          <button className="link" onClick={() => app.signOut()}>Sign out</button>
        </div>
      </header>
      <div className="wrap">
        {!app.role ? (
          <div className="card warn">
            <h2>Your account has no role yet</h2>
            <p>You’re signed in as <b>{app.session.user.email}</b>, but an admin hasn’t given you access. Ask them to add you, or if you’re setting this up, run the “make the first admin” SQL at the bottom of <code>002_roles.sql</code>.</p>
          </div>
        ) : needEvent && !app.event ? (
          <div className="card">
            <h2>No event yet</h2>
            <p>{app.canManage ? <>Create one on the <Link href="/">Event</Link> page.</> : 'Ask control to create the event.'}</p>
          </div>
        ) : children}
      </div>
    </>
  )
}
