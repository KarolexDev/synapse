// App state: one reducer, persisted to localStorage (best effort). Every action that changes the
// plan receives `now` from the app clock, so live mode and time travel behave the same.

import { emptyData, DEFAULT_SETTINGS, uid } from './model.js'
import { applyOps, applyAIResult, answerClarification } from '../engine/ops.js'
import { reflowDay, rolloverMissed } from '../engine/scheduler.js'
import { layoutDay } from '../engine/layout.js'
import { MIN, parseDateKey, fmtTime, fmtWhen, fmtDuration } from '../engine/time.js'
import { demoOps } from './demoWeek.js'

const STORAGE_KEY = 'synapse:v1'
const MAX_LOG = 400
const MAX_UNDO = 8

export function initialState() {
  return {
    version: 1,
    onboarded: false,
    apiKey: null,
    settings: { ...DEFAULT_SETTINGS },
    data: emptyData(),
    log: [],
    undo: [],
    toasts: [],
    stats: { reclaimedMin: 0 },
  }
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return initialState()
    const s = JSON.parse(raw)
    if (s?.version !== 1) return initialState()
    return { ...initialState(), ...s, settings: { ...DEFAULT_SETTINGS, ...s.settings }, toasts: [] }
  } catch {
    return initialState()
  }
}

export function saveState(state) {
  try {
    const { toasts, ...rest } = state
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rest))
  } catch {
    // storage unavailable (private mode, sandbox): the app keeps working in memory
  }
}

const sysLog = (now, type, title, detail = '', lines = [], refs = [], batchId = null) => ({ id: uid('l'), ts: now, type, title, detail, lines, refs, batchId })

// Only the newest few Claude calls keep their full prompt and answer, to keep storage small.
const KEEP_RAW = 15

function addLogs(state, logs) {
  if (!logs.length) return state.log
  const all = [...state.log, ...logs].slice(-MAX_LOG)
  let seen = 0
  for (let i = all.length - 1; i >= 0; i--) {
    if (!all[i].sent && !all[i].raw) continue
    if (++seen > KEEP_RAW) all[i] = { ...all[i], sent: undefined, raw: undefined }
  }
  return all
}

function addToast(state, toast) {
  return [...state.toasts, { id: uid('toast'), ...toast }].slice(-3)
}

function withUndo(state, batchId, label, now) {
  return [{ batchId, label, data: state.data, ts: now }, ...state.undo].slice(0, MAX_UNDO)
}

const countType = (logs, type) => logs.filter((l) => l.type === type).length

function setEntries(data, entries) {
  return { ...data, entries }
}

// Completing a grocery run checks off the shopping list; checking off the whole list completes the run.
function syncGrocery(data, now, logs) {
  const run = data.tasks.find((t) => t.kind === 'grocery_run' && t.status === 'open')
  const open = data.shopping.filter((s) => !s.checked)
  if (run && data.shopping.length && !open.length) {
    logs.push(sysLog(now, 'domino', 'Grocery run done', 'Everything on the shopping list is checked off', [], [run.id]))
    return {
      ...data,
      tasks: data.tasks.map((t) => (t.id === run.id ? { ...t, status: 'done' } : t)),
      entries: data.entries.map((e) => (e.id === run.entryId ? { ...e, status: 'done' } : e)),
    }
  }
  return data
}

function occurrence(data, entryId, dk) {
  return layoutDay(data.entries, parseDateKey(dk)).occurrences.find((o) => o.entryId === entryId) || null
}

function moveLines(moves) {
  return moves.map((m) => `${m.entry.title}: ${m.from ? fmtWhen(m.from) : 'unplanned'} → ${m.to ? fmtWhen(m.to) : 'no free slot'}`)
}

