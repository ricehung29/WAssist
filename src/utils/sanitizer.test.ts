import { describe, it, expect } from 'vitest'
import {
  sanitizePhone,
  isValidPhone,
  hasContactPattern,
  parseSmartPaste,
} from './sanitizer'

describe('sanitizePhone', () => {
  it('strips formatting characters', () => {
    expect(sanitizePhone('9123-4567')).toBe('85291234567')
    expect(sanitizePhone('(912) 345 67')).toBe('85291234567')
  })

  it('auto-prepends the local prefix to bare 8-digit numbers', () => {
    expect(sanitizePhone('91234567')).toBe('85291234567')
    expect(sanitizePhone('91234567', '86')).toBe('8691234567')
  })

  it('keeps already-international numbers intact', () => {
    expect(sanitizePhone('+852 9123 4567')).toBe('85291234567')
    expect(sanitizePhone('85291234567')).toBe('85291234567')
  })

  it('strips the 00 international prefix', () => {
    expect(sanitizePhone('0085291234567')).toBe('85291234567')
  })
})

describe('isValidPhone', () => {
  it('accepts 8–15 digits', () => {
    expect(isValidPhone('85291234567')).toBe(true)
    expect(isValidPhone('12345678')).toBe(true)
  })

  it('rejects too short or too long', () => {
    expect(isValidPhone('1234567')).toBe(false)
    expect(isValidPhone('1234567890123456')).toBe(false)
  })
})

describe('hasContactPattern', () => {
  it('detects a phone number inside prose', () => {
    expect(hasContactPattern('call me on 9123 4567 tomorrow')).toBe(true)
  })

  it('ignores text without a phone number', () => {
    expect(hasContactPattern('no numbers here')).toBe(false)
    expect(hasContactPattern('order 12345')).toBe(false)
  })
})

describe('parseSmartPaste', () => {
  it('parses name, phone and note from a comma line', () => {
    expect(parseSmartPaste('Ken, 9123 4567, decision maker')).toEqual([
      { name: 'Ken', phone: '85291234567', note: 'decision maker' },
    ])
  })

  it('parses a line with the note trailing without a separator', () => {
    const [parsed] = parseSmartPaste('Mary Wong 9355-1234 prefers text')
    expect(parsed?.phone).toBe('85293551234')
    expect(parsed?.name).toContain('Mary Wong')
    expect(parsed?.note).toContain('prefers text')
  })

  it('handles one contact per line and skips junk lines', () => {
    const out = parseSmartPaste(
      ['Header line', 'Ken, 91234567', '', 'Mary Wong 9355 1234'].join('\n'),
    )
    expect(out).toHaveLength(2)
    expect(out.map((c) => c.phone)).toEqual(['85291234567', '85293551234'])
  })

  it('keeps an international number as-is', () => {
    expect(parseSmartPaste('+852 6789 0001')[0]?.phone).toBe('85267890001')
  })

  it('falls back to the phone as the name when no name is present', () => {
    expect(parseSmartPaste('91234567')[0]?.name).toBe('85291234567')
  })
})
