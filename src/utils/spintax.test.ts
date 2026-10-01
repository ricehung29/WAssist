import { describe, it, expect } from 'vitest'
import { resolveSpintax, fillVariables, renderTemplate, sampleVariations } from './spintax'

const first = () => 0
const last = () => 0.999

describe('resolveSpintax', () => {
  it('picks the first option when rand() is 0', () => {
    expect(resolveSpintax('{Hello|Hi|Hey} there', first)).toBe('Hello there')
  })

  it('picks the last option when rand() is ~1', () => {
    expect(resolveSpintax('{Hello|Hi|Hey} there', last)).toBe('Hey there')
  })

  it('resolves multiple independent blocks', () => {
    expect(resolveSpintax('{A|B} and {C|D}', first)).toBe('A and C')
  })

  it('resolves nested blocks', () => {
    expect(resolveSpintax('{Hi {there|you}|Hello}', first)).toBe('Hi there')
  })

  it('handles empty options', () => {
    expect(resolveSpintax('Hi{|, how are you} Ken', first)).toBe('Hi Ken')
  })

  it('leaves text without spintax untouched', () => {
    expect(resolveSpintax('plain text', first)).toBe('plain text')
  })
})

describe('fillVariables', () => {
  it('replaces a variable', () => {
    expect(fillVariables('Hi {{name}}', { name: 'Ken' })).toBe('Hi Ken')
  })

  it('is case-insensitive and whitespace tolerant', () => {
    expect(fillVariables('Hi {{ NAME }}', { name: 'Ken' })).toBe('Hi Ken')
  })

  it('replaces every occurrence', () => {
    expect(fillVariables('{{name}}, {{name}}!', { name: 'Ken' })).toBe('Ken, Ken!')
  })

  it('leaves unknown variables in place', () => {
    expect(fillVariables('Hi {{unknown}}', { name: 'Ken' })).toBe('Hi {{unknown}}')
  })
})

describe('renderTemplate', () => {
  it('runs variables before spintax', () => {
    const out = renderTemplate('{Hi|Hello} {{name}}', { name: 'Ken' }, first)
    expect(out).toBe('Hi Ken')
  })

  it('collapses whitespace left by empty options', () => {
    const out = renderTemplate('Hi{| there}   Ken', {}, first)
    expect(out).toBe('Hi Ken')
  })

  it('produces syntactically distinct output as rand varies', () => {
    const tpl = '{Hi|Hello} {{name}}, {checking in|following up}'
    const a = renderTemplate(tpl, { name: 'Ken' }, () => 0)
    const b = renderTemplate(tpl, { name: 'Ken' }, () => 0.99)
    expect(a).not.toBe(b)
  })
})

describe('sampleVariations', () => {
  it('returns the requested number of unique samples', () => {
    const out = sampleVariations('{A|B|C} {1|2|3}', {}, 5)
    expect(out).toHaveLength(5)
    expect(new Set(out).size).toBe(5)
  })

  it('stops early when the template has no variety', () => {
    expect(sampleVariations('only one option', {}, 5)).toEqual(['only one option'])
  })
})
