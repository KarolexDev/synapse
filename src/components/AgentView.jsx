import React, { useMemo, useState } from 'react'
import {
  Brain, Plus, CalendarCheck, Pencil, X, Check, GitMerge, MessageCircleQuestion, CornerDownRight, Zap, Route, RotateCcw, CircleAlert, TriangleAlert, Undo2, Moon, Info, ChevronDown,
} from 'lucide-react'
import { fmtTime, fmtDay, startOfDay } from '../engine/time.js'
import { Card, Chip } from './ui.jsx'

const TYPES = {
  parse: { icon: Brain, cls: 'bg-violet-500/20 text-violet-300', label: 'Understood' },
  add: { icon: Plus, cls: 'bg-sky-400/15 text-sky-300', label: 'Added' },
  schedule: { icon: CalendarCheck, cls: 'bg-emerald-400/15 text-emerald-300', label: 'Scheduled' },
  update: { icon: Pencil, cls: 'bg-amber-400/15 text-amber-300', label: 'Updated' },
  cancel: { icon: X, cls: 'bg-rose-500/15 text-rose-300', label: 'Removed' },
  complete: { icon: Check, cls: 'bg-emerald-400/15 text-emerald-300', label: 'Done' },
  merge: { icon: GitMerge, cls: 'bg-pink-400/15 text-pink-300', label: 'Merged' },
  clarify: { icon: MessageCircleQuestion, cls: 'bg-violet-500/20 text-violet-300', label: 'Question' },
  answer: { icon: CornerDownRight, cls: 'bg-violet-500/20 text-violet-300', label: 'Answer' },
  domino: { icon: Zap, cls: 'bg-amber-400/15 text-amber-300', label: 'Chain reaction' },
  reflow: { icon: Route, cls: 'bg-cyan-400/15 text-cyan-300', label: 'Re-planned' },
  rollover: { icon: RotateCcw, cls: 'bg-orange-400/15 text-orange-300', label: 'Rolled over' },
  conflict: { icon: CircleAlert, cls: 'bg-rose-500/15 text-rose-300', label: 'Conflict' },
  error: { icon: TriangleAlert, cls: 'bg-rose-500/15 text-rose-300', label: 'Issue' },
  undo: { icon: Undo2, cls: 'bg-white/10 text-ink-2', label: 'Undo' },
  prefs: { icon: Moon, cls: 'bg-indigo-400/15 text-indigo-300', label: 'Preference' },
  system: { icon: Info, cls: 'bg-white/10 text-ink-2', label: 'System' },
}

const FILTERS = [
  { id: 'all', label: 'All', types: null },
  { id: 'plan', label: 'Planning', types: ['parse', 'add', 'schedule', 'prefs'] },
  { id: 'change', label: 'Changes', types: ['reflow', 'rollover', 'update', 'cancel', 'complete', 'undo', 'domino', 'merge'] },
  { id: 'ask', label: 'Questions', types: ['clarify', 'answer'] },
  { id: 'issue', label: 'Issues', types: ['conflict', 'error'] },
]

const compactDuration = (min) => (min < 60 ? `${min}m` : `${Math.floor(min / 60)}h${min % 60 ? ` ${min % 60}m` : ''}`)

const DECISION_TYPES = new Set(['schedule', 'reflow', 'rollover', 'merge', 'domino', 'conflict', 'update', 'cancel', 'complete'])

