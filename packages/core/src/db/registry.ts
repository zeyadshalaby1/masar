import type { ConnectionConfig, DatabaseConfig } from '../config/database'
import { MasarError } from '../errors'
import type { Model } from './model'
import type { Adapter } from './adapters/types'
import { crossStore, currentTransaction } from './transaction'

interface DbRegistry {
  config?: DatabaseConfig
  /** Adapters are cached by connection + config, so dev reloads reuse open connections. */
  adapters: Map<string, Promise<Adapter>>
}

const scope = globalThis as typeof globalThis & { __masarDb?: DbRegistry }
const registry: DbRegistry = (scope.__masarDb ??= { adapters: new Map() })

export function configureDatabase(config: DatabaseConfig) {
  registry.config = config
}

export function databaseConfig(): DatabaseConfig {
  if (!registry.config) {
    throw new MasarError('The database is not configured yet', {
      hint: 'db() works inside a running Masar app (masar dev / masar start). In scripts, boot the app first.',
    })
  }
  return registry.config
}

export function connectionOf(model: Model): string {
  return model.store ?? databaseConfig().default
}

async function connect(config: ConnectionConfig): Promise<Adapter> {
  switch (config.driver) {
    case 'sqlite': {
      const { createSqliteAdapter } = await import('./adapters/sqlite')
      return createSqliteAdapter(config.file)
    }
    case 'postgres': {
      const { createPostgresAdapter } = await import('./adapters/postgres')
      return createPostgresAdapter(config.url, config.max)
    }
    case 'mongodb': {
      const { createMongoAdapter } = await import('./adapters/mongodb')
      return createMongoAdapter(config.url, config.database)
    }
  }
}

export function getAdapter(connection: string): Promise<Adapter> {
  // Inside transaction(), queries on its connection go through it; others are a mistake.
  const open = currentTransaction()
  if (open) {
    if (open.connection === connection) return Promise.resolve(open.adapter)
    return Promise.reject(crossStore(open.connection, connection))
  }
  const config = databaseConfig().connections[connection]
  if (!config) {
    throw new MasarError(`Unknown database connection "${connection}"`, {
      hint: `Add it to src/config/database.ts, or use one of: ${Object.keys(databaseConfig().connections).join(', ')}.`,
    })
  }
  const cacheKey = `${connection}:${JSON.stringify(config)}`
  let adapter = registry.adapters.get(cacheKey)
  if (!adapter) {
    adapter = connect(config)
    adapter.catch(() => registry.adapters.delete(cacheKey))
    registry.adapters.set(cacheKey, adapter)
  }
  return adapter
}

export async function closeConnections() {
  const adapters = [...registry.adapters.values()]
  registry.adapters.clear()
  await Promise.allSettled(adapters.map(async (a) => (await a).close()))
}
