import React, { useEffect, useMemo, useState } from 'react'
import { CalendarPlus, Trash2, Check, Wand2, Link2, Sparkles, KeyRound, Gauge, Clock, RotateCcw, ShieldCheck, LoaderCircle, Zap, Brain, MapPin } from 'lucide-react'
import { locateMe, deviceHint, describeLocation, CAN_LOCATE } from '../engine/location.js'
import { DOMAINS } from '../state/model.js'
import { parseDateKey, fmtTime, fmtDuration, fmtDayLong, WEEKDAYS, dateKey, addDays, startOfWeek, atMinutes, MIN, HOUR, DAY } from '../engine/time.js'
import { occurrenceOf } from '../engine/layout.js'
import { Sheet, Chip, Segmented, Stepper, PrimaryButton, GhostButton, Card, SectionTitle, Badge } from './ui.jsx'
import { validateKey, IS_ARTIFACT, MODELS, modelLabel } from '../engine/ai.js'
import { eventsForEntry } from '../engine/calendarExport.js'
import { CalendarAction } from './CalendarAction.jsx'

const Row = ({ label, children, hint }) => (
  <div className="flex items-center justify-between gap-3 py-2.5">
    <div className="min-w-0">
      <div className="text-[15px]">{label}</div>
      {hint ? <div className="text-[12px] text-ink-3">{hint}</div> : null}
    </div>
    {children}
  </div>
)

const inputCls = 'rounded-xl bg-white/[0.07] px-3 py-1.5 text-[15px] text-ink focus:outline-none focus:ring-1 focus:ring-violet-400/60'

