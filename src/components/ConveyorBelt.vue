<script setup lang="ts">
import { computed, ref } from 'vue'
import { Rocket, Send, Timer, FastForward, RefreshCw, Copy, Check } from 'lucide-vue-next'
import { state, nextUp, pendingQueue, sentCount, markSent, skipItem, rerollItem } from '../store'
import { t } from '../utils/i18n'
import { launchWhatsApp, copyMessage } from '../utils/whatsapp'

const emit = defineEmits<{ sent: [string]; compose: [] }>()

const topic = computed(() => 'our project')
const copied = ref(false)

const position = computed(() => {
  const item = nextUp.value
  if (!item) return ''
  const total = pendingQueue.value.length
  const idx = pendingQueue.value.findIndex((q) => q.id === item.id)
  return `${idx + 1}/${total}`
})

const currentNote = computed(() => {
  const item = nextUp.value
  if (!item) return ''
  return state.contacts.find((c) => c.id === item.contactId)?.note ?? ''
})

async function launchNext() {
  const item = nextUp.value
  if (!item) return
  launchWhatsApp(item.phone, item.finalRenderedText, state.settings.whatsappMode)
  await markSent(item.id)
  emit('sent', item.id)
}

async function skipNext() {
  const item = nextUp.value
  if (item) await skipItem(item.id)
}

function snoozeCurrent() {
  const item = nextUp.value
  if (item) emit('sent', item.id)
}

async function copyCurrent() {
  const item = nextUp.value
  if (!item) return
  copied.value = await copyMessage(item.finalRenderedText)
  window.setTimeout(() => (copied.value = false), 1500)
}
</script>

<template>
  <section aria-label="conveyor belt">
    <h2 class="flex items-center gap-1.5 text-sm font-bold uppercase tracking-wider text-stone-500">
      <Rocket class="h-4 w-4" /> {{ t('belt.title') }}
      <span
        v-if="sentCount"
        class="ml-auto rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700 ring-1 ring-emerald-200/60"
      >
        {{ sentCount }} {{ t('belt.sentSuffix') }}
      </span>
    </h2>

    <div
      v-if="nextUp"
      class="mt-2 rounded-3xl bg-gradient-to-b from-stone-800 to-stone-900 p-4 text-white shadow-xl shadow-stone-900/20 ring-1 ring-stone-700/50"
    >
      <div class="flex items-start justify-between gap-2">
        <p class="text-xs font-bold uppercase tracking-wider text-amber-400">
          {{ t('belt.nextUp', { pos: position, name: nextUp.name }) }}
        </p>
        <button
          class="rounded-full bg-stone-700/80 p-1.5 ring-1 ring-stone-600/50 transition active:scale-95"
          :aria-label="t('belt.reroll')"
          :title="t('belt.reroll')"
          @click="rerollItem(nextUp.id, topic)"
        >
          <RefreshCw class="h-3.5 w-3.5 text-stone-300" />
        </button>
      </div>

      <p
        class="mt-2 rounded-2xl bg-stone-800/80 p-3 text-sm leading-relaxed ring-1 ring-stone-700/50"
      >
        💬 “{{ nextUp.finalRenderedText }}”
      </p>

      <p v-if="currentNote" class="mt-2 text-xs italic text-amber-300">
        📝 {{ t('belt.note') }} {{ currentNote }}
      </p>

      <button
        class="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-emerald-400 to-emerald-600 p-4 text-base font-extrabold text-white shadow-lg shadow-emerald-900/40 transition active:scale-[0.99]"
        @click="launchNext"
      >
        <Send class="h-5 w-5" /> {{ t('belt.launch') }}
      </button>

      <div class="mt-2 grid grid-cols-3 gap-2">
        <button
          class="flex items-center justify-center gap-1 rounded-xl bg-stone-700/60 py-2 text-xs font-semibold ring-1 ring-stone-600/40 transition active:scale-95"
          @click="snoozeCurrent"
        >
          <Timer class="h-4 w-4" /> {{ t('belt.snooze') }}
        </button>
        <button
          class="flex items-center justify-center gap-1 rounded-xl bg-stone-700/60 py-2 text-xs font-semibold ring-1 ring-stone-600/40 transition active:scale-95"
          @click="copyCurrent"
        >
          <Check v-if="copied" class="h-4 w-4 text-emerald-400" />
          <Copy v-else class="h-4 w-4" /> {{ copied ? t('belt.copied') : t('belt.copy') }}
        </button>
        <button
          class="flex items-center justify-center gap-1 rounded-xl bg-stone-700/60 py-2 text-xs font-semibold ring-1 ring-stone-600/40 transition active:scale-95"
          @click="skipNext"
        >
          <FastForward class="h-4 w-4" /> {{ t('belt.skip') }}
        </button>
      </div>
    </div>

    <div
      v-else
      class="mt-2 rounded-3xl border-2 border-dashed border-stone-300 bg-white/50 p-6 text-center"
    >
      <p class="text-sm font-medium text-stone-500">{{ t('belt.empty') }}</p>
      <button
        class="mt-3 inline-flex items-center gap-1.5 rounded-2xl bg-gradient-to-b from-emerald-400 to-emerald-600 px-4 py-2 text-sm font-bold text-white shadow-md shadow-emerald-200 transition active:scale-95"
        @click="emit('compose')"
      >
        <Send class="h-4 w-4" /> {{ t('belt.emptyCta') }}
      </button>
    </div>
  </section>
</template>
