import type {
  BriefingRow, Entrant, EntrantType, NewEntrant, ResultRow, ScanPoint, ScanRow,
} from './types'

// ------------------------------------------------------------------ CSV

/** Minimal RFC-4180 style parser. Handles quotes, CRLF, BOM, and comma/tab/semicolon delimiters. */
export function parseCsv(input: string): string[][] {
  let text = input
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ''
  const delim = firstLine.includes(',') ? ','
    : firstLine.includes('\t') ? '\t'
    : firstLine.includes(';') ? ';' : ','

  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++ } else inQuotes = false
      } else cell += c
    } else if (c === '"') inQuotes = true
    else if (c === delim) { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell); cell = ''
      rows.push(row); row = []
    } else cell += c
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row) }
  return rows.filter(r => r.some(c => c.trim() !== ''))
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows
    .map(r => r.map(v => {
      const s = v == null ? '' : String(v)
      return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }).join(','))
    .join('\r\n')
}

// ------------------------------------------------------------------ entrant import

const HEADER_ALIASES: Record<string, string[]> = {
  type: ['type', 'entranttype', 'vehicletype'],
  number: ['number', 'no', 'num', 'competitionnumber', 'compno', 'raceno', 'carno', 'bikeno'],
  scan_code: ['scancode', 'barcode', 'code', 'qr', 'qrcode'],
  primary_name: ['name', 'primaryname', 'driver', 'rider', 'entrant', 'name1'],
  secondary_name: ['secondaryname', 'codriver', 'navigator', 'passenger', 'pillion', 'name2'],
  class_name: ['class', 'classname', 'grade'],
  vehicle_description: ['vehicle', 'vehicledescription', 'makemodel', 'machine'],
  registration_number: ['rego', 'registration', 'registrationnumber', 'plate'],
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

export function parseEntrantType(v: string): EntrantType | null {
  const s = v.trim().toLowerCase()
  if (['car', 'c', 'auto', 'cars'].includes(s)) return 'car'
  if (['bike', 'b', 'motorcycle', 'moto', 'm', 'bikes'].includes(s)) return 'bike'
  return null
}

export const normalizeCode = (s: string) => s.trim().toUpperCase()

export function defaultScanCode(type: EntrantType, number: string): string {
  return (type === 'car' ? 'C' : 'B') + number.replace(/\s+/g, '').toUpperCase()
}

export interface ImportResult {
  entrants: NewEntrant[]
  errors: string[]
}

export function csvToEntrants(rows: string[][], defaultType: EntrantType | null): ImportResult {
  const errors: string[] = []
  const entrants: NewEntrant[] = []
  if (rows.length < 2) return { entrants, errors: ['The file needs a header row and at least one entrant.'] }

  const headers = rows[0].map(norm)
  const col: Record<string, number> = {}
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    const idx = headers.findIndex(h => aliases.includes(h))
    if (idx >= 0) col[field] = idx
  }
  if (col.number === undefined) errors.push('No number column found. Use a header such as "Number" or "No".')
  if (col.primary_name === undefined) errors.push('No name column found. Use a header such as "Name", "Driver" or "Rider".')
  if (col.type === undefined && !defaultType) errors.push('No type column found. Add a "Type" column (car/bike) or pick a type before importing.')
  if (errors.length) return { entrants, errors }

  const get = (r: string[], f: string) => (col[f] === undefined ? '' : (r[col[f]] ?? '').trim())
  const seenNumbers = new Set<string>()
  const seenCodes = new Set<string>()

  rows.slice(1).forEach((r, i) => {
    const line = i + 2
    const type = col.type !== undefined ? parseEntrantType(get(r, 'type')) : defaultType
    if (!type) { errors.push(`Row ${line}: type "${get(r, 'type')}" is not car or bike.`); return }
    const number = get(r, 'number')
    const name = get(r, 'primary_name')
    if (!number) { errors.push(`Row ${line}: missing number.`); return }
    if (!name) { errors.push(`Row ${line}: missing name.`); return }
    const code = normalizeCode(get(r, 'scan_code')) || defaultScanCode(type, number)
    const numKey = `${type}:${number.toUpperCase()}`
    if (seenNumbers.has(numKey)) { errors.push(`Row ${line}: duplicate ${type} number ${number}.`); return }
    if (seenCodes.has(code)) { errors.push(`Row ${line}: duplicate scan code ${code}.`); return }
    seenNumbers.add(numKey); seenCodes.add(code)
    entrants.push({
      entrant_type: type,
      competition_number: number,
      scan_code: code,
      primary_name: name,
      secondary_name: get(r, 'secondary_name') || null,
      class_name: get(r, 'class_name') || null,
      vehicle_description: get(r, 'vehicle_description') || null,
      registration_number: get(r, 'registration_number') || null,
    })
  })
  return { entrants, errors }
}

export const CSV_TEMPLATE =
  'Type,Number,Name,Co-driver,Class,Vehicle,Rego,Scan code\r\n' +
  'bike,12,Jane Citizen,,Open,Yamaha MT-07,1ABC234,\r\n' +
  'car,5,John Smith,Sam Jones,Club,Datsun 1600,1XYZ987,\r\n'

// ------------------------------------------------------------------ lookup

export function compareNumbers(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}

export const byNumber = (a: Entrant, b: Entrant) =>
  compareNumbers(a.competition_number, b.competition_number)

/** Match on scan code first, then on competition number within the station's type. */
export function findEntrant(entrants: Entrant[], raw: string, stationType: EntrantType): Entrant | undefined {
  const code = normalizeCode(raw)
  if (!code) return undefined
  return (
    entrants.find(e => e.scan_code.toUpperCase() === code) ??
    entrants.find(e => e.entrant_type === stationType && e.competition_number.toUpperCase() === code)
  )
}

