// @vitest-environment jsdom

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { state } from '../store'
import {
  installed,
  pendingSend,
  probeWhatsAppApps,
  resolveTarget,
  sendMessage,
  chooseTarget,
  cancelPendingSend,
  targetSelectionSupported,
  __resetProbe,
} from './useWaTarget'

/** Pretend the Android plugin is present and reports the given install set. */
function stubNative(both: { whatsapp: boolean; business: boolean }) {
  vi.stubGlobal('Capacitor', {
    isNativePlatform: () => true,
    getPlatform: () => 'android',
    Plugins: {
      WaApps: {
        installed: () => Promise.resolve(both),
        open: vi.fn(() => Promise.resolve()),
      },
    },
  })
}

beforeEach(() => {
  installed.value = { whatsapp: false, business: false }
  pendingSend.value = null
  targetSelectionSupported.value = false
  state.settings.waTarget = 'ask'
  __resetProbe()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('resolveTarget', () => {
  it('asks when both apps are installed and the preference is ask', () => {
    installed.value = { whatsapp: true, business: true }
    expect(resolveTarget()).toBeNull()
  })

  it('honours an explicit preference', () => {
    installed.value = { whatsapp: true, business: true }
    state.settings.waTarget = 'business'
    expect(resolveTarget()).toBe('business')
  })

  it('degrades a preference for an app that is not installed', () => {
    installed.value = { whatsapp: true, business: false }
    state.settings.waTarget = 'business'
    expect(resolveTarget()).toBe('whatsapp')
  })

  it('never asks when only one app is present', () => {
    installed.value = { whatsapp: false, business: true }
    expect(resolveTarget()).toBe('business')
  })

  it('defaults to personal WhatsApp when nothing was detected', () => {
    expect(resolveTarget()).toBe('whatsapp')
  })
})

describe('probeWhatsAppApps', () => {
  it('records what the plugin reports', async () => {
    stubNative({ whatsapp: true, business: true })
    await probeWhatsAppApps()
    expect(targetSelectionSupported.value).toBe(true)
    expect(installed.value).toEqual({ whatsapp: true, business: true })
  })

  it('only probes once until reset', async () => {
    stubNative({ whatsapp: true, business: true })
    await probeWhatsAppApps()
    vi.stubGlobal('Capacitor', { isNativePlatform: () => false })
    await probeWhatsAppApps()
    expect(installed.value).toEqual({ whatsapp: true, business: true })
  })

  it('reports nothing installed off Android', async () => {
    vi.stubGlobal('Capacitor', { isNativePlatform: () => false })
    await probeWhatsAppApps()
    expect(targetSelectionSupported.value).toBe(false)
    expect(installed.value).toEqual({ whatsapp: false, business: false })
  })
})

describe('sendMessage', () => {
  it('waits for the picker when the target is ambiguous', async () => {
    stubNative({ whatsapp: true, business: true })
    installed.value = { whatsapp: true, business: true }
    let settled = false
    const p = sendMessage('85291234567', 'Hi').then(() => {
      settled = true
    })
    await Promise.resolve()
    expect(settled).toBe(false)
    expect(pendingSend.value).not.toBeNull()

    await chooseTarget('business')
    await p
    expect(settled).toBe(true)
    expect(pendingSend.value).toBeNull()
  })

  it('sends straight through when the target is known', async () => {
    // Native plugin present, so the send is pinned instead of falling back to a
    // bare scheme link (which jsdom cannot navigate).
    stubNative({ whatsapp: true, business: false })
    installed.value = { whatsapp: true, business: false }
    const plugin = (
      globalThis as unknown as {
        Capacitor: { Plugins: { WaApps: { open: ReturnType<typeof vi.fn> } } }
      }
    ).Capacitor.Plugins.WaApps
    await sendMessage('85291234567', 'Hi')
    expect(plugin.open).toHaveBeenCalledWith({
      phone: '85291234567',
      text: 'Hi',
      target: 'whatsapp',
    })
    expect(pendingSend.value).toBeNull()
  })

  it('settles without sending when the picker is dismissed', async () => {
    stubNative({ whatsapp: true, business: true })
    installed.value = { whatsapp: true, business: true }
    let settled = false
    const p = sendMessage('85291234567', 'Hi').then(() => {
      settled = true
    })
    await Promise.resolve()
    cancelPendingSend()
    await p
    expect(settled).toBe(true)
    expect(pendingSend.value).toBeNull()
  })
})