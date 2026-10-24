// App chrome: iPhone frame (desktop), tab bar, toast banners, processing overlay.

import React, { useEffect, useState } from 'react'
import { Signal, Wifi, BatteryFull, CalendarClock, CalendarDays, ListChecks, Activity, Sparkles, Zap, RotateCcw, Check, TriangleAlert, Undo2, CircleCheck, LoaderCircle } from 'lucide-react'
import { Orb, GhostButton, PrimaryButton } from './ui.jsx'

const PHONE_W = 393
const PHONE_H = 852
const BEZEL = 11

export function DeviceFrame({ framed, statusTime, children }) {
  const [scale, setScale] = useState(1)
  useEffect(() => {
    if (!framed) return
    const fit = () => setScale(Math.min(1, (window.innerHeight - 40) / (PHONE_H + BEZEL * 2)))
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [framed])

  if (!framed) return <div className="relative h-[100dvh] w-full overflow-hidden bg-bg">{children}</div>

  const w = PHONE_W + BEZEL * 2
  const h = PHONE_H + BEZEL * 2
  return (
    <div
      className="flex min-h-screen items-center justify-center overflow-hidden"
      style={{ background: 'radial-gradient(900px 600px at 20% 10%, rgba(139,92,246,0.18), transparent 60%), radial-gradient(800px 600px at 85% 90%, rgba(34,211,238,0.12), transparent 60%), #08080a' }}
    >
      <div style={{ width: w * scale, height: h * scale }} className="relative">
        <div
          className="absolute left-0 top-0 origin-top-left rounded-[64px] bg-[#1c1c22] shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_40px_120px_-20px_rgba(0,0,0,0.9),inset_0_0_0_2px_rgba(255,255,255,0.04)]"
          style={{ width: w, height: h, padding: BEZEL, transform: `scale(${scale})` }}
        >
          <div className="frame relative h-full w-full overflow-hidden rounded-[53px] bg-bg">
            {children}
            <div className="pointer-events-none absolute inset-x-0 top-0 z-[60] flex h-[54px] items-center justify-between pl-[42px] pr-[30px] pt-[6px] text-[16px] font-semibold">
              <span className="tabular">{statusTime}</span>
              <div className="flex items-center gap-[6px]">
                <Signal size={16} strokeWidth={2.6} />
                <Wifi size={16} strokeWidth={2.6} />
                <BatteryFull size={24} strokeWidth={1.8} />
              </div>
            </div>
            <div className="pointer-events-none absolute left-1/2 top-[11px] z-[60] h-[36px] w-[124px] -translate-x-1/2 rounded-full bg-black" />
            <div className="pointer-events-none absolute bottom-[8px] left-1/2 z-[60] h-[5px] w-[136px] -translate-x-1/2 rounded-full bg-white/75" />
          </div>
        </div>
      </div>
    </div>
  )
}

const TABS = [
  { id: 'today', label: 'Today', icon: CalendarClock },
  { id: 'week', label: 'Week', icon: CalendarDays },
  { id: 'capture' },
  { id: 'tasks', label: 'Tasks', icon: ListChecks },
  { id: 'agent', label: 'Agent', icon: Activity },
]

export function TabBar({ tab, onTab, onCapture, badges = {} }) {
  return (
    <nav className="glass absolute inset-x-0 bottom-0 z-30 border-t border-white/[0.06] pb-safe">
      <div className="flex h-[60px] items-stretch justify-around px-1">
        {TABS.map((t) =>
          t.id === 'capture' ? (
            <div key="capture" className="flex w-[72px] justify-center">
              <button
                type="button"
                aria-label="Brain dump"
                onClick={onCapture}
                className="press accent-gradient sync-glow -mt-5 grid h-[58px] w-[58px] place-items-center rounded-full border-4 border-[#0f0f12] text-white"
              >
                <Sparkles size={24} strokeWidth={2.2} />
              </button>
            </div>
          ) : (
            <button key={t.id} type="button" onClick={() => onTab(t.id)} className={`press relative flex w-[64px] flex-col items-center justify-center gap-0.5 ${tab === t.id ? 'text-ink' : 'text-ink-3'}`}>
              <t.icon size={23} strokeWidth={tab === t.id ? 2.4 : 2} />
              <span className="text-[10.5px] font-semibold">{t.label}</span>
              {badges[t.id] ? <span className="absolute right-[14px] top-[6px] h-2 w-2 rounded-full bg-violet-400 ring-2 ring-[#0f0f12]" /> : null}
            </button>
          ),
        )}
      </div>
    </nav>
  )
}

const TOAST_ICONS = {
  success: { icon: Sparkles, cls: 'text-violet-300 bg-violet-500/20' },
  reflow: { icon: Zap, cls: 'text-cyan-300 bg-cyan-400/20' },
  rollover: { icon: RotateCcw, cls: 'text-amber-300 bg-amber-400/20' },
  info: { icon: Check, cls: 'text-emerald-300 bg-emerald-400/20' },
  error: { icon: TriangleAlert, cls: 'text-rose-300 bg-rose-500/20' },
}

function Toast({ toast, onDismiss, onUndo }) {
  useEffect(() => {
    const t = setTimeout(() => onDismiss(toast.id), 5200)
    return () => clearTimeout(t)
  }, [toast.id, onDismiss])
  const { icon: Icon, cls } = TOAST_ICONS[toast.kind] || TOAST_ICONS.info
  return (
    <div className="animate-toast-in glass-card pointer-events-auto flex items-center gap-3 rounded-[22px] border border-white/[0.08] p-3 pr-3 shadow-2xl" onClick={() => onDismiss(toast.id)}>
      <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${cls}`}>
        <Icon size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-semibold">{toast.title}</div>
        {toast.detail ? <div className="truncate text-[12.5px] text-ink-2">{toast.detail}</div> : null}
      </div>
      {toast.batchId && onUndo ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onUndo(toast.batchId)
          }}
          className="press inline-flex shrink-0 items-center gap-1 rounded-full bg-white/[0.1] px-3 py-1.5 text-[12.5px] font-semibold"
        >
          <Undo2 size={13} /> Undo
        </button>
      ) : null}
    </div>
  )
}

export function Toasts({ toasts, onDismiss, onUndo }) {
  return (
    <div className="pointer-events-none absolute inset-x-3 z-[55] flex flex-col gap-2" style={{ top: 'calc(var(--sat) + 4px)' }}>
      {toasts.map((t) => (
        <Toast key={t.id} toast={t} onDismiss={onDismiss} onUndo={onUndo} />
      ))}
    </div>
  )
}

const STAGES = {
  dump: ['Synthesizing thoughts…', 'Scanning calendar whitespace…', 'Resolving scheduling conflicts…'],
  skeleton: ['Understanding your week…', 'Building your routines…', 'Checking for overlaps…'],
  answer: ['Reading your answer…', 'Re-planning affected items…', 'Resolving conflicts…'],
}

export function ProcessingOverlay({ state, onRetry, onClose }) {
  if (!state) return null
  const labels = STAGES[state.mode] || STAGES.dump
  return (
    <div className="animate-fade-in absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#0b0b0e]/80 px-8 backdrop-blur-xl">
      <div className="relative mb-10 grid h-36 w-36 place-items-center">
        <div className="animate-ring absolute inset-0 rounded-full border-2 border-transparent" style={{ borderTopColor: 'rgba(139,92,246,0.9)', borderRightColor: 'rgba(34,211,238,0.6)' }} />
        <div className="animate-ring absolute inset-4 rounded-full border border-transparent [animation-direction:reverse] [animation-duration:4.5s]" style={{ borderBottomColor: 'rgba(99,102,241,0.8)', borderLeftColor: 'rgba(34,211,238,0.4)' }} />
        <div className={state.error ? '' : 'animate-orb'}>
          <Orb size={72} />
        </div>
      </div>
      {state.error ? (
        <div className="w-full text-center">
          <div className="mb-1 text-[18px] font-semibold">That didn’t work</div>
          <p className="mb-6 text-[14px] text-ink-2">{state.error}</p>
          <div className="flex gap-3">
            <GhostButton onClick={onClose} className="flex-1">
              Close
            </GhostButton>
            {state.retryable !== false && (
              <PrimaryButton onClick={onRetry} className="flex-1">
                Try again
              </PrimaryButton>
            )}
          </div>
          <p className="mt-4 text-[12px] text-ink-3">Your text is still in the box.</p>
        </div>
      ) : (
        <div className="w-full max-w-[280px] space-y-3">
          {labels.map((label, i) => {
            const done = state.stage > i
            const active = state.stage === i
            return (
              <div key={label} className={`flex items-center gap-3 transition-opacity duration-300 ${done || active ? 'opacity-100' : 'opacity-35'}`}>
                {done ? <CircleCheck size={20} className="text-emerald-400" /> : active ? <LoaderCircle size={20} className="animate-spin text-violet-300" /> : <div className="h-5 w-5 rounded-full border border-white/20" />}
                <span className={`text-[15px] ${active ? 'font-semibold text-ink' : 'text-ink-2'}`}>{label}</span>
              </div>
            )
          })}
          {state.message ? <p className="pt-2 text-center text-[12.5px] text-amber-300">{state.message}</p> : null}
        </div>
      )}
    </div>
  )
}
