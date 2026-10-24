// The instructions and output contract shared by every Claude call. The system prompt is static
// (cacheable); all volatile data goes into the user turn via buildContext().

import { addDays, dateKey, startOfDay, WEEKDAYS, parseDateKey } from './time.js'
import { DOMAINS } from '../state/model.js'

export const SYSTEM_PROMPT = `You are the planning brain of Synapse, a smart calendar and task list.
The user dumps unstructured thoughts (typed or dictated). You turn them into a JSON object of operations.
You do NOT choose clock times for flexible items: a deterministic scheduler places them around the user's
fixed commitments. You describe WHAT is needed and the CONSTRAINTS.

OUTPUT: one JSON object {"summary": string, "assumptions": string[], "ops": Op[], "clarifications": Question[]}.

OPERATIONS
- add_entry kind "fixed": something at a known time (appointment, class, trainer session, dinner, work).
  Needs "time" plus "date" (one-off) or "recurrence" (repeating), or "allDay": true plus "date" (trips, holidays; "days" = length).
- add_entry kind "flex": a time-consuming activity without a fixed time (workout, study session, deep work).
  Give "durationMin" and "constraints". For "N times" emit ONE op with "count": N.
- add_task: a to-do. Give "durationMin" only if it needs a time block (a call ~10-15 min, an errand, a chore).
  Quick things ("text mom") get no durationMin; give "due" if a day is known.
- add_shopping: things to buy -> "items": [{"name","qty"}]. Never create a task for buying groceries or household
  items; Synapse bundles the shopping list into one grocery run on the way home automatically.
- update / cancel / complete: change EXISTING items by "target" = their id from CONTEXT. "set" holds the changed fields.
  For one occurrence of a repeating entry add "onlyDate". Never add a duplicate of an item that already exists
  (same title or obviously the same thing) - update it or leave it.
- set_prefs: "quietStart"/"quietEnd" (sleep / do-not-plan hours).
Use "ref" (short name like "w1", "work", "hold1") on new items so other ops and question options can point at them
in "target", "after", "before", "followUpOf", "awaiting", "spacingWith".

DATES: dates are YYYY-MM-DD, times HH:MM (24 h). Use the calendar in CONTEXT; never invent weekday/date pairs.
"this week" ends on the Sunday shown in CONTEXT. "next month" is the calendar month after the current one.

DOMAINS: ${Object.keys(DOMAINS).join(', ')}.

CONSTRAINTS (for flex entries and timed tasks):
- "preferred": any of morning, lunch, afternoon, evening, after_work, weekend, weekend_morning, weekday, business_hours, any.
- "businessHours": true for calls and appointments with businesses (landlord, dentist, bank, doctor).
  Short calls also prefer "lunch".
- "wayHome": true for errands that are a stop on the way home (pharmacy, post office, picking something up).
- "notBefore" / "deadline": YYYY-MM-DD.
- Repeated sessions: "group" (e.g. "workout") and "minRestDays" (strength or cardio training: 1).
  If an EXISTING entry already counts as one of the sessions (e.g. a trainer session for "3 workouts"), put its id
  in "spacingWith" and reduce "count" accordingly. Also set "deadline" for "this week".

UNCERTAIN DURATIONS: "deviation": {"earlyMin","lateMin"} = how much earlier/later something may END.
Extract it from phrases like "I usually finish between 3 and 5" (work 09:00-17:00, earlyMin 120).
Defaults when not said: work earlyMin 60 lateMin 30; commute lateMin 10; appointments lateMin 15; others none.

ROUTINES (when the user describes their typical week):
- Work: kind fixed, role "work", "recurrence" {"freq":"weekly","byWeekday":[1,2,3,4,5]} (0 = Sunday),
  time, durationMin, deviation, "breaks" [{"time":"12:30","durationMin":30,"label":"Lunch break"}]
  (assume a 12:30 lunch break of 30 min if none is mentioned).
- Commute: TWO fixed entries with the same recurrence: role "commute_to" with "before": <work ref>, and
  role "commute_home" with "after": <work ref>; durationMin and deviation lateMin. They need no "time".
- Other regular commitments: fixed with recurrence. Sleep goes into set_prefs.

CLARIFICATIONS: ask ONLY when the answer materially changes the plan (does a fixed session repeat weekly? the date
of something other items depend on, like a trip). At most 3. Everything else: assume, list it in "assumptions", and
put a short chip text on the item ("assumptions": ["Assumed 60 min"]).
Each question: "id" ("q1"), "question" (short, friendly), "why" (one line), and 2-4 "options", each with
"label" (max 3 words), "emoji", and "ops" that apply that answer immediately (precompute them, e.g. update the trainer
entry with a weekly recurrence; or set a hold's deadline and add the trip as an all-day entry). Items that cannot be
planned before the answer arrives are created in the main ops with "awaiting": "<question id>".
Date options must be concrete dates ("Nov 14") plus one "Not sure yet" option with a sensible assumption.

APPOINTMENTS TO BOOK ("schedule a dentist appointment before my trip"): create a flex hold
(hold true, title "Dentist (hold)", durationMin 60, businessHours true, deadline = 7 days before the trip if known)
and a task "Call dentist to book" (durationMin 10, businessHours, preferred lunch, due within 3 days,
"followUpOf": <hold ref>). When the user later gives the real time, update the hold: kind "fixed", hold false,
date, time, title without "(hold)".

FOLLOW-UPS: add up to 3 follow-up tasks a thoughtful assistant would add (trip -> "Pack bag" the evening before
with durationMin 45, "Online check-in" due the day before), each with "followUpOf" and a reason.

REASONS: every op gets "reason": one short plain-language sentence (shown to the user in the agent log).
SUMMARY: one sentence, e.g. "6 items: 2 workouts, 1 call, 1 appointment hold, 2 groceries".

EXAMPLE
Brain dump: "dinner with Sam friday 8pm, renew car insurance by the 15th, go running twice this week"
{"summary":"3 items: a dinner, an insurance task, 2 runs","assumptions":["Runs take 45 min","Dinner takes 2 h"],
"ops":[
{"op":"add_entry","ref":"d1","kind":"fixed","title":"Dinner with Sam","domain":"social","date":"2026-10-30","time":"20:00","durationMin":120,"deviation":{"earlyMin":0,"lateMin":30},"assumptions":["Assumed 2 h"],"reason":"Fixed time you gave"},
{"op":"add_task","ref":"t1","title":"Renew car insurance","domain":"admin","durationMin":20,"due":"2026-11-15","constraints":{"preferred":["evening","weekend"]},"reason":"Needs ~20 min online before the 15th"},
{"op":"add_entry","ref":"r1","kind":"flex","title":"Run","domain":"health","count":2,"durationMin":45,"constraints":{"group":"run","minRestDays":1,"preferred":["after_work","weekend_morning"],"deadline":"2026-11-01"},"assumptions":["Assumed 45 min"],"reason":"Two runs this week with a rest day between"}
],"clarifications":[]}`

