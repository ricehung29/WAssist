<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  Settings2,
  Rocket,
  Users,
  Type,
  History,
  ClipboardPaste,
  LayoutTemplate,
  PenLine,
  Phone,
  MessageCircle,
} from 'lucide-vue-next'
import FavoritesBar from './components/FavoritesBar.vue'
import ConveyorBelt from './components/ConveyorBelt.vue'
import ContactStream from './components/ContactStream.vue'
import ShortcutsBar from './components/ShortcutsBar.vue'
import HistoryView from './components/HistoryView.vue'
import ComposeSheet from './components/ComposeSheet.vue'
import SmartPasteSheet from './components/SmartPasteSheet.vue'
import TemplateSheet from './components/TemplateSheet.vue'
import SettingsSheet from './components/SettingsSheet.vue'
import FollowUpSheet from './components/FollowUpSheet.vue'
import {
  state,
  addContact,
  buildQueue,
  scheduleQueueReminders,
  snoozeFollowUp,
  setActiveTab,
  sentCountToday,
  pendingQueue,
  activeTemplate,
} from './store'
import type { AllTab } from './types'
import { t } from './utils/i18n'
import { useClipboardWatcher } from './composables/useClipboardWatcher'
import { ensureReminderPermission } from './utils/notify'

const { detected, dismiss } = useClipboardWatcher(() => state.settings.defaultPrefix)

const showPaste = ref(false)
const showCompose = ref(false)
const showTemplates = ref(false)
const showSettings = ref(false)
const pendingFollowUp = ref<string | null>(null)

/** Persisted across restarts via settings.activeTab. */
const tab = computed<AllTab>({
  get: () => state.settings.activeTab,
  set: (v) => setActiveTab(v),
})

const followUpName = computed(
  () => state.queue.find((q) => q.id === pendingFollowUp.value)?.name ?? '',
)

const TABS: { id: AllTab; icon: typeof Rocket; labelKey: string }[] = [
  { id: 'send', icon: Rocket, labelKey: 'tab.send' },
  { id: 'people', icon: Users, labelKey: 'tab.people' },
  { id: 'words', icon: Type, labelKey: 'tab.words' },
  { id: 'history', icon: History, labelKey: 'tab.history' },
]

// Ask once, on first paint, so passive alarms can be armed later.
void ensureReminderPermission()

function onSent(itemId: string) {
  pendingFollowUp.value = itemId
}

async function pickFollowUp(days: number) {
  const id = pendingFollowUp.value
  pendingFollowUp.value = null
  if (id) await snoozeFollowUp(id, days)
}

async function acceptClipboard() {
  const phone = detected.value
  if (!phone) return
  const contact = addContact({ name: phone, phone })
  const items = buildQueue([contact.id], '')
  await scheduleQueueReminders(items)
  dismiss()
  tab.value = 'send'
}
</script>

