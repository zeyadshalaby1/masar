import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { type Dialect, type Executor, SqlAdapter, sqlString } from './sql'

const dialect: Dialect = {
  name: 'sqlite',
  placeholder: () => '?',
  columnType(field) {
    switch (field.kind) {
      case 'number':
        return 'REAL'
      case 'int':
      case 'boolean':
        return 'INTEGER'
      default:
        return 'TEXT'
    }
  },
  encode(field, value) {
    if (value === undefined || value === null) return null
    if (field.kind === 'boolean') return value ? 1 : 0
    if (field.kind === 'json') return JSON.stringify(value)
    if (field.kind === 'date' && value instanceof Date) return value.toISOString()
    return value
  },
  decode(field, value) {
    if (value === null || value === undefined) return null
    if (field.kind === 'boolean') return Boolean(value)
    if (field.kind === 'json') return JSON.parse(String(value))
    if (field.kind === 'int' || field.kind === 'number') return Number(value)
    return value
  },
  literal(field, value) {
    if (field.kind === 'boolean') return value ? '1' : '0'
    if (typeof value === 'number') return String(value)
    if (field.kind === 'json') return sqlString(JSON.stringify(value))
    return sqlString(String(value))
  },
  like: 'LIKE',
  count: 'COUNT(*)',
}

/** SQLite through Node's built-in `node:sqlite` — nothing to install. */
export async function createSqliteAdapter(file: string) {
  const { DatabaseSync } = await import('node:sqlite')
  const path = file === ':memory:' ? file : resolve(file)
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const handle = new DatabaseSync(path)
  handle.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;')

  type Param = string | number | bigint | null | Uint8Array
  const direct: Executor = {
    async all(sql, params) {
      return handle.prepare(sql).all(...(params as Param[])) as Record<string, unknown>[]
    },
    async run(sql, params) {
      return Number(handle.prepare(sql).run(...(params as Param[])).changes)
    },
    async columns(table) {
      const rows = handle.prepare('SELECT name FROM pragma_table_info(?)').all(table) as { name: string }[]
      return rows.map((r) => r.name)
    },
    async close() {},
    raw: () => handle,
    transaction: (fn) => fn(direct),
  }

  // One handle serves every request, so while a transaction is open other queries
  // wait for it; otherwise they would run inside it (and commit or roll back with it).
  let busy: Promise<void> | undefined
  const idle = async () => {
    while (busy) await busy
  }
  const executor: Executor = {
    all: async (sql, params) => (await idle(), direct.all(sql, params)),
    run: async (sql, params) => (await idle(), direct.run(sql, params)),
    columns: async (table) => (await idle(), direct.columns(table)),
    async close() {
      await idle()
      handle.close()
    },
    raw: () => handle,
    async transaction(fn) {
      await idle()
      let release!: () => void
      busy = new Promise((resolve) => (release = resolve))
      try {
        handle.exec('BEGIN IMMEDIATE')
        try {
          const result = await fn(direct)
          handle.exec('COMMIT')
          return result
        } catch (error) {
          handle.exec('ROLLBACK')
          throw error
        }
      } finally {
        busy = undefined
        release()
      }
    },
  }
  return new SqlAdapter('sqlite', dialect, executor)
}
