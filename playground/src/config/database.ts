import { defineDatabase, env } from 'masar'

/**
 * Database connections. Modules use `default` unless they set `store` in
 * their module.ts, so one app can keep some modules in SQL and others in MongoDB:
 *
 *   logs: { driver: 'mongodb', url: env('MONGO_URL') },
 *   // src/modules/activity/module.ts → store: 'logs'
 */
export default defineDatabase({
  default: 'main',
  connections: {
    main: { driver: 'sqlite', file: env('DB_FILE', 'database/app.sqlite') },
  },
})
