# @bindtty/text

Plain terminal text measurement and wrapping utilities for BindTTY.

MVP scope:

- Plain text only.
- Display-width-aware measurement via `string-width`.
- Grapheme segmentation via `Intl.Segmenter`, with code point fallback.
- CJK, common emoji, and combining mark measurement.
- Display-column wrap, hard wrap, truncate, and slice helpers.
- No embedded ANSI escape support.
- Complex ZWJ emoji sequence behavior follows the package display-width oracle and is not font/terminal perfect.