// ------------------------------------------------------------------ scan decisions

export type Mode = 'briefing' | 'start' | 'finish' | 'dnf'

export interface Recorded {
  briefing: BriefingRow[]
  scans: ScanRow[]
  results: ResultRow[]
}

export type Decision =
  | { kind: 'not_found' }
  | { kind: 'wrong_type'; entrant: Entrant }
  | { kind: 'duplicate'; entrant: Entrant; at: string; what: string }
  | { kind: 'confirm'; entrant: Entrant; message: string }
  | { kind: 'record'; entrant: Entrant; warning?: string }

export function decideScan(args: {
  entrants: Entrant[]
  code: string
  stationType: EntrantType
  mode: Mode
  stageId: string | null
  recorded: Recorded
}): Decision {
  const { entrants, code, stationType, mode, stageId, recorded } = args
  const entrant = findEntrant(entrants, code, stationType)
  if (!entrant) return { kind: 'not_found' }
  if (entrant.entrant_type !== stationType) return { kind: 'wrong_type', entrant }

  const inactive = entrant.status !== 'active'
    ? { kind: 'confirm' as const, entrant, message: `This entrant is marked ${entrant.status === 'dns' ? 'DNS (did not start)' : 'WITHDRAWN'}.` }
    : null

  if (mode === 'briefing') {
    const b = recorded.briefing.find(x => x.entrant_id === entrant.id)
    if (b) return { kind: 'duplicate', entrant, at: b.attended_at, what: 'Briefing already recorded' }
    return inactive ?? { kind: 'record', entrant }
  }

  if (!stageId) return { kind: 'not_found' }
  const dnf = recorded.results.find(r => r.entrant_id === entrant.id && r.stage_id === stageId && r.status === 'dnf')
  const stageScan = (point: ScanPoint) =>
    recorded.scans.find(s => s.entrant_id === entrant.id && s.stage_id === stageId && s.point === point)

  if (mode === 'dnf') {
    if (dnf) return { kind: 'duplicate', entrant, at: dnf.recorded_at, what: 'DNF already recorded' }
    const fin = stageScan('finish')
    if (fin) return { kind: 'confirm', entrant, message: 'This entrant already has a FINISH scan for this stage.' }
    return inactive ?? { kind: 'record', entrant }
  }

  const existing = stageScan(mode)
  if (existing) {
    return { kind: 'duplicate', entrant, at: existing.scanned_at, what: `${mode === 'start' ? 'Start' : 'Finish'} already recorded` }
  }
  if (inactive) return inactive
  if (dnf) return { kind: 'confirm', entrant, message: 'This entrant is recorded as DNF for this stage.' }
  if (mode === 'finish' && !stageScan('start')) {
    return { kind: 'record', entrant, warning: 'No start scan on file for this stage.' }
  }
  return { kind: 'record', entrant }
}

// ------------------------------------------------------------------ reports

export interface StageReport {
  briefing: { attended: Entrant[]; missing: Entrant[] }
  start: { done: Entrant[]; missing: Entrant[]; order: { entrant: Entrant; at: string }[] }
  finish: { done: Entrant[]; onCourse: Entrant[] }
  dnf: { entrant: Entrant; reason: string | null; at: string }[]
  total: number
}

export function computeReport(args: {
  entrants: Entrant[]
  type: EntrantType
  stageId: string
  briefing: BriefingRow[]
  scans: ScanRow[]
  results: ResultRow[]
}): StageReport {
  const { type, stageId } = args
  const all = args.entrants.filter(e => e.entrant_type === type).sort(byNumber)
  const active = all.filter(e => e.status === 'active')

  const briefed = new Set(args.briefing.map(b => b.entrant_id))
  const started = new Set(args.scans.filter(s => s.stage_id === stageId && s.point === 'start').map(s => s.entrant_id))
  const finished = new Set(args.scans.filter(s => s.stage_id === stageId && s.point === 'finish').map(s => s.entrant_id))
  const dnfRows = args.results.filter(r => r.stage_id === stageId && r.status === 'dnf')
  const dnfIds = new Set(dnfRows.map(r => r.entrant_id))

  const byId = new Map(all.map(e => [e.id, e]))
  return {
    total: active.length,
    briefing: {
      attended: active.filter(e => briefed.has(e.id)),
      missing: active.filter(e => !briefed.has(e.id)),
    },
    start: {
      done: active.filter(e => started.has(e.id)),
      // someone with a finish scan obviously started; someone DNF'd is accounted for
      missing: active.filter(e => !started.has(e.id) && !finished.has(e.id) && !dnfIds.has(e.id)),
      // everyone with a start scan for this stage, in the order they were scanned
      order: args.scans
        .filter(s => s.stage_id === stageId && s.point === 'start')
        .sort((a, b) => Date.parse(a.scanned_at) - Date.parse(b.scanned_at))
        .map(s => ({ entrant: byId.get(s.entrant_id)!, at: s.scanned_at }))
        .filter(x => x.entrant),
    },
    finish: {
      done: active.filter(e => finished.has(e.id)),
      onCourse: active.filter(e => started.has(e.id) && !finished.has(e.id) && !dnfIds.has(e.id)),
    },
    dnf: dnfRows
      .map(r => ({ entrant: byId.get(r.entrant_id)!, reason: r.reason, at: r.recorded_at }))
      .filter(r => r.entrant)
      .sort((a, b) => byNumber(a.entrant, b.entrant)),
  }
}