function LogItem({ l, onOpenRef, entryExists }) {
  const [open, setOpen] = useState(false)
  const [raw, setRaw] = useState(false)
  const t = TYPES[l.type] || TYPES.system
  const Icon = t.icon
  const ref = l.refs?.find(entryExists)
  return (
    <div className="flex gap-3 px-4 py-3">
      <div className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full ${t.cls}`}>
        <Icon size={14} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-3">{t.label}</span>
          <span className="tabular shrink-0 text-[11px] text-ink-3">{fmtTime(l.ts)}</span>
        </div>
        <div className="text-[14.5px] font-semibold leading-snug">{l.title}</div>
        {l.detail ? <div className="mt-0.5 text-[13px] leading-snug text-ink-2">{l.detail}</div> : null}
        <div className="mt-1 flex items-center gap-3">
          {l.lines?.length ? (
            <button type="button" onClick={() => setOpen((x) => !x)} className="press inline-flex items-center gap-1 text-[12.5px] font-semibold text-violet-300">
              {open ? 'Hide' : 'Show'} reasoning ({l.lines.length}) <ChevronDown size={13} className={open ? 'rotate-180' : ''} />
            </button>
          ) : null}
          {ref ? (
            <button type="button" onClick={() => onOpenRef(ref)} className="press text-[12.5px] font-semibold text-ink-3 hover:text-ink-2">
              Open →
            </button>
          ) : null}
          {l.raw ? (
            <button type="button" onClick={() => setRaw((x) => !x)} className="press text-[12.5px] font-semibold text-ink-3 hover:text-ink-2">
              {raw ? 'Hide' : 'Show'} Claude’s answer
            </button>
          ) : null}
        </div>
        {raw ? <pre className="no-scrollbar mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-black/40 p-3 font-mono text-[10.5px] leading-snug text-ink-2">{l.raw}</pre> : null}
        {open ? (
          <ul className="mt-2 space-y-1 border-l border-white/10 pl-3">
            {l.lines.map((x, i) => (
              <li key={i} className="text-[12.5px] leading-snug text-ink-2">
                {x}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  )
}

export function AgentView({ header, log, stats, now, onOpenRef, entryExists }) {
  const [filter, setFilter] = useState('all')
  const decisions = log.filter((l) => DECISION_TYPES.has(l.type)).length + log.reduce((s, l) => s + (l.type === 'schedule' ? l.lines?.length || 0 : 0), 0)
  const organized = log.filter((l) => l.type === 'schedule' || l.type === 'add').length
  const questions = log.filter((l) => l.type === 'clarify').length
  const groups = useMemo(() => {
    const types = FILTERS.find((f) => f.id === filter)?.types
    const list = types ? log.filter((l) => types.includes(l.type)) : log
    const out = []
    for (const l of list) {
      const last = out[out.length - 1]
      if (last && l.batchId && last.batchId === l.batchId) last.items.push(l)
      else out.push({ batchId: l.batchId, ts: l.ts, items: [l] })
    }
    return out.reverse()
  }, [log, filter])
  const metrics = [
    { label: 'Decisions', value: decisions },
    { label: 'Organized', value: organized },
    { label: 'Questions', value: questions },
    { label: 'Reclaimed', value: compactDuration(stats.reclaimedMin || 0) },
  ]
  return (
    <div className="space-y-5 pb-4">
      {React.cloneElement(header, { subtitle: 'Every decision, explained' })}
      <div className="space-y-4 px-5">
        <div className="grid grid-cols-4 gap-2">
          {metrics.map((m) => (
            <Card key={m.label} className="px-2 py-3 text-center">
              <div className="tabular truncate text-[19px] font-bold">{m.value}</div>
              <div className="text-[11px] font-medium text-ink-3">{m.label}</div>
            </Card>
          ))}
        </div>
        <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5">
          {FILTERS.map((f) => (
            <Chip key={f.id} active={filter === f.id} onClick={() => setFilter(f.id)}>
              {f.label}
            </Chip>
          ))}
        </div>
        {groups.length ? (
          groups.map((g, i) => (
            <div key={`${g.batchId || 'x'}-${i}`}>
              <div className="mb-1.5 px-1 text-[12px] font-semibold text-ink-3">
                {startOfDay(g.ts) === startOfDay(now) ? 'Today' : fmtDay(g.ts)} · {fmtTime(g.ts)}
              </div>
              <Card className="divide-y divide-white/[0.05] overflow-hidden">
                {g.items.map((l) => (
                  <LogItem key={l.id} l={l} onOpenRef={onOpenRef} entryExists={entryExists} />
                ))}
              </Card>
            </div>
          ))
        ) : (
          <Card className="px-4 py-6 text-center text-[14px] text-ink-3">No activity yet. Every decision Synapse makes shows up here.</Card>
        )}
      </div>
    </div>
  )
}
