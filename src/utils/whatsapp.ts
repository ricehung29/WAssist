// Feature 3 — Native whatsapp:// deep links (no browser-tab leftover).

export type WhatsAppMode = 'auto' | 'native' | 'web'

/** Which of the two WhatsApp apps to hand a message to. */
export type WhatsAppTarget = 'whatsapp' | 'business'

interface WaAppsResult {
  whatsapp: boolean
  business: boolean
}

/** Shape of the Android-only `WaApps` plugin (see android/.../WaAppsPlugin.java). */
interface WaAppsPlugin {
  installed(): Promise<WaAppsResult>
  open(options: { phone: string; text?: string; target: WhatsAppTarget }): Promise<void>
}

/** True on Capacitor native shell or a mobile browser UA. */
export function isNativeOrMobile(): boolean {
  if (typeof navigator === 'undefined') return false
  const w = globalThis as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }
  try {
    if (w.Capacitor?.isNativePlatform?.()) return true
  } catch {
    /* ignore */
  }
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
}

/**
 * The native plugin object, or null anywhere it cannot work.
 *
 * Only Android can target one specific app: both WhatsApp builds register the
 * same `whatsapp://` scheme, and only Android lets you pin an intent to a
 * package name. iOS hands the scheme to whichever app claims it.
 */
function waApps(): WaAppsPlugin | null {
  const w = globalThis as unknown as {
    Capacitor?: {
      isNativePlatform?: () => boolean
      getPlatform?: () => string
      Plugins?: Record<string, unknown>
    }
  }
  try {
    if (!w.Capacitor?.isNativePlatform?.()) return null
    if (w.Capacitor.getPlatform?.() !== 'android') return null
    const candidate = w.Capacitor.Plugins?.WaApps
    if (candidate && typeof (candidate as WaAppsPlugin).open === 'function') {
      return candidate as WaAppsPlugin
    }
  } catch {
    /* ignore */
  }
  return null
}

/** Which WhatsApp builds this device can open. Both false on plain web / iOS. */
export async function installedWhatsAppApps(): Promise<WaAppsResult> {
  const plugin = waApps()
  if (!plugin) return { whatsapp: false, business: false }
  try {
    const res = await plugin.installed()
    return { whatsapp: Boolean(res.whatsapp), business: Boolean(res.business) }
  } catch {
    return { whatsapp: false, business: false }
  }
}

/** True when per-app sending is possible (Android shell with the plugin). */
export function waAppsAvailable(): boolean {
  return waApps() !== null
}

function useNativeScheme(mode: WhatsAppMode): boolean {
  if (mode === 'native') return true
  if (mode === 'web') return false
  return isNativeOrMobile()
}

/** Native scheme on mobile, wa.me fallback on desktop web. */
export function buildWhatsAppLink(
  phone: string,
  text: string,
  mode: WhatsAppMode = 'auto',
): string {
  const encoded = encodeURIComponent(text)
  if (useNativeScheme(mode)) return `whatsapp://send?phone=${phone}&text=${encoded}`
  return `https://wa.me/${phone}?text=${encoded}`
}

/**
 * Fire the deep link.
 *
 * Navigating a webview straight to `whatsapp://` leaves a blank page behind if
 * WhatsApp is not installed, so on native we hand off through an iframe and fall
 * back to `wa.me` when the OS never took over.
 */
export function launchWhatsApp(
  phone: string,
  text: string,
  mode: WhatsAppMode = 'auto',
): string {
  const link = buildWhatsAppLink(phone, text, mode)
  if (link.startsWith('whatsapp://')) {
    const iframe = document.createElement('iframe')
    iframe.style.display = 'none'
    iframe.src = link
    document.body.appendChild(iframe)
    const fallback = buildWhatsAppLink(phone, text, 'web')
    window.setTimeout(() => {
      iframe.remove()
      // Still foregrounded after a beat → WhatsApp was never opened.
      if (document.visibilityState === 'visible') {
        window.open(fallback, '_blank', 'noopener')
      }
    }, 1200)
    return link
  }
  window.location.href = link
  return link
}

/**
 * Hand a chat to one *named* app.
 *
 * Returns false when the target app could not be picked — no plugin (iOS,
 * desktop web, or a browser tab) or the app is not installed — leaving the
 * caller to decide on a fallback rather than opening the wrong WhatsApp.
 */
export async function launchInApp(
  phone: string,
  text: string,
  target: WhatsAppTarget,
  kind: 'send' | 'chat' = 'send',
): Promise<boolean> {
  const plugin = waApps()
  if (!plugin) return false
  try {
    await plugin.open({ phone, text: kind === 'send' && text ? text : undefined, target })
    return true
  } catch {
    return false
  }
}

/**
 * Open a plain chat window with a contact — no prefilled text.
 * Same native-first strategy as `launchWhatsApp`.
 */
export function openChat(phone: string, mode: WhatsAppMode = 'auto'): string {
  const link = useNativeScheme(mode)
    ? `whatsapp://send?phone=${phone}`
    : `https://wa.me/${phone}`
  if (link.startsWith('whatsapp://')) {
    const iframe = document.createElement('iframe')
    iframe.style.display = 'none'
    iframe.src = link
    document.body.appendChild(iframe)
    const fallback = `https://wa.me/${phone}`
    window.setTimeout(() => {
      iframe.remove()
      // Still foregrounded after a beat → WhatsApp was never opened.
      if (document.visibilityState === 'visible') {
        window.open(fallback, '_blank', 'noopener')
      }
    }, 1200)
    return link
  }
  window.location.href = link
  return link
}

/**
 * Send a message, preferring one named app and degrading gracefully.
 *
 * On Android the plugin pins the intent to WhatsApp or WhatsApp Business. Every
 * other platform (iOS, desktop web, a browser tab) falls back to the plain
 * scheme link, which is the best that platform can do.
 */
export async function sendToApp(
  phone: string,
  text: string,
  target: WhatsAppTarget,
  mode: WhatsAppMode = 'auto',
): Promise<void> {
  if (await launchInApp(phone, text, target, 'send')) return
  launchWhatsApp(phone, text, mode)
}

/** Open a bare chat in one named app, with the same fallback chain. */
export async function openChatInApp(
  phone: string,
  target: WhatsAppTarget,
  mode: WhatsAppMode = 'auto',
): Promise<void> {
  if (await launchInApp(phone, '', target, 'chat')) return
  openChat(phone, mode)
}

/** Copy the message instead of sending — useful when WhatsApp is unavailable. */
export async function copyMessage(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