export function EntrySheet({ target, data, now, log, onClose, onSave, onDelete, onToggleDone, onExport }) {
  const entry = data.entries.find((e) => e.id === target?.entryId)
  const occ = useMemo(() => {
    if (!entry) return null
    if (target.start) return target
    return occurrenceOf(data.entries, entry)
  }, [entry, target, data.entries])
  const [form, setForm] = useState(null)
  const [scope, setScope] = useState('all')

  useEffect(() => {
    if (!entry) return
    setForm({
      title: entry.title,
      domain: entry.domain,
      durationMin: entry.durationMin,
      earlyMin: entry.deviation.earlyMin,
      lateMin: entry.deviation.lateMin,
      freq: entry.recurrence?.freq || 'none',
      byWeekday: entry.recurrence?.byWeekday || (entry.date ? [new Date(parseDateKey(entry.date)).getDay()] : [1]),
      date: occ ? dateKey(occ.start) : entry.date || dateKey(now),
      time: occ && !occ.allDay ? fmtTime(occ.start) : entry.time || '09:00',
      mode: entry.kind === 'flex' && !entry.pinned ? 'auto' : 'manual',
    })
    setScope('all')
  }, [entry?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!entry || !form) return null
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))
  const chained = entry.after || entry.before || entry.chain
  const flex = entry.kind === 'flex'
  const recurring = !!entry.recurrence
  const done = occ?.done
  const reasons = log.filter((l) => l.refs?.includes(entry.id) || (entry.taskId && l.refs?.includes(entry.taskId))).slice(-4).reverse()

  const save = () => {
    const s = {}
    if (form.title.trim() && form.title !== entry.title) s.title = form.title.trim()
    if (form.domain !== entry.domain) s.domain = form.domain
    if (form.durationMin !== entry.durationMin) s.durationMin = form.durationMin
    if (form.earlyMin !== entry.deviation.earlyMin || form.lateMin !== entry.deviation.lateMin) s.deviation = { earlyMin: form.earlyMin, lateMin: form.lateMin }
    if (!flex && !entry.allDay) {
      const rec = form.freq === 'none' ? null : { freq: form.freq, byWeekday: form.freq === 'weekly' ? form.byWeekday : [] }
      if (JSON.stringify(rec) !== JSON.stringify(entry.recurrence ? { freq: entry.recurrence.freq, byWeekday: entry.recurrence.freq === 'weekly' ? entry.recurrence.byWeekday : [] } : null)) s.recurrence = rec
    }
    if (!chained && !entry.allDay) {
      const timeChanged = occ ? form.time !== fmtTime(occ.start) : true
      const dateChanged = occ ? form.date !== dateKey(occ.start) : true
      if (flex && form.mode === 'auto' && entry.pinned) Object.assign(s, { date: null, time: null })
      else if (form.mode === 'manual' && (timeChanged || dateChanged || (flex && !entry.pinned))) {
        if (recurring && scope === 'one') s.time = form.time
        else Object.assign(s, recurring ? { time: form.time } : { date: form.date, time: form.time })
      }
    }
    onSave(entry.id, s, recurring ? scope : 'all', occ?.dateKey)
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={entry.hold ? 'Appointment hold' : flex ? 'Planned by Synapse' : 'Entry'}
      footer={
        <div className="flex gap-2 pb-2">
          <CalendarAction events={eventsForEntry(data.entries, entry, now)} onExport={onExport} className="press inline-flex items-center justify-center rounded-2xl bg-white/[0.07] px-3 py-3 text-ink hover:bg-white/[0.1]">
            <CalendarPlus size={17} />
          </CalendarAction>
          {flex || entry.taskId ? (
            <GhostButton onClick={() => onToggleDone(occ)} className="!px-3">
              <Check size={17} className={done ? 'text-emerald-300' : ''} />
            </GhostButton>
          ) : null}
          <PrimaryButton onClick={save} className="flex-1">
            Save
          </PrimaryButton>
        </div>
      }
    >
      <div className="space-y-4">
        <input value={form.title} onChange={(e) => set({ title: e.target.value })} className="w-full bg-transparent text-[24px] font-bold tracking-tight focus:outline-none" />
        <div className="flex flex-wrap gap-1.5">
          {entry.source === 'ai' ? <Badge tone="ai"><Sparkles size={10} /> by Synapse</Badge> : null}
          {entry.hold ? <Badge tone="warn">hold until booked</Badge> : null}
          {(entry.assumptions || []).map((a) => (
            <Badge key={a}>{a}</Badge>
          ))}
          {occ ? <Badge tone="info">{occ.allDay ? fmtDayLong(occ.start) : `${fmtDayLong(occ.start)} · ${fmtTime(occ.start)}–${fmtTime(occ.end)}`}</Badge> : <Badge tone="warn">not placed yet</Badge>}
        </div>
        <div className="no-scrollbar -mx-5 flex gap-1.5 overflow-x-auto px-5">
          {Object.entries(DOMAINS).map(([k, d]) => (
            <Chip key={k} active={form.domain === k} color={d.color} onClick={() => set({ domain: k })}>
              {d.label}
            </Chip>
          ))}
        </div>

        <Card className="divide-y divide-white/[0.05] px-4">
          {chained ? (
            <Row label="Time" hint={entry.chain ? 'A stop on your way home, moves with work' : entry.before ? 'Leaves so you arrive on time' : 'Starts when the previous entry ends'}>
              <span className="inline-flex items-center gap-1 text-[13px] text-cyan-300">
                <Link2 size={13} /> linked
              </span>
            </Row>
          ) : entry.allDay ? null : (
            <>
              {flex ? (
                <Row label="Timing" hint={form.mode === 'auto' ? 'Synapse picks and adjusts the slot' : 'You pinned a fixed slot'}>
                  <Segmented value={form.mode} onChange={(mode) => set({ mode })} options={[{ value: 'auto', label: 'Auto' }, { value: 'manual', label: 'Pin' }]} />
                </Row>
              ) : null}
              {form.mode === 'manual' ? (
                <Row label="When">
                  <div className="flex gap-2">
                    {!recurring ? <input type="date" value={form.date} onChange={(e) => set({ date: e.target.value })} className={inputCls} /> : null}
                    <input type="time" value={form.time} onChange={(e) => set({ time: e.target.value })} className={inputCls} />
                  </div>
                </Row>
              ) : null}
              {recurring && form.mode === 'manual' ? (
                <Row label="Apply time change to">
                  <Segmented value={scope} onChange={setScope} options={[{ value: 'one', label: 'This day' }, { value: 'all', label: 'All' }]} />
                </Row>
              ) : null}
            </>
          )}
          {!entry.allDay ? (
            <Row label="Duration">
              <Stepper value={form.durationMin} onChange={(v) => set({ durationMin: v })} min={5} step={entry.durationMin >= 120 ? 30 : 15} format={fmtDuration} />
            </Row>
          ) : null}
          {!entry.allDay ? (
            <>
              <Row label="May end early by" hint="Synapse keeps this window free">
                <Stepper value={form.earlyMin} onChange={(v) => set({ earlyMin: v })} max={240} format={(v) => (v ? fmtDuration(v) : 'never')} />
              </Row>
              <Row label="May run late by">
                <Stepper value={form.lateMin} onChange={(v) => set({ lateMin: v })} max={240} step={5} format={(v) => (v ? fmtDuration(v) : 'never')} />
              </Row>
            </>
          ) : null}
          {!flex && !entry.allDay && !chained ? (
            <div className="py-2.5">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[15px]">Repeat</span>
                <Segmented value={form.freq} onChange={(freq) => set({ freq })} options={[{ value: 'none', label: 'Never' }, { value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Weekly' }]} />
              </div>
              {form.freq === 'weekly' ? (
                <div className="flex justify-between">
                  {[1, 2, 3, 4, 5, 6, 0].map((d) => {
                    const on = form.byWeekday.includes(d)
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => set({ byWeekday: on ? form.byWeekday.filter((x) => x !== d) : [...form.byWeekday, d] })}
                        className={`press h-9 w-9 rounded-full text-[12px] font-semibold ${on ? 'bg-white text-black' : 'bg-white/[0.07] text-ink-2'}`}
                      >
                        {WEEKDAYS[d].slice(0, 2)}
                      </button>
                    )
                  })}
                </div>
              ) : null}
            </div>
          ) : null}
        </Card>

        {flex && form.mode === 'auto' ? (
          <button type="button" onClick={() => onSave(entry.id, { date: null, time: null }, 'all')} className="press flex w-full items-center justify-center gap-2 rounded-2xl bg-violet-500/15 py-3 text-[14.5px] font-semibold text-violet-200">
            <Wand2 size={16} /> Find a better slot
          </button>
        ) : null}

        {reasons.length ? (
          <div>
            <SectionTitle>Why here?</SectionTitle>
            <Card className="space-y-3 px-4 py-3">
              {reasons.map((l) => (
                <div key={l.id}>
                  <div className="text-[14px] font-semibold">{l.title}</div>
                  {l.detail ? <div className="text-[13px] text-ink-2">{l.detail}</div> : null}
                  {l.lines?.map((x, i) => (
                    <div key={i} className="mt-0.5 text-[12.5px] text-ink-3">· {x}</div>
                  ))}
                </div>
              ))}
            </Card>
          </div>
        ) : entry.reason ? (
          <p className="px-1 text-[13px] text-ink-2">{entry.reason}</p>
        ) : null}

        <div className="flex gap-2 pt-1">
          {recurring ? (
            <>
              <GhostButton onClick={() => onDelete(entry.id, 'one', occ?.dateKey)} className="flex-1 !text-rose-300">
                <Trash2 size={16} /> This day
              </GhostButton>
              <GhostButton onClick={() => onDelete(entry.id, 'all')} className="flex-1 !text-rose-300">
                <Trash2 size={16} /> Whole series
              </GhostButton>
            </>
          ) : (
            <GhostButton onClick={() => onDelete(entry.id, 'all')} className="flex-1 !text-rose-300">
              <Trash2 size={16} /> Delete
            </GhostButton>
          )}
        </div>
      </div>
    </Sheet>
  )
}

