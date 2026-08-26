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

  | Concept                              | Word       |
  | ------------------------------------ | ---------- |
  | The drawn path                       | stroke     |
  | Stroke plus its command              | gesture    |
  | What is held while drawing           | trigger    |
  | Alt / Shift / Control / Meta         | modifier   |
  | The panel of tabs                    | tab grid   |
  | The label naming the matched command | readout    |
  | The gesture list under the grid      | cheatsheet |
  | A command with no stroke             | unassigned |

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
  | unassigned | 未指派   |
  | window     | 視窗     |
  | pinned     | 釘選     |

## Mechanics

- Every user-visible string goes through `t()`. No exceptions: placeholders,
  `aria-label`, `title`, empty states.
- Never build a sentence by concatenation. Word order differs between locales,
  so each message is one complete templated string with `$PLACEHOLDERS$`.
- `chrome.i18n` has no plural support: counted strings ship as `_one` and
  `_other`, even where a language does not inflect.
- Numbers go through `Intl`, never string interpolation of a raw value.
- Layout must survive a ~1.6x length change between zh-Hant and English. No
  fixed-width text containers, and no truncation without a `title`.
