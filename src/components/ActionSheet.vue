<script setup lang="ts">
import { X } from 'lucide-vue-next'
import { t } from '../utils/i18n'

defineProps<{ title: string }>()
const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <div
    class="fixed inset-0 z-40 flex items-end justify-center bg-black/40"
    @click.self="emit('close')"
  >
    <div class="max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 pb-[calc(2rem+env(safe-area-inset-bottom))] shadow-2xl">
      <div class="flex items-center justify-between gap-3">
        <p class="text-sm font-bold">{{ title }}</p>
        <button
          class="rounded-full bg-stone-100 p-1.5 transition active:scale-95"
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
