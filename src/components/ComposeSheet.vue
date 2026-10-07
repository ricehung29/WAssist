<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Plus, Search, UserPlus, Check, Tag } from 'lucide-vue-next'
import ActionSheet from './ActionSheet.vue'
import { state, addContact, queueCustomMessage, scheduleQueueReminders, buildContactTagList } from '../store'
import { sanitizePhone, isValidPhone } from '../utils/sanitizer'
import { renderTemplate } from '../utils/spintax'
import { t } from '../utils/i18n'

const emit = defineEmits<{ close: [] }>()

const message = ref('')
const query = ref('')
const tagFilter = ref('')
const picked = ref<string[]>([])
const expanded = ref<string | null>(null)
const tweaks = ref<Record<string, string>>({})
const newName = ref('')
const newPhone = ref('')
const searchEl = ref<HTMLInputElement | null>(null)

onMounted(() => {
  // On a phone this would pop the keyboard over the sheet; on a desktop the
  // user opened Compose to type, so put the caret where they are going next.
  // (matchMedia is absent in jsdom, hence the guard.)
  const finePointer = window.matchMedia?.('(hover: hover) and (pointer: fine)').matches ?? false
  if (finePointer) searchEl.value?.focus()
})

const prefix = computed(() => state.settings.defaultPrefix)
const tagList = computed(() => buildContactTagList())

const results = computed(() => {
  const q = query.value.trim().toLowerCase()
  const digits = q.replace(/\D/g, '')
  return state.contacts
    .filter((c) => (tagFilter.value ? c.tags.includes(tagFilter.value) : true))
    .filter((c) =>
      q
        ? c.name.toLowerCase().includes(q) ||
          (digits && c.phone.includes(digits)) ||
          c.tags.some((t) => t.toLowerCase().includes(q))
        : true,
    )
    .slice(0, 30)
})

const pickedContacts = computed(() =>
  picked.value
    .map((id) => state.contacts.find((c) => c.id === id))
    .filter((c) => c !== undefined),
)

function previewFor(contactId: string): string {
  const c = state.contacts.find((x) => x.id === contactId)
  if (!c || !message.value.trim()) return ''
  const tweak = tweaks.value[contactId]?.trim()
  if (tweak) return tweak
  return renderTemplate(message.value, {
    name: c.name.split(' ')[0] ?? c.name,
    fullname: c.name,
    note: c.note ?? '',
    topic: '',
    time: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
  })
}

function toggle(id: string) {
  picked.value = picked.value.includes(id)
    ? picked.value.filter((x) => x !== id)
    : [...picked.value, id]
}

function toggleExpand(id: string) {
  expanded.value = expanded.value === id ? null : id
}

function canAddNew(): boolean {
  return isValidPhone(sanitizePhone(newPhone.value, prefix.value))
}

function addNew() {
  if (!canAddNew()) return
  const c = addContact({
    name: newName.value.trim() || sanitizePhone(newPhone.value, prefix.value),
    phone: sanitizePhone(newPhone.value, prefix.value),
  })
  newName.value = ''
  newPhone.value = ''
  query.value = ''
  if (!picked.value.includes(c.id)) picked.value = [...picked.value, c.id]
}

async function queue() {
  const items = queueCustomMessage(picked.value, message.value, tweaks.value)
  await scheduleQueueReminders(items)
  emit('close')
}

/** Prefill the message box from the active template (still fully editable). */
function startFromTemplate() {
  const active =
    state.templates.find((t) => t.id === state.activeTemplateId) ?? state.templates[0]
  if (active && !message.value.trim()) message.value = active.content
}

function toggleTag(t: string) {
  tagFilter.value = tagFilter.value === t ? '' : t
}

/** Tick everyone currently visible in the filtered list — the 1:many shortcut. */
function pickAllVisible() {
  const ids = results.value.map((c) => c.id)
  picked.value = [...new Set([...picked.value, ...ids])]
}

/** Untick the visible page — the counterpart to "select all", for a mis-tap. */
function clearVisible() {
  const visible = new Set(results.value.map((c) => c.id))
  picked.value = picked.value.filter((id) => !visible.has(id))
}

/** True when the visible page is already fully ticked. */
const allVisiblePicked = computed(
  () => results.value.length > 0 && results.value.every((c) => picked.value.includes(c.id)),
)
</script>