<template>
  <div class="min-h-dvh bg-gradient-to-b from-amber-50 via-amber-50 to-orange-50 text-stone-900">
    <div class="mx-auto w-full max-w-md px-4 pb-32 pt-4">
      <!-- Header -->
      <header class="flex items-center justify-between">
        <div>
          <h1 class="flex items-center gap-2 text-xl font-extrabold tracking-tight">
            <span
              class="flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-md shadow-emerald-200"
            >
              <MessageCircle class="h-5 w-5 text-white" />
            </span>
            WAssist
          </h1>
          <p class="mt-0.5 pl-11 text-[11px] font-medium text-stone-400">{{ t('tagline') }}</p>
        </div>
        <button
          class="rounded-2xl bg-white p-2.5 shadow-md shadow-stone-200/60 ring-1 ring-stone-100 transition active:scale-95"
          :aria-label="t('settings.title')"
          @click="showSettings = true"
        >
          <Settings2 class="h-5 w-5 text-stone-500" />
        </button>
      </header>

      <!-- At-a-glance stats -->
      <div class="mt-3 flex gap-2 text-[11px] font-bold">
        <span
          class="rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-700 ring-1 ring-emerald-200/60"
        >
          {{ sentCountToday }} {{ t('stats.sentToday') }}
        </span>
        <span class="rounded-full bg-stone-900 px-2.5 py-1 text-white shadow-sm">
          {{ pendingQueue.length }} {{ t('stats.queued') }}
        </span>
        <span class="rounded-full bg-white px-2.5 py-1 text-stone-500 shadow-sm ring-1 ring-stone-100">
          {{ state.contacts.length }} {{ t('stats.contacts') }}
        </span>
      </div>

      <!-- Clipboard banner (Feature 4) -->
      <div
        v-if="detected"
        class="mt-3 flex items-center justify-between gap-2 rounded-2xl bg-stone-900 p-3 text-sm text-white shadow-lg"
      >
        <span class="flex items-center gap-2">
          <Phone class="h-4 w-4 shrink-0 text-emerald-400" />
          <span>{{ t('clipboard.detected', { phone: detected ?? '' }) }}</span>
        </span>
        <div class="flex shrink-0 gap-1">
          <button
            class="rounded-full bg-emerald-500 px-3 py-1 text-xs font-bold"
            @click="acceptClipboard"
          >
            {{ t('clipboard.add') }}
          </button>
          <button class="rounded-full bg-stone-700 px-3 py-1 text-xs" @click="dismiss">
            {{ t('clipboard.dismiss') }}
          </button>
        </div>
      </div>

      <!-- ===== SEND: pinned chats + conveyor belt + quick compose ===== -->
      <template v-if="tab === 'send'">
        <FavoritesBar />

        <div class="mt-4">
          <ConveyorBelt @sent="onSent" @compose="showCompose = true" />
        </div>

        <ContactStream initial-tab="queue" :show-tabs="false" />

        <section class="mt-5">
          <h2
            class="flex items-center gap-1.5 text-sm font-bold uppercase tracking-wider text-stone-500"
          >
            <PenLine class="h-4 w-4" /> {{ t('queue.title') }}
          </h2>
          <div class="mt-2 grid grid-cols-3 gap-2">
            <button
              class="flex items-center justify-center gap-1.5 rounded-2xl bg-stone-900 p-3 text-sm font-bold text-white shadow-md shadow-stone-300/50 transition active:scale-95"
              @click="showCompose = true"
            >
              <PenLine class="h-4 w-4" /> {{ t('compose.title').replace('✏️ ', '') }}
            </button>
            <button
              class="flex items-center justify-center gap-1.5 rounded-2xl bg-white p-3 text-sm font-bold shadow-md shadow-stone-200/60 ring-1 ring-stone-100 transition active:scale-95"
              @click="showPaste = true"
            >
              <ClipboardPaste class="h-4 w-4" /> {{ t('paste.title').replace('📋 ', '') }}
            </button>
            <button
              class="flex items-center justify-center gap-1.5 rounded-2xl bg-white p-3 text-sm font-bold shadow-md shadow-stone-200/60 ring-1 ring-stone-100 transition active:scale-95"
              @click="showTemplates = true"
            >
              <LayoutTemplate class="h-4 w-4" /> {{ t('tpl.title').replace('📑 ', '') }}
            </button>
          </div>
        </section>
      </template>

      <!-- ===== PEOPLE: contact cards, tags, detail ===== -->
      <template v-else-if="tab === 'people'">
        <div class="mt-4 grid grid-cols-2 gap-2">
          <button
            class="flex items-center justify-center gap-1.5 rounded-2xl bg-stone-900 p-3 text-sm font-bold text-white shadow-md shadow-stone-300/50 transition active:scale-95"
            @click="showCompose = true"
          >
            <PenLine class="h-4 w-4" /> {{ t('compose.title').replace('✏️ ', '') }}
          </button>
          <button
            class="flex items-center justify-center gap-1.5 rounded-2xl bg-white p-3 text-sm font-bold shadow-md shadow-stone-200/60 ring-1 ring-stone-100 transition active:scale-95"
            @click="showPaste = true"
          >
            <ClipboardPaste class="h-4 w-4" /> {{ t('paste.title').replace('📋 ', '') }}
          </button>
        </div>
        <ContactStream initial-tab="contacts" :show-tabs="false" />
      </template>

      <!-- ===== WORDS: templates + personal quick-text ===== -->
      <template v-else-if="tab === 'words'">
        <section class="mt-4 rounded-3xl bg-white p-4 shadow-md shadow-stone-200/60 ring-1 ring-stone-100">
          <p class="text-xs font-bold uppercase tracking-wider text-stone-500">
            {{ t('words.active') }}
          </p>
          <p class="mt-1 text-sm font-bold">{{ activeTemplate().title }}</p>
          <p class="mt-1 line-clamp-3 text-xs text-stone-500">{{ activeTemplate().content }}</p>
          <button
            class="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl bg-stone-900 py-2 text-xs font-bold text-white transition active:scale-95"
            @click="showTemplates = true"
          >
            <LayoutTemplate class="h-4 w-4" /> {{ t('words.manage') }}
          </button>
        </section>

        <ShortcutsBar />

        <section
          class="mt-5 rounded-3xl border-2 border-dashed border-stone-300 p-4 text-xs text-stone-500"
        >
          {{ t('words.cheat') }}
        </section>
      </template>

      <!-- ===== HISTORY: what went out ===== -->
      <template v-else>
        <HistoryView class="mt-4" @compose="showCompose = true" />
      </template>
    </div>

    <!-- Bottom category bar -->
    <nav
      class="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-stone-200/80 bg-white/95 shadow-[0_-4px_24px_rgba(0,0,0,0.06)] backdrop-blur"
    >
      <div class="mx-auto flex w-full max-w-md px-2">
        <button
          v-for="tb in TABS"
          :key="tb.id"
          class="relative flex flex-1 flex-col items-center gap-0.5 rounded-xl py-2 text-[11px] font-bold transition"
          :class="tab === tb.id ? 'text-emerald-600' : 'text-stone-400'"
          :aria-label="t(`tab.${tb.id}`)"
          @click="tab = tb.id"
        >
          <span
            v-if="tab === tb.id"
            class="absolute -top-px h-0.5 w-10 rounded-full bg-emerald-500"
          />
          <component :is="tb.icon" class="h-5 w-5" stroke-width="2.25" />
          {{ t(tb.labelKey) }}
        </button>
      </div>
    </nav>

    <ComposeSheet v-if="showCompose" @close="showCompose = false" />
    <SmartPasteSheet v-if="showPaste" @close="showPaste = false" />
    <TemplateSheet v-if="showTemplates" @close="showTemplates = false" />
    <SettingsSheet v-if="showSettings" @close="showSettings = false" />
    <FollowUpSheet
      v-if="pendingFollowUp"
      :name="followUpName"
      @pick="pickFollowUp"
      @close="pendingFollowUp = null"
    />
  </div>
</template>
