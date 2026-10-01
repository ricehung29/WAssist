// Feature 5 — touch gestures for the contact card stream.

import { ref, type Ref } from 'vue'

export interface SwipeOptions {
  /** Horizontal distance (px) that counts as a full swipe. */
  threshold?: number
  onSwipeRight?: () => void
  onSwipeLeft?: () => void
}

export interface SwipeHandlers {
  offset: Ref<number>
  dragging: Ref<boolean>
  onTouchStart: (e: TouchEvent) => void
  onTouchMove: (e: TouchEvent) => void
  onTouchEnd: () => void
  reset: () => void
}

/** Swipe right → primary action, swipe left → secondary action. */
export function useSwipe(options: SwipeOptions): SwipeHandlers {
  const threshold = options.threshold ?? 90
  const offset = ref(0)
  const dragging = ref(false)
  let startX = 0
  let startY = 0
  let axis: 'none' | 'x' | 'y' = 'none'

  function onTouchStart(e: TouchEvent) {
    const t = e.touches[0]
    if (!t) return
    startX = t.clientX
    startY = t.clientY
    axis = 'none'
    dragging.value = true
  }

  function onTouchMove(e: TouchEvent) {
    if (!dragging.value) return
    const t = e.touches[0]
    if (!t) return
    const dx = t.clientX - startX
    const dy = t.clientY - startY
    if (axis === 'none') {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
      // Let vertical scrolling win unless the gesture is clearly horizontal.
      axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
    }
    if (axis !== 'x') return
    offset.value = Math.max(-140, Math.min(140, dx))
  }

  function onTouchEnd() {
    if (!dragging.value) return
    dragging.value = false
    if (offset.value >= threshold) options.onSwipeRight?.()
    else if (offset.value <= -threshold) options.onSwipeLeft?.()
    offset.value = 0
    axis = 'none'
  }

  function reset() {
    offset.value = 0
    dragging.value = false
    axis = 'none'
  }

  return { offset, dragging, onTouchStart, onTouchMove, onTouchEnd, reset }
}
