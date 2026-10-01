<script setup lang="ts">
import { ref, computed } from 'vue'
import { Eye, Plus, Trash2, Check } from 'lucide-vue-next'
import ActionSheet from './ActionSheet.vue'
import { state, addTemplate, updateTemplate, removeTemplate, setActiveTemplate } from '../store'
import { sampleVariations } from '../utils/spintax'
import { t } from '../utils/i18n'

const emit = defineEmits<{ close: [] }>()

const draftTitle = ref('')
const draftContent = ref('')
const editingId = ref<string | null>(null)
const previewSamples = ref<string[]>([])

const CHIPS = ['{{name}}', '{{fullname}}', '{{topic}}', '{{note}}', '{{time}}']
const VAR_EXAMPLE = '{{name}}'

const editingExisting = computed(() => state.templates.find((t) => t.id === editingId.value))

function preview(content: string) {
  previewSamples.value = sampleVariations(
    content || '{{name}}',
    {
      name: 'Ken',
      fullname: 'Ken Lau',
      topic: 'our project',
      note: 'decision maker',
      time: '9:30 AM',
    },
    4,
  )
}

function insertChip(chip: string) {
  draftContent.value = `${draftContent.value}${draftContent.value ? ' ' : ''}${chip}`
}

function startEdit(id: string) {
  const tpl = state.templates.find((t) => t.id === id)
  if (!tpl) return
  editingId.value = id
  draftTitle.value = tpl.title
  draftContent.value = tpl.content
  preview(tpl.content)
}

function cancelEdit() {
  editingId.value = null
  draftTitle.value = ''
  draftContent.value = ''
  previewSamples.value = []
}

function save() {
  if (!draftContent.value.trim()) return
  if (editingExisting.value) {
    updateTemplate(editingExisting.value.id, {
      title: draftTitle.value.trim() || 'Untitled',
      content: draftContent.value.trim(),
    })
  } else {
    addTemplate(draftTitle.value, draftContent.value.trim())
  }
  cancelEdit()
}

function remove(id: string) {
  removeTemplate(id)
  if (editingId.value === id) cancelEdit()
}
</script>

<template>
  <ActionSheet :title="t('tpl.title')" @close="emit('close')">
    <p class="mt-1 text-xs text-stone-500">
      {{ t('tpl.desc') }}
      <span class="mt-1 block font-mono text-[11px] text-stone-400">{{ VAR_EXAMPLE }}</span>
    </p>

    <div class="mt-3 space-y-2">
      <div
        v-for="tpl in state.templates"
        :key="tpl.id"
        class="rounded-2xl p-3 ring-1 ring-stone-200/60"
        :class="tpl.id === state.activeTemplateId ? 'bg-emerald-50 ring-2 ring-emerald-500' : 'bg-stone-50'"
      >
        <div class="flex items-start justify-between gap-2">
          <button class="min-w-0 flex-1 text-left" @click="setActiveTemplate(tpl.id)">
            <p class="flex items-center gap-1 text-xs font-bold">
              <Check v-if="tpl.id === state.activeTemplateId" class="h-3 w-3 text-emerald-600" />
              {{ tpl.title }}
            </p>
            <p class="mt-0.5 line-clamp-2 text-xs text-stone-500">{{ tpl.content }}</p>
          </button>
          <div class="flex shrink-0 gap-1">
            <button
              class="rounded-full bg-white p-1.5 transition active:scale-95"
              :aria-label="t('tpl.edit')"
              @click="startEdit(tpl.id)"
            >
              <Eye class="h-3.5 w-3.5 text-stone-500" />
            </button>
            <button
              class="rounded-full bg-white p-1.5 transition active:scale-95 disabled:opacity-30"
              :aria-label="t('tpl.delete')"
              :disabled="state.templates.length <= 1"
              @click="remove(tpl.id)"
            >
              <Trash2 class="h-3.5 w-3.5 text-stone-400" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="mt-4 flex flex-wrap gap-1.5">
      <button
        v-for="chip in CHIPS"
        :key="chip"
        class="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800"
        @click="insertChip(chip)"
      >
        + {{ chip }}
      </button>
    </div>

    <input
      v-model="draftTitle"
      :placeholder="t('tpl.titlePh')"
      class="mt-2 w-full rounded-xl bg-stone-50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-400"
    />
    <textarea
      v-model="draftContent"
      rows="4"
      :placeholder="t('tpl.bodyPh')"
      class="mt-2 w-full rounded-xl bg-stone-50 p-3 text-sm outline-none focus:ring-2 focus:ring-amber-400"
    />

    <div class="mt-2 flex gap-2">
      <button
        class="flex flex-1 items-center justify-center gap-1 rounded-xl bg-stone-100 p-2 text-xs font-bold"
        @click="preview(draftContent)"
      >
        <Eye class="h-4 w-4" /> {{ t('tpl.preview') }}
      </button>
      <button
        class="flex flex-1 items-center justify-center gap-1 rounded-xl bg-stone-900 p-2 text-xs font-bold text-white disabled:opacity-40"
        :disabled="!draftContent.trim()"
        @click="save"
      >
        <Plus class="h-4 w-4" /> {{ editingExisting ? t('tpl.update') : t('tpl.save') }}
      </button>
    </div>
    <button
      v-if="editingExisting"
      class="mt-2 w-full rounded-xl bg-white py-2 text-xs font-bold text-stone-500"
      @click="cancelEdit"
    >
      {{ t('tpl.cancel') }}
    </button>

    <ul v-if="previewSamples.length" class="mt-3 space-y-1.5">
      <li v-for="(s, i) in previewSamples" :key="i" class="rounded-xl bg-violet-50 p-2 text-xs">
        “{{ s }}”
      </li>
    </ul>
  </ActionSheet>
</template>
