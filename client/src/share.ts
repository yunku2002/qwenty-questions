import { base64ToBytes, base64UrlToBytes, bytesToBase64, bytesToBase64Url } from "../../shared/base64";
import type { SharePayload } from "./crypto/envelope";

export type ShareParse =
  | { kind: "empty" }
  | { kind: "ok"; payload: SharePayload }
  | { kind: "invalid" };

const KEY_LEN = 33;
const NONCE_LEN = 12;
const MIN_CIPHERTEXT = 16;
const MAX_HINT = 50;

function packShare(payload: SharePayload): Uint8Array {
  const secret = base64ToBytes(payload.secret);
  const key = base64ToBytes(payload.key);
  const nonce = base64ToBytes(payload.nonce);
  if (
    secret.length > 0xffff ||
    key.length !== KEY_LEN ||
    (key[0] !== 0x02 && key[0] !== 0x03) ||
    nonce.length !== NONCE_LEN
  ) {
    throw new Error("invalid envelope");
  }
  const hintBytes = payload.hint
    ? new TextEncoder().encode(payload.hint)
    : new Uint8Array(0);
  const out = new Uint8Array(2 + secret.length + KEY_LEN + NONCE_LEN + hintBytes.length);
  out[0] = (secret.length >> 8) & 0xff;
  out[1] = secret.length & 0xff;
  let offset = 2;
  out.set(secret, offset);
  offset += secret.length;
  out.set(key, offset);
  offset += KEY_LEN;
  out.set(nonce, offset);
  offset += NONCE_LEN;
  out.set(hintBytes, offset);
  return out;
}

function unpackShare(bytes: Uint8Array): SharePayload | null {
  if (bytes.length < 2 + KEY_LEN + NONCE_LEN) return null;
  const ctLen = (bytes[0] << 8) | bytes[1];
  const min = 2 + ctLen + KEY_LEN + NONCE_LEN;
  if (ctLen < MIN_CIPHERTEXT || bytes.length < min) return null;
  let offset = 2;
  const secret = bytes.subarray(offset, offset + ctLen);
  offset += ctLen;
  const key = bytes.subarray(offset, offset + KEY_LEN);
  offset += KEY_LEN;
  if (key[0] !== 0x02 && key[0] !== 0x03) return null;
  const nonce = bytes.subarray(offset, offset + NONCE_LEN);
  offset += NONCE_LEN;
  const hintBytes = bytes.subarray(offset);
  let hint: string | null = null;
  if (hintBytes.length > 0) {
    try {
      hint = new TextDecoder("utf-8", { fatal: true }).decode(hintBytes);
    } catch {
      return null;
    }
    if (hint.length > MAX_HINT) return null;
  }
  return {
    secret: bytesToBase64(secret),
    key: bytesToBase64(key),
    nonce: bytesToBase64(nonce),
    hint,
  };
}

export function parseShareFragment(hash: string): ShareParse {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!raw) return { kind: "empty" };
  try {
    const payload = unpackShare(base64UrlToBytes(decodeURIComponent(raw)));
    if (!payload) return { kind: "invalid" };
    return { kind: "ok", payload };
  } catch {
    return { kind: "invalid" };
  }
}

/** Full URL, `#fragment`, or bare fragment pasted in-game. */
export function parseShareInput(input: string): ShareParse {
  const trimmed = input.trim();
  if (!trimmed) return { kind: "empty" };
  const hashAt = trimmed.indexOf("#");
  const fragment = hashAt === -1 ? trimmed : trimmed.slice(hashAt);
  const parsed = parseShareFragment(fragment);
  if (parsed.kind === "empty") return { kind: "invalid" };
  return parsed;
}

export function shareIdentity(payload: SharePayload): string {
  return `${payload.secret}:${payload.key}:${payload.nonce}:${payload.hint ?? ""}`;
}

export function buildShareFragment(payload: SharePayload): string {
  return bytesToBase64Url(packShare(payload));
}

export function shareUrl(payload: SharePayload): string {
  const url = new URL(window.location.href);
  url.searchParams.delete("test");
  url.hash = buildShareFragment(payload);
  return url.toString();
}
