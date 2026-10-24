import React, { useEffect, useMemo, useRef } from 'react'
import { Sparkles, Repeat, ArrowUp, Check, Link2 } from 'lucide-react'
import { MIN, fmtTime, startOfDay, atMinutes, hm } from '../engine/time.js'
import { domainColor, DomainIcon } from './ui.jsx'

const PPM = 1.15 // pixels per minute
const RAIL = 46

const hexA = (hex, a) => {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}

// Assign side-by-side columns to blocks whose nominal times overlap. Items placed inside another
// block's break (a call in the lunch break) are drawn on top of that break instead.
function withColumns(all) {
  const insideBreak = (o) => all.some((p) => p !== o && p.breaks?.some((b) => o.start >= b.start && o.end <= b.end))
  const nested = all.filter(insideBreak).map((o) => ({ ...o, col: 0, cols: 1, nested: true }))
  const occs = all.filter((o) => !insideBreak(o))
  const out = [...nested]
  let cluster = []
  let clusterEnd = -Infinity
  const flush = () => {
    const colsEnd = []
    for (const o of cluster) {
      let col = colsEnd.findIndex((end) => end <= o.start)
      if (col === -1) col = colsEnd.length
      colsEnd[col] = o.end
      out.push({ ...o, col })
    }
    const n = colsEnd.length
    for (let i = out.length - cluster.length; i < out.length; i++) out[i].cols = n
    cluster = []
  }
  for (const o of occs) {
    if (o.start >= clusterEnd && cluster.length) flush()
    cluster.push(o)
    clusterEnd = Math.max(clusterEnd === -Infinity ? o.end : clusterEnd, o.end)
  }
  if (cluster.length) flush()
  return out
}

// A flex block sitting right behind an uncertain block can move up when that block ends early.
export function movesUpHint(o, occs) {
  if (o.entry.kind !== 'flex' || o.entry.pinned || o.done) return null
  if (o.entry.chain) return 'chain'
  const prev = occs.filter((p) => p.entryId !== o.entryId && p.end <= o.start + MIN).sort((a, b) => b.lateEnd - a.lateEnd)[0]
  if (prev && prev.lateEnd - prev.earlyEnd >= 15 * MIN && o.start - prev.lateEnd <= 30 * MIN) return 'up'
  return null
}

function Block({ o, top, occs, onOpen, onToggleDone, fresh, index }) {
  const e = o.entry
  const color = domainColor(e.domain)
  const coreH = Math.max(0, (o.earlyEnd - o.start) / MIN) * PPM
  const fullH = Math.max(26, ((o.end - o.start) / MIN) * PPM)
  const lateH = Math.max(0, ((o.lateEnd - o.end) / MIN) * PPM)
  const compact = fullH < 44
  const hint = movesUpHint(o, occs)
  const canTick = e.kind === 'flex' || e.taskId
  const uncertain = o.earlyEnd < o.end
  return (
    <div
      className={`absolute ${fresh ? 'animate-slide-in' : ''}`}
      style={{
        top,
        left: o.nested ? `${RAIL + 18}px` : `calc(${RAIL}px + (100% - ${RAIL + 6}px) * ${o.col / o.cols})`,
        width: o.nested ? `calc(100% - ${RAIL + 28}px)` : `calc((100% - ${RAIL + 6}px) / ${o.cols} - 4px)`,
        height: fullH + lateH,
        animationDelay: fresh ? `${index * 70}ms` : undefined,
        zIndex: o.nested ? 4 : e.kind === 'flex' ? 3 : 2,
      }}
    >
      <button
        type="button"
        onClick={() => onOpen(o)}
        className={`press relative block w-full overflow-hidden rounded-[12px] text-left ${o.done ? 'opacity-50' : ''}`}
        style={{
          height: fullH,
          background: uncertain
            ? `linear-gradient(to bottom, ${hexA(color, 0.2)} 0, ${hexA(color, 0.2)} ${coreH}px, ${hexA(color, 0.08)} ${coreH + 1}px, ${hexA(color, 0.05)} 100%)`
            : hexA(color, e.kind === 'flex' ? 0.22 : 0.17),
          boxShadow: e.source === 'ai' && e.kind === 'flex' ? `inset 0 0 0 1px ${hexA(color, 0.45)}` : `inset 0 0 0 1px ${hexA(color, 0.14)}`,
        }}
      >
        <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: color }} />
        {uncertain ? <span className="tail absolute inset-x-0 bottom-0" style={{ top: coreH }} /> : null}
        {o.breaks.map((b) => (
          <span
            key={b.start}
            className="absolute inset-x-[3px] flex items-center justify-end bg-[#0f0f12]/55 pr-2 text-[10px] font-semibold uppercase tracking-wide text-ink-3"
            style={{ top: ((b.start - o.start) / MIN) * PPM, height: ((b.end - b.start) / MIN) * PPM }}
          >
            {b.label}
          </span>
        ))}
        <div className={`relative flex h-full ${compact ? 'items-center gap-2 px-3' : 'flex-col px-3 py-1.5'} ${canTick ? 'pr-9' : ''}`}>
          <div className="flex min-w-0 items-center gap-1.5">
            <DomainIcon domain={e.domain} size={12} />
            <span className={`truncate text-[13.5px] font-semibold ${o.done ? 'line-through' : ''}`}>{e.title}</span>
            {e.source === 'ai' ? <Sparkles size={11} className="shrink-0 text-violet-300" /> : null}
            {e.recurrence ? <Repeat size={11} className="shrink-0 text-ink-3" /> : null}
          </div>
          <div className={`tabular truncate text-[11.5px] text-ink-2 ${compact ? 'ml-auto' : ''}`}>
            {fmtTime(o.start)}–{fmtTime(o.end)}
            {uncertain && !compact ? <span className="text-ink-3"> · may end {fmtTime(o.earlyEnd)}</span> : null}
          </div>
          {!compact && fullH > 58 ? (
            <div className="mt-1 flex flex-wrap gap-1">
              {hint === 'up' ? <span className="inline-flex items-center gap-0.5 rounded-full bg-cyan-400/15 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-300"><ArrowUp size={10} /> can move up</span> : null}
              {hint === 'chain' ? <span className="inline-flex items-center gap-0.5 rounded-full bg-cyan-400/15 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-300"><Link2 size={10} /> on your way home</span> : null}
              {e.hold ? <span className="rounded-full bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">HOLD</span> : null}
              {e.assumptions?.[0] ? <span className="rounded-full bg-white/[0.08] px-1.5 py-0.5 text-[10px] font-medium text-ink-2">{e.assumptions[0]}</span> : null}
            </div>
          ) : null}
        </div>
      </button>
      {lateH > 0 ? (
        <div className="tail pointer-events-none rounded-b-[10px] border border-dashed border-t-0" style={{ height: lateH, borderColor: hexA(color, 0.35), background: `linear-gradient(to bottom, ${hexA(color, 0.08)}, transparent)` }} />
      ) : null}
      {canTick ? (
        <button
          type="button"
          aria-label={o.done ? 'Mark as not done' : 'Mark as done'}
          onClick={() => onToggleDone(o)}
          className={`press absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full border ${o.done ? 'animate-check border-transparent bg-emerald-400 text-black' : 'border-white/25 bg-black/20'}`}
        >
          {o.done ? <Check size={13} strokeWidth={3} /> : null}
        </button>
      ) : null}
    </div>
  )
}

