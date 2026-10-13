export type EntrantType = 'car' | 'bike'
export type EntrantStatus = 'active' | 'withdrawn' | 'dns'
export type ScanPoint = 'start' | 'finish'
export type Method = 'camera' | 'scanner' | 'manual'
export type Role = 'admin' | 'control' | 'scanner' | 'viewer'

export interface EventRow {
  id: string
  name: string
  event_date: string | null
  status: string
}

export interface Entrant {
  id: string
  event_id: string
  entrant_type: EntrantType
  competition_number: string
  scan_code: string
  primary_name: string
  secondary_name: string | null
  class_name: string | null
  vehicle_description: string | null
  registration_number: string | null
  status: EntrantStatus
}

export type NewEntrant = Omit<Entrant, 'id' | 'event_id' | 'status'>

export interface Stage {
  id: string
  event_id: string
  name: string
  sequence_number: number
  enabled: boolean
}

export interface BriefingRow {
  entrant_id: string
  attended_at: string
}

export interface ScanRow {
  entrant_id: string
  stage_id: string
  point: ScanPoint
  scanned_at: string
}

export interface ResultRow {
  entrant_id: string
  stage_id: string
  status: 'finished' | 'dnf'
  reason: string | null
  recorded_at: string
}

export interface EventData {
  entrants: Entrant[]
  stages: Stage[]
  briefing: BriefingRow[]
  scans: ScanRow[]
  results: ResultRow[]
}
