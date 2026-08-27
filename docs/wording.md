# Wording

Adapted from the conventions in the CanWas repo: `CONTEXT.md` for register and
`docs/ui-guidelines.md` §Internationalization for mechanics.

## Register

State facts plainly. The interface describes what a control does and what will
happen; it does not comment on it.

- No chatty asides or colloquialisms. "The stroke was discarded", not "that
  stroke was thrown away". "Appears", not "pops up".
- No filler. Cut "actually", "just", "simply", "really".
- No subjective or opinionated asides — never tell the reader that something is
  a good idea, a limitation, or "not a feature".
- No exclamation marks. No emoji in message text.
- Explain a constraint only where acting on it requires knowing it, and in one
  sentence. Rationale belongs in `docs/`, not on screen.

## English

- Sentence case everywhere: labels, buttons, headings, options.
- "You" is acceptable but rarely needed; prefer describing the object. "Held
  together with the button", not "you hold it with the button".
- Terminology is fixed. One concept, one word:

  | Concept                              | Word         |
  | ------------------------------------ | ------------ |
  | The drawn path                       | stroke       |
  | Stroke plus its command              | gesture      |
  | What is held while drawing           | trigger      |
  | Alt / Shift / Control / Meta         | modifier     |
  | The panel of tabs                    | tab grid     |
  | The label naming the matched command | readout      |
  | The gesture list under the grid      | cheatsheet   |
  | A command with no stroke             | unassigned   |
  | A chorded pair of mouse buttons      | rocker       |
  | The mouse wheel, as a gesture        | wheel        |
  | Everything drawn above the page      | overlay      |
  | How large the overlay is drawn       | overlay size |
  | The browser's own per-site zoom      | page zoom    |

- Never "unbound" in one place and "unassigned" in another.

## Traditional Chinese (zh-Hant)

- Third-person and objective. Avoid 你/妳; describe the control, not the reader.
- No colloquial word choices: 無法 not 拿不到, 出現 not 跑出來, 捨棄 not 丟掉.
- Full-width punctuation (，。：；), and no em dash used as a conversational
  aside. Break the sentence or use a colon instead.
- Fixed terminology:

  | English    | zh-Hant  |
  | ---------- | -------- |
  | stroke     | 筆畫     |
  | gesture    | 手勢     |
  | trigger    | 觸發鍵   |
  | modifier   | 輔助鍵   |
  | tab        | 分頁     |
  | tab grid   | 分頁格線 |
  | readout    | 指令提示 |
  | cheatsheet | 手勢清單 |
  | rocker     | 搖桿     |
  | wheel      | 滾輪     |
  | unassigned | 未指派   |
  | window     | 視窗     |
  | pinned     | 釘選     |
  | overlay    | 畫面     |
  | page zoom  | 頁面縮放 |

## Store listing and listing images

The register above covers everything a reader sees, including copy that ships as
a picture: `docs/store-listing.md` and the headlines in `shots/slides/copy.json`.

- A listing headline may be written to persuade. It may not be written to
  overstate: every claim on a slide has to be true of the capture beside it.
- The bans hold. No exclamation marks, no rhetorical questions standing in for a
  fact, no 你 in the Chinese, and the terminology tables are not relaxed because
  the words are on a slide instead of in a card.
- **The Chinese is written, not translated.** Copy that reads as an English
  sentence with Chinese words in it — stacked 的, 將 and 即 where a verb would
  do, clause order borrowed from the English — fails this even when every term
  in it is correct. Write the Chinese line for a Chinese reader and let it
  diverge from the English one.

## Mechanics

- Every user-visible string goes through `t()`. No exceptions: placeholders,
  `aria-label`, `title`, empty states.
- `t()` returns `Localized`, a branded string, and the UI helpers in `src/ui.ts`
  accept nothing else. A hard-coded literal in a label is therefore a type
  error, not a string that survives until someone switches language and finds
  half a page in the wrong one. Text that is not translatable because it comes
  from elsewhere — a key code, an origin, a command id — goes through
  `dynamic()`, which exists to be greppable. Never use it to smuggle in copy.
- Never build a sentence by concatenation. Word order differs between locales,
  so each message is one complete templated string with `$PLACEHOLDERS$`.
- `chrome.i18n` has no plural support: counted strings ship as `_one` and
  `_other`, even where a language does not inflect.
- Numbers go through `Intl`, never string interpolation of a raw value.
- **A locale directory name is not a language tag.** Chrome names `_locales`
  directories with an underscore (`zh_TW`); `Intl` wants BCP 47 and throws
  `RangeError: invalid language tag` on the underscore form. Everything reaching
  `Intl` goes through `bcp47()` in `src/shared/i18n.ts` first, and a test asserts
  every shipped locale name survives it.
- Layout must survive a ~1.6x length change between zh-Hant and English. No
  fixed-width text containers, and no truncation without a `title`.
