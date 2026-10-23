// Reactive store: contacts, templates, queue, favorites, snippets, settings.
// 100% local-first: persisted through Dexie (IndexedDB) with LocalStorage fallback.

import { reactive, computed, watch } from 'vue'
import type {
  AllTab,
  Contact,
  MessageTemplate,
  QueueItem,
  QueueStatus,
  PersistedState,
  Settings,
  Snippet,
} from './types'
import { renderTemplate } from './utils/spintax'
import {
  allocateSlots,
  dayKeyOf,
  defaultSchedule,
  followUpMoment,
  minuteKey,
  normalizeSchedule,
} from './utils/schedule'
import { scheduleReminder, cancelReminder, ensureReminderPermission } from './utils/notify'
import { loadState, createSaver } from './db'

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function todayKey(d = new Date()): string {
  return dayKeyOf(d)
}

function randomNotificationId(): number {
  return Math.floor(Math.random() * 2_000_000_000)
}

export const DEFAULT_SETTINGS: Settings = {
  locale: 'zh-HK',
  defaultPrefix: '852',
  whatsappMode: 'auto',
  waTarget: 'ask',
  staggerMinutes: 5,
  schedule: defaultSchedule(),
  notificationsEnabled: true,
  activeTab: 'send',
  retentionDays: 30,
}

function defaultTemplates(): MessageTemplate[] {
  return [
    {
      id: 'tpl-default',
      title: 'Morning check-in',
      content:
        '{Hello|Hi|Good morning} {{name}}, {just checking in on|wanted to follow up regarding} {{topic}}. {Let me know a good time to chat|Hope all is well on your side}!',
    },
  ]
}

function defaultSnippets(): Snippet[] {
  return [
    {
      id: 'snp-onmyway',
      title: 'On my way',
      body: 'On my way — see you soon!',
    },
    {
      id: 'snp-running-late',
      title: 'Running late',
      body: 'Running a bit late — will keep you posted.',
    },
  ]
}

export function defaultState(): PersistedState {
  return {
    contacts: [],
    templates: defaultTemplates(),
    queue: [],
    activeTemplateId: 'tpl-default',
    favorites: [],
    snippets: defaultSnippets(),
    settings: { ...DEFAULT_SETTINGS },
  }
}

/**
 * Merge a persisted blob over defaults.
 * Fields are picked explicitly so legacy blobs (e.g. the old MIT capsule /
 * Emergency Mode keys) are dropped instead of lingering in storage.
 */
export function hydrate(saved: Partial<PersistedState> | null): PersistedState {
  const base = defaultState()
  if (!saved) return base
  const contacts = saved.contacts ?? []
  const settings = normalizeSettings(saved.settings)
  return {
    contacts,
    templates: saved.templates?.length ? saved.templates : base.templates,
    queue: saved.queue ?? [],
    activeTemplateId: saved.activeTemplateId ?? base.activeTemplateId,
    // Drop pins whose contact no longer exists.
    favorites: (saved.favorites ?? []).filter((id) => contacts.some((c) => c.id === id)),
    snippets: saved.snippets?.length ? saved.snippets : base.snippets,
    settings,
  }
}

/**
 * Settings arrive from older builds, hand-edited backups, and (in the worst
 * case) nothing at all — so every field is coerced here rather than trusted.
 *
 * A blob written before weekly windows existed carries a single `startTime`;
 * that start time becomes the opening of every day's window, so upgrading does
 * not silently reset the user's morning slot.
 */
