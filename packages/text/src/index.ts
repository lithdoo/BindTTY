export {
  layoutText,
  normalizeWrapMode,
  readTextWrapMode
} from "./layout.js";
export { measureText } from "./measure.js";
import { layoutCache } from "./layout.js";
import { measureCache } from "./measure.js";
export {
  TEXT_CACHE_MAX_CODE_UNITS,
  TEXT_CACHE_MAX_ENTRIES
} from "./cache.js";
export type { TextCacheStats } from "./cache.js";

export function clearTextCaches(): void {
  layoutCache.clear();
  measureCache.clear();
}

export function getTextCacheStats(): {
  layout: import("./cache.js").TextCacheStats;
  measure: import("./cache.js").TextCacheStats;
} {
  return {
    layout: layoutCache.stats(),
    measure: measureCache.stats()
  };
}
export {
  truncateEnd,
  truncateMiddle,
  truncateStart
} from "./truncate.js";
export { segmentText } from "./segment.js";
export { sliceTextByWidth } from "./slice.js";
export { hardWrapLine, wordWrapLine } from "./wrap.js";
export { measureTextWidth } from "./width.js";
export type {
  PublicTextWrapMode,
  TextLayout,
  TextLayoutOptions,
  TextMeasure,
  TextSegment,
  TextWrapMode
} from "./types.js";
export { TEXT_WRAP_MODES } from "./types.js";
