// Feature 1 — Spintax Engine (Anti-Ban Semantic Randomizer)
// Supports nested `{opt1|opt2|{nestedA|nestedB}}` + {{variable}} interpolation.

export type RandFn = () => number

const INNERMOST = /\{([^{}]*)\}/g

/** Resolve all `{a|b|c}` blocks (innermost-first, so nesting works). */
export function resolveSpintax(text: string, rand: RandFn = Math.random): string {
  let out = text
  let guard = 0
  while (INNERMOST.test(out) && guard < 50) {
    guard++
    INNERMOST.lastIndex = 0
    out = out.replace(INNERMOST, (_m, group: string) => {
      const opts = group.split('|')
      const pick = opts[Math.floor(rand() * opts.length)] ?? ''
      return pick
    })
  }
  return out
}

/** Replace `{{key}}` placeholders (case-insensitive, whitespace-tolerant). */
export function fillVariables(text: string, vars: Record<string, string>): string {
  let out = text
  for (const [key, value] of Object.entries(vars)) {
    out = out.replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'gi'), value)
  }
  return out
}

/** Full pipeline: variables first, then Spintax — one distinct message per call. */
export function renderTemplate(
  template: string,
  vars: Record<string, string>,
  rand: RandFn = Math.random,
): string {
  return resolveSpintax(fillVariables(template, vars), rand).replace(/[ \t]{2,}/g, ' ').trim()
}

/** Generate `n` distinct samples for the Preview button. */
export function sampleVariations(
  template: string,
  vars: Record<string, string>,
  n = 5,
): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  let guard = 0
  while (out.length < n && guard < n * 10) {
    guard++
    const s = renderTemplate(template, vars)
    if (!seen.has(s)) {
      seen.add(s)
      out.push(s)
    }
  }
  return out
}
