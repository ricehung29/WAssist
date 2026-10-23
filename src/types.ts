// Core Data Schema — WAssist (personal WhatsApp cockpit)

export type Locale = 'en' | 'zh-HK'

export interface Contact {
  id: string
  name: string
  phone: string // Sanitized, e.g. "85291234567"
  note?: string // Micro-note context
  tags: string[]
  createdAt: number
}

export interface MessageTemplate {
  id: string
  title: string
  content: string // Supports Spintax and {{variables}}
}

export type QueueStatus = 'pending' | 'sent' | 'skipped' | 'snoozed'

/**
 * Which WhatsApp build to hand messages to. `ask` prompts per send (only on
 * Android, and only when both apps are actually installed).
 */
export type WaTarget = 'whatsapp' | 'business'
export type WaTargetPreference = WaTarget | 'ask'

export interface QueueItem {
  id: string
  contactId: string
  name: string
  phone: string
  rawTemplate: string
  finalRenderedText: string // Spintax and variables resolved
  scheduledTime: string // ISO format
  status: QueueStatus
  notificationId?: number
  followUpDays?: number
  /**
   * The run's topic, kept so a re-roll or a snooze re-renders with the same
   * `{{topic}}` the message was queued with (Compose could not set one at all
   * before, so older items simply have none).
   */
  topic?: string
}

/** A personal quick-text snippet — tap to copy, paste anywhere. */
export interface Snippet {
  id: string
  title: string
  body: string
}

/**
 * One day's sending window. `day` follows `Date#getDay()`: 0 = Sunday … 6 = Saturday.
 * `startTime` / `endTime` are local "HH:MM"; a disabled day is skipped entirely.
 */
export interface DaySchedule {
  day: number
  enabled: boolean
  startTime: string
  endTime: string
}

export interface Settings {
  /** UI language. */
  locale: Locale
  /** Local country prefix auto-added to bare 8-digit numbers. */
  defaultPrefix: string
  /** Deep-link strategy: auto = native scheme on mobile, wa.me on desktop. */
  whatsappMode: 'auto' | 'native' | 'web'
  /** Default app for sends: a specific WhatsApp build, or ask each time. */
  waTarget: WaTargetPreference
  /** Minutes between consecutive queue items (anti-spam pacing). */
  staggerMinutes: number
  /**
   * Weekly sending windows. Replaces the single `startTime`; a legacy blob's
   * `startTime` is folded into every day's window on hydrate.
   */
  schedule: DaySchedule[]
  /** Schedule passive OS-level reminders for queued items. */
  notificationsEnabled: boolean
  /** Open tab on launch. */
  activeTab: AllTab
  /** Days old sent/skipped items keep before auto-cleanup (0 = keep forever). */
  retentionDays: number
}

/** Dashboard categories — Compose & Templates live in the Send tab. */
export type AllTab = 'send' | 'people' | 'words' | 'history'

export interface PersistedState {
  contacts: Contact[]
  templates: MessageTemplate[]
  queue: QueueItem[]
  activeTemplateId: string
  /** Pinned chats for one-tap open (contact ids, display order). */
  favorites: string[]
  /** Personal quick-text shortcuts. */
  snippets: Snippet[]
  settings: Settings
}
