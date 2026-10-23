---
name: wassist
description: Plan and drive mass/bulk WhatsApp sends in WAssist (https://wa.ricehungcloud.win/) — build a recipient list from pasted text, write spintax templates that render uniquely per contact, queue a batch, and work the conveyor belt. Use when the user mentions WAssist, mass messaging, bulk WhatsApp sending, spintax, smart paste, the conveyor belt, or queueing messages to many contacts.
---

# WAssist — mass-send operator's guide

WAssist is a **personal** WhatsApp cockpit: local-first, one user, no server, no account,
no WhatsApp API. Hosted at <https://wa.ricehungcloud.win/> and also buildable as an Android
APK / installable PWA.

## The one rule that shapes everything

**WAssist never sends anything on its own.** It has no background sender and no accessibility
service. For every queued message it builds a `whatsapp://` deep link (or pins an Android intent
to WhatsApp vs. WhatsApp Business) and a **human taps LAUNCH**.

So "mass messaging" in WAssist means exactly this:

> Prepare a batch of ready-to-fire messages once. Then tap through them, one at a time.

Your job when this skill is active is to produce the **inputs** — the recipient list, the message
template, the topic, the pacing plan — and to tell the user precisely which buttons to press.
You cannot send for them. Never imply a message went out.

Bundle contents:

| File | Use it for |
| :--- | :--- |
| `references/paste-format.md` | Turning a messy list into text the Smart Paste parser accepts |
| `references/spintax.md` | Template syntax, variables, and the traps |
| `assets/template-pack.md` | Ready-to-paste message templates (EN + 廣東話) |
| `scripts/render.js` | Deterministic preview, variant counting, and linting of a template |

**No shell?** If this skill is running on a surface without a terminal (e.g. it was uploaded to a
chat product), `scripts/render.js` cannot be executed — do the checks by hand from
`references/spintax.md`: flag unknown `{{vars}}` (they get brace-stripped to the bare word),
count variants as the product of the independent option counts, report that number as an
estimate, and tell the user to confirm with `render.js` when they are at a terminal.

---

## Step 0 — One-time settings to check first

Settings (the ⚙️ in the header). Four of these decide whether a large batch behaves:

| Setting | Default | Why it matters at scale |
| :--- | :--- | :--- |
| **Stagger (min)** | `5` | The throughput dial. Slots land `stagger` minutes apart inside each day's window. |
| **Schedule** | Mon–Sun, `09:30 → 21:00` | One row per weekday: on/off, plus its own **from** and **to** time. A switched-off day gets no slots; a full window rolls into the next open day. |
| **Local prefix** | `852` | Bare **8-digit** numbers get this prepended. Other lengths pass through untouched. |
| **Send via** | `Ask` | Android only. Pin to WhatsApp or WhatsApp Business to skip the system chooser each time. |

The schedule row also reports the weekly **capacity** (`stagger` and the open windows, counted) and
offers **Re-pace the N queued messages** — after changing the stagger or a window, that re-lays
everything still pending into the new windows. Changing the schedule alone does *not* move items
already queued.

Also worth confirming: **Passive OS reminders** (on = every queued item gets a native alarm) and
**History retention** (default 30 days, prunes sent/skipped at launch).

---

## Step 1 — Get the recipients in

Two routes. Pick deliberately:

### Smart Paste 📋 — the bulk route
Send tab → **Smart Paste**. Paste raw text, and each line that contains a phone-like run of 8+
digits becomes a contact. This is the fastest path for a list of 20–500 people.

You get: a topic field, a template picker, a live 3-sample preview, then **Add N to queue** in one tap.
There is **no per-recipient tweak** here — everyone gets a fresh render of the same template.

Line shapes the parser accepts (full rules in `references/paste-format.md`):

```
Ken, 9123 4567, decision maker        → name=Ken        phone=85291234567  note=decision maker
Mary Wong 9355-1234 prefers text      → name=Mary Wong  phone=85293551234  note=prefers text
+852 6789 0001                        → name=<the number>                  (no name found)
```

### List straight from a spreadsheet (Excel → this agent → Smart Paste)
A common flow: the user pastes spreadsheet rows here, you normalize them, they paste your output
back into Smart Paste. Then emit **exactly one line per person**, `name, phone, note` — nothing
else, no header row, no markdown fences (fences and numbering are not stripped by the parser).
Before emitting, fix the spreadsheet damage: numbers rendered as scientific notation
(`9.12E+07`), leading zeros eaten, `+852`/spaces left in. Remember the prefix rule — exactly-8
digits get the configured prefix (default `852`), every other length must already be full
international, so verify each number's digit count before you send it down. A row of a note that
contains commas survives, but its fragments join with ` · `; drop notes you cannot place cleanly.

### Compose ✏️ — the hand-picked route
Send tab or People tab → **Compose**. Better for 1–20 people you want to eyeball.

- Type the message, search/filter recipients, tick them.
- **Tweak** on a selected recipient sets an override that is sent **verbatim** — it is *not*
  re-rendered through spintax. Use it for the one person who needs a different sentence.
- **Select all N shown** ticks the current filtered list — but the list is capped at **30 rows**,
  so a 200-person batch cannot be selected in one tap. Use tags or search to work in chunks, or
  use Smart Paste instead.
- `{{topic}}` is **always empty** in Compose (there is no topic field). Only Smart Paste sets it.

---

## Step 2 — Write the message

Templates live in the **Words** tab (or the Templates button on the Send tab). Two mechanisms
compose, in this order:

1. **Variables** `{{name}}` — substituted first, per contact.
2. **Spintax** `{a|b|c}` — then resolved, so each recipient gets a different wording.

| Variable | Resolves to |
| :--- | :--- |
| `{{name}}` | First word of the contact's name |
| `{{fullname}}` | The full stored name |
| `{{note}}` | The contact's micro-note (`''` if unset) |
| `{{topic}}` | The run's topic — **Smart Paste only** |
| `{{time}}` | The current clock time |

**Uniqueness is your anti-ban budget.** Roughly, distinct wordings ≈ the product of the option
counts: `{Hi|Hello|Hey} {{name}}, {quick one|just a nudge}` = 3 × 2 = **6** variants. Six variants
across 200 recipients means most people's message has an exact twin somewhere in the batch. Add
more slots, or more options per slot, until the estimate comfortably exceeds the recipient count.

The arithmetic flatters you, though — a template that looks like five slots is often only worth
tens of variants. Measure instead of counting on your fingers:

```bash
node scripts/render.js lint    --template tpl.txt
node scripts/render.js count   --template tpl.txt --draws 20000 --target 120
node scripts/render.js render  --template tpl.txt --vars '{"name":"Ken","topic":"Friday"}' --samples 5
node scripts/render.js batch   --template tpl.txt --contacts contacts.json --topic Friday
```

`count` samples the template empirically and prints a verdict (`pool ÷ batch`): under 1× expect
heavy duplication, 2× and up is acceptable, 3× is healthy. `batch` prints the exact text each
contact will receive — the closest thing to a dry run you get before queueing. **Always run `lint`
and `count` before recommending a template for a large run**, and read `references/spintax.md`
first: the variable-then-spintax ordering has a sharp edge where a contact's own note can be parsed
as spintax.

---

## Step 3 — Queue it

Smart Paste → **Add N to queue** (or Compose → **Queue for N**).

Queueing arms a passive OS alarm per item when reminders are on, and assigns each item a slot from
the weekly schedule:

```
for each open day, from max(window.from, now) to window.to, step staggerMinutes:
    skip minutes already booked by a queued item
until every person has a slot
```

So a batch fills today's window, then continues at the *next open day's* `from` — never past
midnight, never on a switched-off day, and never on a minute another queued item already holds.
Note that queueing **appends after what is already booked**, so a second batch lands behind the
first, possibly on a later day.

The Smart Paste and Compose sheets show a **Sending plan** box before you commit: one line per day
(`Today · 5 · 9:30 AM–9:50 AM`) and a fits / overflows verdict. Read it before adding a large batch —
it is the cheapest way to see whether 500 people will take one evening or three weeks.

Sends are handed to one app: on Android, `Send via` pins each launch to WhatsApp or WhatsApp
Business; `Ask` shows a picker when both are installed.

---

## Step 4 — Work the conveyor belt

Send tab → the belt shows **Next up (i/total)**, when it is due, the rendered text, and the contact's
note. If part of the plan falls on a later day, the belt says **· N later** under the due time.

| Button | Effect |
| :--- | :--- |
| **LAUNCH & SEND VIA WHATSAPP** | Opens WhatsApp with the text pre-filled → *the user still taps send inside WhatsApp.* Marks the item `sent`. |
| **↻ (re-roll)** | Draws a fresh spintax wording for this one person, before launching. |
| **Copy** | Clipboard, for when WhatsApp is unavailable. |
| **Snooze** | Moves this queued item to **2 days out / tomorrow** (or leaves it). It is the *same* item re-timed — nothing is duplicated and nothing is marked sent. |
| **Skip** | Marks `skipped`, cancels its alarm. |

After each launch a one-line bar under the belt offers **2 days / tomorrow / done / ✕**. It is
deliberately *not* modal: a 120-person run would otherwise become 120 dialogs. Choosing 2 days or
tomorrow re-queues the contact as a follow-up inside the next open sending window; ✕ or Done just
closes it.

**The belt is today-only.** Pending items on a later day are hidden from it and live under that
day's heading in the queue list. This is the single biggest operational trap on a large batch — see
below.

---

## Desktop and PWA notes

- **Installing the app as a desktop PWA (or running it in a browser tab) changes nothing about
  this skill.** The skill prepares inputs — recipient lines, templates, pacing — the human taps,
  and `scripts/render.js` runs in a terminal either way.
- **Storage is per browser.** The PWA window and the tab share that browser's IndexedDB; nothing
  syncs to another browser, another machine, or the phone. Settings → **Export/Import** moves the
  data deliberately.
- **Desktop hand-off keeps the belt alive** (builds from 2026-10-07 on): LAUNCH opens WhatsApp
  Web in its own window, the app window stays put, the item lands in history, and the follow-up
  prompt appears. On an older build the app window itself navigates to `api.whatsapp.com`, the
  item stays *pending* after the user returns, and the follow-up prompt never shows — if the user
  reports that, the fix is rebuilding/redeploying `dist/`, not a workflow change.
- **No Android alarm on desktop.** Passive reminders are a native-shell feature; on a PWA they
  degrade to browser notifications at best. The belt itself needs no alarms — it renders today's
  pending items whenever the app is open.

---

## The today-only belt, and how many you can actually push in a day

Only items whose slot falls on **today's local calendar date** appear on the belt. Slots are laid
inside each day's window at `staggerMinutes` apart; when a window fills, the batch continues on the
next open day. So a large batch is not broken — it is *scheduled across days*, and the queue list
under the belt groups every pending item under its calendar day with that day's time range.

Per-day capacity, with default windows (`09:30 → 21:00` = 690 minutes a day):

| Stagger | Slots per open day | Realistic batch |
| :--- | :--- | :--- |
| 1 min | ~691 | under ~680 |
| 2 min | ~346 | under ~340 |
| **5 min (default)** | **~139** | **under ~135** |
| 10 min | ~70 | under ~65 |

Multiply by the number of open days (7 by default → ~973 a week at 5 min) to get the weekly figure;
the Settings row prints it for you.

Practical consequences for any batch over one day's capacity:

- The **Sending plan** box in Smart Paste / Compose shows exactly which days the batch lands on and
  whether it fits. Check it before adding.
- To force more into one day, lower **Stagger**, widen that day's **to** time, or switch off the
  days you do not want sends on at all.
- If today's window is already past, today yields nothing and the batch starts on the next open day
  — the plan box will say so.
- Changing the schedule does **not** move items already queued. Press **Re-pace the N queued
  messages** in Settings (or re-time a single row in the queue list) to lay them out again.
- A queued item whose slot slipped more than an hour into the past while the app was closed is
  pulled forward to "now" on next launch, so the belt never stalls.
- One OS alarm per item: a very large batch arms a very large number of alarms. If reminders
  misbehave at scale, turning **Passive OS reminders** off is the clean fallback — the belt itself
  needs no alarms.

---

## Pacing, and staying inside the app's intent

WAssist is built for **people who already know you**: pinned chats, micro-notes, per-contact
history, follow-ups. The manual tap per message, the spintax randomness, and the stagger interval
are not nuisances to route around — they are the design.

- Message people who expect to hear from you. WAssist has no consent, unsubscribe, or opt-out
  mechanism, and nothing here should be used to build one for cold outreach.
- Keep the stagger at or above 1 min and spread a big list over more than one session.
- Never work around the manual tap. There is no auto-blast switch, and adding one would put the
  user's number at risk of a WhatsApp ban.
- Vary wording within a batch (spintax), and don't re-send an identical template to the same
  person on consecutive days.

If the user asks for a true bulk-blast tool, say plainly that WAssist isn't it and that the
WhatsApp Business API is the sanctioned route for that.

---

## Worked example — 120 people, warm re-engagement

1. **Settings** → Stagger `2` min (≈346 slots in a 09:30–21:00 day, so 120 lands in one day), the
   weekly schedule left at its default windows (or weekend switched off if this is a work contact
   list), Local prefix `852`, Passive reminders on.
2. **Recipients** → prepare the list in the Smart Paste line format, one person per line.
3. **Template** (Words tab) — build it for uniqueness. One `{ | }` slot per sentence, three options
   each:
   ```
   {Hi|Hey|Hello} {{name}}, {long time no chat|it's been a while|hope you're keeping well}! {I was just thinking about|I remembered|something reminded me of} {{topic}} and {wanted to reach out|figured I'd say hi|thought I'd drop you a line}. {{note}} {Hope you're doing well|How have you been|Would love to catch up}?
   ```
4. **Verify** → save it to a file and run:
   ```bash
   node scripts/render.js lint  --template tpl.txt
   node scripts/render.js count --template tpl.txt --draws 20000 --target 120
   ```
   That template measures **243 distinct** wordings → `pool ÷ batch = 2.02×` → *acceptable*.
   A three-slot version of the same sentence set (the one in `assets/template-pack.md`) only
   reaches **48** → `0.40×` → *too few*. Expect to widen the template once or twice here; the
   honest answer is that 120 people need a busy template.
5. **Preview** → `batch` with a 3-person `contacts.json` to read the real output.
6. **Queue** → Smart Paste, topic `the HK trip`, pick the template, confirm the preview, **Add 120
   to queue**.
7. **Send** → work the belt; use **↻** whenever a wording looks off, **Skip** for anyone who
   shouldn't get it, **Snooze** to push a queued message to tomorrow or two days out, and the bar
   under the belt to schedule a follow-up after a send.
8. **Track** → History tab: sent / skipped / all filters, today vs. all-time stats, and a
   one-tap reply per row.

## Scope guard

WAssist is a personal messaging cockpit. It is deliberately **not** a todo app, a CRM, or a
campaign manager — no tasks, goals, streaks, or calendars. If a request drifts that way, flag it
rather than building it.
