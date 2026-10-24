import React, { useEffect, useRef, useState } from 'react'
import { Brain, Mic, Square, Sparkles, Send, MessageCircleQuestion } from 'lucide-react'
import { useSpeech } from '../hooks.js'
import { PrimaryButton, Orb } from './ui.jsx'
import { EXAMPLE_DUMPS } from '../state/demoWeek.js'
import { IS_ARTIFACT } from '../engine/ai.js'

function Waveform() {
  return (
    <div className="flex h-6 items-center gap-[3px]" aria-hidden>
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <span key={i} className="animate-wave block h-6 w-[3px] rounded-full bg-gradient-to-b from-violet-400 to-cyan-300" style={{ animationDelay: `${i * 0.11}s` }} />
      ))}
    </div>
  )
}

/** Types `text` into the box quickly, like a fast typist; returns a cancel function. */
function typeInto(text, onChange) {
  let i = 0
  const id = setInterval(() => {
    i = Math.min(text.length, i + 4)
    onChange(text.slice(0, i))
    if (i >= text.length) clearInterval(id)
  }, 16)
  return () => clearInterval(id)
}

export function BrainDump({ value, onChange, onSubmit, busy, autoFocus, examples = EXAMPLE_DUMPS, title = 'Brain dump', placeholder, submitLabel = 'Sync & Organize' }) {
  const speech = useSpeech(onChange)
  const [hint, setHint] = useState(null)
  const typing = useRef(null)
  const ref = useRef(null)

  useEffect(() => {
    if (!speech.error) return
    setHint(
      speech.error === 'not-allowed' || speech.error === 'service-not-allowed'
        ? 'Microphone access is blocked here. Use the mic key on your keyboard instead.'
        : speech.error === 'unsupported'
          ? 'Voice input isn’t supported in this browser. Use the mic key on your keyboard.'
          : speech.error === 'no-speech'
            ? 'Didn’t catch anything. Try again a bit closer.'
            : 'Voice input stopped. Tap the mic to try again.',
    )
  }, [speech.error])

  useEffect(() => () => typing.current?.(), [])

  const toggleMic = () => {
    setHint(null)
    if (speech.listening) speech.stop()
    else speech.start(value)
  }

  const submit = () => {
    if (speech.listening) speech.stop()
    onSubmit()
  }

  return (
    <div className="glow-ring rounded-[26px] bg-surface p-4">
      <div className="mb-1.5 flex items-center gap-2 text-[13px] font-semibold text-ink-2">
        <Brain size={15} className="text-violet-300" /> {title}
        {speech.listening ? <span className="ml-auto text-[12px] font-medium text-rose-300">Listening…</span> : null}
      </div>
      <textarea
        ref={ref}
        rows={value.length > 90 ? 5 : 3}
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || 'Errands, appointments, workouts… just dump it all here.'}
        className="no-scrollbar w-full resize-none bg-transparent text-[16px] leading-[1.45] text-ink placeholder:text-ink-3 focus:outline-none"
      />
      {speech.listening ? (
        <div className="mb-1 flex items-center gap-3">
          <Waveform />
          <span className="text-[12px] text-ink-3">Speak naturally. Tap stop when you’re done.</span>
        </div>
      ) : null}
      {hint ? <p className="mb-1 text-[12px] text-amber-300">{hint}</p> : null}
      {!value && examples?.length ? (
        <div className="no-scrollbar -mx-1 mb-1 flex gap-1.5 overflow-x-auto px-1">
          {examples.map((ex) => (
            <button
              key={ex.label}
              type="button"
              onClick={() => {
                typing.current?.()
                typing.current = typeInto(ex.text, onChange)
              }}
              className="press shrink-0 rounded-full border border-white/[0.08] px-3 py-1 text-[12.5px] text-ink-2 hover:text-ink"
            >
              Try: {ex.label}
            </button>
          ))}
        </div>
      ) : null}
      <div className="mt-2 flex items-center gap-2">
        {/* The claude.ai frame refuses the microphone; the keyboard's dictation key still works there. */}
        {!IS_ARTIFACT ? (
        <button
          type="button"
          onClick={toggleMic}
          aria-label={speech.listening ? 'Stop dictation' : 'Dictate'}
          className={`press grid h-11 w-11 shrink-0 place-items-center rounded-full ${speech.listening ? 'bg-rose-500 text-white shadow-[0_0_24px_-4px_rgba(244,63,94,0.8)]' : 'bg-white/[0.08] text-ink-2'}`}
        >
          {speech.listening ? <Square size={16} fill="currentColor" /> : <Mic size={19} />}
        </button>
        ) : null}
        <PrimaryButton glow onClick={submit} disabled={!value.trim() || busy} className="ml-auto flex-1 !py-3">
          <Sparkles size={17} /> {submitLabel}
        </PrimaryButton>
      </div>
    </div>
  )
}

export function ClarificationCard({ question, index, total, onAnswer, onSkip, onFreeText, busy }) {
  const [other, setOther] = useState(false)
  const [text, setText] = useState('')
  useEffect(() => {
    setOther(false)
    setText('')
  }, [question.id])
  return (
    <div key={question.id} className="animate-slide-in rounded-[26px] border border-violet-400/25 bg-gradient-to-b from-violet-500/[0.16] via-surface to-surface p-4">
      <div className="mb-3 flex items-center gap-2.5">
        <Orb size={26} />
        <span className="text-[13px] font-semibold text-violet-200">Synapse needs a detail</span>
        {total > 1 ? <span className="ml-auto rounded-full bg-white/[0.08] px-2 py-0.5 text-[11.5px] font-semibold text-ink-2">{index + 1} of {total}</span> : null}
      </div>
      <p className="text-[17px] font-semibold leading-snug">{question.question}</p>
      {question.why ? <p className="mt-1 text-[13px] text-ink-2">{question.why}</p> : null}
      <div className="mt-3.5 flex flex-wrap gap-2">
        {question.options.map((o) => (
          <button
            key={o.id}
            type="button"
            disabled={busy}
            onClick={() => onAnswer(o)}
            className="press inline-flex items-center gap-1.5 rounded-full border border-white/[0.1] bg-white/[0.08] px-3.5 py-2 text-[14px] font-semibold hover:bg-white/[0.14] disabled:opacity-40"
          >
            {o.emoji ? <span>{o.emoji}</span> : null}
            {o.label}
          </button>
        ))}
      </div>
      {other ? (
        <form
          className="mt-3 flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (text.trim()) onFreeText(text.trim())
          }}
        >
          <input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type your answer…"
            className="min-w-0 flex-1 rounded-full border border-white/[0.1] bg-black/30 px-4 py-2 text-[15px] focus:border-violet-400/60 focus:outline-none"
          />
          <button type="submit" disabled={busy || !text.trim()} className="press accent-gradient grid h-10 w-10 shrink-0 place-items-center rounded-full disabled:opacity-40" aria-label="Send answer">
            <Send size={16} />
          </button>
        </form>
      ) : null}
      <div className="mt-3 flex items-center gap-4 text-[13px] font-medium text-ink-3">
        {!other ? (
          <button type="button" className="press inline-flex items-center gap-1 hover:text-ink-2" onClick={() => setOther(true)}>
            <MessageCircleQuestion size={14} /> Other answer
          </button>
        ) : null}
        <button type="button" className="press hover:text-ink-2" onClick={onSkip}>
          Skip, decide for me
        </button>
      </div>
    </div>
  )
}
