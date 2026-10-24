// Local-time helpers. All timestamps are epoch ms; "dateKey" is YYYY-MM-DD in local time.

export const MIN = 60_000
export const HOUR = 60 * MIN
export const DAY = 24 * HOUR

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const pad = (n) => String(n).padStart(2, '0')

export function startOfDay(ms) {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

// Adding days via setDate keeps wall-clock times stable across DST changes.
export function addDays(ms, n) {
  const d = new Date(ms)
  d.setDate(d.getDate() + n)
  return d.getTime()
}

export function dateKey(ms) {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function parseDateKey(key) {
  if (typeof key !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return null
  const [y, m, d] = key.split('-').map(Number)
  const t = new Date(y, m - 1, d).getTime()
  return Number.isNaN(t) ? null : t
}

export function parseHM(hm) {
  if (typeof hm !== 'string') return null
  const m = hm.match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 24 || min > 59) return null
  return h * 60 + min
}

export function hm(minutes) {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`
}

// Timestamp at a given minute-of-day on the day of `dayMs`.
export function atMinutes(dayMs, minutes) {
  const d = new Date(startOfDay(dayMs))
  d.setHours(0, minutes, 0, 0)
  return d.getTime()
}

export function minutesOfDay(ms) {
  const d = new Date(ms)
  return d.getHours() * 60 + d.getMinutes()
}

export function weekday(ms) {
  return new Date(ms).getDay()
}

export function fmtTime(ms) {
  return hm(minutesOfDay(ms))
}

export function fmtRange(a, b) {
  return `${fmtTime(a)}–${fmtTime(b)}`
}

export function fmtDay(ms, now) {
  if (now != null) {
    const diff = Math.round((startOfDay(ms) - startOfDay(now)) / DAY)
    if (diff === 0) return 'Today'
    if (diff === 1) return 'Tomorrow'
    if (diff === -1) return 'Yesterday'
  }
  const d = new Date(ms)
  return `${WEEKDAYS[d.getDay()]} ${MONTHS[d.getMonth()]} ${d.getDate()}`
}

export function fmtDayLong(ms) {
  const d = new Date(ms)
  return `${WEEKDAYS_LONG[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`
}

export function fmtWhen(ms, now) {
  return `${fmtDay(ms, now)} ${fmtTime(ms)}`
}

export function fmtDuration(min) {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h} h ${m} min` : `${h} h`
}

export function ceilTo(ms, stepMin) {
  const step = stepMin * MIN
  return Math.ceil(ms / step) * step
}

// Monday 00:00 of the week containing `ms`.
export function startOfWeek(ms) {
  const wd = weekday(ms)
  return addDays(startOfDay(ms), wd === 0 ? -6 : 1 - wd)
}
