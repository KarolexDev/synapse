import { describe, it, expect } from 'vitest'
import { reducer, initialState } from '../src/state/store.js'
import { layoutDay } from '../src/engine/layout.js'
import { applyOps, shoppingKey, mergeShopping } from '../src/engine/ops.js'
import { findSlot } from '../src/engine/scheduler.js'
import { buildICS } from '../src/engine/ics.js'
import { eventsInRange } from '../src/engine/calendarExport.js'
import { emptyData, makeEntry } from '../src/state/model.js'
import { atMinutes, addDays, dateKey, fmtTime, parseDateKey, weekday, MIN } from '../src/engine/time.js'
import { demoDumpResult } from './fixtures.js'

const MON = new Date(2026, 9, 26, 8, 12).getTime() // Monday 08:12
const at = (dayOffset, h, m = 0) => atMinutes(addDays(MON, dayOffset), h * 60 + m)
const dk = (i) => dateKey(addDays(MON, i))

const demo = () => reducer(initialState(), { type: 'loadDemo', now: MON })
const occs = (state, i) => layoutDay(state.data.entries, addDays(MON, i)).occurrences
const occ = (state, i, title) => occs(state, i).find((o) => o.entry.title === title)
const entry = (state, title) => state.data.entries.find((e) => e.title === title)

function afterDump() {
  const s = demo()
  return reducer(s, { type: 'applyResult', now: MON, result: demoDumpResult(s.data, MON), meta: { model: 'test', ms: 1000, attempts: 1 } })
}

describe('layout: chains and uncertainty', () => {
  it('places commute before work and grocery run + commute after work with inherited uncertainty', () => {
    const s = demo()
    const commuteTo = occ(s, 0, 'Commute to work')
    expect(fmtTime(commuteTo.start)).toBe('08:25')
    expect(commuteTo.lateEnd).toBe(at(0, 9))
    const work = occ(s, 0, 'Work')
    expect([fmtTime(work.start), fmtTime(work.earlyEnd), fmtTime(work.end), fmtTime(work.lateEnd)]).toEqual(['09:00', '15:00', '17:00', '17:30'])
    const run = occ(s, 0, 'Grocery run')
    const home = occ(s, 0, 'Commute home')
    expect(fmtTime(run.start)).toBe('17:00')
    expect(fmtTime(run.earliestStart)).toBe('15:00')
    expect(fmtTime(home.start)).toBe('17:30')
    expect(fmtTime(home.lateEnd)).toBe('18:35')
  })

  it('has no work or commute on the weekend', () => {
    const s = demo()
    expect(occs(s, 5).map((o) => o.entry.title)).not.toContain('Work')
    expect(occs(s, 6).map((o) => o.entry.title)).toEqual(['Call parents'])
  })

  it('demo tasks with a duration get a block in the lunch break', () => {
    const s = demo()
    expect(fmtTime(occ(s, 0, 'Pay electricity bill').start)).toBe('12:30')
    expect(s.data.tasks.find((t) => t.title === 'Water the plants').entryId).toBeNull()
  })
})

