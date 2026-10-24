import React, { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { reducer, loadState, saveState } from './state/store.js'
import { demoNow } from './state/demoWeek.js'
import { useNow, useFramed } from './hooks.js'
import { runAI } from './engine/ai.js'
import { addToCalendar } from './engine/calendarExport.js'
import { startOfDay, fmtTime, fmtDayLong, WEEKDAYS } from './engine/time.js'
import { DeviceFrame, TabBar, Toasts, ProcessingOverlay } from './components/Chrome.jsx'
import { AppHeader } from './components/Header.jsx'
import { TodayView } from './components/TodayView.jsx'
import { WeekView } from './components/WeekView.jsx'
import { TasksView } from './components/TasksView.jsx'
import { AgentView } from './components/AgentView.jsx'
import { EntrySheet, SettingsSheet, TimeTravelPanel } from './components/Sheets.jsx'
import { Onboarding } from './components/Onboarding.jsx'
import { BrainDump } from './components/BrainDump.jsx'
import { Sheet } from './components/ui.jsx'

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const placementSig = (e) => `${e.date}|${e.time}|${e.chain?.dateKey || ''}|${e.status}`

export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, loadState)
  const offset = state.settings.timeOffsetMs
  const now = useNow(offset)
  const clock = useCallback(() => Date.now() + offset, [offset])
  const framed = useFramed()
  const [tab, setTab] = useState('today')
  const [day, setDay] = useState(() => startOfDay(now))
  const [dump, setDump] = useState('')
  const [processing, setProcessing] = useState(null)
  const [sheet, setSheet] = useState(null)
  const [freshIds, setFreshIds] = useState(() => new Set())
  const stateRef = useRef(state)
  stateRef.current = state
  const lastRun = useRef(null)
  const prevSigs = useRef(null)
  const dismissToast = useCallback((id) => dispatch({ type: 'dismissToast', id }), [])

  useEffect(() => {
    const t = setTimeout(() => saveState(state), 250)
    return () => clearTimeout(t)
  }, [state])

  // Time travel jumps the selected day back to "today".
  useEffect(() => setDay(startOfDay(Date.now() + offset)), [offset])

  // Missed flex items roll over as the clock moves.
  useEffect(() => {
    if (state.onboarded) dispatch({ type: 'tick', now })
  }, [now, state.onboarded])

  // Animate entries that are new or moved.
  useEffect(() => {
    const sigs = new Map(state.data.entries.map((e) => [e.id, placementSig(e)]))
    const prev = prevSigs.current
    prevSigs.current = sigs
    if (!prev) return
    const fresh = [...sigs].filter(([id, sig]) => prev.get(id) !== sig).map(([id]) => id)
    if (!fresh.length) return
    setFreshIds(new Set(fresh))
    const t = setTimeout(() => setFreshIds(new Set()), 1800)
    return () => clearTimeout(t)
  }, [state.data.entries])

  const run = useCallback(
    async (job) => {
      lastRun.current = job
      setProcessing({ mode: job.mode, stage: 0 })
      const t0 = performance.now()
      try {
        const s = stateRef.current
        const { result, meta } = await runAI({
          mode: job.mode,
          text: job.text,
          question: job.question,
          data: s.data,
          now: clock(),
          settings: s.settings,
          apiKey: s.apiKey,
          onStage: (message) => setProcessing((p) => p && { ...p, message }),
        })
        const elapsed = performance.now() - t0
        if (elapsed < 900) await wait(900 - elapsed)
        setProcessing((p) => p && { ...p, stage: 1, message: null })
        await wait(520)
        setProcessing((p) => p && { ...p, stage: 2 })
        await wait(520)
        if (job.mode === 'answer') dispatch({ type: 'answer', qid: job.question.id, ops: result?.ops || [], label: job.text, now: clock() })
        else dispatch({ type: 'applyResult', result, meta, now: clock(), label: job.mode === 'skeleton' ? 'Your week' : 'Brain dump', silent: job.mode === 'skeleton' })
        setProcessing(null)
        return true
      } catch (e) {
        setProcessing((p) => ({ ...(p || { mode: job.mode }), error: e?.message || 'Something went wrong.', retryable: e?.retryable !== false }))
        dispatch({ type: 'log', logType: 'error', title: 'Claude call failed', detail: e?.message, now: clock() })
        return false
      }
    },
    [clock],
  )

  const organize = async () => {
    if (await run({ mode: 'dump', text: dump })) {
      setDump('')
      setSheet(null)
      setTab('today')
      setDay(startOfDay(clock()))
    }
  }

  const loadDemo = () => {
    const target = demoNow(Date.now())
    dispatch({ type: 'loadDemo', now: target, timeOffsetMs: target - Date.now() })
    setTab('today')
    setSheet(null)
  }

  const exportEvents = async (events) => {
    const r = await addToCalendar(events)
    if (!r.ok) dispatch({ type: 'toast', toast: { title: r.message, kind: 'error' } })
  }

  const openOcc = (occ) => setSheet({ type: 'entry', target: { ...occ, entryId: occ.entryId } })
  const openEntry = (entry, occ) => setSheet({ type: 'entry', target: occ || { entryId: entry.id } })
  const toggleDone = (occ) => {
    const e = occ.entry
    if (e.taskId && !e.recurrence) dispatch({ type: 'toggleTask', id: e.taskId, now: clock() })
    else dispatch({ type: 'toggleEntryDone', id: e.id, dateKey: occ.dateKey, now: clock() })
  }

  const questions = state.data.clarifications
  const questionProps = {
    questions,
    busy: !!processing,
    onAnswer: (o) => dispatch({ type: 'answer', qid: questions[0].id, optionId: o.id, label: o.label, now: clock() }),
    onSkip: () => dispatch({ type: 'answer', qid: questions[0].id, ops: [], label: 'Decide for me', now: clock() }),
    onFreeText: (text) => run({ mode: 'answer', text, question: questions[0] }),
  }

  const demoTime = offset ? `${WEEKDAYS[new Date(now).getDay()]} ${fmtTime(now)}` : null
  const header = (title, subtitle) => (
    <AppHeader title={title} subtitle={subtitle} demoTime={demoTime} onSecret={() => setSheet({ type: 'time' })} onSettings={() => setSheet({ type: 'settings' })} />
  )

  let content = null
  if (tab === 'today')
    content = (
      <TodayView
        header={header('Today', fmtDayLong(now))}
        data={state.data}
        now={now}
        day={day}
        setDay={setDay}
        dump={dump}
        setDump={setDump}
        onOrganize={organize}
        busy={!!processing}
        onOpen={openOcc}
        onToggleDone={toggleDone}
        onToggleTask={(id) => dispatch({ type: 'toggleTask', id, now: clock() })}
        questionProps={questionProps}
        freshIds={freshIds}
        onEarly={(occ) => dispatch({ type: 'finishedEarly', id: occ.entryId, dateKey: occ.dateKey, now: clock() })}
        onLate={(occ, minutes) => dispatch({ type: 'runningLate', id: occ.entryId, dateKey: occ.dateKey, minutes, now: clock() })}
      />
    )
  if (tab === 'week')
    content = (
      <WeekView
        header={header('Week')}
        data={state.data}
        now={now}
        onOpen={openOcc}
        onExport={exportEvents}
        onPickDay={(d) => {
          setDay(d)
          setTab('today')
        }}
      />
    )
  if (tab === 'tasks')
    content = (
      <TasksView
        header={header('Tasks')}
        data={state.data}
        now={now}
        onOpen={openEntry}
        onToggleTask={(id) => dispatch({ type: 'toggleTask', id, now: clock() })}
        onDeleteTask={(id) => dispatch({ type: 'deleteTask', id, now: clock() })}
        onToggleShopping={(id) => dispatch({ type: 'toggleShopping', id, now: clock() })}
        onDeleteShopping={(id) => dispatch({ type: 'deleteShopping', id, now: clock() })}
        onAddShopping={(name) => dispatch({ type: 'addShopping', name, now: clock() })}
      />
    )
  if (tab === 'agent')
    content = (
      <AgentView
        header={header('Agent')}
        log={state.log}
        stats={state.stats}
        now={now}
        entryExists={(id) => state.data.entries.some((e) => e.id === id && e.status !== 'cancelled')}
        onOpenRef={(id) => setSheet({ type: 'entry', target: { entryId: id } })}
      />
    )

  return (
    <DeviceFrame framed={framed} statusTime={fmtTime(now)}>
      {state.onboarded ? (
        <>
          <div data-scroll className="no-scrollbar absolute inset-0 overflow-y-auto" style={{ paddingBottom: 'calc(var(--sab) + 96px)' }}>
            {content}
          </div>
          <TabBar tab={tab} onTab={setTab} onCapture={() => setSheet({ type: 'capture' })} badges={{ today: questions.length > 0 && tab !== 'today' }} />
        </>
      ) : (
        <Onboarding
          state={state}
          now={now}
          busy={!!processing}
          onSetKey={(apiKey) => dispatch({ type: 'setKey', apiKey })}
          onBuild={(text) => run({ mode: 'skeleton', text })}
          onRemove={(id) => dispatch({ type: 'removeSkeletonEntry', id })}
          onRestart={() => dispatch({ type: 'clearData' })}
          onDone={() => dispatch({ type: 'setOnboarded', value: true })}
          onDemo={loadDemo}
        />
      )}

      {sheet?.type === 'capture' ? (
        <Sheet open onClose={() => setSheet(null)} title="Brain dump">
          <p className="mb-3 text-[14px] text-ink-2">Anything on your mind. Synapse sorts it into your calendar and tasks.</p>
          <BrainDump value={dump} onChange={setDump} onSubmit={organize} busy={!!processing} autoFocus />
        </Sheet>
      ) : null}
      {sheet?.type === 'entry' ? (
        <EntrySheet
          target={sheet.target}
          data={state.data}
          now={now}
          log={state.log}
          onClose={() => setSheet(null)}
          onSave={(id, set, scope, dateKey) => {
            dispatch({ type: 'saveEntry', id, set, scope, dateKey, now: clock() })
            setSheet(null)
          }}
          onDelete={(id, scope, dateKey) => {
            dispatch({ type: 'deleteEntry', id, scope, dateKey, now: clock() })
            setSheet(null)
          }}
          onToggleDone={(occ) => {
            if (occ) toggleDone(occ)
            setSheet(null)
          }}
          onExport={exportEvents}
        />
      ) : null}
      {sheet?.type === 'settings' ? (
        <SettingsSheet
          state={state}
          onClose={() => setSheet(null)}
          onSetKey={(apiKey) => dispatch({ type: 'setKey', apiKey })}
          onTier={(tier) => dispatch({ type: 'setSettings', settings: { tier } })}
          onTimeTravel={() => setSheet({ type: 'time' })}
          onLoadDemo={loadDemo}
          onReset={() => {
            dispatch({ type: 'resetAll', keepKey: false })
            setSheet(null)
            setTab('today')
          }}
        />
      ) : null}
      {sheet?.type === 'time' ? (
        <TimeTravelPanel now={now} offset={offset} onSet={(timeOffsetMs) => dispatch({ type: 'setSettings', settings: { timeOffsetMs } })} onClose={() => setSheet(null)} onLoadDemo={loadDemo} />
      ) : null}

      <ProcessingOverlay state={processing} onClose={() => setProcessing(null)} onRetry={() => lastRun.current && run(lastRun.current)} />
      <Toasts toasts={state.toasts} onDismiss={dismissToast} onUndo={(batchId) => dispatch({ type: 'undo', batchId, now: clock() })} />
    </DeviceFrame>
  )
}
