import React from 'react'
import { CAN_EXPORT, calendarHref } from '../engine/calendarExport.js'
import { IS_ARTIFACT } from '../engine/ai.js'

/** "Add to calendar" control: a button in the web app, a real link in the artifact edition. */
export function CalendarAction({ events, onExport, className = '', children, label = 'Add to calendar' }) {
  if (!CAN_EXPORT) return null
  if (IS_ARTIFACT) {
    const href = calendarHref(events)
    return href ? (
      <a href={href} target="_blank" rel="noreferrer" aria-label={label} className={className}>
        {children}
      </a>
    ) : null
  }
  return (
    <button type="button" aria-label={label} disabled={!events.length} onClick={() => onExport(events)} className={`${className} disabled:opacity-40`}>
      {children}
    </button>
  )
}
