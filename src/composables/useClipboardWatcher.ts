// Feature 4 — clipboard auto-detection on app focus / resume.

import { ref, onMounted, onUnmounted } from 'vue'
import { findPhone } from '../utils/sanitizer'

/**
 * Watches the clipboard whenever the app regains focus and surfaces the first
 * phone number it finds. Reads are permission-gated by the browser; failures
 * are silent (the banner simply never appears).
 */
export function useClipboardWatcher(defaultPrefix: () => string) {
  const detected = ref<string | null>(null)

  async function check() {
    if (detected.value) return
    if (document.visibilityState !== 'visible') return
    try {
      const text = await navigator.clipboard?.readText()
      if (!text) return
      const hit = findPhone(text, defaultPrefix())
      if (hit) detected.value = hit.phone
    } catch {
      /* permission denied or insecure context — nothing to show */
    }
  }

  function dismiss() {
    detected.value = null
  }

  onMounted(() => {
    window.addEventListener('focus', check)
    document.addEventListener('visibilitychange', check)
    void check()
  })

  onUnmounted(() => {
    window.removeEventListener('focus', check)
    document.removeEventListener('visibilitychange', check)
  })

  return { detected, dismiss }
}
