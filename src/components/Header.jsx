import React, { useRef } from 'react'
import { UserRound, Clock } from 'lucide-react'
import { Orb, IconButton } from './ui.jsx'

/** iOS-style large-title header. Triple-tapping the logo opens the time-travel panel. */
export function AppHeader({ title, subtitle, right, demoTime, onSecret, onSettings }) {
  const taps = useRef([])
  const tap = () => {
    const t = Date.now()
    taps.current = [...taps.current.filter((x) => t - x < 650), t]
    if (taps.current.length >= 3) {
      taps.current = []
      onSecret()
    }
  }
  return (
    <header className="px-5 pt-safe">
      <div className="flex h-11 items-center justify-between">
        <button type="button" onClick={tap} className="flex items-center gap-2" aria-label="Synapse">
          <Orb size={22} />
          <span className="text-[15px] font-bold tracking-tight">Synapse</span>
        </button>
        <div className="flex items-center gap-2">
          {demoTime ? (
            <button type="button" onClick={onSecret} className="press inline-flex items-center gap-1 rounded-full bg-violet-500/15 px-2.5 py-1 text-[11.5px] font-semibold text-violet-200">
              <Clock size={12} /> {demoTime}
            </button>
          ) : null}
          <IconButton label="Settings" onClick={onSettings}>
            <UserRound size={17} />
          </IconButton>
        </div>
      </div>
      <div className="mt-1 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[34px] font-bold leading-tight tracking-tight">{title}</h1>
          {subtitle ? <p className="text-[15px] text-ink-2">{subtitle}</p> : null}
        </div>
        {right}
      </div>
    </header>
  )
}
