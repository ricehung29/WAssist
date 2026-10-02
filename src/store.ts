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
import { scheduleReminder, cancelReminder, ensureReminderPermission } from './utils/notify'
import { loadState, createSaver } from './db'

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function todayKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`
}

function randomNotificationId(): number {
  return Math.floor(Math.random() * 2_000_000_000)
}

export const DEFAULT_SETTINGS: Settings = {
  locale: 'zh-HK',
  defaultPrefix: '852',
  whatsappMode: 'auto',
  waTarget: 'ask',
  startTime: '09:30',
  staggerMinutes: 5,
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
  const settings = { ...base.settings, ...(saved.settings ?? {}) }
  // Guard against blobs written before the locale setting existed
  // (or with a bogus locale from a hand-edited backup).
  if (settings.locale !== 'en' && settings.locale !== 'zh-HK') {
    settings.locale = base.settings.locale
  }
  if (
    settings.waTarget !== 'ask' &&
    settings.waTarget !== 'whatsapp' &&
    settings.waTarget !== 'business'
  ) {
    settings.waTarget = base.settings.waTarget
  }
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
 * The conveyor belt only ever runs *today's* due messages. Anything scheduled
 * for a later day stays queued (see `queueList`) but never blocks the belt.
 */
export const pendingQueue = computed(() =>
  state.queue
    .filter((q) => q.status === 'pending' && isToday(q.scheduledTime))
    .sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime)),
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

/** Everything still worth showing in the queue list (today, later days, snoozed). */
export const queueList = computed(() =>
  [...state.queue]
    .filter((q) => q.status === 'pending' || q.status === 'snoozed')
    .sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime)),
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

/** First slot today at settings.startTime (or now + 2 min if that has passed), then staggered. */
export function nextSlot(index: number): Date {
  const [h, m] = state.settings.startTime.split(':').map((n) => Number.parseInt(n, 10))
  const start = new Date()
  start.setHours(Number.isFinite(h) ? h! : 9, Number.isFinite(m) ? m! : 30, 0, 0)
  if (start.getTime() < Date.now()) start.setTime(Date.now() + 2 * 60_000)
  start.setMinutes(start.getMinutes() + index * state.settings.staggerMinutes)
  return start
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
  const offset = pendingQueue.value.length
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
      scheduledTime: nextSlot(offset + i).toISOString(),
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
export function rerollItem(id: string, topic = ''): void {
  const item = state.queue.find((q) => q.id === id)
  if (!item) return
  const contact = state.contacts.find((c) => c.id === item.contactId)
  const vars = contact
    ? varsFor(contact, topic)
    : { name: item.name.split(' ')[0] ?? item.name, fullname: item.name, note: '', topic, time: '' }
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
  for (const item of pendingQueue.value) {
    if (item.notificationId) await cancelReminder(item.notificationId)
  }
  await scheduleQueueReminders(pendingQueue.value)
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
 * the queue at 9am N days out with a fresh spintax render, plus a native alarm.
 */
export async function snoozeFollowUp(
  itemId: string,
  days: number,
  topic = '',
): Promise<QueueItem | undefined> {
  const src = state.queue.find((x) => x.id === itemId)
  if (!src) return undefined
  if (days <= 0) return src

  const at = new Date()
  at.setDate(at.getDate() + days)
  at.setHours(9, 0, 0, 0)

  const contact = state.contacts.find((c) => c.id === src.contactId)
  const vars = contact
    ? varsFor(contact, topic)
    : { name: src.name.split(' ')[0] ?? src.name, fullname: src.name, note: '', topic, time: '' }

  const followUp: QueueItem = {
    id: uid(),
    contactId: src.contactId,
    name: src.name,
    phone: src.phone,
    rawTemplate: src.rawTemplate,
    finalRenderedText: renderTemplate(src.rawTemplate, vars),
    scheduledTime: at.toISOString(),
    status: 'pending',
    followUpDays: days,
    notificationId: randomNotificationId(),
  }
  state.queue.push(followUp)
  await scheduleFollowUpReminder(followUp, at)
  return followUp
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
