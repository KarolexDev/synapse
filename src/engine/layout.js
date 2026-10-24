// Expands entries into concrete occurrences for a given day.
//
// An occurrence carries its nominal [start, end] plus an uncertainty range for the end:
//   earlyEnd <= end <= lateEnd   (from the entry's deviation, inherited through chains)
// Chains: `before: X` ends where X starts (commute to work); `after: X` starts where X ends
// (commute home). Way-home errands join the `after` chain of a work entry for one date.

import { MIN, DAY, dateKey, parseDateKey, parseHM, atMinutes, weekday, startOfDay, addDays } from './time.js'

export function isOnDay(e, dk, dayMs = parseDateKey(dk)) {
  if (e.status === 'cancelled') return false
  const ex = e.exceptions?.[dk]
  if (ex?.cancelled) return false
  if (e.allDay) {
    const s = parseDateKey(e.date)
    if (s == null) return false
    return dayMs >= s && dayMs < addDays(s, Math.max(1, e.days || 1))
  }
  if (e.kind === 'flex') {
    if (e.chain) return e.chain.dateKey === dk
    return e.date === dk && e.time != null
  }
  if (e.recurrence) {
    const since = parseDateKey(e.date)
    if (since != null && dayMs < since) return false
    const until = parseDateKey(e.recurrence.until)
    if (until != null && dayMs > until) return false
    if (e.recurrence.freq === 'daily') return true
    return (e.recurrence.byWeekday || []).includes(weekday(dayMs))
  }
  return e.date === dk
}

function build(e, dk, start, { earliestStart = start, latestStart = start } = {}) {
  const ex = e.exceptions?.[dk] || {}
  const dur = e.durationMin * MIN
  let end = start + dur
  let earlyEnd = Math.min(end, Math.max(earliestStart + dur - (e.deviation?.earlyMin || 0) * MIN, earliestStart + 5 * MIN))
  let lateEnd = Math.max(end, latestStart + dur + (e.deviation?.lateMin || 0) * MIN)
  const actual = ex.actualEnd != null
  if (actual) end = earlyEnd = lateEnd = Math.max(ex.actualEnd, start + MIN)
  const breaks = (e.breaks || [])
    .map((b) => {
      const bm = parseHM(b.time)
      if (bm == null) return null
      const bs = atMinutes(start, bm)
      return { start: bs, end: bs + (b.durationMin || 30) * MIN, label: b.label || 'Break' }
    })
    .filter((b) => b && b.start >= start && b.end <= end)
  return {
    key: `${e.id}@${dk}`,
    entryId: e.id,
    entry: e,
    dateKey: dk,
    start,
    end,
    earlyEnd,
    lateEnd,
    earliestStart: Math.min(earliestStart, start),
    latestStart: Math.max(latestStart, start),
    breaks,
    actual,
    done: e.recurrence ? !!ex.done : e.status === 'done',
    allDay: false,
  }
}

export function layoutDay(entries, dayMs) {
  const day = startOfDay(dayMs)
  const dk = dateKey(day)
  const active = entries.filter((e) => isOnDay(e, dk, day))
  const allDay = active
    .filter((e) => e.allDay)
    .map((e) => ({ key: `${e.id}@${dk}`, entryId: e.id, entry: e, dateKey: dk, allDay: true, start: day, end: day + DAY, earlyEnd: day + DAY, lateEnd: day + DAY, done: e.status === 'done', breaks: [] }))
  const timed = active.filter((e) => !e.allDay)
  const occ = new Map()

  // Pass 1: entries with their own clock time.
  for (const e of timed) {
    if (e.after || e.before || e.chain) continue
    const t = parseHM(e.exceptions?.[dk]?.time ?? e.time)
    if (t == null) continue
    occ.set(e.id, build(e, dk, atMinutes(day, t)))
  }
  // Pass 2: "before" relations (leave so you arrive on time, even when running late).
  for (const e of timed) {
    if (!e.before) continue
    const target = occ.get(e.before)
    if (!target) continue
    const start = target.start - (e.durationMin + (e.deviation?.lateMin || 0)) * MIN
    occ.set(e.id, build(e, dk, start))
  }
  // Pass 3: "after" chains, resolved breadth-first so chains of chains work.
  const queue = [...occ.values()]
  const processed = new Set()
  while (queue.length) {
    const pred = queue.shift()
    if (processed.has(pred.entryId)) continue
    processed.add(pred.entryId)
    const successors = timed
      .filter((e) => !occ.has(e.id) && (e.after === pred.entryId || (e.chain && e.chain.after === pred.entryId)))
      .sort((a, b) => (a.chain ? 0 : 1) - (b.chain ? 0 : 1) || a.createdAt - b.createdAt)
    let cursor = { start: pred.end, earliest: pred.earlyEnd, latest: pred.lateEnd }
    for (const e of successors) {
      const o = build(e, dk, cursor.start, { earliestStart: cursor.earliest, latestStart: cursor.latest })
      occ.set(e.id, o)
      queue.push(o)
      cursor = { start: o.end, earliest: o.earlyEnd, latest: o.lateEnd }
    }
  }
  const timedOccs = [...occ.values()].sort((a, b) => a.start - b.start || a.end - b.end)
  return { dayMs: day, dateKey: dk, allDay, occurrences: timedOccs }
}

export function layoutRange(entries, fromDayMs, days) {
  const out = []
  for (let i = 0; i < days; i++) out.push(layoutDay(entries, addDays(startOfDay(fromDayMs), i)))
  return out
}

// The occurrence of a single entry on its day (non-recurring), or null.
export function occurrenceOf(entries, entry) {
  const dk = entry.chain?.dateKey ?? entry.date
  const day = parseDateKey(dk)
  if (day == null) return null
  return layoutDay(entries, day).occurrences.find((o) => o.entryId === entry.id) || null
}

// Busy span used for plan-safe placement: the whole uncertainty range is blocked.
export function busySpan(o) {
  return [Math.min(o.start, o.earliestStart ?? o.start), Math.max(o.end, o.lateEnd ?? o.end)]
}
