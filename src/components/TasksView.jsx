import React, { useMemo, useRef, useState } from 'react'
import { Check, Trash2, ShoppingBag, Route, Plus, Sparkles, CornerDownRight, Hourglass, CircleAlert, ChevronDown, X } from 'lucide-react'
import { occurrenceOf } from '../engine/layout.js'
import { fmtWhen, fmtDay, parseDateKey } from '../engine/time.js'
import { DOMAINS } from '../state/model.js'
import { Card, Chip, SectionTitle, DomainDot } from './ui.jsx'

/** Swipe left to reveal and trigger delete; plain taps pass through. */
function SwipeRow({ onDelete, children }) {
  const [dx, setDx] = useState(0)
  const start = useRef(null)
  const moved = useRef(false)
  return (
    <div className="relative overflow-hidden">
      <div className="absolute inset-y-0 right-0 flex w-24 items-center justify-end bg-rose-500/90 pr-5 text-white" style={{ opacity: Math.min(1, -dx / 60) }}>
        <Trash2 size={18} />
      </div>
      <div
        className="relative bg-surface"
        style={{ transform: `translateX(${dx}px)`, transition: start.current ? 'none' : 'transform 0.25s ease', touchAction: 'pan-y' }}
        onPointerDown={(e) => {
          start.current = { x: e.clientX, y: e.clientY }
          moved.current = false
        }}
        onPointerMove={(e) => {
          if (!start.current) return
          const ddx = e.clientX - start.current.x
          const ddy = e.clientY - start.current.y
          if (!moved.current && Math.abs(ddx) > 8 && Math.abs(ddx) > Math.abs(ddy)) moved.current = true
          if (moved.current) setDx(Math.max(-110, Math.min(0, ddx)))
        }}
        onPointerUp={() => {
          if (dx < -75) onDelete()
          start.current = null
          setDx(0)
        }}
        onPointerCancel={() => {
          start.current = null
          setDx(0)
        }}
        onClickCapture={(e) => {
          if (moved.current) {
            e.stopPropagation()
            e.preventDefault()
          }
        }}
      >
        {children}
      </div>
    </div>
  )
}

function Checkbox({ checked, onClick, color = '#34D399' }) {
  return (
    <button
      type="button"
      aria-label={checked ? 'Mark as not done' : 'Mark as done'}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className={`press grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full border-[1.5px] ${checked ? 'animate-check border-transparent' : 'border-white/30'}`}
      style={checked ? { background: color } : undefined}
    >
      {checked ? <Check size={13} strokeWidth={3} className="text-black" /> : null}
    </button>
  )
}

function TaskRow({ task, entry, occ, parent, now, onToggle, onDelete, onOpen }) {
  const done = task.status === 'done'
  const meta = []
  if (occ) meta.push(fmtWhen(occ.start, now))
  else if (entry?.awaiting) meta.push('Waiting for your answer')
  else if (entry) meta.push('No free slot yet')
  if (task.durationMin) meta.push(`${task.durationMin} min`)
  if (task.due && !occ) meta.push(`Due ${fmtDay(parseDateKey(task.due), now)}`)
  return (
    <SwipeRow onDelete={onDelete}>
      <div role="button" tabIndex={0} onClick={() => entry && onOpen(entry, occ)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        <Checkbox checked={done} onClick={onToggle} />
        <div className="min-w-0 flex-1">
          <div className={`flex items-center gap-1.5 text-[15px] ${done ? 'text-ink-3' : ''}`}>
            <span className={`truncate ${done ? 'strike' : ''}`}>{task.title}</span>
            {task.source === 'ai' ? <Sparkles size={11} className="shrink-0 text-violet-300" /> : null}
          </div>
          <div className="flex items-center gap-1.5 truncate text-[12.5px] text-ink-3">
            {parent ? (
              <span className="inline-flex items-center gap-0.5 text-violet-300/90">
                <CornerDownRight size={11} /> for {parent}
              </span>
            ) : null}
            {meta.join(' · ')}
          </div>
        </div>
        {entry?.awaiting ? <Hourglass size={14} className="text-violet-300" /> : entry && !occ ? <CircleAlert size={14} className="text-rose-300" /> : null}
        <DomainDot domain={task.domain} />
      </div>
    </SwipeRow>
  )
}

function ShoppingCard({ data, now, onToggle, onDelete, onAdd, onOpen }) {
  const [name, setName] = useState('')
  const run = data.tasks.find((t) => t.kind === 'grocery_run' && t.status === 'open')
  const runEntry = run && data.entries.find((e) => e.id === run.entryId)
  const runOcc = runEntry && occurrenceOf(data.entries, runEntry)
  const items = [...data.shopping].sort((a, b) => a.checked - b.checked || a.createdAt - b.createdAt)
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2 px-4 pb-2 pt-4">
        <ShoppingBag size={16} className="text-pink-300" />
        <span className="text-[16px] font-bold">Shopping list</span>
        <span className="ml-auto text-[12.5px] text-ink-3">{items.filter((i) => !i.checked).length} to buy</span>
      </div>
      {runOcc ? (
        <button type="button" onClick={() => onOpen(runEntry, runOcc)} className="press mx-4 mb-2 flex w-[calc(100%-2rem)] items-center gap-2 rounded-xl bg-pink-400/10 px-3 py-2 text-left text-[12.5px] text-pink-200">
          <Route size={14} /> Grocery run · {fmtWhen(runOcc.start, now)}
          {runEntry.chain ? ' · on your way home' : ''}
        </button>
      ) : null}
      <div className="divide-y divide-white/[0.05]">
        {items.map((s) => (
          <SwipeRow key={s.id} onDelete={() => onDelete(s.id)}>
            <div key={`${s.id}-${s.mergedAt || 0}`} className={`flex items-center gap-3 px-4 py-2.5 ${s.mergedAt && now - s.mergedAt < 60_000 ? 'animate-merge' : ''}`}>
              <Checkbox checked={s.checked} onClick={() => onToggle(s.id)} color="#F472B6" />
              <span className={`flex-1 truncate text-[15px] ${s.checked ? 'strike text-ink-3' : ''}`}>{s.name}</span>
              {s.qty > 1 ? <span className="tabular text-[12.5px] text-ink-3">×{s.qty}</span> : null}
              {s.mergedAt && now - s.mergedAt < 10 * 60_000 ? <span className="rounded-full bg-pink-400/15 px-1.5 py-0.5 text-[10px] font-semibold text-pink-200">merged</span> : null}
              <button type="button" aria-label={`Remove ${s.name}`} onClick={() => onDelete(s.id)} className="press hidden text-ink-3 hover:text-ink sm:block">
                <X size={14} />
              </button>
            </div>
          </SwipeRow>
        ))}
      </div>
      <form
        className="flex items-center gap-2 border-t border-white/[0.05] px-4 py-2.5"
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim()) onAdd(name.trim())
          setName('')
        }}
      >
        <Plus size={16} className="text-ink-3" />
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Add item" className="min-w-0 flex-1 bg-transparent text-[15px] placeholder:text-ink-3 focus:outline-none" />
      </form>
    </Card>
  )
}

