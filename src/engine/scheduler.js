// Deterministic placement of flexible entries. Claude only describes *what* is needed; this module
// decides *when*. Placement is plan-safe: the full uncertainty range of every occurrence is blocked.

import { MIN, DAY, addDays, startOfDay, dateKey, parseDateKey, parseHM, atMinutes, weekday, ceilTo, fmtDay, fmtTime } from './time.js'
import { layoutDay, isOnDay, busySpan, occurrenceOf } from './layout.js'

export const STEP_MIN = 15
export const HORIZON_DAYS = 56

const isWeekend = (day) => weekday(day) === 0 || weekday(day) === 6

/** True when shops are closed all day (weekday not in the shop days, or a public holiday). */
export function shopsClosed(prefs, day) {
  const h = prefs?.shopHours
  if (!h) return false
  return !h.days.includes(weekday(day)) || (prefs.holidays || []).includes(dateKey(day))
}

function shopWindow(prefs, day) {
  const h = prefs?.shopHours
  if (!h) return null
  return { start: atMinutes(day, parseHM(h.from) ?? 0), end: atMinutes(day, parseHM(h.until) ?? 24 * 60), label: 'opening hours' }
}

export function dayBounds(day, prefs) {
  const open = parseHM(prefs?.quietEnd) ?? 7 * 60
  const quiet = parseHM(prefs?.quietStart) ?? 23 * 60
  const close = quiet > open ? quiet : 24 * 60
  return [atMinutes(day, open), atMinutes(day, close)]
}

// End of the after-work chain (work + way-home errands + commute home), using the latest likely end.
export function afterWorkEnd(occs) {
  const chain = occs.filter((o) => o.entry.role === 'work' || o.entry.role === 'commute_home' || o.entry.chain)
  if (!chain.some((o) => o.entry.role === 'work')) return null
  return Math.max(...chain.map((o) => o.lateEnd))
}

export function windowsFor(tokens, day, occs, prefs) {
  const at = (m) => atMinutes(day, m)
  const wd = weekday(day)
  const out = []
  const push = (start, end, label) => end > start && out.push({ start, end, label })
  for (const tok of tokens) {
    switch (tok) {
      case 'morning': push(at(7 * 60), at(12 * 60), 'morning'); break
      case 'lunch':
        for (const o of occs) for (const b of o.breaks || []) push(b.start, b.end, b.label.toLowerCase())
        break
      case 'afternoon': push(at(12 * 60), at(17 * 60), 'afternoon'); break
      case 'evening': push(at(17 * 60), at(22 * 60), 'evening'); break
      case 'after_work': {
        const end = afterWorkEnd(occs)
        if (end) push(end, at(22 * 60), 'after work')
        else if (!isWeekend(day)) push(at(17 * 60), at(22 * 60), 'evening')
        break
      }
      case 'weekend': if (isWeekend(day)) push(at(9 * 60), at(20 * 60), 'weekend'); break
      case 'weekend_morning': if (isWeekend(day)) push(at(9 * 60), at(12 * 60), 'weekend morning'); break
      case 'weekday': if (!isWeekend(day)) push(...dayBounds(day, prefs), 'weekday'); break
      case 'business_hours':
        if (!isWeekend(day)) push(at(8 * 60), at(18 * 60), 'business hours')
        else if (wd === 6) push(at(9 * 60), at(13 * 60), 'Saturday business hours')
        break
      case 'any': push(...dayBounds(day, prefs), 'free time'); break
      default: break
    }
  }
  return out
}

function intersect(windows, limits) {
  const out = []
  for (const w of windows)
    for (const l of limits) {
      const s = Math.max(w.start, l.start)
      const e = Math.min(w.end, l.end)
      if (e > s) out.push({ start: s, end: e, label: w.label })
    }
  return out
}

function busyIntervals(occs, selfId, quick) {
  const out = []
  for (const o of occs) {
    if (o.entryId === selfId) continue
    const [s, e] = busySpan(o)
    if (quick && o.breaks?.length) {
      let cursor = s
      for (const b of [...o.breaks].sort((a, c) => a.start - c.start)) {
        if (b.start > cursor) out.push({ s: cursor, e: b.start, title: o.entry.title })
        cursor = Math.max(cursor, b.end)
      }
      if (e > cursor) out.push({ s: cursor, e, title: o.entry.title })
    } else out.push({ s, e, title: o.entry.title })
  }
  return out
}

