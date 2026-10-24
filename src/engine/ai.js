// Claude access. Web edition: the user's own API key, sent directly from the browser to Anthropic.
// Artifact edition: the viewer's claude.ai account through the `sample` capability (no key).

import { SYSTEM_PROMPT, OUTPUT_SCHEMA, buildUserTurn } from './prompt.js'

export const IS_ARTIFACT = typeof __EDITION__ !== 'undefined' && __EDITION__ === 'artifact'

export const MODELS = { fast: 'claude-haiku-5-5', depth: 'claude-sonnet-5-5' }
const MODEL_LABELS = { 'claude-haiku-5-5': 'Claude Haiku 5.5', 'claude-sonnet-5-5': 'Claude Sonnet 5.5' }
export const modelLabel = (id) => MODEL_LABELS[id] || id

export class AIError extends Error {
  constructor(message, { code = 'failed', retryable = false } = {}) {
    super(message)
    this.code = code
    this.retryable = retryable
  }
}

// The SDK is only needed by the web edition; the constant condition lets the artifact build drop it.
let sdkPromise = null
const loadSDK = () => {
  if (IS_ARTIFACT) throw new AIError('Not available in this edition.')
  sdkPromise ??= import('@anthropic-ai/sdk').then((m) => m.default)
  return sdkPromise
}

// maxRetries: 1 = one automatic SDK retry for 429/5xx/connection errors before we switch models.
const makeClient = (Anthropic, apiKey) => new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1, timeout: 45_000 })

export async function validateKey(apiKey) {
  const Anthropic = await loadSDK()
  try {
    await makeClient(Anthropic, apiKey).models.list({ limit: 1 })
    return { ok: true }
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return { ok: false, message: 'Anthropic rejected this key.' }
    if (e instanceof Anthropic.PermissionDeniedError) return { ok: false, message: 'This key is not allowed to use the API.' }
    if (e instanceof Anthropic.APIConnectionError) return { ok: false, message: 'Could not reach Anthropic. Check your connection.' }
    return { ok: false, message: e?.message || 'Could not verify the key.' }
  }
}

function extractJSON(text) {
  try {
    return JSON.parse(text)
  } catch {
    const a = text.indexOf('{')
    const b = text.lastIndexOf('}')
    if (a >= 0 && b > a) return JSON.parse(text.slice(a, b + 1))
    throw new AIError("Claude's answer could not be read.", { code: 'invalid_json', retryable: true })
  }
}

function friendly(Anthropic, e) {
  if (e instanceof AIError) return e.message
  if (e instanceof Anthropic.RateLimitError) return 'Your key is being rate-limited by Anthropic. Try again in a moment.'
  if (e instanceof Anthropic.APIConnectionTimeoutError) return 'Claude took too long to answer.'
  if (e instanceof Anthropic.APIConnectionError) return 'Could not reach Anthropic. Check your connection.'
  if (e instanceof Anthropic.InternalServerError) return 'Claude is overloaded right now.'
  if (e instanceof Anthropic.BadRequestError) return 'Anthropic could not process this request.'
  return e?.message || 'Something went wrong.'
}

async function callAnthropic(Anthropic, { apiKey, model, user, schema }) {
  const client = makeClient(Anthropic, apiKey)
  const params = {
    model,
    max_tokens: 16000,
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: user }],
    output_config: {
      effort: model === MODELS.fast ? 'low' : 'medium',
      ...(schema ? { format: { type: 'json_schema', schema: OUTPUT_SCHEMA } } : {}),
    },
  }
  const res =
    model === MODELS.depth
      ? await client.beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
      : await client.messages.create(params)
  if (res.stop_reason === 'refusal') throw new AIError('Claude declined this request.', { code: 'refusal' })
  if (res.stop_reason === 'max_tokens') throw new AIError('The answer was cut off.', { code: 'truncated', retryable: true })
  const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('')
  return { json: extractJSON(text), model: res.model }
}

let samplePromise = null
export function getSample() {
  if (!samplePromise) samplePromise = typeof window !== 'undefined' && window.claude?.use ? window.claude.use('sample').catch(() => null) : Promise.resolve(null)
  return samplePromise
}

const SAMPLE_ERRORS = {
  not_granted: 'Claude access was declined for this page. Reload to be asked again.',
  sampling_disabled: 'Claude is not available for this account.',
  rate_limited: 'Too many requests right now. Try again in a moment.',
  session_expired: 'Please sign in to claude.ai again.',
  refused: 'Claude declined this request.',
  invalid_json: "Claude's answer could not be read.",
  empty_completion: 'Claude returned an empty answer.',
}

async function runSample({ user, settings }) {
  const sample = await getSample()
  if (!sample) throw new AIError('Claude is not available in this view.', { code: 'unavailable' })
  const t0 = performance.now()
  const tier = settings.tier === 'depth' ? 'default' : 'quick'
  try {
    const json = await sample.json(`${SYSTEM_PROMPT}\n\n${user}\n\nReply with ONLY the JSON object described above.`, { modelTier: tier })
    return { result: json, meta: { model: tier === 'quick' ? 'Claude (quick)' : 'Claude', ms: performance.now() - t0, attempts: 1 } }
  } catch (e) {
    const code = e?.code || 'upstream_error'
    throw new AIError(SAMPLE_ERRORS[code] || 'Claude had a hiccup.', { code, retryable: !['not_granted', 'sampling_disabled', 'not_declared'].includes(code) })
  }
}

/**
 * Run one planning call. mode: 'dump' | 'skeleton' | 'answer'. Retries once on the other model
 * (web edition only; the artifact contract forbids automatic retries). Returns { result, meta }.
 */
export async function runAI({ mode, text, data, now, settings, apiKey, question, onStage }) {
  const user = buildUserTurn({ mode, text, data, now, question })
  if (IS_ARTIFACT) return runSample({ user, settings })
  if (!apiKey) throw new AIError('Connect your Claude API key in Settings first.', { code: 'no_key' })
  const Anthropic = await loadSDK()
  const primary = settings.tier === 'depth' ? MODELS.depth : MODELS.fast
  const secondary = primary === MODELS.fast ? MODELS.depth : MODELS.fast
  const attempts = [{ model: primary, schema: true }, { model: secondary, schema: true }]
  const t0 = performance.now()
  let lastErr
  for (let i = 0; i < attempts.length; i++) {
    const a = attempts[i]
    if (i > 0) onStage?.(`Retrying with ${modelLabel(a.model)}…`)
    try {
      const r = await callAnthropic(Anthropic, { apiKey, model: a.model, user, schema: a.schema })
      return { result: r.json, meta: { model: modelLabel(r.model || a.model), ms: performance.now() - t0, attempts: i + 1 } }
    } catch (e) {
      lastErr = e
      if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError)
        throw new AIError('Anthropic rejected your API key. Update it in Settings.', { code: 'auth' })
      if (e instanceof Anthropic.BadRequestError) {
        // Most likely the structured-output schema was refused: continue with plain JSON instructions.
        for (const later of attempts.slice(i + 1)) later.schema = false
        if (i === attempts.length - 1 && a.schema) attempts.push({ model: a.model, schema: false })
      }
    }
  }
  throw new AIError(friendly(Anthropic, lastErr), { code: 'failed', retryable: true })
}