export function Timeline({ L, now, onOpen, onToggleDone, freshIds }) {
  const dayStart = startOfDay(L.dayMs)
  const firstHour = Math.min(6, ...L.occurrences.map((o) => Math.floor((o.start - dayStart) / 3_600_000)))
  const top0 = atMinutes(dayStart, Math.max(0, firstHour) * 60)
  const hours = []
  for (let h = Math.max(0, firstHour); h <= 24; h++) hours.push(h)
  const height = (hours.length - 1) * 60 * PPM + 20
  const blocks = useMemo(() => withColumns(L.occurrences), [L])
  const isToday = startOfDay(now) === dayStart
  const nowTop = ((now - top0) / MIN) * PPM
  const scroller = useRef(null)

  // Center on "now" when the day opens and whenever the clock jumps (time travel).
  const scrolledAt = useRef(null)
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    if (scrolledAt.current != null && Math.abs(now - scrolledAt.current) < 20 * MIN) return
    scrolledAt.current = now
    const target = isToday ? nowTop - 120 : ((L.occurrences[0]?.start ?? atMinutes(dayStart, 8 * 60)) - top0) / MIN * PPM - 40
    el.scrollTo({ top: Math.max(0, target), behavior: 'smooth' })
  }, [dayStart, now]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={scroller} className="no-scrollbar relative max-h-[560px] overflow-y-auto overscroll-contain rounded-[26px] border border-white/[0.06] bg-surface/50 pb-2 pt-4">
      <div className="relative" style={{ height }}>
        {hours.map((h) => (
          <div key={h} className="absolute inset-x-0 flex items-start" style={{ top: (h - Math.max(0, firstHour)) * 60 * PPM }}>
            <span className="tabular -mt-[7px] w-[42px] pr-2 text-right text-[11px] font-medium text-ink-3">{h === 24 ? '' : hm(h * 60)}</span>
            <span className="h-px flex-1 bg-white/[0.05]" />
          </div>
        ))}
        {blocks.map((o, i) => (
          <Block key={o.key} o={o} index={i} top={((o.start - top0) / MIN) * PPM} occs={L.occurrences} onOpen={onOpen} onToggleDone={onToggleDone} fresh={freshIds?.has(o.entryId)} />
        ))}
        {isToday && nowTop > 0 && nowTop < height ? (
          <div className="pointer-events-none absolute right-0 z-10 flex items-center" style={{ top: nowTop, left: RAIL - 6 }}>
            <span className="tabular -ml-[38px] mr-1 rounded-md bg-violet-500 px-1 py-[1px] text-[10.5px] font-bold text-white">{fmtTime(now)}</span>
            <span className="h-2 w-2 rounded-full bg-violet-400 shadow-[0_0_10px_2px_rgba(139,92,246,0.8)]" />
            <span className="h-[1.5px] flex-1 bg-gradient-to-r from-violet-400 to-cyan-300/40" />
          </div>
        ) : null}
      </div>
    </div>
  )
}
