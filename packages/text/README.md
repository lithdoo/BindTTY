# @bindtty/text

Plain terminal text measurement and wrapping utilities for BindTTY.

MVP scope:

- Plain text only.
- Display-width-aware measurement via `string-width`.
- Grapheme segmentation via `Intl.Segmenter`, with code point fallback.
- CJK, common emoji, and combining mark measurement.
- Display-column wrap, hard wrap, truncate, and slice helpers.
- Wrap and hard-wrap preserve whole graphemes; if one grapheme is wider than the target width, the produced line may be wider than the target.
- Truncate helpers keep output display width within the target width.
- No embedded ANSI escape support.
- Complex ZWJ emoji sequence behavior follows the package display-width oracle and is not font/terminal perfect.
