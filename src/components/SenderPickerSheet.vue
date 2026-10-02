<script setup lang="ts">
import { MessageCircle, Briefcase, X } from 'lucide-vue-next'
import ActionSheet from './ActionSheet.vue'
import { chooseTarget, cancelPendingSend } from '../composables/useWaTarget'
import { t } from '../utils/i18n'
import type { WhatsAppTarget } from '../utils/whatsapp'

/** Shows only while a send is waiting on the user (both WhatsApp apps installed). */

function pick(target: WhatsAppTarget) {
  void chooseTarget(target)
}

function dismiss() {
  cancelPendingSend()
}
</script>

<template>
  <ActionSheet :title="t('wa.whichApp')" @close="dismiss">
    <p class="mt-1 text-xs text-stone-500">{{ t('wa.whichAppHint') }}</p>

    <div class="mt-3 space-y-2">
      <button
        class="flex w-full items-center gap-3 rounded-2xl bg-emerald-500 p-3 text-left text-white shadow-md shadow-emerald-200 transition active:scale-[0.99]"
        @click="pick('whatsapp')"
      >
        <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/20">
          <MessageCircle class="h-5 w-5" />
        </span>
        <span class="min-w-0 flex-1">
          <span class="block text-sm font-bold">{{ t('wa.personal') }}</span>
          <span class="block text-[11px] text-white/80">WhatsApp</span>
        </span>
      </button>

      <button
        class="flex w-full items-center gap-3 rounded-2xl bg-stone-900 p-3 text-left text-white shadow-md shadow-stone-300/50 transition active:scale-[0.99]"
        @click="pick('business')"
      >
        <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15">
          <Briefcase class="h-5 w-5" />
        </span>
        <span class="min-w-0 flex-1">
          <span class="block text-sm font-bold">{{ t('wa.business') }}</span>
          <span class="block text-[11px] text-white/70">WhatsApp Business</span>
        </span>
      </button>
    </div>

    <button
      class="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-stone-100 py-2 text-xs font-bold text-stone-500 transition active:scale-95"
      @click="dismiss"
    >
      <X class="h-3.5 w-3.5" /> {{ t('wa.cancel') }}
    </button>
  </ActionSheet>
</template>