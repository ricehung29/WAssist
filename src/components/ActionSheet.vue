<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { X } from 'lucide-vue-next'
import { t } from '../utils/i18n'

defineProps<{ title: string }>()
const emit = defineEmits<{ close: [] }>()

/**
 * Bottom sheet on a phone, centred dialog on a desktop.
 *
 * The `lg:` overrides flip the alignment and corner rounding; the mobile classes
 * stay the ones that matter for touch. Escape closes, because a desktop user
 * reaching for the mouse to dismiss a dialog is a papercut.
 */
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}

onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div
    class="fixed inset-0 z-40 flex items-end justify-center bg-black/40 lg:items-center lg:p-6"
    @click.self="emit('close')"
  >
    <div
      class="max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 pb-[calc(2rem+env(safe-area-inset-bottom))] shadow-2xl lg:max-h-[85vh] lg:max-w-lg lg:rounded-3xl lg:pb-5"
      role="dialog"
      aria-modal="true"
    >
      <div class="flex items-center justify-between gap-3">
        <p class="text-sm font-bold">{{ title }}</p>
        <button
          class="rounded-full bg-stone-100 p-1.5 transition hover:bg-stone-200 active:scale-95"
          :aria-label="t('sheet.close')"
          @click="emit('close')"
        >
          <X class="h-4 w-4" />
        </button>
      </div>
      <slot />
    </div>
  </div>
</template>
