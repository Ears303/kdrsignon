import { describe, expect, it } from 'vitest'
import {
  computeReport, csvToEntrants, decideScan, defaultScanCode, findEntrant, parseCsv, toCsv,
} from './logic'
import type { Entrant } from './types'

const mk = (n: string, type: 'car' | 'bike', extra: Partial<Entrant> = {}): Entrant => ({
  id: `${type}-${n}`, event_id: 'e1', entrant_type: type, competition_number: n,
  scan_code: defaultScanCode(type, n), primary_name: `Name ${n}`, secondary_name: null,
  class_name: null, vehicle_description: null, registration_number: null, status: 'active', ...extra,
})
const empty = { briefing: [], scans: [], results: [] }

describe('csv', () => {
  it('parses quotes, CRLF, BOM and embedded commas', () => {
    const rows = parseCsv('﻿A,B\r\n"x, y","he said ""hi"""\r\n')
    expect(rows).toEqual([['A', 'B'], ['x, y', 'he said "hi"']])
  })
  it('round-trips through toCsv', () => {
    const rows = [['a', 'b,c'], ['"q"', 'line\nbreak']]
    expect(parseCsv(toCsv(rows))).toEqual(rows)
  })
  it('accepts tab-separated paste from a spreadsheet', () => {
    expect(parseCsv('Type\tNumber\nbike\t1')).toEqual([['Type', 'Number'], ['bike', '1']])
  })
})

describe('csvToEntrants', () => {
  it('maps aliased headers and generates scan codes', () => {
    const r = csvToEntrants(parseCsv('Type,No,Rider,Class\nBike,12,Jane,Open\ncar,5,Bob,Club'), null)
    expect(r.errors).toEqual([])
    expect(r.entrants.map(e => [e.entrant_type, e.scan_code])).toEqual([['bike', 'B12'], ['car', 'C5']])
  })
  it('uses the default type when there is no type column', () => {
    const r = csvToEntrants(parseCsv('Number,Name\n1,A'), 'bike')
    expect(r.entrants[0].entrant_type).toBe('bike')
  })
  it('requires a type from somewhere', () => {
    expect(csvToEntrants(parseCsv('Number,Name\n1,A'), null).errors[0]).toMatch(/type/i)
  })
  it('reports duplicates and bad rows but keeps good ones', () => {
    const r = csvToEntrants(parseCsv('Type,Number,Name\nbike,1,A\nbike,1,B\nplane,2,C\nbike,,D\ncar,1,E'), null)
    expect(r.entrants.map(e => e.primary_name)).toEqual(['A', 'E'])
    expect(r.errors).toHaveLength(3)
  })
})

describe('findEntrant', () => {
  const list = [mk('12', 'bike'), mk('12', 'car')]
  it('matches scan code case-insensitively across types', () => {
    expect(findEntrant(list, ' c12 ', 'bike')?.entrant_type).toBe('car')
  })
  it('falls back to competition number within the station type', () => {
    expect(findEntrant(list, '12', 'car')?.id).toBe('car-12')
    expect(findEntrant(list, '12', 'bike')?.id).toBe('bike-12')
  })
})

