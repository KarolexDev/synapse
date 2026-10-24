# Synapse

Smart calendar + smart task list. Dump your thoughts (typed or dictated), Claude turns them into
structured operations, and a deterministic scheduler places everything around fixed commitments
whose end times are uncertain (work that may end early, a commute that may run late).

- **Web app** (Vercel, add to the iPhone home screen): bring your own Anthropic API key. The key is
  stored only on the device and sent directly from the browser to Anthropic.
- **Artifact edition** (no key, uses the viewer's claude.ai account):
  https://claude.ai/artifact/W68WsZamd8aWWih8eHnnZW (private until shared via its Share menu).

## Develop

```bash
npm install
npm run dev            # http://localhost:5173
npm test               # scheduler / ops / ics unit tests (vitest)
npm run e2e            # Playwright stage script with a mocked Claude API
npm run build          # web edition → dist/
npm run build:artifact # single-file artifact page → dist-artifact/synapse.html
```

First Playwright run: `npx playwright install chromium`.

## Deploy to Vercel

```bash
npx vercel login       # once
npx vercel --prod      # builds with vercel.json, serves dist/ and api/ics.js
```

No environment variables are required (users bring their own key). `VITE_ARTIFACT_URL` in
`.env.production` sets the "No key? Try it on claude.ai" link.

After the first deploy, put the Vercel URL into `.env.artifact` (`VITE_WEB_URL=https://….vercel.app`),
run `npm run build:artifact` and republish the artifact: its "Add to calendar" buttons link to the
web app's `/api/ics`, because the claude.ai frame cannot save `.ics` files itself. Until then the
artifact edition hides them.

On the iPhone: open the URL in Safari → Share → Add to Home Screen.

## How it works

| Piece | File |
|---|---|
| Claude call (structured JSON output, Haiku 5.5 / Sonnet 5.5, retry on the other model) | `src/engine/ai.js`, `src/engine/prompt.js` |
| Sanitizing Claude's ops, shopping de-dupe, grocery-run rule, clarifications | `src/engine/ops.js` |
| Chains (commute before/after work), uncertainty ranges per occurrence | `src/engine/layout.js` |
| Plan-safe slot finding, rest-day spacing, reflow, missed-task rollover | `src/engine/scheduler.js` |
| `.ics` export (served by `api/ics.js` so iOS shows "Add to Calendar") | `src/engine/ics.js`, `src/engine/calendarExport.js` |
| State, undo, demo week | `src/state/` |

## Stage checklist

1. Phone: home-screen app opened, key connected (Settings shows "Connected"), Speed tier.
2. Settings → Load demo week (jumps the clock to Monday 08:12).
3. Tap "Try: Weekly chaos" (or dictate it) → Sync & Organize.
4. Answer "Every Tuesday", then pick a trip date.
5. Triple-tap the Synapse logo → Mon 15:05 → close → "Finished early".
6. Show Tasks (merged shopping list, grocery run moved up), Agent (Show reasoning), Week → Add to your calendar.
7. Artifact edition: run one brain dump before going on stage so the claude.ai permission prompt is already answered.