describe('applying the stage dump', () => {
  it('merges duplicates and keeps one grocery run', () => {
    const s = afterDump()
    const names = s.data.shopping.map((i) => i.name)
    expect(names.filter((n) => n.toLowerCase() === 'milk')).toHaveLength(1)
    expect(names).toContain('Batteries')
    expect(s.data.tasks.filter((t) => t.kind === 'grocery_run')).toHaveLength(1)
    expect(s.log.some((l) => l.type === 'merge')).toBe(true)
  })

  it('spaces workouts with rest days around the trainer session', () => {
    const s = afterDump()
    const workouts = s.data.entries.filter((e) => e.title === 'Workout')
    expect(workouts).toHaveLength(2)
    const days = workouts.map((w) => weekday(parseDateKey(w.date))).sort()
    expect(days).toEqual([4, 6]) // Thursday, Saturday (trainer is Tuesday)
    const thu = workouts.find((w) => weekday(parseDateKey(w.date)) === 4)
    expect(thu.time).toBe('18:15') // after work + commute, plan-safe
    expect(s.log.some((l) => l.type === 'schedule' && l.lines.some((x) => x.includes('rest day')))).toBe(true)
  })

  it('places calls inside lunch breaks during business hours', () => {
    const s = afterDump()
    const calls = ['Call landlord about the sink', 'Call dentist to book'].map((t) => entry(s, t))
    for (const c of calls) {
      expect(['12:30', '12:45']).toContain(c.time)
      expect(weekday(parseDateKey(c.date))).toBeGreaterThanOrEqual(1)
    }
  })

  it('keeps the dentist hold waiting for the trip question', () => {
    const s = afterDump()
    const hold = entry(s, 'Dentist (hold)')
    expect(hold.awaiting).toBeTruthy()
    expect(hold.date).toBeNull()
    expect(s.data.clarifications).toHaveLength(2)
  })

  it('answering resolves: weekly trainer, trip with hold placed before its deadline', () => {
    let s = afterDump()
    const [q1, q2] = s.data.clarifications
    s = reducer(s, { type: 'answer', now: MON, qid: q1.id, optionId: q1.options[0].id, label: q1.options[0].label })
    expect(entry(s, 'Trainer session').recurrence).toEqual({ freq: 'weekly', byWeekday: [2], until: null })
    s = reducer(s, { type: 'answer', now: MON, qid: q2.id, optionId: q2.options[0].id, label: q2.options[0].label })
    const hold = entry(s, 'Dentist (hold)')
    expect(hold.awaiting).toBeNull()
    expect(hold.date).not.toBeNull()
    expect(parseDateKey(hold.date)).toBeLessThanOrEqual(parseDateKey(hold.constraints.deadline))
    // Weekdays are full during business hours, so the hold lands on Saturday morning.
    expect(weekday(parseDateKey(hold.date))).toBe(6)
    expect(entry(s, 'Trip').allDay).toBe(true)
    const pack = s.data.tasks.find((t) => t.title === 'Pack bag')
    expect(pack.followUpOf).toBe(entry(s, 'Trip').id)
    expect(s.data.clarifications).toHaveLength(0)
  })

  it('undo restores the plan before the dump', () => {
    const before = demo()
    let s = reducer(before, { type: 'applyResult', now: MON, result: demoDumpResult(before.data, MON), batchId: 'b1' })
    s = reducer(s, { type: 'undo', batchId: 'b1', now: MON })
    expect(s.data).toEqual(before.data)
  })
})

describe('live reflow', () => {
  it('finishing work early moves the chain and pulls an item forward into freed time', () => {
    let s = afterDump()
    const work = entry(s, 'Work')
    s = reducer(s, { type: 'finishedEarly', id: work.id, dateKey: dk(0), now: at(0, 15) })
    expect(fmtTime(occ(s, 0, 'Grocery run').start)).toBe('15:00')
    expect(fmtTime(occ(s, 0, 'Commute home').start)).toBe('15:30')
    const reflow = s.log.findLast((l) => l.type === 'reflow')
    expect(reflow.title).toMatch(/ended 2 h early/)
    expect(s.stats.reclaimedMin).toBe(120)
    // Something from tomorrow (business-hours call) got pulled into today after the commute.
    const pulled = s.data.entries.find((e) => e.date === dk(0) && e.time === '16:15')
    expect(pulled).toBeTruthy()
  })

  it('running late pushes items that would collide', () => {
    let s = afterDump()
    const work = entry(s, 'Work')
    const thu = s.data.entries.find((e) => e.title === 'Workout' && weekday(parseDateKey(e.date)) === 4)
    s = reducer(s, { type: 'runningLate', id: work.id, dateKey: thu.date, minutes: 60, now: at(3, 16, 30) })
    const moved = s.data.entries.find((e) => e.id === thu.id)
    expect(moved.time > '18:15' || moved.date !== thu.date).toBe(true)
  })

  it('missed flex items roll over to the next slot', () => {
    let s = demo()
    s = reducer(s, { type: 'tick', now: at(0, 14) })
    const bill = entry(s, 'Pay electricity bill')
    expect(bill.date === dk(0) ? bill.time >= '18:00' : true).toBe(true)
    expect(s.log.some((l) => l.type === 'rollover')).toBe(true)
  })
})

