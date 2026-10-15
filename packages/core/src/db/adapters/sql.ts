import { MasarError } from '../../errors'
import { allFields, type Field, type Model } from '../model'
import type { Adapter, Condition, QuerySpec, SchemaChange, SyncReport } from './types'

type AnyField = Field<any, boolean, boolean, any>

/** Runs SQL against one connection. */
export interface Executor {
  all(sql: string, params: unknown[]): Promise<Record<string, unknown>[]>
  /** Returns the number of affected rows. */
  run(sql: string, params: unknown[]): Promise<number>
  /** Column names of a table, or [] when the table does not exist. */
  columns(table: string): Promise<string[]>
  close(): Promise<void>
  raw(): unknown
  /** Run fn on an executor bound to one transaction (BEGIN … COMMIT, ROLLBACK on throw). */
  transaction<T>(fn: (tx: Executor) => Promise<T>): Promise<T>
}

/** The differences between SQL databases that Masar cares about. */
export interface Dialect {
  name: 'sqlite' | 'postgres'
  /** 1-based placeholder, optionally cast for the field type. */
  placeholder(index: number, field: AnyField): string
  columnType(field: AnyField): string
  encode(field: AnyField, value: unknown): unknown
  decode(field: AnyField, value: unknown): unknown
  literal(field: AnyField, value: unknown): string
  /** Case-insensitive LIKE. */
  like: string
  count: string
}

export const snake = (key: string) => key.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`)
export const quote = (name: string) => `"${name.replace(/"/g, '""')}"`
const escapeLike = (value: string) => value.replace(/[\\%_]/g, (m) => `\\${m}`)
export const sqlString = (value: string) => `'${value.replace(/'/g, "''")}'`

const MISSING_TABLE = /no such table: (\S+)|relation "([^"]+)" does not exist/

/** Turn "table missing" driver errors into a Masar error that says what to run. */
function explain<T>(promise: Promise<T>): Promise<T> {
  return promise.catch((error: unknown) => {
    const match = error instanceof Error ? error.message.match(MISSING_TABLE) : null
    if (!match) throw error
    throw new MasarError(`Table "${match[1] ?? match[2]}" does not exist yet`, {
      hint: 'Run `masar db:sync` (masar dev does it on start and when schema.ts changes).',
      cause: error,
    })
  })
}

export class SqlAdapter implements Adapter {
  private readonly exec: Executor

  constructor(
    readonly driver: 'sqlite' | 'postgres',
    private readonly dialect: Dialect,
    executor: Executor,
  ) {
    this.exec = {
      ...executor,
      all: (sql, params) => explain(executor.all(sql, params)),
      run: (sql, params) => explain(executor.run(sql, params)),
    }
  }

  private bind(params: unknown[], field: AnyField, value: unknown): string {
    params.push(this.dialect.encode(field, value))
    return this.dialect.placeholder(params.length, field)
  }

  private condition(model: Model, c: Condition, params: unknown[]): string {
    if (c.op === 'any') {
      const groups = c.value as Condition[][]
      if (groups.length === 0) return '1 = 0'
      return `(${groups.map((g) => (g.length ? `(${g.map((x) => this.condition(model, x, params)).join(' AND ')})` : '1 = 1')).join(' OR ')})`
    }
    const field = allFields(model)[c.field]
    const col = quote(snake(c.field))
    switch (c.op) {
      case 'eq':
        return c.value === null ? `${col} IS NULL` : `${col} = ${this.bind(params, field, c.value)}`
      case 'ne':
        return c.value === null
          ? `${col} IS NOT NULL`
          : `(${col} IS NULL OR ${col} <> ${this.bind(params, field, c.value)})`
      case 'gt':
        return `${col} > ${this.bind(params, field, c.value)}`
      case 'gte':
        return `${col} >= ${this.bind(params, field, c.value)}`
      case 'lt':
        return `${col} < ${this.bind(params, field, c.value)}`
      case 'lte':
        return `${col} <= ${this.bind(params, field, c.value)}`
      case 'in': {
        const values = c.value as unknown[]
        if (values.length === 0) return '1 = 0'
        return `${col} IN (${values.map((v) => this.bind(params, field, v)).join(', ')})`
      }
      case 'contains':
        return `${col} ${this.dialect.like} ${this.bind(params, field, `%${escapeLike(String(c.value))}%`)} ESCAPE '\\'`
    }
  }

