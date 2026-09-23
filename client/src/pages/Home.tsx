import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiConfigured, failureKey, generate, validate } from "../api";
import { copyInput } from "../copy";
import { encryptSecret } from "../crypto/envelope";
import { generateLanguageLabel } from "../i18n";
import { parseShareInput, shareUrl, type SharePayload } from "../share";
import { utf8Field } from "../utf8-input";
import { MAX_FIELD_UTF8 } from "../../../shared/utf8";

type Props = {
  onPlay: (payload: SharePayload) => void;
};

export function Home({ onPlay }: Props) {
  const { t, i18n } = useTranslation();
  const [secret, setSecret] = useState("");
  const [hint, setHint] = useState("");
  const [busy, setBusy] = useState<"validate" | "link" | "random" | null>(null);
  const [validation, setValidation] = useState<{
    status: "FIT" | "UNFIT" | "FAILURE";
    interpretation?: string;
  } | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const linkInput = useRef<HTMLInputElement>(null);
  const [language, setLanguage] = useState(generateLanguageLabel(i18n.language));
  const [shareLink, setShareLink] = useState("");
  const [shareError, setShareError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLanguage(generateLanguageLabel(i18n.language));
  }, [i18n.language]);

  async function onValidate() {
    if (!secret.trim()) return;
    setBusy("validate");
    setError(null);
    setValidation(null);
    try {
      const result = await validate(secret.trim());
      if (result.status === "FAILURE") {
        setValidation({ status: "FAILURE", interpretation: t(failureKey(result.cause)) });
      } else setValidation(result);
    } catch {
      setValidation({ status: "FAILURE", interpretation: t("failureNetwork") });
    } finally {
      setBusy(null);
    }
  }

  async function onCreate() {
    if (!secret.trim()) return;
    setBusy("link");
    setError(null);
    try {
      const envelope = await encryptSecret(secret.trim());
      const payload = {
        ...envelope,
        hint: hint.trim() ? hint.trim() : null,
        turns: [],
      };
      setLink(await shareUrl(payload));
      setCopied(false);
    } catch {
      setError(t("shareFailed"));
    } finally {
      setBusy(null);
    }
  }

  async function onRandom() {
    setBusy("random");
    setError(null);
    try {
      const result = await generate(language.trim() || generateLanguageLabel(i18n.language));
      if (result.status === "INVALID") {
        setError(t("invalidLanguage"));
        return;
      }
      if (result.status === "FAILURE") {
        setError(t(failureKey(result.cause)));
        return;
      }
      onPlay({
        secret: result.secret,
        key: result.key,
        nonce: result.nonce,
        hint: result.hint,
        turns: [],
      });
    } catch {
      setError(t("failureNetwork"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      {!apiConfigured() && <p className="banner">{t("missingApi")}</p>}

      <section className="card">
        <h2>{t("createTitle")}</h2>
        <p className="lead">{t("createLead")}</p>
        <div className="field">
          <label htmlFor="secret">{t("secretLabel")}</label>
          <input
            id="secret"
            {...utf8Field(MAX_FIELD_UTF8, secret, (v) => {
              setSecret(v);
              setLink(null);
              setCopied(false);
            })}
            placeholder={t("secretPlaceholder")}
          />
        </div>
        <div className="field">
          <label htmlFor="hint">{t("hintLabel")}</label>
          <input
            id="hint"
            {...utf8Field(MAX_FIELD_UTF8, hint, (v) => {
              setHint(v);
              setLink(null);
              setCopied(false);
            })}
          />
        </div>
        <div className="row">
          <button
            className="ghost"
            type="button"
            disabled={!secret.trim() || busy !== null}
            onClick={() => void onValidate()}
          >
            {busy === "validate" ? t("validating") : t("validate")}
          </button>
          <button
            className="primary"
            type="button"
            disabled={!secret.trim() || busy !== null}
            onClick={() => void onCreate()}
          >
            {busy === "link" ? t("creating") : t("createLink")}
          </button>
        </div>
        {validation && (
          <p className={`result ${validation.status.toLowerCase()}`}>
            {validation.status === "FAILURE"
              ? validation.interpretation ?? t("failure")
              : `${t(validation.status === "FIT" ? "fit" : "unfit")}${
                  validation.interpretation ? ` — ${validation.interpretation}` : ""
                }`}
          </p>
        )}
        {link && (
          <>
            <div className="field">
              <label htmlFor="created-link">{t("shareLinkLabel")}</label>
              <input
                id="created-link"
                ref={linkInput}
                readOnly
                value={link}
                onFocus={(e) => e.currentTarget.select()}
              />
            </div>
            <div className="row">
              <button
                className="primary"
                type="button"
                onClick={() => {
                  if (linkInput.current && copyInput(linkInput.current)) setCopied(true);
                }}
              >
                {copied ? t("copied") : t("copyLink")}
              </button>
            </div>
          </>
        )}
      </section>

      <section className="card">
        <h2>{t("randomTitle")}</h2>
        <p className="lead">{t("randomLead")}</p>
        <div className="field">
          <label htmlFor="gen-lang">{t("randomLanguageLabel")}</label>
          <input
            id="gen-lang"
            {...utf8Field(MAX_FIELD_UTF8, language, setLanguage)}
          />
        </div>
        <button
          className="primary"
          type="button"
          disabled={busy !== null}
          onClick={() => void onRandom()}
        >
          {busy === "random" ? t("generating") : t("startRandom")}
        </button>
        {error && <p className="result">{error}</p>}
      </section>

      <section className="card">
        <h2>{t("openShareTitle")}</h2>
        <p className="lead">{t("openShareLead")}</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void (async () => {
              const parsed = await parseShareInput(shareLink);
              if (parsed.kind !== "ok") {
                setShareError(t("invalidSharePaste"));
                return;
              }
              setShareError(null);
              onPlay(parsed.payload);
            })();
          }}
        >
          <div className="field">
            <label htmlFor="share-link">{t("shareLinkLabel")}</label>
            <input
              id="share-link"
              value={shareLink}
              onChange={(e) => {
                setShareLink(e.target.value);
                setShareError(null);
              }}
            />
          </div>
          <button
            className="primary"
            type="submit"
            disabled={!shareLink.trim() || busy !== null}
          >
            {t("openShare")}
          </button>
          {shareError && <p className="result">{shareError}</p>}
        </form>
      </section>
    </>
  );
}
