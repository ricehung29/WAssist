import { describe, it, expect } from 'vitest'
import {
  allocateSlots,
  dayKeyOf,
  defaultSchedule,
  followUpMoment,
  groupByDay,
  minuteKey,
  normalizeSchedule,
  slotsInWindow,
  weeklyCapacity,
} from './schedule'
import type { DaySchedule } from '../types'

/** Monday 2026-10-05 08:00 local — a known weekday for window maths. */
function monday(hour = 8, minute = 0): Date {
  return new Date(2026, 9, 5, hour, minute, 0, 0)
}

function win(day: number, patch: Partial<DaySchedule> = {}): DaySchedule {
  return { day, enabled: true, startTime: '09:30', endTime: '21:00', ...patch }
}

describe('normalizeSchedule', () => {
  it('fills a seven-day week from partial input', () => {
    const s = normalizeSchedule([{ day: 3, enabled: false, startTime: '10:00', endTime: '12:00' }])
    expect(s).toHaveLength(7)
    expect(s[3]).toMatchObject({ enabled: false, startTime: '10:00', endTime: '12:00' })
    expect(s[0]).toMatchObject({ enabled: true, startTime: '09:30', endTime: '21:00' })
  })

  it('repairs invalid times instead of trusting a hand-edited backup', () => {
    const s = normalizeSchedule([{ day: 1, startTime: '9am', endTime: '25:99' }])
    expect(s[1]!.startTime).toBe('09:30')
    expect(s[1]!.endTime).toBe('21:00')
  })

  it('never leaves the week with no open day', () => {
    const allOff = [0, 1, 2, 3, 4, 5, 6].map((day) => win(day, { enabled: false }))
    const s = normalizeSchedule(allOff)
    expect(s.filter((d) => d.enabled)).toHaveLength(1)
    expect(s.find((d) => d.enabled)!.day).toBe(new Date().getDay())
  })

  it('survives junk input', () => {
    expect(normalizeSchedule(undefined)).toHaveLength(7)
    expect(normalizeSchedule([{ day: 99 } as never])).toHaveLength(7)
  })
})

describe('capacity maths', () => {
  it('counts slots inside one window', () => {
    // 09:30–21:00 is 690 minutes; at 5 min that is 139 inclusive slots.
    expect(slotsInWindow(win(1), 5)).toBe(139)
    expect(slotsInWindow(win(1), 10)).toBe(70)
  })

  it('treats a reversed window as a single slot rather than none', () => {
    expect(slotsInWindow(win(1, { startTime: '18:00', endTime: '09:00' }), 5)).toBe(1)
  })

  it('sums only enabled days', () => {
    // Weekend off: five open days at 139 slots each.
    const week = defaultSchedule().map((d) =>
      d.day === 6 || d.day === 0 ? { ...d, enabled: false } : d,
    )
    expect(weeklyCapacity(week, 5)).toBe(139 * 5)
  })
})

