export type ConnectionConfig =
  | { driver: 'sqlite'; file: string }
  | { driver: 'postgres'; url: string; max?: number }
  | { driver: 'mongodb'; url: string; database?: string }

export interface DatabaseConfig<C extends Record<string, ConnectionConfig> = Record<string, ConnectionConfig>> {
  /** Connection used by modules that don't set `store`. */
  default: keyof C & string
  connections: C
}

/**
 * Declare your database connections. A module picks one with `store`
 * in its module.ts; the default connection is used otherwise.
 */
export function defineDatabase<const C extends Record<string, ConnectionConfig>>(
  config: DatabaseConfig<C>,
): DatabaseConfig<C> {
  return config
}
