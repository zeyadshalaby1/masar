import { randomUUID } from 'node:crypto'
import type { QueueConfig } from '../config/queue'
import { MasarError } from '../errors'
import { log } from '../logger'
import { createDatabaseQueue } from './database'

export interface JobDefinition<P> {
  /** Unique name, e.g. "courses.sendCertificate". Used to find the job in workers. */
  name: string
  /** Extra attempts after the first failure (default 3). */
  retries?: number
  /** Milliseconds before the first retry; doubles each time (default 1000). */
  backoff?: number
  run(payload: P): unknown | Promise<unknown>
}

export interface DispatchOptions {
  /** Run later: milliseconds, or '30s', '10m', '2h', '1d'. */
  delay?: number | string
}

export interface Job<P> extends JobDefinition<P> {
  readonly __masar: 'job'
  /** Queue it and return immediately. */
  dispatch(payload: P, options?: DispatchOptions): Promise<void>
}

/** One queued run, as stored by a driver. */
export interface QueuedJob {
  id: string
  name: string
  payload: unknown
  attempts: number
  createdAt: string
  error?: string
}

export interface QueueDriver {
  readonly kind: 'memory' | 'database'
  push(job: QueuedJob, delayMs: number): Promise<void>
  /** Process jobs until stop() resolves. */
  work(handle: (job: QueuedJob) => Promise<void>, concurrency: number): { stop(): Promise<void> }
  /** Schedule lock: true for exactly one caller per key (across servers with the database queue). */
  claim(key: string, ttlSeconds: number): Promise<boolean>
  stats(): Promise<{ waiting: number; delayed: number; active: number; failed: number }>
  failed(limit?: number): Promise<QueuedJob[]>
  retry(id: string): Promise<boolean>
  close(): Promise<void>
}

export function parseDuration(value: number | string | undefined): number {
  if (value === undefined) return 0
  if (typeof value === 'number') return value
  const match = value.trim().match(/^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)$/)
  if (!match) throw new MasarError(`Invalid duration "${value}"`, { hint: "Use milliseconds or a unit: '30s', '10m', '2h', '1d'." })
  const units = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }
  return Number(match[1]) * units[match[2] as keyof typeof units]
}

// ── Registry and driver (on globalThis, so dev reloads share them) ─────────
interface QueueState {
  config: QueueConfig
  jobs: Map<string, Job<any>>
  driver?: Promise<QueueDriver>
}
const scope = globalThis as typeof globalThis & { __masarQueue?: QueueState }
const state = (): QueueState => (scope.__masarQueue ??= { config: { driver: 'database' }, jobs: new Map() })

export function configureQueue(config: QueueConfig | undefined, jobs: Job<any>[]) {
  const current = state()
  const next = config ?? { driver: 'database' }
  if (JSON.stringify(current.config) !== JSON.stringify(next) && current.driver) {
    void current.driver.then((d) => d.close())
    current.driver = undefined
  }
  current.config = next
  current.jobs = new Map(jobs.map((j) => [j.name, j]))
}

export function queueConfig(): QueueConfig {
  return state().config
}

export function queueDriver(): Promise<QueueDriver> {
  const s = state()
  if (!s.driver) {
    s.driver = s.config.driver === 'database' ? createDatabaseQueue(s.config) : Promise.resolve(createMemoryQueue())
    s.driver.catch(() => (s.driver = undefined))
  }
  return s.driver
}

export function isJob(value: unknown): value is Job<unknown> {
  return typeof value === 'object' && value !== null && (value as Job<unknown>).__masar === 'job'
}

