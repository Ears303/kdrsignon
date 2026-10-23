'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { useApp } from './AppProvider'
import { isConfigured } from '@/lib/supabase'

type App = ReturnType<typeof useApp>

// Which pages each role may open. The menu hides the rest, and typing the
// address of a hidden page shows "no access". (The database enforces the same
// limits; this just keeps people from landing on pages that will not work.)
const NAV: { href: string; label: string; show: (a: App) => boolean }[] = [
  { href: '/', label: 'Event', show: () => true },
  { href: '/scan', label: 'Scan', show: a => a.canRecord },
  { href: '/reports', label: 'Reports', show: a => a.canReports },
  { href: '/entrants', label: 'Entrants', show: a => a.canEntrants },
  { href: '/labels', label: 'Labels', show: a => a.canManage },
  { href: '/medical', label: 'Medical', show: a => a.canMedical },
  { href: '/tech-inspection', label: 'Tech Inspection', show: a => a.canReview },
  { href: '/notes', label: 'Notes', show: a => a.canNotes },
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

  // the page being viewed, if it is one of the menu pages (sub-pages count too)
  const current = NAV.find(n => n.href !== '/' && (path === n.href || path.startsWith(n.href + '/')))
  const blocked = !!app.role && !!current && !current.show(app)

  return (
    <>
      <header className="top">
        <Link href="/" style={{ display: 'flex', alignItems: 'center', marginRight: 12 }}>
          <img src="/logo.png" alt="Event logo" style={{ height: 36, width: 'auto', display: 'block' }} />
        </Link>
        <nav>
          {NAV.filter(n => n.show(app)).map(n => (
            <Link key={n.href} href={n.href} className={path === n.href ? 'active' : ''}>{n.label}</Link>
          ))}
        </nav>
        <div className="who">
          {app.event && <span className="evt">{app.event.name}</span>}
          <span className="role">
            {app.role ?? 'no role'}
            {app.role && app.scope !== 'both' ? ` · ${app.scope}s` : ''}
          </span>
          <button className="link" onClick={() => app.signOut()}>Sign out</button>
        </div>
      </header>
      <div className="wrap">
        {!app.role ? (
          <div className="card warn">
            <h2>Your account has no role yet</h2>
            <p>You’re signed in as <b>{app.session.user.email}</b>, but an admin hasn’t given you access. Ask them to add you, or if you’re setting this up, run the “make the first admin” SQL at the bottom of <code>002_roles.sql</code>.</p>
          </div>
        ) : blocked ? (
          <div className="card warn">
            <h2>No access to this page</h2>
            <p>Your role (<b>{app.role}</b>) can’t use {current!.label}. Use the menu above for the pages you can open, or ask an admin if you think this is wrong.</p>
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
