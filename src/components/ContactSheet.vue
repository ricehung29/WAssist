<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { MessageCircle, Send, Star, Trash2, Check, Tag } from 'lucide-vue-next'
import ActionSheet from './ActionSheet.vue'
import {
  state,
  queueForContact,
  toggleFavorite,
  removeContact,
  buildContactTagList,
  buildQueue,
  scheduleQueueReminders,
} from '../store'
import { openChatWith } from '../composables/useWaTarget'
import { t } from '../utils/i18n'
import { queueItemText } from '../utils/message'

const props = defineProps<{ contactId: string }>()
const emit = defineEmits<{ close: []; queued: [] }>()

const noteDraft = ref('')
const tagsDraft = ref('')

// The sheet mounts fresh each open — seed the drafts from the contact once.
onMounted(() => {
  noteDraft.value = contact.value?.note ?? ''
  tagsDraft.value = contact.value?.tags.join(', ') ?? ''
})

const contact = computed(() => state.contacts.find((c) => c.id === props.contactId))
const history = computed(() => queueForContact(props.contactId))
const sentHistory = computed(() => history.value.filter((q) => q.status === 'sent'))
const isFavorite = computed(() => state.favorites.includes(props.contactId))

/** Existing tags across all contacts, for one-tap add. */
const suggestions = computed(() => buildContactTagList().filter((t) => !contact.value?.tags.includes(t)))

function saveNote() {
  if (!contact.value) return
  contact.value.note = noteDraft.value.trim() || undefined
}

function saveTags() {
  if (!contact.value) return
  contact.value.tags = tagsDraft.value
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
}

function addTag(t: string) {
  if (!contact.value || contact.value.tags.includes(t)) return
  contact.value.tags = [...contact.value.tags, t]
}

function chat() {
  if (contact.value) void openChatWith(contact.value.phone)
}

async function queueNow() {
  if (!contact.value) return
  const items = buildQueue([contact.value.id], '')
  await scheduleQueueReminders(items)
  emit('queued')
}

function fmtDay(iso: string) {
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' })
}
</script>

<template>
  <ActionSheet v-if="contact" :title="contact.name" @close="emit('close')">
    <!-- Identity + actions -->
    <div class="mt-3 flex items-center gap-3">
      <span
        class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-lg font-extrabold text-white shadow-md shadow-emerald-200"
      >
        {{ (contact.name.trim()[0] ?? '?').toUpperCase() }}
      </span>
      <div class="min-w-0 flex-1">
        <p class="truncate text-sm font-bold">{{ contact.name }}</p>
        <p class="text-xs text-stone-500">{{ contact.phone }}</p>
      </div>
      <button
        class="rounded-full p-2"
        :class="isFavorite ? 'bg-amber-100' : 'bg-stone-100'"
        :aria-label="t('queue.pin')"
        @click="toggleFavorite(contact.id)"
      >
        <Star
          class="h-4 w-4"
          :class="isFavorite ? 'fill-amber-500 text-amber-500' : 'text-stone-400'"
        />
      </button>
    </div>

    <div class="mt-3 grid grid-cols-3 gap-2">
      <button
        class="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-500 py-2 text-xs font-bold text-white"
        @click="chat"
      >
        <MessageCircle class="h-4 w-4" /> {{ t('detail.chat') }}
      </button>
      <button
        class="flex items-center justify-center gap-1.5 rounded-xl bg-stone-900 py-2 text-xs font-bold text-white"
        @click="queueNow"
      >
        <Send class="h-4 w-4" /> {{ t('detail.queue') }}
      </button>
      <button
        class="flex items-center justify-center gap-1.5 rounded-xl bg-red-50 py-2 text-xs font-bold text-red-600"
        @click="removeContact(contact.id); emit('close')"
      >
        <Trash2 class="h-4 w-4" /> {{ t('detail.delete') }}
      </button>
    </div>

    <!-- Tags -->
    <div class="mt-4">
      <p class="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-stone-500">
        <Tag class="h-3.5 w-3.5" /> {{ t('detail.tags') }}
      </p>
      <div class="mt-1.5 flex flex-wrap gap-1.5">
        <span
          v-for="t in contact.tags"
          :key="t"
          class="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800"
        >
          {{ t }}
        </span>
        <span v-if="!contact.tags.length" class="text-[11px] text-stone-400">{{ t('detail.noTags') }}</span>
      </div>
      <div class="mt-1.5 flex gap-2">
        <input
          v-model="tagsDraft"
          :placeholder="t('detail.tagsPh')"
          class="min-w-0 flex-1 rounded-xl bg-stone-50 px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-amber-400"
        />
        <button
          class="shrink-0 rounded-xl bg-stone-900 px-3 py-2 text-xs font-bold text-white"
          @click="saveTags"
        >
          {{ t('detail.save') }}
        </button>
      </div>
      <div v-if="suggestions.length" class="mt-1.5 flex flex-wrap gap-1.5">
        <button
          v-for="t in suggestions.slice(0, 6)"
          :key="t"
          class="rounded-full border border-dashed border-stone-300 px-2 py-0.5 text-[11px] text-stone-500"
          @click="addTag(t)"
        >
          + {{ t }}
        </button>
      </div>
    </div>

    <!-- Micro-note -->
    <div class="mt-4">
      <p class="text-xs font-bold uppercase tracking-wider text-stone-500">{{ t('detail.note') }}</p>
      <div class="mt-1.5 flex gap-2">
        <input
          v-model="noteDraft"
          :placeholder="t('detail.notePh')"
          class="min-w-0 flex-1 rounded-xl bg-stone-50 px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-amber-400"
          @keyup.enter="saveNote"
        />
        <button
          class="shrink-0 rounded-xl bg-stone-900 px-3 py-2 text-xs font-bold text-white"
          @click="saveNote"
        >
          {{ t('detail.save') }}
        </button>
      </div>
    </div>

    <!-- History -->
    <div class="mt-4">
      <p class="text-xs font-bold uppercase tracking-wider text-stone-500">{{ t('detail.history') }}</p>
      <ul v-if="sentHistory.length" class="mt-1.5 space-y-1.5">
        <li
          v-for="q in sentHistory.slice(0, 8)"
          :key="q.id"
          class="flex items-center gap-2 rounded-xl bg-white p-2 text-xs text-stone-500"
        >
          <Check class="h-3.5 w-3.5 shrink-0 text-emerald-600" />
          <span class="shrink-0 font-semibold text-stone-400">{{ fmtDay(q.scheduledTime) }}</span>
          <span class="truncate">{{ queueItemText(q) }}</span>
        </li>
      </ul>
      <p
        v-else
        class="mt-1.5 rounded-xl bg-stone-50 p-3 text-center text-xs text-stone-400"
      >
        {{ t('detail.nothingSent') }}
      </p>
    </div>
  </ActionSheet>
</template>
