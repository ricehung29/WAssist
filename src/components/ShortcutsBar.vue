<script setup lang="ts">
import { ref } from 'vue'
import { Zap, Plus, Trash2, Copy, Check } from 'lucide-vue-next'
import { state, addSnippet, removeSnippet } from '../store'
import { t } from '../utils/i18n'
import { copyMessage } from '../utils/whatsapp'

const draftBody = ref('')
const draftTitle = ref('')
const copiedId = ref<string | null>(null)

async function copy(snipId: string, body: string) {
  if (await copyMessage(body)) {
    copiedId.value = snipId
    window.setTimeout(() => {
      if (copiedId.value === snipId) copiedId.value = null
    }, 1500)
  }
}

function save() {
  if (!draftBody.value.trim()) return
  addSnippet(draftTitle.value, draftBody.value)
  draftTitle.value = ''
  draftBody.value = ''
}
</script>

<template>
  <section class="mt-5" aria-label="shortcuts">
    <h2 class="flex items-center gap-1.5 text-sm font-bold uppercase tracking-wider text-stone-500">
      <Zap class="h-4 w-4" /> {{ t('words.shortcuts') }}
    </h2>
    <p class="mt-1 text-xs text-stone-400">
      {{ t('words.shortcutsDesc') }}
    </p>

    <div class="mt-2 flex flex-wrap gap-2">
      <div
        v-for="s in state.snippets"
        :key="s.id"
        class="flex items-center gap-1 rounded-full bg-white py-1 pl-3 pr-1 shadow-md shadow-stone-200/60 ring-1 ring-stone-100 transition active:scale-95"
      >
        <button
          class="flex max-w-44 items-center gap-1.5 text-xs font-bold"
          :title="s.body"
          @click="copy(s.id, s.body)"
        >
          <Check v-if="copiedId === s.id" class="h-3.5 w-3.5 shrink-0 text-emerald-500" />
          <Copy v-else class="h-3.5 w-3.5 shrink-0 text-stone-400" />
          <span class="truncate">{{ copiedId === s.id ? t('words.copied') : s.title }}</span>
        </button>
        <button
          class="rounded-full p-1 text-stone-300 hover:text-red-500"
          :aria-label="t('queue.delete')"
          @click="removeSnippet(s.id)"
        >
          <Trash2 class="h-3 w-3" />
        </button>
      </div>
    </div>

    <div class="mt-2 flex gap-2">
      <input
        v-model="draftTitle"
        :placeholder="t('words.labelPh')"
        class="w-24 shrink-0 rounded-xl bg-white px-3 py-2 text-xs shadow-sm ring-1 ring-stone-100 outline-none placeholder:text-stone-400 focus:ring-2 focus:ring-amber-400"
      />
      <input
        v-model="draftBody"
        :placeholder="t('words.newSnippet')"
        class="min-w-0 flex-1 rounded-xl bg-white px-3 py-2 text-xs shadow-sm ring-1 ring-stone-100 outline-none placeholder:text-stone-400 focus:ring-2 focus:ring-amber-400"
        @keyup.enter="save"
      />
      <button
        class="shrink-0 rounded-xl bg-stone-900 px-3 py-2 text-white transition active:scale-95 disabled:opacity-40"
        :aria-label="t('words.addShortcut')"
        :disabled="!draftBody.trim()"
        @click="save"
      >
        <Plus class="h-4 w-4" />
      </button>
    </div>
  </section>
</template>
