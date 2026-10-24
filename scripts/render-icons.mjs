// Renders public/icon.svg to the PNG sizes iOS and the web manifest need.
// Usage: node scripts/render-icons.mjs
import { chromium } from '@playwright/test'
import { readFile } from 'node:fs/promises'

const svg = await readFile(new URL('../public/icon.svg', import.meta.url), 'utf8')
const browser = await chromium.launch()
for (const [file, size] of [['apple-touch-icon.png', 180], ['icon-512.png', 512]]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } })
  await page.setContent(`<html><body style="margin:0;background:#0F0F12">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`)
  await page.screenshot({ path: new URL(`../public/${file}`, import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1') })
  await page.close()
}
await browser.close()
console.log('icons rendered')
