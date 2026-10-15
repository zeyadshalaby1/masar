// Exercise the actual release archives outside the workspace, before publishing.
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

const root = fileURLToPath(new URL('..', import.meta.url))
const version = JSON.parse(readFileSync(join(root, 'packages/core/package.json'))).version
const archive = (name) => join(root, 'artifacts', `${name}-${version}.tgz`)
const work = mkdtempSync(join(tmpdir(), 'masar-release-'))
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: 'inherit' })
writeFileSync(join(work, 'package.json'), JSON.stringify({ private: true, type: 'module' }))
run('npm', ['install', '--no-audit', '--no-fund', archive('create-masar')], work)
run(process.execPath, [join(work, 'node_modules/create-masar/index.js'), 'app', '--yes', '--no-install'], work)
const app = join(work, 'app')
const manifest = join(app, 'package.json')
const pkg = JSON.parse(readFileSync(manifest))
assert.equal(pkg.dependencies['masar'], `^${version}`)
assert.equal(pkg.devDependencies['masar-cli'], `^${version}`)
pkg.dependencies['masar'] = `file:${archive('masar')}`
pkg.devDependencies['masar-cli'] = `file:${archive('masar-cli')}`
writeFileSync(manifest, JSON.stringify(pkg, null, 2))
run('npm', ['install', '--no-audit', '--no-fund'], app)
run('npm', ['run', 'typecheck'], app)
run('npm', ['run', 'build'], app)
const child = spawn(process.execPath, ['node_modules/masar-cli/bin/masar.js', 'start', '--port', '3197', '--no-worker'], {
  cwd: app, env: { ...process.env, NODE_ENV: 'production' }, stdio: ['ignore', 'pipe', 'pipe'],
})
let logs = ''
child.stdout.on('data', (chunk) => { logs += chunk })
child.stderr.on('data', (chunk) => { logs += chunk })
try {
  let ready = false
  for (let i = 0; i < 80; i++) {
    if (child.exitCode !== null) throw new Error(`Production server exited: ${logs}`)
    try {
      const response = await fetch('http://localhost:3197/')
      assert.equal(response.status, 200)
      assert.match(await response.text(), /<html/)
      ready = true
      break
    } catch { await delay(250) }
  }
  assert.ok(ready, `Production server did not become ready: ${logs}`)
  const arabic = await fetch('http://localhost:3197/login', { headers: { 'accept-language': 'ar-EG' } })
  assert.equal(arabic.status, 200)
  assert.match(await arabic.text(), /dir="rtl"/)
  console.log(`Release smoke passed: installer, isolated dependencies, types, build, SSR and Arabic RTL. App: ${app}`)
} finally {
  child.kill('SIGTERM')
}
