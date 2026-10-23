<script setup lang="ts">
// A non-blocking follow-up prompt.
//
// It used to be a modal sheet, which meant a batch of 120 became 120 dialogs
// between sends. The same three choices now sit in a bar under the belt: the
// next message is already loaded and LAUNCH stays one tap away.
//
// Only the most recent send owns the bar — picking a choice, dismissing it, or
// sending the next message all close it. Anyone who needs a follow-up later
// still has the contact's own History and the Person sheet.
import { Timer, X } from 'lucide-vue-next'
import { t } from '../utils/i18n'

defineProps<{ name: string }>()
const emit = defineEmits<{ pick: [number]; close: [] }>()
</script>

<template>
  <div
    class="mt-2 flex flex-wrap items-center gap-1.5 rounded-2xl bg-emerald-50 p-2 ring-1 ring-emerald-200"
    role="status"
  >
    <span class="min-w-0 flex-1 truncate pl-1 text-xs font-bold text-emerald-800">
      {{ t('followup.sentTo', { name }) }}
      <span class="font-medium text-emerald-700">· {{ t('followup.next') }}</span>
    </span>

    <button
      class="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-[11px] font-bold text-amber-900 transition active:scale-95"
      @click="emit('pick', 2)"
    >
      <Timer class="h-3 w-3" /> {{ t('followup.in2days') }}
    </button>
    <button
      class="rounded-full bg-sky-100 px-2 py-1 text-[11px] font-bold text-sky-900 transition active:scale-95"
      @click="emit('pick', 1)"
    >
      {{ t('followup.tomorrow') }}
    </button>
    <button
      class="rounded-full bg-white px-2 py-1 text-[11px] font-bold text-stone-600 ring-1 ring-stone-200 transition active:scale-95"
      @click="emit('pick', 0)"
    >
      {{ t('followup.done') }}
    </button>

    <button
      class="rounded-full p-1 text-emerald-700/70 transition hover:bg-white/60 active:scale-95"
      :aria-label="t('sheet.close')"
      @click="emit('close')"
    >
      <X class="h-3.5 w-3.5" />
    </button>
  </div>
</template>
