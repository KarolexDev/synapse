import React, { useMemo, useState } from 'react'
import { Check, ChevronRight, CircleAlert, Hourglass, Plane, Timer, Link2 } from 'lucide-react'
import { layoutDay } from '../engine/layout.js'
import { MIN, addDays, startOfDay, dateKey, fmtTime, fmtDay, fmtDayLong, fmtDuration, WEEKDAYS } from '../engine/time.js'
import { Card, SectionTitle, DomainIcon, DomainDot, Badge } from './ui.jsx'
import { BrainDump, ClarificationCard } from './BrainDump.jsx'
import { Timeline } from './Timeline.jsx'

function liveOccurrence(L, now) {
  return L.occurrences.find(
    (o) => o.entry.kind === 'fixed' && !o.actual && !o.done && o.start <= now && now < o.lateEnd && (o.entry.deviation.earlyMin || o.entry.deviation.lateMin),
  )
}

function LiveCard({ occ, followers, now, onEarly, onLate }) {
  const [lateOpen, setLateOpen] = useState(false)
  const total = occ.lateEnd - occ.start
  const pct = (x) => `${Math.min(100, Math.max(0, ((x - occ.start) / total) * 100))}%`
  const overrun = now >= occ.end
  return (
    <Card className="animate-slide-in p-4">
      <div className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.08em] text-emerald-300">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
          <span className="relative h-2 w-2 rounded-full bg-emerald-400" />
        </span>
        Now
      </div>
      <div className="mt-1 flex items-baseline justify-between gap-2">
        <span className="flex items-center gap-2 text-[19px] font-bold">
          <DomainIcon domain={occ.entry.domain} size={16} /> {occ.entry.title}
        </span>
        <span className="tabular text-[13px] text-ink-2">since {fmtTime(occ.start)}</span>
      </div>
      <p className="mt-0.5 text-[13px] text-ink-2">
        Ends between <b className="text-ink">{fmtTime(occ.earlyEnd)}</b> and <b className="text-ink">{fmtTime(occ.lateEnd)}</b>
        {followers ? ` · ${followers} follow${followers === 1 ? 's' : ''} automatically` : ''}
      </p>
      <div className="relative mt-3 h-2 overflow-hidden rounded-full bg-white/[0.07]">
        <div className="tail absolute inset-y-0 bg-amber-300/10" style={{ left: pct(occ.earlyEnd), right: 0 }} />
        <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-emerald-400 to-cyan-300" style={{ width: pct(now) }} />
        <div className="absolute inset-y-[-2px] w-[2px] bg-white/70" style={{ left: pct(occ.end) }} />
      </div>
      <div className="tabular mt-1 flex justify-between text-[10.5px] text-ink-3">
        <span>{fmtTime(occ.start)}</span>
        <span>may end {fmtTime(occ.earlyEnd)} – {fmtTime(occ.lateEnd)}</span>
      </div>
      {lateOpen ? (
        <div className="mt-3 flex items-center gap-2">
          <span className="text-[13px] text-ink-2">How much later?</span>
          {[15, 30, 60].map((m) => (
            <button key={m} type="button" onClick={() => onLate(m)} className="press rounded-full bg-amber-400/15 px-3 py-1.5 text-[13px] font-semibold text-amber-200">
              +{m}
            </button>
          ))}
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" onClick={overrun ? () => onLate(0) : onEarly} className="press inline-flex items-center justify-center gap-1.5 rounded-2xl bg-emerald-400/15 py-2.5 text-[14px] font-semibold text-emerald-200">
            <Check size={16} /> {overrun ? 'Finished now' : 'Finished early'}
          </button>
          <button type="button" onClick={() => setLateOpen(true)} className="press inline-flex items-center justify-center gap-1.5 rounded-2xl bg-amber-400/15 py-2.5 text-[14px] font-semibold text-amber-200">
            <Timer size={16} /> Running late
          </button>
        </div>
      )}
    </Card>
  )
}

function relative(ms, now) {
  const m = Math.round((ms - now) / MIN)
  if (m < 60) return `in ${m} min`
  if (m < 24 * 60) return `in ${fmtDuration(Math.round(m / 5) * 5)}`
  return fmtDay(ms, now)
}

function UpNext({ occ, now, onOpen }) {
  return (
    <button type="button" onClick={() => onOpen(occ)} className="press flex w-full items-center gap-3 rounded-[22px] border border-white/[0.06] bg-surface px-4 py-3 text-left">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white/[0.06]">
        <DomainIcon domain={occ.entry.domain} size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-ink-3">Up next · {relative(occ.start, now)}</div>
        <div className="truncate text-[15.5px] font-semibold">{occ.entry.title}</div>
      </div>
      <div className="tabular text-right text-[13px] text-ink-2">
        {fmtTime(occ.start)}
        {occ.entry.chain ? <div className="flex items-center justify-end gap-1 text-[11px] text-cyan-300"><Link2 size={10} /> way home</div> : null}
      </div>
      <ChevronRight size={16} className="text-ink-3" />
    </button>
  )
}

