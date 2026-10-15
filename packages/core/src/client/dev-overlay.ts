/**
 * Masar's error overlay for `masar dev`. Replaces Vite's: build errors (from Vite over HMR) and
 * runtime errors (uncaught errors and rejections) in Masar's identity, with a hint that says what
 * to do. Plain DOM in a shadow root, loaded by its own <script> tag, so it still works when the
 * app's code fails to load or React has crashed.
 */

interface ShownError {
  kind: 'build' | 'runtime' | 'promise'
  message: string
  hint?: string
  file?: string
  line?: number
  column?: number
  frame?: string
  stack?: string
  plugin?: string
}

const MARK = `<svg viewBox="0 0 64 64" width="28" height="28" aria-hidden="true"><rect width="64" height="64" rx="16" fill="#100C0A"/><path d="M16 41.2 V24.5 C16 15.5 25.6 14.6 28.6 23.4 L32 33.6 L35.4 23.4 C38.4 14.6 48 15.5 48 24.5 V40" fill="none" stroke="#FF5A1F" stroke-width="5.4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="16" cy="46.8" r="3.9" fill="none" stroke="#FF5A1F" stroke-width="3.89"/><circle cx="48" cy="46.2" r="6.4" fill="#FF5A1F"/></svg>`

/** Known problems → the next step. The first match wins. */
const HINTS: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/Failed to resolve import "virtual:masar\/[^"]+"/, () => 'The Masar Vite plugin is not active in this server. Restart masar dev (changes to @masar/cli need a restart).'],
  [/Failed to resolve import "(\.{1,2}\/[^"]+)"/, (m) => `No file at ${m[1]}. Check the path and the file name; case matters.`],
  [/Failed to resolve import "((?:@[^/"]+\/)?[^/"]+)[^"]*"/, (m) => `The package "${m[1]}" is not installed. Run: pnpm add ${m[1]}`],
  [/does not provide an export named '([^']+)'/, (m) => `Nothing is exported as "${m[1]}" there. Check the name, or use the default import.`],
  [/Outdated Optimize Dep/, () => 'Vite re-bundled dependencies while the page was loading. Reload the page.'],
  [/Failed to fetch dynamically imported module/, () => 'That file failed to compile or no longer exists. Fix it (the terminal shows why), then reload.'],
  [/Unexpected token|Expected .* but found|Unterminated|Expression expected/i, () => 'A syntax error: look at the marked line for a missing bracket, quote or comma.'],
  [/is not defined$/, () => 'Used before it was imported or declared. Add the import, or check the spelling.'],
  [/Cannot read properties of (undefined|null)/, () => 'A value is missing here. Check the data your page receives from load() or the action (optional chaining: value?.field).'],
  [/is not a function/, () => 'Called something that is not a function: check the import (default vs named) and the name.'],
  [/Rendered (more|fewer) hooks|Invalid hook call/, () => 'Hooks must run in the same order every render: no hooks inside conditions, loops or after an early return.'],
  [/Objects are not valid as a React child/, () => 'Render a field of the object, not the object itself (e.g. {course.title}, or JSON.stringify for debugging).'],
]

function hintFor(message: string): string | undefined {
  // Masar's own errors carry their hint after "→".
  const own = message
    .split('\n')
    .filter((l) => l.trim().startsWith('→'))
    .map((l) => l.trim().slice(1).trim())
  if (own.length) return own.join(' ')
  for (const [pattern, hint] of HINTS) {
    const match = message.match(pattern)
    if (match) return hint(match)
  }
  return undefined
}

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
/** Paths as you see them in the project: from src/, node_modules/ or the last folders. */
const short = (file: string) => {
  const marker = file.match(/\/(src|node_modules|packages)\/.*$/)
  return marker ? marker[0].slice(1) : file.split('/').slice(-3).join('/')
}

