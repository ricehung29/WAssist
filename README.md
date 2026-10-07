# WAssist — Personal WhatsApp Cockpit

Ultra-lightweight, local-first Vue 3 + Tailwind + Capacitor app. Zero cloud, zero backend,
zero account. All data stays on the device.

## Quick start

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # unit + component tests
npm run build    # type-check + production bundle
```

## Feature map

The dashboard is categorized into four tabs (persisted in `settings.activeTab`):

| Tab | What lives there |
| :--- | :--- |
| 🚀 **Send** | Pinned chats, conveyor belt, today's queue, Compose / Smart Paste / Templates launchers |
| 👥 **People** | Contact cards with tags, swipe actions, detail sheet (note, tags, history, one-tap queue) |
| 🔤 **Words** | Active template, template manager (spintax), personal quick-text shortcuts, cheat sheet |
| 🕘 **History** | Send log with today/all-time/queued stats, sent/skipped filters, one-tap reply |

| Spec | Where |
| :--- | :--- |
| 1 — Spintax engine | [src/utils/spintax.ts](src/utils/spintax.ts) — nested `{a\|b}`, `{{vars}}`, `sampleVariations()` for preview |
| 2 — 1-click follow-up | [src/components/FollowUpSheet.vue](src/components/FollowUpSheet.vue) + `snoozeFollowUp()` in [src/store.ts](src/store.ts) |
| 3 — `whatsapp://` deep links | [src/utils/whatsapp.ts](src/utils/whatsapp.ts) — native scheme on mobile, `wa.me` on desktop, invisible-iframe handoff on native; `openChat()` for plain chat opens |
| 4 — Clipboard + smart paste | [src/composables/useClipboardWatcher.ts](src/composables/useClipboardWatcher.ts), [src/components/SmartPasteSheet.vue](src/components/SmartPasteSheet.vue), [src/utils/sanitizer.ts](src/utils/sanitizer.ts) |
| 5 — Card stream + micro-notes | [src/components/ContactStream.vue](src/components/ContactStream.vue), [src/components/SwipeRow.vue](src/components/SwipeRow.vue), [src/composables/useSwipe.ts](src/composables/useSwipe.ts) |
| 6 — Passive alarms | [src/utils/notify.ts](src/utils/notify.ts) — `@capacitor/local-notifications`, channel + exact-alarm handling, web fallback |
| Pinned chats | [src/components/FavoritesBar.vue](src/components/FavoritesBar.vue) + `toggleFavorite()` / `favoriteContacts` in [src/store.ts](src/store.ts) |
| Personal shortcuts | [src/components/ShortcutsBar.vue](src/components/ShortcutsBar.vue) + `addSnippet()` / `removeSnippet()` in [src/store.ts](src/store.ts) |
| Conveyor belt | [src/components/ConveyorBelt.vue](src/components/ConveyorBelt.vue) |
| Compose (1:1 / 1:many) | [src/components/ComposeSheet.vue](src/components/ComposeSheet.vue) + `queueCustomMessage()` (per-recipient overrides) in [src/store.ts](src/store.ts) |
| Contact detail + tags | [src/components/ContactSheet.vue](src/components/ContactSheet.vue) + `buildContactTagList()` / `queueForContact()` |
| Send log + retention | [src/components/HistoryView.vue](src/components/HistoryView.vue) + `cleanupHistory()` / `sentCountToday` |
| Config / backup | [src/components/SettingsSheet.vue](src/components/SettingsSheet.vue) |

## Gemini skill

