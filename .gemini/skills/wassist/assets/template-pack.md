# Template pack — ready to paste into Words → Manage templates

Replace the parts in `{{ }}` and `{ | }` to fit the run. Every one of these is written so that an
empty `{{note}}` still reads cleanly, and so the spintax actually multiplies.

Before queueing a large batch, copy the template to a file and:

```bash
node scripts/render.js lint  --template tpl.txt
node scripts/render.js count --template tpl.txt --draws 5000 --target <recipients>
```

---

## 1. Warm re-engagement — 48 variants

Use with **Smart Paste** so `{{topic}}` and `{{note}}` fill in.

```
{Hi|Hey|Hello} {{name}}, {long time no chat|it's been a while}! {I was just thinking about|I remembered} {{topic}} and {wanted to reach out|figured I'd say hi}. {{note}} {Hope you're doing well|How have you been}?
```

- Topic field: what you're reconnecting about, e.g. `the HK trip`
- Best for: people you've met but haven't spoken to in a while.

## 2. Follow-up after a meeting — 32 variants

```
{Hi|Hey} {{name}}, {good to see you|great catching up} the other day! {Just following up on|Circling back on} {{topic}} — {no rush at all|whenever you get a moment}. {{note}} {Talk soon|Speak soon}!
```

- 2 × 2 × 2 × 2 × 2 = **32**
- Best for: post-meeting, post-call. Low pressure.

## 3. Event / gathering invite — 48 variants

```
{Hey|Hi} {{name}}! {We're putting together|I'm organising} {a small dinner|a get-together|drinks} and {you came to mind|I'd love for you to come}. {{note}} {Free that week?|Does that work for you}?
```

- 2 × 2 × 3 × 2 × 2 = **48**
- Keep it personal: this reads as a mass invite if the topic is vague.

## 4. Service / business notice — 16 variants

For a business account, sent via WhatsApp Business. Keep it factual — no marketing hype.

```
{Hi|Hello} {{name}}, {a quick note from us|quick update}: {{topic}}. {Nothing you need to do|No action needed on your side}. {{note}} {Any questions, just reply here|Reply here if anything's unclear}.
```

- 2 × 2 × 2 × 2 = **16** — thin. Keep this under ~20 recipients, or add two more slots first.
- Because this is a notice, `{{topic}}` must be filled by Smart Paste — never leave it blank.

## 5. Appointment reminder — 16 variants

```
{Hi|Hello} {{name}}, {just a reminder|gentle reminder} about {{topic}}. {See you then|Looking forward to it}! {{note}} {Let me know if you need to move it|Shout if the timing doesn't work}.
```

- 2 × 2 × 2 × 2 = **16** — thin; keep it under ~20 people or widen it first.
- Keep the stagger tight (1–2 min) if these are time-sensitive.

## 6. 廣東話 — 私人問候 — 48 variants

```
{Hi|Hello|喂} {{name}}，{好耐冇見|好久不見}！{最近點呀|近排點呀}？{{note}} {得閒傾兩句|有空聊兩句} — 講開 {{topic}}，{想搵你傾下|想同你講聲}。
```

- 3 × 2 × 2 × 2 × 2 = **48**
- `{{name}}` 只取第一個空格前的字，中文名會整個保留。
- ⚠️ `{{topic}}` 只喺 Smart Paste 填到；喺 Compose 會變空白，句子會唔通順。

## 7. 廣東話 — 商戶通知 — 16 variants

```
{Hi|Hello} {{name}}，{呢度係|我哋係} {{topic}}。{唔使做任何嘢|冇需要回覆}，{{note}} {有問題直接喺度覆我哋就得|有事可以喺呢度搵我哋}。
```

- 2 × 2 × 2 × 2 = **16**。名單過 20 人就要再加幾個位。

---

## Variant counts, as measured

These are the distinct strings each template produced over 20,000 draws, run through
`scripts/render.js count`. Trust the measurement over the arithmetic:

| # | Template | Distinct |
| :-- | :--- | ---: |
| 1 | Warm re-engagement | 48 |
| 2 | Follow-up after a meeting | 32 |
| 3 | Event / gathering invite | 48 |
| 4 | Service / business notice | 16 |
| 5 | Appointment reminder | 16 |
| 6 | 廣東話 私人問候 | 48 |
| 7 | 廣東話 商戶通知 | 16 |

At the 2× rule of thumb (pool ≥ 2 × recipients), template 1 covers ~24 people, template 3 ~24,
and the 16-variant ones cover about 8 each. **All seven are thin for a 120-person run** — widen
them, or accept that duplicates will appear in the batch.

---

## Reusing these

The fastest way to widen any of them is to add one more `{ | }` slot in the **middle** of a
sentence, not at the start. Greeting-only variation is the weakest kind — a reader who gets two
messages with the same body but a different "Hi/Hey" still sees the same message.

```bash
# how many distinct wordings does this actually produce?
node scripts/render.js count --template tpl.txt --draws 5000 --target 200
```

If `pool ÷ batch` comes back under 2×, add a slot before queueing.

## Anti-patterns

| Don't | Why |
| :--- | :--- |
| `{Hi|Hi|Hi}` | Repeats weight the same word. Lint warns. |
| `{Hi|}` | The empty option renders nothing — half your messages lose their greeting. |
| `{{phone}}`, `{{nmae}}` | Brace-stripped into the bare word `phone` / `nmae` in the message. |
| `…heard {{note}}, so…` | A contact with no note gets a dangling comma. |
| A single long paragraph, no spintax | Every recipient receives an identical string. |
| `{a|{b|c}}` when you meant `{a|b|c}` | Nesting is real — the count is 3, but it reads oddly. |