/** The first line is the title; the rest (compiler diagrams, extra lines) goes in a code block. */
function splitMessage(message: string): { title: string; detail?: string } {
  const lines = stripAnsi(message)
    .split('\n')
    .filter((l) => !l.trim().startsWith('→') && !/^Transform failed with \d+ errors?:?$/.test(l.trim()))
  while (lines.length && !lines[0]!.trim()) lines.shift()
  const title = (lines.shift() ?? 'Error').trim()
  const detail = lines.join('\n').replace(/^\s*\n|\s+$/g, '')
  return { title, detail: detail || undefined }
}
// eslint-disable-next-line no-control-regex
const stripAnsi = (s: string) => s.replace(/\u001b\[[0-9;]*m/g, '')

function fromStack(stack: string | undefined): Pick<ShownError, 'file' | 'line' | 'column'> {
  const match = stack?.match(/(?:https?:\/\/[^/]+)?(\/[^\s):]+\.(?:tsx?|jsx?|mjs)):(\d+):(\d+)/)
  if (!match) return {}
  const file = match[1]!.replace(/^\/@fs/, '').replace(/\?.*$/, '')
  return { file, line: Number(match[2]), column: Number(match[3]) }
}

function frameHtml(frame: string): string {
  return stripAnsi(frame)
    .split('\n')
    .map((line) => {
      const marker = /^\s*>/.test(line) || /^\s*\|\s*\^/.test(line.replace(/^\s*\d+\s*/, ''))
      const caret = /^\s*\|?\s*\^+\s*$/.test(line.replace(/^\s*\d*\s*\|/, '|'))
      return `<span class="${caret ? 'caret' : marker ? 'mark' : ''}">${escape(line) || ' '}</span>`
    })
    .join('\n')
}

const STYLE = `
:host { all: initial; }
* { box-sizing: border-box; }
.backdrop { direction: ltr; text-align: left; position: fixed; inset: 0; z-index: 2147483647; background: rgb(16 12 10 / .62); backdrop-filter: blur(6px);
  display: grid; place-items: start center; overflow-y: auto; padding: 6vh 16px 32px;
  font-family: "Bricolage Grotesque", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; color: #100C0A; }
.card { width: min(920px, 100%); background: #FCF9F8; border-radius: 16px; overflow: hidden;
  box-shadow: 0 30px 80px -20px rgb(16 12 10 / .55), 0 0 0 1px rgb(16 12 10 / .06); }
.bar { height: 4px; background: #C81E3A; }
.head { display: flex; align-items: center; gap: 12px; padding: 18px 24px; border-bottom: 1px solid #E9E3E0; }
.brand { display: flex; align-items: center; gap: 10px; font-weight: 800; letter-spacing: -.02em; font-size: 15px; }
.chip { font: 600 11px/1 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .04em; text-transform: uppercase;
  color: #C81E3A; background: #FBE4E8; border-radius: 999px; padding: 6px 10px; }
.plugin { font: 12px ui-monospace, SFMono-Regular, Menlo, monospace; color: #827872; }
.spacer { flex: 1; }
.nav { font: 12px ui-monospace, monospace; color: #625953; display: flex; align-items: center; gap: 6px; }
button { font: inherit; cursor: pointer; border: 0; background: transparent; color: inherit; }
.icon { width: 32px; height: 32px; border-radius: 8px; display: grid; place-items: center; color: #625953; }
.icon:hover { background: #F2ECE9; color: #100C0A; }
.body { padding: 24px; display: grid; gap: 18px; grid-template-columns: minmax(0, 1fr); }
h1 { margin: 0; font-size: 22px; line-height: 1.35; font-weight: 700; letter-spacing: -.01em; white-space: pre-wrap; word-break: break-word; }
.hint { display: flex; gap: 10px; align-items: flex-start; background: #FFE9E3; color: #8A2C04; border-radius: 10px; padding: 12px 14px; font-size: 15px; line-height: 1.5; }
.hint b { font-weight: 700; color: #B03700; white-space: nowrap; }
.file { display: inline-flex; align-items: center; gap: 8px; font: 13px ui-monospace, SFMono-Regular, Menlo, monospace; color: #B03700;
  text-decoration: none; border-bottom: 1px dashed currentColor; width: fit-content; }
.file:hover { color: #100C0A; }
pre { margin: 0; padding: 16px 18px; border-radius: 10px; background: #100C0A; color: #E9E3E0; font: 12.5px/1.65 ui-monospace, SFMono-Regular, Menlo, monospace;
  overflow-x: auto; direction: ltr; text-align: left; }
pre .mark { color: #FFFFFF; background: rgb(255 90 31 / .16); display: inline-block; min-width: 100%; }
pre .caret { color: #FF5A1F; font-weight: 700; }
details { border: 1px solid #E9E3E0; border-radius: 10px; }
summary { cursor: pointer; padding: 10px 14px; font-size: 13px; color: #625953; }
details pre { border-radius: 0 0 10px 10px; max-height: 280px; }
.foot { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 14px 24px; border-top: 1px solid #E9E3E0; background: #F7F2F0; }
.btn { height: 34px; padding: 0 14px; border-radius: 8px; font-size: 13px; font-weight: 600; border: 1px solid #D6CFCB; background: #FFFFFF; }
.btn:hover { border-color: #625953; }
.btn.primary { background: #FF5A1F; color: #100C0A; border-color: #FF5A1F; }
.btn.primary:hover { filter: brightness(.96); }
.keys { margin-inline-start: auto; font-size: 12px; color: #827872; }
kbd { font: 11px ui-monospace, monospace; border: 1px solid #D6CFCB; border-bottom-width: 2px; border-radius: 5px; padding: 1px 5px; background: #fff; }
@media (prefers-color-scheme: dark) {
  .backdrop { color: #FCF9F8; }
  .card { background: #1C1714; box-shadow: 0 30px 80px -20px #000, 0 0 0 1px rgb(255 255 255 / .08); }
  .head, .foot, details { border-color: rgb(255 255 255 / .08); }
  .foot { background: #171210; }
  .chip { background: rgb(242 84 107 / .14); color: #F2546B; }
  .bar { background: #F2546B; }
  .hint { background: #3C1304; color: #FFB29B; }
  .hint b { color: #FD8966; }
  .file { color: #FD8966; }
  .file:hover { color: #FCF9F8; }
  .icon { color: #ABA39D; } .icon:hover { background: #2E2723; color: #FCF9F8; }
  .btn { background: #2E2723; border-color: rgb(255 255 255 / .12); color: #FCF9F8; }
  .btn.primary { background: #FF5A1F; color: #100C0A; border-color: #FF5A1F; }
  kbd { background: #2E2723; border-color: rgb(255 255 255 / .15); }
  .nav, summary { color: #ABA39D; }
}
`

