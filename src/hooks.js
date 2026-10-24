import { useEffect, useRef, useState, useCallback } from 'react'

/**
 * App clock: real time plus the time-travel offset, refreshed every 15 s and on focus. The offset is
 * applied during render, so a jump never leaves one render (and one rollover tick) on the old time.
 */
export function useNow(offsetMs) {
  const [real, setReal] = useState(() => Date.now())
  useEffect(() => {
    const update = () => setReal(Date.now())
    const id = setInterval(update, 15_000)
    document.addEventListener('visibilitychange', update)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', update)
    }
  }, [])
  useEffect(() => setReal(Date.now()), [offsetMs])
  return real + offsetMs
}

const SR = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null

/** On-device speech recognition (Safari/Chrome). Calls onText with the full text so far. */
export function useSpeech(onText) {
  const [listening, setListening] = useState(false)
  const [error, setError] = useState(null)
  const recRef = useRef(null)
  const onTextRef = useRef(onText)
  onTextRef.current = onText

  const stop = useCallback(() => {
    recRef.current?.stop()
  }, [])

  const start = useCallback((baseText = '') => {
    if (!SR) {
      setError('unsupported')
      return
    }
    setError(null)
    const rec = new SR()
    rec.lang = navigator.language || 'en-US'
    rec.continuous = true
    rec.interimResults = true
    const prefix = baseText.trim() ? `${baseText.trim()} ` : ''
    rec.onresult = (e) => {
      let text = ''
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript
      onTextRef.current(prefix + text.trim())
    }
    rec.onerror = (e) => setError(e.error || 'error')
    rec.onend = () => setListening(false)
    recRef.current = rec
    try {
      rec.start()
      setListening(true)
    } catch {
      setError('error')
    }
  }, [])

  useEffect(() => () => recRef.current?.abort(), [])

  return { supported: !!SR, listening, error, start, stop }
}

/** True on wide screens with a mouse: show the app inside an iPhone frame. */
export function useFramed() {
  const query = '(min-width: 768px) and (pointer: fine)'
  const [framed, setFramed] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches)
  useEffect(() => {
    const m = window.matchMedia(query)
    const fn = () => setFramed(m.matches)
    m.addEventListener('change', fn)
    return () => m.removeEventListener('change', fn)
  }, [])
  return framed
}
