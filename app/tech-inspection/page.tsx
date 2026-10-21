'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Shell } from '@/components/Shell'
import { useApp } from '@/components/AppProvider'
import styles from './tech.module.css'

type Row = {
  id: string
  submittedAt: string
  riderName: string
  competitionNumber: string
  className: string | null
  vehicleDescription: string | null
  status: string
  isJunior: boolean
  passCount: number
  failCount: number
  naCount: number
}

type Check = {
  result: 'pass' | 'fail' | 'na'
  comment: string | null
  itemName: string
  section: string
}

const STATUS_LABEL: Record<string, string> = {
  submitted: 'Submitted',
  requires_review: 'Requires review',
  accepted: 'Accepted',
  rejected: 'Rejected',
}

function fmt(d?: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleString('en-AU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function TechInspectionPage() {
  const app: any = useApp()
  const token: string | undefined = app?.session?.access_token
  const eventId: string | undefined = app?.event?.id

  const [rows, setRows] = useState<Row[]>([])
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<any>(null)
  const [checks, setChecks] = useState<Check[]>([])
  const [notes, setNotes] = useState('')
  const [editingVin, setEditingVin] = useState(false)
  const [vinDraft, setVinDraft] = useState('')

  const headers = useCallback(
    () => ({ Authorization: `Bearer ${token ?? ''}`, 'Content-Type': 'application/json' }),
    [token]
  )

  const loadList = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError('')
    try {
      const qs = eventId ? `?eventId=${encodeURIComponent(eventId)}` : ''
      const r = await fetch(`/api/admin/scrutineering${qs}`, { headers: headers(), cache: 'no-store' })
      const j = await r.json()
      if (!r.ok) {
        setError(j.error || 'Could not load submissions.')
        return
      }
      setRows(j.submissions)
    } catch {
      setError('Could not load submissions.')
    } finally {
      setLoading(false)
    }
  }, [token, eventId, headers])

  useEffect(() => {
    loadList()
  }, [loadList])

  async function openDetail(id: string) {
    setSelectedId(id)
    setEditingVin(false)
    setDetail(null)
    setChecks([])
    setError('')
    const r = await fetch(`/api/admin/scrutineering/${id}`, { headers: headers(), cache: 'no-store' })
    const j = await r.json()
    if (!r.ok) {
      setError(j.error || 'Could not load this form.')
      return
    }
    setDetail(j.submission)
    setChecks(j.checks)
    setNotes(j.submission.review_notes ?? '')
    window.scrollTo(0, 0)
  }

  async function setStatus(status: string) {
    if (!selectedId) return
    setBusy(true)
    setError('')
    const r = await fetch(`/api/admin/scrutineering/${selectedId}`, {
      method: 'PATCH',
      headers: headers(),
      body: JSON.stringify({ status, reviewNotes: notes }),
    })
    const j = await r.json()
    setBusy(false)
    if (!r.ok) {
      setError(j.error || 'Could not save.')
      return
    }
    setDetail((d: any) => ({ ...d, status, review_notes: notes }))
    loadList()
  }
  async function saveVin() {
    if (!selectedId) return
    const vin = vinDraft.trim().toUpperCase()
    if (!vin) { setError('The VIN cannot be empty.'); return }
    setBusy(true)
    setError('')
    const r = await fetch(`/api/admin/scrutineering/${selectedId}`, {
      method: 'PATCH',
      headers: headers(),
      body: JSON.stringify({ vin }),
    })
    const j = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { setError(j.error || 'Could not save the VIN.'); return }
    setDetail((d: any) => ({ ...d, vin }))
    setEditingVin(false)
  }
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length }
    rows.forEach((r) => (c[r.status] = (c[r.status] ?? 0) + 1))
    return c
  }, [rows])

  const shown = useMemo(() => {
    const s = search.trim().toLowerCase()
    return rows.filter(
      (r) =>
        (filter === 'all' || r.status === filter) &&
        (!s ||
          r.riderName?.toLowerCase().includes(s) ||
          String(r.competitionNumber).toLowerCase().includes(s))
    )
  }, [rows, filter, search])

  // ---------------- DETAIL ----------------
  if (selectedId) {
    const sections = Array.from(new Set(checks.map((c) => c.section)))
    return (
      <Shell>
        <button className={styles.back} onClick={() => setSelectedId(null)}>
          ← Back to list
        </button>

        {error && <div className="card bad">{error}</div>}

        {!detail ? (
          <p className="muted">Loading…</p>
        ) : (
          <>
            <div className="card">
              <div className={styles.head}>
                <h2 style={{ margin: 0 }}>
                  #{detail.competition_number} {detail.rider_name}
                </h2>
                <span className={`${styles.badge} ${styles[detail.status]}`}>
                  {STATUS_LABEL[detail.status] ?? detail.status}
                </span>
              </div>
              <p>Class: <b>{detail.class_name || '—'}</b></p>
              <p>Machine: <b>{detail.vehicle_description || '—'}</b></p>
              {detail.registration_number && <p>Registration: <b>{detail.registration_number}</b></p>}
                 {editingVin ? (
                <p>
                  VIN:{' '}
                  <input
                    value={vinDraft}
                    onChange={(e) => setVinDraft(e.target.value.toUpperCase())}
                    maxLength={40}
                    autoCapitalize="characters"
                    autoComplete="off"
                    style={{ width: 'auto', minWidth: 220 }}
                  />{' '}
                  <button disabled={busy} onClick={saveVin}>Save</button>{' '}
                  <button disabled={busy} onClick={() => setEditingVin(false)}>Cancel</button>
                </p>
              ) : (
                <p>
                  VIN: <b>{detail.vin || '—'}</b>{' '}
                  <button onClick={() => { setVinDraft(detail.vin ?? ''); setEditingVin(true) }}>Edit</button>
                </p>
              )}
              <p>Submitted: <b>{fmt(detail.submitted_at)}</b></p>
              <p>Rider signed: <b>{detail.rider_printed_name}</b> ({fmt(detail.rider_signed_at)})</p>
              {detail.is_junior && (
                <p>Junior, parent/guardian: <b>{detail.parent_guardian_printed_name || 'MISSING'}</b></p>
              )}
            </div>

            {sections.map((section) => (
              <div className="card" key={section}>
                <h2>{section}</h2>
                {checks
                  .filter((c) => c.section === section)
                  .map((c, i) => (
                    <div
                      key={i}
                      className={`${styles.checkRow} ${c.result === 'fail' ? styles.failRow : ''}`}
                    >
                      <div>
                        <div className={styles.checkName}>{c.itemName}</div>
                        {c.comment && <div className={styles.comment}>Comment: {c.comment}</div>}
                      </div>
                      <span className={`${styles.result} ${styles['r_' + c.result]}`}>
                        {c.result === 'na' ? 'N/A' : c.result.toUpperCase()}
                      </span>
                    </div>
                  ))}
              </div>
            ))}

            <div className="card">
              <h2>Official review</h2>
              <textarea
                className={styles.notes}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Review notes, e.g. Rear brake rechecked at sign-on, OK"
              />
              <div className={styles.actions}>
                <button className={styles.accept} disabled={busy} onClick={() => setStatus('accepted')}>
                  Accept
                </button>
                <button className={styles.review} disabled={busy} onClick={() => setStatus('requires_review')}>
                  Requires review
                </button>
                <button className={styles.reject} disabled={busy} onClick={() => setStatus('rejected')}>
                  Reject
                </button>
              </div>
            </div>
          </>
        )}
      </Shell>
    )
  }

  // ---------------- LIST ----------------
  return (
    <Shell>
      <div className="card">
        <div className={styles.head}>
          <h2 style={{ margin: 0 }}>Tech Inspection</h2>
          <button className={styles.refresh} onClick={loadList}>Refresh</button>
        </div>
        <p className="muted">Self-scrutineering forms submitted by riders.</p>

        <div className={styles.tabs}>
          {['all', 'requires_review', 'submitted', 'accepted', 'rejected'].map((s) => (
            <button
              key={s}
              className={filter === s ? styles.tabOn : styles.tab}
              onClick={() => setFilter(s)}
            >
              {s === 'all' ? 'All' : STATUS_LABEL[s]} ({counts[s] ?? 0})
            </button>
          ))}
        </div>

        <input
          className={styles.search}
          placeholder="Search name or number"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {error && <div className="card bad">{error}</div>}

      {loading ? (
        <p className="muted">Loading…</p>
      ) : shown.length === 0 ? (
        <p className="muted">No forms to show.</p>
      ) : (
        shown.map((r) => (
          <button key={r.id} className={styles.rowCard} onClick={() => openDetail(r.id)}>
            <div>
              <div className={styles.rowTitle}>
                #{r.competitionNumber} {r.riderName}
                {r.isJunior && <span className={styles.junior}>JUNIOR</span>}
              </div>
              <div className={styles.rowSub}>
                {r.className || '—'} · {r.vehicleDescription || '—'} · {fmt(r.submittedAt)}
              </div>
              <div className={styles.rowSub}>
                Pass {r.passCount} · Fail {r.failCount} · N/A {r.naCount}
              </div>
            </div>
            <span className={`${styles.badge} ${styles[r.status]}`}>
              {STATUS_LABEL[r.status] ?? r.status}
            </span>
          </button>
        ))
      )}
    </Shell>
  )
}
