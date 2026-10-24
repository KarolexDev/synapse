// A recorded-style Claude answer for the stage dump, used by tests only (never by the app).

import { startOfWeek, addDays, dateKey, parseDateKey } from '../src/engine/time.js'

function fridaysOfNextMonth(now) {
  const d = new Date(now)
  const first = new Date(d.getFullYear(), d.getMonth() + 1, 1)
  const out = []
  for (let day = new Date(first); day.getMonth() === first.getMonth(); day.setDate(day.getDate() + 1))
    if (day.getDay() === 5) out.push(dateKey(day.getTime()))
  return out
}

export function demoDumpResult(data, now) {
  const trainer = data.entries.find((e) => e.title === 'Trainer session')
  const monday = startOfWeek(now)
  const day = (i) => dateKey(addDays(monday, i))
  const [, trip1, trip2] = fridaysOfNextMonth(now)
  const minus = (dk, n) => dateKey(addDays(parseDateKey(dk), -n))
  const tripOption = (dk) => ({
    label: dk.slice(5),
    emoji: '✈️',
    ops: [
      { op: 'update', target: 'hold1', set: { constraints: { deadline: minus(dk, 7) } }, reason: 'Dentist at least a week before the trip' },
      { op: 'add_entry', ref: 'trip', kind: 'fixed', allDay: true, title: 'Trip', domain: 'travel', date: dk, days: 5, reason: 'Your trip' },
      { op: 'add_task', title: 'Pack bag', domain: 'travel', durationMin: 45, due: minus(dk, 1), constraints: { notBefore: minus(dk, 1), preferred: ['evening'] }, followUpOf: 'trip', reason: 'The evening before you leave' },
    ],
  })
  return {
    summary: '6 items: 2 workouts, 1 call, a dentist hold with a booking call, 2 groceries',
    assumptions: ['Workouts take 60 min', 'The landlord call takes 15 min'],
    ops: [
      { op: 'add_shopping', items: [{ name: 'milk' }, { name: 'batteries' }], reason: 'Things to buy' },
      { op: 'add_task', ref: 'call1', title: 'Call landlord about the sink', domain: 'chores', durationMin: 15, constraints: { businessHours: true, preferred: ['lunch', 'business_hours'] }, assumptions: ['Assumed 15 min'], reason: 'Landlords answer during business hours' },
      {
        op: 'add_entry', ref: 'w1', kind: 'flex', title: 'Workout', domain: 'health', count: 2, durationMin: 60,
        constraints: { group: 'workout', minRestDays: 1, spacingWith: [trainer.id], preferred: ['after_work', 'weekend_morning'], deadline: day(6) },
        assumptions: ['Assumed 60 min'], reason: '3 workouts this week including your trainer session, with rest days between',
      },
      { op: 'add_entry', ref: 'hold1', kind: 'flex', hold: true, title: 'Dentist (hold)', domain: 'health', durationMin: 60, constraints: { businessHours: true }, awaiting: 'q2', reason: 'Keeps time free for the appointment' },
      { op: 'add_task', title: 'Call dentist to book', domain: 'health', durationMin: 10, due: day(2), constraints: { businessHours: true, preferred: ['lunch'] }, followUpOf: 'hold1', reason: 'Book early so a slot is free before the trip' },
    ],
    clarifications: [
      {
        id: 'q1', question: 'Is your Tuesday trainer session every week?', why: 'Then future weeks get planned around it too',
        options: [
          { label: 'Every Tuesday', emoji: '🔄', ops: [{ op: 'update', target: trainer.id, set: { recurrence: { freq: 'weekly', byWeekday: [2] } }, reason: 'Trainer session repeats weekly' }] },
          { label: 'Just this week', emoji: '📅', ops: [] },
        ],
      },
      {
        id: 'q2', question: 'When does your trip start?', why: 'The dentist visit has to happen before it',
        options: [tripOption(trip1), tripOption(trip2), { label: 'Not sure yet', emoji: '🤷', ops: [{ op: 'update', target: 'hold1', set: { constraints: { deadline: day(13) } }, reason: 'Assuming the trip is at least two weeks away' }] }],
      },
    ],
  }
}
