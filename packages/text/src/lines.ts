export function splitExplicitLines(text: string): string[] {
  return text === "" ? [] : text.split("\n");
}

export function firstExplicitLine(text: string): string {
  return text.split("\n", 1)[0] ?? "";
}
