import type { MasarServer } from 'masar/server'
import pc from 'picocolors'
import { orange } from './ui'

export async function syncAndReport(app: MasarServer, { quiet = false } = {}) {
  if (app.models.length === 0) return
  const reports = await app.sync()
  for (const report of reports) {
    const changes = [
      ...report.created.map((t) => `${pc.green('+')} ${t}`),
      ...report.altered.map((c) => `${pc.cyan('~')} ${c}`),
    ]
    const label = `${report.connection} ${pc.dim(`(${report.driver})`)}`
    if (changes.length === 0) {
      if (!quiet) console.log(`  ${orange('➜')}  ${pc.bold('Database'.padEnd(9))} ${label} ${pc.dim('up to date')}`)
    } else {
      console.log(`  ${orange('➜')}  ${pc.bold('Database'.padEnd(9))} ${label} ${changes.join('  ')}`)
    }
    for (const warning of report.warnings) console.log(`     ${pc.yellow('!')} ${warning}`)
  }
}

/** Pending migrations first (they may rename what sync would otherwise duplicate), then sync. */
export async function migrateAndReport(app: MasarServer, { quiet = false } = {}) {
  const ran = await runMigrations(app)
  if (ran.length === 0 && !quiet) console.log(`  ${orange('➜')}  ${pc.bold('Migrate'.padEnd(9))} ${pc.dim('nothing pending')}`)
  await syncAndReport(app, { quiet })
}

async function runMigrations(app: MasarServer) {
  const pending = await app.pendingMigrations()
  if (pending.length === 0) return []
  const ran = await app.migrate()
  for (const id of ran) console.log(`  ${orange('➜')}  ${pc.bold('Migrate'.padEnd(9))} ${pc.green('✓')} ${id}`)
  return ran
}

/**
 * Dev never runs migrations by itself: a half-written file saved by the editor would run and be
 * recorded as done. It only says what is waiting.
 */
export async function reportPending(app: MasarServer) {
  const pending = await app.pendingMigrations()
  if (pending.length === 0) return
  console.log(`  ${orange('➜')}  ${pc.bold('Migrate'.padEnd(9))} ${pc.yellow(`${pending.length} pending`)} ${pc.dim('run masar migrate when they are ready')}`)
  for (const id of pending) console.log(`     ${pc.yellow('•')} ${id}`)
}
