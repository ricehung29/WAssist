#!/usr/bin/env node
// WAssist template toolbox — an offline mirror of src/utils/spintax.ts.
//
//   node render.js lint   --template tpl.txt
//   node render.js count  --template tpl.txt --draws 5000
//   node render.js render --template tpl.txt --vars '{"name":"Ken","topic":"Friday"}' --samples 5
//   node render.js batch  --template tpl.txt --contacts contacts.json --topic Friday
//
// The rendering pipeline here matches the app exactly:
//   fillVariables -> resolveSpintax -> collapse runs of 2+ spaces/tabs -> trim
// so a `batch` listing is what the app will queue (modulo the app's own random draw).

// The fs module is loaded with a dynamic import at startup, because this file
// has to run under two module systems: inside the WAssist repo package.json
// says "type": "module" (ESM), while a copy extracted elsewhere (or loaded
// through the ~/.gemini/skills symlink on Node that resolves differently) is
// parsed as CommonJS. `require` breaks the first, a static `import` breaks the
// second — `await import()` is legal in both, so nothing else module-system
// specific is allowed in this file (no `import.meta`, no `__dirname`).
let readFileSync
let args
let cmd
let rand = Math.random

// ---------- args ----------

function parseArgs(argv) {
  const out = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const key = a.slice(2)
      const next = argv[i + 1]
      if (next === undefined || next.startsWith('--')) out[key] = true
      else {
        out[key] = next
        i++
      }
    } else out._.push(a)
  }
  return out
}

function readTemplate() {
  const src = args.template
  if (!src) fail('--template <file> is required (use - for stdin)')
  if (src === '-') return readFileSync(0, 'utf8')
  try {
    return readFileSync(src, 'utf8')
  } catch {
    return fail(`cannot read template file: ${src}`)
  }
}

function fail(msg) {
  console.error(`error: ${msg}`)
  process.exit(1)
}

// ---------- renderer (mirrors src/utils/spintax.ts) ----------

const KNOWN_VARS = ['name', 'fullname', 'note', 'topic', 'time']
const INNERMOST = /\{([^{}]*)\}/g

/** Seeded PRNG so a dry run can be repeated. */
function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Set from --seed in main(), once args exist.

