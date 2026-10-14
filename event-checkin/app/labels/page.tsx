'use client'
import { useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import { Shell } from '@/components/Shell'
import { useApp } from '@/components/AppProvider'
import { fetchAll } from '@/lib/supabase'
import { byNumber } from '@/lib/logic'
import type { Entrant, EntrantType } from '@/lib/types'

function Content() {
  const { event } = useApp()
  const [entrants, setEntrants] = useState<Entrant[]>([])
  const [type, setType] = useState<EntrantType>('bike')
  const [qr, setQr] = useState<Record<string, string>>({})
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!event) return
    fetchAll<Entrant>('entrants', event.id).then(setEntrants).catch(e => setErr(e.message))
  }, [event])

  const list = useMemo(() => entrants.filter(e => e.entrant_type === type && e.status !== 'withdrawn').sort(byNumber), [entrants, type])

  useEffect(() => {
    let alive = true
    ;(async () => {
      const out: Record<string, string> = {}
      for (const e of list) out[e.id] = await QRCode.toDataURL(e.scan_code, { margin: 1, width: 192, errorCorrectionLevel: 'M' })
      if (alive) setQr(out)
    })()
    return () => { alive = false }
  }, [list])

  return (
    <>
      <div className="noprint">
        <h1>Labels</h1>
        <p className="muted">QR codes containing each entrant’s scan code. Print and stick on bikes/cars or rider cards. Scanning also works by typing the competition number.</p>
        <div className="row" style={{ marginBottom: 12 }}>
          <div className="seg">{(['bike', 'car'] as const).map(t => <button key={t} className={type === t ? 'on' : ''} onClick={() => setType(t)}>{t.toUpperCase()}</button>)}</div>
          <button className="primary" onClick={() => window.print()} disabled={!list.length}>Print {list.length} labels</button>
        </div>
        {err && <p className="bad-text">{err}</p>}
      </div>
      <div className="labels">
        {list.map(e => (
          <div className="label" key={e.id}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {qr[e.id] ? <img src={qr[e.id]} alt={`QR ${e.scan_code}`} /> : <div style={{ width: 96, height: 96 }} />}
            <div>
              <div className="t">{e.entrant_type}</div>
              <div className="n">{e.competition_number}</div>
              <div className="nm">{e.primary_name}{e.secondary_name ? ` / ${e.secondary_name}` : ''}</div>
              <div className="cd">{e.scan_code}</div>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

export default function Page() { return <Shell needEvent><Content /></Shell> }