  private where(model: Model, spec: QuerySpec, params: unknown[]): string {
    if (spec.where.length === 0) return ''
    return ` WHERE ${spec.where.map((c) => this.condition(model, c, params)).join(' AND ')}`
  }

  private tail(spec: QuerySpec): string {
    let sql = ''
    if (spec.order.length > 0) {
      sql += ` ORDER BY ${spec.order.map(([f, d]) => `${quote(snake(f))} ${d === 'desc' ? 'DESC' : 'ASC'}`).join(', ')}`
    }
    if (spec.limit !== undefined) sql += ` LIMIT ${Math.trunc(spec.limit)}`
    else if (spec.offset !== undefined && this.dialect.name === 'sqlite') sql += ' LIMIT -1'
    if (spec.offset !== undefined) sql += ` OFFSET ${Math.trunc(spec.offset)}`
    return sql
  }

  private decodeRow(model: Model, row: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    for (const [key, field] of Object.entries(allFields(model))) {
      out[key] = this.dialect.decode(field, row[snake(key)] ?? null)
    }
    return out
  }

  async select(model: Model, spec: QuerySpec) {
    const params: unknown[] = []
    const sql = `SELECT * FROM ${quote(model.table)}${this.where(model, spec, params)}${this.tail(spec)}`
    const rows = await this.exec.all(sql, params)
    return rows.map((row) => this.decodeRow(model, row))
  }

  async count(model: Model, spec: QuerySpec) {
    const params: unknown[] = []
    const sql = `SELECT ${this.dialect.count} AS n FROM ${quote(model.table)}${this.where(model, spec, params)}`
    const rows = await this.exec.all(sql, params)
    return Number(rows[0]?.n ?? 0)
  }

  async insert(model: Model, row: Record<string, unknown>) {
    const fields = allFields(model)
    const params: unknown[] = []
    const keys = Object.keys(row)
    const values = keys.map((k) => this.bind(params, fields[k], row[k]))
    const sql = `INSERT INTO ${quote(model.table)} (${keys.map((k) => quote(snake(k))).join(', ')}) VALUES (${values.join(', ')})`
    await this.exec.run(sql, params)
  }

  async update(model: Model, spec: QuerySpec, data: Record<string, unknown>) {
    const fields = allFields(model)
    const params: unknown[] = []
    const sets = Object.keys(data).map((k) => `${quote(snake(k))} = ${this.bind(params, fields[k], data[k])}`)
    const sql = `UPDATE ${quote(model.table)} SET ${sets.join(', ')}${this.where(model, spec, params)}`
    return this.exec.run(sql, params)
  }

  async delete(model: Model, spec: QuerySpec) {
    const params: unknown[] = []
    return this.exec.run(`DELETE FROM ${quote(model.table)}${this.where(model, spec, params)}`, params)
  }

  private columnSql(key: string, field: AnyField, mode: 'create' | 'add', report: SyncReport, table: string) {
    let sql = `${quote(snake(key))} ${this.dialect.columnType(field)}`
    const required = !field.meta.optional
    const hasStaticDefault = 'default' in field.meta && typeof field.meta.default !== 'function'
    if (mode === 'create') {
      if (required) sql += ' NOT NULL'
      return sql
    }
    if (required && hasStaticDefault) {
      sql += ` NOT NULL DEFAULT ${this.dialect.literal(field, field.meta.default)}`
    } else if (required) {
      report.warnings.push(
        `${table}.${key} was added as nullable because existing rows have no value. Fill it, then it is enforced by the app on create().`,
      )
    }
    return sql
  }