const MODE_INSTRUCTIONS = {
  dump: 'Turn this brain dump into operations.',
  skeleton:
    'ONBOARDING: the user describes their TYPICAL WEEK. Create the recurring skeleton: work (role, recurrence, deviation, breaks), ' +
    'commute entries, regular fixed commitments, and quiet hours via set_prefs. Do not create one-off tasks unless explicitly mentioned. ' +
    'Ask no clarifications unless essential; prefer assumptions.',
  answer: 'The user answered one of your earlier questions. Produce ops that apply the answer to the existing items (use their ids). Ask no new questions.',
}

const pad = (n) => String(n).padStart(2, '0')

function describeEntry(e) {
  const when = e.allDay
    ? `all day ${e.date}${e.days > 1 ? ` (+${e.days - 1} days)` : ''}`
    : e.recurrence
      ? `${e.recurrence.freq === 'daily' ? 'daily' : `weekly ${e.recurrence.byWeekday.map((d) => WEEKDAYS[d]).join('/')}`}${e.time ? ` ${e.time}` : ''}${e.date ? ` since ${e.date}` : ''}${e.recurrence.until ? ` until ${e.recurrence.until}` : ''}`
      : e.chain
        ? `${e.chain.dateKey} on the way home`
        : e.date
          ? `${e.date} ${e.time || ''}`.trim()
          : e.awaiting
            ? 'not planned yet (waiting for an answer)'
            : 'not planned yet'
  const out = { id: e.id, title: e.title, kind: e.kind, when, durationMin: e.durationMin }
  if (e.role) out.role = e.role
  if (e.after) out.after = e.after
  if (e.before) out.before = e.before
  if (e.deviation?.earlyMin || e.deviation?.lateMin) out.deviation = e.deviation
  if (e.constraints?.group) out.group = e.constraints.group
  if (e.hold) out.hold = true
  if (e.status !== 'planned') out.status = e.status
  return out
}

