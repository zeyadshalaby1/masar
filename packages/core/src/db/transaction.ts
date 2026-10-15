import { AsyncLocalStorage } from 'node:async_hooks'
import { MasarError } from '../errors'
import type { Adapter } from './adapters/types'
import { databaseConfig, getAdapter } from './registry'

interface OpenTransaction {
  connection: string
  adapter: Adapter
}

const scope = globalThis as typeof globalThis & { __masarTx?: AsyncLocalStorage<OpenTransaction> }
const storage = (scope.__masarTx ??= new AsyncLocalStorage<OpenTransaction>())

export function currentTransaction(): OpenTransaction | undefined {
  return storage.getStore()
}

/**
 * Run several writes as one unit: all of them are saved, or none.
 * Every db() call inside uses the transaction, including calls made by actions:
 *
 *   await transaction(async () => {
 *     await db(enrollments).create({ userId, courseId })
 *     await db(wallets).update(wallet.id, { balance: wallet.balance - price })
 *   })
 *
 * Throwing inside rolls everything back and rethrows. One connection per
 * transaction (the default one, or `store`); a nested call joins the outer one.
 */
export async function transaction<T>(fn: () => Promise<T>, options: { store?: string } = {}): Promise<T> {
  const connection = options.store ?? databaseConfig().default
  const open = storage.getStore()
  if (open) {
    if (open.connection === connection) return fn()
    throw crossStore(open.connection, connection)
  }
  const adapter = await getAdapter(connection)
  return adapter.transaction((tx) => storage.run({ connection, adapter: tx }, fn))
}

export function crossStore(open: string, other: string) {
  return new MasarError(`A transaction on "${open}" touched the "${other}" connection`, {
    hint: `Transactions cover one connection. Move the "${other}" work outside transaction(), or pass { store: '${other}' } to a separate one.`,
  })
}
