import { randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

/** Opens the default browser; returns false when there is none to open (SSH, containers). */
function openBrowser(url) {
  const [command, args] =
    process.platform === 'darwin' ? ['open', [url]] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', url]] : ['xdg-open', [url]]
  try {
    const child = spawn(command, args, { stdio: 'ignore', detached: true })
    child.on('error', () => {})
    child.unref()
    return true
  } catch {
    return false
  }
}

/**
 * The setup page of `npm create masar`. Listens on 127.0.0.1 only, behind a random token in the
 * URL so other pages in the browser cannot post to it. `answers` resolves when the form is sent;
 * `validate` can refuse them (e.g. the folder exists) and the page shows the error in place.
 */
export async function startWebSetup({ version, defaults, validate }) {
  const token = randomBytes(16).toString('hex')
  const html = readFileSync(join(here, 'installer.html'), 'utf8')
    .replace('__TOKEN__', token)
    .replace('__VERSION__', version)
    .replace('__DEFAULTS__', JSON.stringify(defaults).replace(/</g, '\\u003c'))

  const status = { name: '', steps: [], done: false, commands: [], warnings: [] }
  let resolveAnswers
  const answers = new Promise((resolve) => (resolveAnswers = resolve))
  let lastPoll = 0

  const send = (res, code, body, type = 'application/json') => {
    res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' })
    res.end(type === 'application/json' ? JSON.stringify(body) : body)
  }

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (url.searchParams.get('token') !== token) return send(res, 403, 'Open the link printed in the terminal.', 'text/plain')
    if (req.method === 'GET' && url.pathname === '/') return send(res, 200, html, 'text/html; charset=utf-8')
    if (req.method === 'GET' && url.pathname === '/status') {
      lastPoll = Date.now()
      return send(res, 200, status)
    }
    if (req.method === 'POST' && url.pathname === '/create') {
      let raw = ''
      req.on('data', (chunk) => (raw += chunk))
      req.on('end', () => {
        let body
        try {
          body = JSON.parse(raw)
        } catch {
          return send(res, 400, { error: 'The form could not be read. Reload the page.' })
        }
        const problem = validate(body)
        if (problem) return send(res, 422, problem)
        status.name = body.name
        send(res, 200, { ok: true })
        resolveAnswers(body)
      })
      return
    }
    send(res, 404, { error: 'Not found' })
  })

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${server.address().port}/?token=${token}`

  return {
    url,
    opened: openBrowser(url),
    answers,
    /** Steps shown on the page while the app is created: [{ label, state: 'pending'|'active'|'done'|'failed' }]. */
    progress(steps) {
      status.steps = steps.map((s) => ({ ...s }))
    },
    /** Shows the final commands, then closes once the page has seen them (or after 15 seconds). */
    async finish({ commands, warnings }) {
      Object.assign(status, { done: true, commands, warnings })
      const since = Date.now()
      while (Date.now() - since < 15_000 && lastPoll < since) await new Promise((r) => setTimeout(r, 200))
      server.closeAllConnections?.()
      server.close()
    },
    close() {
      server.closeAllConnections?.()
      server.close()
    },
  }
}
