import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import pc from 'picocolors'
import { loadApp } from '../load'
import { findRoot } from '../project'
import { migrateAndReport } from '../sync'
import { orange } from '../ui'

/** Production deploy step: pending migrations, then schema sync. */
export async function migrate() {
  const { app, close } = await loadApp(findRoot())
  try {
    console.log()
    await migrateAndReport(app)
    console.log()
  } finally {
    await close()
  }
}

export async function migrateStatus() {
  const { app, close } = await loadApp(findRoot())
  try {
    const pending = await app.pendingMigrations()
    console.log()
    if (pending.length === 0) console.log(`  ${pc.green('✓')} No pending migrations`)
    for (const id of pending) console.log(`  ${pc.yellow('•')} ${id} ${pc.dim('pending')}`)
    console.log()
  } finally {
    await close()
  }
}

const stamp = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}_${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`
}

export async function makeMigration(module: string, name: string) {
  const root = findRoot()
  if (!existsSync(join(root, 'src/modules', module, 'module.ts'))) {
    throw Object.assign(new Error(`Module "${module}" does not exist`), { hint: `Create it first: masar make:module ${module}` })
  }
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
  if (!slug) throw Object.assign(new Error('Give the migration a name'), { hint: 'e.g. masar make:migration courses rename_title' })
  const dir = join(root, 'src/modules', module, 'migrations')
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `${stamp(new Date())}_${slug}.ts`)
  writeFileSync(
    file,
    `import { defineMigration } from '@zeyadshalaby1/masar'

// Runs once per database with masar migrate (and masar dev), before schema sync.
// Change schema.ts to match: sync adds new tables and fields, migrations rename, drop and move data.
export default defineMigration({
  async up(m) {
    // await m.renameField('${module}', 'oldName', 'newName')
    // await m.dropField('${module}', 'unused')
    // await m.sync()   // add new fields now, then backfill them with db()
  },
})
`,
  )
  console.log(`\n  ${orange('◆')} Created ${pc.bold(relative(root, file))}\n`)
}
