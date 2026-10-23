<script setup lang="ts">
import { computed, ref } from 'vue'
import { Plus, ClipboardPaste, AlertTriangle } from 'lucide-vue-next'
import ActionSheet from './ActionSheet.vue'
import SendPlan from './SendPlan.vue'
import { state, addContact, buildQueue, scheduleQueueReminders } from '../store'
import { parseSmartPaste } from '../utils/sanitizer'
import { sampleVariations } from '../utils/spintax'
import { t } from '../utils/i18n'

const emit = defineEmits<{ close: [] }>()

const pasteText = ref('')
const topic = ref('')
const templateId = ref(state.activeTemplateId)

const parsed = computed(() => parseSmartPaste(pasteText.value, state.settings.defaultPrefix))

const selectedTemplate = computed(
  () => state.templates.find((t) => t.id === templateId.value) ?? state.templates[0],
)

/** Live preview of what the first contact will actually receive. */
const preview = computed(() => {
  const first = parsed.value[0]
  if (!first || !selectedTemplate.value) return ''
  const vars = {
    name: first.name.split(' ')[0] ?? first.name,
    fullname: first.name,
    note: first.note,
    topic: topic.value,
    time: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
  }
  return sampleVariations(selectedTemplate.value.content, vars, 3).join('\n')
})

const duplicates = computed(() =>
  parsed.value.filter((p) => state.contacts.some((c) => c.phone === p.phone)).length,
)

async function addAll() {
  const ids = parsed.value.map(
    (p) => addContact({ name: p.name, phone: p.phone, note: p.note }).id,
  )
  const items = buildQueue(ids, topic.value, { templateId: templateId.value })
  await scheduleQueueReminders(items)
  emit('close')
}
</script>

<template>
  <ActionSheet :title="t('paste.title')" @close="emit('close')">
    <p class="mt-1 text-xs text-stone-500">
      {{ t('paste.desc', { prefix: state.settings.defaultPrefix }) }}
    </p>

    <textarea
      v-model="pasteText"
      rows="5"
      :placeholder="t('paste.areaPh')"
      class="mt-3 w-full rounded-2xl bg-stone-50 p-3 text-sm ring-1 ring-stone-200/70 outline-none focus:ring-2 focus:ring-amber-400"
    />

    <p v-if="pasteText && !parsed.length" class="mt-1 flex items-center gap-1 text-xs text-red-500">
      <AlertTriangle class="h-3 w-3" /> {{ t('paste.noPhones') }}
    </p>

    <ul v-if="parsed.length" class="mt-2 max-h-40 space-y-1.5 overflow-y-auto">
      <li v-for="(p, i) in parsed" :key="i" class="rounded-xl bg-emerald-50 p-2 text-xs">
        <b>{{ p.name }}</b> · {{ p.phone }}
        <span v-if="p.note" class="text-stone-500"> · {{ p.note }}</span>
      </li>
    </ul>
    <p v-if="duplicates" class="mt-1 text-xs text-amber-600">
      {{ t('paste.dup', { n: duplicates }) }}
    </p>

    <div class="mt-3 space-y-2">
      <input
        v-model="topic"
        :placeholder="t('paste.topicPh')"
        class="w-full rounded-xl bg-stone-50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-400"
      />
      <select
        v-model="templateId"
        class="w-full rounded-xl bg-stone-50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-400"
      >
        <option v-for="t in state.templates" :key="t.id" :value="t.id">{{ t.title }}</option>
      </select>
    </div>

    <div v-if="preview" class="mt-3 rounded-2xl bg-violet-50 p-3">
      <p class="text-[11px] font-bold uppercase tracking-wider text-violet-700">
        {{ t('paste.previewTitle') }}
      </p>
      <p v-for="(s, i) in preview.split('\n')" :key="i" class="mt-1 text-xs text-stone-700">
        “{{ s }}”
      </p>
    </div>

    <!-- Where these will actually land, given the weekly windows. -->
    <SendPlan :count="parsed.length" />

    <button
      :disabled="!parsed.length"
      class="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 p-3 text-sm font-extrabold text-white disabled:opacity-40"
      @click="addAll"
    >
      <Plus class="h-4 w-4" /> {{ t('paste.addToQueue', { n: parsed.length || '' }) }}
    </button>
    <p class="mt-2 flex items-center justify-center gap-1 text-[11px] text-stone-400">
      <ClipboardPaste class="h-3 w-3" /> {{ t('paste.localOnly') }}
    </p>
  </ActionSheet>
</template>
