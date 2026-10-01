// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import App from './App.vue'
import { state, resetAll, initStore, pendingQueue, queueList, sentCount } from './store'
import { launchWhatsApp } from './utils/whatsapp'

// Never actually navigate the jsdom window during tests.
vi.mock('./utils/whatsapp', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./utils/whatsapp')>()
  return { ...actual, launchWhatsApp: vi.fn(actual.buildWhatsAppLink) }
})

const PASTE = ['Ken, 9123 4567, decision maker', 'Mary Wong 9355-1234 prefers text'].join('\n')

async function mountApp() {
  await initStore()
  // initStore hydrates over the state, so pin the locale after it runs.
  state.settings.locale = 'en'
  const wrapper = mount(App, { attachTo: document.body })
  await flushPromises()
  return wrapper
}

/** Walk the Smart Paste sheet: open → type → add. */
async function queueFromPaste(wrapper: VueWrapper) {
  await clickButton(wrapper, 'Smart Paste')
  await wrapper.find('textarea').setValue(PASTE)
  await flushPromises()
  await clickButton(wrapper, 'to queue')
  await flushPromises()
}

/** Click the first button whose label contains `label`. */
async function clickButton(wrapper: VueWrapper, label: string) {
  const button = wrapper.findAll('button').find((b) => b.text().includes(label))
  if (!button) throw new Error(`No button matching "${label}"`)
  await button.trigger('click')
  await flushPromises()
}

/** Click a bottom-nav tab by its aria-label (text matching is ambiguous). */
async function clickTab(wrapper: VueWrapper, label: string) {
  await wrapper.find(`button[aria-label="${label}"]`).trigger('click')
  await flushPromises()
}

beforeEach(async () => {
  localStorage.clear()
  await resetAll()
})

afterEach(() => {
  vi.clearAllMocks()
  document.body.innerHTML = ''
})

