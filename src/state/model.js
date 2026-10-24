// Data model factories. Entries are calendar items (fixed or flex), tasks are to-dos (optionally
// time-blocked through a linked flex entry), shopping items aggregate into one grocery-run task.

export const DOMAINS = {
  work: { label: 'Work', color: '#60A5FA' },
  health: { label: 'Health', color: '#34D399' },
  errands: { label: 'Errands', color: '#F472B6' },
  chores: { label: 'Chores', color: '#FBBF24' },
  social: { label: 'Social', color: '#FB923C' },
  personal: { label: 'Personal', color: '#A78BFA' },
  admin: { label: 'Admin', color: '#2DD4BF' },
  travel: { label: 'Travel', color: '#38BDF8' },
  commute: { label: 'Commute', color: '#94A3B8' },
}

export const domainOf = (d) => (DOMAINS[d] ? d : 'personal')

let counter = 0
export function uid(prefix) {
  counter = (counter + 1) % 1296
  return `${prefix}_${Date.now().toString(36).slice(-5)}${Math.random().toString(36).slice(2, 6)}${counter.toString(36)}`
}

// shopHours: { days: [1..6], from: 'HH:MM', until: 'HH:MM' } and holidays: ['YYYY-MM-DD'] are supplied by Claude for the
// user's location; location comes from GPS (web app) and holds only city/region/country plus rounded coordinates.
export const DEFAULT_PREFS = { quietStart: '23:00', quietEnd: '07:00', shopHours: null, holidays: [], holidaysSetOn: null, location: null }

export const DEFAULT_SETTINGS = {
  tier: 'fast', // 'fast' | 'depth'
  timeOffsetMs: 0, // time travel offset; 0 = live
  demo: false,
}

export function makeEntry(fields) {
  return {
    id: fields.id || uid('e'),
    title: fields.title || 'Untitled',
    domain: domainOf(fields.domain),
    kind: fields.kind === 'fixed' ? 'fixed' : 'flex',
    date: fields.date ?? null,
    time: fields.time ?? null,
    allDay: !!fields.allDay,
    days: fields.days ?? 1,
    blocking: fields.blocking ?? true,
    durationMin: fields.durationMin ?? 30,
    deviation: { earlyMin: fields.deviation?.earlyMin ?? 0, lateMin: fields.deviation?.lateMin ?? 0 },
    recurrence: fields.recurrence ?? null,
    after: fields.after ?? null,
    before: fields.before ?? null,
    breaks: fields.breaks ?? [],
    role: fields.role ?? null,
    constraints: fields.constraints ?? {},
    chain: fields.chain ?? null,
    pinned: !!fields.pinned,
    taskId: fields.taskId ?? null,
    followUpOf: fields.followUpOf ?? null,
    hold: !!fields.hold,
    awaiting: fields.awaiting ?? null,
    status: fields.status || 'planned',
    source: fields.source || 'user',
    assumptions: fields.assumptions ?? [],
    reason: fields.reason ?? '',
    exceptions: fields.exceptions ?? {},
    batchId: fields.batchId ?? null,
    createdAt: fields.createdAt ?? Date.now(),
  }
}

export function makeTask(fields) {
  return {
    id: fields.id || uid('t'),
    title: fields.title || 'Untitled task',
    domain: domainOf(fields.domain),
    durationMin: fields.durationMin ?? null,
    due: fields.due ?? null,
    status: fields.status || 'open',
    entryId: fields.entryId ?? null,
    kind: fields.kind || 'task',
    followUpOf: fields.followUpOf ?? null,
    source: fields.source || 'user',
    reason: fields.reason ?? '',
    assumptions: fields.assumptions ?? [],
    batchId: fields.batchId ?? null,
    createdAt: fields.createdAt ?? Date.now(),
  }
}

export function makeShoppingItem(fields) {
  return {
    id: fields.id || uid('s'),
    name: fields.name,
    key: fields.key,
    qty: fields.qty ?? 1,
    neededOn: fields.neededOn ?? null,
    checked: !!fields.checked,
    mergedAt: fields.mergedAt ?? null,
    batchId: fields.batchId ?? null,
    createdAt: fields.createdAt ?? Date.now(),
  }
}

export function emptyData() {
  return { entries: [], tasks: [], shopping: [], clarifications: [], prefs: { ...DEFAULT_PREFS } }
}
