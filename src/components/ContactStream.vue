<script setup lang="ts">
import { computed, ref } from 'vue'
import { Send, X, Trash2, StickyNote, Phone, ChevronDown, MessageCircle, Star, Check } from 'lucide-vue-next'
import {
  state,
  queueList,
  removeContact,
  skipItem,
  markSent,
  buildQueue,
  updateContact,
  toggleFavorite,
  isToday,
} from '../store'
import { t } from '../utils/i18n'
import { launchWhatsApp, openChat } from '../utils/whatsapp'
import { queueItemText } from '../utils/message'
import SwipeRow from './SwipeRow.vue'
import ContactSheet from './ContactSheet.vue'
import type { QueueItem } from '../types'

const props = withDefaults(
  defineProps<{ initialTab?: 'queue' | 'contacts'; showTabs?: boolean }>(),
  { initialTab: 'queue', showTabs: true },
)

const tab = ref<'queue' | 'contacts'>(props.initialTab)
const showSent = ref(false)
const editingNote = ref<string | null>(null)
const detailId = ref<string | null>(null)

/** Queue tab counts everything still owed, including later-day follow-ups. */
const queueBadge = computed(() => queueList.value.length)

/** Split the queue so later-day follow-ups group under an "Upcoming" header. */
const todaysQueue = computed(() => queueList.value.filter((q) => isToday(q.scheduledTime)))
const upcomingItems = computed(() => queueList.value.filter((q) => !isToday(q.scheduledTime)))

