<script setup lang="ts">
import { computed, ref } from 'vue'
import { Check, X, Send, PenLine } from 'lucide-vue-next'
import { state, sentCount, sentCountToday, pendingQueue } from '../store'
import { t } from '../utils/i18n'
import { queueItemText } from '../utils/message'
import { launchWhatsApp } from '../utils/whatsapp'

const emit = defineEmits<{ compose: [] }>()
const filter = ref<'all' | 'sent' | 'skipped'>('sent')

const filters = computed(() => [
  { id: 'sent' as const, label: t('history.sent') },
  { id: 'skipped' as const, label: t('history.skipped') },
  { id: 'all' as const, label: t('history.all') },
])

const items = computed(() => {
  const list = state.queue.filter((q) =>
    filter.value === 'all'
      ? q.status === 'sent' || q.status === 'skipped'
      : q.status === filter.value,
  )
  return list.sort((a, b) => b.scheduledTime.localeCompare(a.scheduledTime))
})

function fmt(iso: string) {
  return new Date(iso).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function reply(q: { phone: string; finalRenderedText: string }) {
  launchWhatsApp(q.phone, q.finalRenderedText, state.settings.whatsappMode)
}
</script>

<template>
  <section aria-label="history">
    <div class="flex gap-2">
      <button
        v-for="f in filters"
        :key="f.id"
        class="rounded-full px-3 py-1 text-xs font-bold transition active:scale-95"
        :class="filter === f.id ? 'bg-stone-900 text-white shadow-sm' : 'bg-white text-stone-500 shadow-sm ring-1 ring-stone-100'"
        @click="filter = f.id"
      >
        {{ f.label }}
      </button>
    </div>

    <div class="mt-2 grid grid-cols-3 gap-2 text-center">
      <div class="rounded-2xl bg-white p-2.5 shadow-md shadow-stone-200/60 ring-1 ring-stone-100">
        <p class="text-lg font-extrabold text-emerald-600">{{ sentCountToday }}</p>
        <p class="text-[10px] font-bold uppercase tracking-wider text-stone-400">
          {{ t('history.today') }}
        </p>
      </div>
      <div class="rounded-2xl bg-white p-2.5 shadow-md shadow-stone-200/60 ring-1 ring-stone-100">
        <p class="text-lg font-extrabold text-stone-700">{{ sentCount }}</p>
        <p class="text-[10px] font-bold uppercase tracking-wider text-stone-400">
          {{ t('history.allTime') }}
        </p>
      </div>
      <div class="rounded-2xl bg-stone-900 p-2.5 shadow-md ring-1 ring-stone-700">
        <p class="text-lg font-extrabold text-amber-400">{{ pendingQueue.length }}</p>
        <p class="text-[10px] font-bold uppercase tracking-wider text-stone-400">
          {{ t('history.queuedNow') }}
        </p>
      </div>
    </div>

    <ul class="mt-3 space-y-2">
      <li
        v-for="q in items"
        :key="q.id"
        class="rounded-2xl bg-white p-3 shadow-md shadow-stone-200/60 ring-1 ring-stone-100"
      >
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0 flex-1">
            <p class="flex items-center gap-1.5 text-sm font-bold">
              <Check v-if="q.status === 'sent'" class="h-3.5 w-3.5 shrink-0 text-emerald-600" />
              <X v-else class="h-3.5 w-3.5 shrink-0 text-stone-400" />
              <span class="truncate">{{ q.name }}</span>
              <span class="shrink-0 text-[11px] font-semibold text-stone-400">{{
                fmt(q.scheduledTime)
              }}</span>
            </p>
            <p class="mt-0.5 line-clamp-2 text-xs text-stone-500">{{ queueItemText(q) }}</p>
          </div>
          <button
            v-if="q.status === 'sent'"
            class="shrink-0 rounded-full bg-emerald-100 p-2 transition active:scale-95"
            :aria-label="t('history.reply')"
            @click="reply(q)"
          >
            <Send class="h-4 w-4 text-emerald-700" />
          </button>
        </div>
      </li>
      <li
        v-if="!items.length"
        class="rounded-2xl border-2 border-dashed border-stone-200 bg-white/50 p-5 text-center text-xs text-stone-400"
      >
        {{ t('history.empty') }}
        <button
          class="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl bg-stone-900 py-2 text-xs font-bold text-white transition active:scale-95"
          @click="emit('compose')"
        >
          <PenLine class="h-3.5 w-3.5" /> {{ t('history.compose') }}
        </button>
      </li>
    </ul>
  </section>
</template>
