// Choosing between WhatsApp and WhatsApp Business.
//
// Both apps register the same `whatsapp://` scheme, so a bare scheme link always
// lands on whichever one Android considers the default. Only the Android native
// plugin can pin a send to one specific app (see utils/whatsapp.ts), so this
// composable owns the one piece of state that decision needs: what is installed,
// what the user prefers, and whether this particular send has to ask.

import { computed, ref } from 'vue'
import { state } from '../store'
import {
  installedWhatsAppApps,
  launchInApp,
  launchWhatsApp,
  openChat,
  waAppsAvailable,
  type WhatsAppTarget,
} from '../utils/whatsapp'

export interface PendingSend {
  phone: string
  text: string
  kind: 'send' | 'chat'
  resolve: () => void
}

/** Module-level so the sheet and every call site share one instance. */
export const installed = ref({ whatsapp: false, business: false })
export const pendingSend = ref<PendingSend | null>(null)

/**
 * True only inside the Android shell, where pinning a send to one specific app
 * is possible. The sender picker and its setting are meaningless anywhere else.
 */
export const targetSelectionSupported = ref(false)

let probed = false

/** Read the device's installed WhatsApp apps once. No-op off Android. */
export async function probeWhatsAppApps(): Promise<void> {
  if (probed) return
  probed = true
  targetSelectionSupported.value = waAppsAvailable()
  if (!targetSelectionSupported.value) return
  installed.value = await installedWhatsAppApps()
}

/** Test seam: let the next `probeWhatsAppApps()` re-query the plugin. */
export function __resetProbe(): void {
  probed = false
}

/** Both builds present and the user has not committed to one. */
export const targetIsAmbiguous = computed(
  () => installed.value.whatsapp && installed.value.business,
)

/**
 * The app to send through, or null when the user still has to choose.
 *
 * A preference for an app that is not installed degrades to the other one
 * instead of failing, and `ask` only actually prompts while both are present —
 * so the picker never appears with a single option.
 */
export function resolveTarget(): WhatsAppTarget | null {
  const pref = state.settings.waTarget
  const { whatsapp, business } = installed.value

  if (pref !== 'ask') {
    if (pref === 'business' && business) return 'business'
    if (pref === 'whatsapp' && whatsapp) return 'whatsapp'
    if (whatsapp) return 'whatsapp'
    if (business) return 'business'
    // Neither detected (iOS, desktop, or plugin unavailable): honour the
    // preference and let the caller's fallback chain deal with it.
    return pref
  }

  if (whatsapp && business) return null
  if (business) return 'business'
  return 'whatsapp'
}

/**
 * Send a message through the preferred app.
 *
 * Resolves once the hand-off has actually happened — immediately when the
 * target is known, or after the user answers the picker — so callers can mark
 * the queue item sent on the same beat.
 */
export function sendMessage(phone: string, text: string): Promise<void> {
  return dispatch(phone, text, 'send')
}

/** Open a bare chat (no prefilled text) through the preferred app. */
export function openChatWith(phone: string): Promise<void> {
  return dispatch(phone, '', 'chat')
}

function dispatch(phone: string, text: string, kind: 'send' | 'chat'): Promise<void> {
  const target = resolveTarget()
  if (target) return perform(phone, text, kind, target)
  return new Promise<void>((resolve) => {
    pendingSend.value = { phone, text, kind, resolve }
  })
}

async function perform(
  phone: string,
  text: string,
  kind: 'send' | 'chat',
  target: WhatsAppTarget,
): Promise<void> {
  const mode = state.settings.whatsappMode
  const pinned = await launchInApp(phone, text, target, kind)
  if (pinned) return
  // No way to pin (iOS, desktop, browser tab, or the app vanished): fall back
  // to the plain scheme link, which is the best those platforms can do.
  if (kind === 'chat') openChat(phone, mode)
  else launchWhatsApp(phone, text, mode)
}

/** Answer the picker. Safe to call with the sheet already dismissed. */
export async function chooseTarget(target: WhatsAppTarget): Promise<void> {
  const pending = pendingSend.value
  pendingSend.value = null
  if (!pending) return
  await perform(pending.phone, pending.text, pending.kind, target)
  pending.resolve()
}

/** Dismiss the picker without sending. The caller's promise still settles. */
export function cancelPendingSend(): void {
  const pending = pendingSend.value
  pendingSend.value = null
  pending?.resolve()
}