function KeyEditor({ onSave }) {
  const [key, setKey] = useState('')
  const [status, setStatus] = useState(null)
  const submit = async (e) => {
    e.preventDefault()
    setStatus({ busy: true })
    const r = await validateKey(key.trim())
    if (r.ok) {
      onSave(key.trim())
      setStatus(null)
      setKey('')
    } else setStatus({ error: r.message })
  }
  return (
    <form onSubmit={submit} className="space-y-2 py-2">
      <input
        type="password"
        autoComplete="off"
        spellCheck={false}
        value={key}
        onChange={(e) => setKey(e.target.value)}
        placeholder="sk-ant-…"
        className="w-full rounded-xl bg-white/[0.07] px-3 py-2.5 text-[15px] focus:outline-none focus:ring-1 focus:ring-violet-400/60"
      />
      {status?.error ? <p className="text-[12.5px] text-rose-300">{status.error}</p> : null}
      <PrimaryButton type="submit" disabled={!key.trim() || status?.busy} className="w-full !py-2.5">
        {status?.busy ? <LoaderCircle size={16} className="animate-spin" /> : <KeyRound size={16} />} Connect
      </PrimaryButton>
    </form>
  )
}

function LocationSection({ location, onSetLocation }) {
  const [status, setStatus] = useState(null)
  const locate = async () => {
    setStatus({ busy: true })
    try {
      onSetLocation(await locateMe(Date.now()))
      setStatus(null)
    } catch (e) {
      setStatus({ error: e.message })
    }
  }
  return (
    <div>
      <SectionTitle>Location</SectionTitle>
      <Card className="px-4 py-2">
        <Row
          label={location ? describeLocation(location) : CAN_LOCATE ? 'Not set' : 'From device settings'}
          hint={location ? `From GPS on ${location.at} · only the city is sent to Claude` : `Device suggests ${deviceHint() || 'nothing'} · used for holidays and shop hours`}
        >
          {CAN_LOCATE ? (
            <button type="button" onClick={locate} disabled={status?.busy} className="press inline-flex items-center gap-1 text-[14px] font-semibold text-violet-300 disabled:opacity-50">
              {status?.busy ? <LoaderCircle size={14} className="animate-spin" /> : <MapPin size={14} />} {location ? 'Update' : 'Locate'}
            </button>
          ) : null}
        </Row>
        {status?.error ? <p className="pb-2 text-[12.5px] text-rose-300">{status.error}</p> : null}
      </Card>
    </div>
  )
}