describe('allocateSlots', () => {
  it('lays slots out from the window start at the stagger', () => {
    const slots = allocateSlots({
      schedule: defaultSchedule(),
      staggerMinutes: 30,
      from: monday(),
      count: 3,
    })
    expect(slots.map((d) => d.getHours() * 60 + d.getMinutes())).toEqual([570, 600, 630])
    expect(dayKeyOf(slots[0]!)).toBe('2026-10-05')
  })

  it('starts at "now" when the window has already opened', () => {
    const slots = allocateSlots({
      schedule: defaultSchedule(),
      staggerMinutes: 10,
      from: monday(11, 0),
      count: 2,
    })
    expect(slots[0]!.getHours()).toBe(11)
    expect(slots[0]!.getMinutes()).toBe(0)
    expect(slots[1]!.getMinutes()).toBe(10)
  })

  it('never lays out a slot in the past when "now" is mid-minute', () => {
    const from = new Date(2026, 9, 5, 11, 7, 42, 500)
    const [first] = allocateSlots({
      schedule: defaultSchedule(),
      staggerMinutes: 10,
      from,
      count: 1,
    })
    expect(first!.getTime()).toBeGreaterThan(from.getTime())
    expect(first!.getSeconds()).toBe(0)
    expect(first!.getMinutes()).toBe(8)
  })

  it('skips a disabled day and continues on the next enabled one', () => {
    // Tuesday off (day 2); Monday still open.
    const week = defaultSchedule().map((d) => (d.day === 2 ? { ...d, enabled: false } : d))
    const slots = allocateSlots({
      schedule: week,
      staggerMinutes: 30,
      // 21:00 is Monday's last slot, so the next one waits for the next open day.
      from: monday(21, 0),
      count: 2,
    })
    expect(dayKeyOf(slots[0]!)).toBe('2026-10-05')
    expect(dayKeyOf(slots[1]!)).toBe('2026-10-07')
    expect(slots[1]!.getHours()).toBe(9)
  })

  it('rolls past a full window into the next day instead of past midnight', () => {
    const week = defaultSchedule().map((d) => ({
      ...d,
      startTime: '09:00',
      endTime: '10:00',
    }))
    const slots = allocateSlots({
      schedule: week,
      staggerMinutes: 30,
      from: monday(),
      count: 4,
    })
    expect(slots).toHaveLength(4)
    // 09:00, 09:30, 10:00 fill Monday; the fourth waits for Tuesday.
    expect(slots.map((d) => `${dayKeyOf(d)} ${d.getHours()}`)).toEqual([
      '2026-10-05 9',
      '2026-10-05 9',
      '2026-10-05 10',
      '2026-10-06 9',
    ])
  })

  it('does not double-book a slot that is already taken', () => {
    const taken = new Set([minuteKey(new Date(2026, 9, 5, 9, 30))])
    const slots = allocateSlots({
      schedule: defaultSchedule(),
      staggerMinutes: 30,
      from: monday(),
      count: 2,
      taken,
    })
    expect(slots[0]!.getMinutes()).toBe(0)
    expect(slots[0]!.getHours()).toBe(10)
  })

  it('returns fewer slots than asked when the horizon runs out', () => {
    // Only Mondays are open, one slot each, and the search only looks 3 days ahead.
    const week = [0, 1, 2, 3, 4, 5, 6].map((day) =>
      win(day, { enabled: day === 1, startTime: '09:00', endTime: '09:00' }),
    )
    const slots = allocateSlots({
      schedule: week,
      staggerMinutes: 60,
      from: monday(),
      count: 5,
      horizonDays: 3,
    })
    expect(slots).toHaveLength(1)
  })
})

describe('followUpMoment', () => {
  it('lands on the target day at that day’s window start', () => {
    const week = defaultSchedule().map((d) => ({ ...d, startTime: '10:15' }))
    const plan = followUpMoment(2, week, monday())
    expect(dayKeyOf(plan.at)).toBe('2026-10-07')
    expect(plan.at.getHours()).toBe(10)
    expect(plan.at.getMinutes()).toBe(15)
    expect(plan.daysAhead).toBe(2)
  })

  it('skips a day that is switched off and reports the real distance', () => {
    const week = defaultSchedule().map((d) => (d.day === 2 ? { ...d, enabled: false } : d))
    const plan = followUpMoment(1, week, monday())
    // Tuesday is off, so a "tomorrow" follow-up lands on Wednesday.
    expect(dayKeyOf(plan.at)).toBe('2026-10-07')
    expect(plan.daysAhead).toBe(2)
  })

  it('never resolves into the past', () => {
    const plan = followUpMoment(0, defaultSchedule(), monday(23, 50))
    expect(plan.at.getTime()).toBeGreaterThan(monday(23, 50).getTime())
  })
})

describe('groupByDay', () => {
  it('collapses a slot list into one row per calendar day', () => {
    const slots = [
      new Date(2026, 9, 5, 9, 30),
      new Date(2026, 9, 5, 9, 35),
      new Date(2026, 9, 6, 9, 30),
    ]
    const days = groupByDay(slots)
    expect(days).toHaveLength(2)
    expect(days[0]).toMatchObject({ dayKey: '2026-10-05', count: 2 })
    expect(days[0]!.last.getMinutes()).toBe(35)
    expect(days[1]).toMatchObject({ dayKey: '2026-10-06', count: 1 })
  })
})