export function TasksView({ header, data, now, onToggleTask, onDeleteTask, onOpen, onToggleShopping, onDeleteShopping, onAddShopping }) {
  const [filter, setFilter] = useState('all')
  const [showDone, setShowDone] = useState(false)
  const entryById = useMemo(() => new Map(data.entries.map((e) => [e.id, e])), [data.entries])
  const titleOf = (id) => entryById.get(id)?.title || data.tasks.find((t) => t.id === id)?.title
  const visible = data.tasks.filter((t) => t.kind !== 'grocery_run' && t.status !== 'cancelled' && (filter === 'all' || t.domain === filter))
  const domains = [...new Set(data.tasks.filter((t) => t.status === 'open' && t.kind !== 'grocery_run').map((t) => t.domain))]
  const rows = visible.map((t) => {
    const entry = t.entryId ? entryById.get(t.entryId) : null
    const occ = entry && entry.status !== 'cancelled' ? occurrenceOf(data.entries, entry) : null
    return { t, entry, occ }
  })
  const open = rows.filter((r) => r.t.status === 'open')
  const scheduled = open.filter((r) => r.occ).sort((a, b) => a.occ.start - b.occ.start)
  const pending = open.filter((r) => r.entry && !r.occ)
  const anytime = open.filter((r) => !r.entry).sort((a, b) => (a.t.due || '9').localeCompare(b.t.due || '9'))
  const done = rows.filter((r) => r.t.status === 'done')
  const row = (r) => (
    <TaskRow key={r.t.id} task={r.t} entry={r.entry} occ={r.occ} parent={r.t.followUpOf ? titleOf(r.t.followUpOf) : null} now={now} onToggle={() => onToggleTask(r.t.id)} onDelete={() => onDeleteTask(r.t.id)} onOpen={onOpen} />
  )
  const section = (title, list, hint) =>
    list.length ? (
      <div>
        <SectionTitle right={hint ? <span className="text-[12px] text-ink-3">{hint}</span> : null}>{title}</SectionTitle>
        <Card className="divide-y divide-white/[0.05] overflow-hidden">{list.map(row)}</Card>
      </div>
    ) : null

  return (
    <div className="space-y-5 pb-4">
      {React.cloneElement(header, { subtitle: `${open.length} open · swipe left to delete` })}
      <div className="space-y-4 px-5">
        <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5">
          <Chip active={filter === 'all'} onClick={() => setFilter('all')}>All</Chip>
          {domains.map((d) => (
            <Chip key={d} active={filter === d} color={DOMAINS[d].color} onClick={() => setFilter(d)}>
              {DOMAINS[d].label}
            </Chip>
          ))}
        </div>
        {section('Scheduled', scheduled, 'time-blocked by Synapse')}
        {section('Needs a slot', pending)}
        {section('Anytime', anytime, 'quick, no block needed')}
        {!open.length ? <Card className="px-4 py-6 text-center text-[14px] text-ink-3">Nothing open. Dump something on the Today tab.</Card> : null}
        <ShoppingCard data={data} now={now} onToggle={onToggleShopping} onDelete={onDeleteShopping} onAdd={onAddShopping} onOpen={onOpen} />
        {done.length ? (
          <div>
            <button type="button" onClick={() => setShowDone((x) => !x)} className="press mb-2 flex items-center gap-1 px-1 text-[13px] font-semibold uppercase tracking-[0.08em] text-ink-3">
              Done ({done.length}) <ChevronDown size={14} className={showDone ? 'rotate-180' : ''} />
            </button>
            {showDone ? <Card className="divide-y divide-white/[0.05] overflow-hidden">{done.map(row)}</Card> : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
