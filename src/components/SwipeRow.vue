<script setup lang="ts">
import { useSwipe } from '../composables/useSwipe'

const props = defineProps<{
  onRight?: () => void
  onLeft?: () => void
}>()

const { offset, dragging, onTouchStart, onTouchMove, onTouchEnd } = useSwipe({
  threshold: 90,
  onSwipeRight: () => props.onRight?.(),
  onSwipeLeft: () => props.onLeft?.(),
})
</script>

<template>
  <!--
    Swipe is the phone gesture; on a pointer device the same two actions are
    already on the row as buttons, so nothing is lost when it is unused.
  -->
  <div
    class="relative touch-pan-y"
    :style="{
      transform: `translateX(${offset}px)`,
      transition: dragging ? 'none' : 'transform 180ms ease-out',
    }"
    @touchstart.passive="onTouchStart"
    @touchmove.passive="onTouchMove"
    @touchend="onTouchEnd"
    @touchcancel="onTouchEnd"
  >
    <slot />
  </div>
</template>
