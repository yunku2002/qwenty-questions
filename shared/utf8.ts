const encoder = new TextEncoder();

export const MAX_UTF8 = 255;
export const MAX_FIELD_UTF8 = 85;
export const GCM_TAG_LEN = 16;

export function utf8Bytes(value: string): Uint8Array {
  return encoder.encode(value);
}

export function utf8Len(value: string): number {
  return utf8Bytes(value).length;
}

export function clampUtf8(value: string, maxBytes: number): string {
  if (utf8Len(value) <= maxBytes) return value;
  let n = 0;
  let out = "";
  for (const ch of value) {
    const add = utf8Len(ch);
    if (n + add > maxBytes) break;
    n += add;
    out += ch;
  }
  return out;
}
