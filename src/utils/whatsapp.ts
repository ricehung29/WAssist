// Feature 3 — Native whatsapp:// deep links (no browser-tab leftover).

export type WhatsAppMode = 'auto' | 'native' | 'web'

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

/** Copy the message instead of sending — useful when WhatsApp is unavailable. */
export async function copyMessage(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
