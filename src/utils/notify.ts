// Feature 6 — Passive alarm stub over @capacitor/local-notifications.
// Web-safe: lazily imports the plugin; falls back to Web Notifications + setTimeout.

export interface Reminder {
  id: number
  title: string
  body: string
  at: Date
}

type LocalNotificationsPlugin = typeof import('@capacitor/local-notifications')['LocalNotifications']

/** True only inside the Capacitor native shell (Android/iOS), false on plain web. */
export function isNativeShell(): boolean {
  const w = globalThis as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }
  try {
    return w.Capacitor?.isNativePlatform?.() ?? false
  } catch {
    return false
  }
}

/**
 * Resolve the native plugin, or `null` on plain web.
 *
 * The wrapper object matters: Capacitor's plugin proxy is a *thenable* that
 * throws `"LocalNotifications.then()" is not implemented on web`, so it must
 * never be an async function's direct return value — awaiting that would call
 * `.then()` on it. Hiding it behind `{ plugin }` keeps the proxy untouched.
 */
async function nativePlugin(): Promise<{ plugin: LocalNotificationsPlugin } | null> {
  if (!isNativeShell()) return null
  try {
    const mod = await import('@capacitor/local-notifications')
    if (!mod.LocalNotifications) return null
    return { plugin: mod.LocalNotifications }
  } catch {
    return null
  }
}

export const CHANNEL_ID = 'launch-queue'

/** Android 8+ requires a channel for the notification to display at all. */
let channelReady = false
async function ensureChannel(plugin: LocalNotificationsPlugin): Promise<void> {
  if (channelReady) return
  channelReady = true
  if (typeof plugin.createChannel !== 'function') return
  try {
    await plugin.createChannel({
      id: CHANNEL_ID,
      name: 'Launch Queue',
      description: 'Reminders for scheduled WhatsApp messages',
      importance: 4, // HIGH — heads-up, so the morning slot is visible
      vibration: true,
    })
  } catch {
    /* channel already exists or platform does not support channels */
  }
}

export async function requestReminderPermission(): Promise<boolean> {
  const native = await nativePlugin()
  if (native) {
    try {
      await ensureChannel(native.plugin)
      const res = await native.plugin.requestPermissions()
      return res.display === 'granted'
    } catch {
      return false
    }
  }
  if (typeof window === 'undefined' || !('Notification' in window)) return false
  try {
    return (await Notification.requestPermission()) === 'granted'
  } catch {
    return false
  }
}

/** Schedule a passive OS-level reminder (fires even if the app is killed). */
export async function scheduleReminder(r: Reminder): Promise<void> {
  const native = await nativePlugin()
  if (native) {
    try {
      await native.plugin.schedule({
        notifications: [
          {
            id: r.id,
            title: r.title,
            body: r.body,
            channelId: CHANNEL_ID,
            schedule: { at: r.at },
          },
        ],
      })
      return
    } catch {
      /* fall through to the web fallback */
    }
  }
  if (typeof window === 'undefined') return
  const delay = r.at.getTime() - Date.now()
  if (delay <= 0) return
  window.setTimeout(() => {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(r.title, { body: r.body })
    }
  }, delay)
}

export async function cancelReminder(id: number): Promise<void> {
  const native = await nativePlugin()
  if (!native) return
  try {
    await native.plugin.cancel({ notifications: [{ id }] })
  } catch {
    /* already fired or never scheduled — safe to ignore */
  }
}

/** Ask for permission once per session, then remember the answer. */
let permissionAsked = false
export async function ensureReminderPermission(): Promise<boolean> {
  if (permissionAsked) return true
  permissionAsked = true
  return requestReminderPermission()
}

/**
 * Android 12+ gates exact alarms behind a separate user setting; without it the
 * OS batches (or drops) a reminder. Send the user to the right screen once.
 * Returns true when exact alarms are usable. No-op off Android.
 */
export async function ensureExactAlarms(): Promise<boolean> {
  const native = await nativePlugin()
  if (!native) return true
  const plugin = native.plugin as Partial<LocalNotificationsPlugin>
  if (!plugin.checkExactNotificationSetting) return true // iOS / Android < 12
  try {
    const status = await plugin.checkExactNotificationSetting()
    if (status.exact_alarm === 'granted') return true
    const next = await plugin.changeExactNotificationSetting?.()
    return next?.exact_alarm === 'granted'
  } catch {
    return false
  }
}
