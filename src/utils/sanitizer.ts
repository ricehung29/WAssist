// Feature 4 — Phone sanitizer + Smart Paste parser.

// A run of 8+ digits that may carry spaces/dashes/brackets, e.g. "9123 4567".
const PHONE_CANDIDATE = /\+?\d[\d\s\-().]{6,}\d/
const PHONE_CANDIDATE_GLOBAL = new RegExp(PHONE_CANDIDATE.source, 'g')

/**
 * Clean a raw phone string to digits-only international format.
 * - Strips spaces, dashes, brackets.
 * - Strips leading `+` / `00` international prefixes.
 * - Auto-prepends `defaultPrefix` (HK `852`) for bare 8-digit local numbers.
 */
export function sanitizePhone(raw: string, defaultPrefix = '852'): string {
  let digits = raw.replace(/\D/g, '')
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (digits.length === 8) return defaultPrefix + digits
  return digits
}

export function isValidPhone(sanitized: string): boolean {
  return /^\d{8,15}$/.test(sanitized)
}

/** First plausible phone number in the text, already sanitized. */
export function findPhone(
  text: string,
  defaultPrefix = '852',
): { raw: string; phone: string; index: number } | null {
  const match = PHONE_CANDIDATE.exec(text)
  if (!match || match.index === undefined) return null
  const phone = sanitizePhone(match[0], defaultPrefix)
  if (!isValidPhone(phone)) return null
  return { raw: match[0], phone, index: match.index }
}

/** True if the text contains anything that looks like a phone number. */
export function hasContactPattern(text: string, defaultPrefix = '852'): boolean {
  for (const match of text.matchAll(PHONE_CANDIDATE_GLOBAL)) {
    if (isValidPhone(sanitizePhone(match[0], defaultPrefix))) return true
  }
  return false
}

export interface ParsedContact {
  name: string
  phone: string
  note: string
}

/**
 * Parse unstructured pasted text (email / WhatsApp group copy-paste) into contacts.
 * Handles lines like:
 *   "Ken, 9123 4567, decision maker"       → name / phone / note
 *   "Mary Wong 9355-1234 prefers text"     → name / phone / note
 *   "+852 6789 0001"                       → name falls back to the number
 */
export function parseSmartPaste(text: string, defaultPrefix = '852'): ParsedContact[] {
  const out: ParsedContact[] = []
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line) continue

    const match = line.match(PHONE_CANDIDATE)
    if (!match || match.index === undefined) continue
    const phone = sanitizePhone(match[0], defaultPrefix)
    if (!isValidPhone(phone)) continue

    const before = line.slice(0, match.index)
    const after = line.slice(match.index + match[0].length)

    const parts = before
      .split(/[,;|]/)
      .map(cleanFragment)
      .filter(Boolean)

    // Comma-separated rows put the name first; anything after the number is a note.
    const name = parts[0] || cleanFragment(after) || phone
    const noteParts = [...parts.slice(1), cleanFragment(after)].filter(Boolean)

    out.push({ name, phone, note: noteParts.join(' · ') })
  }
  return out
}

/** Trim separators and edge punctuation left behind by the phone extraction. */
function cleanFragment(s: string): string {
  return s
    .replace(/^[\s,;|:—–-]+/, '')
    .replace(/[\s,;|:—–-]+$/, '')
    .trim()
}