export function DayStrip({ now, selected, onSelect, entries }) {
  const today = startOfDay(now)
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i))
  return (
    <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
      {days.map((d) => {
        const L = layoutDay(entries, d)
        const planned = L.occurrences.filter((o) => o.entry.kind === 'flex').length
        const active = d === selected
        return (
          <button
            key={d}
            type="button"
            onClick={() => onSelect(d)}
            className={`press flex w-[50px] shrink-0 flex-col items-center rounded-2xl py-2 ${active ? 'bg-white text-black' : 'bg-white/[0.05] text-ink'}`}
          >
            <span className={`text-[11px] font-semibold uppercase ${active ? 'text-black/60' : 'text-ink-3'}`}>{d === today ? 'Today' : WEEKDAYS[new Date(d).getDay()]}</span>
            <span className="tabular text-[18px] font-bold leading-tight">{new Date(d).getDate()}</span>
            <span className="mt-0.5 flex h-1.5 gap-0.5">
              {Array.from({ length: Math.min(3, planned) }).map((_, i) => (
                <span key={i} className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-violet-600' : 'bg-violet-400'}`} />
              ))}
            </span>
          </button>
        )
      })}
    </div>
  )
}

export function TodayView({ header, data, now, day, setDay, dump, setDump, onOrganize, busy, onOpen, onToggleDone, onToggleTask, questionProps, freshIds, onEarly, onLate }) {
  const today = startOfDay(now)
  const L = useMemo(() => layoutDay(data.entries, day), [data.entries, day])
  const LToday = useMemo(() => (day === today ? L : layoutDay(data.entries, today)), [data.entries, day, today, L])
  const live = liveOccurrence(LToday, now)
  const followers = live ? LToday.occurrences.filter((o) => o.entry.after === live.entryId || o.entry.chain?.after === live.entryId).length : 0
  const next = useMemo(() => {
    const later = LToday.occurrences.find((o) => o.start > now && !o.done && o.entryId !== live?.entryId)
    if (later) return later
    return layoutDay(data.entries, addDays(today, 1)).occurrences.find((o) => !o.done) || null
  }, [LToday, data.entries, now, today, live])
  const waiting = data.entries.filter((e) => e.status === 'planned' && e.awaiting)
  const unplaced = data.entries.filter((e) => e.status === 'planned' && e.kind === 'flex' && !e.awaiting && !e.date && !e.chain)
  const dk = dateKey(day)
  const dueTasks = data.tasks.filter((t) => t.status === 'open' && !t.entryId && t.due === dk)
  const { questions, ...qp } = questionProps
  const aiCount = L.occurrences.filter((o) => o.entry.source === 'ai').length

  return (
    <div className="space-y-5 pb-4">
      {header}
      <div className="space-y-4 px-5">
        <BrainDump value={dump} onChange={setDump} onSubmit={onOrganize} busy={busy} />

        {questions.length ? <ClarificationCard question={questions[0]} index={0} total={questions.length} {...qp} /> : null}

        {waiting.length ? (
          <div className="space-y-2">
            {waiting.map((e) => (
              <div key={e.id} className="flex items-center gap-3 rounded-[20px] border border-dashed border-white/15 px-4 py-3">
                <Hourglass size={16} className="text-violet-300" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14.5px] font-semibold text-ink-2">{e.title}</div>
                  <div className="text-[12px] text-ink-3">Waiting for your answer above</div>
                </div>
                <Badge tone="ai">pending</Badge>
              </div>
            ))}
          </div>
        ) : null}

        {unplaced.map((e) => (
          <button key={e.id} type="button" onClick={() => onOpen({ entry: e, entryId: e.id, dateKey: null })} className="press flex w-full items-center gap-3 rounded-[20px] bg-rose-500/10 px-4 py-3 text-left">
            <CircleAlert size={16} className="text-rose-300" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14.5px] font-semibold">{e.title}</div>
              <div className="text-[12px] text-rose-200/80">No free slot within its limits. Tap to pick a time.</div>
            </div>
            <ChevronRight size={16} className="text-ink-3" />
          </button>
        ))}

        {live ? <LiveCard occ={live} followers={followers} now={now} onEarly={() => onEarly(live)} onLate={(m) => onLate(live, m)} /> : null}
        {next ? <UpNext occ={next} now={now} onOpen={onOpen} /> : null}

        <div>
          <SectionTitle right={<span className="text-[12px] text-ink-3">{aiCount ? `${aiCount} planned by Synapse` : ''}</span>}>
            {day === today ? 'Your day' : fmtDayLong(day)}
          </SectionTitle>
          <DayStrip now={now} selected={day} onSelect={setDay} entries={data.entries} />
        </div>

        {L.allDay.length ? (
          <div className="flex flex-wrap gap-2">
            {L.allDay.map((o) => (
              <button key={o.key} type="button" onClick={() => onOpen(o)} className="press inline-flex items-center gap-2 rounded-full bg-sky-400/15 px-3 py-1.5 text-[13px] font-semibold text-sky-200">
                <Plane size={13} /> {o.entry.title} · all day
              </button>
            ))}
          </div>
        ) : null}

        <Timeline key={dk} L={L} now={now} onOpen={onOpen} onToggleDone={onToggleDone} freshIds={freshIds} />

        {dueTasks.length ? (
          <div>
            <SectionTitle>Also due {day === today ? 'today' : fmtDay(day, now)}</SectionTitle>
            <Card className="divide-y divide-white/[0.05]">
              {dueTasks.map((t) => (
                <button key={t.id} type="button" onClick={() => onToggleTask(t.id)} className="press flex w-full items-center gap-3 px-4 py-3 text-left">
                  <span className="grid h-5 w-5 place-items-center rounded-full border border-white/30" />
                  <span className="flex-1 truncate text-[15px]">{t.title}</span>
                  <DomainDot domain={t.domain} />
                </button>
              ))}
            </Card>
          </div>
        ) : null}
      </div>
    </div>
  )
}
