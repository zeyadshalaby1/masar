import { MasarError, NotFoundError } from '../errors'
import type { Adapter, Condition, Operator, QuerySpec } from './adapters/types'
import { uuidv7 } from './id'
import { allFields, type Field, type Insert, type Model, type Row, type Shape, type Update } from './model'
import { connectionOf, getAdapter } from './registry'
import { checkRules, isIssued, storage, storageConfig, type FileRules, type StoredFile } from '../storage'

type Ops<T> = {
  eq?: T | null
  ne?: T | null
  gt?: T
  gte?: T
  lt?: T
  lte?: T
  in?: T[]
  contains?: string
}

/** Equality by default; pass an object of operators for anything else. */
export type Where<S extends Shape> = {
  [K in keyof Row<S>]?: Row<S>[K] | Ops<NonNullable<Row<S>[K]>>
}

export interface Paginated<T> {
  data: T[]
  total: number
  page: number
  perPage: number
  pages: number
}

const OPERATORS = new Set<Operator>(['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in', 'contains'])
type AnyField = Field<any, boolean, boolean, any>

function fieldsHint(model: Model) {
  return `Fields of ${model.table}: ${Object.keys(allFields(model)).join(', ')}.`
}

function requireField(model: Model, key: string, where: string): AnyField {
  const field = allFields(model)[key]
  if (!field) throw new MasarError(`Unknown field "${key}" in ${where} on ${model.table}`, { hint: fieldsHint(model) })
  return field
}

function isOperatorObject(value: unknown, field: AnyField): value is Record<string, unknown> {
  if (field.kind === 'json' || typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const keys = Object.keys(value)
  return keys.length > 0 && keys.every((k) => OPERATORS.has(k as Operator))
}

function normalizeWhere(model: Model, where: Record<string, unknown>): Condition[] {
  const conditions: Condition[] = []
  for (const [key, value] of Object.entries(where)) {
    if (value === undefined) continue
    const field = requireField(model, key, 'where()')
    if (!isOperatorObject(value, field)) {
      conditions.push({ field: key, op: 'eq', value: value instanceof Date ? value.toISOString() : value })
      continue
    }
    for (const [op, operand] of Object.entries(value)) {
      if (operand === undefined) continue
      if (op === 'contains' && field.kind !== 'string' && field.kind !== 'text') {
        throw new MasarError(`"contains" only works on text fields (${model.table}.${key} is ${field.kind})`)
      }
      if (op === 'in' && !Array.isArray(operand)) {
        throw new MasarError(`"in" needs an array for ${model.table}.${key}`, { hint: `Example: where({ ${key}: { in: [a, b] } })` })
      }
      conditions.push({ field: key, op: op as Operator, value: operand })
    }
  }
  return conditions
}

/** Validate and normalize one value before it is written. */
function checkValue(model: Model, key: string, field: AnyField, value: unknown): unknown {
  const label = `${model.table}.${key}`
  if (value === null || value === undefined) {
    if (field.meta.optional) return null
    throw new MasarError(`${label} cannot be empty`, {
      hint: `Pass a value for ${key}, or mark it .optional() in schema.ts.`,
      status: 422,
    })
  }
  const fail = (expected: string): never => {
    throw new MasarError(`${label} must be ${expected}, got ${JSON.stringify(value)}`, { status: 422 })
  }
  switch (field.kind) {
    case 'string':
    case 'text':
    case 'ref':
      if (typeof value !== 'string') fail('a string')
      if (field.meta.values && !field.meta.values.includes(value as string)) fail(`one of ${field.meta.values.join(', ')}`)
      return value
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) ? value : fail('a number')
    case 'int':
      return Number.isInteger(value) ? value : fail('a whole number')
    case 'boolean':
      return typeof value === 'boolean' ? value : fail('true or false')
    case 'date': {
      const date = value instanceof Date ? value : typeof value === 'string' ? new Date(value) : null
      if (!date || Number.isNaN(date.getTime())) fail('a date (ISO string or Date)')
      return date!.toISOString()
    }
    case 'json':
      if (field.meta.file) return checkFiles(model, key, field.meta.file, value)
      return value
  }
}

/** File fields only accept references Masar issued, within the field's rules. */
function checkFiles(model: Model, key: string, rules: FileRules & { many?: boolean }, value: unknown): unknown {
  const list = rules.many ? value : [value]
  if (!Array.isArray(list)) throw new MasarError(`${model.table}.${key} must be a list of files`, { status: 422 })
  for (const file of list) {
    if (!isIssued(file)) {
      throw new MasarError(`${model.table}.${key} is not a file uploaded through Masar`, {
        status: 422,
        hint: 'Upload with uploadFile() / <FileInput> (or storage().put() on the server) and save the object it returns as is.',
      })
    }
    checkRules({ ...rules, disk: undefined }, file, key)
    const disk = rules.disk ?? storageConfig().default
    if (file.disk !== disk) throw new MasarError(`${model.table}.${key} must be stored on disk "${disk}"`, { status: 422 })
  }
  return value
}