describe('WAssist dashboard', () => {
  it('mounts with an empty queue and no MIT capsule', async () => {
    const wrapper = await mountApp()
    expect(wrapper.text()).toContain('WAssist')
    expect(wrapper.text()).not.toContain("Today's MIT")
    expect(wrapper.text()).toContain('Queue is clear')
    wrapper.unmount()
  })

  it('parses pasted contacts into the queue with sanitized phones', async () => {
    const wrapper = await mountApp()
    await queueFromPaste(wrapper)

    expect(state.contacts).toHaveLength(2)
    expect(state.contacts.map((c) => c.phone)).toEqual(['85291234567', '85293551234'])
    expect(pendingQueue.value).toHaveLength(2)
    expect(wrapper.text()).toContain('Next up (1/2): Ken')
    wrapper.unmount()
  })

  it('renders the per-recipient note on the conveyor belt', async () => {
    const wrapper = await mountApp()
    await queueFromPaste(wrapper)
    expect(wrapper.text()).toContain('decision maker')
    wrapper.unmount()
  })

  it('launches the next contact, marks it sent and opens the follow-up sheet', async () => {
    const wrapper = await mountApp()
    await queueFromPaste(wrapper)

    const launch = wrapper.findAll('button').find((b) => b.text().includes('LAUNCH & SEND'))!
    await launch.trigger('click')
    await flushPromises()

    expect(launchWhatsApp).toHaveBeenCalledOnce()
    const [phone, text] = vi.mocked(launchWhatsApp).mock.calls[0]!
    expect(phone).toBe('85291234567')
    expect(text).toContain('Ken')

    expect(sentCount.value).toBe(1)
    expect(pendingQueue.value).toHaveLength(1)
    expect(wrapper.text()).toContain('Sent to Ken')
    expect(wrapper.text()).toContain('Follow up in 2 Days')
    wrapper.unmount()
  })

  it('re-queues a follow-up N days out when snoozing', async () => {
    const wrapper = await mountApp()
    await queueFromPaste(wrapper)

    await clickButton(wrapper, 'LAUNCH & SEND')
    await clickButton(wrapper, 'Follow up in 2 Days')

    // The follow-up is 2 days out, so today's belt keeps only Mary.
    expect(pendingQueue.value).toHaveLength(1)
    expect(pendingQueue.value[0]!.name).toBe('Mary Wong')
    expect(queueList.value).toHaveLength(2)

    const followUp = state.queue.find((q) => q.followUpDays === 2)!
    expect(followUp.name).toBe('Ken')
    expect(followUp.status).toBe('pending')
    expect(new Date(followUp.scheduledTime).getHours()).toBe(9)
    expect(wrapper.text()).toContain('follow-up')

    const followUpDay = new Date(followUp.scheduledTime)
    const today = new Date()
    // Calendar-day distance: snoozed 2 days out, at 9am.
    const dayDiff =
      new Date(followUpDay.getFullYear(), followUpDay.getMonth(), followUpDay.getDate()).getTime() -
      new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
    expect(Math.round(dayDiff / 86_400_000)).toBe(2)
    wrapper.unmount()
  })

  it('closes the loop without re-queuing when picking Done', async () => {
    const wrapper = await mountApp()
    await queueFromPaste(wrapper)

    await clickButton(wrapper, 'LAUNCH & SEND')
    await clickButton(wrapper, 'Done / No Follow-up')

    expect(state.queue.filter((q) => q.followUpDays)).toHaveLength(0)
    expect(pendingQueue.value).toHaveLength(1)
    wrapper.unmount()
  })

  it('skips the current contact without sending', async () => {
    const wrapper = await mountApp()
    await queueFromPaste(wrapper)

    await clickButton(wrapper, 'Skip')

    expect(launchWhatsApp).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Next up (1/1): Mary Wong')
    wrapper.unmount()
  })

  it('composes a one-to-one message without Smart Paste', async () => {
    const wrapper = await mountApp()
    await queueFromPaste(wrapper) // seed two contacts, then start fresh
    state.queue = []

    await clickButton(wrapper, 'Compose')
    await wrapper.find('textarea').setValue('Hi {{name}}, quick one — free tomorrow?')
    await flushPromises()

    // Tick only Ken, leave Mary unticked.
    const kenRow = wrapper
      .findAll('li')
      .find((li) => li.text().includes('Ken') && li.text().includes('91234567'))!
    await kenRow.find('button[aria-label^="Select"]').trigger('click')
    await flushPromises()

    const queueBtn = wrapper
      .findAll('button')
      .find((b) => b.text().includes('Queue for 1'))!
    await queueBtn.trigger('click')
    await flushPromises()

    expect(pendingQueue.value).toHaveLength(1)
    expect(pendingQueue.value[0]!.finalRenderedText).toContain('Hi Ken')
    expect(wrapper.text()).toContain('Next up (1/1): Ken')
    wrapper.unmount()
  })

  it('composes one message for many with a per-recipient tweak', async () => {
    const wrapper = await mountApp()
    await queueFromPaste(wrapper)
    state.queue = []

    await clickButton(wrapper, 'Compose')
    await wrapper.find('textarea').setValue('Hi {{name}}, still good for Saturday?')
    await flushPromises()

    // Tick both contacts.
    for (const li of wrapper.findAll('li')) {
      if (!li.text().includes('8529') && !li.text().includes('8529')) continue
      const sel = li.find('button[aria-label^="Select"]')
      if (sel.exists()) {
        await sel.trigger('click')
        await flushPromises()
      }
    }
    expect(wrapper.text()).toContain('2 recipients')

    // Tweak Mary's copy only.
    const maryRow = wrapper.findAll('li').find((li) => li.text().includes('Mary Wong'))!
    await clickButton(maryRow as unknown as VueWrapper, 'Tweak')
    const tweakInput = maryRow.find('input[placeholder^="Optional"]')
    await tweakInput.setValue('Hi Mary, still good for Saturday? Bringing cake')
    await flushPromises()

    const queueBtn = wrapper
      .findAll('button')
      .find((b) => b.text().includes('Queue for 2'))!
    await queueBtn.trigger('click')
    await flushPromises()

    expect(pendingQueue.value).toHaveLength(2)
    const texts = pendingQueue.value.map((q) => q.finalRenderedText)
    expect(texts).toContain('Hi Ken, still good for Saturday?')
    expect(texts).toContain('Hi Mary, still good for Saturday? Bringing cake')
    wrapper.unmount()
  })

  it('pins a contact to the favorites bar', async () => {
    const wrapper = await mountApp()
    await queueFromPaste(wrapper)

    // People tab → pin Ken with the ☆ button.
    await clickTab(wrapper, 'People')
    const pin = wrapper.find('button[aria-label="Pin chat"]')
    expect(pin.exists()).toBe(true)
    await pin.trigger('click')
    await flushPromises()

    await clickTab(wrapper, 'Send')
    expect(wrapper.text()).toContain('Pinned chats')
    expect(state.favorites).toHaveLength(1)
    wrapper.unmount()
  })

  it('copies a personal shortcut from My shortcuts', async () => {
    const wrapper = await mountApp()
    await clickTab(wrapper, 'Words')
    expect(wrapper.text()).toContain('My shortcuts')
    expect(wrapper.text()).toContain('On my way')
    wrapper.unmount()
  })

  it('navigates categories and keeps the active tab in settings', async () => {
    const wrapper = await mountApp()
    expect(wrapper.find('button[aria-label="Send"]').exists()).toBe(true)

    await clickTab(wrapper, 'History')
    expect(wrapper.text()).toContain('All time')
    expect(state.settings.activeTab).toBe('history')

    await clickTab(wrapper, 'Send')
    expect(state.settings.activeTab).toBe('send')
    expect(wrapper.text()).toContain('WhatsApp Conveyor Belt')
    wrapper.unmount()
  })

  it('logs a sent message into History with a reply button', async () => {
    const wrapper = await mountApp()
    await queueFromPaste(wrapper)
    await clickButton(wrapper, 'LAUNCH & SEND')
    await clickButton(wrapper, 'Done / No Follow-up')

    await clickTab(wrapper, 'History')
    expect(wrapper.text()).toContain('Ken')
    expect(wrapper.find('button[aria-label="Reply"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('opens the contact detail sheet with tags and history', async () => {
    const wrapper = await mountApp()
    await queueFromPaste(wrapper)
    await clickTab(wrapper, 'People')

    await clickButton(wrapper, 'Ken')
    expect(wrapper.text()).toContain('Tags')
    expect(wrapper.text()).toContain('History')
    wrapper.unmount()
  })

  it('persists the queue to local storage across a remount', async () => {
    const wrapper = await mountApp()
    await queueFromPaste(wrapper)
    await new Promise((r) => setTimeout(r, 500)) // let the debounced saver flush
    wrapper.unmount()

    const raw = localStorage.getItem('morning-launchpad:v1')
    expect(raw).toBeTruthy()
    expect(JSON.parse(raw!).contacts).toHaveLength(2)
  })

  it('shows template spintax variations in the preview', async () => {
    const wrapper = await mountApp()
    await clickButton(wrapper, 'Templates')

    await clickButton(wrapper, 'Preview')

    expect(wrapper.text()).toContain('Ken')
    wrapper.unmount()
  })
})
