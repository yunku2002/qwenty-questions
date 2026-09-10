import type { Ai } from "@cloudflare/workers-types";

const MODEL = "@cf/openai/gpt-oss-120b";
const TIMEOUT_MS = 15000;

type AiResult = {
  response?: unknown;
  choices?: Array<{ message?: Record<string, unknown> }>;
};

function thinkingOptions(
  effort: "low" | "medium" | "high",
): Record<string, unknown> {
  if (MODEL.includes("gpt-oss")) return { reasoning_effort: effort };
  if (MODEL.includes("qwen")) {
    return { chat_template_kwargs: { enable_thinking: false } };
  }
  return {};
}

export async function runLlm(
  ai: Ai,
  system: string,
  user: string,
  maxTokens: number,
  log: boolean,
  effort: "low" | "medium" | "high" = "low",
): Promise<string | null> {
  if (log) console.log("llm prompt", user);
  try {
    const result = await Promise.race([
      ai.run(MODEL, {
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        max_tokens: maxTokens,
        ...thinkingOptions(effort),
      } as Parameters<Ai["run"]>[1]) as Promise<AiResult>,
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS);
      }),
    ]);
    if (log) console.log("llm output", JSON.stringify(result, null, 2));
    const text = llmText(result);
    if (text == null) {
      console.warn("llm: unexpected result shape");
      return null;
    }
    return text;
  } catch (err) {
    console.warn("llm: run failed", err);
    return null;
  }
}

function llmText(result: AiResult): string | null {
  return asText(result.response) ?? messageText(result.choices?.[0]?.message);
}

function messageText(message: Record<string, unknown> | undefined): string | null {
  if (!message) return null;
  const fromContent = asText(message.content);
  if (fromContent != null) return fromContent;
  for (const [key, value] of Object.entries(message)) {
    if (key === "role" || key === "name" || key === "refusal") continue;
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

function asText(value: unknown): string | null {
  if (typeof value === "string") return value.trim() ? value : null;
  if (value && typeof value === "object") return JSON.stringify(value);
  return null;
}

export function extractJson(text: string): unknown {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const candidates = [trimmed];
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    candidates.push(trimmed.slice(start, end + 1));
  }
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      /* try next */
    }
  }
  throw new Error("no json");
}