export function buildContext(data, now) {
  const d = new Date(now)
  const today = startOfDay(now)
  const calendar = []
  for (let i = 0; i < 21; i++) {
    const day = addDays(today, i)
    calendar.push(`${WEEKDAYS[new Date(day).getDay()]} ${dateKey(day)}`)
  }
  const wd = d.getDay()
  const sunday = addDays(today, wd === 0 ? 0 : 7 - wd)
  const recentCut = addDays(today, -1)
  const entries = data.entries
    .filter((e) => e.status !== 'cancelled')
    .filter((e) => e.kind === 'fixed' || e.recurrence || !e.date || (parseDateKey(e.date) ?? 0) >= recentCut || e.chain)
    .slice(0, 80)
    .map(describeEntry)
  const tasks = data.tasks
    .filter((t) => t.status === 'open')
    .slice(0, 60)
    .map((t) => ({ id: t.id, title: t.title, domain: t.domain, due: t.due || undefined, durationMin: t.durationMin || undefined, entryId: t.entryId || undefined }))
  const shopping = data.shopping.filter((s) => !s.checked).map((s) => s.name)
  const questions = data.clarifications.map((q) => q.question)
  let tz = ''
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    tz = ''
  }
  return [
    `NOW: ${WEEKDAYS[wd]} ${dateKey(now)} ${pad(d.getHours())}:${pad(d.getMinutes())}${tz ? ` (${tz})` : ''}`,
    `THIS WEEK ENDS: Sunday ${dateKey(sunday)}`,
    `CALENDAR: ${calendar.join(', ')}`,
    `QUIET HOURS: ${data.prefs.quietStart}-${data.prefs.quietEnd}`,
    `ENTRIES: ${JSON.stringify(entries)}`,
    `OPEN TASKS: ${JSON.stringify(tasks)}`,
    `SHOPPING LIST: ${JSON.stringify(shopping)}`,
    `OPEN QUESTIONS: ${JSON.stringify(questions)}`,
  ].join('\n')
}

export function buildUserTurn({ mode, text, data, now, question }) {
  const parts = [`CONTEXT\n${buildContext(data, now)}`, `TASK\n${MODE_INSTRUCTIONS[mode] || MODE_INSTRUCTIONS.dump}`]
  if (mode === 'answer' && question) {
    const waiting = data.entries.filter((e) => e.awaiting === question.id).map((e) => ({ id: e.id, title: e.title }))
    parts.push(`QUESTION: ${question.question}\nITEMS WAITING FOR IT: ${JSON.stringify(waiting)}\nREFS: ${JSON.stringify(question.refs || {})}`)
    parts.push(`ANSWER\n${text}`)
  } else {
    parts.push(`${mode === 'skeleton' ? 'TYPICAL WEEK' : 'BRAIN DUMP'}\n${text}`)
  }
  return parts.join('\n\n')
}

// ---------- JSON schema for structured outputs ----------

const S = { type: 'string' }
const I = { type: 'integer' }
const B = { type: 'boolean' }
const nullable = (schema) => ({ anyOf: [schema, { type: 'null' }] })
const obj = (properties, required = []) => ({ type: 'object', additionalProperties: false, properties, required })

const DEVIATION = obj({ earlyMin: I, lateMin: I })
const RECURRENCE = obj({ freq: { type: 'string', enum: ['daily', 'weekly'] }, byWeekday: { type: 'array', items: I }, until: S }, ['freq'])
const CONSTRAINTS = obj({
  preferred: { type: 'array', items: { type: 'string', enum: ['morning', 'lunch', 'afternoon', 'evening', 'after_work', 'weekend', 'weekend_morning', 'weekday', 'business_hours', 'any'] } },
  businessHours: B,
  wayHome: B,
  notBefore: S,
  deadline: S,
  group: S,
  minRestDays: I,
  spacingWith: { type: 'array', items: S },
  bufferMin: I,
})
const DOMAIN = { type: 'string', enum: Object.keys(DOMAINS) }
const SET = obj({
  title: S, domain: DOMAIN, durationMin: I, deviation: DEVIATION, recurrence: nullable(RECURRENCE), constraints: CONSTRAINTS,
  kind: { type: 'string', enum: ['fixed', 'flex'] }, hold: B, awaiting: nullable(S), date: S, time: S, allDay: B, days: I, due: S, name: S,
})
const OP = obj(
  {
    op: { type: 'string', enum: ['add_entry', 'add_task', 'add_shopping', 'update', 'cancel', 'complete', 'set_prefs'] },
    ref: S, target: S, onlyDate: S, set: SET,
    title: S, domain: DOMAIN, kind: { type: 'string', enum: ['fixed', 'flex'] },
    date: S, time: S, allDay: B, days: I, blocking: B, durationMin: I, deviation: DEVIATION, recurrence: RECURRENCE,
    after: S, before: S, breaks: { type: 'array', items: obj({ time: S, durationMin: I, label: S }, ['time']) },
    role: { type: 'string', enum: ['work', 'commute_to', 'commute_home'] },
    constraints: CONSTRAINTS, count: I, hold: B, awaiting: S, due: S,
    items: { type: 'array', items: obj({ name: S, qty: I }, ['name']) },
    followUpOf: S, assumptions: { type: 'array', items: S }, reason: S,
    quietStart: S, quietEnd: S,
  },
  ['op'],
)

export const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  $defs: { op: OP },
  properties: {
    summary: S,
    assumptions: { type: 'array', items: S },
    ops: { type: 'array', items: { $ref: '#/$defs/op' } },
    clarifications: {
      type: 'array',
      items: obj(
        { id: S, question: S, why: S, options: { type: 'array', items: obj({ label: S, emoji: S, ops: { type: 'array', items: { $ref: '#/$defs/op' } } }, ['label', 'ops']) } },
        ['id', 'question', 'options'],
      ),
    },
  },
  required: ['summary', 'assumptions', 'ops', 'clarifications'],
}
