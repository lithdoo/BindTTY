# @bindtty/widgets 控件规范

包级设计见 [WIDGETS.md](../packages/WIDGETS.md)。引擎层 scroll/clip 见 [SCROLL_VIEWPORT.md](../specs/SCROLL_VIEWPORT.md)。

| 控件 | 文档 | 代码 |
| --- | --- | --- |
| Button | [BUTTON.md](./BUTTON.md) | `packages/widgets/src/form/button.ts` |
| Checkbox | [CHECKBOX.md](./CHECKBOX.md) | `packages/widgets/src/form/checkbox.ts` |
| TextInput | [TEXT_INPUT.md](./TEXT_INPUT.md) | `packages/widgets/src/form/text-input.ts` |
| Select | [SELECT.md](./SELECT.md) | `packages/widgets/src/form/select.ts` |
| VScrollView / HScrollView / ScrollView / List | [SCROLL.md](./SCROLL.md) | `packages/widgets/src/scroll/` |
| ProgressBar | [PROGRESS_BAR.md](./PROGRESS_BAR.md) | `packages/widgets/src/display/progress-bar.ts |

导入：

```tsx
import { createApp } from "bindtty";
import { Button, VScrollView } from "@bindtty/widgets";
```
