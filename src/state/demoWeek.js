// The stage demo: a young professional's week, expressed as ops so it runs through the same
// pipeline (sanitizing, scheduling, logging) as anything Claude produces.

import { startOfWeek, addDays, dateKey, atMinutes } from '../engine/time.js'

export const demoNow = (now) => atMinutes(startOfWeek(now), 8 * 60 + 12) // Monday 08:12

export const DEMO_DUMP =
  'Need to buy milk and batteries, call the landlord about the sink, schedule a dentist appointment before my trip next month, and fit in 3 workouts this week with a fixed trainer session on Tuesday at 6 PM'

export const EXAMPLE_DUMPS = [
  { label: 'Weekly chaos', text: DEMO_DUMP },
  { label: 'Errands', text: 'pick up the parcel at the post office, get a birthday card for Lena (party is Saturday), and clean the bathroom sometime this week' },
  { label: 'Change plans', text: 'move my thursday workout to friday and I already paid the electricity bill' },
]

export const EXAMPLE_WEEK =
  'I work 9 to 5 on weekdays, sometimes I am done by 3 but rarely later than 5:30. My commute is about 25 minutes each way. I go to bed around 11 and get up at 7. Sundays I call my parents at 5.'

export function demoOps(now) {
  const monday = startOfWeek(now)
  const day = (i) => dateKey(addDays(monday, i))
  const weekdays = { freq: 'weekly', byWeekday: [1, 2, 3, 4, 5] }
  return [
    { op: 'set_prefs', quietStart: '23:00', quietEnd: '07:00', reason: 'You sleep from 23:00 to 07:00' },
    {
      op: 'add_entry', ref: 'work', kind: 'fixed', title: 'Work', domain: 'work', role: 'work', date: day(0), time: '09:00', durationMin: 480,
      recurrence: weekdays, deviation: { earlyMin: 120, lateMin: 30 }, breaks: [{ time: '12:30', durationMin: 30, label: 'Lunch break' }],
      reason: 'Office hours: some days you are done by 15:00, rarely later than 17:30',
    },
    { op: 'add_entry', kind: 'fixed', title: 'Commute to work', domain: 'commute', role: 'commute_to', before: 'work', date: day(0), durationMin: 25, recurrence: weekdays, deviation: { earlyMin: 0, lateMin: 10 }, reason: 'Leaves a 10-minute traffic buffer' },
    { op: 'add_entry', kind: 'fixed', title: 'Commute home', domain: 'commute', role: 'commute_home', after: 'work', date: day(0), durationMin: 25, recurrence: weekdays, deviation: { earlyMin: 0, lateMin: 10 }, reason: 'Starts whenever work ends' },
    { op: 'add_entry', kind: 'fixed', title: 'Trainer session', domain: 'health', date: day(1), time: '18:00', durationMin: 60, constraints: { group: 'workout' }, reason: 'Booked with your trainer' },
    { op: 'add_entry', kind: 'fixed', title: 'Dinner with Alex', domain: 'social', date: day(2), time: '19:30', durationMin: 90, deviation: { earlyMin: 0, lateMin: 30 }, reason: 'Fixed plan' },
    { op: 'add_entry', kind: 'fixed', title: 'Call parents', domain: 'social', date: day(0), time: '17:00', durationMin: 30, recurrence: { freq: 'weekly', byWeekday: [0] }, reason: 'Your Sunday ritual' },
    { op: 'add_task', title: 'Pay electricity bill', domain: 'admin', durationMin: 10, due: day(2), constraints: { preferred: ['lunch', 'evening'] }, reason: 'Due Wednesday, takes 10 minutes online' },
    { op: 'add_task', title: 'Water the plants', domain: 'chores', due: day(0), reason: 'Quick, no time block needed' },
    { op: 'add_task', title: 'Reply to Mia about the offsite', domain: 'work', due: day(1), reason: 'Quick reply' },
    { op: 'add_shopping', items: [{ name: 'Milk' }, { name: 'Eggs' }, { name: 'Spinach' }] },
  ]
}
