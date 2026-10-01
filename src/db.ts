// Local-first persistence: Dexie (IndexedDB) with a LocalStorage fallback
// for private-mode / unsupported browsers. Zero network, zero backend.

import Dexie, { type Table } from 'dexie'
import type { PersistedState } from './types'

const DB_NAME = 'morning-launchpad'
const LS_KEY = 'morning-launchpad:v1'
const ROW_KEY = 'state'

interface KV {
  key: string
  value: PersistedState
}

class LaunchpadDB extends Dexie {
  kv!: Table<KV, string>

  constructor() {
    super(DB_NAME)
    this.version(1).stores({ kv: 'key' })
  }
}

let db: LaunchpadDB | null = null

function openDb(): LaunchpadDB | null {
  if (typeof indexedDB === 'undefined') return null
  try {
    db ??= new LaunchpadDB()
    return db
  } catch {
    return null
  }
}

export async function loadState(): Promise<PersistedState | null> {
  const database = openDb()
  if (database) {
    try {
      const row = await database.kv.get(ROW_KEY)
      if (row) return row.value
    } catch {
      /* fall through to LocalStorage */
    }
  }
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) return JSON.parse(raw) as PersistedState
  } catch {
    /* nothing recoverable */
  }
  return null
}

export async function saveState(state: PersistedState): Promise<void> {
  const database = openDb()
  if (database) {
    try {
      await database.kv.put({ key: ROW_KEY, value: state })
      return
    } catch {
      /* fall through to LocalStorage */
    }
  }
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state))
  } catch {
    /* storage full / private mode — app keeps working in memory */
  }
}

export async function clearState(): Promise<void> {
  const database = openDb()
  if (database) {
    try {
      await database.kv.delete(ROW_KEY)
    } catch {
      /* ignore */
    }
  }
  try {
    localStorage.removeItem(LS_KEY)
  } catch {
    /* ignore */
  }
}

/** Debounced writer so rapid reactive mutations collapse into one disk write. */
export function createSaver(delayMs = 400) {
  let timer: ReturnType<typeof setTimeout> | null = null
  let queued: PersistedState | null = null

  return {
    queue(state: PersistedState) {
      queued = state
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = null
        if (queued) void saveState(queued)
      }, delayMs)
    },
    async flush() {
      if (timer) clearTimeout(timer)
      timer = null
      if (queued) await saveState(queued)
    },
  }
}
