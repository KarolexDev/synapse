// Turns entries into compact .ics events and hands them to the platform calendar:
// web → /api/ics (iOS shows "Add to Calendar"), dev → file download, artifact → downloads capability.

import { buildICS } from './ics.js'
import { layoutRange } from './layout.js'
import { addDays, startOfDay, parseDateKey } from './time.js'
import { IS_ARTIFACT } from './ai.js'

const ICAL_DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']
const pad = (n) => String(n).padStart(2, '0')
const local = (ms) => {
  const d = new Date(ms)
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`
}
const dateOnly = (ms) => local(ms).slice(0, 8)

function rrule(r) {
  if (!r) return undefined
  const base = r.freq === 'daily' ? 'FREQ=DAILY' : `FREQ=WEEKLY;BYDAY=${r.byWeekday.map((d) => ICAL_DAYS[d]).join(',')}`
  return r.until ? `${base};UNTIL=${r.until.replace(/-/g, '')}T235959` : base
}

/** Events for `ids` (or every planned non-routine entry when ids is null) found in the range. */
export function eventsInRange(entries, fromDay, days, ids = null) {
  const seen = new Set()
  const out = []
  for (const L of layoutRange(entries, fromDay, days)) {
    for (const o of [...L.allDay, ...L.occurrences]) {
      const e = o.entry
      if (seen.has(e.id)) continue
      if (ids ? !ids.includes(e.id) : e.role || e.status === 'cancelled' || e.hold) continue
      seen.add(e.id)
      const ev = { u: e.recurrence ? e.id : `${e.id}-${o.dateKey}`, t: e.title, d: e.reason || 'Planned with Synapse' }
      if (o.allDay) {
        const s = parseDateKey(e.date)
        Object.assign(ev, { a: 1, s: dateOnly(s), e: dateOnly(addDays(s, e.days || 1)) })
      } else Object.assign(ev, { s: local(o.start), e: local(o.end), m: 15 })
      const r = rrule(e.recurrence)
      if (r) ev.r = r
      out.push(ev)
    }
  }
  return out
}

export function eventsForEntry(entries, entry, now) {
  const dk = entry.chain?.dateKey ?? entry.date
  const from = !entry.recurrence && dk ? parseDateKey(dk) : startOfDay(now)
  return eventsInRange(entries, from, entry.recurrence ? 7 : Math.max(1, entry.days || 1), [entry.id])
}

const b64url = (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

function downloadFile(text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/calendar' }))
  const a = document.createElement('a')
  a.href = url
  a.download = 'synapse.ics'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export async function addToCalendar(events) {
  if (!events.length) return { ok: false, message: 'Nothing to add yet.' }
  if (IS_ARTIFACT) {
    const downloads = await window.claude?.use?.('downloads').catch(() => null)
    if (!downloads) return { ok: false, message: 'Saving files is not available here.' }
    try {
      await downloads.save({ filename: 'synapse.ics', data: buildICS(events) })
      return { ok: true }
    } catch (e) {
      return { ok: false, message: e?.code === 'cancelled' || e?.code === 'declined' ? 'Not saved.' : 'Could not save the calendar file.' }
    }
  }
  if (import.meta.env.DEV) {
    downloadFile(buildICS(events))
    return { ok: true }
  }
  window.location.href = `/api/ics?d=${b64url(JSON.stringify(events))}`
  return { ok: true }
}