function findOnDay(entry, day, { others, prefs, earliest, deadlineEnd }) {
  const L = layoutDay(others, day)
  const blockingAllDay = L.allDay.find((o) => o.entry.blocking)
  if (blockingAllDay) return { blockers: [blockingAllDay.entry.title] }
  const c = entry.constraints || {}
  if (c.storeHours && shopsClosed(prefs, day)) return { closed: true }
  const dur = entry.durationMin * MIN
  const buf = (c.bufferMin || 0) * MIN
  const busy = busyIntervals(L.occurrences, entry.id, entry.durationMin <= 30)
  const tokens = c.preferred?.length ? c.preferred : ['any']
  const [open, close] = dayBounds(day, prefs)
  let windows = windowsFor(tokens, day, L.occurrences, prefs)
  if (c.businessHours) windows = intersect(windows, windowsFor(['business_hours'], day, L.occurrences, prefs))
  if (c.storeHours && prefs?.shopHours) windows = intersect(windows, [shopWindow(prefs, day)])
  // Token order is priority order within a day ("lunch" before "business_hours"), so no re-sorting.
  windows = windows
    .map((w) => ({ ...w, start: Math.max(w.start, open, earliest), end: Math.min(w.end, close, deadlineEnd) }))
    .filter((w) => w.end - w.start >= dur)
  const blockers = new Set()
  for (const w of windows) {
    let t = ceilTo(w.start, STEP_MIN)
    while (t + dur <= w.end) {
      const clash = busy.find((b) => b.s < t + dur + buf && b.e > t - buf)
      if (!clash) return { start: t, window: w.label }
      blockers.add(clash.title)
      t = ceilTo(clash.e + buf, STEP_MIN)
    }
  }
  return { blockers: [...blockers] }
}

function groupInfo(entry, others) {
  const c = entry.constraints || {}
  if (!c.group && !c.spacingWith?.length) return null
  const members = others.filter(
    (e) => e.status !== 'cancelled' && ((c.group && e.constraints?.group === c.group) || c.spacingWith?.includes(e.id)),
  )
  return { members, minRest: Math.max(0, c.minRestDays ?? 0) }
}

// Returns a conflicting group member if `day` is too close to one of its sessions.
function tooClose(day, group, restDays) {
  for (let d = -restDays; d <= restDays; d++) {
    const other = addDays(day, d)
    const hit = group.members.find((m) => isOnDay(m, dateKey(other), other))
    if (hit) return { member: hit, day: other }
  }
  return null
}

const withPlacement = (e, p) => ({ ...e, date: p.date ?? null, time: p.time ?? null, chain: p.chain ?? null })

function wayHomeSlot(entry, others, earliest, firstDay, lastDay, prefs) {
  const storeHours = entry.constraints?.storeHours
  for (let day = firstDay; day <= lastDay; day = addDays(day, 1)) {
    const L = layoutDay(others, day)
    if (L.allDay.some((o) => o.entry.blocking)) continue
    if (storeHours && shopsClosed(prefs, day)) continue
    const work = L.occurrences.find((o) => o.entry.role === 'work')
    if (!work || work.end < earliest) continue
    const shop = storeHours ? shopWindow(prefs, day) : null
    // Plan-safe: even if work runs late, the stop must still fit before closing.
    if (shop && (work.lateEnd + entry.durationMin * MIN > shop.end || work.earlyEnd < shop.start)) continue
    return { chain: { after: work.entryId, dateKey: L.dateKey }, work }
  }
  return null
}

/**
 * Find a slot for a flex entry. `hint.onDate` restricts the search to one day; `hint.spreadRest`
 * is a soft minimum of rest days used to spread a series evenly (falls back to the hard minimum).
 * Returns { placement, start, window, notes, rejections }.
 */
