import type { Entrant } from './types'

// Works with or without ridernet_id on the Entrant type
type Row = Entrant & { ridernet_id?: string | null }

export type MatchKind = 'number' | 'licence' | 'scan' | 'name'
export type LookupHit<T> = { entrant: T; matchedOn: MatchKind }

const clean = (v: unknown) => String(v ?? '').trim().toLowerCase()
const isDigits = (s: string) => /^\d+$/.test(s)
const stripZeros = (s: string) => s.replace(/^0+(?=\d)/, '')

/** Exact match; numeric values ignore leading zeros (Excel strips them). */
function same(a: unknown, b: unknown): boolean {
  const x = clean(a)
  const y = clean(b)
  if (!x || !y) return false
  if (isDigits(x) && isDigits(y)) return stripZeros(x) === stripZeros(y)
  return x === y
}

/** Strip scanner noise: spaces, prefixes like "MA:", trailing CR/LF. */
export function cleanScan(raw: string): string {
  return String(raw ?? '').replace(/[\r\n\t]/g, '').trim().replace(/^[a-z]+[:#-]\s*/i, '')
}

/**
 * Initial check-in lookup: search by competition number, RidernetID or name.
 * - A 6+ digit entry is checked as RidernetID first, then as a number.
 * - Shorter entries are checked as a competition number first, then RidernetID.
 * - Text entries search names (every word must match, in any order).
 * Returns every match so the page can show a pick list if more than one comes back
 * (e.g. the same number in bike and car).
 */
export function findEntrants<T extends Row>(list: T[], query: string, limit = 25): LookupHit<T>[] {
  const q = clean(query)
  if (!q) return []

  const hits: LookupHit<T>[] = []
  const seen = new Set<string>()
  const add = (kind: MatchKind, test: (e: T) => boolean) => {
    for (const e of list) {
      if (!seen.has(e.id) && test(e)) {
        seen.add(e.id)
        hits.push({ entrant: e, matchedOn: kind })
      }
    }
  }

  const byNumber = () => add('number', e => same(e.competition_number, q))
  const byLicence = () => add('licence', e => same(e.ridernet_id, q))

  if (isDigits(q) && q.length >= 6) { byLicence(); byNumber() }
  else { byNumber(); byLicence() }

  add('scan', e => same(e.scan_code, q))

  if (/[a-z]/.test(q)) {
    const words = q.split(/\s+/).filter(Boolean)
    add('name', e => {
      const name = `${clean(e.primary_name)} ${clean(e.secondary_name)}`
      return words.every(w => name.includes(w))
    })
  }

  return hits.slice(0, limit)
}

/**
 * Briefing scan: match on the competitor's licence (RidernetID).
 * Falls back to the old scan_code so existing cards/QRs still work.
 * Returns an array: 1 = sign in, 0 = not found, >1 = ask which entry.
 */
export function findByLicence<T extends Row>(list: T[], scanned: string): T[] {
  const code = cleanScan(scanned)
  if (!code) return []
  const byLicence = list.filter(e => same(e.ridernet_id, code))
  if (byLicence.length) return byLicence
  return list.filter(e => same(e.scan_code, code))
}