// After an actual end is recorded, describe what moved with the chain and what was re-placed.
function reflowAfterActual(state, entryId, dk, now, actualEnd, kind) {
  const data = state.data
  const before = occurrence(data, entryId, dk)
  if (!before) return state
  const entries = data.entries.map((e) =>
    e.id === entryId ? { ...e, exceptions: { ...e.exceptions, [dk]: { ...e.exceptions?.[dk], actualEnd } } } : e,
  )
  const day = parseDateKey(dk)
  const chainBefore = layoutDay(data.entries, day).occurrences
  const r = reflowDay(entries, day, now, data.prefs, { pullForward: kind === 'early' })
  const chainAfter = layoutDay(r.entries, day).occurrences
  const chainLines = chainAfter
    .filter((o) => o.entryId !== entryId && (o.entry.after || o.entry.chain))
    .map((o) => {
      const prev = chainBefore.find((p) => p.entryId === o.entryId)
      return prev && prev.start !== o.start ? `${o.entry.title}: ${fmtTime(prev.start)} → ${fmtTime(o.start)} (moves with ${before.entry.title})` : null
    })
    .filter(Boolean)
  const lines = [...chainLines, ...moveLines(r.moves)]
  const batchId = uid('b')
  const diff = Math.round(Math.abs(before.end - actualEnd) / MIN)
  const title =
    kind === 'early'
      ? `${before.entry.title} ended ${fmtDuration(diff)} early`
      : `${before.entry.title} runs ${fmtDuration(diff)} late`
  const detail = kind === 'early'
    ? r.moves.length ? `Pulled ${r.moves.length} item${r.moves.length > 1 ? 's' : ''} into the freed time` : 'Everything after it moves up'
    : r.moves.length ? `Pushed ${r.moves.length} item${r.moves.length > 1 ? 's' : ''} to keep your plan safe` : 'Nothing else had to move'
  const logs = [sysLog(now, 'reflow', title, detail, lines, [entryId, ...r.moves.map((m) => m.entry.id)], batchId)]
  return {
    ...state,
    data: setEntries(data, r.entries),
    log: addLogs(state, logs),
    undo: withUndo(state, batchId, title, now),
    stats: kind === 'early' ? { ...state.stats, reclaimedMin: (state.stats.reclaimedMin || 0) + diff } : state.stats,
    toasts: addToast(state, { title: kind === 'early' ? `${fmtDuration(diff)} reclaimed` : 'Day re-planned', detail: lines[0] || detail, batchId, kind: 'reflow' }),
  }
}