`.gemini/skills/wassist/` is an [Agent Skill](https://agentskills.io) for driving mass sends from
the Gemini CLI — recipient-line normalization, spintax linting and variant counting, pacing rules.
It is workspace-tier inside this repo (gemini picks it over any copy elsewhere when run from
here); `~/.gemini/skills/wassist` is a symlink to this folder, so it also loads from any directory.

```bash
# dry-run a template before queueing a batch
node .gemini/skills/wassist/scripts/render.js lint  --template tpl.txt
node .gemini/skills/wassist/scripts/render.js count --template tpl.txt --draws 20000 --target 120

# repackage for a Gemini surface that accepts skill uploads
cd .gemini/skills/wassist && zip -r wassist.zip . && cd -
```

`render.js` loads `node:fs` through a dynamic `import()` on purpose: this repo's
`"type": "module"` and an extracted copy of the skill (no type field) disagree about what a
`.js` file is, and only `import()` works in both.

## Architecture

```
src/
  types.ts                    Data models (Contact, MessageTemplate, QueueItem, Snippet, Settings)
  db.ts                       Dexie (IndexedDB) persistence + LocalStorage fallback, debounced saver
  store.ts                    Single reactive source of truth for contacts / templates / queue
  utils/spintax.ts            Spintax + variable resolution
  utils/sanitizer.ts          Phone cleaning, smart-paste parser, clipboard detection
  utils/whatsapp.ts           Deep-link construction + launch handoff (+ plain chat opens)
  utils/notify.ts             Passive alarm layer (native plugin + web fallback)
  utils/message.ts            Queue-row text previews
  composables/useSwipe.ts     Touch gesture primitive
  composables/useClipboardWatcher.ts
  components/                 App has 4 category tabs: FavoritesBar, ConveyorBelt, ContactStream,
                              ShortcutsBar, HistoryView, SwipeRow, ContactSheet, ActionSheet,
                              ComposeSheet, SmartPasteSheet, TemplateSheet, SettingsSheet, FollowUpSheet
  App.vue                     Tab shell (Send / People / Words / History) + sheet orchestration
```

Data flow: components dispatch store actions → store mutates reactive state → a debounced watcher
writes the whole blob to IndexedDB → `main.ts` awaits `initStore()` before mounting so the first
paint already has data.

## The "passive" model

There is no background service and no polling. When a message is queued, the app asks the OS for a
hardware alarm (`@capacitor/local-notifications`). The app can be killed and the alarm still fires
at the scheduled second. Sending is always a human tap: the app only builds the `whatsapp://` URL,
so nothing is ever auto-blasted and no accessibility service is involved.

## Quality gates in the wiring

- **The queue survives the hand-off** — mobile uses `whatsapp://` through an invisible iframe and
  falls back to `wa.me` in a new tab only when WhatsApp never took over (checked via
  `document.visibilityState` after a beat). Desktop — installed PWA window or browser tab — opens
  WhatsApp Web in its own window rather than navigating the app's own tab to `api.whatsapp.com`,
  which used to strand the belt mid-burst: the item never reached `sent` and the follow-up prompt
  never appeared. A blocked popup degrades to the old same-tab navigation.
- **Exact-alarm permission** — Android 12+ gates second-accurate alarms behind a separate setting.
  Toggling reminders in Config calls `checkExactNotificationSetting()` / `changeExactNotificationSetting()`
  and tells the user when the OS will batch instead.
- **Notification channel** — created on first permission request, otherwise Android 8+ silently
  drops the notification.
- **Today-only conveyor belt** — `pendingQueue` filters to today's local calendar day, so a
  follow-up scheduled for next week never blocks this morning's run.

## Native shells

Both platforms are checked in and already built once.

```bash
npm run android      # build → cap sync → open Android Studio
npm run ios          # build → cap sync → open Xcode
```

- Android: debug APK built successfully at
  `android/app/build/outputs/apk/debug/app-debug.apk`. Manifest declares `SCHEDULE_EXACT_ALARM`,
  `USE_EXACT_ALARM`, `VIBRATE`, `POST_NOTIFICATIONS`, `RECEIVE_BOOT_COMPLETED` (from the plugin) and
  a `<queries>` block for the `whatsapp` scheme.
- iOS: project generated and `LSApplicationQueriesSchemes` includes `whatsapp`. Building requires
  full Xcode plus CocoaPods, neither of which is installed on this machine — `npx cap sync ios`
  currently stops at `pod install`.

## Local prefix

Bare 8-digit numbers get the local prefix configured in Config (default `852` for Hong Kong).
Numbers already in international form are left alone.