export function SettingsSheet({ state, onClose, onSetKey, onSetLocation, onTier, onTimeTravel, onLoadDemo, onReset }) {
  const [editingKey, setEditingKey] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const key = state.apiKey
  return (
    <Sheet open onClose={onClose} title="Settings">
      <div className="space-y-5">
        <div>
          <SectionTitle>Claude</SectionTitle>
          <Card className="px-4 py-2">
            {IS_ARTIFACT ? (
              <Row label="Your claude.ai account" hint="Synapse uses Claude through this page. No key needed.">
                <ShieldCheck size={18} className="text-emerald-300" />
              </Row>
            ) : (
              <>
                <Row label={key ? 'Connected' : 'Not connected'} hint={key ? `Key ending in …${key.slice(-4)} · stored only on this device` : 'Add your Anthropic API key'}>
                  <button type="button" onClick={() => setEditingKey((x) => !x)} className="press text-[14px] font-semibold text-violet-300">
                    {key ? 'Change' : 'Add'}
                  </button>
                </Row>
                {editingKey ? (
                  <KeyEditor
                    onSave={(k) => {
                      onSetKey(k)
                      setEditingKey(false)
                    }}
                  />
                ) : null}
                {key && !editingKey ? (
                  <button type="button" onClick={() => onSetKey(null)} className="press pb-2 text-[13px] font-medium text-rose-300">
                    Disconnect
                  </button>
                ) : null}
              </>
            )}
          </Card>
        </div>
        <LocationSection location={state.data.prefs.location} onSetLocation={onSetLocation} />
        <div>
          <SectionTitle>Model</SectionTitle>
          <Card className="space-y-3 px-4 py-3">
            <Segmented
              value={state.settings.tier}
              onChange={onTier}
              options={[
                { value: 'fast', label: 'Speed' },
                { value: 'depth', label: 'Depth' },
              ]}
            />
            <div className="flex items-start gap-2 text-[12.5px] text-ink-2">
              {state.settings.tier === 'fast' ? <Zap size={14} className="mt-0.5 shrink-0 text-cyan-300" /> : <Brain size={14} className="mt-0.5 shrink-0 text-violet-300" />}
              {IS_ARTIFACT
                ? state.settings.tier === 'fast'
                  ? 'Quickest Claude model: answers in seconds.'
                  : 'Balanced Claude model: better with long, messy dumps.'
                : state.settings.tier === 'fast'
                  ? `${modelLabel(MODELS.fast)}: answers in a few seconds. Falls back to ${modelLabel(MODELS.depth)} if it fails.`
                  : `${modelLabel(MODELS.depth)}: better with long, messy dumps, takes longer. Falls back to ${modelLabel(MODELS.fast)}.`}
            </div>
          </Card>
        </div>
        <div>
          <SectionTitle>Demo</SectionTitle>
          <Card className="divide-y divide-white/[0.05] px-4">
            <Row label="Time travel" hint="Jump to any moment of the week (or triple-tap the logo)">
              <button type="button" onClick={onTimeTravel} className="press text-[14px] font-semibold text-violet-300">
                Open
              </button>
            </Row>
            <Row label="Load demo week" hint="Replaces your data with the sample week">
              <button type="button" onClick={onLoadDemo} className="press text-[14px] font-semibold text-violet-300">
                Load
              </button>
            </Row>
            <Row label="Reset everything" hint="Clears all data on this device">
              {confirmReset ? (
                <button type="button" onClick={onReset} className="press text-[14px] font-semibold text-rose-300">
                  Confirm
                </button>
              ) : (
                <button type="button" onClick={() => setConfirmReset(true)} className="press text-[14px] font-semibold text-rose-300">
                  Reset
                </button>
              )}
            </Row>
          </Card>
        </div>
        <p className="px-1 text-[12px] leading-relaxed text-ink-3">
          Your data stays on this device. {IS_ARTIFACT ? 'Brain dumps are sent to Claude through your claude.ai account.' : 'Brain dumps go directly from this device to Anthropic with your key.'} Synapse is a hackathon build.
        </p>
      </div>
    </Sheet>
  )
}