describe('ops safety', () => {
  it('rejects unknown ops and invalid targets without crashing', () => {
    const r = applyOps(emptyData(), [{ op: 'explode' }, { op: 'update', target: 'nope', set: { title: 'x' } }, null], { now: MON, batchId: 'b' })
    expect(r.logs.filter((l) => l.type === 'error')).toHaveLength(2)
  })

  it('turns a fixed entry without a time into a flex entry', () => {
    const r = applyOps(emptyData(), [{ op: 'add_entry', kind: 'fixed', title: 'Haircut', durationMin: 45 }], { now: MON, batchId: 'b' })
    expect(r.data.entries[0].kind).toBe('flex')
    expect(r.data.entries[0].date).not.toBeNull()
  })

  it('never places flex items in the past or in quiet hours', () => {
    const entries = [makeEntry({ title: 'Read', kind: 'flex', durationMin: 60 })]
    const late = at(0, 22, 40)
    const r = findSlot(entries[0], { entries, now: late, prefs: { quietStart: '23:00', quietEnd: '07:00' } })
    expect(r.start).toBe(at(1, 7))
  })

  it('normalizes shopping names', () => {
    expect(shoppingKey('Batteries')).toBe('battery')
    expect(shoppingKey('2 tomatoes')).toBe('tomato')
    expect(shoppingKey('glass')).toBe('glass')
    const { list, merged } = mergeShopping([{ id: 's1', name: 'Milk', key: 'milk', qty: 1, checked: true }], [{ name: 'milk' }], { now: MON })
    expect(list).toHaveLength(1)
    expect(list[0].checked).toBe(false)
    expect(merged[0]).toMatch(/re-added/)
  })
})

describe('calendar export', () => {
  it('builds valid iCalendar with recurrence and alarms', () => {
    let s = afterDump()
    const [q1] = s.data.clarifications
    s = reducer(s, { type: 'answer', now: MON, qid: q1.id, optionId: q1.options[0].id, label: 'Every Tuesday' })
    const events = eventsInRange(s.data.entries, MON, 7)
    expect(events.some((e) => e.t === 'Work')).toBe(false) // routines are skipped
    const ics = buildICS(events, { now: new Date(MON) })
    expect(ics).toContain('BEGIN:VCALENDAR')
    expect(ics).toContain('RRULE:FREQ=WEEKLY;BYDAY=TU')
    expect(ics).toContain('TRIGGER:-PT15M')
    expect(ics.split('\r\n').every((line) => new TextEncoder().encode(line).length <= 75)).toBe(true)
  })
})

describe('time helpers', () => {
  it('formats durations', async () => {
    const { fmtDuration } = await import('../src/engine/time.js')
    expect(fmtDuration(45)).toBe('45 min')
    expect(fmtDuration(120)).toBe('2 h')
    expect(fmtDuration(135)).toBe('2 h 15 min')
    expect(MIN).toBe(60000)
  })
})

describe('/api/ics function', () => {
  it('serves text/calendar for a valid payload and 400 otherwise', async () => {
    const { default: handler } = await import('../api/ics.js')
    const res = () => {
      const r = { headers: {}, code: 0, body: '' }
      r.setHeader = (k, v) => ((r.headers[k] = v), r)
      r.status = (c) => ((r.code = c), r)
      r.send = (b) => ((r.body = b), r)
      return r
    }
    const events = [{ u: 'e1', t: 'Workout', s: '20261029T181500', e: '20261029T191500', m: 15 }]
    const ok = res()
    handler({ query: { d: Buffer.from(JSON.stringify(events)).toString('base64url') } }, ok)
    expect(ok.code).toBe(200)
    expect(ok.headers['Content-Type']).toMatch(/text\/calendar/)
    expect(ok.body).toContain('SUMMARY:Workout')
    const bad = res()
    handler({ query: { d: 'not-json' } }, bad)
    expect(bad.code).toBe(400)
  })
})
