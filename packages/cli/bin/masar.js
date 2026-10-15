#!/usr/bin/env node
// Masar CLI entry. Runs the TypeScript sources through tsx.
const emitWarning = process.emitWarning
process.emitWarning = function (warning, ...args) {
  const message = typeof warning === 'string' ? warning : warning?.message
  // node:sqlite is built into Node and works fine; hide its "experimental" notice.
  if (message?.includes('SQLite is an experimental feature')) return
  return emitWarning.call(process, warning, ...args)
}

const [major, minor] = process.versions.node.split('.').map(Number)
if (major < 22 || (major === 22 && minor < 13)) {
  console.error(`Masar needs Node.js 22.13 or newer (you have ${process.versions.node}). Node 24 LTS is recommended.`)
  process.exit(1)
}

const { register } = await import('tsx/esm/api')
register()
await import('../src/index.ts')