export function findSlot(entry, { entries, now, prefs }, hint = {}) {
  const c = entry.constraints || {}
  const others = entries.filter((e) => e.id !== entry.id)
  const notBefore = parseDateKey(c.notBefore)
  const earliest = Math.max(ceilTo(now + 5 * MIN, STEP_MIN), notBefore ?? 0)
  let firstDay = startOfDay(earliest)
  const deadlineDay = parseDateKey(c.deadline)
  let lastDay = deadlineDay != null && deadlineDay >= firstDay ? deadlineDay : addDays(firstDay, HORIZON_DAYS)
  const deadlineEnd = deadlineDay != null && deadlineDay >= firstDay ? addDays(deadlineDay, 1) : Infinity
  const notes = []
  const rejections = []
  if (deadlineDay != null && deadlineDay < firstDay) notes.push(`Deadline ${fmtDay(deadlineDay)} already passed — finding the next free slot`)
  if (hint.onDate) {
    const d = parseDateKey(hint.onDate)
    if (d == null || d < firstDay || d > lastDay) return { placement: null, notes, rejections }
    firstDay = lastDay = d
  }

  if (c.wayHome) {
    const r = wayHomeSlot(entry, others, earliest, firstDay, lastDay, prefs)
    if (r) {
      const placed = withPlacement(entry, { chain: r.chain })
      const occ = occurrenceOf([...others, placed], placed)
      return { placement: { chain: r.chain }, start: occ?.start, window: 'on the way home', notes, rejections }
    }
    notes.push('No commute before then, so it gets its own trip')
    entry = { ...entry, constraints: { ...c, wayHome: false, preferred: ['evening', 'weekend'] } }
  }

  const group = groupInfo(entry, others)
  const attempt = (rest) => {
    const skipped = []
    for (let day = firstDay; day <= lastDay; day = addDays(day, 1)) {
      if (group) {
        const clash = tooClose(day, group, rest)
        if (clash) {
          if (skipped.length < 3)
            skipped.push(`${fmtDay(day)} skipped — ${clash.member.title} on ${fmtDay(clash.day)} (keeping ${rest} rest day${rest === 1 ? '' : 's'} between sessions)`)
          continue
        }
      }
      const r = findOnDay(entry, day, { others, prefs, earliest, deadlineEnd })
      if (r.start != null) return { placement: { date: dateKey(day), time: fmtTime(r.start) }, start: r.start, window: r.window, skipped }
      if (r.closed && skipped.length < 3) skipped.push(`${fmtDay(day)}: shops are closed`)
      if (r.blockers?.length && skipped.length < 3 && (day - firstDay) / DAY < 2)
        skipped.push(`${fmtDay(day)}: no fitting slot (${r.blockers.slice(0, 2).join(', ')})`)
    }
    return { skipped }
  }
  let res = null
  if (group && hint.spreadRest > group.minRest) {
    res = attempt(hint.spreadRest)
    if (!res.placement) res = null
  }
  if (!res) res = attempt(group ? group.minRest : 0)
  rejections.push(...res.skipped)
  return res.placement
    ? { placement: res.placement, start: res.start, window: res.window, notes, rejections }
    : { placement: null, notes, rejections }
}

export { withPlacement }

const isMovable = (e) => e.kind === 'flex' && e.status === 'planned' && !e.recurrence && !e.awaiting && !e.allDay

/**
 * Re-plan one day after an occurrence ended early or ran late. Same-day flex items are re-placed
 * at the earliest safe time; with `pullForward`, items from the next two days may move into
 * freed time today. Returns { entries, moves: [{ entry, from, to }] }.
 */
export function reflowDay(entries, day, now, prefs, { pullForward = false } = {}) {
  const dk = dateKey(day)
  let list = entries
  const moves = []
  const move = (e, r, from) => {
    const updated = withPlacement(e, r.placement)
    list = list.map((x) => (x.id === e.id ? updated : x))
    moves.push({ entry: updated, from, to: r.start })
  }
  const sameDay = list
    .filter((e) => isMovable(e) && !e.pinned && !e.chain && e.date === dk && e.time)
    .sort((a, b) => parseHM(a.time) - parseHM(b.time))
  for (const e of sameDay) {
    const occ = occurrenceOf(list, e)
    if (!occ || occ.start < now) continue
    let r = findSlot(e, { entries: list, now, prefs }, { onDate: dk })
    if (!r.placement) r = findSlot(e, { entries: list, now, prefs })
    if (r.placement && r.start !== occ.start) move(e, r, occ.start)
  }
  if (pullForward) {
    const soon = [dateKey(addDays(day, 1)), dateKey(addDays(day, 2))]
    const later = list
      .filter((e) => isMovable(e) && !e.pinned && !e.hold && !e.chain && soon.includes(e.date))
      .sort((a, b) => a.date.localeCompare(b.date) || parseHM(a.time) - parseHM(b.time))
    for (const e of later) {
      const occ = occurrenceOf(list, e)
      const r = findSlot(e, { entries: list, now, prefs }, { onDate: dk })
      if (r.placement && occ && r.start < occ.start) move(e, r, occ.start)
    }
  }
  return { entries: list, moves }
}

/** Flex items whose block ended (+15 min grace) without being done move to the next slot. */
export function rolloverMissed(entries, now, prefs) {
  let list = entries
  const moves = []
  for (const e of entries) {
    if (!isMovable(e) || !(e.chain || (e.date && e.time))) continue
    const occ = occurrenceOf(list, e)
    if (!occ || occ.end + 15 * MIN >= now) continue
    const cleared = { ...e, date: null, time: null, chain: null, pinned: false }
    const r = findSlot(cleared, { entries: list.map((x) => (x.id === e.id ? cleared : x)), now, prefs })
    const updated = r.placement ? withPlacement(cleared, r.placement) : cleared
    list = list.map((x) => (x.id === e.id ? updated : x))
    moves.push({ entry: updated, from: occ.start, to: r.start ?? null })
  }
  return { entries: list, moves }
}
