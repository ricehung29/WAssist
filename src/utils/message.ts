// Message presentation helpers.

import type { QueueItem } from '../types'

const CLIP = 96

/** One-line preview for queue rows, collapsing newlines. */
export function queueItemText(item: QueueItem): string {
  const flat = item.finalRenderedText.replace(/\s+/g, ' ').trim()
  return flat.length > CLIP ? `${flat.slice(0, CLIP - 1)}…` : flat
}
