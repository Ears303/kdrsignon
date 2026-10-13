'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabase, isConfigured } from '@/lib/supabase'
import { useApp } from '@/components/AppProvider'

export default function Login() {
  const router = useRouter()
  const app = useApp()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => { if (app.ready && app.session) router.replace('/') }, [app.ready, app.session, router])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setErr('')
    const { error } = await getSupabase().auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (error) setErr(error.message)
  }

  return (
    <div className="wrap narrow">
      <form className="card" onSubmit={submit}>
        <h1>Event Check-In</h1>
        {!isConfigured() && <p className="bad-text">Supabase env vars are not set. See README.</p>}
        <label>Email<input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required /></label>
        <label>Password<input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required /></label>
        {err && <p className="bad-text">{err}</p>}
        <button className="primary" disabled={busy || !isConfigured()}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <p className="muted small">Accounts are created by an admin in Supabase.</p>
      </form>
    </div>
  )
}
