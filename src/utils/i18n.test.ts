// @vitest-environment jsdom

import { describe, it, expect, beforeEach } from 'vitest'
import { t, STRINGS, syncDocumentLang } from './i18n'
import { state, resetAll } from '../store'

beforeEach(async () => {
  await resetAll()
})

describe('t', () => {
  it('returns Cantonese by default (shipped locale)', async () => {
    await resetAll()
    expect(state.settings.locale).toBe('zh-HK')
    expect(t('tab.send')).toBe('傳送')
    expect(t('belt.launch')).toBe('開 WHATSAPP 傳送')
  })

  it('switches to English when the locale setting changes', async () => {
    await resetAll()
    state.settings.locale = 'en'
    expect(t('tab.send')).toBe('Send')
    expect(t('belt.launch')).toBe('LAUNCH & SEND VIA WHATSAPP')
  })

  it('interpolates named vars in both locales', async () => {
    await resetAll()
    state.settings.locale = 'en'
    expect(t('belt.nextUp', { pos: '1/3', name: 'Ken' })).toBe('Next up (1/3): Ken')

    state.settings.locale = 'zh-HK'
    expect(t('belt.nextUp', { pos: '1/3', name: '阿明' })).toBe('下一位（1/3）：阿明')
  })

  it('falls back to the key when a string is missing', async () => {
    await resetAll()
    expect(t('nope.not.a.key')).toBe('nope.not.a.key')
  })

  it('has no key present in one locale but missing in the other', () => {
    const en = Object.keys(STRINGS.en).sort()
    const zh = Object.keys(STRINGS['zh-HK']).sort()
    expect(zh).toEqual(en)
  })

  it('leaves no string empty in either locale', () => {
    for (const [locale, dict] of Object.entries(STRINGS)) {
      for (const [key, value] of Object.entries(dict)) {
        expect(value.trim(), `${locale}.${key} is empty`).not.toBe('')
      }
    }
  })

  it('syncs <html lang> with the active locale', async () => {
    await resetAll()
    state.settings.locale = 'zh-HK'
    syncDocumentLang()
    expect(document.documentElement.lang).toBe('zh-HK')

    state.settings.locale = 'en'
    syncDocumentLang()
    expect(document.documentElement.lang).toBe('en')
  })
})