/** Files referenced by `row` in file fields, keyed by path. */
export function filesOf(model: Model, row: Record<string, unknown> | null | undefined): Map<string, StoredFile> {
  const files = new Map<string, StoredFile>()
  if (!row) return files
  for (const [key, field] of Object.entries(model.fields)) {
    if (!field.meta.file) continue
    const value = row[key]
    for (const file of (Array.isArray(value) ? value : [value]) as (StoredFile | null)[]) {
      if (file && typeof file === 'object' && file.path) files.set(`${file.disk}:${file.path}`, file)
    }
  }
  return files
}

/** Delete files that `before` referenced and `after` no longer does. Storage errors never fail the write. */
async function removeOrphans(model: Model, before: Record<string, unknown> | null, after: Record<string, unknown> | null) {
  const kept = filesOf(model, after)
  for (const [key, file] of filesOf(model, before)) {
    if (kept.has(key)) continue
    await storage(file.disk).delete(file).catch(() => {})
  }
}

function prepareInsert(model: Model, data: Record<string, unknown>): Record<string, unknown> {
  for (const key of Object.keys(data)) {
    if (!(key in model.fields) && key !== 'id') {
      throw new MasarError(`Unknown field "${key}" passed to create() on ${model.table}`, { hint: fieldsHint(model) })
    }
  }
  const now = new Date().toISOString()
  const row: Record<string, unknown> = { id: typeof data.id === 'string' ? data.id : uuidv7() }
  for (const [key, field] of Object.entries(model.fields)) {
    let value = data[key]
    if (value === undefined && 'default' in field.meta) {
      const fallback = field.meta.default
      value = typeof fallback === 'function' ? fallback() : fallback
    }
    row[key] = checkValue(model, key, field, value)
  }
  row.createdAt = now
  row.updatedAt = now
  return row
}

function prepareUpdate(model: Model, data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue
    if (key === 'id' || key === 'createdAt' || key === 'updatedAt') continue
    const field = model.fields[key]
    if (!field) throw new MasarError(`Unknown field "${key}" passed to update() on ${model.table}`, { hint: fieldsHint(model) })
    out[key] = checkValue(model, key, field, value)
  }
  out.updatedAt = new Date().toISOString()
  return out
}

type Simplify<T> = { [K in keyof T]: T[K] } & {}

/** What with() accepts per key: a model, a query on it (filters, order, nested with), or either plus the ref field. */
export type Relation = Model<any, any> | Query<any, any, any> | readonly [Model<any, any> | Query<any, any, any>, string]

type Target<V> = V extends readonly [infer X, any] ? X : V
type TableOf<X> = X extends Query<any, infer T, any> ? T : X extends Model<any, infer T> ? T : never
type RowFrom<X> = X extends Query<infer S, any, infer L> ? Simplify<Row<S> & L> : X extends Model<infer S, any> ? Row<S> : never
/** Tables that fields of S point to with f.ref(). */
type RefTargets<S extends Shape> = { [K in keyof S]: S[K] extends Field<any, any, any, infer R> ? R : never }[keyof S]
/** One related row when this model holds the ref (belongs to), a list when the other model does (has many). */
type IsOne<S extends Shape, V> = V extends readonly [any, infer F]
  ? F extends keyof S ? true : false
  : TableOf<V> extends RefTargets<S> ? true : false
export type Loaded<S extends Shape, V> = IsOne<S, V> extends true ? RowFrom<Target<V>> | null : RowFrom<Target<V>>[]

interface PlannedRelation {
  key: string
  target: Query<any, any, any>
  field?: string
}

// Keeps IN lists well under every driver's parameter limit.
const CHUNK = 1000

/** A read query. Every method returns a new query, so queries can be reused. */
export class Query<S extends Shape, T extends string = string, L = {}> {
  declare readonly _table: T
  declare readonly _loaded: L

  constructor(
    protected readonly model: Model<S, T>,
    protected readonly spec: QuerySpec = { where: [], order: [] },
    protected readonly relations: PlannedRelation[] = [],
  ) {}

  protected adapter(): Promise<Adapter> {
    return getAdapter(connectionOf(this.model))
  }

