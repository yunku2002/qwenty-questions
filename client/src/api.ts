import type { Envelope } from "./crypto/envelope";

const API_URL = (import.meta.env?.VITE_API_URL as string | undefined)?.replace(
  /\/$/,
  "",
);

const TEST_DELAY_MS = 200;

export const ASK_CODES = [
  "YES",
  "NO",
  "MAYBE",
  "N/A",
  "INVALID",
  "GUESS_CORRECT",
  "GUESS_WRONG",
  "REVEAL",
] as const;

export type FailCause = "llm" | "parse" | "decrypt" | "input" | "network";

export type GenerateResult =
  | { status: "VALID"; secret: string; key: string; nonce: string; hint: string }
  | { status: "INVALID" }
  | { status: "FAILURE"; cause?: FailCause };

export type ValidateResult =
  | { status: "FIT" | "UNFIT"; interpretation: string }
  | { status: "FAILURE"; cause?: FailCause };

export type AskCode = (typeof ASK_CODES)[number];

export type DisplayCode = AskCode | "FAILURE";

export type AskResult =
  | { status: "SUCCESS"; code: AskCode; message: string; secret?: string }
  | { status: "FAILURE"; cause?: FailCause };

export function isAskCode(value: string): value is AskCode {
  return (ASK_CODES as readonly string[]).includes(value);
}

export function failureKey(
  cause?: FailCause,
): "failure" | "failureParse" | "failureDecrypt" | "failureInput" | "failureNetwork" {
  if (cause === "parse") return "failureParse";
  if (cause === "decrypt") return "failureDecrypt";
  if (cause === "input") return "failureInput";
  if (cause === "network") return "failureNetwork";
  return "failure";
}

function isTestMode(): boolean {
  const params = new URLSearchParams(window.location.search);
  if (!params.has("test")) return false;
  const value = params.get("test");
  return value === "" || value === "1" || value === "true" || value === "yes";
}

export function apiConfigured(): boolean {
  return isTestMode() || Boolean(API_URL);
}

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

function wait(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, TEST_DELAY_MS));
}

function mockGenerate(): GenerateResult {
  const status = pick(["VALID", "VALID", "VALID", "INVALID", "FAILURE"] as const);
  if (status === "FAILURE") return { status, cause: "llm" };
  if (status !== "VALID") return { status };
  return {
    status: "VALID",
    secret: "dGVzdA==",
    key: "dGVzdA==",
    nonce: "dGVzdG5vbmNlMTI",
    hint: "test hint",
  };
}

function mockValidate(): ValidateResult {
  const status = pick(["FIT", "UNFIT", "FAILURE"] as const);
  if (status === "FAILURE") return { status, cause: "llm" };
  return { status, interpretation: `Test interpretation (${status}).` };
}

function mockAsk(): AskResult {
  if (Math.random() < 1 / (ASK_CODES.length + 1)) {
    return { status: "FAILURE", cause: "llm" };
  }
  const code = pick(ASK_CODES);
  return {
    status: "SUCCESS",
    code,
    message: `Test reply (${code}).`,
    ...(code === "REVEAL" || code === "GUESS_CORRECT"
      ? { secret: "test secret" }
      : {}),
  };
}

async function post<T extends { status: string }>(
  path: string,
  body: unknown,
): Promise<T> {
  if (!API_URL) {
    return { status: "FAILURE", cause: "network" } as unknown as T;
  }
  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data: unknown = await response.json();
  if (!data || typeof data !== "object" || !("status" in data)) {
    return { status: "FAILURE", cause: "network" } as unknown as T;
  }
  return data as T;
}

export async function generate(language: string): Promise<GenerateResult> {
  if (isTestMode()) {
    await wait();
    return mockGenerate();
  }
  return post<GenerateResult>("/generate", { language });
}

export async function validate(secret: string): Promise<ValidateResult> {
  if (isTestMode()) {
    await wait();
    return mockValidate();
  }
  return post<ValidateResult>("/validate", { secret });
}

export async function ask(envelope: Envelope, question: string): Promise<AskResult> {
  if (isTestMode()) {
    await wait();
    return mockAsk();
  }
  return post<AskResult>("/ask", { ...envelope, question });
}
