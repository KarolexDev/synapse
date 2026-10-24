// End-to-end stage script. Anthropic's API is mocked at the network layer with a recorded-style
// answer (tests/fixtures.js) so the run is deterministic; the app itself is unchanged.

import { test, expect } from '@playwright/test'
import { demoDumpResult, skeletonResult } from './fixtures.js'
import { DEMO_DUMP } from '../src/state/demoWeek.js'

const SHOTS = 'test-results/screens'
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS' }
const json = (body) => ({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(body) })

async function mockClaude(page, calls) {
  await page.route('https://api.anthropic.com/**', async (route) => {
    const req = route.request()
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    if (req.url().includes('/v1/models')) return route.fulfill(json({ data: [], has_more: false, first_id: null, last_id: null }))
    const body = JSON.parse(req.postData())
    calls.push(body)
    const user = body.messages[0].content
    if (/^TYPICAL WEEK$/m.test(user)) return route.fulfill(json({ id: 'msg_s', type: 'message', role: 'assistant', model: body.model, content: [{ type: 'text', text: JSON.stringify(skeletonResult()) }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } }))
    const entries = JSON.parse(user.match(/^ENTRIES: (.*)$/m)[1])
    const [, y, mo, d, h, mi] = user.match(/^NOW: \w+ (\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/m)
    const result = demoDumpResult({ entries }, new Date(+y, +mo - 1, +d, +h, +mi).getTime())
    await new Promise((r) => setTimeout(r, 700))
    return route.fulfill(
      json({ id: 'msg_test', type: 'message', role: 'assistant', model: body.model, content: [{ type: 'text', text: JSON.stringify(result) }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } }),
    )
  })
}

const scrollTo = (page, y) => page.locator('[data-scroll]').evaluate((el, top) => el.scrollTo(0, top), y)

test('stage script on iPhone', async ({ page }, info) => {
  test.skip(info.project.name !== 'iphone')
  const calls = []
  await mockClaude(page, calls)
  await page.goto('/')
  await expect(page.getByText('Your week, untangled.')).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/01-welcome.png` })

  await page.getByRole('button', { name: 'Explore the demo week' }).click()
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible()
  await page.waitForTimeout(900)
  await expect(page.getByText(/missed item/)).toHaveCount(0) // loading the demo must not roll anything over
  await page.screenshot({ path: `${SHOTS}/02-today.png` })
  await scrollTo(page, 520)
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${SHOTS}/02b-timeline.png` })
  await scrollTo(page, 0)

  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await page.getByPlaceholder('sk-ant-…').fill('sk-ant-test-1234')
  await page.getByRole('button', { name: 'Connect' }).click()
  await expect(page.getByText('Key ending in …1234')).toBeVisible()
  await page.getByRole('button', { name: 'Close' }).click()

  await page.getByPlaceholder(/just dump it all/).fill(DEMO_DUMP)
  await page.getByRole('button', { name: 'Sync & Organize' }).click()
  await expect(page.getByText('Synthesizing thoughts…')).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/03-processing.png` })
  await expect(page.getByText('Is your Tuesday trainer session every week?')).toBeVisible({ timeout: 15_000 })
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${SHOTS}/04-clarify.png` })
  expect(calls[0].model).toBe('claude-haiku-5-5')
  expect(calls[0].output_config.format.type).toBe('json_schema')

  await page.getByRole('button', { name: /Every Tuesday/ }).click()
  await expect(page.getByText('When does your trip start?')).toBeVisible()
  await page.locator('button', { hasText: '✈️' }).first().click()
  await expect(page.getByText('When does your trip start?')).toHaveCount(0)
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${SHOTS}/05-resolved.png` })

  await page.getByRole('button', { name: 'Synapse' }).click({ clickCount: 3 })
  await page.getByRole('button', { name: /Mon 15:05/ }).click()
  await page.getByRole('button', { name: 'Close' }).click()
  await expect(page.getByRole('button', { name: /Finished early/ })).toBeVisible()
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${SHOTS}/06-live.png` })
  await page.getByRole('button', { name: /Finished early/ }).click()
  await expect(page.getByText(/reclaimed/).first()).toBeVisible()
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${SHOTS}/07-reflowed.png` })
  await scrollTo(page, 640)
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${SHOTS}/07b-reflowed-timeline.png` })

  await page.getByRole('button', { name: 'Tasks', exact: true }).click()
  await expect(page.getByText('Batteries')).toBeVisible()
  await expect(page.getByText(/Grocery run · Today 15:05/)).toBeVisible() // moved up with work
  await page.screenshot({ path: `${SHOTS}/08-tasks.png` })
  await scrollTo(page, 600)
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${SHOTS}/08b-shopping.png` })

  await page.getByRole('button', { name: 'Week', exact: true }).click()
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${SHOTS}/09-week.png` })

  await page.getByRole('button', { name: 'Agent', exact: true }).click()
  await page.getByRole('button', { name: /Show reasoning/ }).first().click()
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${SHOTS}/10-agent.png` })

  await page.getByRole('button', { name: 'Week', exact: true }).click()
  await page.locator('button', { hasText: 'Workout' }).first().click()
  await expect(page.getByText('Why here?')).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/11-entry-sheet.png` })
})

test('onboarding: location, then the week skeleton', async ({ page, context }, info) => {
  test.skip(info.project.name !== 'iphone')
  const calls = []
  await mockClaude(page, calls)
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude: 48.2082, longitude: 16.3738 })
  await page.route('https://api.bigdatacloud.net/**', (route) =>
    route.fulfill(json({ city: 'Vienna', locality: 'Innere Stadt', principalSubdivision: 'Wien', principalSubdivisionCode: 'AT-9', countryName: 'Austria', countryCode: 'AT' })),
  )
  await page.goto('/')
  await page.getByRole('button', { name: /Get started/ }).click()
  await page.getByPlaceholder('sk-ant-api03-…').fill('sk-ant-test-9999')
  await page.getByRole('button', { name: 'Connect' }).click()
  await expect(page.getByText('Where are you based?')).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/14-location.png` })
  await page.getByRole('button', { name: 'Use my location' }).click()
  await expect(page.getByText('Tell me about a typical week')).toBeVisible()
  await page.getByRole('button', { name: 'Try: Example week' }).click()
  await page.waitForTimeout(600)
  await page.getByRole('button', { name: 'Build my week' }).click()
  await expect(page.getByText('Your week’s skeleton')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('may end 2 h early')).toBeVisible()
  await expect(page.getByText('Commute home')).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/13-skeleton.png` })
  const sent = calls[0].messages[0].content
  expect(sent).toMatch(/^LOCATION: Vienna, Wien, Austria \(AT-9\), from GPS on /m)
  expect(sent).not.toMatch(/48\.2|16\.3/)
  await page.getByRole('button', { name: 'Looks right' }).click()
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Agent', exact: true }).click()
  await page.getByRole('button', { name: 'Show what Claude saw' }).first().click()
  await expect(page.getByText(/^LOCATION: Vienna/m)).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/15-what-claude-saw.png` })
})

test('framed on desktop', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop')
  await page.goto('/')
  await page.getByRole('button', { name: 'Explore the demo week' }).click()
  await page.waitForTimeout(900)
  await page.screenshot({ path: `${SHOTS}/12-desktop.png` })
})