  protected next(spec: Partial<QuerySpec>): Query<S, T, L> {
    return new Query(this.model, { ...this.spec, ...spec }, this.relations)
  }

  where(where: Where<S>): Query<S, T, L> {
    return this.next({ where: [...this.spec.where, ...normalizeWhere(this.model, where as Record<string, unknown>)] })
  }

  /** Rows matching at least one of the conditions: whereAny([{ title: { contains: q } }, { email: { contains: q } }]) */
  whereAny(conditions: Where<S>[]): Query<S, T, L> {
    const groups = conditions.map((w) => normalizeWhere(this.model, w as Record<string, unknown>))
    return this.next({ where: [...this.spec.where, { field: '', op: 'any', value: groups }] })
  }

  orderBy(field: keyof Row<S> & string, direction: 'asc' | 'desc' = 'asc'): Query<S, T, L> {
    requireField(this.model, field, 'orderBy()')
    return this.next({ order: [...this.spec.order, [field, direction]] })
  }

  /** Newest first (by createdAt unless you pass another field). */
  latest(field: keyof Row<S> & string = 'createdAt'): Query<S, T, L> {
    return this.orderBy(field, 'desc')
  }

  oldest(field: keyof Row<S> & string = 'createdAt'): Query<S, T, L> {
    return this.orderBy(field, 'asc')
  }

  limit(count: number): Query<S, T, L> {
    return this.next({ limit: count })
  }

  offset(count: number): Query<S, T, L> {
    return this.next({ offset: count })
  }

  /**
   * Load related rows in one extra query per relation (no N+1), linked by f.ref() fields:
   *
   *   db(lessons).with({ course: courses })                       // lesson.course: row | null
   *   db(courses).with({ lessons: db(lessons).oldest() })         // course.lessons: row[]
   *   db(courses).with({ students: db(enrollments).with({ user: users }) })
   *   db(reviews).with({ reviewer: [users, 'reviewerId'] })       // when two fields point to users
   */
  with<const R extends Record<string, Relation>>(relations: R): Query<S, T, Simplify<L & { [K in keyof R]: Loaded<S, R[K]> }>> {
    const planned = Object.entries(relations).map(([key, value]): PlannedRelation => {
      const [target, field] = Array.isArray(value) ? value : [value]
      if (key in allFields(this.model)) {
        throw new MasarError(`with({ ${key} }) on ${this.model.table} clashes with the field "${key}"`, {
          hint: `Name the relation differently, e.g. with({ ${key.replace(/Id$/, '')}Row: ... }).`,
        })
      }
      return { key, target: target instanceof Query ? target : new Query(target as Model), field }
    })
    return new Query(this.model, this.spec, [...this.relations, ...planned]) as never
  }

  async all(): Promise<Simplify<Row<S> & L>[]> {
    const rows = (await (await this.adapter()).select(this.model, this.spec)) as Record<string, unknown>[]
    for (const relation of this.relations) await this.load(rows, relation)
    return rows as never
  }

  async first(): Promise<Simplify<Row<S> & L> | null> {
    return (await this.limit(1).all())[0] ?? null
  }

  async firstOrFail(): Promise<Simplify<Row<S> & L>> {
    const row = await this.first()
    if (!row) throw new NotFoundError(`No matching row in ${this.model.table}`)
    return row
  }

  find(id: string): Promise<Simplify<Row<S> & L> | null> {
    return this.where({ id } as Where<S>).first()
  }

  async findOrFail(id: string): Promise<Simplify<Row<S> & L>> {
    const row = await this.find(id)
    if (!row) throw new NotFoundError(`No row in ${this.model.table} with id "${id}"`)
    return row
  }

  findBy(where: Where<S>): Promise<Simplify<Row<S> & L> | null> {
    return this.where(where).first()
  }

  async count(): Promise<number> {
    return (await this.adapter()).count(this.model, { ...this.spec, order: [] })
  }

  async exists(): Promise<boolean> {
    return (await this.count()) > 0
  }

  async paginate(page = 1, perPage = 15): Promise<Paginated<Simplify<Row<S> & L>>> {
    const current = Math.max(1, Math.trunc(page) || 1)
    const size = Math.min(Math.max(1, Math.trunc(perPage) || 15), 500)
    const [total, data] = await Promise.all([this.count(), this.limit(size).offset((current - 1) * size).all()])
    return { data, total, page: current, perPage: size, pages: Math.max(1, Math.ceil(total / size)) }
  }

  async updateAll(data: Update<S>): Promise<number> {
    return (await this.adapter()).update(this.model, this.spec, prepareUpdate(this.model, data as Record<string, unknown>))
  }

