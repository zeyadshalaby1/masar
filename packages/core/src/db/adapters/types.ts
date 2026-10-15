import type { Model } from '../model'

export type Operator = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'contains' | 'any'

/** A normalized condition: field, operator, value. For 'any', value is Condition[][] (OR of AND groups) and field is ''. */
export interface Condition {
  field: string
  op: Operator
  value: unknown
}

export interface QuerySpec {
  where: Condition[]
  order: [field: string, direction: 'asc' | 'desc'][]
  limit?: number
  offset?: number
}

export interface SyncReport {
  connection: string
  driver: string
  created: string[]
  altered: string[]
  warnings: string[]
}

/** Destructive schema changes, only run from migrations. Names are model field names (camelCase). */
export type SchemaChange =
  | { kind: 'renameField'; table: string; from: string; to: string }
  | { kind: 'dropField'; table: string; field: string }
  | { kind: 'renameTable'; from: string; to: string }
  | { kind: 'dropTable'; table: string }

/**
 * What every database driver implements. Rows go in and come out as plain
 * JS objects keyed by field name; adapters handle naming and encoding.
 */
export interface Adapter {
  readonly driver: 'sqlite' | 'postgres' | 'mongodb'
  select(model: Model, spec: QuerySpec): Promise<Record<string, unknown>[]>
  count(model: Model, spec: QuerySpec): Promise<number>
  insert(model: Model, row: Record<string, unknown>): Promise<void>
  update(model: Model, spec: QuerySpec, data: Record<string, unknown>): Promise<number>
  delete(model: Model, spec: QuerySpec): Promise<number>
  sync(models: Model[], connection: string): Promise<SyncReport>
  alter(change: SchemaChange): Promise<void>
  /** Raw SQL (SQL drivers only). Placeholders are ? on SQLite and $1 on Postgres. */
  execute?(sql: string, params?: unknown[]): Promise<Record<string, unknown>[]>
  /** Run fn with an adapter bound to one database transaction: commit on return, roll back on throw. */
  transaction<T>(fn: (tx: Adapter) => Promise<T>): Promise<T>
  /** The underlying driver handle (DatabaseSync, postgres.js sql, or MongoDB Db). */
  raw(): unknown
  close(): Promise<void>
}
