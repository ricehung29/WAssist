<script setup lang="ts">
import { Timer } from 'lucide-vue-next'
import { t } from '../utils/i18n'

defineProps<{ name: string }>()
const emit = defineEmits<{ pick: [number]; close: [] }>()

const OPTIONS = [
  { days: 2, labelKey: 'followup.in2days', hintKey: 'followup.hint2', cls: 'bg-amber-100 text-amber-900' },
  { days: 1, labelKey: 'followup.tomorrow', hintKey: 'followup.hintTom', cls: 'bg-sky-100 text-sky-900' },
  { days: 0, labelKey: 'followup.done', hintKey: 'followup.hintDone', cls: 'bg-stone-100 text-stone-600' },
]
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
    @click.self="emit('close')"
  >
    <div class="w-full max-w-md rounded-t-3xl bg-white p-5 pb-8">
      <p class="text-center text-sm font-bold">{{ t('followup.sentTo', { name }) }}</p>
      <p class="mt-1 text-center text-xs text-stone-500">{{ t('followup.next') }}</p>
      <div class="mt-3 space-y-2">
        <button
          v-for="o in OPTIONS"
          :key="o.days"
          class="w-full rounded-2xl p-3 text-left transition active:scale-[0.99]"
          :class="o.cls"
          @click="emit('pick', o.days)"
        >
          <span class="flex items-center gap-2 text-sm font-bold">
            <Timer v-if="o.days" class="h-4 w-4" /> {{ t(o.labelKey) }}
          </span>
          <span class="mt-0.5 block text-[11px] opacity-70">{{ t(o.hintKey) }}</span>
        </button>
      </div>
    </div>
  </div>
</template>