<template>
  <ActionSheet :title="t('compose.title')" @close="emit('close')">
    <!-- Message -->
    <textarea
      v-model="message"
      rows="3"
      :placeholder="t('compose.msgPh')"
      class="mt-3 w-full rounded-2xl bg-stone-50 p-3 text-sm ring-1 ring-stone-200/70 outline-none focus:ring-2 focus:ring-amber-400"
    />
    <button
      v-if="!message.trim()"
      class="mt-1 text-[11px] font-bold text-stone-400 underline-offset-2 hover:underline"
      @click="startFromTemplate"
    >
      {{ t('compose.fromTemplate') }}
    </button>

    <!-- Recipient search -->
    <div class="mt-3 flex items-center gap-2 rounded-xl bg-stone-50 px-3 py-2">
      <Search class="h-4 w-4 shrink-0 text-stone-400" />
      <input
        ref="searchEl"
        v-model="query"
        :placeholder="t('compose.searchPh')"
        class="w-full bg-transparent text-sm outline-none placeholder:text-stone-400"
      />
    </div>

    <!-- Tag filter chips -->
    <div v-if="tagList.length" class="mt-2 flex flex-wrap gap-1.5">
      <button
        v-for="t in tagList"
        :key="t"
        class="flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold"
        :class="
          tagFilter === t ? 'bg-amber-500 text-white' : 'bg-amber-100 text-amber-800'
        "
        @click="toggleTag(t)"
      >
        <Tag class="h-3 w-3" /> {{ t }}
      </button>
    </div>

    <!-- New contact inline -->
    <div class="mt-2 flex gap-2">
      <input
        v-model="newName"
        :placeholder="t('compose.newName')"
        class="min-w-0 flex-1 rounded-xl bg-stone-50 px-3 py-2 text-sm outline-none placeholder:text-stone-400 focus:ring-2 focus:ring-amber-400"
      />
      <input
        v-model="newPhone"
        :placeholder="t('compose.newPhone')"
        inputmode="tel"
        class="min-w-0 flex-1 rounded-xl bg-stone-50 px-3 py-2 text-sm outline-none placeholder:text-stone-400 focus:ring-2 focus:ring-amber-400"
        @keyup.enter="addNew"
      />
      <button
        class="flex shrink-0 items-center gap-1 rounded-xl bg-stone-900 px-3 py-2 text-xs font-bold text-white disabled:opacity-40"
        :disabled="!canAddNew()"
        @click="addNew"
      >
        <UserPlus class="h-4 w-4" /> {{ t('compose.add') }}
      </button>
    </div>

    <!-- Recipient list -->
    <div v-if="results.length > 1" class="mt-2 flex justify-end gap-3">
      <button
        v-if="allVisiblePicked"
        class="text-[11px] font-bold text-stone-500 underline-offset-2 hover:underline"
        @click="clearVisible"
      >
        {{ t('compose.clearAll', { n: results.length }) }}
      </button>
      <button
        v-else
        class="text-[11px] font-bold text-stone-500 underline-offset-2 hover:underline"
        @click="pickAllVisible"
      >
        {{ t('compose.selectAll', { n: results.length }) }}
      </button>
    </div>
    <ul class="mt-1 max-h-52 space-y-1.5 overflow-y-auto lg:max-h-72">
      <li v-for="c in results" :key="c.id" class="rounded-xl bg-stone-50 px-2 py-1.5 ring-1 ring-stone-200/60">
        <div class="flex items-center gap-2">
          <button
            class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2"
            :class="picked.includes(c.id) ? 'border-emerald-500 bg-emerald-500' : 'border-stone-300'"
            :aria-label="`Select ${c.name}`"
            @click="toggle(c.id)"
          >
            <Check v-if="picked.includes(c.id)" class="h-3 w-3 text-white" />
          </button>
          <button class="min-w-0 flex-1 text-left" @click="toggle(c.id)">
            <p class="truncate text-sm font-bold">{{ c.name }}</p>
            <p class="text-[11px] text-stone-500">{{ c.phone }}</p>
          </button>
          <button
            v-if="picked.includes(c.id)"
            class="shrink-0 rounded-full bg-white px-2 py-1 text-[11px] font-bold text-stone-500"
            @click="toggleExpand(c.id)"
          >
            {{ expanded === c.id ? t('compose.hide') : t('compose.tweak') }}
          </button>
        </div>
        <div v-if="expanded === c.id && picked.includes(c.id)" class="mt-1.5 space-y-1">
          <p class="rounded-lg bg-white p-2 text-xs text-stone-600">
            “{{ previewFor(c.id) }}”
          </p>
          <input
            :value="tweaks[c.id] ?? ''"
            :placeholder="t('compose.tweakPh')"
            class="w-full rounded-lg bg-white px-2 py-1.5 text-xs outline-none placeholder:text-stone-400 focus:ring-2 focus:ring-amber-400"
            @input="tweaks[c.id] = ($event.target as HTMLInputElement).value"
          />
        </div>
      </li>
      <li v-if="!results.length" class="p-3 text-center text-xs text-stone-400">
        {{ t('compose.noMatch') }}
      </li>
    </ul>

    <p v-if="pickedContacts.length" class="mt-2 text-xs text-stone-500">
      {{
        pickedContacts.length > 1
          ? t('compose.many', { n: pickedContacts.length })
          : t('compose.one')
      }}: {{ pickedContacts.map((c) => c.name).join(', ') }}
    </p>

    <button
      :disabled="!message.trim() || !picked.length"
      class="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 p-3 text-sm font-extrabold text-white disabled:opacity-40"
      @click="queue"
    >
      <Plus class="h-4 w-4" />
      {{ t('compose.queueFor', { n: picked.length || '…' }) }} →
      {{ picked.length > 1 ? t('compose.eachOwn') : t('compose.oneToOne') }}
    </button>
  </ActionSheet>
</template>
