import { MasarError } from '../errors'

/** Parsed cron: allowed values per field (minute, hour, day of month, month, day of week). */
export interface Cron {
  source: string
  fields: Set<number>[]
  /** Day-of-month and day-of-week both restricted: cron matches either (standard behaviour). */
  either: boolean
}

const RANGES: [number, number][] = [
  [0, 59],
  [0, 23],
  [1, 31],
  [1, 12],
  [0, 6],
]
const NAMES: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 }

function field(text: string, [min, max]: [number, number], source: string): Set<number> {
  const out = new Set<number>()
  const value = (v: string) => {
    const n = NAMES[v.toLowerCase()] ?? Number(v)
    if (!Number.isInteger(n) || n < min || n > (max === 6 ? 7 : max)) {
      throw new MasarError(`Invalid cron "${source}": "${v}" is out of range ${min}-${max}`, { hint: 'Fields: minute hour day-of-month month day-of-week, e.g. "0 3 * * *" (03:00 every day).' })
    }
    return n === 7 ? 0 : n
  }
  for (const part of text.split(',')) {
    const [range, stepText] = part.split('/')
    const step = stepText ? Number(stepText) : 1
    const [from, to] = range === '*' ? [min, max] : range!.includes('-') ? range!.split('-').map(value) : [value(range!), stepText ? max : value(range!)]
    for (let n = from!; n <= to!; n += step) out.add(n)
  }
  return out
}

export function parseCron(source: string): Cron {
  const parts = source.trim().split(/\s+/)
  if (parts.length !== 5) {
    throw new MasarError(`Invalid cron "${source}": expected 5 fields`, { hint: 'minute hour day-of-month month day-of-week, e.g. "*/15 * * * *" or "0 9 * * mon".' })
  }
  const fields = parts.map((p, i) => field(p, RANGES[i]!, source))
  return { source, fields, either: parts[2] !== '*' && parts[4] !== '*' }
}

/** Wall-clock parts of `date` in `timeZone`. */
export function partsIn(date: Date, timeZone: string) {
  const values = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', weekday: 'short' })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  )
  return {
    minute: Number(values.minute),
    hour: Number(values.hour),
    day: Number(values.day),
    month: Number(values.month),
    weekday: NAMES[String(values.weekday).toLowerCase().slice(0, 3)]!,
  }
}

export function cronMatches(cron: Cron, date: Date, timeZone: string): boolean {
  const p = partsIn(date, timeZone)
  const [minutes, hours, days, months, weekdays] = cron.fields as [Set<number>, Set<number>, Set<number>, Set<number>, Set<number>]
  if (!minutes.has(p.minute) || !hours.has(p.hour) || !months.has(p.month)) return false
  return cron.either ? days.has(p.day) || weekdays.has(p.weekday) : days.has(p.day) && weekdays.has(p.weekday)
}
