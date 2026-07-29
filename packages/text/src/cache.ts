export interface TextCacheStats {
  entries: number;
  codeUnits: number;
  hits: number;
  misses: number;
  evictions: number;
}

export const TEXT_CACHE_MAX_ENTRIES = 2_048;
export const TEXT_CACHE_MAX_CODE_UNITS = 1_048_576;

interface CacheEntry<T> {
  value: T;
  codeUnits: number;
}

export class TextLruCache<T> {
  private readonly entries = new Map<string, CacheEntry<T>>();
  private codeUnits = 0;
  private hits = 0;
  private misses = 0;
  private evictions = 0;

  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) {
      this.misses += 1;
      return undefined;
    }
    this.hits += 1;
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T, codeUnits: number): void {
    const weight = Math.max(0, Math.floor(codeUnits));
    const existing = this.entries.get(key);
    if (existing) {
      this.codeUnits -= existing.codeUnits;
      this.entries.delete(key);
    }
    if (weight > TEXT_CACHE_MAX_CODE_UNITS) {
      return;
    }
    this.entries.set(key, { value, codeUnits: weight });
    this.codeUnits += weight;
    while (
      this.entries.size > TEXT_CACHE_MAX_ENTRIES ||
      this.codeUnits > TEXT_CACHE_MAX_CODE_UNITS
    ) {
      const oldest = this.entries.entries().next().value as
        | [string, CacheEntry<T>]
        | undefined;
      if (!oldest) break;
      this.entries.delete(oldest[0]);
      this.codeUnits -= oldest[1].codeUnits;
      this.evictions += 1;
    }
  }

  clear(): void {
    this.entries.clear();
    this.codeUnits = 0;
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
  }

  stats(): TextCacheStats {
    return {
      entries: this.entries.size,
      codeUnits: this.codeUnits,
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions
    };
  }
}
