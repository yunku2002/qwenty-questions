import { base64ToUtf8, utf8ToBase64 } from "../../shared/base64";
import { isSharePayload, type SharePayload } from "./crypto/envelope";

export type ShareParse =
  | { kind: "empty" }
  | { kind: "ok"; payload: SharePayload }
  | { kind: "invalid" };

export function parseShareFragment(hash: string): ShareParse {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!raw) return { kind: "empty" };
  try {
    const parsed: unknown = JSON.parse(base64ToUtf8(decodeURIComponent(raw)));
    if (!isSharePayload(parsed)) return { kind: "invalid" };
    return { kind: "ok", payload: parsed };
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

export function buildShareFragment(payload: SharePayload): string {
  return utf8ToBase64(JSON.stringify(payload));
}

export function shareUrl(payload: SharePayload): string {
  const url = new URL(window.location.href);
  url.searchParams.delete("test");
  url.hash = buildShareFragment(payload);
  return url.toString();
}