function resolveSpintax(text) {
  let out = text
  let guard = 0
  while (INNERMOST.test(out) && guard < 50) {
    guard++
    INNERMOST.lastIndex = 0
    out = out.replace(INNERMOST, (_m, group) => {
      const opts = group.split('|')
      return opts[Math.floor(rand() * opts.length)] ?? ''
    })
  }
  return out
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function fillVariables(text, vars) {
  let out = text
  for (const [key, value] of Object.entries(vars)) {
    out = out.replace(new RegExp(`\\{\\{\\s*${escapeRe(key)}\\s*\\}\\}`, 'gi'), value)
  }
  return out
}

function renderTemplate(template, vars) {
  return resolveSpintax(fillVariables(template, vars)).replace(/[ \t]{2,}/g, ' ').trim()
}

/** Distinct samples — same guard as sampleVariations() in the app. */
function sampleVariations(template, vars, n) {
  const seen = new Set()
  const out = []
  let guard = 0
  while (out.length < n && guard < n * 10 + 50) {
    guard++
    const s = renderTemplate(template, vars)
    if (!seen.has(s)) {
      seen.add(s)
      out.push(s)
    }
  }
  return out
}

// Same defaults resolveTarget/varsFor produce for a placeholder contact.
function sampleVars(extra = {}) {
  return {
    name: 'Ken',
    fullname: 'Ken Lau',
    note: 'decision maker',
    topic: 'our project',
    time: '9:30 AM',
    ...extra,
  }
}

// ---------- lint ----------

function findBlocks(text) {
  // Every brace group, innermost-first, with its depth for reporting.
  const blocks = []
  const re = /\{([^{}]*)\}/g
  let m
  let depth = 0
  const probe = text
  while ((m = re.exec(probe))) {
    // Depth = nesting level at the block's opening brace.
    let d = 0
    for (let i = 0; i < m.index; i++) {
      if (probe[i] === '{') d++
      else if (probe[i] === '}') d--
    }
    depth = Math.max(depth, d)
    blocks.push({ raw: m[0], group: m[1], index: m.index })
  }
  return { blocks, depth }
}

function lint(template) {
  const errors = []
  const warnings = []

  // 1. Unbalanced braces.
  let open = 0
  for (const ch of template) {
    if (ch === '{') open++
    else if (ch === '}') open--
    if (open < 0) break
  }
  if (open !== 0) errors.push(`unbalanced braces (${open > 0 ? `${open} unclosed` : 'stray }'})`)

  // 2. Variable names.
  const varRe = /\{\{\s*([^{}]*?)\s*\}\}/g
  const foundVars = new Set()
  let vm
  while ((vm = varRe.exec(template))) {
    const key = vm[1].trim()
    foundVars.add(key.toLowerCase())
    if (!KNOWN_VARS.includes(key.toLowerCase())) {
      errors.push(
        `unknown variable {{${key}}} — the spintax pass will strip its braces and ship the bare word "${key}". Known: ${KNOWN_VARS.map((v) => `{{${v}}}`).join(', ')}`,
      )
    }
  }

  // 3. Spintax blocks.
  const { blocks, depth } = findBlocks(template)
  const spintaxBlocks = blocks.filter((b) => !b.group.includes('{{'))
  for (const b of spintaxBlocks) {
    const opts = b.group.split('|')
    if (opts.some((o) => o.trim() === '')) {
      warnings.push(`"${b.raw}" has an empty option — some draws will render nothing there`)
    }
    const trimmed = opts.map((o) => o.trim()).filter(Boolean)
    if (new Set(trimmed).size !== trimmed.length) {
      warnings.push(`"${b.raw}" repeats an option — that variant is over-weighted`)
    }
  }
  if (depth > 3) warnings.push(`spintax nests ${depth} levels deep — hard to reason about`)

  // 4. Empty {{note}} leaving dangling punctuation.
  if (/[,;:]\s*\{\{\s*note\s*\}\}|\{\{\s*note\s*\}\}\s*[,;:]/.test(template)) {
    warnings.push(
      '{{note}} sits directly against , ; or : — contacts without a note will render a dangling separator',
    )
  }

  // 5. Unresolved placeholders left by an unbalanced {{ }}.
  const stray = template.match(/\{[^{}]*\{\{|\}\}[^{}]*\}/)
  if (stray) warnings.push(`suspicious brace placement near "${stray[0]}"`)

  // 6. Length sanity.
  const plain = renderTemplate(template, sampleVars())
  if (plain.length > 400) warnings.push(`rendered sample is ${plain.length} chars — long for a chat message`)

  return { errors, warnings, vars: [...foundVars], blocks: spintaxBlocks, depth }
}

// ---------- commands ----------

function cmdLint() {
  const template = readTemplate()
  const { errors, warnings, vars, blocks, depth } = lint(template)

  console.log(`variables used : ${vars.length ? vars.map((v) => `{{${v}}}`).join(', ') : '(none)'}`)
  console.log(`spintax blocks : ${blocks.length}${blocks.length ? ` (nesting depth ${depth})` : ''}`)
  console.log('')
  for (const w of warnings) console.log(`  warning  ${w}`)
  for (const e of errors) console.log(`  ERROR    ${e}`)
  if (!errors.length && !warnings.length) console.log('  clean — no issues found')

  process.exit(errors.length ? 1 : 0)
}

function cmdCount() {
  const template = readTemplate()
  const draws = Number(args.draws) || 2000
  const seen = new Set()
  for (let i = 0; i < draws; i++) seen.add(renderTemplate(template, sampleVars()))

  const distinct = seen.size
  const target = Number(args.target) || 0
  console.log(`draws          : ${draws}`)
  console.log(`distinct       : ${distinct}`)
  console.log(`coverage       : ${((distinct / draws) * 100).toFixed(1)}% of ${draws} draws hit a wording already seen`)

  if (target > 0) {
    // Coupon-collector-ish rule of thumb: want the distinct pool well above the batch size.
    const ratio = distinct / target
    console.log(`batch size     : ${target}`)
    console.log(`pool ÷ batch   : ${ratio.toFixed(2)}×`)
    if (ratio < 1) console.log('  VERDICT: too few wordings — expect many exact duplicates. Add slots/options.')
    else if (ratio < 2) console.log('  VERDICT: thin. Add another spintax slot before a run this size.')
    else if (ratio < 3) console.log('  VERDICT: acceptable.')
    else console.log('  VERDICT: healthy.')
  } else {
    console.log('(pass --target <recipients> for a verdict)')
  }
}

function cmdRender() {
  const template = readTemplate()
  let vars = {}
  if (args.vars) {
    try {
      vars = JSON.parse(args.vars)
    } catch {
      fail('--vars must be a JSON object, e.g. --vars \'{"name":"Ken"}\'')
    }
  }
  const n = Number(args.samples) || 5
  for (const s of sampleVariations(template, sampleVars(vars), n)) console.log(`“${s}”`)
}

function cmdBatch() {
  const template = readTemplate()
  if (!args.contacts) fail('--contacts <file.json> is required')
  let contacts
  try {
    contacts = JSON.parse(readFileSync(args.contacts, 'utf8'))
  } catch (e) {
    return fail(`cannot parse contacts file: ${e.message}`)
  }
  if (!Array.isArray(contacts)) fail('contacts file must be a JSON array')

  const topic = typeof args.topic === 'string' ? args.topic : ''
  const now = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

  contacts.forEach((c, i) => {
    const fullname = c.name ?? c.phone ?? `Contact ${i + 1}`
    const vars = {
      name: String(fullname).split(' ')[0] ?? fullname,
      fullname: String(fullname),
      note: c.note ?? '',
      topic: c.topic ?? topic,
      time: now,
    }
    const text = c.override ? String(c.override) : renderTemplate(template, vars)
    console.log(`── ${i + 1}. ${fullname}${c.phone ? `  ${c.phone}` : ''}`)
    console.log(`   ${text}`)
    console.log('')
  })

  console.log(`${contacts.length} contact(s). Queued text is frozen at queue time;`)
  console.log('the app draws its own randomness, so wording may differ from this listing.')
}

// ---------- dispatch ----------

async function main() {
  ;({ readFileSync } = await import('node:fs'))
  args = parseArgs(process.argv.slice(2))
  cmd = args._[0]

  if (!cmd || args.help) {
    // argv[1] is this script's own path — works under both module systems
    // (unlike import.meta.url / __filename, each of which is valid in only one).
    console.log(readFileSync(process.argv[1], 'utf8').split('\n').slice(1, 12).join('\n'))
    process.exit(cmd ? 0 : 1)
  }

  if (args.seed !== undefined && args.seed !== true) rand = mulberry32(Number(args.seed))

  switch (cmd) {
    case 'lint':
      cmdLint()
      break
    case 'count':
      cmdCount()
      break
    case 'render':
      cmdRender()
      break
    case 'batch':
      cmdBatch()
      break
    default:
      fail(`unknown command "${cmd}" — expected lint | count | render | batch`)
  }
}

main().catch((e) => {
  console.error(`error: ${e && e.message ? e.message : e}`)
  process.exit(1)
})
