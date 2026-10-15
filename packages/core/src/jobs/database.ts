import { randomUUID } from 'node:crypto'
import type { QueueConfig } from '../config/queue'
import { db } from '../db/db'
import { f, model, type Model } from '../db/model'
import { databaseConfig, getAdapter } from '../db/registry'
import { log } from '../logger'
import { runJob, type QueueDriver, type QueuedJob } from './index'

const jobsModel = model('masar_jobs', {
  name: f.string().index(),
  payload: f.json().optional(),
  attempts: f.int().default(0),
  status: f.enum(['queued', 'failed']).default('queued').index(),
  availableAt: f.date().index(),
  reservedAt: f.date().optional(),
  reservedBy: f.string().optional(),
  error: f.text().optional(),
  failedAt: f.date().optional(),
})
const locksModel = model('masar_locks', { name: f.string().unique(), expiresAt: f.date() })

/** A job held longer than this is taken to be abandoned by a crashed process and runs again. */
const LEASE_MS = 10 * 60_000
const POLL_MS = 1000

/**
 * The queue in the app's own database: nothing extra to install, works on SQLite, Postgres and
 * MongoDB. A process reserves a job with a compare-and-set update (only one process can win it),
 * so several web servers and workers can share the table safely.
 */
export async function createDatabaseQueue(config: Extract<QueueConfig, { driver: 'database' }>): Promise<QueueDriver> {
  const connection = config.connection ?? databaseConfig().default
  const on = <M extends Model<any, any>>(base: M): M => ({ ...base, store: connection })
  const jobs = on(jobsModel)
  const locks = on(locksModel)
  await (await getAdapter(connection)).sync([jobs, locks], connection)

  const toQueued = (row: Record<string, unknown>): QueuedJob => ({
    id: String(row.id),
    name: String(row.name),
    payload: row.payload ?? null,
    attempts: Number(row.attempts ?? 0),
    createdAt: String(row.createdAt),
    error: (row.error as string | null) ?? undefined,
  })

  // Wakes this process's loop right after a dispatch, instead of waiting for the next poll.
  let wake: (() => void) | null = null

  return {
    kind: 'database',
    async push(job, delay) {
      await db(jobs).create({ id: job.id, name: job.name, payload: job.payload as never, attempts: job.attempts, availableAt: new Date(Date.now() + delay).toISOString() } as never)
      if (delay === 0) wake?.()
    },

    work(_handle, concurrency) {
      const owner = randomUUID().slice(0, 12)
      let running = true
      let active = 0
      let timer: NodeJS.Timeout | undefined
      const inFlight = new Set<Promise<void>>()

      /** Compare-and-set: only one process sees changed === 1 for a given job and reservedAt value. */
      const reserve = async (row: Record<string, unknown>) => {
        const changed = await db(jobs)
          .where({ id: row.id, status: 'queued', reservedAt: (row.reservedAt as string | null) ?? null } as never)
          .updateAll({ reservedAt: new Date().toISOString(), reservedBy: owner } as never)
        return changed === 1
      }

      const execute = async (row: Record<string, unknown>) => {
        const job = toQueued(row)
        const { retryIn, error } = await runJob(job)
        if (retryIn !== null) {
          await db(jobs).update(job.id, { attempts: job.attempts + 1, availableAt: new Date(Date.now() + retryIn).toISOString(), reservedAt: null, reservedBy: null } as never)
        } else if (error) {
          await db(jobs).update(job.id, { status: 'failed', attempts: job.attempts + 1, error: error instanceof Error ? error.message : String(error), failedAt: new Date().toISOString(), reservedAt: null } as never)
        } else {
          await db(jobs).delete(job.id)
        }
      }

      const poll = async () => {
        if (!running) return
        try {
          const free = concurrency - active
          if (free > 0) {
            const now = new Date().toISOString()
            const stale = new Date(Date.now() - LEASE_MS).toISOString()
            const candidates = await db(jobs)
              .where({ status: 'queued', availableAt: { lte: now } } as never)
              .whereAny([{ reservedAt: null }, { reservedAt: { lt: stale } }] as never)
              .orderBy('availableAt' as never, 'asc')
              .limit(free * 2)
              .all()
            for (const row of candidates) {
              if (active >= concurrency) break
              if (!(await reserve(row as Record<string, unknown>))) continue
              if (row.reservedAt) log.warn('queue', `job ${row.name} (${row.id}) was abandoned by a stopped process; running it again`)
              active++
              const task = execute(row as Record<string, unknown>)
                .catch((error) => log.error('queue', error))
                .finally(() => {
                  active--
                  inFlight.delete(task)
                  void schedule(0)
                })
              inFlight.add(task)
            }
          }
        } catch (error) {
          log.error('queue', error)
        }
        schedule(POLL_MS)
      }
      const schedule = (ms: number) => {
        if (!running) return
        clearTimeout(timer)
        timer = setTimeout(() => void poll(), ms)
      }
      wake = () => schedule(0)
      schedule(0)

      return {
        async stop() {
          running = false
          wake = null
          clearTimeout(timer)
          await Promise.all(inFlight)
        },
      }
    },

    async claim(name, ttl) {
      await db(locks).where({ name, expiresAt: { lt: new Date().toISOString() } } as never).deleteAll()
      try {
        await db(locks).create({ name, expiresAt: new Date(Date.now() + ttl * 1000).toISOString() } as never)
        return true
      } catch {
        // The unique index refused it: someone else holds this slot.
        return false
      }
    },

    async stats() {
      const now = new Date().toISOString()
      const [waiting, delayed, active, failed] = await Promise.all([
        db(jobs).where({ status: 'queued', reservedAt: null, availableAt: { lte: now } } as never).count(),
        db(jobs).where({ status: 'queued', availableAt: { gt: now } } as never).count(),
        db(jobs).where({ status: 'queued', reservedAt: { ne: null } } as never).count(),
        db(jobs).where({ status: 'failed' } as never).count(),
      ])
      return { waiting, delayed, active, failed }
    },

    async failed(limit = 50) {
      return (await db(jobs).where({ status: 'failed' } as never).latest('failedAt' as never).limit(limit).all()).map((r) => toQueued(r as Record<string, unknown>))
    },

    async retry(id) {
      const changed = await db(jobs).where({ id, status: 'failed' } as never).updateAll({ status: 'queued', attempts: 0, error: null, availableAt: new Date().toISOString(), reservedAt: null } as never)
      if (changed) wake?.()
      return changed === 1
    },

    async close() {},
  }
}
