import { MasarError } from '../../errors'
import { importDriver } from './driver'
import { allFields, type Model } from '../model'
import type { Adapter, Condition, QuerySpec, SyncReport } from './types'

/* The slice of the MongoDB driver that Masar uses (local, so apps without Mongo don't need its types). */
type Document = Record<string, any>
type Filter = Document
type Sort = Record<string, 1 | -1>
interface ClientSession {
  withTransaction<T>(fn: () => Promise<T>): Promise<unknown>
  endSession(): Promise<void>
}
/** Passed to every operation inside a transaction; {} outside. */
type Options = { session?: ClientSession }
interface Cursor {
  sort(sort: Sort): Cursor
  skip(n: number): Cursor
  limit(n: number): Cursor
  toArray(): Promise<Document[]>
}
interface Collection {
  find(filter: Filter, options?: Options): Cursor
  countDocuments(filter: Filter, options?: Options): Promise<number>
  insertOne(doc: Document, options?: Options): Promise<unknown>
  updateMany(filter: Filter, update: Document, options?: Options): Promise<{ matchedCount: number }>
  deleteMany(filter: Filter, options?: Options): Promise<{ deletedCount: number }>
  dropIndex(name: string): Promise<unknown>
  rename(to: string): Promise<unknown>
  drop(): Promise<boolean>
  createIndex(spec: Document, options: Document): Promise<string>
}
interface Db {
  collection(name: string): Collection
  listCollections(filter: Document, options: Document): { toArray(): Promise<{ name: string }[]> }
  createCollection(name: string): Promise<unknown>
}
interface MongoClient {
  connect(): Promise<unknown>
  db(name?: string): Db
  startSession(): ClientSession
  close(): Promise<void>
}

const key = (field: string) => (field === 'id' ? '_id' : field)
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function condition(c: Condition): Document {
  if (c.op === 'any') {
    const groups = c.value as Condition[][]
    return { $or: groups.length ? groups.map((g) => (g.length ? { $and: g.map(condition) } : {})) : [{ _id: { $exists: false } }] }
  }
  const k = key(c.field)
  switch (c.op) {
    case 'eq':
      return { [k]: c.value }
    case 'ne':
      return { [k]: { $ne: c.value } }
    case 'gt':
      return { [k]: { $gt: c.value } }
    case 'gte':
      return { [k]: { $gte: c.value } }
    case 'lt':
      return { [k]: { $lt: c.value } }
    case 'lte':
      return { [k]: { $lte: c.value } }
    case 'in':
      return { [k]: { $in: c.value } }
    case 'contains':
      return { [k]: { $regex: escapeRegex(String(c.value)), $options: 'i' } }
  }
}

function filter(spec: QuerySpec): Filter {
  if (spec.where.length === 0) return {}
  if (spec.where.length === 1) return condition(spec.where[0])
  return { $and: spec.where.map(condition) }
}

function decode(model: Model, doc: Document): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const field of Object.keys(allFields(model))) {
    out[field] = (field === 'id' ? doc._id : doc[field]) ?? null
  }
  return out
}

/** MongoDB through the official driver (`pnpm add mongodb`). */
export async function createMongoAdapter(url: string, database?: string): Promise<Adapter> {
  let mod: { MongoClient: new (url: string) => MongoClient }
  try {
    mod = (await importDriver('mongodb')) as typeof mod
  } catch (cause) {
    throw new MasarError('The "mongodb" package is not installed', {
      hint: 'Run `pnpm add mongodb` in your project, then restart masar.',
      cause,
    })
  }
  const client: MongoClient = new mod.MongoClient(url)
  await client.connect()
  const db: Db = client.db(database)
  const collection = (model: Model) => db.collection(model.table)
  return mongoAdapter(client, db, collection, {})
}

function mongoAdapter(client: MongoClient, db: Db, collection: (model: Model) => Collection, options: Options): Adapter {
  return {
    driver: 'mongodb',
    async select(model, spec) {
      let cursor = collection(model).find(filter(spec), options)
      if (spec.order.length > 0) {
        const sort: Sort = Object.fromEntries(spec.order.map(([f, d]) => [key(f), d === 'desc' ? -1 : 1]))
        cursor = cursor.sort(sort)
      }
      if (spec.offset !== undefined) cursor = cursor.skip(spec.offset)
      if (spec.limit !== undefined) cursor = cursor.limit(spec.limit)
      const docs = await cursor.toArray()
      return docs.map((doc) => decode(model, doc))
    },
    async count(model, spec) {
      return collection(model).countDocuments(filter(spec), options)
    },
    async insert(model, row) {
      const { id, ...rest } = row
      await collection(model).insertOne({ _id: id, ...rest }, options)
    },
    async update(model, spec, data) {
      const result = await collection(model).updateMany(filter(spec), { $set: data }, options)
      return result.matchedCount
    },
    async delete(model, spec) {
      const result = await collection(model).deleteMany(filter(spec), options)
      return result.deletedCount
    },
    async sync(models, connection): Promise<SyncReport> {
      const report: SyncReport = { connection, driver: 'mongodb', created: [], altered: [], warnings: [] }
      const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name))
      for (const model of models) {
        if (!existing.has(model.table)) {
          await db.createCollection(model.table)
          report.created.push(model.table)
        }
        for (const [field, def] of Object.entries(model.fields)) {
          if (!def.meta.unique && !def.meta.index) continue
          await collection(model).createIndex(
            { [field]: 1 },
            { unique: Boolean(def.meta.unique), name: `${field}_${def.meta.unique ? 'unique' : 'index'}` },
          )
        }
        await collection(model).createIndex({ createdAt: 1 }, { name: 'createdAt_index' })
      }
      return report
    },
    async alter(change) {
      const quiet = (p: Promise<unknown>) => p.catch(() => {})
      switch (change.kind) {
        case 'renameField': {
          const c = db.collection(change.table)
          for (const kind of ['unique', 'index']) await quiet(c.dropIndex(`${change.from}_${kind}`))
          await c.updateMany({}, { $rename: { [change.from]: change.to } })
          return
        }
        case 'dropField': {
          const c = db.collection(change.table)
          for (const kind of ['unique', 'index']) await quiet(c.dropIndex(`${change.field}_${kind}`))
          await c.updateMany({}, { $unset: { [change.field]: '' } })
          return
        }
        case 'renameTable':
          await db.collection(change.from).rename(change.to)
          return
        case 'dropTable':
          await quiet(db.collection(change.table).drop())
      }
    },
    async transaction(fn) {
      const session = client.startSession()
      try {
        let result: unknown
        await session.withTransaction(async () => {
          result = await fn(mongoAdapter(client, db, collection, { session }))
        })
        return result as never
      } catch (error) {
        if (error instanceof Error && /replica set|Transaction numbers/i.test(error.message)) {
          throw new MasarError('MongoDB transactions need a replica set', {
            hint: 'Run MongoDB as a replica set (a single-node one is fine: mongod --replSet rs0, then rs.initiate()), or use Atlas.',
            cause: error,
          })
        }
        throw error
      } finally {
        await session.endSession()
      }
    },
    raw: () => db,
    close: () => client.close(),
  }
}
