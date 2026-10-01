<script setup lang="ts">
import { computed, ref } from 'vue'
import { Download, Upload, Bell, BellOff, RotateCcw, Languages } from 'lucide-vue-next'
import ActionSheet from './ActionSheet.vue'
import {
  state,
  updateSettings,
  exportBackup,
  importBackup,
  resetAll,
  rescheduleAllReminders,
  cleanupHistory,
} from '../store'
import { ensureExactAlarms, ensureReminderPermission } from '../utils/notify'
import { isNativeOrMobile } from '../utils/whatsapp'
import { LOCALES, t, syncDocumentLang, type Locale } from '../utils/i18n'

const emit = defineEmits<{ close: [] }>()

const importText = ref('')
const showImport = ref(false)
const message = ref('')

/** Ourselves so the <html lang> attribute follows the picker. */
const locale = computed(() => state.settings.locale)

function setLocale(id: Locale) {
  updateSettings({ locale: id })
  syncDocumentLang()
}

function download() {
  const blob = new Blob([exportBackup()], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `wassist-backup-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

async function doImport() {
  try {
    await importBackup(importText.value)
    message.value = t('settings.restored')
    importText.value = ''
    showImport.value = false
  } catch {
    message.value = t('settings.invalid')
  }
}

async function toggleNotifications() {
  const turningOn = !state.settings.notificationsEnabled
  updateSettings({ notificationsEnabled: turningOn })
  if (!turningOn) {
    message.value = t('settings.remOff')
    return
  }
  const granted = await ensureReminderPermission()
  if (!granted) {
    message.value = t('settings.permDenied')
    updateSettings({ notificationsEnabled: false })
    return
  }
  // Android 12+ needs its own exact-alarm grant for second-accurate delivery.
  const exact = await ensureExactAlarms()
  await rescheduleAllReminders()
  message.value = exact ? t('settings.remOn') : t('settings.remBatched')
}

async function reset() {
  await resetAll()
  message.value = t('settings.cleared')
}
</script>

<template>
  <ActionSheet :title="t('settings.title')" @close="emit('close')">
    <p class="mt-1 rounded-xl bg-stone-50 p-2 text-[11px] text-stone-500 ring-1 ring-stone-200/60">
      {{ t('settings.local') }}
      {{ t('settings.runningAs') }}
      <b>{{ isNativeOrMobile() ? t('settings.native') : t('settings.web') }}</b>
    </p>

    <div class="mt-4 space-y-4">
      <!-- Language -->
      <div>
        <p
          class="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-stone-500"
        >
          <Languages class="h-3.5 w-3.5" /> {{ t('settings.language') }}
        </p>
        <div class="mt-1 grid grid-cols-2 gap-1.5">
          <button
            v-for="l in LOCALES"
            :key="l.id"
            class="rounded-xl py-2 text-xs font-bold transition active:scale-95"
            :class="
              locale === l.id ? 'bg-stone-900 text-white shadow-sm' : 'bg-stone-50 text-stone-500 ring-1 ring-stone-200/60'
            "
            @click="setLocale(l.id)"
          >
            {{ l.label }}
          </button>
        </div>
      </div>

      <div>
        <p class="text-xs font-bold uppercase tracking-wider text-stone-500">
          {{ t('settings.morning') }}
        </p>
        <div class="mt-1 flex gap-2">
          <label class="flex-1">
            <span class="text-[11px] text-stone-400">{{ t('settings.firstMsg') }}</span>
            <input
              type="time"
              :value="state.settings.startTime"
              class="mt-0.5 w-full rounded-xl bg-stone-50 px-3 py-2 text-sm ring-1 ring-stone-200/60 outline-none"
              @input="updateSettings({ startTime: ($event.target as HTMLInputElement).value })"
            />
          </label>
          <label class="flex-1">
            <span class="text-[11px] text-stone-400">{{ t('settings.stagger') }}</span>
            <input
              type="number"
              min="1"
              max="60"
              :value="state.settings.staggerMinutes"
              class="mt-0.5 w-full rounded-xl bg-stone-50 px-3 py-2 text-sm ring-1 ring-stone-200/60 outline-none"
              @input="
                updateSettings({
                  staggerMinutes: Math.max(1, Number(($event.target as HTMLInputElement).value) || 5),
                })
              "
            />
          </label>
        </div>
      </div>

      <div>
        <p class="text-xs font-bold uppercase tracking-wider text-stone-500">
          {{ t('settings.phones') }}
        </p>
        <label class="mt-1 block">
          <span class="text-[11px] text-stone-400">{{ t('settings.prefix') }}</span>
          <input
            :value="state.settings.defaultPrefix"
            class="mt-0.5 w-full rounded-xl bg-stone-50 px-3 py-2 text-sm ring-1 ring-stone-200/60 outline-none"
            @input="updateSettings({ defaultPrefix: ($event.target as HTMLInputElement).value.replace(/\D/g, '') })"
          />
        </label>
      </div>

      <div>
        <p class="text-xs font-bold uppercase tracking-wider text-stone-500">
          {{ t('settings.waLink') }}
        </p>
        <div class="mt-1 grid grid-cols-3 gap-1.5">
          <button
            v-for="mode in (['auto', 'native', 'web'] as const)"
            :key="mode"
            class="rounded-xl py-2 text-xs font-bold capitalize transition active:scale-95"
            :class="
              state.settings.whatsappMode === mode
                ? 'bg-stone-900 text-white'
                : 'bg-stone-50 text-stone-500 ring-1 ring-stone-200/60'
            "
            @click="updateSettings({ whatsappMode: mode })"
          >
            {{ mode }}
          </button>
        </div>
        <p class="mt-1 text-[11px] text-stone-400">
          {{ t('settings.waHint') }}
        </p>
      </div>

      <button
        class="flex w-full items-center justify-between rounded-2xl bg-stone-50 p-3 text-sm font-bold ring-1 ring-stone-200/60 transition active:scale-[0.99]"
        @click="toggleNotifications"
      >
        <span class="flex items-center gap-2">
          <Bell v-if="state.settings.notificationsEnabled" class="h-4 w-4 text-amber-500" />
          <BellOff v-else class="h-4 w-4 text-stone-400" />
          {{ t('settings.reminders') }}
        </span>
        <span
          class="rounded-full px-2 py-0.5 text-[11px]"
          :class="
            state.settings.notificationsEnabled
              ? 'bg-emerald-100 text-emerald-700'
              : 'bg-stone-200 text-stone-500'
          "
        >
          {{ state.settings.notificationsEnabled ? t('settings.on') : t('settings.off') }}
        </span>
      </button>

      <div>
        <p class="text-xs font-bold uppercase tracking-wider text-stone-500">
          {{ t('settings.retention') }}
        </p>
        <div class="mt-1 flex items-center gap-2">
          <select
            :value="String(state.settings.retentionDays)"
            class="min-w-0 flex-1 rounded-xl bg-stone-50 px-3 py-2 text-sm ring-1 ring-stone-200/60 outline-none"
            @change="
              (updateSettings({
                retentionDays: Number(($event.target as HTMLSelectElement).value),
              }),
              cleanupHistory())
            "
          >
            <option value="0">{{ t('settings.forever') }}</option>
            <option value="7">{{ t('settings.d7') }}</option>
            <option value="30">{{ t('settings.d30') }}</option>
            <option value="90">{{ t('settings.d90') }}</option>
          </select>
        </div>
        <p class="mt-1 text-[11px] text-stone-400">
          {{ t('settings.retentionHint') }}
        </p>
      </div>

      <div>
        <p class="text-xs font-bold uppercase tracking-wider text-stone-500">
          {{ t('settings.backup') }}
        </p>
        <div class="mt-1 flex gap-2">
          <button
            class="flex flex-1 items-center justify-center gap-1 rounded-xl bg-stone-900 p-2 text-xs font-bold text-white transition active:scale-95"
            @click="download"
          >
            <Download class="h-4 w-4" /> {{ t('settings.export') }}
          </button>
          <button
            class="flex flex-1 items-center justify-center gap-1 rounded-xl bg-stone-100 p-2 text-xs font-bold transition active:scale-95"
            @click="showImport = !showImport"
          >
            <Upload class="h-4 w-4" /> {{ t('settings.import') }}
          </button>
        </div>
        <div v-if="showImport" class="mt-2">
          <textarea
            v-model="importText"
            rows="3"
            :placeholder="t('settings.importPh')"
            class="w-full rounded-xl bg-stone-50 p-2 text-xs ring-1 ring-stone-200/60 outline-none"
          />
          <button
            class="mt-1 w-full rounded-xl bg-stone-900 py-2 text-xs font-bold text-white transition active:scale-95 disabled:opacity-40"
            :disabled="!importText.trim()"
            @click="doImport"
          >
            {{ t('settings.restore') }}
          </button>
        </div>
      </div>

      <button
        class="flex w-full items-center justify-center gap-2 rounded-2xl bg-red-50 p-3 text-xs font-bold text-red-600 transition active:scale-[0.99]"
        @click="reset"
      >
        <RotateCcw class="h-4 w-4" /> {{ t('settings.reset') }}
      </button>

      <p v-if="message" class="rounded-xl bg-emerald-50 p-2 text-center text-xs text-emerald-700">
        {{ message }}
      </p>
    </div>
  </ActionSheet>
</template>