export function normalizeSettings(saved?: Partial<Settings> | null): Settings {
  const base = defaultState().settings
  const raw = { ...base, ...(saved ?? {}) }
  // Legacy single start time, still present on blobs from before `schedule`.
  const legacyStart = (saved as { startTime?: unknown } | undefined)?.startTime
  const schedule = Array.isArray(saved?.schedule)
    ? saved.schedule
    : defaultSchedule().map((d) => ({
        ...d,
        startTime: typeof legacyStart === 'string' ? legacyStart : d.startTime,
      }))

  // Guard against blobs written before the locale setting existed
  // (or with a bogus locale from a hand-edited backup).
  const locale: Settings['locale'] = raw.locale === 'en' || raw.locale === 'zh-HK' ? raw.locale : base.locale
  const waTarget: Settings['waTarget'] =
    raw.waTarget === 'whatsapp' || raw.waTarget === 'business' || raw.waTarget === 'ask'
      ? raw.waTarget
      : base.waTarget
  const waMode: Settings['whatsappMode'] =
    raw.whatsappMode === 'auto' || raw.whatsappMode === 'native' || raw.whatsappMode === 'web'
      ? raw.whatsappMode
      : base.whatsappMode

  const stagger = Number(raw.staggerMinutes)
  return {
    locale,
    defaultPrefix: String(raw.defaultPrefix ?? base.defaultPrefix).replace(/\D/g, '') || base.defaultPrefix,
    whatsappMode: waMode,
    waTarget,
    staggerMinutes: Number.isFinite(stagger) ? Math.min(60, Math.max(1, Math.round(stagger))) : base.staggerMinutes,
    schedule: normalizeSchedule(schedule),
    notificationsEnabled: raw.notificationsEnabled ?? base.notificationsEnabled,
    activeTab: (['send', 'people', 'words', 'history'] as const).includes(raw.activeTab)
      ? raw.activeTab
      : base.activeTab,
    retentionDays: Number.isFinite(Number(raw.retentionDays))
      ? Math.max(0, Math.round(Number(raw.retentionDays)))
      : base.retentionDays,
  }
}

export const state = reactive<PersistedState>(defaultState())

const saver = createSaver()

watch(state, (s) => saver.queue(JSON.parse(JSON.stringify(s)) as PersistedState), { deep: true })

let initialized = false
/** Load persisted data once at app boot. */
export async function initStore(): Promise<void> {
  if (initialized) return
  initialized = true
  const saved = await loadState()
  Object.assign(state, hydrate(saved))
  rollForwardOverdue()
  cleanupHistory()
}

if (typeof document !== 'undefined') {
  // Never lose the last few hundred ms of edits when the app is backgrounded.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void saver.flush()
  })
  window.addEventListener('pagehide', () => void saver.flush())
}

// ---------- derived ----------

/** True when an ISO timestamp falls on today's local calendar day. */
export function isToday(iso: string): boolean {
  return todayKey(new Date(iso)) === todayKey()
}

/**
 * Today's pending items — what the belt runs. A plan that overflows onto later
 * days keeps that tail visible in the queue list (and summarised on the belt),
 * but never lets it be tapped through out of order.
 */
export const pendingQueue = computed(() =>
  state.queue
    .filter((q) => q.status === 'pending' && isToday(q.scheduledTime))
    .sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime)),
)

/** Everything still owed (today, later days, snoozed), in time order. */
export const queueList = computed(() =>
  state.queue
    .filter((q) => q.status === 'pending' || q.status === 'snoozed')
    .sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime)),
)

/** Owed items that fall on a later day — the part of a batch still waiting its turn. */
export const futureQueue = computed(() =>
  queueList.value.filter((q) => !isToday(q.scheduledTime)),
)

export const nextUp = computed<QueueItem | null>(() => pendingQueue.value[0] ?? null)
export const remainingCount = computed(() => pendingQueue.value.length)
export const sentCount = computed(() => state.queue.filter((q) => q.status === 'sent').length)
/** Messages sent today — the dashboard's core stat, not a cumulative total. */
export const sentCountToday = computed(
  () => state.queue.filter((q) => q.status === 'sent' && isToday(q.scheduledTime)).length,
)
export const activeContacts = computed(() => state.contacts)

/** Pinned chats, in pin order, skipping deleted contacts. */
export const favoriteContacts = computed(() =>
  state.favorites
    .map((id) => state.contacts.find((c) => c.id === id))
    .filter((c): c is Contact => Boolean(c)),
)