export function TimeTravelPanel({ now, offset, onSet, onClose, onLoadDemo }) {
  const monday = startOfWeek(now)
  const jumps = [
    { label: 'Mon 08:12', at: atMinutes(monday, 8 * 60 + 12) },
    { label: 'Mon 15:05', at: atMinutes(monday, 15 * 60 + 5) },
    { label: 'Tue 17:40', at: atMinutes(addDays(monday, 1), 17 * 60 + 40) },
    { label: 'Thu 16:30', at: atMinutes(addDays(monday, 3), 16 * 60 + 30) },
    { label: 'Fri 14:30', at: atMinutes(addDays(monday, 4), 14 * 60 + 30) },
  ]
  const to = (ms) => onSet(ms - Date.now())
  const pad = (n) => String(n).padStart(2, '0')
  const d = new Date(now)
  const local = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  return (
    <Sheet open onClose={onClose} title="Time travel">
      <div className="space-y-4">
        <Card className="px-4 py-4 text-center">
          <div className="text-[13px] text-ink-3">{offset ? 'Demo time' : 'Live time'}</div>
          <div className="tabular text-[40px] font-bold leading-tight tracking-tight">{fmtTime(now)}</div>
          <div className="text-[14px] text-ink-2">{fmtDayLong(now)}</div>
        </Card>
        <div className="flex flex-wrap gap-2">
          {jumps.map((j) => (
            <Chip key={j.label} onClick={() => to(j.at)}>
              <Clock size={13} /> {j.label}
            </Chip>
          ))}
        </div>
        <div className="flex gap-2">
          {[
            { label: '+15 min', ms: 15 * MIN },
            { label: '+1 h', ms: HOUR },
            { label: '+1 day', ms: DAY },
          ].map((s) => (
            <GhostButton key={s.label} onClick={() => onSet(offset + s.ms)} className="flex-1 !py-2.5 text-[14px]">
              {s.label}
            </GhostButton>
          ))}
        </div>
        <Row label="Exact moment">
          <input type="datetime-local" value={local} onChange={(e) => e.target.value && to(new Date(e.target.value).getTime())} className={inputCls} />
        </Row>
        <div className="flex gap-2">
          <GhostButton onClick={() => onSet(0)} className="flex-1" disabled={!offset}>
            <RotateCcw size={16} /> Back to live
          </GhostButton>
          <PrimaryButton onClick={onLoadDemo} className="flex-1">
            <Gauge size={16} /> Demo week
          </PrimaryButton>
        </div>
        <p className="px-1 text-[12px] text-ink-3">The clock keeps running from the moment you pick. Missed items roll over automatically when you jump forward.</p>
      </div>
    </Sheet>
  )
}
