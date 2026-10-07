# Smart Paste — accepted input shapes

Smart Paste reads **one contact per line** and keeps only lines that contain a phone-like match.

## The phone matcher, exactly

A candidate is a run matching `\+?\d[\d\s\-().]{6,}\d` — an optional `+`, then a digit, then six or
more of `digit / space / dash / dot / paren`, ending in a digit. So:

- Needs **at least 8 digits** all told.
- Spaces, dashes, dots, and brackets inside are fine and get stripped.
- A leading `+` or `00` is stripped.
- After cleaning, the number must be **8–15 digits** or the line is dropped.

## The local-prefix rule

`sanitizePhone` prepends the configured **Local prefix** (default `852`) to a number that is
**exactly 8 digits** after cleaning. Any other length passes through unchanged.

| Input | Cleaned | Stored (prefix `852`) |
| :--- | :--- | :--- |
| `9123 4567` | `91234567` (8) | `85291234567` |
| `9355-1234` | `93551234` (8) | `85293551234` |
| `+852 6789 0001` | `85267890001` (11) | `85267890001` |
| `00852 6789 0001` | `85267890001` | `85267890001` |
| `+1 415 555 0134` | `14155550134` (11) | `14155550134` |

⚠️ If the list is **not** Hong Kong, change **Local prefix** (or write every number in full
international form) *before* pasting. A Chinese mainland 11-digit mobile, for instance, is not
8 digits so it survives untouched — but an 8-digit landline from another country would be
silently given a `852`.

## Name and note extraction

The parser splits the line **around the phone match**, not on separators:

- **Before** the number → split on `,` `;` `|` → cleaned fragments.
  - The **first fragment is the name**.
  - Remaining fragments become part of the **note**.
- **After** the number → cleaned, appended to the note.
- If no name survives, **the phone number becomes the name**.

Note fragments are joined with ` · `.

## Accepted line shapes

```
Ken, 9123 4567, decision maker
    name=Ken   phone=85291234567   note=decision maker

Mary Wong 9355-1234 prefers text
    name=Mary Wong   phone=85293551234   note=prefers text

+852 6789 0001
    name=85267890001   phone=85267890001   note=(empty)

陳大文, 9123 4567, 決策人
    name=陳大文   phone=85291234567   note=決策人

Acme Ltd; 9876 5432; ask for Sarah; accounts dept
    name=Acme Ltd   phone=85298765432   note=ask for Sarah · accounts dept
```

`cleanFragment` trims leading/trailing `, ; | : — – -` and whitespace, so `"Ken, "` → `Ken`.

## What it will NOT do

- **No multiple contacts per line.** Two numbers on one line = one contact; the first match wins
  and the second becomes *note text*.
- **No header detection.** `Name, Phone, Note` as a literal header line is dropped only because it
  holds no phone-like digits — but if your header contains a number it becomes a contact.
- **No country inference.** See the prefix warning above.
- **No column mapping.** If you have a CSV with `email` and `phone` columns, reduce it to one line
  per person in the shapes above first.

## Duplicates

A pasted phone that already exists as a contact is **merged, not duplicated**: the existing contact
keeps its note unless it had none, and its name is filled in only if it was still just the number.
Smart Paste shows a count of these merges before you commit.

## Quick preparation recipe

Given a mess, produce:

```
<name>, <full international or local 8-digit number>, <optional note>
```

one per line, then paste the whole block into Smart Paste. If a name contains a comma, expect it to
be split — rename to remove the comma, or accept the fragment in the note.
