import { MasarError } from '../../errors'
import { importDriver } from './driver'
import { type Dialect, type Executor, SqlAdapter, sqlString } from './sql'

/** The slice of postgres.js that Masar uses (kept local so apps without Postgres don't need its types). */
interface PostgresSql {
  unsafe(query: string, params?: unknown[]): Promise<Record<string, unknown>[] & { count: number }>
  end(options?: { timeout?: number }): Promise<void>
  begin<T>(fn: (tx: PostgresSql) => Promise<T>): Promise<T>
}
type PostgresFactory = (url: string, options: { max: number; onnotice: () => void }) => PostgresSql

const dialect: Dialect = {
  name: 'postgres',
  placeholder(index, field) {
    if (field.kind === 'json') return `$${index}::jsonb`
    if (field.kind === 'date') return `$${index}::timestamptz`
    return `$${index}`
  },
  columnType(field) {
    switch (field.kind) {
      case 'number':
        return 'double precision'
      case 'int':
        return 'integer'
      case 'boolean':
        return 'boolean'
      case 'json':
        return 'jsonb'
      case 'date':
        return 'timestamptz'
      default:
        return 'text'
    }
  },
  encode(field, value) {
    if (value === undefined || value === null) return null
    // postgres.js serializes jsonb parameters itself (the ::jsonb cast tells it the type)
    if (field.kind === 'date' && value instanceof Date) return value.toISOString()
    return value
  },
  decode(field, value) {
    if (value === null || value === undefined) return null
    if (field.kind === 'date') return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString()
    if (field.kind === 'int' || field.kind === 'number') return Number(value)
    return value
  },
  literal(field, value) {
    if (field.kind === 'boolean') return value ? 'TRUE' : 'FALSE'
    if (typeof value === 'number') return String(value)
    if (field.kind === 'json') return `${sqlString(JSON.stringify(value))}::jsonb`
    return sqlString(String(value))
  },
  like: 'ILIKE',
  count: 'COUNT(*)::int',
}

/** PostgreSQL through postgres.js (`pnpm add postgres`). */
export async function createPostgresAdapter(url: string, max = 10) {
  let postgres: PostgresFactory
  try {
    postgres = (await importDriver('postgres')).default as PostgresFactory
  } catch (cause) {
    throw new MasarError('The "postgres" package is not installed', {
      hint: 'Run `pnpm add postgres` in your project, then restart masar.',
      cause,
    })
  }
  const sql = postgres(url, { max, onnotice: () => {} })

  return new SqlAdapter('postgres', dialect, executorFor(sql, () => sql.end({ timeout: 5 })))
}

// The pool and a transaction share the same query API; only close and nesting differ.
function executorFor(sql: PostgresSql, close: () => Promise<void>): Executor {
  return {
    async all(query, params) {
      const rows = await sql.unsafe(query, params)
      return [...rows] as Record<string, unknown>[]
    },
    async run(query, params) {
      const result = await sql.unsafe(query, params)
      return result.count
    },
    async columns(table) {
      const rows = await sql.unsafe(
        'SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1',
        [table],
      )
      return rows.map((r) => String(r.column_name))
    },
    close,
    raw: () => sql,
    transaction: (fn) => sql.begin((tx) => fn(executorFor(tx, async () => {}))),
  }
}
