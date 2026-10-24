// Turns the single-file artifact build (dist-artifact/index.html) into the page fragment the
// claude.ai Artifact tool publishes: <title> + inline <style> + root + inline module script,
// without <html>/<head>/<body> (the viewer wraps the page in its own skeleton).
// Usage: node scripts/artifact-page.mjs [output path]
import { readFile, writeFile } from 'node:fs/promises'

const html = await readFile(new URL('../dist-artifact/index.html', import.meta.url), 'utf8')
const styles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1])
const scripts = [...html.matchAll(/<script type="module"[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1])
if (!styles.length || scripts.length !== 1) throw new Error(`unexpected build output: ${styles.length} styles, ${scripts.length} scripts`)
if (/<\/script/i.test(scripts[0])) throw new Error('bundle contains a closing script tag')
const page = [
  '<title>Synapse</title>',
  `<style>${styles.join('\n')}</style>`,
  '<div id="root"></div>',
  `<script type="module">${scripts[0]}</script>`,
  '',
].join('\n')
const out = process.argv[2] || new URL('../dist-artifact/synapse.html', import.meta.url)
await writeFile(out, page)
console.log(`artifact page: ${(page.length / 1024).toFixed(0)} KB → ${out}`)
