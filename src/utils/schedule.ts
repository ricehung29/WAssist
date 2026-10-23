// Weekly sending windows — which days you send, and between which times.
//
// Slots are laid out inside each day's window at a fixed stagger. When a day's
// window fills up (or the clock runs past its end), allocation continues on the
// next *enabled* day instead of silently spilling past midnight into a day the
// conveyor belt never shows.

import type { DaySchedule } from '../types'

export const DEFAULT_START = '09:30'
export const DEFAULT_END = '21:00'

/** Monday-first display order; `Date#getDay()` numbers the days but not the week. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]

/** Seven open days, 09:30–21:00 — the sane starting point for a new install. */
export function defaultSchedule(): DaySchedule[] {
  return WEEK_ORDER.map((day) => ({
    day,
    enabled: true,
    startTime: DEFAULT_START,
    endTime: DEFAULT_END,
  }))
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

export function isValidTime(value: unknown): value is string {
  return typeof value === 'string' && TIME_RE.test(value)
}

/**
 * Coerce anything (a legacy blob, a hand-edited backup, a partial day list)
 * into exactly seven well-formed days. Missing days inherit the defaults, and
 * if every day is off, today is forced open — a schedule with no open day
 * would strand every queued message.
 */
export function normalizeSchedule(input?: Partial<DaySchedule>[] | null): DaySchedule[] {
  const byDay = new Map<number, Partial<DaySchedule>>()
  for (const item of Array.isArray(input) ? input : []) {
    if (item && typeof item.day === 'number' && item.day >= 0 && item.day <= 6) {
      byDay.set(item.day, item)
    }
  }
  const out = [0, 1, 2, 3, 4, 5, 6].map((day) => {
    const src = byDay.get(day) ?? {}
    return {
      day,
      enabled: src.enabled ?? true,
      startTime: isValidTime(src.startTime) ? src.startTime : DEFAULT_START,
      endTime: isValidTime(src.endTime) ? src.endTime : DEFAULT_END,
    }
  })
  if (!out.some((d) => d.enabled)) out[new Date().getDay()]!.enabled = true
  return out
}

/** "HH:MM" → minutes since midnight. */
export function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map((n) => Number.parseInt(n, 10))
  return (h ?? 0) * 60 + (m ?? 0)
}

/** How many slots fit a window at this stagger (a reversed window holds one). */
export function slotsInWindow(win: DaySchedule, staggerMinutes: number): number {
  const span = timeToMinutes(win.endTime) - timeToMinutes(win.startTime)
  const step = Math.max(1, Math.round(staggerMinutes) || 5)
  return span < 0 ? 1 : Math.floor(span / step) + 1
}

/** Total slots the whole week can hold — the ceiling on a single batch. */
export function weeklyCapacity(schedule: DaySchedule[], staggerMinutes: number): number {
  return normalizeSchedule(schedule)
    .filter((d) => d.enabled)
    .reduce((sum, d) => sum + slotsInWindow(d, staggerMinutes), 0)
}

/** Local calendar day as `YYYY-MM-DD`. */
export function dayKeyOf(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** Minute-resolution key, so two slots can be compared for collisions. */
export function minuteKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${dayKeyOf(d)} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function atTime(day: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map((n) => Number.parseInt(n, 10))
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h ?? 0, m ?? 0, 0, 0)
}

export interface SlotPlan {
  schedule: DaySchedule[]
  staggerMinutes: number
  /** Earliest moment a slot may occupy. Days whose window has closed contribute nothing. */
  from: Date
  /** How many slots are needed. */
  count: number
  /** Minute keys already booked, so a second batch never double-books a slot. */
  taken?: Set<string>
  /** Days to search forward before giving up (default: 400). */
  horizonDays?: number
}

/**
 * The next `count` free slots at or after `from`, in chronological order.
 * Disabled days are skipped; when a window ends, the search resumes on the next
 * enabled day at its own start time.
 */
export function allocateSlots(plan: SlotPlan): Date[] {
  const schedule = normalizeSchedule(plan.schedule)
  const step = Math.max(1, Math.round(plan.staggerMinutes || 5)) * 60_000
  const taken = plan.taken ?? new Set<string>()
  const horizon = plan.horizonDays ?? 400
  const from = plan.from
  const floor = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  const out: Date[] = []

  for (let i = 0; i < horizon && out.length < plan.count; i++) {
    const day = new Date(floor.getFullYear(), floor.getMonth(), floor.getDate() + i)
    const win = schedule[day.getDay()]
    if (!win?.enabled) continue

    const start = atTime(day, win.startTime)
    const rawEnd = atTime(day, win.endTime)
    const end = rawEnd.getTime() < start.getTime() ? start : rawEnd
    // Slot times are always on the minute: if `from` is mid-minute, wait for
    // the next one rather than laying out 09:31:23, 09:36:23 …
    const first = new Date(Math.max(start.getTime(), from.getTime()))
    if (first.getSeconds() || first.getMilliseconds()) {
      first.setSeconds(0, 0)
      first.setMinutes(first.getMinutes() + 1)
    }
    if (first.getTime() > end.getTime()) continue

    for (let at = first.getTime(); at <= end.getTime() && out.length < plan.count; at += step) {
      const slot = new Date(at)
      if (!taken.has(minuteKey(slot))) out.push(slot)
    }
  }
  return out
}

export interface PlanDay {
  dayKey: string
  /** Local midnight of the day the slots fall on. */
  day: Date
  count: number
  first: Date
  last: Date
}

/** Collapse a slot list into one row per calendar day, for the "sending plan" preview. */
export function groupByDay(slots: Date[]): PlanDay[] {
  const out: PlanDay[] = []
  for (const slot of slots) {
    const key = dayKeyOf(slot)
    const current = out[out.length - 1]
    if (current?.dayKey === key) {
      current.count++
      current.last = slot
      continue
    }
    out.push({
      dayKey: key,
      day: new Date(slot.getFullYear(), slot.getMonth(), slot.getDate()),
      count: 1,
      first: slot,
      last: slot,
    })
  }
  return out
}

export interface FollowUpPlan {
  at: Date
  /** How many days out the follow-up actually landed (may skip disabled days). */
  daysAhead: number
}

/**
 * When a follow-up `offsetDays` out should land: that day's window opening, or
 * the next enabled day's if it is switched off. A moment that has already
 * passed resolves to a couple of minutes from now so it never queues in the past.
 */
export function followUpMoment(
  offsetDays: number,
  schedule: DaySchedule[],
  now = new Date(),
): FollowUpPlan {
  const days = normalizeSchedule(schedule)
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate() + Math.max(1, offsetDays))
  for (let i = 0; i < 8; i++) {
    const day = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i)
    const win = days[day.getDay()]
    if (!win?.enabled) continue
    const start = atTime(day, win.startTime)
    const daysAhead = offsetDays + i
    if (start.getTime() > now.getTime()) return { at: start, daysAhead }
    return { at: new Date(now.getTime() + 2 * 60_000), daysAhead }
  }
  return { at: new Date(now.getTime() + 2 * 60_000), daysAhead: offsetDays }
}
