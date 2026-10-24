// iCalendar (RFC 5545) output. Shared by the browser and the Vercel function, so it only formats
// compact, already-localized events and never touches Date time zones itself.
//
// Compact event: { u: uid, t: title, s: '20261027T180000', e: '20261027T190000',
//                  a?: 1 (all-day; s/e are 'YYYYMMDD'), r?: 'FREQ=WEEKLY;BYDAY=TU', d?: description, m?: alarm minutes }

const esc = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

const utf8Len = (s) => new TextEncoder().encode(s).length

// Fold content lines at 75 octets (continuation lines start with a space).
function fold(line) {
  if (utf8Len(line) <= 75) return line
  const parts = []
  let cur = ''
  let len = 0
  for (const ch of line) {
    const l = utf8Len(ch)
    const max = parts.length ? 74 : 75
    if (len + l > max) {
      parts.push(cur)
      cur = ''
      len = 0
    }
    cur += ch
    len += l
  }
  parts.push(cur)
  return parts.join('\r\n ')
}

const LOCAL = /^\d{8}T\d{6}$/
const DATE = /^\d{8}$/
const RRULE = /^[A-Z0-9=;,]+$/

export function buildICS(events, { now = new Date() } = {}) {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Synapse//Planner//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH']
  for (const ev of events) {
    const allDay = !!ev.a
    if (allDay ? !(DATE.test(ev.s) && DATE.test(ev.e)) : !(LOCAL.test(ev.s) && LOCAL.test(ev.e))) continue
    lines.push('BEGIN:VEVENT')
    lines.push(`UID:${esc(String(ev.u).slice(0, 80))}@synapse`)
    lines.push(`DTSTAMP:${stamp}`)
    lines.push(allDay ? `DTSTART;VALUE=DATE:${ev.s}` : `DTSTART:${ev.s}`)
    lines.push(allDay ? `DTEND;VALUE=DATE:${ev.e}` : `DTEND:${ev.e}`)
    lines.push(`SUMMARY:${esc(String(ev.t).slice(0, 120))}`)
    if (ev.d) lines.push(`DESCRIPTION:${esc(String(ev.d).slice(0, 500))}`)
    if (ev.r && RRULE.test(ev.r)) lines.push(`RRULE:${ev.r}`)
    if (!allDay && ev.m) {
      lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(String(ev.t).slice(0, 120))}`, `TRIGGER:-PT${Math.max(1, Math.min(1440, Math.round(ev.m)))}M`, 'END:VALARM')
    }
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}
