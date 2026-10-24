// GET /api/ics?d=<base64url JSON of compact events> → text/calendar.
// Served from a real URL so iOS Safari opens its native "Add to Calendar" sheet.

import { buildICS } from '../src/engine/ics.js'

export default function handler(req, res) {
  try {
    const raw = String(req.query?.d || '')
    if (!raw || raw.length > 60_000) throw new Error('missing or too large')
    const events = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'))
    if (!Array.isArray(events) || events.length === 0 || events.length > 100) throw new Error('bad payload')
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8')
    res.setHeader('Content-Disposition', 'inline; filename="synapse.ics"')
    res.setHeader('Cache-Control', 'no-store')
    res.status(200).send(buildICS(events))
  } catch {
    res.status(400).setHeader('Content-Type', 'text/plain; charset=utf-8').send('Invalid calendar data')
  }
}