export function reducer(state, action) {
  const now = action.now ?? Date.now()
  switch (action.type) {
    case 'setKey':
      return { ...state, apiKey: action.apiKey }
    case 'setSettings':
      return { ...state, settings: { ...state.settings, ...action.settings } }
    case 'setLocation': {
      const prev = state.data.prefs.location
      const loc = action.location
      const moved = !prev || prev.countryCode !== loc.countryCode || prev.regionCode !== loc.regionCode
      // A new country or region has different shop hours and holidays: let Claude supply them again.
      const prefs = { ...state.data.prefs, location: loc, ...(moved ? { shopHours: null, holidays: [], holidaysSetOn: null } : {}) }
      return {
        ...state,
        data: { ...state.data, prefs },
        log: addLogs(state, [sysLog(now, 'prefs', `Location: ${[loc.city, loc.country].filter(Boolean).join(', ')}`, moved ? 'Shop hours and holidays will be updated for this place with your next brain dump' : 'Same region as before')]),
      }
    }
    case 'setOnboarded':
      return { ...state, onboarded: action.value }
    case 'dismissToast':
      return { ...state, toasts: state.toasts.filter((t) => t.id !== action.id) }
    case 'toast':
      return { ...state, toasts: addToast(state, action.toast) }
    case 'log':
      return { ...state, log: addLogs(state, [sysLog(now, action.logType || 'error', action.title, action.detail)]) }

    case 'loadDemo': {
      const batchId = uid('b')
      const r = applyOps({ ...emptyData() }, demoOps(now), { now, batchId, source: 'demo' })
      return {
        ...initialState(),
        apiKey: state.apiKey,
        onboarded: true,
        settings: { ...state.settings, demo: true, timeOffsetMs: action.timeOffsetMs ?? state.settings.timeOffsetMs },
        data: r.data,
        log: [sysLog(now, 'system', 'Demo week loaded', 'A young professional’s week: work with flexible end times, commute, trainer session', [], [], batchId), ...r.logs],
      }
    }
    case 'resetAll':
      return { ...initialState(), apiKey: action.keepKey ? state.apiKey : null }
    case 'clearData':
      return { ...state, data: emptyData(), log: [], undo: [] }

    case 'applyResult': {
      const batchId = action.batchId || uid('b')
      const r = applyAIResult(state.data, action.result, { now, batchId, meta: action.meta })
      const scheduled = countType(r.logs, 'schedule')
      const total = r.stats.added + r.stats.updated + r.stats.cancelled + r.stats.completed + r.stats.merged
      const conflicts = countType(r.logs, 'conflict')
      const note = r.logs.find((l) => l.note)?.note
      const meta = action.meta ? `${action.meta.model.replace(/^Claude /, '')} · ${(action.meta.ms / 1000).toFixed(1)} s` : ''
      return {
        ...state,
        data: r.data,
        log: addLogs(state, r.logs),
        undo: withUndo(state, batchId, action.label || 'Brain dump', now),
        toasts: action.silent
          ? state.toasts
          : addToast(state, {
              title: `${total} item${total === 1 ? '' : 's'} organized`,
              detail: note || [scheduled ? `${scheduled} placed` : '', r.questions ? `${r.questions} question${r.questions > 1 ? 's' : ''}` : '', conflicts ? `${conflicts} without a slot` : '', meta].filter(Boolean).join(' · '),
              batchId,
              kind: 'success',
            }),
      }
    }

    case 'answer': {
      const batchId = uid('b')
      const r = answerClarification(state.data, action.qid, { optionId: action.optionId, ops: action.ops, label: action.label }, { now, batchId })
      if (action.meta?.sent) Object.assign(r.logs[0], { sent: action.meta.sent.slice(0, 16_000), raw: JSON.stringify({ ops: action.ops }, null, 1).slice(0, 12_000) })
      const scheduled = countType(r.logs, 'schedule')
      return {
        ...state,
        data: r.data,
        log: addLogs(state, r.logs),
        undo: withUndo(state, batchId, `Answer: ${action.label}`, now),
        toasts: addToast(state, { title: 'Plan updated', detail: scheduled ? `${scheduled} item${scheduled > 1 ? 's' : ''} placed` : r.logs[1]?.title || '', batchId, kind: 'success' }),
      }
    }

    case 'undo': {
      const u = state.undo.find((x) => x.batchId === action.batchId)
      if (!u) return state
      return {
        ...state,
        data: u.data,
        undo: state.undo.filter((x) => x.batchId !== action.batchId),
        log: addLogs(state, [sysLog(now, 'undo', `Undid: ${u.label}`)]),
        toasts: state.toasts.filter((t) => t.batchId !== action.batchId),
      }
    }

    case 'toggleTask': {
      const task = state.data.tasks.find((t) => t.id === action.id)
      if (!task) return state
      const status = task.status === 'done' ? 'open' : 'done'
      let data = {
        ...state.data,
        tasks: state.data.tasks.map((t) => (t.id === task.id ? { ...t, status } : t)),
        entries: state.data.entries.map((e) => (e.id === task.entryId ? { ...e, status: status === 'done' ? 'done' : 'planned' } : e)),
      }
      const logs = []
      if (task.kind === 'grocery_run' && status === 'done') {
        data = { ...data, shopping: data.shopping.map((s) => ({ ...s, checked: true })) }
        logs.push(sysLog(now, 'domino', 'Shopping list checked off', 'The grocery run is done', [], [task.id]))
      }
      return { ...state, data, log: addLogs(state, logs) }
    }

    case 'toggleEntryDone': {
      const e = state.data.entries.find((x) => x.id === action.id)
      if (!e) return state
      let entries
      let tasks = state.data.tasks
      if (e.recurrence) {
        const ex = e.exceptions?.[action.dateKey] || {}
        entries = state.data.entries.map((x) => (x.id === e.id ? { ...x, exceptions: { ...x.exceptions, [action.dateKey]: { ...ex, done: !ex.done } } } : x))
      } else {
        const status = e.status === 'done' ? 'planned' : 'done'
        entries = state.data.entries.map((x) => (x.id === e.id ? { ...x, status } : x))
        if (e.taskId) tasks = tasks.map((t) => (t.id === e.taskId ? { ...t, status: status === 'done' ? 'done' : 'open' } : t))
      }
      let data = { ...state.data, entries, tasks }
      const logs = []
      const run = tasks.find((t) => t.id === e.taskId && t.kind === 'grocery_run' && t.status === 'done')
      if (run) {
        data = { ...data, shopping: data.shopping.map((s) => ({ ...s, checked: true })) }
        logs.push(sysLog(now, 'domino', 'Shopping list checked off', 'The grocery run is done', [], [run.id]))
      }
      return { ...state, data, log: addLogs(state, logs) }
    }

    case 'deleteEntry': {
      const e = state.data.entries.find((x) => x.id === action.id)
      if (!e) return state
      const batchId = uid('b')
      const one = e.recurrence && action.scope === 'one'
      const entries = state.data.entries.map((x) =>
        x.id !== e.id ? x : one ? { ...x, exceptions: { ...x.exceptions, [action.dateKey]: { ...x.exceptions?.[action.dateKey], cancelled: true } } } : { ...x, status: 'cancelled' },
      )
      const tasks = one ? state.data.tasks : state.data.tasks.map((t) => (t.id === e.taskId ? { ...t, status: 'cancelled' } : t))
      return {
        ...state,
        data: { ...state.data, entries, tasks },
        undo: withUndo(state, batchId, `Delete ${e.title}`, now),
        log: addLogs(state, [sysLog(now, 'cancel', `Removed ${e.title}${one ? ' (this day only)' : ''}`, 'Removed by you', [], [e.id], batchId)]),
        toasts: addToast(state, { title: `Removed ${e.title}`, batchId, kind: 'info' }),
      }
    }

    case 'deleteTask': {
      const t = state.data.tasks.find((x) => x.id === action.id)
      if (!t) return state
      const batchId = uid('b')
      return {
        ...state,
        data: {
          ...state.data,
          tasks: state.data.tasks.map((x) => (x.id === t.id ? { ...x, status: 'cancelled' } : x)),
          entries: state.data.entries.map((e) => (e.id === t.entryId ? { ...e, status: 'cancelled' } : e)),
        },
        undo: withUndo(state, batchId, `Delete ${t.title}`, now),
        log: addLogs(state, [sysLog(now, 'cancel', `Removed task ${t.title}`, 'Removed by you', [], [t.id], batchId)]),
        toasts: addToast(state, { title: `Removed ${t.title}`, batchId, kind: 'info' }),
      }
    }

    case 'toggleShopping': {
      const logs = []
      let data = { ...state.data, shopping: state.data.shopping.map((s) => (s.id === action.id ? { ...s, checked: !s.checked } : s)) }
      data = syncGrocery(data, now, logs)
      return { ...state, data, log: addLogs(state, logs) }
    }

    case 'deleteShopping': {
      let data = { ...state.data, shopping: state.data.shopping.filter((s) => s.id !== action.id) }
      const logs = []
      if (!data.shopping.some((s) => !s.checked)) {
        const run = data.tasks.find((t) => t.kind === 'grocery_run' && t.status === 'open')
        if (run) {
          data = {
            ...data,
            tasks: data.tasks.map((t) => (t.id === run.id ? { ...t, status: 'cancelled' } : t)),
            entries: data.entries.map((e) => (e.id === run.entryId ? { ...e, status: 'cancelled' } : e)),
          }
          logs.push(sysLog(now, 'domino', 'Grocery run removed', 'The shopping list is empty', [], [run.id]))
        }
      }
      return { ...state, data, log: addLogs(state, logs) }
    }

    case 'addShopping': {
      const batchId = uid('b')
      const r = applyOps(state.data, [{ op: 'add_shopping', items: [{ name: action.name }], reason: 'Added by you' }], { now, batchId, source: 'user' })
      return { ...state, data: r.data, log: addLogs(state, r.logs) }
    }

    case 'saveEntry': {
      const batchId = uid('b')
      // A "this day only" time change becomes an exception; any other edited field applies to the series.
      const { time, ...rest } = action.set
      const ops =
        action.scope === 'one' && time
          ? [{ op: 'update', target: action.id, onlyDate: action.dateKey, set: { time }, reason: 'Edited by you' }, ...(Object.keys(rest).length ? [{ op: 'update', target: action.id, set: rest, reason: 'Edited by you' }] : [])]
          : [{ op: 'update', target: action.id, set: action.set, reason: 'Edited by you' }]
      if (!Object.keys(action.set).length) return state
      const r = applyOps(state.data, ops, { now, batchId, source: 'user' })
      return {
        ...state,
        data: r.data,
        log: addLogs(state, r.logs),
        undo: withUndo(state, batchId, 'Edit', now),
        toasts: addToast(state, { title: 'Saved', detail: r.logs.find((l) => l.type === 'schedule')?.title || '', batchId, kind: 'info' }),
      }
    }

    case 'removeSkeletonEntry': {
      const drop = new Set([action.id])
      for (const e of state.data.entries) if (e.before === action.id || e.after === action.id) drop.add(e.id)
      return { ...state, data: { ...state.data, entries: state.data.entries.filter((e) => !drop.has(e.id)) } }
    }

    case 'finishedEarly': {
      const occ = occurrence(state.data, action.id, action.dateKey)
      if (!occ || now <= occ.start || now >= occ.end) return state
      return reflowAfterActual(state, action.id, action.dateKey, now, now, 'early')
    }

    case 'runningLate': {
      const occ = occurrence(state.data, action.id, action.dateKey)
      if (!occ) return state
      const actualEnd = Math.max(occ.end, now) + action.minutes * MIN
      return reflowAfterActual(state, action.id, action.dateKey, now, actualEnd, 'late')
    }

    case 'tick': {
      const r = rolloverMissed(state.data.entries, now, state.data.prefs)
      if (!r.moves.length) return state
      const batchId = uid('b')
      const logs = r.moves.map((m) =>
        sysLog(now, 'rollover', `${m.entry.title} moved`, m.to ? `Not done by ${fmtTime(m.from)} → ${fmtWhen(m.to)}` : 'Not done and no free slot found — kept in your list', [], [m.entry.id], batchId),
      )
      const first = r.moves[0]
      return {
        ...state,
        data: setEntries(state.data, r.entries),
        log: addLogs(state, logs),
        undo: withUndo(state, batchId, 'Missed items moved', now),
        toasts: addToast(state, {
          title: r.moves.length === 1 ? `Moved ${first.entry.title}` : `Moved ${r.moves.length} missed items`,
          detail: first.to ? `Next slot: ${fmtWhen(first.to, now)}` : 'No free slot found',
          batchId,
          kind: 'rollover',
        }),
      }
    }

    default:
      return state
  }
}