/** Runs one job with the job's retry policy; returns the delay before the next attempt, or null when done/failed for good. */
export async function runJob(queued: QueuedJob): Promise<{ retryIn: number | null; error?: unknown }> {
  const job = state().jobs.get(queued.name)
  if (!job) {
    return { retryIn: null, error: new MasarError(`No job named "${queued.name}"`, { hint: 'Jobs live in src/modules/<module>/jobs/*.ts and export defineJob({ name, run }).' }) }
  }
  const started = Date.now()
  try {
    await job.run(queued.payload as never)
    log.info('job', `${job.name} done in ${Date.now() - started}ms`)
    return { retryIn: null }
  } catch (error) {
    const attempt = queued.attempts + 1
    if (attempt <= (job.retries ?? 3)) {
      const delay = (job.backoff ?? 1000) * 2 ** (attempt - 1)
      log.warn('job', `${job.name} failed (attempt ${attempt}), retrying in ${delay}ms: ${error instanceof Error ? error.message : String(error)}`)
      return { retryIn: delay, error }
    }
    log.error('job', error)
    return { retryIn: null, error }
  }
}

// ── Memory driver: in-process, for development ─────────────────────────────
function createMemoryQueue(): QueueDriver {
  const timers = new Set<NodeJS.Timeout>()
  const failed: QueuedJob[] = []
  let active = 0
  const claimed = new Map<string, number>()
  const run = (job: QueuedJob) => {
    active++
    void runJob(job).then(({ retryIn, error }) => {
      active--
      if (retryIn !== null) schedule({ ...job, attempts: job.attempts + 1 }, retryIn)
      else if (error) failed.unshift({ ...job, attempts: job.attempts + 1, error: error instanceof Error ? error.message : String(error) })
    })
  }
  const schedule = (job: QueuedJob, delay: number) => {
    const timer = setTimeout(() => (timers.delete(timer), run(job)), delay)
    timers.add(timer)
  }
  return {
    kind: 'memory',
    async push(job, delay) {
      schedule(job, delay)
    },
    work: () => ({ stop: async () => {} }),
    async claim(key, ttl) {
      const now = Date.now()
      if ((claimed.get(key) ?? 0) > now) return false
      claimed.set(key, now + ttl * 1000)
      return true
    },
    async stats() {
      return { waiting: 0, delayed: timers.size, active, failed: failed.length }
    },
    async failed(limit = 50) {
      return failed.slice(0, limit)
    },
    async retry(id) {
      const index = failed.findIndex((f) => f.id === id)
      if (index < 0) return false
      const [job] = failed.splice(index, 1)
      schedule({ ...job!, attempts: 0, error: undefined }, 0)
      return true
    },
    async close() {
      for (const t of timers) clearTimeout(t)
    },
  }
}

/**
 * Background work, in src/modules/<module>/jobs/<name>.ts:
 *
 *   export const sendWelcome = defineJob({ name: 'auth.sendWelcome', run: async ({ userId }) => { ... } })
 *   await sendWelcome.dispatch({ userId }, { delay: '10m' })
 *
 * Jobs are stored in the app's database and run by the web process and any `masar worker`.
 */
export function defineJob<P = void>(definition: JobDefinition<P>): Job<P> {
  const job: Job<P> = {
    ...definition,
    __masar: 'job',
    async dispatch(payload: P, options: DispatchOptions = {}) {
      const driver = await queueDriver()
      if (driver.kind === 'database' && !state().jobs.has(job.name)) {
        throw new MasarError(`Job "${job.name}" is not registered`, {
          hint: 'Workers find jobs by name: define them in src/modules/<module>/jobs/*.ts and export them.',
        })
      }
      await driver.push({ id: randomUUID(), name: job.name, payload: payload ?? null, attempts: 0, createdAt: new Date().toISOString() }, parseDuration(options.delay))
    },
  }
  return job
}

export function dispatch<P>(job: Job<P>, payload: P, options?: DispatchOptions) {
  return job.dispatch(payload, options)
}

/** Queue health and failed jobs, for dashboards and the admin. */
export const queue = {
  stats: async () => (await queueDriver()).stats(),
  failed: async (limit?: number) => (await queueDriver()).failed(limit),
  retry: async (id: string) => (await queueDriver()).retry(id),
}