  async sync(models: Model[], connection: string): Promise<SyncReport> {
    const report: SyncReport = { connection, driver: this.driver, created: [], altered: [], warnings: [] }
    for (const model of models) {
      const table = quote(model.table)
      const existing = await this.exec.columns(model.table)
      const date = this.dialect.columnType(allFields(model).createdAt)
      if (existing.length === 0) {
        const columns = [
          `${quote('id')} ${this.dialect.columnType(allFields(model).id)} PRIMARY KEY`,
          ...Object.entries(model.fields).map(([k, f]) => this.columnSql(k, f, 'create', report, model.table)),
          `${quote('created_at')} ${date} NOT NULL`,
          `${quote('updated_at')} ${date} NOT NULL`,
        ]
        await this.exec.run(`CREATE TABLE IF NOT EXISTS ${table} (\n  ${columns.join(',\n  ')}\n)`, [])
        report.created.push(model.table)
      } else {
        const known = new Set(existing)
        for (const [key, field] of Object.entries(model.fields)) {
          if (known.has(snake(key))) continue
          await this.exec.run(`ALTER TABLE ${table} ADD COLUMN ${this.columnSql(key, field, 'add', report, model.table)}`, [])
          report.altered.push(`${model.table}.${key}`)
        }
        const expected = new Set(Object.keys(allFields(model)).map(snake))
        for (const column of existing) {
          if (!expected.has(column)) {
            report.warnings.push(`${model.table}.${column} exists in the database but not in the schema (left untouched).`)
          }
        }
      }
      for (const [key, field] of Object.entries(model.fields)) {
        if (!field.meta.unique && !field.meta.index) continue
        const kind = field.meta.unique ? 'unique' : 'index'
        const name = quote(`${model.table}_${snake(key)}_${kind}`)
        await this.exec.run(
          `CREATE ${field.meta.unique ? 'UNIQUE ' : ''}INDEX IF NOT EXISTS ${name} ON ${table} (${quote(snake(key))})`,
          [],
        )
      }
      await this.exec.run(
        `CREATE INDEX IF NOT EXISTS ${quote(`${model.table}_created_at_index`)} ON ${table} (${quote('created_at')})`,
        [],
      )
    }
    return report
  }

  execute(sql: string, params: unknown[] = []) {
    return this.exec.all(sql, params)
  }

  async alter(change: SchemaChange) {
    // Masar's own indexes are named after the column; drop them so sync recreates them under the new name.
    const dropIndexes = async (table: string, field: string) => {
      for (const kind of ['unique', 'index']) await this.exec.run(`DROP INDEX IF EXISTS ${quote(`${table}_${snake(field)}_${kind}`)}`, [])
    }
    switch (change.kind) {
      case 'renameField':
        await dropIndexes(change.table, change.from)
        await this.exec.run(`ALTER TABLE ${quote(change.table)} RENAME COLUMN ${quote(snake(change.from))} TO ${quote(snake(change.to))}`, [])
        return
      case 'dropField':
        await dropIndexes(change.table, change.field)
        await this.exec.run(`ALTER TABLE ${quote(change.table)} DROP COLUMN ${quote(snake(change.field))}`, [])
        return
      case 'renameTable':
        await this.exec.run(`ALTER TABLE ${quote(change.from)} RENAME TO ${quote(change.to)}`, [])
        return
      case 'dropTable':
        await this.exec.run(`DROP TABLE IF EXISTS ${quote(change.table)}`, [])
    }
  }

  transaction<T>(fn: (tx: Adapter) => Promise<T>): Promise<T> {
    return this.exec.transaction((tx) => fn(new SqlAdapter(this.driver, this.dialect, tx)))
  }

  raw() {
    return this.exec.raw()
  }

  close() {
    return this.exec.close()
  }
}