class MasarErrorOverlay extends HTMLElement {
  errors: ShownError[] = []
  index = 0
  root = this.attachShadow({ mode: 'open' })

  show(error: ShownError) {
    // The same build error arrives again on every retry; keep one.
    if (this.errors.some((e) => e.message === error.message && e.file === error.file)) return
    // A failed dynamic import right after a build error is the same problem seen from the browser.
    if (error.kind !== 'build' && /Failed to fetch dynamically imported module/.test(error.message) && this.errors.some((e) => e.kind === 'build')) return
    if (error.kind === 'build') this.errors = this.errors.filter((e) => !/Failed to fetch dynamically imported module/.test(e.message))
    this.errors.push(error)
    this.index = this.errors.length - 1
    if (!this.isConnected) document.documentElement.appendChild(this)
    this.render()
  }

  close() {
    this.errors = []
    this.remove()
  }

  connectedCallback() {
    window.addEventListener('keydown', this.onKey)
  }

  disconnectedCallback() {
    window.removeEventListener('keydown', this.onKey)
  }

  onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') this.close()
    if (event.key === 'ArrowRight' && this.index < this.errors.length - 1) (this.index++, this.render())
    if (event.key === 'ArrowLeft' && this.index > 0) (this.index--, this.render())
  }

  render() {
    const e = this.errors[this.index]!
    const kind = { build: 'Build error', runtime: 'Runtime error', promise: 'Unhandled promise' }[e.kind]
    const where = e.file ? `${e.file}${e.line ? `:${e.line}${e.column ? `:${e.column}` : ''}` : ''}` : ''
    const hint = e.hint ?? hintFor(e.message)
    const { title, detail } = splitMessage(e.message)
    const message = [title, detail].filter(Boolean).join('\n')
    this.root.innerHTML = `<style>${STYLE}</style>
<div class="backdrop" part="backdrop">
  <div class="card" role="alertdialog" aria-modal="true" aria-label="${escape(kind)}">
    <div class="bar"></div>
    <div class="head">
      <span class="brand">${MARK} Masar</span>
      <span class="chip">${kind}</span>
      ${e.plugin ? `<span class="plugin">${escape(e.plugin)}</span>` : ''}
      <span class="spacer"></span>
      ${
        this.errors.length > 1
          ? `<span class="nav"><button class="icon" data-act="prev" aria-label="Previous error">‹</button>${this.index + 1} / ${this.errors.length}<button class="icon" data-act="next" aria-label="Next error">›</button></span>`
          : ''
      }
      <button class="icon" data-act="close" aria-label="Close">✕</button>
    </div>
    <div class="body">
      <h1>${escape(title)}</h1>
      ${hint ? `<div class="hint"><b>Next step</b><span>${escape(hint)}</span></div>` : ''}
      ${where ? `<a class="file" href="#" data-act="open" title="Open in your editor">${escape(short(where))} ↗</a>` : ''}
      ${e.frame ? `<pre>${frameHtml(e.frame)}</pre>` : detail ? `<pre>${frameHtml(detail)}</pre>` : ''}
      ${e.stack ? `<details${e.frame ? '' : ' open'}><summary>Stack trace</summary><pre>${escape(stripAnsi(e.stack))}</pre></details>` : ''}
    </div>
    <div class="foot">
      ${where ? '<button class="btn primary" data-act="open">Open in editor</button>' : ''}
      <button class="btn" data-act="copy">Copy error</button>
      <button class="btn" data-act="reload">Reload</button>
      <span class="keys"><kbd>Esc</kbd> close${this.errors.length > 1 ? ' · <kbd>←</kbd> <kbd>→</kbd> errors' : ''} · fix the file and save to retry</span>
    </div>
  </div>
</div>`
    this.root.querySelector('.backdrop')!.addEventListener('click', (event) => {
      if (event.target === event.currentTarget) this.close()
    })
    for (const el of this.root.querySelectorAll<HTMLElement>('[data-act]')) {
      el.addEventListener('click', (event) => {
        event.preventDefault()
        const act = el.dataset.act
        if (act === 'close') this.close()
        if (act === 'prev') (this.index--, this.render())
        if (act === 'next') (this.index++, this.render())
        if (act === 'reload') location.reload()
        if (act === 'open' && where) void fetch(`/__open-in-editor?file=${encodeURIComponent(where)}`)
        if (act === 'copy') {
          void navigator.clipboard?.writeText([kind, message, hint && `Next step: ${hint}`, where, e.frame && stripAnsi(e.frame), e.stack && stripAnsi(e.stack)].filter(Boolean).join('\n\n'))
          el.textContent = 'Copied'
        }
      })
    }
  }
}

