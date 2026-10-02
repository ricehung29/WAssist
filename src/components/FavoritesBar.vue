<script setup lang="ts">
import { Star } from 'lucide-vue-next'
import { state, favoriteContacts } from '../store'
import { t } from '../utils/i18n'
import { openChatWith } from '../composables/useWaTarget'

/** One tap → straight into the WhatsApp chat, no prefilled text. */
function open(phone: string) {
  void openChatWith(phone)
}

function initial(name: string): string {
  return (name.trim()[0] ?? '?').toUpperCase()
}
</script>

<template>
  <section v-if="state.contacts.length" class="mt-4" aria-label="pinned chats">
    <h2 class="flex items-center gap-1.5 text-sm font-bold uppercase tracking-wider text-stone-500">
      <Star class="h-4 w-4" /> {{ t('pins.title') }}
    </h2>

    <div
      v-if="favoriteContacts.length"
      class="no-scrollbar mt-2 flex gap-3 overflow-x-auto pb-1"
    >
      <button
        v-for="c in favoriteContacts"
        :key="c.id"
        class="flex w-16 shrink-0 flex-col items-center gap-1 transition active:scale-95"
        @click="open(c.phone)"
      >
        <span
          class="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-lg font-extrabold text-white shadow-md shadow-emerald-200 ring-2 ring-white"
        >
          {{ initial(c.name) }}
        </span>
        <span class="w-full truncate text-center text-[11px] font-semibold text-stone-600">
          {{ c.name }}
        </span>
      </button>
    </div>
    <p
      v-else
      class="mt-2 rounded-2xl bg-white p-3 text-xs text-stone-500 shadow-md shadow-stone-200/60 ring-1 ring-stone-100"
    >
      {{ t('pins.empty') }}
    </p>
  </section>
</template>