describe('decideScan', () => {
  const entrants = [mk('1', 'bike'), mk('2', 'bike'), mk('3', 'bike', { status: 'withdrawn' }), mk('9', 'car')]
  const base = { entrants, stationType: 'bike' as const, stageId: 's1' }

  it('rejects unknown codes and the wrong vehicle type', () => {
    expect(decideScan({ ...base, code: 'zzz', mode: 'start', recorded: empty }).kind).toBe('not_found')
    expect(decideScan({ ...base, code: 'C9', mode: 'start', recorded: empty }).kind).toBe('wrong_type')
  })
  it('records a normal start and flags a duplicate', () => {
    expect(decideScan({ ...base, code: 'B1', mode: 'start', recorded: empty }).kind).toBe('record')
    const rec = { ...empty, scans: [{ entrant_id: 'bike-1', stage_id: 's1', point: 'start' as const, scanned_at: 't' }] }
    expect(decideScan({ ...base, code: 'B1', mode: 'start', recorded: rec }).kind).toBe('duplicate')
  })
  it('a start in another stage is not a duplicate', () => {
    const rec = { ...empty, scans: [{ entrant_id: 'bike-1', stage_id: 's0', point: 'start' as const, scanned_at: 't' }] }
    expect(decideScan({ ...base, code: 'B1', mode: 'start', recorded: rec }).kind).toBe('record')
  })
  it('finish without start records with a warning', () => {
    const d = decideScan({ ...base, code: 'B1', mode: 'finish', recorded: empty })
    expect(d).toMatchObject({ kind: 'record' })
    expect((d as { warning?: string }).warning).toMatch(/start/i)
  })
  it('asks for confirmation for withdrawn entrants and scans after DNF', () => {
    expect(decideScan({ ...base, code: 'B3', mode: 'start', recorded: empty }).kind).toBe('confirm')
    const rec = { ...empty, results: [{ entrant_id: 'bike-2', stage_id: 's1', status: 'dnf' as const, reason: null, recorded_at: 't' }] }
    expect(decideScan({ ...base, code: 'B2', mode: 'finish', recorded: rec }).kind).toBe('confirm')
    expect(decideScan({ ...base, code: 'B2', mode: 'dnf', recorded: rec }).kind).toBe('duplicate')
  })
  it('briefing is per event, not per stage, and de-duplicates', () => {
    const rec = { ...empty, briefing: [{ entrant_id: 'bike-1', attended_at: 't' }] }
    expect(decideScan({ ...base, stageId: null, code: 'B1', mode: 'briefing', recorded: rec }).kind).toBe('duplicate')
    expect(decideScan({ ...base, stageId: null, code: 'B2', mode: 'briefing', recorded: rec }).kind).toBe('record')
  })
})

describe('computeReport', () => {
  const entrants = [mk('1', 'bike'), mk('2', 'bike'), mk('3', 'bike'), mk('4', 'bike'), mk('5', 'bike', { status: 'dns' }), mk('7', 'car')]
  const sc = (n: string, point: 'start' | 'finish', stage = 's1') =>
    ({ entrant_id: `bike-${n}`, stage_id: stage, point, scanned_at: 't' })
  const r = computeReport({
    entrants, type: 'bike', stageId: 's1',
    briefing: [{ entrant_id: 'bike-1', attended_at: 't' }],
    scans: [sc('1', 'start'), sc('1', 'finish'), sc('2', 'start'), sc('3', 'start', 's0')],
    results: [{ entrant_id: 'bike-4', stage_id: 's1', status: 'dnf', reason: 'crash', recorded_at: 't' }],
  })
  const nums = (l: Entrant[]) => l.map(e => e.competition_number)

  it('excludes other vehicle types and non-active entrants from totals', () => {
    expect(r.total).toBe(4)
  })
  it('lists who missed the briefing', () => expect(nums(r.briefing.missing)).toEqual(['2', '3', '4']))
  it('lists who has not started (DNF and other-stage starts handled)', () =>
    expect(nums(r.start.missing)).toEqual(['3']))
  it('lists who is still on course', () => expect(nums(r.finish.onCourse)).toEqual(['2']))
  it('reports finishers and DNFs', () => {
    expect(nums(r.finish.done)).toEqual(['1'])
    expect(r.dnf.map(d => [d.entrant.competition_number, d.reason])).toEqual([['4', 'crash']])
  })
  it('sorts numerically, not alphabetically', () => {
    const many = ['10', '9', '1'].map(n => mk(n, 'bike'))
    const rep = computeReport({ entrants: many, type: 'bike', stageId: 's1', ...empty })
    expect(nums(rep.start.missing)).toEqual(['1', '9', '10'])
  })
})
