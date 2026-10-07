// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach } from 'vitest'
import { buildWhatsAppLink, launchWhatsApp, openChat } from './whatsapp'

function setUserAgent(ua: string) {
  vi.stubGlobal('navigator', { userAgent: ua })
}

/** Track same-tab navigations instead of moving the jsdom page. */
function stubLocation() {
  const loc = { href: '' }
  vi.stubGlobal('location', loc)
  return loc
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('buildWhatsAppLink', () => {
  it('uses the native scheme on a mobile browser', () => {
    setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')
    expect(buildWhatsAppLink('85291234567', 'Hi Ken')).toBe(
      'whatsapp://send?phone=85291234567&text=Hi%20Ken',
    )
  })

  it('falls back to wa.me on desktop', () => {
    setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')
    expect(buildWhatsAppLink('85291234567', 'Hi Ken')).toBe(
      'https://wa.me/85291234567?text=Hi%20Ken',
    )
  })

  it('honours an explicit native override on desktop', () => {
    setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')
    expect(buildWhatsAppLink('85291234567', 'Hi', 'native')).toContain('whatsapp://send')
  })

  it('honours an explicit web override on mobile', () => {
    setUserAgent('Mozilla/5.0 (Linux; Android 14)')
    expect(buildWhatsAppLink('85291234567', 'Hi', 'web')).toContain('https://wa.me/')
  })

  it('URL-encodes newlines and special characters', () => {
    setUserAgent('Mozilla/5.0 (Linux; Android 14)')
    const link = buildWhatsAppLink('85291234567', 'Line 1\nLine 2 & more?')
    expect(link).toContain('Line%201%0ALine%202%20%26%20more%3F')
  })
})

describe('launchWhatsApp', () => {
  it('hands a desktop send off in its own window so the queue survives', () => {
    setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')
    const loc = stubLocation()
    const open = vi.fn(() => ({ opener: {} } as unknown as Window))
    vi.stubGlobal('open', open)

    const link = launchWhatsApp('85291234567', 'Hi Ken')

    expect(link).toBe('https://wa.me/85291234567?text=Hi%20Ken')
    expect(open).toHaveBeenCalledWith(link, '_blank')
    expect(loc.href).toBe('') // same tab must not navigate away
  })

  it('falls back to a same-tab navigation when the popup is blocked', () => {
    setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')
    const loc = stubLocation()
    vi.stubGlobal('open', vi.fn(() => null))

    launchWhatsApp('85291234567', 'Hi Ken')

    expect(loc.href).toBe('https://wa.me/85291234567?text=Hi%20Ken')
  })

  it('keeps a mobile web send on the same tab (no stray tabs)', () => {
    setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')
    const loc = stubLocation()
    const open = vi.fn()
    vi.stubGlobal('open', open)

    launchWhatsApp('85291234567', 'Hi Ken', 'web')

    expect(open).not.toHaveBeenCalled()
    expect(loc.href).toContain('https://wa.me/85291234567')
  })
})

describe('openChat', () => {
  it('opens a plain chat on desktop in its own window with no prefilled text', () => {
    setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')
    const loc = stubLocation()
    const open = vi.fn(() => ({ opener: {} } as unknown as Window))
    vi.stubGlobal('open', open)

    const link = openChat('85291234567')

    expect(link).toBe('https://wa.me/85291234567')
    expect(open).toHaveBeenCalledWith(link, '_blank')
    expect(loc.href).toBe('')
  })

  it('uses the native scheme on mobile without a text param', () => {
    setUserAgent('Mozilla/5.0 (Linux; Android 14)')
    const iframe = { style: {} as CSSStyleDeclaration, remove: vi.fn() }
    vi.spyOn(document, 'createElement').mockReturnValue(iframe as unknown as HTMLElement)
    vi.spyOn(document.body, 'appendChild').mockImplementation(((n: Node) => n) as never)
    const link = openChat('85291234567', 'native')
    expect(link).toBe('whatsapp://send?phone=85291234567')
    expect(link).not.toContain('text=')
    vi.restoreAllMocks()
  })
})
