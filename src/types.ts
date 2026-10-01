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
}

/** A personal quick-text snippet — tap to copy, paste anywhere. */
export interface Snippet {
  id: string
  title: string
  body: string
}

export interface Settings {
  /** UI language. */
  locale: Locale
  /** Local country prefix auto-added to bare 8-digit numbers. */
  defaultPrefix: string
  /** Deep-link strategy: auto = native scheme on mobile, wa.me on desktop. */
  whatsappMode: 'auto' | 'native' | 'web'
  /** First message of the day, "HH:MM" local. */
  startTime: string
  /** Minutes between consecutive queue items (anti-spam pacing). */
  staggerMinutes: number
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