/** Pending items scheduled for a later day — grouped under "Upcoming" in the queue. */
export const upcomingQueue = computed(() =>
  queueList.value.filter((q) => !isToday(q.scheduledTime)),
)

export function useStore() {
  return {
    state,
    pendingQueue,
    queueList,
    nextUp,
    remainingCount,
    sentCount,
    activeContacts,
    favoriteContacts,
  }
}

// ---------- templates ----------

export function activeTemplate(): MessageTemplate {
  return (
    state.templates.find((t) => t.id === state.activeTemplateId) ??
    state.templates[0] ?? { id: '', title: 'Untitled', content: '{{name}}' }
  )
}

export function setActiveTemplate(id: string): void {
  state.activeTemplateId = id
}

export function addTemplate(title: string, content: string): MessageTemplate {
  const tpl: MessageTemplate = { id: `tpl-${uid()}`, title: title.trim() || 'Untitled', content }
  state.templates.push(tpl)
  state.activeTemplateId = tpl.id
  return tpl
}

export function updateTemplate(id: string, patch: Partial<MessageTemplate>): void {
  const tpl = state.templates.find((t) => t.id === id)
  if (tpl) Object.assign(tpl, patch)
}

export function removeTemplate(id: string): void {
  if (state.templates.length <= 1) return
  state.templates = state.templates.filter((t) => t.id !== id)
  if (state.activeTemplateId === id) state.activeTemplateId = state.templates[0]!.id
}

// ---------- contacts ----------

export function addContact(input: {
  name: string
  phone: string
  note?: string
  tags?: string[]
}): Contact {
  const existing = state.contacts.find((c) => c.phone === input.phone)
  if (existing) {
    if (input.note && !existing.note) existing.note = input.note
    if (input.name && existing.name === existing.phone) existing.name = input.name
    return existing
  }
  const c: Contact = {
    id: uid(),
    name: input.name || input.phone,
    phone: input.phone,
    note: input.note,
    tags: input.tags ?? [],
    createdAt: Date.now(),
  }
  state.contacts.push(c)
  return c
}

export function updateContact(id: string, patch: Partial<Contact>): void {
  const c = state.contacts.find((x) => x.id === id)
  if (c) Object.assign(c, patch)
}

export function removeContact(id: string): void {
  state.contacts = state.contacts.filter((c) => c.id !== id)
  state.favorites = state.favorites.filter((fid) => fid !== id)
  state.queue = state.queue.filter((q) => q.contactId !== id || q.status !== 'pending')
}

// ---------- favorites (pinned chats) ----------

export function toggleFavorite(contactId: string): void {
  state.favorites = state.favorites.includes(contactId)
    ? state.favorites.filter((id) => id !== contactId)
    : [...state.favorites, contactId]
}

// ---------- tags ----------

