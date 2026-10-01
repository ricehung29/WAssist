import './style.css'
import { createApp } from 'vue'
import App from './App.vue'
import { initStore, state } from './store'
import { syncDocumentLang } from './utils/i18n'

initStore().finally(() => {
  syncDocumentLang()
  // Falsy write: legacy blobs without a locale hydrate to the default (zh-HK),
  // which is a no-op for the watcher but keeps the lang tag correct.
  if (!state.settings.locale) state.settings.locale = 'zh-HK'
  createApp(App).mount('#app')
})
