import { decryptSecret, encryptSecret } from "./crypto";
import { ASK_MODEL, GENERATE_MODEL, runLlm, type LlmFailCause } from "./llm";
import {
  ASK_SYSTEM,
  GENERATE_SYSTEM,
  VALIDATE_SYSTEM,
  askUser,
  generateUser,
  validateUser,
} from "./prompts";
import { GCM_TAG_LEN, MAX_UTF8, utf8Len } from "../../shared/utf8";

export interface Env {
  AI: Ai;
  LOG_LLM: string;
  PRIVATE_JWK?: string;
}

const MAX_KEY = 44;
const MAX_NONCE = 16;
const MAX_SECRET = MAX_UTF8 - GCM_TAG_LEN;
const MAX_CIPHERTEXT = Math.ceil(MAX_UTF8 / 3) * 4;
const MAX_BODY_BYTES = MAX_NONCE + MAX_KEY + MAX_CIPHERTEXT + MAX_UTF8 + 256;
const RATE_WINDOW_MS = 60000;
const RATE_MAX = 30;
const ASK_CODES = new Set([
  "YES",
  "NO",
  "MAYBE",
  "N/A",
  "INVALID",
  "GUESS_CORRECT",
  "GUESS_WRONG",
  "REVEAL",
]);

const hits = new Map<string, number[]>();

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

function fail(cause: LlmFailCause | "decrypt" | "input"): Response {
  return json({ status: "FAILURE", cause });
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });
}

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_MAX) {
    hits.set(ip, recent);
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);
  return false;
}

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > MAX_BODY_BYTES) return null;
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function asString(value: unknown, maxBytes: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || utf8Len(trimmed) > maxBytes) return null;
  return trimmed;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }
    if (request.method !== "POST") {
      return json({ error: "method not allowed" }, 405);
    }

    const ip = request.headers.get("cf-connecting-ip") ?? "local";
    if (rateLimited(ip)) {
      return json({ error: "rate limited" }, 429);
    }

    const url = new URL(request.url);
    const body = await readBody(request);
    if (!body) return json({ error: "bad request" }, 400);

    try {
      if (url.pathname === "/generate") return await handleGenerate(env, body);
      if (url.pathname === "/validate") return await handleValidate(env, body);
      if (url.pathname === "/ask") return await handleAsk(env, body);
      return json({ error: "not found" }, 404);
    } catch {
      return json({ status: "FAILURE" });
    }
  },
};

async function handleGenerate(
  env: Env,
  body: Record<string, unknown>,
): Promise<Response> {
  const language = asString(body.language, MAX_UTF8);
  if (!language) return fail("input");

  const parsed = await runLlm(
    env.AI,
    GENERATE_MODEL,
    GENERATE_SYSTEM,
    generateUser(language),
    200,
    env.LOG_LLM === "true",
  );
  if (!parsed.ok) return fail(parsed.cause);

  const obj = parsed.value as Record<string, unknown>;
  if (obj.status === "INVALID") return json({ status: "INVALID" });
  if (obj.status !== "VALID") return fail("parse");
  const secret = asString(obj.secret, MAX_SECRET);
  const hint = asString(obj.hint, MAX_UTF8);
  if (!secret || !hint) return fail("parse");

  const envelope = await encryptSecret(secret, env.PRIVATE_JWK);
  return json({ status: "VALID", ...envelope, hint });
}

async function handleValidate(
  env: Env,
  body: Record<string, unknown>,
): Promise<Response> {
  const secret = asString(body.secret, MAX_SECRET);
  if (!secret) return fail("input");

  const parsed = await runLlm(
    env.AI,
    ASK_MODEL,
    VALIDATE_SYSTEM,
    validateUser(secret),
    300,
    env.LOG_LLM === "true",
  );
  if (!parsed.ok) return fail(parsed.cause);

  const obj = parsed.value as Record<string, unknown>;
  if (obj.status !== "FIT" && obj.status !== "UNFIT") {
    return fail("parse");
  }
  const interpretation =
    typeof obj.interpretation === "string" ? obj.interpretation : "";
  return json({ status: obj.status, interpretation });
}

async function handleAsk(
  env: Env,
  body: Record<string, unknown>,
): Promise<Response> {
  const ciphertext = asString(body.secret, MAX_CIPHERTEXT);
  const key = asString(body.key, MAX_KEY);
  const nonce = asString(body.nonce, MAX_NONCE);
  const question = asString(body.question, MAX_UTF8);
  if (!ciphertext || !key || !nonce || !question) return fail("input");

  let plaintext: string;
  try {
    plaintext = await decryptSecret(
      { secret: ciphertext, key, nonce },
      env.PRIVATE_JWK,
    );
  } catch {
    return fail("decrypt");
  }

  const parsed = await runLlm(
    env.AI,
    ASK_MODEL,
    ASK_SYSTEM,
    askUser(plaintext, question),
    800,
    env.LOG_LLM === "true",
    "high",
  );
  if (!parsed.ok) return fail(parsed.cause);

  const obj = parsed.value as Record<string, unknown>;
  if (typeof obj.code !== "string" || !ASK_CODES.has(obj.code)) {
    return fail("parse");
  }
  if (typeof obj.message !== "string") return fail("parse");
  if (obj.code === "REVEAL" || obj.code === "GUESS_CORRECT") {
    return json({
      status: "SUCCESS",
      code: obj.code,
      message: obj.message,
      secret: plaintext,
    });
  }
  return json({ status: "SUCCESS", code: obj.code, message: obj.message });
}
