import React, { useMemo, useState } from 'react'
import { Brain, Route, MessageSquareText, KeyRound, ExternalLink, LoaderCircle, X, Moon, ShieldCheck, ArrowRight, Sparkles, MapPin } from 'lucide-react'
import { locateMe, deviceHint, CAN_LOCATE } from '../engine/location.js'
import { Orb, PrimaryButton, GhostButton, Card, DomainIcon } from './ui.jsx'
import { BrainDump } from './BrainDump.jsx'
import { validateKey, IS_ARTIFACT } from '../engine/ai.js'
import { EXAMPLE_WEEK } from '../state/demoWeek.js'
import { layoutDay } from '../engine/layout.js'
import { addDays, startOfDay, fmtTime, fmtDuration, WEEKDAYS } from '../engine/time.js'

const ARTIFACT_URL = import.meta.env.VITE_ARTIFACT_URL

function Dots({ step, steps }) {
  return (
    <div className="flex justify-center gap-1.5">
      {steps.map((s) => (
        <span key={s} className={`h-1.5 rounded-full transition-all ${s === step ? 'w-6 bg-white' : 'w-1.5 bg-white/25'}`} />
      ))}
    </div>
  )
}

function Welcome({ onNext, onDemo }) {
  const features = [
    { icon: Brain, title: 'Dump everything', text: 'Type or speak your chaos. Claude sorts it into entries, tasks and errands.' },
    { icon: Route, title: 'Plans around real life', text: 'Work that may end early, a commute that may run late. Your plan adapts live.' },
    { icon: MessageSquareText, title: 'Asks only what matters', text: 'One quick question instead of a form, and every decision is explained.' },
  ]
  return (
    <div className="flex min-h-full flex-col px-6 pb-8">
      <div className="flex flex-1 flex-col items-center justify-center pt-6 text-center">
        <div className="relative mb-7 grid h-32 w-32 place-items-center">
          <div className="animate-ring absolute inset-0 rounded-full border-2 border-transparent" style={{ borderTopColor: 'rgba(139,92,246,0.85)', borderRightColor: 'rgba(34,211,238,0.5)' }} />
          <div className="animate-orb">
            <Orb size={76} />
          </div>
        </div>
        <h1 className="text-[40px] font-bold tracking-tight">Synapse</h1>
        <p className="accent-text mt-1 text-[19px] font-semibold">Your week, untangled.</p>
        <div className="mt-9 w-full space-y-4 text-left">
          {features.map((f) => (
            <div key={f.title} className="flex gap-3.5">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white/[0.06] text-violet-300">
                <f.icon size={19} />
              </div>
              <div>
                <div className="text-[15.5px] font-semibold">{f.title}</div>
                <div className="text-[13.5px] leading-snug text-ink-2">{f.text}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <PrimaryButton glow onClick={onNext} className="mt-8 w-full">
        Get started <ArrowRight size={17} />
      </PrimaryButton>
      <button type="button" onClick={onDemo} className="press mt-3 py-2 text-[14.5px] font-semibold text-ink-2">
        Explore the demo week
      </button>
    </div>
  )
}

function ConnectKey({ onConnected }) {
  const [key, setKey] = useState('')
  const [status, setStatus] = useState(null)
  const submit = async (e) => {
    e.preventDefault()
    setStatus({ busy: true })
    const r = await validateKey(key.trim())
    if (r.ok) onConnected(key.trim())
    else setStatus({ error: r.message })
  }
  return (
    <form onSubmit={submit} className="flex min-h-full flex-col px-6 pb-8">
      <div className="flex-1 pt-10">
        <div className="mb-5 grid h-14 w-14 place-items-center rounded-[20px] bg-violet-500/15 text-violet-300">
          <KeyRound size={26} />
        </div>
        <h1 className="text-[30px] font-bold leading-tight tracking-tight">Connect Claude</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-2">Synapse thinks with Claude. Paste your Anthropic API key and it’s ready to plan.</p>
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="sk-ant-api03-…"
          className="mt-6 w-full rounded-2xl border border-white/[0.08] bg-surface px-4 py-3.5 text-[16px] focus:border-violet-400/60 focus:outline-none"
        />
        {status?.error ? <p className="mt-2 text-[13px] text-rose-300">{status.error}</p> : null}
        <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-[14px] font-semibold text-violet-300">
          Get a key at console.anthropic.com <ExternalLink size={13} />
        </a>
        <Card className="mt-6 flex gap-3 px-4 py-3.5">
          <ShieldCheck size={18} className="mt-0.5 shrink-0 text-emerald-300" />
          <p className="text-[13px] leading-relaxed text-ink-2">Your key and your data stay on this device. Brain dumps go directly to Anthropic with your key, never through our servers.</p>
        </Card>
      </div>
      <PrimaryButton type="submit" disabled={!key.trim() || status?.busy} className="w-full">
        {status?.busy ? <LoaderCircle size={17} className="animate-spin" /> : null} Connect
      </PrimaryButton>
      {ARTIFACT_URL ? (
        <a href={ARTIFACT_URL} target="_blank" rel="noreferrer" className="press mt-3 py-2 text-center text-[14.5px] font-semibold text-ink-2">
          No key? Try Synapse on claude.ai →
        </a>
      ) : null}
    </form>
  )
}

function Place({ now, onLocated, onSkip }) {
  const [status, setStatus] = useState(null)
  const locate = async () => {
    setStatus({ busy: true })
    try {
      onLocated(await locateMe(now))
    } catch (e) {
      setStatus({ error: e.message })
    }
  }
  return (
    <div className="flex min-h-full flex-col px-6 pb-8">
      <div className="flex-1 pt-10">
        <div className="mb-5 grid h-14 w-14 place-items-center rounded-[20px] bg-cyan-400/15 text-cyan-300">
          <MapPin size={26} />
        </div>
        <h1 className="text-[30px] font-bold leading-tight tracking-tight">Where are you based?</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-2">Synapse uses your city for public holidays and shop opening hours, so errands never land on a day when everything is closed.</p>
        <Card className="mt-6 flex gap-3 px-4 py-3.5">
          <ShieldCheck size={18} className="mt-0.5 shrink-0 text-emerald-300" />
          <p className="text-[13px] leading-relaxed text-ink-2">Only your city, region and country are sent to Claude. Your exact position stays on this device.</p>
        </Card>
        {status?.error ? <p className="mt-3 text-[13px] text-rose-300">{status.error}</p> : null}
      </div>
      <PrimaryButton onClick={locate} disabled={status?.busy} className="w-full">
        {status?.busy ? <LoaderCircle size={17} className="animate-spin" /> : <MapPin size={17} />} Use my location
      </PrimaryButton>
      <button type="button" onClick={onSkip} className="press mt-3 py-2 text-[14.5px] font-semibold text-ink-2">
        Skip, guess from my device ({deviceHint() || 'unknown'})
      </button>
    </div>
  )
}

function WeekDump({ onBuild, onDemo, busy }) {
  const [text, setText] = useState('')
  return (
    <div className="flex min-h-full flex-col px-6 pb-8">
      <div className="flex-1 pt-10">
        <h1 className="text-[30px] font-bold leading-tight tracking-tight">Tell me about a typical week</h1>
        <p className="mb-6 mt-2 text-[15px] leading-relaxed text-ink-2">Work hours, commute, regular commitments, when you sleep. Say how much things vary, like "sometimes I’m done by 3".</p>
        <BrainDump value={text} onChange={setText} onSubmit={() => onBuild(text)} busy={busy} autoFocus title="Your week" placeholder="I work 9 to 5, sometimes until 6…" submitLabel="Build my week" examples={[{ label: 'Example week', text: EXAMPLE_WEEK }]} />
      </div>
      <button type="button" onClick={onDemo} className="press mt-6 py-2 text-[14.5px] font-semibold text-ink-2">
        Skip and explore the demo week
      </button>
    </div>
  )
}

function describeRecurrence(e) {
  if (!e.recurrence) return null
  if (e.recurrence.freq === 'daily') return 'Daily'
  const d = e.recurrence.byWeekday
  if (d.join() === '1,2,3,4,5') return 'Mon–Fri'
  return d.map((x) => WEEKDAYS[x]).join(', ')
}

function Confirm({ data, now, onRemove, onDone, onRestart }) {
  const items = useMemo(() => {
    const today = startOfDay(now)
    return data.entries
      .filter((e) => e.status !== 'cancelled')
      .map((e) => {
        let occ = null
        for (let i = 0; i < 8 && !occ; i++) occ = layoutDay(data.entries, addDays(today, i)).occurrences.find((o) => o.entryId === e.id) || null
        return { e, occ }
      })
      .sort((a, b) => (a.occ ? (a.occ.start - startOfDay(a.occ.start)) : 1e12) - (b.occ ? (b.occ.start - startOfDay(b.occ.start)) : 1e12))
  }, [data.entries, now])
  return (
    <div className="flex min-h-full flex-col px-6 pb-8">
      <div className="flex-1 pt-10">
        <div className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-violet-300">
          <Sparkles size={15} /> Built by Claude
        </div>
        <h1 className="text-[30px] font-bold leading-tight tracking-tight">Your week’s skeleton</h1>
        <p className="mb-5 mt-2 text-[15px] text-ink-2">Everything else gets planned around this. Remove anything that’s wrong; you can edit details later.</p>
        <Card className="divide-y divide-white/[0.05]">
          {items.map(({ e, occ }) => (
            <div key={e.id} className="flex items-center gap-3 px-4 py-3">
              <DomainIcon domain={e.domain} size={17} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-semibold">{e.title}</div>
                <div className="tabular text-[12.5px] text-ink-3">
                  {[describeRecurrence(e), occ ? `${fmtTime(occ.start)}–${fmtTime(occ.end)}` : null].filter(Boolean).join(' · ')}
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {e.deviation.earlyMin ? <span className="rounded-full bg-emerald-400/15 px-1.5 py-0.5 text-[10.5px] font-semibold text-emerald-300">may end {fmtDuration(e.deviation.earlyMin)} early</span> : null}
                  {e.deviation.lateMin ? <span className="rounded-full bg-amber-400/15 px-1.5 py-0.5 text-[10.5px] font-semibold text-amber-300">up to {fmtDuration(e.deviation.lateMin)} late</span> : null}
                  {e.breaks?.length ? <span className="rounded-full bg-white/[0.08] px-1.5 py-0.5 text-[10.5px] font-semibold text-ink-2">{e.breaks[0].label} {e.breaks[0].time}</span> : null}
                </div>
              </div>
              <button type="button" aria-label={`Remove ${e.title}`} onClick={() => onRemove(e.id)} className="press grid h-8 w-8 place-items-center rounded-full bg-white/[0.06] text-ink-3">
                <X size={14} />
              </button>
            </div>
          ))}
          <div className="flex items-center gap-3 px-4 py-3">
            <Moon size={17} className="text-indigo-300" />
            <div className="flex-1 text-[15px] font-semibold">Quiet hours</div>
            <div className="tabular text-[13px] text-ink-2">
              {data.prefs.quietStart}–{data.prefs.quietEnd}
            </div>
          </div>
        </Card>
      </div>
      <PrimaryButton glow onClick={onDone} className="mt-8 w-full">
        Looks right
      </PrimaryButton>
      <GhostButton onClick={onRestart} className="mt-3 w-full">
        Start over
      </GhostButton>
    </div>
  )
}

export function Onboarding({ state, now, onSetKey, onSetLocation, onBuild, onRemove, onDone, onRestart, onDemo, busy }) {
  const steps = IS_ARTIFACT || !CAN_LOCATE ? ['welcome', ...(IS_ARTIFACT ? [] : ['key']), 'week', 'confirm'] : ['welcome', 'key', 'place', 'week', 'confirm']
  const [step, setStep] = useState(state.data.entries.length ? 'confirm' : 'welcome')
  const next = (after) => setStep(steps[steps.indexOf(after) + 1])
  return (
    <div className="absolute inset-0 z-[45] flex flex-col bg-bg pt-safe">
      <div className="pt-3">
        <Dots step={step} steps={steps} />
      </div>
      <div className="no-scrollbar flex-1 overflow-y-auto">
        {step === 'welcome' ? <Welcome onNext={() => next('welcome')} onDemo={onDemo} /> : null}
        {step === 'key' ? (
          <ConnectKey
            onConnected={(k) => {
              onSetKey(k)
              next('key')
            }}
          />
        ) : null}
        {step === 'place' ? (
          <Place
            now={now}
            onLocated={(loc) => {
              onSetLocation(loc)
              next('place')
            }}
            onSkip={() => next('place')}
          />
        ) : null}
        {step === 'week' ? (
          <WeekDump
            busy={busy}
            onDemo={onDemo}
            onBuild={async (text) => {
              if (await onBuild(text)) setStep('confirm')
            }}
          />
        ) : null}
        {step === 'confirm' ? (
          <Confirm
            data={state.data}
            now={now}
            onRemove={onRemove}
            onDone={onDone}
            onRestart={() => {
              onRestart()
              setStep('week')
            }}
          />
        ) : null}
      </div>
    </div>
  )
}
