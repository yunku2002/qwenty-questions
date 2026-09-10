import { ASK_CODES, isAskCode, type AskCode } from "./api";
import { base64ToBytes, base64UrlToBytes, bytesToBase64, bytesToBase64Url } from "../../shared/base64";
import { deflateRaw, inflateRaw } from "./deflate";
import { GCM_TAG_LEN, MAX_UTF8, utf8Bytes } from "../../shared/utf8";
import type { Envelope } from "./crypto/envelope";

export type ShareTurn = {
  question: string;
  code: AskCode;
};

export type SharePayload = Envelope & {
  hint: string | null;
  turns: ShareTurn[];
};

export type ShareParse =
  | { kind: "empty" }
  | { kind: "ok"; payload: SharePayload }
  | { kind: "invalid" };

const KEY_LEN = 33;
const NONCE_LEN = 12;
const MIN_CIPHERTEXT = GCM_TAG_LEN;
const MAX_CIPHERTEXT = MAX_UTF8;
const HEADER = 1 + KEY_LEN + NONCE_LEN;

const decoder = new TextDecoder("utf-8", { fatal: true });

function packTurns(turns: ShareTurn[]): Uint8Array {
  const parts: Uint8Array[] = [];
  let total = 0;
  for (const turn of turns) {
    const q = utf8Bytes(turn.question);
    if (q.length > MAX_UTF8) throw new Error("question too long");
    const code = ASK_CODES.indexOf(turn.code);
    if (code < 0) throw new Error("invalid code");
    const rec = new Uint8Array(1 + q.length + 1);
    rec[0] = q.length;
    rec.set(q, 1);
    rec[1 + q.length] = code;
    parts.push(rec);
    total += rec.length;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function unpackTurns(bytes: Uint8Array): ShareTurn[] | null {
  const turns: ShareTurn[] = [];
  let offset = 0;
  while (offset < bytes.length) {
    const qLen = bytes[offset];
    offset += 1;
    if (qLen < 1 || offset + qLen + 1 > bytes.length) return null;
    let question: string;
    try {
      question = decoder.decode(bytes.subarray(offset, offset + qLen));
    } catch {
      return null;
    }
    offset += qLen;
    const code = ASK_CODES[bytes[offset]];
    offset += 1;
    if (!code) return null;
    turns.push({ question, code });
  }
  return turns;
}

async function packShare(payload: SharePayload): Promise<Uint8Array> {
  const secret = base64ToBytes(payload.secret);
  const key = base64ToBytes(payload.key);
  const nonce = base64ToBytes(payload.nonce);
  const turns = payload.turns ?? [];
  if (
    secret.length < MIN_CIPHERTEXT ||
    secret.length > MAX_CIPHERTEXT ||
    key.length !== KEY_LEN ||
    (key[0] !== 0x02 && key[0] !== 0x03) ||
    nonce.length !== NONCE_LEN
  ) {
    throw new Error("invalid envelope");
  }
  const hintBytes = payload.hint ? utf8Bytes(payload.hint) : new Uint8Array(0);
  if (hintBytes.length > MAX_UTF8) throw new Error("hint too long");
  const progress =
    turns.length > 0 ? await deflateRaw(packTurns(turns)) : new Uint8Array(0);
  if (turns.length > 0 && progress.length === 0) {
    throw new Error("deflate failed");
  }
  const tail = hintBytes.length > 0 || progress.length > 0;
  const out = new Uint8Array(
    HEADER + secret.length + (tail ? 1 + hintBytes.length + progress.length : 0),
  );
  out[0] = secret.length;
  let offset = 1;
  out.set(secret, offset);
  offset += secret.length;
  out.set(key, offset);
  offset += KEY_LEN;
  out.set(nonce, offset);
  offset += NONCE_LEN;
  if (tail) {
    out[offset] = hintBytes.length;
    offset += 1;
    out.set(hintBytes, offset);
    offset += hintBytes.length;
    out.set(progress, offset);
  }
  return out;
}

async function unpackShare(bytes: Uint8Array): Promise<SharePayload | null> {
  if (bytes.length < HEADER) return null;
  const ctLen = bytes[0];
  const min = 1 + ctLen + KEY_LEN + NONCE_LEN;
  if (ctLen < MIN_CIPHERTEXT || bytes.length < min) return null;
  let offset = 1;
  const secret = bytes.subarray(offset, offset + ctLen);
  offset += ctLen;
  const key = bytes.subarray(offset, offset + KEY_LEN);
  offset += KEY_LEN;
  if (key[0] !== 0x02 && key[0] !== 0x03) return null;
  const nonce = bytes.subarray(offset, offset + NONCE_LEN);
  offset += NONCE_LEN;
  let hint: string | null = null;
  let turns: ShareTurn[] = [];
  if (offset < bytes.length) {
    const hintLen = bytes[offset];
    offset += 1;
    if (offset + hintLen > bytes.length) return null;
    if (hintLen > 0) {
      try {
        hint = decoder.decode(bytes.subarray(offset, offset + hintLen));
      } catch {
        return null;
      }
    }
    offset += hintLen;
    if (offset < bytes.length) {
      try {
        const inflated = await inflateRaw(bytes.subarray(offset));
        const parsed = unpackTurns(inflated);
        if (!parsed || parsed.length === 0) return null;
        turns = parsed;
      } catch {
        return null;
      }
    }
  }
  return {
    secret: bytesToBase64(secret),
    key: bytesToBase64(key),
    nonce: bytesToBase64(nonce),
    hint,
    turns,
  };
}

export async function parseShareFragment(hash: string): Promise<ShareParse> {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!raw) return { kind: "empty" };
  try {
    const payload = await unpackShare(base64UrlToBytes(decodeURIComponent(raw)));
    if (!payload) return { kind: "invalid" };
    return { kind: "ok", payload };
  } catch {
    return { kind: "invalid" };
  }
}

/** Full URL, `#fragment`, or bare fragment pasted in-game. */
export async function parseShareInput(input: string): Promise<ShareParse> {
  const trimmed = input.trim();
  if (!trimmed) return { kind: "empty" };
  const hashAt = trimmed.indexOf("#");
  const fragment = hashAt === -1 ? trimmed : trimmed.slice(hashAt);
  const parsed = await parseShareFragment(fragment);
  if (parsed.kind === "empty") return { kind: "invalid" };
  return parsed;
}

export function shareIdentity(payload: SharePayload): string {
  const turns = (payload.turns ?? [])
    .map((turn) => `${turn.code}:${turn.question}`)
    .join("\n");
  return `${payload.secret}:${payload.key}:${payload.nonce}:${payload.hint ?? ""}\n${turns}`;
}

export async function buildShareFragment(payload: SharePayload): Promise<string> {
  return bytesToBase64Url(await packShare(payload));
}

export async function shareUrl(payload: SharePayload): Promise<string> {
  const url = new URL(window.location.href);
  url.searchParams.delete("test");
  url.hash = await buildShareFragment(payload);
  return url.toString();
}

export function turnsFromMessages(
  messages: { role: "user" | "bot"; text: string; code?: string }[],
): ShareTurn[] {
  const turns: ShareTurn[] = [];
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role !== "user") continue;
    const bot = messages[i + 1];
    if (!bot || bot.role !== "bot" || !bot.code || !isAskCode(bot.code)) continue;
    turns.push({ question: msg.text, code: bot.code });
  }
  return turns;
}

export function sessionFromTurns(turns: ShareTurn[]): {
  messages: { role: "user" | "bot"; text: string; code?: AskCode; n?: number }[];
  asked: number;
  over: "GUESS_CORRECT" | "REVEAL" | null;
} {
  const messages: {
    role: "user" | "bot";
    text: string;
    code?: AskCode;
    n?: number;
  }[] = [];
  let asked = 0;
  let over: "GUESS_CORRECT" | "REVEAL" | null = null;
  for (const turn of turns) {
    const counted = turn.code !== "INVALID";
    if (counted) asked += 1;
    messages.push({
      role: "user",
      text: turn.question,
      ...(counted ? { n: asked } : {}),
    });
    messages.push({ role: "bot", text: "", code: turn.code });
    if (turn.code === "GUESS_CORRECT" || turn.code === "REVEAL") over = turn.code;
  }
  return { messages, asked, over };
}
