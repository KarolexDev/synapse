import React from 'react'
import { Briefcase, Dumbbell, ShoppingBag, House, Users, User, FileText, Plane, Car, X } from 'lucide-react'
import { DOMAINS } from '../state/model.js'

export const DOMAIN_ICONS = {
  work: Briefcase,
  health: Dumbbell,
  errands: ShoppingBag,
  chores: House,
  social: Users,
  personal: User,
  admin: FileText,
  travel: Plane,
  commute: Car,
}

export const domainColor = (d) => DOMAINS[d]?.color || DOMAINS.personal.color

export function DomainIcon({ domain, size = 14, className = '' }) {
  const Icon = DOMAIN_ICONS[domain] || User
  return <Icon size={size} className={className} style={{ color: domainColor(domain) }} strokeWidth={2.2} />
}

export function DomainDot({ domain, className = '' }) {
  return <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${className}`} style={{ background: domainColor(domain) }} />
}

export function Card({ className = '', children, ...rest }) {
  return (
    <div className={`rounded-3xl border border-white/[0.06] bg-surface ${className}`} {...rest}>
      {children}
    </div>
  )
}

export function SectionTitle({ children, right, className = '' }) {
  return (
    <div className={`mb-2 flex items-center justify-between px-1 ${className}`}>
      <h3 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-ink-3">{children}</h3>
      {right}
    </div>
  )
}

export function Chip({ active, onClick, children, className = '', color }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`press inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors ${
        active ? 'bg-white text-black' : 'bg-white/[0.07] text-ink-2 hover:bg-white/[0.11]'
      } ${className}`}
    >
      {color && <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />}
      {children}
    </button>
  )
}

export function Badge({ children, tone = 'neutral', className = '' }) {
  const tones = {
    neutral: 'bg-white/[0.08] text-ink-2',
    ai: 'bg-violet-500/15 text-violet-300',
    warn: 'bg-amber-400/15 text-amber-300',
    good: 'bg-emerald-400/15 text-emerald-300',
    info: 'bg-cyan-400/15 text-cyan-300',
  }
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold ${tones[tone]} ${className}`}>{children}</span>
}

export function PrimaryButton({ children, onClick, disabled, className = '', glow = false, type = 'button' }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`press accent-gradient inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3.5 text-[15px] font-semibold text-white disabled:opacity-40 ${glow && !disabled ? 'sync-glow' : ''} ${className}`}
    >
      {children}
    </button>
  )
}

export function GhostButton({ children, onClick, className = '', disabled }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`press inline-flex items-center justify-center gap-2 rounded-2xl bg-white/[0.07] px-4 py-3 text-[15px] font-medium text-ink hover:bg-white/[0.1] disabled:opacity-40 ${className}`}>
      {children}
    </button>
  )
}

export function IconButton({ children, onClick, label, className = '' }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className={`press grid h-9 w-9 place-items-center rounded-full bg-white/[0.07] text-ink-2 hover:bg-white/[0.12] hover:text-ink ${className}`}>
      {children}
    </button>
  )
}

export function Segmented({ value, options, onChange }) {
  return (
    <div className="flex rounded-xl bg-white/[0.06] p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`press flex-1 rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-colors ${value === o.value ? 'bg-white/[0.14] text-ink shadow-sm' : 'text-ink-3'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Stepper({ value, onChange, step = 15, min = 0, max = 720, format = (v) => v }) {
  return (
    <div className="flex items-center gap-1 rounded-xl bg-white/[0.06] p-1">
      <button type="button" className="press grid h-7 w-8 place-items-center rounded-lg text-ink-2 hover:bg-white/[0.08]" onClick={() => onChange(Math.max(min, value - step))}>
        −
      </button>
      <span className="tabular min-w-[64px] text-center text-[13px] font-semibold">{format(value)}</span>
      <button type="button" className="press grid h-7 w-8 place-items-center rounded-lg text-ink-2 hover:bg-white/[0.08]" onClick={() => onChange(Math.min(max, value + step))}>
        +
      </button>
    </div>
  )
}

/** Bottom sheet rendered inside the app frame. */
export function Sheet({ open, onClose, title, children, footer, tall = false }) {
  if (!open) return null
  return (
    <div className="absolute inset-0 z-40 flex flex-col justify-end">
      <div className="animate-fade-in absolute inset-0 bg-black/55" onClick={onClose} />
      <div className={`animate-sheet-up relative flex max-h-[88%] flex-col rounded-t-[28px] border-t border-white/[0.08] bg-[#16161b] ${tall ? 'h-[88%]' : ''}`}>
        <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-white/20" />
        <div className="flex items-center justify-between px-5 pb-2 pt-3">
          <h2 className="text-[19px] font-bold tracking-tight">{title}</h2>
          <IconButton label="Close" onClick={onClose}>
            <X size={16} />
          </IconButton>
        </div>
        <div className="no-scrollbar flex-1 overflow-y-auto px-5 pb-4">{children}</div>
        {footer && <div className="border-t border-white/[0.06] px-5 pb-safe pt-3">{footer}</div>}
        {!footer && <div className="pb-safe" />}
      </div>
    </div>
  )
}

export function Orb({ size = 40, className = '' }) {
  return (
    <div className={`relative shrink-0 ${className}`} style={{ width: size, height: size }}>
      <div className="accent-gradient absolute inset-0 rounded-full opacity-90 blur-[1px]" />
      <div className="absolute inset-[18%] rounded-full bg-[#0f0f12]/40" />
      <div className="absolute left-[22%] top-[18%] h-[28%] w-[28%] rounded-full bg-white/50 blur-[2px]" />
    </div>
  )
}