/** Every tag in use across contacts, most-used first (for filter chips). */
export function buildContactTagList(): string[] {
  const counts = new Map<string, number>()
  for (const c of state.contacts) {
    for (const t of c.tags) counts.set(t, (counts.get(t) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([t]) => t)
}

// ---------- personal snippets ----------

export function addSnippet(title: string, body: string): Snippet {
  const s: Snippet = {
    id: `snp-${uid()}`,
    title: title.trim() || 'Untitled',
    body: body.trim(),
  }
  state.snippets.push(s)
  return s
}

export function removeSnippet(id: string): void {
  state.snippets = state.snippets.filter((s) => s.id !== id)
}

// ---------- queue building (Feature 1: per-recipient render) ----------

function varsFor(contact: Contact, topic: string): Record<string, string> {
  return {
    name: contact.name.split(' ')[0] ?? contact.name,
    fullname: contact.name,
    note: contact.note ?? '',
    topic,
    time: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
  }
}

/** Slots already spoken for, so a second batch never double-books one. */
export function bookedSlots(exclude?: Set<string>): Set<string> {
  const taken = new Set<string>()
  for (const q of state.queue) {
    if (exclude?.has(q.id)) continue
    if (q.status === 'pending' || q.status === 'snoozed') {
      taken.add(minuteKey(new Date(q.scheduledTime)))
    }
  }
  return taken
}

export interface SlotPreview {
  slots: Date[]
  /** True when the batch needs more room than the schedule provides. */
  truncated: boolean
}

/**
 * Where a batch of `count` messages would land, honouring the weekly windows.
 * Used both for queueing and for the "how will this be paced?" preview.
 *
 * `excludeIds` drops items from the booking set — re-pacing passes the very
 * items being moved, so their old slots do not block them.
 */
export function planSlots(
  count: number,
  from = new Date(),
  excludeIds?: Set<string>,
): SlotPreview {
  if (count <= 0) return { slots: [], truncated: false }
  const slots = allocateSlots({
    schedule: state.settings.schedule,
    staggerMinutes: state.settings.staggerMinutes,
    from,
    count,
    taken: bookedSlots(excludeIds),
  })
  return { slots, truncated: slots.length < count }
}

/** The first slot a single new message would occupy, counting `index` items ahead. */
export function nextSlot(index = 0): Date {
  const { slots } = planSlots(index + 1)
  return slots[Math.min(index, slots.length - 1)] ?? new Date(Date.now() + 2 * 60_000)
}

export function buildQueue(
  contactIds: string[],
  topic = '',
  options: { templateId?: string; rawText?: string; overrides?: Record<string, string> } = {},
): QueueItem[] {
  const text =
    options.rawText ??
    state.templates.find((t) => t.id === options.templateId)?.content ??
    activeTemplate().content
  const { slots } = planSlots(contactIds.length)
  const items: QueueItem[] = contactIds.map((cid, i) => {
    const c = state.contacts.find((x) => x.id === cid)
    if (!c) throw new Error(`Contact not found: ${cid}`)
    return {
      id: uid(),
      contactId: c.id,
      name: c.name,
      phone: c.phone,
      rawTemplate: text,
      finalRenderedText:
        options.overrides?.[cid]?.trim() || renderTemplate(text, varsFor(c, topic)),
      topic: topic || undefined,
      // A schedule that cannot fit the batch holds the overflow at the last
      // available slot rather than dropping it.
      scheduledTime: (slots[i] ?? slots[slots.length - 1] ?? new Date(Date.now() + 2 * 60_000)).toISOString(),
      status: 'pending' as QueueStatus,
      notificationId: randomNotificationId(),
    }
  })
  state.queue.push(...items)
  return items
}

/**
 * The normal compose path: free-written message queued for one contact (1:1)
 * or several (1:many). `overrides` carry per-recipient tweaks — exact text to
 * send that contact instead of the shared render.
 */
export function queueCustomMessage(
  contactIds: string[],
  rawText: string,
  overrides: Record<string, string> = {},
): QueueItem[] {
  const text = rawText.trim()
  if (!text) throw new Error('Message text is empty')
  if (!contactIds.length) throw new Error('No recipients selected')
  return buildQueue(contactIds, '', { rawText: text, overrides })
}

/** Render a raw message for one contact (used for compose previews). */
export function renderForContact(contact: Contact, rawText: string): string {
  return renderTemplate(rawText, varsFor(contact, ''))
}

/** Re-roll the spintax for one queued item (new wording, same recipient). */
export function rerollItem(id: string, topic?: string): void {
  const item = state.queue.find((q) => q.id === id)
  if (!item) return
  const runTopic = topic ?? item.topic ?? ''
  const contact = state.contacts.find((c) => c.id === item.contactId)
  const vars = contact
    ? varsFor(contact, runTopic)
    : { name: item.name.split(' ')[0] ?? item.name, fullname: item.name, note: '', topic: runTopic, time: '' }
  item.finalRenderedText = renderTemplate(item.rawTemplate, vars)
}

export function updateQueueItem(id: string, patch: Partial<QueueItem>): void {
  const item = state.queue.find((q) => q.id === id)
  if (item) Object.assign(item, patch)
}

// ---------- passive alarms (Feature 6) ----------

export async function scheduleQueueReminders(items: QueueItem[]): Promise<void> {
  if (!state.settings.notificationsEnabled) return
  await ensureReminderPermission()
  for (const item of items) {
    if (!item.notificationId) item.notificationId = randomNotificationId()
    await scheduleReminder({
      id: item.notificationId,
      title: `Message ${item.name} 📩`,
      body: item.finalRenderedText.slice(0, 120),
      at: new Date(item.scheduledTime),
    })
  }
}

async function scheduleFollowUpReminder(item: QueueItem, at: Date): Promise<void> {
  if (!state.settings.notificationsEnabled) return
  await ensureReminderPermission()
  if (!item.notificationId) item.notificationId = randomNotificationId()
  await scheduleReminder({
    id: item.notificationId,
    title: `Follow up with ${item.name} ⏱️`,
    body: item.finalRenderedText.slice(0, 120),
    at,
  })
}

/** Re-arm every pending alarm (used after settings changes / app resume). */
export async function rescheduleAllReminders(): Promise<void> {
  for (const item of queueList.value) {
    if (item.notificationId) await cancelReminder(item.notificationId)
  }
  await scheduleQueueReminders(queueList.value)
}

// ---------- queue transitions ----------

export async function markSent(id: string): Promise<QueueItem | undefined> {
  const q = state.queue.find((x) => x.id === id)
  if (!q) return undefined
  q.status = 'sent'
  if (q.notificationId) await cancelReminder(q.notificationId)
  return q
}

export async function skipItem(id: string): Promise<void> {
  const q = state.queue.find((x) => x.id === id)
  if (!q) return
  q.status = 'skipped'
  if (q.notificationId) await cancelReminder(q.notificationId)
}

/**
 * Feature 2 — 1-click follow-up.
 * `days = 0` means "done, no follow-up"; otherwise the same contact re-enters
 * the queue at the start of that day's sending window (skipping days that are
 * switched off) with a fresh spintax render, plus a native alarm.
 */
export async function snoozeFollowUp(
  itemId: string,
  days: number,
  topic?: string,
): Promise<QueueItem | undefined> {
  const src = state.queue.find((x) => x.id === itemId)
  if (!src) return undefined
  if (days <= 0) return src

  const plan = followUpMoment(days, state.settings.schedule)
  const at = plan.at
  const runTopic = topic ?? src.topic ?? ''

  const contact = state.contacts.find((c) => c.id === src.contactId)
  const vars = contact
    ? varsFor(contact, runTopic)
    : { name: src.name.split(' ')[0] ?? src.name, fullname: src.name, note: '', topic: runTopic, time: '' }

  const followUp: QueueItem = {
    id: uid(),
    contactId: src.contactId,
    name: src.name,
    phone: src.phone,
    rawTemplate: src.rawTemplate,
    finalRenderedText: renderTemplate(src.rawTemplate, vars),
    topic: src.topic,
    scheduledTime: at.toISOString(),
    status: 'pending',
    followUpDays: plan.daysAhead,
    notificationId: randomNotificationId(),
  }
  state.queue.push(followUp)
  await scheduleFollowUpReminder(followUp, at)
  return followUp
}

/**
 * Re-lay every pending item into the current weekly windows, in queue order.
 * Called when the schedule or the stagger changes, so an edit takes effect
 * immediately instead of only for batches queued afterwards. Sent/skipped
 * history keeps its original timestamps.
 */
export async function reschedulePending(): Promise<number> {
  const pending = state.queue
    .filter((q) => q.status === 'pending')
    .sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime))
  if (!pending.length) return 0

  // Their own old slots must not count as taken, or the batch blocks itself.
  const moving = new Set(pending.map((q) => q.id))
  const { slots } = planSlots(pending.length, new Date(), moving)
  pending.forEach((q, i) => {
    const at = slots[i] ?? slots[slots.length - 1]
    if (at) q.scheduledTime = at.toISOString()
  })
  await rescheduleAllReminders()
  return pending.length
}

