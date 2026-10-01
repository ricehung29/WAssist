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
