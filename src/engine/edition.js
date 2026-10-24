// Which build is running: the web app or the claude.ai artifact (set by vite.config.js).
export const IS_ARTIFACT = typeof __EDITION__ !== 'undefined' && __EDITION__ === 'artifact'