  async deleteAll(): Promise<number> {
    return (await this.adapter()).delete(this.model, this.spec)
  }

  /** Decide which side holds the ref, then fetch the related rows with IN (...) and attach them. */
  private async load(rows: Record<string, unknown>[], { key, target, field }: PlannedRelation) {
    const source = this.model
    const other = target.model
    const refsTo = (m: Model, table: string) => Object.entries(m.fields).filter(([, f]) => f.meta.ref === table).map(([k]) => k)
    let mode: 'one' | 'many'
    let link: string
    if (field) {
      if (field in source.fields) [mode, link] = ['one', field]
      else if (field in other.fields) [mode, link] = ['many', field]
      else {
        throw new MasarError(`with({ ${key}: [..., '${field}'] }): neither ${source.table} nor ${other.table} has "${field}"`, {
          hint: `Use a field of ${source.table} that refers to ${other.table}, or a field of ${other.table} that refers to ${source.table}.`,
        })
      }
    } else {
      const own = refsTo(source, other.table)
      const theirs = own.length === 0 ? refsTo(other, source.table) : []
      const found = own.length > 0 ? own : theirs
      if (found.length !== 1) {
        throw new MasarError(
          found.length === 0
            ? `${source.table} and ${other.table} are not linked, so with({ ${key} }) cannot load anything`
            : `${found.length === own.length ? source.table : other.table} has ${found.length} fields pointing to ${found === own ? other.table : source.table}: ${found.join(', ')}`,
          {
            hint:
              found.length === 0
                ? `Add f.ref('${other.table}') to ${source.table} (belongs to) or f.ref('${source.table}') to ${other.table} (has many) in schema.ts.`
                : `Say which one: with({ ${key}: [${other.table}, '${found[0]}'] }).`,
          },
        )
      }
      ;[mode, link] = [own.length > 0 ? 'one' : 'many', found[0]!]
    }

    const ids = [...new Set(rows.map((row) => (mode === 'one' ? row[link] : row.id)).filter((v): v is string => typeof v === 'string'))]
    const related: Record<string, unknown>[] = []
    for (let i = 0; i < ids.length; i += CHUNK) {
      const where = { [mode === 'one' ? 'id' : link]: { in: ids.slice(i, i + CHUNK) } }
      related.push(...((await target.where(where as never).all()) as Record<string, unknown>[]))
    }

    if (mode === 'one') {
      const byId = new Map(related.map((row) => [row.id, row]))
      for (const row of rows) row[key] = byId.get(row[link]) ?? null
    } else {
      const groups = new Map<unknown, Record<string, unknown>[]>()
      for (const row of related) groups.set(row[link], [...(groups.get(row[link]) ?? []), row])
      for (const row of rows) row[key] = groups.get(row.id) ?? []
    }
  }
}

/** db(model): the full table API, reads plus writes. */
export class Table<S extends Shape, T extends string = string> extends Query<S, T> {
  async create(data: Insert<S>): Promise<Row<S>> {
    const row = prepareInsert(this.model, data as Record<string, unknown>)
    await (await this.adapter()).insert(this.model, row)
    return row as Row<S>
  }

  async createMany(rows: Insert<S>[]): Promise<Row<S>[]> {
    const created: Row<S>[] = []
    for (const data of rows) created.push(await this.create(data))
    return created
  }

  /** Replaced files (f.file fields) are deleted from storage after the update. */
  async update(id: string, data: Update<S>): Promise<Row<S>> {
    const hasFiles = Object.values(this.model.fields).some((f) => f.meta.file)
    const before = hasFiles ? await new Query(this.model).find(id) : null
    const changed = await new Query(this.model).where({ id } as Where<S>).updateAll(data)
    if (changed === 0) throw new NotFoundError(`No row in ${this.model.table} with id "${id}"`)
    const after = await this.findOrFail(id)
    if (hasFiles) await removeOrphans(this.model, before as never, after as never)
    return after
  }

  /** Returns true when a row was deleted. Its files are deleted from storage too. */
  async delete(id: string): Promise<boolean> {
    const hasFiles = Object.values(this.model.fields).some((f) => f.meta.file)
    const before = hasFiles ? await new Query(this.model).find(id) : null
    const deleted = (await new Query(this.model).where({ id } as Where<S>).deleteAll()) > 0
    if (deleted && hasFiles) await removeOrphans(this.model, before as never, null)
    return deleted
  }

  /** The driver handle, for anything the query API does not cover. */
  async raw<T = unknown>(): Promise<T> {
    return (await this.adapter()).raw() as T
  }
}
