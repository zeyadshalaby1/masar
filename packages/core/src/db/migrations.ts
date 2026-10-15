import { MasarError } from '../errors'
import type { Adapter, SchemaChange } from './adapters/types'
import { db } from './db'
import { f, model, type Model } from './model'
import { getAdapter } from './registry'
import { transaction } from './transaction'

/** What a migration's up() receives. db() also works inside, on the same transaction. */
export interface MigrationContext {
  driver: Adapter['driver']
  renameField(table: string, from: string, to: string): Promise<void>
  dropField(table: string, field: string): Promise<void>
  renameTable(from: string, to: string): Promise<void>
  dropTable(table: string): Promise<void>
  /** Apply the current schemas (add tables, columns, indexes) now, e.g. before backfilling a new field. */
  sync(): Promise<void>
  /** Raw SQL on SQLite/Postgres. Placeholders: ? on SQLite, $1 on Postgres. */
  sql(query: string, params?: unknown[]): Promise<Record<string, unknown>[]>
}

export interface Migration {
  readonly __masar: 'migration'
  up(m: MigrationContext): Promise<void>
}

/**
 * src/modules/<module>/migrations/<timestamp>_<name>.ts, created by `masar make:migration`.
 * Migrations run once per database, in timestamp order, before `db:sync`. They only go forward:
 * to undo one, write a new migration.
 */
export function defineMigration(definition: { up(m: MigrationContext): Promise<void> }): Migration {
  return { __masar: 'migration', up: definition.up }
}

export interface PlannedMigration {
  /** "<module>/<file name>", unique and sortable by its timestamp. */
  id: string
  connection: string
  migration: Migration
}

const historyModel = model('masar_migrations', { migration: f.string().unique(), ranAt: f.date() })
const lockModel = model('masar_locks', { name: f.string().unique(), expiresAt: f.date() })
// One copy per connection: the kernel never registers these, they are created on demand.
const on = <M extends Model<any, any>>(base: M, connection: string): M => ({ ...base, store: connection })

async function prepare(connection: string) {
  await (await getAdapter(connection)).sync([on(historyModel, connection), on(lockModel, connection)], connection)
}

async function ran(connection: string): Promise<Set<string>> {
  return new Set((await db(on(historyModel, connection)).all()).map((row) => row.migration))
}

export async function pendingMigrations(planned: PlannedMigration[]): Promise<PlannedMigration[]> {
  const pending: PlannedMigration[] = []
  for (const connection of new Set(planned.map((p) => p.connection))) {
    await prepare(connection)
    const done = await ran(connection)
    pending.push(...planned.filter((p) => p.connection === connection && !done.has(p.id)))
  }
  return pending
}

/** A lock row with a unique name, so several servers deploying at once run each migration once. */
async function withLock<T>(connection: string, fn: () => Promise<T>): Promise<T> {
  const locks = db(on(lockModel, connection))
  const deadline = Date.now() + 120_000
  while (true) {
    await locks.where({ name: 'migrate', expiresAt: { lt: new Date().toISOString() } }).deleteAll()
    try {
      await locks.create({ name: 'migrate', expiresAt: new Date(Date.now() + 10 * 60_000).toISOString() })
      break
    } catch (error) {
      if (!(await locks.where({ name: 'migrate' }).exists())) throw error
      if (Date.now() > deadline) {
        throw new MasarError(`Another process has been migrating "${connection}" for over 2 minutes`, {
          hint: 'Wait for it to finish. If it crashed, the lock expires 10 minutes after it was taken (or delete the row in masar_locks).',
        })
      }
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
  }
  try {
    return await fn()
  } finally {
    await locks.where({ name: 'migrate' }).deleteAll()
  }
}

/** Run pending migrations in order. Each runs in a transaction on SQL drivers. Returns the ids it ran. */
export async function runMigrations(planned: PlannedMigration[], sync: () => Promise<unknown>): Promise<string[]> {
  const done: string[] = []
  for (const connection of new Set(planned.map((p) => p.connection))) {
    await prepare(connection)
    await withLock(connection, async () => {
      const already = await ran(connection)
      for (const item of planned.filter((p) => p.connection === connection && !already.has(p.id))) {
        const adapter = await getAdapter(connection)
        const run = async () => {
          const current = await getAdapter(connection)
          const alter = (change: SchemaChange) => current.alter(change)
          await item.migration.up({
            driver: adapter.driver,
            renameField: (table, from, to) => alter({ kind: 'renameField', table, from, to }),
            dropField: (table, field) => alter({ kind: 'dropField', table, field }),
            renameTable: (from, to) => alter({ kind: 'renameTable', from, to }),
            dropTable: (table) => alter({ kind: 'dropTable', table }),
            sync: async () => void (await sync()),
            sql: async (query, params) => {
              if (!current.execute) throw new MasarError('m.sql() needs a SQL database', { hint: 'On MongoDB use db() or m.renameField/dropField.' })
              return current.execute(query, params)
            },
          })
          await db(on(historyModel, connection)).create({ migration: item.id, ranAt: new Date().toISOString() })
        }
        try {
          // MongoDB cannot change collections inside a transaction, so its migrations run without one.
          if (adapter.driver === 'mongodb') await run()
          else await transaction(run, { store: connection })
        } catch (error) {
          throw new MasarError(`Migration ${item.id} failed${adapter.driver === 'mongodb' ? '' : ' and was rolled back'}`, {
            hint: error instanceof Error ? `${error.message}. Fix the migration and run masar migrate again.` : 'Fix the migration and run masar migrate again.',
            cause: error,
          })
        }
        done.push(item.id)
      }
    })
  }
  return done
}
