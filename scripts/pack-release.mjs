import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const output = resolve(root, 'artifacts')
mkdirSync(output, { recursive: true })
const packages = ['core', 'cli', 'create-masar']
const versions = packages.map((name) => JSON.parse(readFileSync(resolve(root, 'packages', name, 'package.json'))).version)
assert.equal(new Set(versions).size, 1, 'Release package versions must match')
const installer = readFileSync(resolve(root, 'packages/create-masar/index.js'), 'utf8')
assert.ok(installer.includes(`const VERSION = '${versions[0]}'`), 'Update the installer version before packing')
for (const name of packages) {
  execFileSync('npm', ['exec', '--yes', '--package=pnpm@10.28.0', '--', 'pnpm', '--dir', resolve(root, 'packages', name), 'pack', '--pack-destination', output], { cwd: root, stdio: 'inherit' })
}
console.log(`Release archives: ${output}`)
