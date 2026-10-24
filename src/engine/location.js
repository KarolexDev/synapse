// Where the user is: GPS in the web app (turned into a city with a free reverse-geocoding service),
// otherwise only what the device settings suggest. Only city/region/country are sent to Claude.

import { IS_ARTIFACT } from './edition.js'
import { dateKey } from './time.js'

export const CAN_LOCATE = !IS_ARTIFACT && typeof navigator !== 'undefined' && 'geolocation' in navigator

export function deviceHint() {
  let tz = ''
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    tz = ''
  }
  const lang = typeof navigator !== 'undefined' ? navigator.language : ''
  return [lang, tz].filter(Boolean).join(', ')
}

const position = () =>
  new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: false, timeout: 12_000, maximumAge: 3_600_000 }))

const GEO_ERRORS = {
  1: 'Location access was denied. You can allow it in your browser settings and try again.',
  2: 'Your position could not be determined. Try again outside or with Wi-Fi on.',
  3: 'Finding your position took too long. Try again.',
}

/** Resolves { city, region, regionCode, country, countryCode, lat, lon, source, at } or throws Error with a readable message. */
export async function locateMe(now) {
  if (!CAN_LOCATE) throw new Error('Location is not available here.')
  let pos
  try {
    pos = await position()
  } catch (e) {
    throw new Error(GEO_ERRORS[e?.code] || 'Your position could not be determined.')
  }
  const lat = Math.round(pos.coords.latitude * 100) / 100
  const lon = Math.round(pos.coords.longitude * 100) / 100
  let place
  try {
    const res = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`)
    if (!res.ok) throw new Error(String(res.status))
    place = await res.json()
  } catch {
    throw new Error('Found your position but could not look up the city. Check your connection and try again.')
  }
  const city = place.city || place.locality || ''
  if (!place.countryName) throw new Error('Could not find a city for your position.')
  return {
    city,
    region: place.principalSubdivision || '',
    regionCode: place.principalSubdivisionCode || '',
    country: place.countryName,
    countryCode: place.countryCode || '',
    lat,
    lon,
    source: 'gps',
    at: dateKey(now),
  }
}

export function describeLocation(loc) {
  if (!loc) return null
  return [loc.city, loc.region && loc.region !== loc.city ? loc.region : '', loc.country].filter(Boolean).join(', ')
}
