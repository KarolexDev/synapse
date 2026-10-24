// Applies Claude's structured operations to app data. Everything coming from the model is
// sanitized here; placement of flex items is delegated to the deterministic scheduler.

import { makeEntry, makeTask, makeShoppingItem, uid, domainOf } from '../state/model.js'
import { findSlot, withPlacement, shopsClosed } from './scheduler.js'
import { occurrenceOf, isOnDay } from './layout.js'
import { parseDateKey, parseHM, fmtWhen, fmtDay, startOfDay, addDays, dateKey, DAY, WEEKDAYS_LONG } from './time.js'

const PREF_TOKENS = new Set(['morning', 'lunch', 'afternoon', 'evening', 'after_work', 'weekend', 'weekend_morning', 'weekday', 'business_hours', 'any'])
const ROLES = new Set(['work', 'commute_to', 'commute_home'])

const str = (v, max = 120) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const strArr = (v, max = 4) => (Array.isArray(v) ? v.map((x) => str(x, 120)).filter(Boolean).slice(0, max) : [])
const int = (v, lo, hi, dflt) => {
  const n = Math.round(Number(v))
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt
}
const vDate = (s) => (parseDateKey(s) != null ? s : null)
const vTime = (s) => {
  const m = parseHM(s)
  return m == null ? null : `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}
const slug = (s) => str(s, 40).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'group'

function sanitizeDeviation(d, fallback = { earlyMin: 0, lateMin: 0 }) {
  if (!d || typeof d !== 'object') return fallback
  return { earlyMin: int(d.earlyMin, 0, 480, fallback.earlyMin), lateMin: int(d.lateMin, 0, 480, fallback.lateMin) }
}

function sanitizeRecurrence(r) {
  if (!r || typeof r !== 'object') return null
  const freq = r.freq === 'daily' ? 'daily' : r.freq === 'weekly' ? 'weekly' : null
  if (!freq) return null
  const byWeekday = [...new Set((r.byWeekday || []).map((x) => int(x, 0, 6, -1)).filter((x) => x >= 0))].sort()
  if (freq === 'weekly' && !byWeekday.length) return null
  return { freq, byWeekday, until: vDate(r.until) }
}

function sanitizeConstraints(c, resolve) {
  if (!c || typeof c !== 'object') return {}
  const out = {}
  if (vDate(c.notBefore)) out.notBefore = c.notBefore
  if (vDate(c.deadline)) out.deadline = c.deadline
  const preferred = (c.preferred || []).filter((t) => PREF_TOKENS.has(t))
  if (preferred.length) out.preferred = preferred
  if (c.businessHours) out.businessHours = true
  if (c.wayHome) out.wayHome = true
  if (c.storeHours) out.storeHours = true
  if (c.minRestDays != null) out.minRestDays = int(c.minRestDays, 0, 6, 0)
  if (c.group) out.group = slug(c.group)
  if (Array.isArray(c.spacingWith)) out.spacingWith = c.spacingWith.map(resolve).filter(Boolean)
  if (c.bufferMin != null) out.bufferMin = int(c.bufferMin, 0, 120, 0)
  return out
}

function sanitizeBreaks(b) {
  if (!Array.isArray(b)) return []
  return b
    .map((x) => ({ time: vTime(x?.time), durationMin: int(x?.durationMin, 5, 120, 30), label: str(x?.label, 30) || 'Break' }))
    .filter((x) => x.time)
    .slice(0, 3)
}

// ---------- shopping ----------

export function shoppingKey(name) {
  let s = str(name, 60).toLowerCase()
  s = s.replace(/^(\d+\s*x?\s+|a\s+|an\s+|some\s+|more\s+)/, '').replace(/\s+/g, ' ').trim()
  const words = s.split(' ')
  let last = words.pop() || ''
  if (last.endsWith('ies') && last.length > 4) last = last.slice(0, -3) + 'y'
  else if (last.endsWith('oes') && last.length > 4) last = last.slice(0, -2)
  else if (last.endsWith('s') && !last.endsWith('ss') && last.length > 3) last = last.slice(0, -1)
  return [...words, last].join(' ')
}

export function mergeShopping(list, items, { now, batchId, neededOn = null }) {
  let out = [...list]
  const added = []
  const merged = []
  for (const it of items || []) {
    const name = str(typeof it === 'string' ? it : it?.name, 60)
    if (!name) continue
    const qty = int(it?.qty, 1, 99, 1)
    const key = shoppingKey(name)
    const existing = out.find((s) => s.key === key)
    if (existing) {
      const need = [existing.checked ? null : existing.neededOn, neededOn].filter(Boolean).sort()[0] || null
      out = out.map((s) => (s.id === existing.id ? { ...s, checked: false, qty: Math.max(s.qty, qty), mergedAt: now, neededOn: need } : s))
      merged.push(existing.checked ? `${existing.name} (re-added)` : existing.name)
    } else {
      const display = name.charAt(0).toUpperCase() + name.slice(1)
      out.push(makeShoppingItem({ name: display, key, qty, neededOn, batchId, createdAt: now }))
      added.push(display)
    }
  }
  return { list: out, added, merged }
}

// ---------- ops ----------

/**
 * Apply a list of ops. ctx: { now, batchId, source, refs: Map(ref -> id) } — refs is shared so
 * clarification options can reference items created earlier in the same batch.
 */
export function applyOps(data, ops, ctx) {
  const { now, batchId } = ctx
  const source = ctx.source || 'ai'
  const refs = ctx.refs || new Map()
  const resolve = (x) => (x == null || x === '' ? null : refs.get(String(x)) ?? String(x))
  const logs = []
  const log = (type, title, detail = '', refIds = [], lines = []) =>
    logs.push({ id: uid('l'), ts: now, type, title, detail, refs: refIds, lines, batchId })

  let entries = [...data.entries]
  let tasks = [...data.tasks]
  let shopping = [...data.shopping]
  let prefs = { ...data.prefs }
  const queue = [] // { id, hint, reason }
  const series = new Map() // group -> ids created in this batch
  const stats = { added: 0, updated: 0, cancelled: 0, completed: 0, merged: 0 }
  let seq = 0

  const setEntry = (id, fn) => (entries = entries.map((e) => (e.id === id ? fn(e) : e)))
  const setTask = (id, fn) => (tasks = tasks.map((t) => (t.id === id ? fn(t) : t)))
  const lookup = (raw) => {
    const id = resolve(raw)
    const entry = entries.find((e) => e.id === id)
    const task = tasks.find((t) => t.id === id) || (entry?.taskId ? tasks.find((t) => t.id === entry.taskId) : null)
    const linked = entry || (task?.entryId ? entries.find((e) => e.id === task.entryId) : null)
    const item = shopping.find((s) => s.id === id)
    return { id, entry: linked, task, item }
  }

  for (const raw of Array.isArray(ops) ? ops : []) {
    try {
      switch (raw?.op) {
        case 'add_entry': {
          const kind = raw.kind === 'fixed' ? 'fixed' : 'flex'
          const count = kind === 'flex' ? int(raw.count, 1, 14, 1) : 1
          const constraints = sanitizeConstraints(raw.constraints, resolve)
          if (count > 1 && !constraints.group) constraints.group = slug(raw.title)
          const base = {
            title: str(raw.title, 80) || 'Untitled',
            domain: domainOf(raw.domain),
            kind,
            date: vDate(raw.date),
            time: vTime(raw.time),
            allDay: !!raw.allDay,
            days: int(raw.days, 1, 60, 1),
            blocking: raw.blocking !== false,
            durationMin: int(raw.durationMin, 5, 720, kind === 'fixed' ? 60 : 30),
            deviation: sanitizeDeviation(raw.deviation),
            recurrence: sanitizeRecurrence(raw.recurrence),
            after: resolve(raw.after),
            before: resolve(raw.before),
            breaks: sanitizeBreaks(raw.breaks),
            role: ROLES.has(raw.role) ? raw.role : null,
            constraints,
            hold: !!raw.hold,
            awaiting: raw.awaiting ? resolve(raw.awaiting) : null,
            source,
            assumptions: strArr(raw.assumptions),
            reason: str(raw.reason, 240),
            followUpOf: resolve(raw.followUpOf),
            batchId,
          }
          if (kind === 'fixed' && !base.allDay && !base.after && !base.before && !(base.time && (base.date || base.recurrence))) {
            base.kind = 'flex' // a "fixed" item without a concrete time can only be planned
          }
          for (let i = 0; i < count; i++) {
            const id = uid('e')
            if (raw.ref && i === 0) refs.set(String(raw.ref), id)
            const title = count > 1 ? `${base.title}` : base.title
            const entry = makeEntry({ ...base, id, title, createdAt: now + seq++ })
            if (entry.kind === 'flex' && entry.date && entry.time) entry.pinned = true
            entries.push(entry)
            stats.added++
            if (entry.kind === 'fixed') {
              log('add', `Added ${entry.title}`, entry.reason, [id])
            } else if (!entry.pinned && !entry.awaiting) {
              queue.push({ id, hint: entry.date ? { onDate: entry.date } : {} })
              if (entry.date) setEntry(id, (e) => ({ ...e, date: null }))
              if (count > 1) series.set(constraints.group, [...(series.get(constraints.group) || []), id])
            } else if (entry.awaiting) {
              log('add', `${entry.title} is waiting for your answer`, entry.reason, [id])
            } else {
              log('add', `Added ${entry.title}`, entry.reason, [id])
            }
          }
          break
        }
        case 'add_task': {
          const tid = uid('t')
          if (raw.ref) refs.set(String(raw.ref), tid)
          const durationMin = raw.durationMin ? int(raw.durationMin, 5, 480, 30) : null
          const task = makeTask({
            id: tid,
            title: str(raw.title, 80) || 'Untitled task',
            domain: domainOf(raw.domain),
            durationMin,
            due: vDate(raw.due),
            followUpOf: resolve(raw.followUpOf),
            source,
            reason: str(raw.reason, 240),
            assumptions: strArr(raw.assumptions),
            batchId,
            createdAt: now + seq++,
          })
          stats.added++
          if (durationMin) {
            const constraints = sanitizeConstraints(raw.constraints, resolve)
            if (task.due && !constraints.deadline) constraints.deadline = task.due
            const awaiting = raw.awaiting ? resolve(raw.awaiting) : null
            const entry = makeEntry({
              title: task.title, domain: task.domain, kind: 'flex', durationMin, constraints, taskId: tid, awaiting,
              source, reason: task.reason, assumptions: task.assumptions, followUpOf: task.followUpOf, batchId, createdAt: now + seq++,
            })
            task.entryId = entry.id
            entries.push(entry)
            if (!awaiting) queue.push({ id: entry.id, hint: vDate(raw.date) ? { onDate: raw.date } : {} })
            else log('add', `${task.title} is waiting for your answer`, task.reason, [tid])
          } else {
            log('add', `Task: ${task.title}`, [task.reason, task.due ? `Due ${fmtDay(parseDateKey(task.due))}` : 'No time block needed'].filter(Boolean).join(' · '), [tid])
          }
          tasks.push(task)
          break
        }
        case 'add_shopping': {
          const neededOn = vDate(raw.neededOn)
          const r = mergeShopping(shopping, raw.items, { now, batchId, neededOn })
          shopping = r.list
          if (r.added.length) log('add', `Shopping list: +${r.added.join(', ')}`, [str(raw.reason, 200), neededOn ? `Needed ${fmtDay(parseDateKey(neededOn))}` : ''].filter(Boolean).join(' · '))
          if (r.merged.length) {
            stats.merged += r.merged.length
            log('merge', `Already on your list: ${r.merged.join(', ')}`, 'Merged instead of adding duplicates')
          }
          break
        }
        case 'update': {
          const { id, entry, task, item } = lookup(raw.target)
          const set = raw.set && typeof raw.set === 'object' ? raw.set : {}
          if (!entry && !task && !item) {
            log('error', 'Could not find the item to update', String(raw.target || ''))
            break
          }
          stats.updated++
          if (item && set.name) {
            shopping = shopping.map((s) => (s.id === item.id ? { ...s, name: str(set.name, 60), key: shoppingKey(set.name) } : s))
          }
          if (task) {
            setTask(task.id, (t) => ({
              ...t,
              title: set.title ? str(set.title, 80) : t.title,
              domain: set.domain ? domainOf(set.domain) : t.domain,
              due: 'due' in set ? vDate(set.due) : t.due,
            }))
          }
          if (entry) {
            const onlyDate = vDate(raw.onlyDate)
            if (entry.recurrence && onlyDate) {
              setEntry(entry.id, (e) => ({ ...e, exceptions: { ...e.exceptions, [onlyDate]: { ...e.exceptions[onlyDate], time: vTime(set.time) ?? e.exceptions[onlyDate]?.time } } }))
              log('update', `${entry.title}: changed on ${fmtDay(parseDateKey(onlyDate))} only`, str(raw.reason, 240), [entry.id])
              break
            }
            const wasHold = entry.hold
            const patch = {}
            if (set.title) patch.title = str(set.title, 80)
            if (set.domain) patch.domain = domainOf(set.domain)
            if (set.durationMin) patch.durationMin = int(set.durationMin, 5, 720, entry.durationMin)
            if (set.deviation) patch.deviation = sanitizeDeviation(set.deviation, entry.deviation)
            if ('recurrence' in set) patch.recurrence = sanitizeRecurrence(set.recurrence)
            if (set.constraints) patch.constraints = { ...entry.constraints, ...sanitizeConstraints(set.constraints, resolve) }
            if (set.kind === 'fixed' || set.kind === 'flex') patch.kind = set.kind
            if ('hold' in set) patch.hold = !!set.hold
            if ('awaiting' in set) patch.awaiting = set.awaiting ? resolve(set.awaiting) : null
            if ('date' in set) patch.date = vDate(set.date)
            if ('time' in set) patch.time = vTime(set.time)
            if (set.allDay != null) patch.allDay = !!set.allDay
            if (set.days) patch.days = int(set.days, 1, 60, 1)
            let updated = { ...entry, ...patch }
            if (updated.kind === 'fixed' && updated.chain) updated.chain = null
            const timingChanged = ['date', 'time', 'durationMin', 'constraints', 'kind', 'awaiting'].some((k) => k in patch)
            if (updated.kind === 'flex' && timingChanged && !updated.awaiting) {
              if (patch.date && patch.time) updated = { ...updated, pinned: true, chain: null }
              else {
                queue.push({ id: entry.id, hint: patch.date ? { onDate: patch.date } : {} })
                updated = { ...updated, date: null, time: null, chain: null, pinned: false }
              }
            }
            setEntry(entry.id, () => updated)
            if (!raw.silent) log('update', `Updated ${updated.title}`, str(raw.reason, 240), [entry.id])
            if (wasHold && updated.hold === false) {
              for (const t of tasks.filter((t) => t.followUpOf === entry.id && t.status === 'open')) {
                setTask(t.id, (x) => ({ ...x, status: 'done' }))
                if (t.entryId) setEntry(t.entryId, (e) => ({ ...e, status: 'done' }))
                log('domino', `Checked off "${t.title}"`, `${updated.title} is confirmed, so the booking task is done`, [t.id, entry.id])
              }
            }
          }
          break
        }
        case 'cancel':
        case 'complete': {
          const { entry, task, item } = lookup(raw.target)
          const status = raw.op === 'cancel' ? 'cancelled' : 'done'
          if (!entry && !task && !item) {
            log('error', `Could not find the item to ${raw.op}`, String(raw.target || ''))
            break
          }
          stats[raw.op === 'cancel' ? 'cancelled' : 'completed']++
          const onlyDate = vDate(raw.onlyDate)
          if (item) {
            shopping = raw.op === 'cancel' ? shopping.filter((s) => s.id !== item.id) : shopping.map((s) => (s.id === item.id ? { ...s, checked: true } : s))
          }
          if (entry?.recurrence && (onlyDate || raw.op === 'complete')) {
            const dk = onlyDate || dateKey(now)
            setEntry(entry.id, (e) => ({ ...e, exceptions: { ...e.exceptions, [dk]: { ...e.exceptions[dk], [raw.op === 'cancel' ? 'cancelled' : 'done']: true } } }))
          } else if (entry) setEntry(entry.id, (e) => ({ ...e, status }))
          if (task) setTask(task.id, (t) => ({ ...t, status }))
          const title = entry?.title || task?.title || item?.name
          log(raw.op === 'cancel' ? 'cancel' : 'complete', `${raw.op === 'cancel' ? 'Cancelled' : 'Done'}: ${title}`, str(raw.reason, 240), [entry?.id, task?.id].filter(Boolean))
          break
        }
        case 'set_prefs': {
          const qs = vTime(raw.quietStart)
          const qe = vTime(raw.quietEnd)
          if (qs) prefs.quietStart = qs
          if (qe) prefs.quietEnd = qe
          if (qs || qe) log('prefs', `Quiet hours ${prefs.quietStart}–${prefs.quietEnd}`, str(raw.reason, 200))
          const sh = raw.shopHours
          if (sh && vTime(sh.from) && vTime(sh.until)) {
            const days = [...new Set((sh.days || []).map((d) => int(d, 0, 6, -1)).filter((d) => d >= 0))].sort()
            if (days.length) {
              prefs.shopHours = { days, from: vTime(sh.from), until: vTime(sh.until) }
              log('prefs', `Shop hours ${days.map((d) => WEEKDAYS_LONG[d].slice(0, 3)).join(', ')} ${prefs.shopHours.from}–${prefs.shopHours.until}`, str(raw.reason, 200))
            }
          }
          if (Array.isArray(raw.holidays)) {
            prefs.holidays = [...new Set(raw.holidays.map(vDate).filter(Boolean))].sort().slice(0, 30)
            prefs.holidaysSetOn = dateKey(now)
            if (prefs.holidays.length) log('prefs', `${prefs.holidays.length} public holiday${prefs.holidays.length > 1 ? 's' : ''} noted`, prefs.holidays.map((d) => fmtDay(parseDateKey(d))).join(', '))
          }
          break
        }
        default:
          if (raw?.op) log('error', `Ignored unknown instruction "${str(raw.op, 30)}"`)
      }
    } catch (err) {
      log('error', 'Ignored an invalid instruction', String(err?.message || err))
    }
  }

  // Structural rule: open shopping items always have one grocery run, by default on the way home
  // after work. Items needed on a given day pull the run to the day before (or today), within
  // opening hours.
  const openItems = shopping.filter((s) => !s.checked)
  const run = tasks.find((t) => t.kind === 'grocery_run' && t.status === 'open')
  const today = dateKey(now)
  const neededOn = openItems.map((s) => s.neededOn).filter(Boolean).sort()[0] || null
  const deadline = neededOn ? [today, dateKey(addDays(parseDateKey(neededOn), -1))].sort()[1] : null
  const closedNote = neededOn && shopsClosed(prefs, parseDateKey(neededOn)) ? `Shops are closed on ${fmtDay(parseDateKey(neededOn))}` : ''
  const runReason = [
    neededOn ? `Needed ${fmtDay(parseDateKey(neededOn))}, so it happens ${deadline === today ? 'today' : `by ${fmtDay(parseDateKey(deadline))}`}` : `Bundles ${openItems.length} shopping item${openItems.length > 1 ? 's' : ''} into one stop`,
    closedNote,
  ].filter(Boolean).join(' · ')
  const runConstraints = { wayHome: true, storeHours: true, ...(deadline ? { deadline } : {}) }
  if (openItems.length && !run) {
    const task = makeTask({ title: 'Grocery run', domain: 'errands', durationMin: 30, kind: 'grocery_run', source: 'rule', batchId, createdAt: now + seq++ })
    const entry = makeEntry({ title: 'Grocery run', domain: 'errands', kind: 'flex', durationMin: 30, constraints: runConstraints, taskId: task.id, source: 'rule', batchId, createdAt: now + seq++ })
    task.entryId = entry.id
    tasks.push(task)
    entries.push(entry)
    queue.push({ id: entry.id, hint: {}, reason: runReason, note: closedNote })
  } else if (run && deadline) {
    const e = entries.find((x) => x.id === run.entryId)
    const placedOn = e?.chain?.dateKey ?? e?.date
    if (e && e.status === 'planned' && !e.pinned && e.constraints?.deadline !== deadline) {
      setEntry(e.id, (x) => ({ ...x, constraints: { ...x.constraints, ...runConstraints } }))
      if (!placedOn || placedOn > deadline) {
        setEntry(e.id, (x) => ({ ...x, date: null, time: null, chain: null }))
        queue.push({ id: e.id, hint: {}, reason: runReason, note: closedNote })
      }
    }
  }

  // Spread hints for session series (e.g. "3 workouts this week").
  const spread = new Map()
  for (const [group, ids] of series) {
    const first = entries.find((e) => e.id === ids[0])
    const deadline = parseDateKey(first?.constraints?.deadline)
    if (deadline == null) continue
    const from = startOfDay(Math.max(now, parseDateKey(first.constraints.notBefore) ?? 0))
    const windowDays = Math.round((deadline - from) / DAY) + 1
    let existing = 0
    for (let d = from; d <= deadline; d = addDays(d, 1))
      if (entries.some((e) => !ids.includes(e.id) && (e.constraints?.group === group || first.constraints.spacingWith?.includes(e.id)) && isOnDay(e, dateKey(d), d))) existing++
    const total = existing + ids.length
    if (windowDays > 0 && total > 0) spread.set(group, Math.max(0, Math.floor(windowDays / total) - 1))
  }

  // Placement order: series first, then by deadline, then in creation order.
  const deadlineOf = (id) => parseDateKey(entries.find((e) => e.id === id)?.constraints?.deadline) ?? Infinity
  const seriesIds = new Set([...series.values()].flat())
  queue.sort((a, b) => (seriesIds.has(b.id) - seriesIds.has(a.id)) || deadlineOf(a.id) - deadlineOf(b.id))
  const placed = []
  const seen = new Set()
  for (const q of queue.reverse().filter((x) => !seen.has(x.id) && seen.add(x.id)).reverse()) {
    const e = entries.find((x) => x.id === q.id)
    if (!e || e.status !== 'planned') continue
    const hint = { ...q.hint, spreadRest: spread.get(e.constraints?.group) }
    let r = findSlot(e, { entries, now, prefs }, hint)
    let late = ''
    if (!r.placement && e.constraints?.deadline) {
      // Nothing fits before the deadline: take the earliest slot after it and say so.
      const { deadline, ...rest } = e.constraints
      const r2 = findSlot({ ...e, constraints: rest }, { entries, now, prefs }, hint)
      if (r2.placement) {
        late = `No open slot left by ${fmtDay(parseDateKey(deadline), now)}`
        r = { ...r2, notes: [...r.notes, ...r2.notes], rejections: [...r.rejections, ...r2.rejections].slice(0, 4) }
      }
    }
    if (r.placement) {
      const updated = withPlacement(e, r.placement)
      setEntry(e.id, () => updated)
      const occ = occurrenceOf(entries, updated)
      placed.push(e.id)
      const why = [q.reason || e.reason, late, r.window ? `Fits ${r.window}` : '', ...r.notes].filter(Boolean)
      log('schedule', `${e.title} → ${fmtWhen(occ?.start ?? r.start)}`, why.join(' · '), [e.id, e.taskId].filter(Boolean), r.rejections)
      const note = [q.note, late].filter(Boolean).join(' · ')
      if (note) logs[logs.length - 1].note = `${note} · ${e.title} ${fmtWhen(occ?.start ?? r.start, now)}`
    } else {
      log('conflict', `No free slot for ${e.title}`, [...r.notes, 'Kept in your task list — tap it to pick a time'].join(' · '), [e.id, e.taskId].filter(Boolean), r.rejections)
    }
  }

  return { data: { ...data, entries, tasks, shopping, prefs }, logs, stats, placed }
}

// ---------- AI results & clarifications ----------

function sanitizeClarifications(list, refs, ctx) {
  return (Array.isArray(list) ? list : []).slice(0, 3).map((q) => {
    const id = uid('q')
    if (q?.id) refs.set(String(q.id), id)
    return {
      id,
      question: str(q?.question, 160) || 'Can you clarify?',
      why: str(q?.why, 160),
      options: (Array.isArray(q?.options) ? q.options : []).slice(0, 4).map((o) => ({
        id: uid('o'),
        label: str(o?.label, 40) || 'OK',
        emoji: str(o?.emoji, 4),
        ops: Array.isArray(o?.ops) ? o.ops : [],
      })),
      batchId: ctx.batchId,
      createdAt: ctx.now,
    }
  })
}

export function applyAIResult(data, result, ctx) {
  const refs = new Map()
  const questions = sanitizeClarifications(result?.clarifications, refs, ctx)
  const r = applyOps(data, result?.ops, { ...ctx, refs })
  const refsObj = Object.fromEntries(refs)
  const parseLog = {
    id: uid('l'), ts: ctx.now, type: 'parse', batchId: ctx.batchId, refs: [],
    title: str(result?.summary, 200) || 'Brain dump understood',
    detail: ctx.meta ? `${ctx.meta.model} · ${(ctx.meta.ms / 1000).toFixed(1)} s${ctx.meta.attempts > 1 ? ` · ${ctx.meta.attempts} attempts` : ''}` : '',
    lines: strArr(result?.assumptions, 6).map((a) => `Assumed: ${a}`),
    raw: ctx.meta ? JSON.stringify(result, null, 1).slice(0, 12_000) : undefined,
    sent: ctx.meta?.sent ? String(ctx.meta.sent).slice(0, 16_000) : undefined,
  }
  const qLogs = questions.map((q) => ({ id: uid('l'), ts: ctx.now, type: 'clarify', batchId: ctx.batchId, refs: [], title: `Asking: ${q.question}`, detail: q.why, lines: [] }))
  return {
    data: { ...r.data, clarifications: [...r.data.clarifications, ...questions.map((q) => ({ ...q, refs: refsObj }))] },
    logs: [parseLog, ...r.logs, ...qLogs],
    stats: r.stats,
    questions: questions.length,
  }
}

/** Resolve a clarification with one of its options (or with ops produced from a free-text answer). */
export function answerClarification(data, qid, { optionId, ops: extraOps, label }, ctx) {
  const q = data.clarifications.find((c) => c.id === qid)
  if (!q) return { data, logs: [] }
  const option = q.options.find((o) => o.id === optionId)
  const refs = new Map(Object.entries(q.refs || {}))
  const ops = extraOps || option?.ops || []
  // Release everything that waited for this answer so it gets placed with the new information.
  const release = data.entries
    .filter((e) => e.awaiting === qid)
    .map((e) => ({ op: 'update', target: e.id, set: { awaiting: null }, silent: true }))
  const r = applyOps({ ...data, clarifications: data.clarifications.filter((c) => c.id !== qid) }, [...ops, ...release], { ...ctx, refs })
  const answerLog = { id: uid('l'), ts: ctx.now, type: 'answer', batchId: ctx.batchId, refs: [], title: `You answered: ${label || option?.label || 'Answer'}`, detail: q.question, lines: [] }
  return { data: r.data, logs: [answerLog, ...r.logs] }
}
