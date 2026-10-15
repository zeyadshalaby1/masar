export type QueueConfig =
  | {
      /**
       * Jobs are stored in the app's database (table masar_jobs) and run by the web process,
       * `masar worker` processes, or both. Survive restarts; safe with several servers. The default.
       */
      driver: 'database'
      /** Connection from src/config/database.ts. Defaults to the default connection. */
      connection?: string
      /** Jobs a process runs at the same time (default 5). */
      concurrency?: number
    }
  | {
      /** Jobs run inside the process and are lost if it stops. For tests. */
      driver: 'memory'
    }

/** src/config/queue.ts (optional; the database queue is used without it). */
export function defineQueue(config: QueueConfig): QueueConfig {
  return config
}