if (!customElements.get('masar-error-overlay')) customElements.define('masar-error-overlay', MasarErrorOverlay)
const overlay = () => (document.querySelector('masar-error-overlay') as MasarErrorOverlay | null) ?? (document.createElement('masar-error-overlay') as MasarErrorOverlay)

interface ViteErrorPayload {
  err: { message: string; stack?: string; id?: string; frame?: string; plugin?: string; loc?: { file?: string; line?: number; column?: number } }
}

if (import.meta.hot) {
  import.meta.hot.on('vite:error', (payload: ViteErrorPayload) => {
    const err = payload.err
    overlay().show({
      kind: 'build',
      message: err.message.replace(/^\[plugin:[^\]]+\]\s*/, ''),
      plugin: err.plugin,
      file: err.loc?.file ?? err.id,
      line: err.loc?.line,
      column: err.loc?.column,
      frame: err.frame,
      stack: err.stack,
    })
  })
  // A successful update means the build error was fixed.
  import.meta.hot.on('vite:afterUpdate', () => document.querySelector('masar-error-overlay')?.remove())
}

window.addEventListener('error', (event) => {
  const error = event.error as Error | undefined
  if (!error && !event.message) return
  overlay().show({ kind: 'runtime', message: error?.message ?? event.message, stack: error?.stack, ...fromStack(error?.stack) })
})

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason as Error | undefined
  // Action errors are handled by the page (useAction shows them); not every rejection is a crash.
  if (reason && typeof reason === 'object' && (reason.name === 'ActionError' || reason.name === 'ActionValidationError')) return
  overlay().show({ kind: 'promise', message: reason?.message ?? String(reason), stack: reason?.stack, ...fromStack(reason?.stack) })
})

export {}
