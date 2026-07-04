import { measureSegmentsWidth, segmentText } from "./segment.js";

export function measureTextWidth(text: string): number {
  return measureSegmentsWidth(segmentText(text));
}
