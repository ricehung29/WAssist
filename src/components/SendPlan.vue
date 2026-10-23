<script setup lang="ts">
import { computed } from 'vue'
import { CalendarClock } from 'lucide-vue-next'
import { planSlots } from '../store'
import { groupByDay } from '../utils/schedule'
import { t } from '../utils/i18n'

const props = defineProps<{
  /** How many messages this batch will queue. */
  count: number
}>()

const plan = computed(() => (props.count > 0 ? planSlots(props.count) : { slots: [], truncated: false }))
const days = computed(() => groupByDay(plan.value.slots))

function fmtTime(d: Date) {
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function fmtDay(d: Date) {
  const today = new Date()
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
  if (d.toDateString() === today.toDateString()) return t('queue.today')
  if (d.toDateString() === tomorrow.toDateString()) return t('queue.tomorrow')
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
}
</script>

<template>
  <div v-if="days.length" class="mt-3 rounded-2xl bg-stone-50 p-3 ring-1 ring-stone-200/60">
    <p class="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-stone-500">
      <CalendarClock class="h-3.5 w-3.5" /> {{ t('plan.title') }}
    </p>

    <ul class="mt-1.5 space-y-0.5">
      <li v-for="d in days" :key="d.dayKey" class="flex items-baseline gap-2 text-xs">
        <span class="w-24 shrink-0 font-bold text-stone-700">{{ fmtDay(d.day) }}</span>
        <span class="flex-1 text-stone-600">
          {{ t('plan.line', { n: d.count, first: fmtTime(d.first), last: fmtTime(d.last) }) }}
        </span>
      </li>
    </ul>

    <p
      class="mt-1.5 text-[11px]"
      :class="plan.truncated ? 'font-bold text-amber-700' : 'text-stone-400'"
    >
      {{
        plan.truncated
          ? t('plan.overflow', { fits: plan.slots.length, n: count })
          : t('plan.fits', { n: count })
      }}
    </p>
  </div>
</template>
