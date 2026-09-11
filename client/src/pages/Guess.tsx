import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ask, failureKey, type DisplayCode } from "../api";
import { sessionFromTurns, shareIdentity, shareUrl, turnsFromMessages, type SharePayload } from "../share";
import { utf8Field } from "../utf8-input";
import { MAX_UTF8 } from "../../../shared/utf8";

type Message = {
  role: "user" | "bot";
  text: string;
  code?: DisplayCode;
  n?: number;
};

type GuessSession = {
  messages: Message[];
  draft: string;
  asked: number;
  showHint: boolean;
  over: "GUESS_CORRECT" | "REVEAL" | null;
  revealed: string | null;
  shareLink: string | null;
  copied: boolean;
};

const sessions = new Map<string, GuessSession>();

type Props = {
  payload: SharePayload;
};

function codeClass(code: DisplayCode): string {
  return code === "N/A" ? "N-A" : code;
}

function codeKey(code: DisplayCode): string {
  return code === "N/A" ? "codeNA" : `code${code}`;
}

export function Guess({ payload }: Props) {
  const { t } = useTranslation();
  const id = shareIdentity(payload);
  const saved = sessions.get(id);
  const fromTurns = sessionFromTurns(payload.turns ?? []);
  const [messages, setMessages] = useState<Message[]>(
    () => saved?.messages ?? fromTurns.messages,
  );
  const [draft, setDraft] = useState(() => saved?.draft ?? "");
  const [busy, setBusy] = useState(false);
  const [asked, setAsked] = useState(() => saved?.asked ?? fromTurns.asked);
  const [showHint, setShowHint] = useState(() => saved?.showHint ?? false);
  const [over, setOver] = useState<"GUESS_CORRECT" | "REVEAL" | null>(
    () => saved?.over ?? fromTurns.over,
  );
  const [revealed, setRevealed] = useState<string | null>(() => saved?.revealed ?? null);
  const [shareLink, setShareLink] = useState<string | null>(() => saved?.shareLink ?? null);
  const [copied, setCopied] = useState(() => saved?.copied ?? false);
  const [shareError, setShareError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const snapshotRef = useRef<GuessSession>({
    messages,
    draft,
    asked,
    showHint,
    over,
    revealed,
    shareLink,
    copied,
  });
  snapshotRef.current = {
    messages,
    draft,
    asked,
    showHint,
    over,
    revealed,
    shareLink,
    copied,
  };

  useEffect(() => {
    return () => {
      sessions.set(id, snapshotRef.current);
    };
  }, [id]);

  useEffect(() => {
    const el = chatRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const envelope = {
    secret: payload.secret,
    key: payload.key,
    nonce: payload.nonce,
  };

  async function submit(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    setBusy(true);
    setDraft("");
    setMessages((m) => [...m, { role: "user", text: question }]);
    try {
      const result = await ask(envelope, question);
      if (result.status === "FAILURE") {
        setMessages((m) => [
          ...m,
          { role: "bot", text: t(failureKey(result.cause)), code: "FAILURE" },
        ]);
        return;
      }
      if (result.code === "INVALID") {
        setMessages((m) => [
          ...m,
          { role: "bot", text: result.message, code: result.code },
        ]);
        return;
      }
      const n = asked + 1;
      setAsked(n);
      if (result.code === "GUESS_CORRECT" || result.code === "REVEAL") {
        setOver(result.code);
        if (result.secret) setRevealed(result.secret);
      }
      setMessages((m) => {
        const next = [...m];
        for (let i = next.length - 1; i >= 0; i--) {
          if (next[i].role === "user" && next[i].n == null) {
            next[i] = { ...next[i], n };
            break;
          }
        }
        next.push({ role: "bot", text: result.message, code: result.code });
        return next;
      });
    } catch {
      setMessages((m) => [
        ...m,
        { role: "bot", text: t("failureNetwork"), code: "FAILURE" },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2>{t("guessTitle")}</h2>
      <div className="meta">
        <span>
          {asked >= 20
            ? t("questionOver", { current: asked })
            : t("questionCount", { current: asked })}
        </span>
        <span>{t("nextQuestion", { next: asked + 1 })}</span>
        {payload.hint ? (
          <button
            className="linkish"
            type="button"
            onClick={() => setShowHint((v) => !v)}
          >
            {showHint ? t("hideHint") : t("showHint")}
          </button>
        ) : (
          <span>{t("noHint")}</span>
        )}
      </div>

      {payload.hint && showHint ? (
        <p className="hint">{t("hintShown", { hint: payload.hint })}</p>
      ) : null}

      <div className="chat" ref={chatRef}>
        {messages.map((msg, i) => (
          <article key={i} className={`bubble ${msg.role}`}>
            <header>
              <span>
                {msg.role === "user" ? t("question") : t("response")}
                {msg.n != null ? ` ${msg.n}` : ""}
              </span>
              {msg.code && msg.text ? (
                <span className={`code ${codeClass(msg.code)}`}>
                  {t(codeKey(msg.code))}
                </span>
              ) : null}
            </header>
            <div className={msg.code && !msg.text ? `code ${codeClass(msg.code)}` : undefined}>
              {msg.text || (msg.code ? t(codeKey(msg.code)) : "")}
            </div>
          </article>
        ))}
      </div>

      {over && (
        <p className="banner">
          {over === "GUESS_CORRECT" ? `${t("gameOverCorrect")} ` : ""}
          {revealed
            ? t("secretShown", { secret: revealed })
            : over === "REVEAL"
              ? t("gameOverReveal")
              : ""}{" "}
          {t("keepAsking")}
        </p>
      )}

      {asked >= 20 && !over && (
        <p className="banner">{t("continueAfterTwenty")}</p>
      )}

      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(draft);
        }}
      >
        <input
          ref={inputRef}
          {...utf8Field(MAX_UTF8, draft, setDraft)}
          placeholder={t("composerPlaceholder")}
          disabled={busy}
        />
        <button className="primary" type="submit" disabled={busy || !draft.trim()}>
          {busy ? t("asking") : t("ask")}
        </button>
      </form>

      <div className="row">
        <button
          className="ghost"
          type="button"
          disabled={busy}
          onClick={() => {
            setDraft(t("giveUpPrompt"));
            inputRef.current?.focus();
          }}
        >
          {t("giveUp")}
        </button>
        <button
          className="ghost"
          type="button"
          onClick={() => {
            void (async () => {
              try {
                setShareLink(
                  await shareUrl({
                    ...payload,
                    turns: turnsFromMessages(messages),
                  }),
                );
                setShareError(null);
                setCopied(false);
              } catch {
                setShareLink(null);
                setShareError(t("failure"));
              }
            })();
          }}
        >
          {t("shareProgress")}
        </button>
      </div>
      {shareError && <p className="result">{shareError}</p>}
      {shareLink && (
        <>
          <div className="field">
            <label htmlFor="guess-share-link">{t("shareLinkLabel")}</label>
            <input
              id="guess-share-link"
              readOnly
              value={shareLink}
              onFocus={(e) => e.currentTarget.select()}
            />
          </div>
          <div className="row">
            <button
              className="primary"
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(shareLink);
                setCopied(true);
              }}
            >
              {copied ? t("copied") : t("copyLink")}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