/**
 * Defer a queued message N days out: the same item moves, re-wording included.
 * This is the belt's **Snooze** — nothing has been sent, so no new item is
 * created and the original does not stay behind at the head of the belt.
 * `days = 0` is a no-op, so the caller can use it as "leave it alone".
 */
export async function deferItem(
  itemId: string,
  days: number,
  topic?: string,
): Promise<QueueItem | undefined> {
  const item = state.queue.find((x) => x.id === itemId)
  if (!item || days <= 0) return item

  const plan = followUpMoment(days, state.settings.schedule)
  const runTopic = topic ?? item.topic ?? ''
  const contact = state.contacts.find((c) => c.id === item.contactId)
  const vars = contact
    ? varsFor(contact, runTopic)
    : { name: item.name.split(' ')[0] ?? item.name, fullname: item.name, note: '', topic: runTopic, time: '' }

  item.scheduledTime = plan.at.toISOString()
  item.followUpDays = plan.daysAhead
  item.finalRenderedText = renderTemplate(item.rawTemplate, vars)
  if (item.notificationId) await cancelReminder(item.notificationId)
  await scheduleFollowUpReminder(item, plan.at)
  return item
}

/** Move one item to a specific moment (the queue row's time picker). */
export async function setItemTime(id: string, at: Date): Promise<void> {
  const q = state.queue.find((x) => x.id === id)
  if (!q) return
  q.scheduledTime = at.toISOString()
  if (q.notificationId) await cancelReminder(q.notificationId)
  if (state.settings.notificationsEnabled) {
    await scheduleReminder({
      id: q.notificationId ?? (q.notificationId = randomNotificationId()),
      title: `Message ${q.name} 📩`,
      body: q.finalRenderedText.slice(0, 120),
      at,
    })
  }
}

