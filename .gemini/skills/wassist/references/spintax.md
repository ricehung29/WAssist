# Spintax and variables — syntax, ordering, and traps

## Pipeline order (this is the sharp edge)

`renderTemplate(template, vars)` does:

```
1. fillVariables   — substitute every {{key}}
2. resolveSpintax  — then resolve every {a|b|c}
3. collapse runs of 2+ spaces/tabs, then trim
```

**Variables are substituted BEFORE spintax is resolved.** That means any text arriving *through* a
variable — `{{name}}`, `{{note}}`, `{{topic}}` — is then **parsed as spintax**.

A contact whose note reads:

```
prefers {email|WhatsApp}
```

…will have `{email|WhatsApp}` collapsed into one of the two words in the message. Usually
harmless. Sometimes not:

```
note: "call after 6pm {she's on shift}"    →  "call after 6pm"  (the brace group is consumed)
note: "budget is {2|3}k"                   →  "budget is 2k" or "budget is 3k"
```

If a note or a name may contain braces, **don't put the raw variable in the message**, or edit the
note to remove the braces. `scripts/render.js lint` flags brace groups that come from your
template body, and `batch` shows the post-substitution output so you can spot it.

## Variables

| Placeholder | Value | Notes |
| :--- | :--- | :--- |
| `{{name}}` | `fullname.split(' ')[0]` | Word boundary is a **space**. `陳大文` → `陳大文`; `Mary Wong` → `Mary` |
| `{{fullname}}` | the contact's stored name | |
| `{{note}}` | the contact's micro-note | `''` when unset — leaves a gap; see below |
| `{{topic}}` | the run's topic | **Smart Paste only.** Empty in Compose, in the clipboard banner, and in follow-ups |
| `{{time}}` | `toLocaleTimeString([], {hour:'numeric', minute:'2-digit'})` | resolved **at queue time**, then frozen into the item |

Matching is **case-insensitive and whitespace-tolerant**: `{{ NAME }}`, `{{Name}}`, `{{name}}` all work.

### The `{{note}}` gap

`{{note}}` becomes an empty string for anyone without a note. The final `[ \t]{2,} → ' '` collapse
cleans up *spaces*, but not the punctuation around an empty slot:

```
"…wanted to reach out. {{note}} Hope you're well?"   →  "…wanted to reach out.  Hope you're well?"  ✔ (collapses)
"…I heard {{note}}, so I thought of you."            →  "…I heard , so I thought of you."          ✘ (dangling comma)
```

Keep `{{note}}` in a position where an empty value still reads cleanly, or set notes for everyone
in the batch.

### Unknown variables get eaten by the spintax pass

`{{phone}}` is not a variable, so `fillVariables` leaves it alone — **but the spintax pass then
runs anyway**. Its innermost-first matcher sees `{{phone}}` as a nested block, resolves the inner
`{phone}` as a single-option group, strips those braces, then strips the outer pair:

```
{{phone}}   →   {phone}   →   phone
```

So a typo like `{{nmae}}` ships the bare word `nmae` in your message — no braces, no warning from
the app. Anything you intended as a literal brace group is destroyed the same way. Only these five
resolve properly: `{{name}}` `{{fullname}}` `{{note}}` `{{topic}}` `{{time}}`.
`scripts/render.js lint` errors on any other name so this never reaches a batch.

## Spintax

```
{option A|option B|option C}
```

- Nested blocks are supported and resolved **innermost-first**:
  `{Hi|{Hello|Hey} there}` → `Hi` or `Hello there` or `Hey there`.
- Choice is uniform over the top-level `|` splits at each level.
- **A single-option block `{only}` resolves to `only`** — braces stripped.
- **You cannot escape a literal `|` or a literal brace.** There is no `\|`, no `{`. Avoid them.
- Resolution loops until no innermost block remains, capped at **50 passes**. Absurdly deep nesting
  stops there rather than hanging.

### Counting distinct variants

For independent blocks, distinct outcomes ≈ the product of the option counts:

```
{Hi|Hello|Hey} {{name}}, {quick one|just a nudge} about {{topic}}
                            3        ×        2                    = 6 distinct (for one contact)
```

Nesting changes this: `{a|{b|c}}` has 3 outcomes, not 2. `scripts/render.js count` samples the
template empirically instead of trusting arithmetic — use it.

### Coverage rule of thumb

Random draws land on a limited number of distinct strings. To give every recipient a wording that
likely differs from everyone else's, aim for a distinct-variant count of **at least 2–3× the
recipient count**. Wanting a true "no two identical" guarantee needs a variant count many times the
batch size; in practice, a healthy margin plus a varied body is what keeps a batch looking human.

## Compose previews re-roll, previews are not promises

Every call to `renderTemplate` draws fresh. So:

- The **Preview** in Templates shows three *samples*, not the text any specific person gets.
- The belt's **↻** button re-rolls the wording for the current item, replacing `finalRenderedText`
  before launch. Use it whenever a draw reads badly.
- The per-recipient **Tweak** box in Compose is an **override sent verbatim** — it bypasses spintax
  and variables entirely. It's the escape hatch for the one recipient who needs different words.
- Once queued, an item's text is **frozen**. Follow-up items created by Snooze get a **fresh render
  of the same `rawTemplate`**, so the follow-up reads differently from the original — usually good,
  occasionally worth re-rolling.

## Worked template

```
{Hi|Hey|Hello} {{name}}, {long time no chat|it's been a while}! {I was just thinking about|I remembered} {{topic}} and {wanted to reach out|figured I'd say hi}. {{note}} {Hope you're doing well|How have you been}?
```

- Core: 3 × 2 × 2 × 2 = 24, × 2 closer = **48 variants** for one contact.
- `{{topic}}` requires Smart Paste (it's empty in Compose).
- `{{note}}` sits after a full stop and before a full-sentence closer, so an empty note collapses
  to a clean double space → single space.

Verify with:

```bash
node scripts/render.js count  --template tpl.txt --draws 5000
node scripts/render.js render --template tpl.txt --vars '{"name":"Ken","topic":"the HK trip","note":"decision maker"}' --samples 5
```