const sentItems = computed(() => state.queue.filter((q) => q.status === 'sent'))

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function fmtDay(iso: string) {
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

async function sendNow(q: QueueItem) {
  launchWhatsApp(q.phone, q.finalRenderedText, state.settings.whatsappMode)
  await markSent(q.id)
}

/** Queue a fresh templated message for one contact (from the contacts tab). */
function queueAgain(contactId: string) {
  buildQueue([contactId], '')
  if (props.showTabs) tab.value = 'queue'
}

/** Jump straight into the WhatsApp thread, nothing prefilled. */
function chatNow(phone: string) {
  openChat(phone, state.settings.whatsappMode)
}

function isFavorite(contactId: string): boolean {
  return state.favorites.includes(contactId)
}
</script>

<template>
  <section class="mt-5">
    <h2
      v-if="!showTabs"
      class="flex items-center gap-1.5 text-sm font-bold uppercase tracking-wider text-stone-500"
    >
      {{ tab === 'queue' ? `${t('queue.title')} (${queueBadge})` : `${t('queue.contacts')} (${state.contacts.length})` }}
    </h2>

    <div v-if="showTabs" class="flex items-center gap-2">
      <button
        class="rounded-full px-3 py-1 text-xs font-bold transition active:scale-95"
        :class="tab === 'queue' ? 'bg-stone-900 text-white shadow-sm' : 'bg-white text-stone-500 shadow-sm ring-1 ring-stone-100'"
        @click="tab = 'queue'"
      >
        {{ t('queue.title') }} ({{ queueBadge }})
      </button>
      <button
        class="rounded-full px-3 py-1 text-xs font-bold transition active:scale-95"
        :class="tab === 'contacts' ? 'bg-stone-900 text-white shadow-sm' : 'bg-white text-stone-500 shadow-sm ring-1 ring-stone-100'"
        @click="tab = 'contacts'"
      >
        {{ t('queue.contacts') }} ({{ state.contacts.length }})
      </button>
    </div>

    <!-- Queue stream -->
    <ul v-if="tab === 'queue'" class="mt-2 space-y-2">
      <li v-for="q in todaysQueue" :key="q.id" class="relative overflow-hidden rounded-2xl">
        <div class="absolute inset-0 flex items-center justify-between px-4 text-xs font-bold">
          <span class="text-emerald-600">{{ t('queue.sendNow') }} →</span>
          <span class="text-stone-400">← {{ t('queue.skip') }}</span>
        </div>
        <SwipeRow :on-right="() => sendNow(q)" :on-left="() => skipItem(q.id)">
          <div
            class="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-md shadow-stone-200/60 ring-1 ring-stone-100"
          >
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-bold">
                {{ q.name }}
                <span
                  class="ml-1 rounded bg-stone-100 px-1.5 py-0.5 text-[11px] font-semibold text-stone-500"
                  >{{ fmtTime(q.scheduledTime) }}</span
                >
                <span
                  v-if="q.followUpDays"
                  class="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700"
                  >{{ t('queue.followUp') }}</span
                >
              </p>
              <p class="truncate text-xs text-stone-500">{{ queueItemText(q) }}</p>
            </div>
            <button
              class="rounded-full bg-emerald-100 p-2 transition active:scale-95"
              :aria-label="t('queue.sendNow')"
              @click="sendNow(q)"
            >
              <Send class="h-4 w-4 text-emerald-700" />
            </button>
            <button
              class="rounded-full bg-stone-100 p-2 transition active:scale-95"
              :aria-label="t('queue.skip')"
              @click="skipItem(q.id)"
            >
              <X class="h-4 w-4 text-stone-500" />
            </button>
          </div>
        </SwipeRow>
      </li>
      <li
        v-if="!queueList.length"
        class="rounded-2xl border-2 border-dashed border-stone-200 bg-white/50 p-4 text-center text-xs text-stone-400"
      >
        {{ t('queue.empty') }}
      </li>
      <template v-if="upcomingItems.length">
        <li class="pt-1 text-[11px] font-bold uppercase tracking-wider text-stone-400">
          {{ t('queue.upcoming') }} ({{ upcomingItems.length }})
        </li>
        <li v-for="q in upcomingItems" :key="q.id" class="relative overflow-hidden rounded-2xl">
          <div class="absolute inset-0 flex items-center justify-between px-4 text-xs font-bold">
            <span class="text-emerald-600">{{ t('queue.sendNow') }} →</span>
            <span class="text-stone-400">← {{ t('queue.skip') }}</span>
          </div>
          <SwipeRow :on-right="() => sendNow(q)" :on-left="() => skipItem(q.id)">
            <div
              class="flex items-center gap-3 rounded-2xl bg-white p-3 opacity-90 shadow-md shadow-stone-200/60 ring-1 ring-stone-100"
            >
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-bold">
                  {{ q.name }}
                  <span
                    class="ml-1 rounded bg-stone-100 px-1.5 py-0.5 text-[11px] font-semibold text-stone-500"
                    >{{ fmtDay(q.scheduledTime) }}</span
                  >
                  <span
                    v-if="q.followUpDays"
                    class="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700"
                    >{{ t('queue.followUp') }}</span
                  >
                </p>
                <p class="truncate text-xs text-stone-500">{{ queueItemText(q) }}</p>
              </div>
              <button
                class="rounded-full bg-emerald-100 p-2 transition active:scale-95"
                :aria-label="t('queue.sendNow')"
                @click="sendNow(q)"
              >
                <Send class="h-4 w-4 text-emerald-700" />
              </button>
              <button
                class="rounded-full bg-stone-100 p-2 transition active:scale-95"
                :aria-label="t('queue.skip')"
                @click="skipItem(q.id)"
              >
                <X class="h-4 w-4 text-stone-500" />
              </button>
            </div>
          </SwipeRow>
        </li>
      </template>
    </ul>

    <!-- Contact stream (Feature 5) -->
    <ul v-else class="mt-2 space-y-2">
      <li v-for="c in state.contacts" :key="c.id" class="relative overflow-hidden rounded-2xl">
        <div class="absolute inset-0 flex items-center justify-between px-4 text-xs font-bold">
          <span class="text-emerald-600">{{ t('queue.queue') }} →</span>
          <span class="text-red-400">← {{ t('detail.delete') }}</span>
        </div>
        <SwipeRow :on-right="() => queueAgain(c.id)" :on-left="() => removeContact(c.id)">
          <div class="rounded-2xl bg-white p-3 shadow-md shadow-stone-200/60 ring-1 ring-stone-100">
            <div class="flex items-center justify-between gap-2">
              <button
                class="min-w-0 flex-1 truncate text-left text-sm font-bold"
                @click="detailId = c.id"
              >
                {{ c.name }}
              </button>
              <div class="flex shrink-0 gap-1">
                <button
                  class="rounded-full p-1.5 transition active:scale-95"
                  :class="isFavorite(c.id) ? 'bg-amber-100' : 'bg-stone-100'"
                  :aria-label="t('queue.pin')"
                  @click="toggleFavorite(c.id)"
                >
                  <Star
                    class="h-3.5 w-3.5"
                    :class="isFavorite(c.id) ? 'fill-amber-500 text-amber-500' : 'text-stone-400'"
                  />
                </button>
                <button
                  class="rounded-full bg-emerald-100 p-1.5 transition active:scale-95"
                  :aria-label="t('queue.openChat')"
                  @click="chatNow(c.phone)"
                >
                  <MessageCircle class="h-3.5 w-3.5 text-emerald-700" />
                </button>
                <button
                  class="rounded-full bg-stone-100 p-1.5 transition active:scale-95"
                  :aria-label="t('queue.delete')"
                  @click="removeContact(c.id)"
                >
                  <Trash2 class="h-3.5 w-3.5 text-stone-400" />
                </button>
              </div>
            </div>
            <p class="flex items-center gap-1 text-xs text-stone-500">
              <Phone class="h-3 w-3" /> {{ c.phone }}
            </p>

            <div v-if="c.tags.length" class="mt-1 flex flex-wrap gap-1">
              <span
                v-for="tag in c.tags"
                :key="tag"
                class="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800"
                >{{ tag }}</span
              >
            </div>

            <button
              v-if="editingNote !== c.id"
              class="mt-1 flex w-full items-start gap-1 text-left text-xs italic"
              :class="c.note ? 'text-amber-700' : 'text-stone-400'"
              @click="editingNote = c.id"
            >
              <StickyNote class="h-3 w-3 shrink-0 translate-y-0.5" />
              {{ c.note || t('queue.addNote') }}
            </button>
            <input
              v-else
              :value="c.note"
              :placeholder="t('queue.notePh')"
              class="mt-1 w-full rounded-lg bg-amber-50 px-2 py-1 text-xs italic ring-1 ring-amber-200 outline-none"
              @input="updateContact(c.id, { note: ($event.target as HTMLInputElement).value })"
              @blur="editingNote = null"
              @keyup.enter="editingNote = null"
            />
          </div>
        </SwipeRow>
      </li>
      <li
        v-if="!state.contacts.length"
        class="rounded-2xl border-2 border-dashed border-stone-200 bg-white/50 p-4 text-center text-xs text-stone-400"
      >
        {{ t('queue.noContacts') }}
      </li>
    </ul>

    <!-- Sent history (queue view only — the History tab is the full log) -->
    <div v-if="tab === 'queue' && sentItems.length" class="mt-3">
      <button
        class="flex w-full items-center justify-center gap-1 rounded-xl bg-white py-2 text-xs font-bold text-stone-500 shadow-md shadow-stone-200/60 ring-1 ring-stone-100 transition active:scale-[0.99]"
        @click="showSent = !showSent"
      >
        <Check class="h-3.5 w-3.5 text-emerald-600" />
        {{ t('queue.sentN', { n: sentItems.length }) }}
        <ChevronDown class="h-3.5 w-3.5 transition" :class="showSent ? 'rotate-180' : ''" />
      </button>
      <ul v-if="showSent" class="mt-2 space-y-1.5">
        <li
          v-for="q in sentItems"
          :key="q.id"
          class="flex items-center gap-2 rounded-xl bg-white/70 p-2 text-xs text-stone-500 ring-1 ring-stone-100"
        >
          <Check class="h-3.5 w-3.5 shrink-0 text-emerald-600" />
          <span class="truncate">{{ q.name }} · {{ queueItemText(q) }}</span>
        </li>
      </ul>
    </div>
    <!-- Contact detail (tags, note, history, one-tap actions) -->
    <ContactSheet
      v-if="detailId"
      :contact-id="detailId"
      @close="detailId = null"
      @queued="detailId = null"
    />
  </section>
</template>
