import type { Ai } from "@cloudflare/workers-types";

export const ASK_MODEL = "@cf/openai/gpt-oss-120b";
export const GENERATE_MODEL = "@cf/qwen/qwen3.8-27b";
const TIMEOUT_MS = 15000;

export type LlmFailCause = "timeout" | "tokens" | "parse" | "llm";

type AiResult = {
  response?: unknown;
  choices?: Array<{ message?: Record<string, unknown> }>;
  usage?: { completion_tokens?: unknown };
};

function thinkingOptions(
  model: string,
  effort: "low" | "medium" | "high",
): Record<string, unknown> {
  if (model.includes("gpt-oss")) return { reasoning_effort: effort };
  if (model.includes("qwen")) {
    return { chat_template_kwargs: { enable_thinking: false } };
  }
  return {};
}

export async function runLlm(
  ai: Ai,
  model: string,
  system: string,
  user: string,
  maxTokens: number,
  log: boolean,
  effort: "low" | "medium" | "high" = "low",
): Promise<{ ok: true; value: unknown } | { ok: false; cause: LlmFailCause }> {
  if (log) console.log("llm prompt", user);
  let timedOut = false;
  try {
    const result = await Promise.race([
      ai.run(model, {
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        max_tokens: maxTokens,
        ...thinkingOptions(model, effort),
      } as Parameters<Ai["run"]>[1]) as Promise<AiResult>,
      new Promise<never>((_, reject) => {
        setTimeout(() => {
          timedOut = true;
          reject(new Error("timeout"));
        }, TIMEOUT_MS);
      }),
    ]);
    if (log) console.log("llm output", JSON.stringify(result, null, 2));
    if (wasTruncated(result, maxTokens)) {
      console.warn("llm: token limit");
      return { ok: false, cause: "tokens" };
    }
    const text = llmText(result);
    if (text == null) {
      console.warn("llm: unexpected result shape");
      return { ok: false, cause: "llm" };
    }
    try {
      return { ok: true, value: extractJson(text) };
    } catch {
      return { ok: false, cause: "parse" };
    }
  } catch (err) {
    console.warn("llm: run failed", err);
    return { ok: false, cause: timedOut ? "timeout" : "llm" };
  }
}

function wasTruncated(result: AiResult, maxTokens: number): boolean {
  const used = result.usage?.completion_tokens;
  return typeof used === "number" && used >= maxTokens;
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

function extractJson(text: string): unknown {
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
