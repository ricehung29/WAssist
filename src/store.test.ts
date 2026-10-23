import { describe, it, expect } from 'vitest'
import {
  hydrate,
  defaultState,
  todayKey,
  nextSlot,
  addContact,
  toggleFavorite,
  favoriteContacts,
  addSnippet,
  removeSnippet,
  queueCustomMessage,
  pendingQueue,
  resetAll,
  state,
  buildContactTagList,
  cleanupHistory,
  queueForContact,
  markSent,
  planSlots,
  deferItem,
  reschedulePending,
} from './store'

describe('hydrate', () => {
  it('returns defaults for empty storage', () => {
    const s = hydrate(null)
    expect(s.contacts).toEqual([])
    expect(s.templates.length).toBeGreaterThan(0)
    expect(s.settings.defaultPrefix).toBe('852')
  })

  it('keeps saved contacts, templates and queue', () => {
    const saved = {
      ...defaultState(),
      contacts: [
        { id: 'c1', name: 'Ken', phone: '85291234567', tags: [], createdAt: 1 },
      ],
      queue: [
        {
          id: 'q1',
          contactId: 'c1',
          name: 'Ken',
          phone: '85291234567',
          rawTemplate: 'Hi {{name}}',
          finalRenderedText: 'Hi Ken',
          scheduledTime: new Date().toISOString(),
          status: 'pending' as const,
        },
      ],
      activeTemplateId: 'tpl-default',
    }
    const s = hydrate(saved)
    expect(s.contacts).toHaveLength(1)
    expect(s.queue).toHaveLength(1)
  })

  it('backfills settings added after a blob was written', () => {
    // A state saved before `settings` existed still gets full defaults.
    const legacy = { ...defaultState(), settings: undefined } as never
    const s = hydrate(legacy)
    expect(s.settings.staggerMinutes).toBe(5)
    expect(s.settings.whatsappMode).toBe('auto')
    expect(s.settings.schedule).toHaveLength(7)
  })

  it('folds a legacy single startTime into every day of the week', () => {
    // Blobs from before weekly windows carry settings.startTime only.
    const base = defaultState()
    const legacy = {
      ...base,
      settings: { ...base.settings, schedule: undefined, startTime: '07:45' },
    } as never
    const s = hydrate(legacy)
    expect(s.settings.schedule.map((d) => d.startTime)).toEqual(Array(7).fill('07:45'))
    expect(s.settings.schedule.every((d) => d.enabled)).toBe(true)
  })

  it('coerces hand-edited settings instead of trusting them', () => {
    const base = defaultState()
    const junk = {
      ...base,
      settings: {
        ...base.settings,
        locale: 'klingon',
        waTarget: 'carrier-pigeon',
        staggerMinutes: 999,
        retentionDays: -4,
        schedule: [{ day: 1, enabled: false, startTime: 'nope', endTime: '' }],
      },
    } as never
    const s = hydrate(junk)
    expect(s.settings.locale).toBe('zh-HK')
    expect(s.settings.waTarget).toBe('ask')
    expect(s.settings.staggerMinutes).toBe(60)
    expect(s.settings.retentionDays).toBe(0)
    expect(s.settings.schedule).toHaveLength(7)
    expect(s.settings.schedule[1]!.startTime).toBe('09:30')
  })

  it('drops legacy MIT / Emergency Mode keys from old blobs', () => {
    const legacy = {
      ...defaultState(),
      mit: { date: '2000-01-01', title: 'Old', deliveryGoal: '', isCompleted: true },
      emergencyMode: true,
    } as never
    const s = hydrate(legacy)
    expect(s).not.toHaveProperty('mit')
    expect(s).not.toHaveProperty('emergencyMode')
    expect(todayKey()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('never leaves the template list empty', () => {
    const s = hydrate({ ...defaultState(), templates: [] })
    expect(s.templates.length).toBeGreaterThan(0)
  })
})

describe('nextSlot', () => {
  it('staggers by the configured minute gap', () => {
    const a = nextSlot(0).getTime()
    const b = nextSlot(1).getTime()
    expect(b - a).toBe(5 * 60_000)
  })

  it('never schedules in the past', () => {
    expect(nextSlot(0).getTime()).toBeGreaterThan(Date.now() - 1000)
  })
})

describe('weekly windows and the queue', () => {
  const at = (h: number, m = 0) => {
    const d = new Date()
    d.setHours(h, m, 0, 0)
    return d
  }

  it('spreads a batch across days when one window cannot hold it', async () => {
    await resetAll()
    // A single 30-minute window today, 10 minutes apart → 4 slots a day.
    const today = new Date().getDay()
    state.settings.staggerMinutes = 10
    state.settings.schedule = state.settings.schedule.map((d) =>
      d.day === today
        ? { ...d, enabled: true, startTime: '00:00', endTime: '00:30' }
        : { ...d, enabled: false },
    )

    const ids = Array.from({ length: 6 }, (_, i) =>
      addContact({ name: `P${i}`, phone: `8529123456${i}` }).id,
    )
    const items = queueCustomMessage(ids, 'Hi {{name}}')
    const days = new Set(items.map((q) => new Date(q.scheduledTime).toDateString()))

    expect(items).toHaveLength(6)
    // Four today, two tomorrow — not six piled past midnight.
    expect(days.size).toBe(2)
    const todayCount = items.filter((q) => new Date(q.scheduledTime).getDate() === new Date().getDate())
    expect(todayCount.length).toBeLessThanOrEqual(4)
  })

  it('never double-books a slot already used by an earlier batch', async () => {
    await resetAll()
    state.settings.staggerMinutes = 5
    const a = addContact({ name: 'A', phone: '85291234561' })
    const b = addContact({ name: 'B', phone: '85291234562' })

    const [first] = queueCustomMessage([a.id], 'One')
    const [second] = queueCustomMessage([b.id], 'Two')

    expect(second!.scheduledTime).not.toBe(first!.scheduledTime)
    expect(new Date(second!.scheduledTime).getTime()).toBeGreaterThan(
      new Date(first!.scheduledTime).getTime(),
    )
  })

  it('reports when a batch cannot fit the schedule at all', async () => {
    await resetAll()
    // One open day a week with a single slot: a 500-person batch overflows the
    // one-year search horizon, and planSlots has to say so instead of silently
    // stacking everyone on the same minute.
    state.settings.staggerMinutes = 5
    state.settings.schedule = state.settings.schedule.map((d) => ({
      ...d,
      enabled: d.day === 1,
      startTime: '09:00',
      endTime: '09:00',
    }))

    const plan = planSlots(500)
    expect(plan.truncated).toBe(true)
    expect(plan.slots.length).toBeGreaterThan(0)
    expect(plan.slots.length).toBeLessThan(500)
  })

  it('moves a queued item later on Snooze without duplicating it', async () => {
    await resetAll()
    const ken = addContact({ name: 'Ken', phone: '85291234567' })
    const [item] = queueCustomMessage([ken.id], 'Hi Ken')

    const moved = await deferItem(item!.id, 1)
    expect(state.queue).toHaveLength(1)
    expect(moved!.id).toBe(item!.id)
    expect(moved!.followUpDays).toBe(1)
    expect(new Date(moved!.scheduledTime).getDate()).not.toBe(new Date().getDate())
  })

  it('re-paces queued items into a narrowed schedule', async () => {
    await resetAll()
    state.settings.staggerMinutes = 5
    const ids = Array.from({ length: 3 }, (_, i) =>
      addContact({ name: `R${i}`, phone: `8529000000${i}` }).id,
    )
    queueCustomMessage(ids, 'Hello {{name}}')

    // Narrow to one 15-minute window a day at 30-minute gaps → one slot a day.
    state.settings.staggerMinutes = 30
    state.settings.schedule = state.settings.schedule.map((d) => ({
      ...d,
      startTime: '06:00',
      endTime: '06:15',
    }))
    const moved = await reschedulePending()

    expect(moved).toBe(3)
    const days = new Set(
      state.queue
        .filter((q) => q.status === 'pending')
        .map((q) => new Date(q.scheduledTime).toDateString()),
    )
    expect(days.size).toBe(3)
    void at
  })
})

describe('favorites', () => {
  it('pins and unpins contacts, and drops pins for deleted contacts', async () => {
    const { resetAll, removeContact } = await import('./store')
    await resetAll()
    const ken = addContact({ name: 'Ken', phone: '91234567' })
    const mary = addContact({ name: 'Mary', phone: '93551234' })

    toggleFavorite(ken.id)
    toggleFavorite(mary.id)
    expect(favoriteContacts.value.map((c) => c.id)).toEqual([ken.id, mary.id])

    toggleFavorite(ken.id)
    expect(favoriteContacts.value.map((c) => c.id)).toEqual([mary.id])

    removeContact(mary.id)
    expect(state.favorites).toEqual([])
    expect(favoriteContacts.value).toEqual([])
  })
})

describe('snippets', () => {
  it('adds and removes personal shortcuts', async () => {
    await resetAll()
    const before = state.snippets.length

    const s = addSnippet('Parking', 'Parked at B2, near the lift.')
    expect(state.snippets).toHaveLength(before + 1)
    expect(s.body).toBe('Parked at B2, near the lift.')

    removeSnippet(s.id)
    expect(state.snippets).toHaveLength(before)
  })
})

describe('queueCustomMessage', () => {
  it('queues one free-written message for one contact (1:1)', async () => {
    await resetAll()
    const ken = addContact({ name: 'Ken Lau', phone: '85291234567' })

    const [item] = queueCustomMessage([ken.id], 'Hi {{name}}, running 10 min late')
    expect(pendingQueue.value).toHaveLength(1)
    expect(item!.phone).toBe('85291234567')
    expect(item!.finalRenderedText).toBe('Hi Ken, running 10 min late')
  })

  it('renders the same message per recipient (1:many with small tweaks)', async () => {
    await resetAll()
    const ken = addContact({ name: 'Ken Lau', phone: '91234567' })
    const mary = addContact({ name: 'Mary Wong', phone: '93551234' })

    const items = queueCustomMessage([ken.id, mary.id], 'Hi {{name}}, still good for Saturday?', {
      [mary.id]: 'Hi Mary, still good for Saturday? Bringing the cake',
    })
    expect(items).toHaveLength(2)
    expect(items[0]!.finalRenderedText).toBe('Hi Ken, still good for Saturday?')
    // Mary's per-recipient tweak wins over the shared render.
    expect(items[1]!.finalRenderedText).toBe('Hi Mary, still good for Saturday? Bringing the cake')
  })

  it('rejects empty text and empty recipient lists', async () => {
    await resetAll()
    const ken = addContact({ name: 'Ken', phone: '91234567' })
    expect(() => queueCustomMessage([ken.id], '   ')).toThrow()
    expect(() => queueCustomMessage([], 'Hello')).toThrow()
  })
})

describe('contact tags', () => {
  it('lists tags most-used first for the compose filter chips', async () => {
    await resetAll()
    const a = addContact({ name: 'Ken', phone: '85291234567', tags: ['client'] })
    const b = addContact({ name: 'Mary', phone: '85293551234', tags: ['client', 'vip'] })
    void a
    void b

    const tags = buildContactTagList()
    expect(tags[0]).toBe('client') // used twice → first
    expect(tags).toContain('vip')
  })
})

describe('history', () => {
  it('per-contact history only contains that contact’s finished items', async () => {
    await resetAll()
    const ken = addContact({ name: 'Ken', phone: '85291234567' })
    const mary = addContact({ name: 'Mary', phone: '85293551234' })
    const [kItem] = queueCustomMessage([ken.id], 'Hi Ken')
    const [mItem] = queueCustomMessage([mary.id], 'Hi Mary')
    await markSent(kItem!.id)
    await markSent(mItem!.id)

    const hist = queueForContact(ken.id)
    expect(hist).toHaveLength(1)
    expect(hist[0]!.finalRenderedText).toBe('Hi Ken')
  })

  it('prunes finished items past the retention window but never queued ones', async () => {
    await resetAll()
    const ken = addContact({ name: 'Ken', phone: '85291234567' })
    const [oldItem] = queueCustomMessage([ken.id], 'Old send')
    await markSent(oldItem!.id)
    // Backdate the finished item 60 days.
    state.queue.find((q) => q.id === oldItem!.id)!.scheduledTime = new Date(
      Date.now() - 60 * 24 * 60 * 60_000,
    ).toISOString()
    const [pendingItem] = queueCustomMessage([ken.id], 'Still waiting')
    void pendingItem

    state.settings.retentionDays = 30
    cleanupHistory()

    expect(state.queue.some((q) => q.finalRenderedText === 'Old send')).toBe(false)
    expect(state.queue.some((q) => q.finalRenderedText === 'Still waiting')).toBe(true)
    state.settings.retentionDays = 30
  })

  it('keeps everything when retention is 0 (keep forever)', async () => {
    await resetAll()
    const ken = addContact({ name: 'Ken', phone: '85291234567' })
    const [item] = queueCustomMessage([ken.id], 'Ancient send')
    await markSent(item!.id)
    state.queue.find((q) => q.id === item!.id)!.scheduledTime = new Date(
      Date.now() - 400 * 24 * 60 * 60_000,
    ).toISOString()

    state.settings.retentionDays = 0
    cleanupHistory()
    expect(state.queue.some((q) => q.finalRenderedText === 'Ancient send')).toBe(true)
  })
})
