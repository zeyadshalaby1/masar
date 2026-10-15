import { MasarError } from '../errors'
import { log } from '../logger'
import { cronMatches, parseCron, type Cron } from './cron'
import { isJob, queueDriver, type Job } from './index'

type Target = Job<any> | (() => unknown | Promise<unknown>)

export interface ScheduledTask {
  name: string
  cron: Cron
  target: Target
  payload?: unknown
}

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const
type Day = (typeof DAYS)[number]
type Every = 'minute' | '5 minutes' | '10 minutes' | '15 minutes' | '30 minutes' | 'hour' | 'day' | 'week' | 'month'

class TaskBuilder {
  private minute = '*'
  private hour = '*'
  private dayOfMonth = '*'
  private weekday = '*'
  private label?: string

  constructor(
    private readonly add: (task: Omit<ScheduledTask, 'name'> & { name?: string }) => void,
    every?: Every,
    private readonly raw?: string,
  ) {
    if (!every) return
    const step = every.match(/^(\d+) minutes$/)
    if (every === 'minute') this.minute = '*'
    else if (step) this.minute = `*/${step[1]}`
    else if (every === 'hour') this.minute = '0'
    else {
      ;[this.minute, this.hour] = ['0', '0']
      if (every === 'week') this.weekday = '1'
      if (every === 'month') this.dayOfMonth = '1'
    }
  }

  /** Time of day, 24h: at('03:00'), at('18:30'). In the app's timezone. */
  at(time: string) {
    const match = time.match(/^(\d{1,2}):(\d{2})$/)
    if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) throw new MasarError(`Invalid time "${time}"`, { hint: "Use 24-hour HH:MM, e.g. at('03:00')." })
    this.hour = String(Number(match[1]))
    this.minute = String(Number(match[2]))
    return this
  }

  /** Days of the week: on('monday'), on('sunday', 'wednesday'). */
  on(...days: Day[]) {
    this.weekday = days.map((d) => DAYS.indexOf(d)).join(',')
    return this
  }

  /** A stable name, shown in logs and used for the run-once lock. */
  name(name: string) {
    this.label = name
    return this
  }

  /** What to run: a job (dispatched to the queue) or a function. */
  run(target: Target, payload?: unknown) {
    const cron = parseCron(this.raw ?? `${this.minute} ${this.hour} ${this.dayOfMonth} * ${this.weekday}`)
    this.add({ name: this.label, cron, target, payload })
  }
}

export interface ScheduleBuilder {
  every(interval: Every): TaskBuilder
  cron(expression: string): TaskBuilder
}

export interface ScheduleDefinition {
  readonly __masar: 'schedule'
  tasks: (Omit<ScheduledTask, 'name'> & { name?: string })[]
}

/**
 * Recurring work, in src/modules/<module>/schedule.ts. Runs in `masar worker` (or in the web
 * process with the memory queue), once per minute slot even with several servers:
 *
 *   export default defineSchedule((s) => {
 *     s.every('day').at('03:00').name('cleanup').run(deleteOldSessions)
 *     s.every('week').on('sunday').at('09:00').run(sendWeeklyReport)
 *     s.cron('*\/15 * * * *').run(syncPayments)
 *   })
 */
export function defineSchedule(define: (s: ScheduleBuilder) => void): ScheduleDefinition {
  const tasks: ScheduleDefinition['tasks'] = []
  const add = (task: (typeof tasks)[number]) => tasks.push(task)
  define({
    every: (interval) => new TaskBuilder(add, interval),
    cron: (expression) => new TaskBuilder(add, undefined, expression),
  })
  return { __masar: 'schedule', tasks }
}

export function isSchedule(value: unknown): value is ScheduleDefinition {
  return typeof value === 'object' && value !== null && (value as ScheduleDefinition).__masar === 'schedule'
}

// ── Runner ────────────────────────────────────────────────────────────────
interface SchedulerState {
  tasks: ScheduledTask[]
  timeZone: string
  timer?: NodeJS.Timeout
}
const scope = globalThis as typeof globalThis & { __masarScheduler?: SchedulerState }
const state = (): SchedulerState => (scope.__masarScheduler ??= { tasks: [], timeZone: 'UTC' })

/** Called at every boot (and dev reload) with the current tasks; a running scheduler picks them up. */
export function configureSchedule(tasks: ScheduledTask[], timeZone: string) {
  const s = state()
  s.tasks = tasks
  s.timeZone = timeZone
}

async function tick(at: Date) {
  const { tasks, timeZone } = state()
  const slot = at.toISOString().slice(0, 16)
  const driver = await queueDriver()
  for (const task of tasks) {
    if (!cronMatches(task.cron, at, timeZone)) continue
    if (!(await driver.claim(`schedule:${task.name}:${slot}`, 120))) continue
    try {
      if (isJob(task.target)) await task.target.dispatch(task.payload)
      else await task.target()
      log.info('schedule', `${task.name} ran`)
    } catch (error) {
      log.error('schedule', error)
    }
  }
}

/** Ticks at the start of every minute. Returns stop(). Starting twice is harmless. */
export function startScheduler(): () => void {
  const s = state()
  if (s.timer) return () => stopScheduler()
  const arm = () => {
    const now = Date.now()
    s.timer = setTimeout(() => {
      void tick(new Date(Math.round(Date.now() / 60_000) * 60_000))
      arm()
    }, 60_000 - (now % 60_000) + 50)
  }
  arm()
  return () => stopScheduler()
}

function stopScheduler() {
  const s = state()
  if (s.timer) clearTimeout(s.timer)
  s.timer = undefined
}

export { tick as runScheduleTick }
