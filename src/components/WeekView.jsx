import React, { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, CalendarPlus, Sparkles, Repeat, Link2 } from 'lucide-react'
import { layoutRange } from '../engine/layout.js'
import { MIN, addDays, startOfDay, fmtTime, fmtDay, fmtDuration, WEEKDAYS } from '../engine/time.js'
import { IconButton, domainColor, Card } from './ui.jsx'
import { eventsInRange } from '../engine/calendarExport.js'

function LoadStrip({ days, today, onPick }) {
  const busy = days.map((L) => {
    const fixed = L.occurrences.filter((o) => o.entry.kind === 'fixed').reduce((s, o) => s + (o.end - o.start) / MIN, 0)
    const flex = L.occurrences.filter((o) => o.entry.kind === 'flex').reduce((s, o) => s + (o.end - o.start) / MIN, 0)
    return { fixed, flex, allDay: L.allDay.length > 0 }
  })
  const max = Math.max(600, ...busy.map((b) => b.fixed + b.flex))
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between text-[12px] text-ink-3">
        <span className="font-semibold uppercase tracking-[0.08em]">Load</span>
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-white/30" /> fixed</span>
          <span className="flex items-center gap-1"><span className="accent-gradient h-2 w-2 rounded-sm" /> planned</span>
        </span>
      </div>
      <div className="flex h-24 items-end justify-between gap-2">
        {days.map((L, i) => {
          const b = busy[i]
          return (
            <button key={L.dateKey} type="button" onClick={() => onPick(L.dayMs)} className="press flex h-full flex-1 flex-col items-center justify-end gap-1">
              <div className="flex w-full max-w-[26px] flex-1 flex-col justify-end overflow-hidden rounded-lg bg-white/[0.04]">
                {b.allDay ? <div className="h-full bg-sky-400/40" /> : null}
                {!b.allDay ? <div className="accent-gradient w-full" style={{ height: `${(b.flex / max) * 100}%` }} /> : null}
                {!b.allDay ? <div className="w-full bg-white/25" style={{ height: `${(b.fixed / max) * 100}%` }} /> : null}
              </div>
              <span className={`text-[11px] font-semibold ${L.dayMs === today ? 'text-violet-300' : 'text-ink-3'}`}>{WEEKDAYS[new Date(L.dayMs).getDay()]}</span>
            </button>
          )
        })}
      </div>
    </Card>
  )
}

function AgendaRow({ o, onOpen }) {
  const e = o.entry
  const quiet = e.role === 'commute_to' || e.role === 'commute_home'
  return (
    <button type="button" onClick={() => onOpen(o)} className={`press flex w-full items-center gap-3 px-4 py-2.5 text-left ${quiet ? 'opacity-55' : ''} ${o.done ? 'opacity-40' : ''}`}>
      <div className="tabular w-[46px] shrink-0 text-[13px] font-semibold">{o.allDay ? 'all day' : fmtTime(o.start)}</div>
      <span className="h-8 w-[3px] shrink-0 rounded-full" style={{ background: domainColor(e.domain) }} />
      <div className="min-w-0 flex-1">
        <div className={`flex items-center gap-1.5 truncate text-[14.5px] font-medium ${o.done ? 'line-through' : ''}`}>
          <span className="truncate">{e.title}</span>
          {e.source === 'ai' ? <Sparkles size={11} className="shrink-0 text-violet-300" /> : null}
          {e.recurrence ? <Repeat size={11} className="shrink-0 text-ink-3" /> : null}
        </div>
        <div className="truncate text-[12px] text-ink-3">
          {o.allDay ? (e.days > 1 ? `${e.days} days` : 'All day') : fmtDuration(Math.round((o.end - o.start) / MIN))}
          {o.earlyEnd < o.end ? ` · may end ${fmtTime(o.earlyEnd)}` : ''}
          {o.lateEnd > o.end ? ` · up to ${fmtTime(o.lateEnd)}` : ''}
          {e.chain ? ' · on your way home' : ''}
          {e.hold ? ' · hold' : ''}
        </div>
      </div>
      {e.chain ? <Link2 size={13} className="text-cyan-300" /> : null}
    </button>
  )
}

export function WeekView({ header, data, now, onOpen, onPickDay, onExport }) {
  const [offset, setOffset] = useState(0)
  const today = startOfDay(now)
  const from = addDays(today, offset * 7)
  const days = useMemo(() => layoutRange(data.entries, from, 7), [data.entries, from])
  const exportable = useMemo(() => eventsInRange(data.entries, from, 7), [data.entries, from])
  const range = `${fmtDay(from)} – ${fmtDay(addDays(from, 6))}`
  return (
    <div className="space-y-5 pb-4">
      {React.cloneElement(header, {
        subtitle: offset === 0 ? `Next 7 days · ${range}` : range,
        right: (
          <div className="flex gap-2 pb-1">
            <IconButton label="Previous week" onClick={() => setOffset((x) => Math.max(0, x - 1))}>
              <ChevronLeft size={17} />
            </IconButton>
            <IconButton label="Next week" onClick={() => setOffset((x) => Math.min(7, x + 1))}>
              <ChevronRight size={17} />
            </IconButton>
          </div>
        ),
      })}
      <div className="space-y-4 px-5">
        <LoadStrip days={days} today={today} onPick={onPickDay} />
        <button
          type="button"
          disabled={!exportable.length}
          onClick={() => onExport(exportable)}
          className="press flex w-full items-center gap-3 rounded-[22px] border border-white/[0.06] bg-surface px-4 py-3.5 text-left disabled:opacity-40"
        >
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-emerald-400/15 text-emerald-300">
            <CalendarPlus size={19} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-semibold">Add to your calendar</div>
            <div className="text-[12.5px] text-ink-3">{exportable.length} planned entries with 15-min reminders · skips work & commute</div>
          </div>
          <ChevronRight size={16} className="text-ink-3" />
        </button>
        {days.map((L) => {
          const items = [...L.allDay, ...L.occurrences]
          return (
            <div key={L.dateKey}>
              <div className="mb-1.5 flex items-baseline justify-between px-1">
                <h3 className={`text-[15px] font-bold ${L.dayMs === today ? 'text-violet-300' : ''}`}>{fmtDay(L.dayMs, now)}</h3>
                <span className="text-[12px] text-ink-3">{L.occurrences.filter((o) => o.entry.kind === 'flex').length || 'no'} planned</span>
              </div>
              <Card className="divide-y divide-white/[0.05] overflow-hidden">
                {items.length ? items.map((o) => <AgendaRow key={o.key} o={o} onOpen={onOpen} />) : <div className="px-4 py-3 text-[13.5px] text-ink-3">Free day</div>}
              </Card>
            </div>
          )
        })}
      </div>
    </div>
  )
}