/** Items whose slot passed while the app was closed become "now" so the belt never stalls. */
export function rollForwardOverdue(): void {
  const now = Date.now()
  for (const q of state.queue) {
    if (q.status !== 'pending') continue
    if (new Date(q.scheduledTime).getTime() < now - 60 * 60_000) {
      q.scheduledTime = new Date().toISOString()
    }
  }
}

// ---------- settings ----------

export function updateSettings(patch: Partial<Settings>): void {
  Object.assign(state.settings, patch)
}

export function setActiveTab(tab: AllTab): void {
  state.settings.activeTab = tab
}

// ---------- history ----------

/** Full send history for one contact: sent + skipped items, newest first. */
export function queueForContact(contactId: string): QueueItem[] {
  return state.queue
    .filter((q) => q.contactId === contactId && (q.status === 'sent' || q.status === 'skipped'))
    .sort((a, b) => b.scheduledTime.localeCompare(a.scheduledTime))
}

/**
 * Drop finished items older than the retention window (0 = keep forever).
 * Called once at boot; every later cleanup also runs whenever settings change.
 */
export function cleanupHistory(): void {
  const days = state.settings.retentionDays
  if (!days) return
  const cutoff = Date.now() - days * 24 * 60 * 60_000
  state.queue = state.queue.filter(
    (q) =>
      q.status === 'pending' ||
      q.status === 'snoozed' ||
      new Date(q.scheduledTime).getTime() >= cutoff,
  )
}

// ---------- backup (still local, no cloud) ----------

export function exportBackup(): string {
  return JSON.stringify(state, null, 2)
}

export async function importBackup(json: string): Promise<void> {
  const parsed = JSON.parse(json) as Partial<PersistedState>
  Object.assign(state, hydrate(parsed))
  await saver.flush()
}

export async function resetAll(): Promise<void> {
  Object.assign(state, defaultState())
  await saver.flush()
}
