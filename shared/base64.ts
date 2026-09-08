export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function base64ToBytes(value: string): Uint8Array {
  const bin = atob(value);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function utf8ToBase64(text: string): string {
  return bytesToBase64(new TextEncoder().encode(text));
}

export function base64ToUtf8(value: string): string {
  return new TextDecoder().decode(base64ToBytes(value));
}
